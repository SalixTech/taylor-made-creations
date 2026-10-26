import { doc, getDoc, getDocs, collection, runTransaction, type Firestore } from "firebase/firestore/lite";
import type { Auth } from "firebase/auth";
import { assertOwnerContent, assertOwnerWorkspace, assertOwnerNamedDraft, assertOwnerDraftId, MAX_NAMED_DRAFTS, assertPublishedOwnerSnapshot, createPublishedOwnerSnapshot, createPublishedPremadeSnapshot, OwnerValidationError, type OwnerContent, type OwnerPremade, type OwnerWorkspace, type OwnerNamedDraft, type PublishedOwnerSnapshot } from "./model";
import { createInitialOwnerWorkspace } from "./defaults";
import { createOwnerStore, OwnerStorageError, type OwnerStore } from "./storage";
import { SITE_ACCESS_DOCUMENT, decodeSiteAccess, defaultSiteAccess, type SiteAccess } from "./site-access";

export const OWNER_CLOUD_DOCUMENT = "ownerWorkspace/current";
export const OWNER_DRAFT_INDEX_DOCUMENT = "ownerDraftIndex/current";
export const OWNER_DRAFT_COLLECTION = "ownerDrafts";
export const OWNER_DRAFT_TRASH_COLLECTION = "ownerDraftTrash";
export const MAX_NAMED_DRAFT_CLOUD_BYTES = 700_000;
export const MAX_OWNER_CLOUD_BYTES = 700_000;
export const PUBLIC_CLOUD_DOCUMENT = "site/published";
export const MAX_PUBLIC_CLOUD_BYTES = 700_000;
const CLOUD_CHANGED = "tmc-private-owner-cloud-changed";
export type EncodedOwnerWorkspace = { schemaVersion: 1; revision: number; payload: string };
export type EncodedPublishedOwnerSnapshot = { schemaVersion: 1; revision: number; payload: string };
export type OwnerDraftIndex = { schemaVersion: 1; revision: number; drafts: Record<string, number>; changedDraftId: string };
export type FirebaseOwnerStore = OwnerStore & { readLiveSiteAccess(): Promise<SiteAccess>; updateConstructionMode(constructionMode: boolean, expectedRevision: number): Promise<SiteAccess>; publishPremadeLive(item: OwnerPremade, expectedRevision: number): Promise<OwnerWorkspace>; readLiveShopVisibility(): Promise<boolean | null>; updateLiveShopVisibility(showPremades: boolean, expectedRevision: number): Promise<OwnerWorkspace>; publishLive(content: OwnerContent | undefined, expectedRevision: number): Promise<OwnerWorkspace>; dispose(): void };

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
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
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
            requireOwner();
            if (changed) transaction.set(draftReference, encoded);
            else { transaction.set(archiveReference, encoded); transaction.delete(draftReference); }
            transaction.set(indexReference, registry);
            return next.drafts;
          });
          requireOwner(); notify(); return drafts;
        } catch (error) {
          const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
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
    async readLiveSiteAccess() {
      try {
        await confirmOwner();
        const snapshot = await getDoc(doc(db, SITE_ACCESS_DOCUMENT)); requireOwner();
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
          const accessReference = doc(db, SITE_ACCESS_DOCUMENT);
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
      if (typeof showPremades !== "boolean") throw new OwnerValidationError([{ path: "site.showPremades", message: "Choose whether to show the premade shop." }]);
      try {
        await confirmOwner();
        const workspace = await runTransaction(db, async transaction => {
          requireOwner();
          const privateSnapshot = await transaction.get(reference); requireOwner();
          const current = privateSnapshot.exists() ? decodeOwnerWorkspace(privateSnapshot.data()) : createInitialOwnerWorkspace();
          if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "The workspace changed before the shop update. Reload before trying again.");
          const publicReference = doc(db, PUBLIC_CLOUD_DOCUMENT);
          const publicSnapshot = await transaction.get(publicReference); requireOwner();
          if (!publicSnapshot.exists()) throw new OwnerStorageError("not-published", "Publish the site once before using Update Live. This button only changes an existing published shop setting.");
          const published = decodePublishedOwnerSnapshot(publicSnapshot.data());
          if (published.revision > current.revision) throw new OwnerStorageError("corrupt", "The published revision is ahead of the workspace. Nothing has been overwritten.");
          const timestamp = new Date().toISOString();
          const next = { ...current, revision: current.revision + 1, updatedAt: timestamp };
          // Deliberately start from the existing PUBLIC content, not draft or preview.
          const nextPublished: PublishedOwnerSnapshot = { ...published, revision: next.revision, publishedAt: timestamp, content: { ...published.content, site: { ...published.content.site, showPremades } } };
          const privateDocument = encodeOwnerWorkspace(next), publicDocument = encodePublishedOwnerSnapshot(nextPublished);
          requireOwner(); transaction.set(reference, privateDocument); transaction.set(publicReference, publicDocument);
          return structuredClone(next);
        });
        requireOwner(); notify(); return workspace;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
        if (code === "permission-denied") {
          // As with full Publish, revision rules may reject before the SDK can
          // report a transaction race. Read only; never retry an uncertain write.
          let latestRevision: number | undefined;
          try {
            await confirmOwner();
            const latest = await getDoc(reference); requireOwner();
            latestRevision = latest.exists() ? decodeOwnerWorkspace(latest.data()).revision : 0;
          } catch { /* An auth failure or corrupt/unavailable read proves nothing. */ }
          if (latestRevision !== undefined && Number.isSafeInteger(expectedRevision) && latestRevision !== expectedRevision) throw cloudError(new OwnerStorageError("conflict", "Another device changed this workspace during the shop update."), "write");
        }
        throw cloudError(error, "write");
      }
    },
    async publishPremadeLive(item, expectedRevision) {
      // Capture the item only, before any network await. Unrelated form data is
      // not accepted by this operation and cannot leak into the public document.
      const selected = structuredClone(item);
      try {
        await confirmOwner();
        const workspace = await runTransaction(db, async transaction => {
          requireOwner();
          const privateSnapshot = await transaction.get(reference); requireOwner();
          const current = privateSnapshot.exists() ? decodeOwnerWorkspace(privateSnapshot.data()) : createInitialOwnerWorkspace();
          if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "The workspace changed before this premade was published. Reload before trying again; other products have not been overwritten.");
          const publicReference = doc(db, PUBLIC_CLOUD_DOCUMENT);
          const publicSnapshot = await transaction.get(publicReference); requireOwner();
          if (!publicSnapshot.exists()) throw new OwnerStorageError("not-published", "Publish the site once before publishing an individual premade. This button never publishes unrelated draft edits.");
          const published = decodePublishedOwnerSnapshot(publicSnapshot.data());
          if (published.revision > current.revision) throw new OwnerStorageError("corrupt", "The published revision is ahead of the workspace. Nothing has been overwritten.");
          const timestamp = new Date().toISOString();
          const premades = current.draft.premades.some(entry => entry.id === selected.id)
            ? current.draft.premades.map(entry => entry.id === selected.id ? selected : entry)
            : [...current.draft.premades, selected];
          const next: OwnerWorkspace = { ...current, draft: { ...current.draft, premades }, revision: current.revision + 1, updatedAt: timestamp };
          // Validate both documents before queueing either write. Only the
          // selected listing changes; shop visibility remains its published value.
          const privateDocument = encodeOwnerWorkspace(next);
          const publicDocument = encodePublishedOwnerSnapshot(createPublishedPremadeSnapshot(published, selected, next.revision, timestamp));
          requireOwner(); transaction.set(reference, privateDocument); transaction.set(publicReference, publicDocument);
          return structuredClone(next);
        });
        requireOwner(); notify(); return workspace;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
        if (code === "permission-denied") {
          let latestRevision: number | undefined;
          try { await confirmOwner(); const latest = await getDoc(reference); requireOwner(); latestRevision = latest.exists() ? decodeOwnerWorkspace(latest.data()).revision : 0; } catch { /* Read failure proves no conflict. */ }
          if (latestRevision !== undefined && Number.isSafeInteger(expectedRevision) && latestRevision !== expectedRevision) throw cloudError(new OwnerStorageError("conflict", "Another device changed this workspace during premade publication."), "write");
        }
        throw cloudError(error, "write");
      }
    },
    async publishLive(content, expectedRevision) {
      // Snapshot before authentication/network awaits so later form edits cannot leak.
      if (content !== undefined) assertOwnerContent(content);
      const requestedDraft = content === undefined ? undefined : structuredClone(content);
      try {
        await confirmOwner();
        const workspace = await runTransaction(db, async transaction => {
          requireOwner();
          const snapshot = await transaction.get(reference);
          requireOwner();
          const current = snapshot.exists() ? decodeOwnerWorkspace(snapshot.data()) : createInitialOwnerWorkspace();
          if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "The private workspace changed before publication. Reload the saved workspace before publishing again.");
          const publicReference = doc(db, PUBLIC_CLOUD_DOCUMENT);
          // Track the public document in the transaction read set as well. Without
          // this, a concurrent first publication can fail its rules precondition as
          // permission-denied rather than retrying and reporting the stale draft.
          const previousPublic = await transaction.get(publicReference);
          requireOwner();
          if (previousPublic.exists() && decodePublishedOwnerSnapshot(previousPublic.data()).revision > current.revision) throw new OwnerStorageError("corrupt", "The published snapshot revision is ahead of the private workspace. Nothing has been overwritten; contact your site developer before publishing.");
          const timestamp = new Date().toISOString();
          const next: OwnerWorkspace = { ...current, draft: requestedDraft ?? current.draft, revision: current.revision + 1, updatedAt: timestamp };
          // Validate BOTH documents before queuing either write. Failed transactions
          // commit neither document, including revision retries and authorization loss.
          const privateDocument = encodeOwnerWorkspace(next);
          const publicDocument = encodePublishedOwnerSnapshot(createPublishedOwnerSnapshot(next.draft, next.revision, timestamp));
          requireOwner();
          transaction.set(reference, privateDocument);
          transaction.set(publicReference, publicDocument);
          return structuredClone(next);
        });
        requireOwner();
        notify();
        return workspace;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
        if (code === "permission-denied") {
          // A competing publisher can make revision rules reject a transaction
          // before Firestore reports its read conflict. Diagnose, never retry or
          // write: only a validated server revision change proves stale edits.
          let latestRevision: number | undefined;
          try {
            await confirmOwner();
            const latest = await getDoc(reference);
            requireOwner();
            latestRevision = latest.exists() ? decodeOwnerWorkspace(latest.data()).revision : 0;
          } catch { /* A denied/unavailable/corrupt read proves no conflict. */ }
          if (latestRevision !== undefined && Number.isSafeInteger(expectedRevision) && latestRevision !== expectedRevision) throw cloudError(new OwnerStorageError("conflict", "Another device changed this workspace during publication."), "write");
        }
        throw cloudError(error, "write");
      }
    },
    dispose() { disposed = true; for (const cleanup of [...cleanups]) cleanup(); cleanups.clear(); },
  };
}
