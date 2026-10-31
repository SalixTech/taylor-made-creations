import { workspaceDocument, workspaceBrowserKey, workspaceCallableInput } from "./website-workspace-config";
import { CONSTRUCTION_WHIMSY_DOCUMENT, decodeConstructionWhimsy, defaultConstructionWhimsy, type ConstructionWhimsy } from "./construction-whimsy";
import { decodePrivateGallery } from "./private-gallery";
import { decodeCloudFile, cloudReferencedAssetIds } from "./cloud-files-model";
import { doc, getDoc, getDocs, collection, runTransaction, type Firestore } from "firebase/firestore/lite";
import type { Auth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { decodeCloudRecoveryContent, decodeCloudRecoveryEntry } from "./cloud-recovery";
import { assertOwnerContent, assertOwnerWorkspace, assertOwnerNamedDraft, assertOwnerDraftId, normalizeOwnerDraftName, MAX_NAMED_DRAFTS, assertPublishedOwnerSnapshot, OwnerValidationError, type OwnerContent, type OwnerPremade, type OwnerWorkspace, type OwnerNamedDraft, type PublishedOwnerSnapshot } from "./model";
import { createInitialOwnerWorkspace } from "./defaults";
import { createOwnerStore, OwnerStorageError, type OwnerStore } from "./storage";
import { SITE_ACCESS_DOCUMENT, decodeSiteAccess, defaultSiteAccess, type SiteAccess } from "./site-access";

export const OWNER_CLOUD_DOCUMENT = workspaceDocument("ownerWorkspace/current");
export const OWNER_DRAFT_INDEX_DOCUMENT = workspaceDocument("ownerDraftIndex/current");
export const OWNER_DRAFT_COLLECTION = workspaceDocument("ownerDrafts");
export const OWNER_DRAFT_TRASH_COLLECTION = workspaceDocument("ownerDraftTrash");
export const MAX_NAMED_DRAFT_CLOUD_BYTES = 700_000;
export const MAX_OWNER_CLOUD_BYTES = 700_000;
export const PUBLIC_CLOUD_DOCUMENT = workspaceDocument("site/published");
export const MAX_PUBLIC_CLOUD_BYTES = 700_000;
const CLOUD_CHANGED = workspaceBrowserKey("tmc-private-owner-cloud-changed");
export type EncodedOwnerWorkspace = { schemaVersion: 1; revision: number; payload: string };
export type EncodedPublishedOwnerSnapshot = { schemaVersion: 1; revision: number; payload: string };
export type OwnerDraftIndex = { schemaVersion: 1; revision: number; drafts: Record<string, number>; changedDraftId: string };
export type FirebaseOwnerStore = OwnerStore & { readLiveConstructionWhimsy(): Promise<ConstructionWhimsy>; updateConstructionWhimsy(enabled: boolean, expectedRevision: number): Promise<ConstructionWhimsy>; readLiveSiteAccess(): Promise<SiteAccess>; updateConstructionMode(constructionMode: boolean, expectedRevision: number): Promise<SiteAccess>; publishPremadeLive(item: OwnerPremade, expectedRevision: number): Promise<OwnerWorkspace>; readLiveShopVisibility(): Promise<boolean | null>; updateLiveShopVisibility(showPremades: boolean, expectedRevision: number): Promise<OwnerWorkspace>; publishLive(content: OwnerContent | undefined, expectedRevision: number): Promise<OwnerWorkspace>; dispose(): void };

function payloadBytes(payload: string): number { return new TextEncoder().encode(payload).byteLength; }

/** The cap includes BOTH the draft and private preview snapshot, including photos. */
export function encodeOwnerWorkspace(workspace: OwnerWorkspace): EncodedOwnerWorkspace {
  assertOwnerWorkspace(workspace);
  if (workspace.revision < 1) throw new OwnerValidationError([{ path: "workspace.revision", message: "Only an explicitly saved workspace can be encoded for cloud storage." }]);
  const payload = JSON.stringify(workspace);
  if (payloadBytes(payload) > MAX_OWNER_CLOUD_BYTES) {
    throw new OwnerValidationError([{ path: "workspace", message: "This cloud workspace is too large to save (700 KB maximum, including both draft and private preview). Reduce embedded photo sizes or use HTTPS image links. Your edits are still on this screen; nothing has been uploaded. Uploaded photos should use their HTTPS storage links." }]);
  }
  return { schemaVersion: 1, revision: workspace.revision, payload };
}

export function decodeOwnerWorkspace(raw: unknown): OwnerWorkspace {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid document wrapper.");
    const wrapper = raw as Partial<EncodedOwnerWorkspace>;
    if (Object.keys(wrapper).length !== 3 || Object.keys(wrapper).some(key => !["schemaVersion", "revision", "payload"].includes(key)) || wrapper.schemaVersion !== 1 || !Number.isSafeInteger(wrapper.revision) || (wrapper.revision ?? -1) < 1 || typeof wrapper.payload !== "string" || payloadBytes(wrapper.payload) > MAX_OWNER_CLOUD_BYTES) throw new Error("Invalid document fields.");
    const workspace: unknown = JSON.parse(wrapper.payload);
    assertOwnerWorkspace(workspace);
    if (workspace.revision !== wrapper.revision) throw new Error("Document revisions do not match.");
    return workspace;
  } catch (cause) {
    throw new OwnerStorageError("corrupt", "The saved cloud workspace could not be read safely. It has not been overwritten. Contact your site developer before making further changes.", { cause });
  }
}

