import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { OWNER_UID, BUCKET, ID, canPurge, cleanupHealth, objectPath, trashTime, wrapperReferences } from "./cleanup-core.mjs";

initializeApp({ projectId: "taylor-made-creations", storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const healthRef = db.doc("ownerFileMaintenance/current");
const folderRef = db.doc("ownerFileFolders/current");
const options = { region: "us-central1", maxInstances: 1, timeoutSeconds: 300, memory: "256MiB" };
function assertProject() {
  if (process.env.GCLOUD_PROJECT !== "taylor-made-creations") throw new Error("Unexpected project. Cleanup is disabled.");
}
async function reserve(id, revision, automatic) {
  return db.runTransaction(async transaction => {
    const target = db.doc(`ownerFiles/${id}`);
    const [snapshot, folders, index, publication] = await Promise.all([transaction.get(target), transaction.get(folderRef), transaction.get(db.doc("site/publishedAssets")), transaction.get(db.doc("site/published"))]);
    if (!snapshot.exists) return { absent: true };
    if (publication.exists && (!index.exists || index.data().revision !== publication.data().revision || !Array.isArray(index.data().ids))) throw new Error("Publication index is unavailable. Cleanup was not started.");
    const [workspace, draftIndex] = await Promise.all([transaction.get(db.doc("ownerWorkspace/current")), transaction.get(db.doc("ownerDraftIndex/current"))]);
    if (workspace.exists && wrapperReferences(workspace.data(), id)) return null;
    if (draftIndex.exists) {
      const registry = draftIndex.data();
      if (registry.schemaVersion !== 1 || !Number.isSafeInteger(registry.revision) || registry.revision < 1 || !registry.drafts || typeof registry.drafts !== "object" || Array.isArray(registry.drafts) || Object.keys(registry.drafts).length > 10) throw new Error("Saved draft registry is invalid. Cleanup is blocked.");
      for (const [draftId, revision] of Object.entries(registry.drafts)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(draftId)) throw new Error("Invalid saved draft identity.");
        const draft = await transaction.get(db.doc(`ownerDrafts/${draftId}`));
        if (!draft.exists || draft.data().revision !== revision) throw new Error("A saved draft is missing. Cleanup is blocked.");
        if (wrapperReferences(draft.data(), id)) return null;
      }
    }
    const file = { ...snapshot.data(), id };
    if (!canPurge({ file, folders: folders.data()?.folders ?? {}, publishedIds: index.data()?.ids ?? [], now: Date.now(), automatic, revision })) return null;
    objectPath(id, file.kind);
    if (file.status !== "deleting") {
      // Publication transactions read this same file document. One must retry if
      // the other wins, so a current published asset cannot be removed mid-publish.
      transaction.update(target, { status: "deleting", revision: file.revision + 1, updatedAt: new Date().toISOString() });
    }
    return file;
  });
}
async function purge(id, revision, automatic = false) {
  const record = await reserve(id, revision, automatic);
  if (!record) return "blocked";
  if (record.absent) return "deleted";
  const object = bucket.file(objectPath(id, record.kind));
  try {
    const [metadata] = await object.getMetadata();
    if (metadata.metadata?.fileId !== id || Number(metadata.size) !== record.bytes || metadata.contentType !== record.contentType) throw new Error("Stored object does not match the reserved record.");
    // A retry cannot delete a different generation if bytes were replaced outside
    // the app. Retention/soft-delete policies on the bucket remain authoritative.
    await object.delete({ ifGenerationMatch: metadata.generation, ignoreNotFound: true });
  } catch (error) { if (Number(error.code) !== 404) throw error; }
  await db.runTransaction(async transaction => {
    const target = db.doc(`ownerFiles/${id}`), current = await transaction.get(target);
    if (current.exists && current.data().status === "deleting") transaction.delete(target);
  });
  return "deleted";
}
async function emptyFolders(ids, revision, automatic = false) {
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => !ID.test(id))) throw new Error("Choose valid folders.");
  await db.runTransaction(async transaction => {
    const [registry, allFiles] = await Promise.all([transaction.get(folderRef), transaction.get(db.collection("ownerFiles"))]);
    if (!registry.exists || registry.data().revision !== revision) throw new Error("Folders changed. Refresh before deleting them.");
    const folders = { ...registry.data().folders }; const selected = new Set(ids);
    // Only genuinely empty leaves are removed; iterate to remove empty parents.
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of selected) {
        const folder = folders[id];
        if (id === "00000000-0000-4000-8000-000000000001" || !folder || trashTime({ parentId: id, trashedAt: null, createdAt: "1970-01-01T00:00:00.000Z" }, folders) === null || Object.values(folders).some(child => child.parentId === id) || allFiles.docs.some(file => file.data().parentId === id)) continue;
        const trashedAt = trashTime({ parentId: id, trashedAt: null, createdAt: "1970-01-01T00:00:00.000Z" }, folders);
        if (automatic && Date.now() - trashedAt < 30 * 24 * 60 * 60 * 1000) continue;
        delete folders[id]; selected.delete(id); progress = true;
      }
    }
    if (Object.keys(folders).length !== Object.keys(registry.data().folders).length) transaction.update(folderRef, { folders, revision: revision + 1 });
  });
}
export const tmcFileMaintenance = onRequest({ ...options, invoker: "public", cors: false }, async (request, response) => {
  response.set({ "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" });
  try {
    assertProject();
    const header = request.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(header) || header.length > 16_384) return response.status(401).json({ ok: false, message: "Sign in to Taylor’s Space." });
    const token = await getAuth().verifyIdToken(header.slice(7), true);
    if (token.uid !== OWNER_UID) return response.status(403).json({ ok: false, message: "Owner access required." });
    if (request.method === "GET") {
      const state = (await healthRef.get()).data(); const automaticCleanupEnabled = state?.failed === 0 && cleanupHealth(state?.lastRunAt);
      return response.json({ ok: true, available: true, automaticCleanupEnabled, lastRunAt: state?.lastRunAt ?? null, message: automaticCleanupEnabled ? "Trash is automatically cleaned after 30 days. Files used by the live site are protected." : "Manual cleanup is available. Automatic cleanup has not yet been confirmed by a successful scheduled run." });
    }
    if (request.method !== "POST") return response.status(405).json({ ok: false, message: "Method not allowed." });
    const body = request.body;
    if (!body || body.confirmation !== "permanently-delete") return response.status(400).json({ ok: false, message: "Confirm permanent deletion first." });
    if (body.action === "delete-empty-folders") {
      await emptyFolders(body.ids, body.revision); return response.json({ ok: true });
    }
    if (body.action !== "delete" || !Array.isArray(body.files) || !body.files.length || body.files.length > 100 || body.files.some(file => !ID.test(file?.id) || !Number.isSafeInteger(file.revision) || file.revision < 1)) return response.status(400).json({ ok: false, message: "Choose between 1 and 100 valid files." });
    const deletedIds = [], blockedIds = [], failedIds = [];
    for (const file of body.files) {
      try { (await purge(file.id, file.revision) === "deleted" ? deletedIds : blockedIds).push(file.id); }
      catch { failedIds.push(file.id); }
    }
    return response.json({ ok: true, deletedIds, blockedIds, failedIds });
  } catch { return response.status(503).json({ ok: false, message: "Cleanup could not be confirmed. Refresh File Hub before retrying." }); }
});
export const tmcDailyTrashCleanup = onSchedule({ ...options, schedule: "every 24 hours", timeZone: "America/New_York", retryCount: 3 }, async () => {
  assertProject();
  const started = Date.now(); let scanned = 0, deleted = 0, failed = 0;
  let cursor = (await healthRef.get()).data()?.cursor ?? null;
  while (Date.now() - started < 240_000) {
    let query = db.collection("ownerFiles").orderBy(FieldPath.documentId()).limit(100);
    if (cursor && ID.test(cursor)) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) { cursor = null; break; }
    for (const file of page.docs) {
      try { if (await purge(file.id, undefined, true) === "deleted") deleted++; }
      catch { failed++; }
      scanned++; cursor = file.id;
    }
    if (page.size < 100) { cursor = null; break; }
  }
  try {
    const registry = await folderRef.get();
    if (registry.exists) await emptyFolders(Object.keys(registry.data().folders), registry.data().revision, true);
  } catch { failed++; }
  await healthRef.set({ ...(failed ? {} : { lastRunAt: new Date().toISOString() }), lastAttemptAt: new Date().toISOString(), cursor, scanned, deleted, failed }, { merge: true });
  if (failed) throw new Error("Some trashed files could not be purged; retry scheduled.");
});