/** Each named draft has its own 700 KB document budget; never pack ten drafts
 * or their photos into the working workspace or registry document. */
export function encodeOwnerNamedDraft(draft: OwnerNamedDraft): EncodedOwnerWorkspace {
  assertOwnerNamedDraft(draft);
  const payload = JSON.stringify(draft);
  if (payloadBytes(payload) > MAX_NAMED_DRAFT_CLOUD_BYTES) throw new OwnerValidationError([{ path: "draft", message: "This named draft is too large to save (700 KB per draft). Use uploaded image links instead of embedded photos. Other saved drafts are unaffected." }]);
  return { schemaVersion: 1, revision: draft.revision, payload };
}
export function decodeOwnerNamedDraft(raw: unknown, id: string): OwnerNamedDraft {
  try {
    assertOwnerDraftId(id);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid draft wrapper.");
    const wrapper = raw as Partial<EncodedOwnerWorkspace>;
    if (Object.keys(wrapper).length !== 3 || Object.keys(wrapper).some(key => !["schemaVersion", "revision", "payload"].includes(key)) || wrapper.schemaVersion !== 1 || !Number.isSafeInteger(wrapper.revision) || (wrapper.revision ?? 0) < 1 || typeof wrapper.payload !== "string" || payloadBytes(wrapper.payload) > MAX_NAMED_DRAFT_CLOUD_BYTES) throw new Error("Invalid draft wrapper fields.");
    const draft: unknown = JSON.parse(wrapper.payload);
    assertOwnerNamedDraft(draft);
    if (draft.id !== id || draft.revision !== wrapper.revision) throw new Error("Draft identity or revision mismatch.");
    return draft;
  } catch (cause) { throw new OwnerStorageError("corrupt", "This saved cloud draft could not be read safely. It has not been overwritten.", { cause }); }
}
export function decodeOwnerDraftIndex(raw: unknown): OwnerDraftIndex {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid draft index.");
    const index = raw as OwnerDraftIndex;
    if (Object.keys(index).length !== 4 || Object.keys(index).some(key => !["schemaVersion", "revision", "drafts", "changedDraftId"].includes(key)) || index.schemaVersion !== 1 || !Number.isSafeInteger(index.revision) || index.revision < 1 || !index.drafts || typeof index.drafts !== "object" || Array.isArray(index.drafts) || Object.getPrototypeOf(index.drafts) !== Object.prototype || Object.keys(index.drafts).length > MAX_NAMED_DRAFTS) throw new Error("Invalid draft index fields.");
    assertOwnerDraftId(index.changedDraftId);
    for (const [id, revision] of Object.entries(index.drafts)) { assertOwnerDraftId(id); if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid indexed revision."); }
    return index;
  } catch (cause) { throw new OwnerStorageError("corrupt", "The saved draft index could not be read safely. No saved drafts have been overwritten.", { cause }); }
}

/** Public documents contain only an explicitly projected snapshot, never a workspace. */
export function encodePublishedOwnerSnapshot(snapshot: PublishedOwnerSnapshot): EncodedPublishedOwnerSnapshot {
  assertPublishedOwnerSnapshot(snapshot);
  const payload = JSON.stringify(snapshot);
  if (payloadBytes(payload) > MAX_PUBLIC_CLOUD_BYTES) throw new OwnerValidationError([{ path: "publication", message: "This public snapshot is too large to publish (700 KB maximum). Reduce text or use HTTPS photo links. Nothing has been published." }]);
  return { schemaVersion: 1, revision: snapshot.revision, payload };
}

export function decodePublishedOwnerSnapshot(raw: unknown): PublishedOwnerSnapshot {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid public document wrapper.");
    const wrapper = raw as Partial<EncodedPublishedOwnerSnapshot>;
    if (Object.keys(wrapper).length !== 3 || Object.keys(wrapper).some(key => !["schemaVersion", "revision", "payload"].includes(key)) || wrapper.schemaVersion !== 1 || !Number.isSafeInteger(wrapper.revision) || (wrapper.revision ?? -1) < 1 || typeof wrapper.payload !== "string" || payloadBytes(wrapper.payload) > MAX_PUBLIC_CLOUD_BYTES) throw new Error("Invalid public document fields.");
    const snapshot: unknown = JSON.parse(wrapper.payload);
    assertPublishedOwnerSnapshot(snapshot);
    if (snapshot.revision !== wrapper.revision) throw new Error("Public document revisions do not match.");
    return snapshot;
  } catch (cause) {
    throw new OwnerStorageError("corrupt", "The published site snapshot could not be read safely. No private draft or default content has been substituted.", { cause });
  }
}

function cloudError(error: unknown, operation: "read" | "write"): Error {
  if (error instanceof OwnerValidationError) return error;
  if (error instanceof OwnerStorageError) {
    if (error.code === "conflict" && !error.message.includes("saved draft")) return new OwnerStorageError("conflict", "This cloud workspace changed on another tab or device. Your edits are still on screen. Reload the saved workspace before saving again.", { cause: error });
    return error;
  }
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^(?:firestore|functions)\//, "") : "";
  if (code === "aborted") return new OwnerStorageError("conflict", "The workspace changed on another device. Reload the saved draft before trying again.", { cause: error });
  if (["invalid-argument", "resource-exhausted", "failed-precondition"].includes(code) && error instanceof Error) return new OwnerStorageError("write", error.message.replace(/^Firebase:\s*/, ""), { cause: error });
  if (code === "permission-denied" || code === "unauthenticated") return new OwnerStorageError(operation, "Owner access was not accepted. Sign in with the authorized owner account. If this is the first setup, your site developer must deploy the owner-only Firestore rules. Nothing has been reset or replaced.", { cause: error });
  return new OwnerStorageError(operation, operation === "read"
    ? "The cloud workspace could not be loaded. Check your connection and try again. No browser-local copy was opened and nothing has been reset."
    : "The cloud save was not confirmed. Keep this page open and check your connection. Reload the saved workspace before retrying if the connection dropped during a save.", { cause: error });
}

/**
 * Private owner-only Firestore Lite adapter: server reads, no offline persistence,
 * no local fallback, no writes on load, and no upload of existing browser drafts.
 * publishLocal is the existing port's name for a PRIVATE preview, never publishing.
 * Only an explicit publishLive call writes the separately readable public snapshot.
 */
export function createFirebaseOwnerStore({ db, auth, ownerUid }: { db: Firestore; auth: Auth; ownerUid: string }): FirebaseOwnerStore {
  let disposed = false;
  const sessionUser = auth.currentUser;
  const cleanups = new Set<() => void>();
  const reference = doc(db, OWNER_CLOUD_DOCUMENT);
  const requireOwner = () => {
    if (disposed || !ownerUid || !auth.currentUser || auth.currentUser !== sessionUser || auth.currentUser.uid !== ownerUid) throw new OwnerStorageError("unavailable", "Your owner session ended. Sign in again to open the private cloud workspace.");
  };
  const confirmOwner = async () => {
    requireOwner();
    const user = auth.currentUser!;
    await user.getIdToken();
    requireOwner();
    if (auth.currentUser !== user) throw new OwnerStorageError("unavailable", "Your sign-in changed. Open the workspace again before saving.");
  };
  const notify = () => {
    if (disposed || typeof window === "undefined") return;
    // Notification failures must never make a committed write appear unsaved.
    try { window.dispatchEvent(new Event(CLOUD_CHANGED)); } catch { /* advisory */ }
    try {
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(CLOUD_CHANGED); channel.postMessage({ changed: true }); channel.close(); }
    } catch { /* Reload still reads the authoritative server document. */ }
  };
  const readDraftRegistry = async (transaction: Parameters<Parameters<typeof runTransaction>[1]>[0]) => {
    const indexReference = doc(db, OWNER_DRAFT_INDEX_DOCUMENT);
    const snapshot = await transaction.get(indexReference); requireOwner();
    const index = snapshot.exists() ? decodeOwnerDraftIndex(snapshot.data()) : null;
    const drafts: OwnerNamedDraft[] = [];
    for (const [id, revision] of Object.entries(index?.drafts ?? {})) {
      const saved = await transaction.get(doc(db, `${OWNER_DRAFT_COLLECTION}/${id}`)); requireOwner();
      if (!saved.exists()) throw new OwnerStorageError("corrupt", "A saved draft is missing from the private registry. Nothing has been overwritten.");
      const draft = decodeOwnerNamedDraft(saved.data(), id);
      if (draft.revision !== revision) throw new OwnerStorageError("corrupt", "The saved draft registry revision does not match. Nothing has been overwritten.");
      drafts.push(draft);
    }
    return { indexReference, index, drafts };
  };
  const ensurePrivateAssetsReady = async (transaction: Parameters<Parameters<typeof runTransaction>[1]>[0], next: unknown, previous?: unknown) => {
    const previousIds = new Set(previous ? cloudReferencedAssetIds(previous) : []);
    for (const id of cloudReferencedAssetIds(next)) {
      // Existing references are protected by cleanup's transaction read of this
      // private document. Only newly introduced references need another lookup.
      if (previousIds.has(id)) continue;
      const snapshot = await transaction.get(doc(db, workspaceDocument("ownerFiles"), id)); requireOwner();
      if (!snapshot.exists() || decodeCloudFile(snapshot.data(), id).status !== "ready") throw new OwnerStorageError("write", "A selected cloud file is missing, uploading, or being deleted. Choose an available file before saving.");
    }
  };
  const callBackup = async <T,>(name: string, input: unknown): Promise<T> => {
    await confirmOwner();
    const response = await httpsCallable<unknown, T>(getFunctions(auth.app, "us-central1"), name)(workspaceCallableInput(input as object));
    requireOwner(); return response.data;
  };
  let pendingPublication: { key: string; operationId: string } | null = null;
  const publishContent = async (input: Record<string, unknown>) => {
    try {
      const key = JSON.stringify(input);
      if (pendingPublication?.key !== key) pendingPublication = { key, operationId: crypto.randomUUID() };
      // Use the same JSON representation as saved drafts and the retry key.
      // Firebase callable encoding turns optional undefined properties into null;
      // null is intentionally invalid for appearance objects. Preserve explicit
      // null/false/zero and every actual style; only omitted JSON fields disappear.
      const request = JSON.parse(key) as Record<string, unknown>;
      const result = await callBackup<{ workspace: unknown }>("tmcOwnerPublishContent", { ...request, operationId: pendingPublication.operationId });
      assertOwnerWorkspace(result.workspace); requireOwner(); pendingPublication = null; notify(); return structuredClone(result.workspace);
    } catch (error) { throw cloudError(error, "write"); }
  };
  const store = createOwnerStore({
    namedDrafts: {
      async readTrashed() {
        try {
          await confirmOwner();
          const snapshot = await getDocs(collection(db, OWNER_DRAFT_TRASH_COLLECTION)); requireOwner();
          return snapshot.docs.map(saved => decodeOwnerNamedDraft(saved.data(), saved.id));
        } catch (error) { throw cloudError(error, "read"); }
      },
      async readTrashedDraft(id) {
        try {
          await confirmOwner();
          const snapshot = await getDoc(doc(db, `${OWNER_DRAFT_TRASH_COLLECTION}/${id}`)); requireOwner();
          return snapshot.exists() ? decodeOwnerNamedDraft(snapshot.data(), id) : null;
        } catch (error) { throw cloudError(error, "read"); }
      },
      async read() {
        try {
          await confirmOwner();
          const drafts = await runTransaction(db, async transaction => { requireOwner(); return (await readDraftRegistry(transaction)).drafts; });
          requireOwner(); return drafts;
        } catch (error) { throw cloudError(error, "read"); }
      },
      async update(transform) {
        let attempted: { id: string; revision: number | null } | undefined;
        try {
          await confirmOwner();
          const drafts = await runTransaction(db, async transaction => {
            requireOwner();
            const { indexReference, index, drafts } = await readDraftRegistry(transaction);
            const next = transform(drafts), id = next.changedDraftId;
            assertOwnerDraftId(id);
            const previous = drafts.find(draft => draft.id === id), changed = next.drafts.find(draft => draft.id === id);
            attempted = { id, revision: previous?.revision ?? null };
            const draftReference = doc(db, `${OWNER_DRAFT_COLLECTION}/${id}`);
            // A fresh ID must not overwrite an unindexed/orphaned document.
            if (!previous) {
              const orphan = await transaction.get(draftReference); requireOwner();
              if (orphan.exists()) throw new OwnerStorageError("corrupt", "A saved draft already uses this identifier outside the registry. Nothing has been overwritten.");
            }
            const archiveReference = doc(db, `${OWNER_DRAFT_TRASH_COLLECTION}/${id}`);
            if (!changed) {
              const archive = await transaction.get(archiveReference); requireOwner();
              if (!previous || archive.exists()) throw new OwnerStorageError("conflict", "This saved draft was already removed or archived. Reload before trying again.");
            }
            const encoded = changed ? encodeOwnerNamedDraft(changed) : encodeOwnerNamedDraft(previous!);
            const registry: OwnerDraftIndex = { schemaVersion: 1, revision: (index?.revision ?? 0) + 1, drafts: Object.fromEntries(next.drafts.map(draft => [draft.id, draft.revision])), changedDraftId: id };
            decodeOwnerDraftIndex(registry);
            if (changed) await ensurePrivateAssetsReady(transaction, changed, previous);
            requireOwner();
            if (changed) transaction.set(draftReference, encoded);
            else { transaction.set(archiveReference, encoded); transaction.delete(draftReference); }
            transaction.set(indexReference, registry);
            return next.drafts;
          });
          requireOwner(); notify(); return drafts;
        } catch (error) {
          const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^(?:firestore|functions)\//, "") : "";
          if (code === "permission-denied" && attempted) {
            // The rules can reject an advancing registry before the SDK reports
            // its transaction conflict. Diagnose from validated server reads only;
            // never repeat an uncertain write or label an auth failure a conflict.
            let latestIndex: OwnerDraftIndex | null | undefined;
            let latestDraftRevision: number | null | undefined;
            try {
              await confirmOwner();
              const index = await getDoc(doc(db, OWNER_DRAFT_INDEX_DOCUMENT)); requireOwner();
              latestIndex = index.exists() ? decodeOwnerDraftIndex(index.data()) : null;
              const draft = await getDoc(doc(db, `${OWNER_DRAFT_COLLECTION}/${attempted.id}`)); requireOwner();
              latestDraftRevision = draft.exists() ? decodeOwnerNamedDraft(draft.data(), attempted.id).revision : null;
            } catch { /* Denied/unavailable/corrupt reads prove no conflict. */ }
            if (latestIndex !== undefined && latestDraftRevision !== undefined) {
              if (attempted.revision !== null && latestDraftRevision !== attempted.revision) throw new OwnerStorageError("conflict", "This saved draft changed or was archived on another tab or device. Reload the draft list before trying again; your edits have not been overwritten.", { cause: error });
              if (attempted.revision === null && Object.keys(latestIndex?.drafts ?? {}).length >= MAX_NAMED_DRAFTS) throw new OwnerStorageError("limit", "You can save up to 10 named drafts. Archive a saved draft or update an existing one first.", { cause: error });
            }
          }
          throw cloudError(error, "write");
        }
      },
    },
    async read() {
      try {
        await confirmOwner();
        const snapshot = await getDoc(reference);
        requireOwner();
        return snapshot.exists() ? decodeOwnerWorkspace(snapshot.data()) : null;
      } catch (error) { throw cloudError(error, "read"); }
    },
    async update(transform) {
      try {
        await confirmOwner();
        const workspace = await runTransaction(db, async transaction => {
          requireOwner();
          const snapshot = await transaction.get(reference);
          requireOwner();
          const current = snapshot.exists() ? decodeOwnerWorkspace(snapshot.data()) : null;
          // createOwnerStore applies the expected revision check here, atomically.
          const next = transform(current);
          const encoded = encodeOwnerWorkspace(next);
          await ensurePrivateAssetsReady(transaction, next, current);
          requireOwner();
          transaction.set(reference, encoded);
          return next;
        });
        requireOwner();
        notify();
        return workspace;
      } catch (error) { throw cloudError(error, "write"); }
    },
    subscribe(callback) {
      requireOwner();
      if (typeof window === "undefined") return () => {};
      const changed = () => { if (!disposed && auth.currentUser === sessionUser && auth.currentUser?.uid === ownerUid) callback(); };
      window.addEventListener(CLOUD_CHANGED, changed);
      window.addEventListener("focus", changed);
      let channel: BroadcastChannel | undefined;
      try { if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel(CLOUD_CHANGED); channel.onmessage = changed; } } catch { /* Manual reload is still available. */ }
      const cleanup = () => { window.removeEventListener(CLOUD_CHANGED, changed); window.removeEventListener("focus", changed); channel?.close(); cleanups.delete(cleanup); };
      cleanups.add(cleanup);
      return cleanup;
    },
  });
  return {
    ...store,
    async saveDraft(content, expectedRevision, version) {
      if (!version) return store.saveDraft(content, expectedRevision);
      // An explicit Save draft is one atomic operation: working workspace AND
      // the version shown in Drafts. Never report success for only half of it.
      assertOwnerContent(content); assertOwnerDraftId(version.id);
      const snapshot = structuredClone(content), name = normalizeOwnerDraftName(version.name), id = version.id;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new OwnerStorageError("conflict", "Reload the saved workspace before saving a draft version.");
      let attemptedIndexRevision: number | undefined;
      try {
        await confirmOwner();
        const saved = await runTransaction(db, async transaction => {
          requireOwner();
          const workspaceSnapshot = await transaction.get(reference); requireOwner();
          const current = workspaceSnapshot.exists() ? decodeOwnerWorkspace(workspaceSnapshot.data()) : createInitialOwnerWorkspace();
          const { indexReference, index, drafts } = await readDraftRegistry(transaction);
          attemptedIndexRevision = index?.revision ?? 0;
          const previousAttempt = drafts.find(draft => draft.id === id);
          if (previousAttempt) {
            if (previousAttempt.name === name && previousAttempt.revision === 1 && JSON.stringify(previousAttempt.content) === JSON.stringify(snapshot) && current.revision === expectedRevision + 1 && JSON.stringify(current.draft) === JSON.stringify(snapshot)) return current;
            throw new OwnerStorageError("conflict", "This saved draft version already exists in Drafts, but the saved workspace or version has changed. Open Drafts to review it, then reload the saved workspace before saving again. Nothing was duplicated or replaced.");
          }
          if (current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "This cloud workspace changed on another tab or device. Your edits are still here. Reload the saved workspace before saving again.");
          if (drafts.length >= MAX_NAMED_DRAFTS) throw new OwnerStorageError("limit", "All 10 Drafts slots are in use. Open Drafts and archive a version or replace one with Save here before trying again. Your current edits and saved workspace have not changed.");
          if (drafts.some(draft => draft.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"))) throw new OwnerValidationError([{ path: "draft.name", message: "Another saved draft already has this name. Choose a different name." }]);
          const draftReference = doc(db, OWNER_DRAFT_COLLECTION, id), archiveReference = doc(db, OWNER_DRAFT_TRASH_COLLECTION, id);
          const orphan = await transaction.get(draftReference), archived = await transaction.get(archiveReference); requireOwner();
          if (orphan.exists() || archived.exists()) throw new OwnerStorageError("conflict", "This saved version already exists outside the active Drafts list. Refresh Drafts before trying again; nothing has been overwritten.");
          const date = new Date().toISOString();
          const workspace: OwnerWorkspace = { ...current, draft: snapshot, revision: current.revision + 1, updatedAt: date };
          const draft: OwnerNamedDraft = { id, name, revision: 1, createdAt: date, updatedAt: date, content: snapshot };
          const encodedWorkspace = encodeOwnerWorkspace(workspace), encodedDraft = encodeOwnerNamedDraft(draft);
          const registry: OwnerDraftIndex = { schemaVersion: 1, revision: (index?.revision ?? 0) + 1, drafts: { ...(index?.drafts ?? {}), [id]: 1 }, changedDraftId: id };
          decodeOwnerDraftIndex(registry);
          await ensurePrivateAssetsReady(transaction, draft);
          requireOwner();
          transaction.set(reference, encodedWorkspace); transaction.set(draftReference, encodedDraft); transaction.set(indexReference, registry);
          return workspace;
        });
        requireOwner(); notify(); return saved;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
        if (code === "permission-denied" && attemptedIndexRevision !== undefined) {
          // Firestore can evaluate advancing-revision rules before returning a
          // transaction conflict. Diagnose from validated reads, never weaken
          // the rules or retry a potentially committed write automatically.
          let changed = false;
          try {
            await confirmOwner();
            const [workspace, registry] = await Promise.all([getDoc(reference), getDoc(doc(db, OWNER_DRAFT_INDEX_DOCUMENT))]); requireOwner();
            const revision = workspace.exists() ? decodeOwnerWorkspace(workspace.data()).revision : 0;
            const indexRevision = registry.exists() ? decodeOwnerDraftIndex(registry.data()).revision : 0;
            changed = revision !== expectedRevision || indexRevision !== attemptedIndexRevision;
          } catch { /* Denied, unavailable or corrupt reads prove no conflict. */ }
          if (changed) throw new OwnerStorageError("conflict", "The saved draft workspace or Drafts list changed on another tab or device. Review Drafts and reload the saved workspace before retrying. Your edits were not overwritten.", { cause: error });
        }
        if (!(error instanceof OwnerStorageError) && !(error instanceof OwnerValidationError) && !["permission-denied", "unauthenticated", "aborted", "invalid-argument", "resource-exhausted", "failed-precondition"].includes(code)) throw new OwnerStorageError("write", "This draft save was not confirmed. Keep your edits open. Choose Save draft again to check the same version without creating a duplicate, or open Drafts to review what was saved. Nothing was published.", { cause: error });
        throw cloudError(error, "write");
      }
    },
    async readLiveConstructionWhimsy() {
      try {
        await confirmOwner();
        const snapshot = await getDoc(doc(db, workspaceDocument(CONSTRUCTION_WHIMSY_DOCUMENT))); requireOwner();
        return snapshot.exists() ? decodeConstructionWhimsy(snapshot.data()) : defaultConstructionWhimsy();
      } catch (cause) { throw new OwnerStorageError("read", "Construction Whimsy could not be checked. No setting was changed.", { cause }); }
    },
    async updateConstructionWhimsy(enabled, expectedRevision) {
      if (typeof enabled !== "boolean" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new OwnerStorageError("write", "Check Construction Whimsy again before updating it.");
      try {
        await confirmOwner();
        const saved = await runTransaction(db, async transaction => {
          requireOwner();
          const reference = doc(db, workspaceDocument(CONSTRUCTION_WHIMSY_DOCUMENT));
          const snapshot = await transaction.get(reference); requireOwner();
          const current = snapshot.exists() ? decodeConstructionWhimsy(snapshot.data()) : defaultConstructionWhimsy();
          if (current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "Construction Whimsy changed on another device. Check again before updating it.");
          const next = decodeConstructionWhimsy({ schemaVersion: 1, revision: current.revision + 1, enabled });
          requireOwner(); transaction.set(reference, next); return next;
        });
        requireOwner(); return saved;
      } catch (cause) {
        if (cause instanceof OwnerStorageError && ["conflict", "unavailable"].includes(cause.code)) throw cause;
        throw new OwnerStorageError("write", "The Construction Whimsy update was not confirmed. Check the live setting before retrying. Website access and your draft were not changed.", { cause });
      }
    },
    async readLiveSiteAccess() {
      try {
        await confirmOwner();
        const snapshot = await getDoc(doc(db, workspaceDocument(SITE_ACCESS_DOCUMENT))); requireOwner();
        return snapshot.exists() ? decodeSiteAccess(snapshot.data()) : defaultSiteAccess();
      } catch (cause) {
        throw new OwnerStorageError("read", "Construction Mode could not be checked. No setting was changed. Check your connection and owner session, then choose Check again.", { cause });
      }
    },
    async updateConstructionMode(constructionMode, expectedRevision) {
      if (typeof constructionMode !== "boolean" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new OwnerStorageError("write", "Check Construction Mode again before updating it.");
      try {
        await confirmOwner();
        const saved = await runTransaction(db, async transaction => {
          requireOwner();
          const accessReference = doc(db, workspaceDocument(SITE_ACCESS_DOCUMENT));
          const accessSnapshot = await transaction.get(accessReference); requireOwner();
          const current = accessSnapshot.exists() ? decodeSiteAccess(accessSnapshot.data()) : defaultSiteAccess();
          if (current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "Construction Mode changed on another device. Check again before updating it; your draft has not changed.");
          if (!constructionMode) {
            const publication = await transaction.get(doc(db, PUBLIC_CLOUD_DOCUMENT)); requireOwner();
            if (!publication.exists()) throw new OwnerStorageError("not-published", "Publish the website once before turning Construction Mode off. This setting never publishes your private draft.");
            decodePublishedOwnerSnapshot(publication.data());
          }
          const next = decodeSiteAccess({ schemaVersion: 1, revision: current.revision + 1, constructionMode });
          requireOwner(); transaction.set(accessReference, next);
          return next;
        });
        requireOwner();
        // No workspace/publication write or workspace-change notification: only
        // the explicitly confirmed live gate was changed by this transaction.
        return saved;
      } catch (cause) {
        if (cause instanceof OwnerStorageError && ["conflict", "not-published", "unavailable"].includes(cause.code)) throw cause;
        throw new OwnerStorageError("write", "The Construction Mode update was not confirmed. Check the live setting again before retrying. No private draft was published.", { cause });
      }
    },
    async readLiveShopVisibility() {
      try {
        await confirmOwner();
        const snapshot = await getDoc(doc(db, PUBLIC_CLOUD_DOCUMENT)); requireOwner();
        return snapshot.exists() ? decodePublishedOwnerSnapshot(snapshot.data()).content.site.showPremades : null;
      } catch (error) { throw cloudError(error, "read"); }
    },
    async updateLiveShopVisibility(showPremades, expectedRevision) {
      return publishContent({ mode: "shop", showPremades, expectedRevision });
    },
    async publishSettingsCardLive(content, card, expectedRevision) {
      assertOwnerContent(content);
      return publishContent({ mode: "settings", content: structuredClone(content), card, expectedRevision });
    },
    async publishPremadeLive(item, expectedRevision) {
      return publishContent({ mode: "premade", item: structuredClone(item), expectedRevision });
    },
    async readPublication() {
      try { await confirmOwner(); const snapshot = await getDoc(doc(db, PUBLIC_CLOUD_DOCUMENT)); requireOwner(); return snapshot.exists() ? decodePublishedOwnerSnapshot(snapshot.data()) : null; }
      catch (error) { throw cloudError(error, "read"); }
    },
    async publishSelected(content, expectedRevision, expectedPublicRevision, selection, galleryLibrary) {
      assertOwnerContent(content);
      return publishContent({ mode: "selected", content: structuredClone(content), expectedRevision, expectedPublicRevision, selection: [...selection].sort(), ...(galleryLibrary ? { galleryLibrary: structuredClone(galleryLibrary) } : {}) });
    },
    async readGallery() {
      try { const result = await callBackup<{ gallery: unknown }>("tmcOwnerReadGallery", {}); return result.gallery === null ? null : decodePrivateGallery(result.gallery); }
      catch (error) { throw cloudError(error, "read"); }
    },
    async saveGallery(items, expectedRevision) {
      try { const result = await callBackup<{ gallery: unknown }>("tmcOwnerSaveGallery", { items: structuredClone(items), expectedRevision }); return decodePrivateGallery(result.gallery); }
      catch (error) { throw cloudError(error, "write"); }
    },
    async publishLive(content, expectedRevision) {
      if (content !== undefined) assertOwnerContent(content);
      return publishContent({ mode: "full", ...(content === undefined ? {} : { content: structuredClone(content) }), expectedRevision });
    },
    recovery: {
      async checkpointDraft(input) {
        assertOwnerContent(input.content);
        // Match the JSON stored in ownerWorkspace/current. The callable SDK
        // converts optional `undefined` properties to null, whereas our saved
        // workspace omits them. Sending that null used to reject an otherwise
        // valid recovery copy (and could never match a saved-draft checkpoint).
        // Keep the same operation identity so an uncertain retry is idempotent.
        const request = JSON.parse(JSON.stringify(input)) as typeof input;
        assertOwnerContent(request.content);
        const result = await callBackup<{entry:unknown}>("tmcOwnerCheckpointDraft", request);
        return decodeCloudRecoveryEntry(result.entry);
      },
      async listRecovery() {
        const result = await callBackup<{entries:unknown[]}>("tmcOwnerListRecovery", {});
        if (!Array.isArray(result.entries) || result.entries.length > 2000) throw new Error("Cloud recovery list is invalid.");
        return result.entries.map(decodeCloudRecoveryEntry);
      },
      async readRecovery(id, expectedRevision) {
        const result = await callBackup<{content:unknown;cloudRevision:number}>("tmcOwnerReadRecovery", {id,expectedRevision});
        if (result.cloudRevision !== expectedRevision) throw new Error("The workspace changed. Reload before restoring.");
        return decodeCloudRecoveryContent(result.content);
      },
      async dismissRecovery(id) {
        const result = await callBackup<{dismissed:boolean;bytesRetained:boolean}>("tmcOwnerDismissRecovery", {id});
        if (result.dismissed !== true || result.bytesRetained !== true) throw new Error("Recovery dismissal was not confirmed. Refresh before retrying.");
      },
    },
    dispose() { disposed = true; for (const cleanup of [...cleanups]) cleanup(); cleanups.clear(); },
  };
}
