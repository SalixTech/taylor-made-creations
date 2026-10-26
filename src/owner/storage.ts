import { createDefaultOwnerContent, createInitialOwnerWorkspace } from "./defaults";
import { assertOwnerContent, assertOwnerWorkspace, assertOwnerNamedDraft, assertOwnerDraftId, normalizeOwnerDraftName, namedDraftSummary, newOwnerId, MAX_NAMED_DRAFTS, OwnerValidationError } from "./model";
import type { OwnerContent, OwnerPremade, OwnerWorkspace, OwnerNamedDraft, OwnerNamedDraftSummary, SaveNamedDraftOptions } from "./model";

export const OWNER_STORAGE_EVENT = "tmc-owner-workspace-changed";
export const OWNER_DATABASE_NAME = "tmc-owner-local-preview-v1";
const OBJECT_STORE = "workspaces";
const WORKSPACE_KEY = "owner";

export class OwnerStorageError extends Error {
  readonly code: "unavailable" | "blocked" | "read" | "write" | "corrupt" | "conflict" | "limit" | "not-found" | "not-published";
  constructor(code: OwnerStorageError["code"], message: string, options?: ErrorOptions) {
    super(message, options); this.name = "OwnerStorageError"; this.code = code;
  }
}

/**
 * Persistence port for a future authenticated Firebase adapter.
 * `update` MUST be atomic (including the revision check) and MUST reject unless
 * the write committed. A live adapter also needs server-enforced owner auth;
 * this browser-local adapter is not an authentication or publishing system.
 */
export interface NamedDraftStorageAdapter {
  readTrashed?(): Promise<unknown[]>;
  readTrashedDraft?(id: string): Promise<unknown | null>;
  read(): Promise<unknown[]>;
  /** Atomically read the complete registry, apply the transform and persist only
   * changedDraftId. Cloud adapters MUST keep content in separate private docs. */
  update(transform: (current: unknown[]) => { drafts: OwnerNamedDraft[]; changedDraftId: string }): Promise<OwnerNamedDraft[]>;
}
export interface OwnerStorageAdapter {
  namedDrafts?: NamedDraftStorageAdapter;
  read(): Promise<unknown | null>;
  update(transform: (current: unknown | null) => OwnerWorkspace): Promise<OwnerWorkspace>;
  subscribe?(callback: () => void): () => void;
}
export interface OwnerStore {
  load(): Promise<OwnerWorkspace>;
  listNamedDrafts(): Promise<OwnerNamedDraftSummary[]>;
  listTrashedNamedDrafts(): Promise<OwnerNamedDraftSummary[]>;
  /** Restores as a new independent draft; immutable archived original is retained. */
  restoreNamedDraft(id: string, name?: string): Promise<OwnerNamedDraft>;
  /** Read only: loading never changes the working draft or publishes content. */
  loadNamedDraft(id: string): Promise<OwnerNamedDraft>;
  saveNamedDraft(name: string, content: OwnerContent, options?: SaveNamedDraftOptions): Promise<OwnerNamedDraft>;
  renameNamedDraft(id: string, name: string, expectedRevision: number): Promise<OwnerNamedDraft>;
  deleteNamedDraft(id: string, expectedRevision: number): Promise<void>;
  saveDraft(content: OwnerContent, expectedRevision: number): Promise<OwnerWorkspace>;
  publishLocal(expectedRevision: number): Promise<OwnerWorkspace>;
  /** Explicitly save + publish to the new site. Never supplied by local-only stores. */
  publishLive?(content: OwnerContent | undefined, expectedRevision: number): Promise<OwnerWorkspace>;
  /** Save and publish only this selected listing. Requires an existing publication.
   * Never changes other draft fields, other products, navigation or shop visibility. */
  publishPremadeLive?(item: OwnerPremade, expectedRevision: number): Promise<OwnerWorkspace>;
  /** Actual current public flag; null means the site has never been published. */
  readLiveShopVisibility?(): Promise<boolean | null>;
  /** Changes only an already-published shop flag, never publishes draft edits. */
  updateLiveShopVisibility?(showPremades: boolean, expectedRevision: number): Promise<OwnerWorkspace>;
  /** Discards draft edits, returning to the last local preview, or baseline if none. */
  resetDraft(expectedRevision: number): Promise<OwnerWorkspace>;
  subscribe(callback: () => void): () => void;
}
function readWorkspace(raw: unknown | null): OwnerWorkspace {
  if (raw === null || raw === undefined) return createInitialOwnerWorkspace();
  try { assertOwnerWorkspace(raw); return structuredClone(raw); }
  catch (error) { throw new OwnerStorageError("corrupt", "The saved workspace could not be read safely. It has not been overwritten. Keep this browser’s data and contact your site developer before resetting it.", { cause: error }); }
}
function writeError(error: unknown): Error {
  if (error instanceof OwnerStorageError || error instanceof OwnerValidationError) return error;
  return new OwnerStorageError("write", "Your changes were not saved. Browser storage may be full or unavailable. Keep this page open, reduce photo sizes if needed, and try again.", { cause: error });
}
function readNamedDrafts(raw: unknown[], archived = false): OwnerNamedDraft[] {
  try {
    if (!Array.isArray(raw) || (!archived && raw.length > MAX_NAMED_DRAFTS)) throw new Error("Invalid draft registry.");
    const ids = new Set<string>(), names = new Set<string>();
    for (const draft of raw) {
      assertOwnerNamedDraft(draft);
      const name = draft.name.toLocaleLowerCase("en-US");
      if (ids.has(draft.id) || (!archived && names.has(name))) throw new Error("Duplicate draft identifiers or names.");
      ids.add(draft.id); names.add(name);
    }
    return structuredClone(raw) as OwnerNamedDraft[];
  } catch (cause) { throw new OwnerStorageError("corrupt", "Saved drafts could not be read safely. They have not been overwritten.", { cause }); }
}
function createNamedDraftMethods(adapter?: NamedDraftStorageAdapter): Pick<OwnerStore, "listNamedDrafts" | "loadNamedDraft" | "saveNamedDraft" | "renameNamedDraft" | "deleteNamedDraft" | "listTrashedNamedDrafts" | "restoreNamedDraft"> {
  const available = () => {
    if (!adapter) throw new OwnerStorageError("unavailable", "Named drafts are unavailable in this storage adapter. Your working draft has not changed.");
    return adapter;
  };
  const read = async () => {
    try { return readNamedDrafts(await available().read()); }
    catch (cause) { if (cause instanceof OwnerStorageError) throw cause; throw new OwnerStorageError("read", "Saved drafts could not be loaded. Nothing has been reset.", { cause }); }
  };
  const change = async (id: string, expectedRevision: number | undefined, transform: (draft: OwnerNamedDraft | undefined, all: OwnerNamedDraft[]) => OwnerNamedDraft | null): Promise<OwnerNamedDraft | null> => {
    try {
      const drafts = await available().update(raw => {
        const all = readNamedDrafts(raw), previous = all.find(draft => draft.id === id);
        if (expectedRevision === undefined ? !!previous : !Number.isSafeInteger(expectedRevision) || !previous || previous.revision !== expectedRevision) throw new OwnerStorageError("conflict", "This saved draft changed or was deleted on another tab or device. Reload the draft list before trying again; your current edits have not been overwritten.");
        const next = transform(previous, all);
        if (next) {
          assertOwnerNamedDraft(next);
          if (all.some(draft => draft.id !== id && draft.name.toLocaleLowerCase("en-US") === next.name.toLocaleLowerCase("en-US"))) throw new OwnerValidationError([{ path: "draft.name", message: "Another saved draft already has this name. Choose a different name." }]);
        }
        const drafts = all.filter(draft => draft.id !== id);
        if (next) drafts.push(next);
        if (drafts.length > MAX_NAMED_DRAFTS) throw new OwnerStorageError("limit", "You can save up to 10 named drafts. Archive a saved draft or update an existing one first.");
        return { drafts, changedDraftId: id };
      });
      return structuredClone(drafts.find(draft => draft.id === id) ?? null);
    } catch (error) { throw writeError(error); }
  };
  return {
    async listTrashedNamedDrafts() {
      const storage = available();
      if (!storage.readTrashed) return [];
      return readNamedDrafts(await storage.readTrashed(), true).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(namedDraftSummary);
    },
    async restoreNamedDraft(id, name) {
      assertOwnerDraftId(id);
      const storage = available();
      if (!storage.readTrashedDraft) throw new OwnerStorageError("unavailable", "Archived drafts are unavailable in this storage adapter.");
      const raw = await storage.readTrashedDraft(id);
      if (!raw) throw new OwnerStorageError("not-found", "This archived draft could not be found. Nothing has been changed.");
      const archived = readNamedDrafts([raw], true)[0];
      return this.saveNamedDraft(name ?? archived.name, archived.content);
    },
    async listNamedDrafts() { return (await read()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)).map(namedDraftSummary); },
    async loadNamedDraft(id) {
      assertOwnerDraftId(id);
      const draft = (await read()).find(draft => draft.id === id);
      if (!draft) throw new OwnerStorageError("not-found", "This saved draft no longer exists. Reload the saved draft list.");
      return draft;
    },
    async saveNamedDraft(name, content, options = {}) {
      const normalizedName = normalizeOwnerDraftName(name);
      assertOwnerContent(content);
      const snapshot = structuredClone(content);
      const id = options.id ?? newOwnerId("draft");
      assertOwnerDraftId(id);
      if (options.id !== undefined && (!Number.isSafeInteger(options.expectedRevision) || (options.expectedRevision ?? 0) < 1) || options.id === undefined && options.expectedRevision !== undefined) throw new OwnerValidationError([{ path: "draft.revision", message: "Select the saved draft and its latest revision before replacing it." }]);
      return (await change(id, options.expectedRevision, previous => {
        const now = new Date().toISOString();
        return { id, name: normalizedName, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, content: snapshot };
      }))!;
    },
    async renameNamedDraft(id, name, expectedRevision) {
      assertOwnerDraftId(id); const normalizedName = normalizeOwnerDraftName(name);
      return (await change(id, expectedRevision, previous => ({ ...previous!, name: normalizedName, revision: previous!.revision + 1, updatedAt: new Date().toISOString() })))!;
    },
    async deleteNamedDraft(id, expectedRevision) { assertOwnerDraftId(id); await change(id, expectedRevision, () => null); },
  };
}
export function createOwnerStore(adapter: OwnerStorageAdapter): OwnerStore {
  const change = async (expectedRevision: number, transform: (state: OwnerWorkspace) => OwnerWorkspace): Promise<OwnerWorkspace> => {
    try {
      return await adapter.update(raw => {
        const current = readWorkspace(raw);
        if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new OwnerStorageError("conflict", "This workspace changed in another tab. Your current edits are still on screen. Reload the saved workspace before saving again.");
        const next = { ...transform(current), revision: current.revision + 1, updatedAt: new Date().toISOString() };
        assertOwnerWorkspace(next);
        return structuredClone(next);
      });
    } catch (error) { throw writeError(error); }
  };
  return {
    ...createNamedDraftMethods(adapter.namedDrafts),
    async load() {
      try { return readWorkspace(await adapter.read()); }
      catch (error) {
        if (error instanceof OwnerStorageError) throw error;
        throw new OwnerStorageError("read", "The saved workspace could not be loaded. Browser storage may be disabled. Nothing has been reset or overwritten.", { cause: error });
      }
    },
    async saveDraft(content, expectedRevision) {
      assertOwnerContent(content);
      // Snapshot immediately, before an awaited transaction can race with form edits.
      const draft = structuredClone(content);
      return change(expectedRevision, state => ({ ...state, draft }));
    },
    async publishLocal(expectedRevision) {
      return change(expectedRevision, state => ({ ...state, localPublished: { content: structuredClone(state.draft), publishedAt: new Date().toISOString() } }));
    },
    async resetDraft(expectedRevision) {
      return change(expectedRevision, state => ({ ...state, draft: state.localPublished ? structuredClone(state.localPublished.content) : createDefaultOwnerContent() }));
    },
    subscribe(callback) { return adapter.subscribe?.(callback) ?? (() => {}); },
  };
}

function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new OwnerStorageError("unavailable", "Browser storage is unavailable. Your changes cannot be saved in this browser. Enable browser storage or use a normal, non-private window.")); return; }
    let settled = false;
    let request: IDBOpenDBRequest;
    try { request = factory.open(OWNER_DATABASE_NAME, 1); }
    catch (error) { reject(new OwnerStorageError("unavailable", "Browser storage could not be opened. No changes have been saved.", { cause: error })); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { if (!settled) { settled = true; reject(new OwnerStorageError("unavailable", "Browser storage could not be opened. No changes have been saved.", { cause: request.error })); } };
    request.onblocked = () => { if (!settled) { settled = true; reject(new OwnerStorageError("blocked", "Another tab is blocking this workspace. Close older owner-portal tabs, then try again. No changes have been saved.")); } };
  });
}
function notifyBrowser(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OWNER_STORAGE_EVENT));
  // Notifications are advisory: a notification failure must not turn a committed
  // write into a reported failure, or cause the owner to repeat a successful save.
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(OWNER_STORAGE_EVENT);
      channel.postMessage({ changed: true }); channel.close();
    }
  } catch { /* Storage commit already succeeded; reloading still reads it. */ }
}
export function createIndexedDBOwnerAdapter(factory?: IDBFactory): OwnerStorageAdapter {
  const getFactory = () => factory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  const namedTransaction = async (transform?: (current: unknown[]) => { drafts: OwnerNamedDraft[]; changedDraftId: string }, key = "named-drafts"): Promise<unknown[]> => {
    const db = await openDatabase(getFactory());
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = db.transaction(OBJECT_STORE, transform ? "readwrite" : "readonly"); }
      catch (error) { db.close(); reject(error); return; }
      const store = transaction.objectStore(OBJECT_STORE);
      const request = store.get(key);
      let result: unknown[] = [], transformError: unknown;
      request.onsuccess = () => {
        try {
          result = request.result ?? [];
          if (transform) {
            const previous = result;
            const next = transform(previous);
            result = next.drafts;
            const removed = previous.find(value => (value as OwnerNamedDraft).id === next.changedDraftId);
            if (removed && !next.drafts.some(draft => draft.id === next.changedDraftId)) {
              const archiveRequest = store.get("archived-drafts");
              archiveRequest.onsuccess = () => {
                try {
                  const archived = readNamedDrafts(archiveRequest.result ?? [], true);
                  if (archived.some(draft => draft.id === next.changedDraftId)) throw new OwnerStorageError("conflict", "This draft was already archived.");
                  archived.push(removed as OwnerNamedDraft);
                  store.put(archived, "archived-drafts"); store.put(result, "named-drafts");
                } catch (error) { transformError = error; transaction.abort(); }
              };
            } else store.put(result, "named-drafts");
          }
        } catch (error) { transformError = error; transaction.abort(); }
      };
      transaction.oncomplete = () => { db.close(); if (transform) notifyBrowser(); resolve(structuredClone(result)); };
      transaction.onabort = () => { db.close(); reject(transformError ?? transaction.error ?? new Error("Saved draft transaction aborted.")); };
      transaction.onerror = () => { /* Resolve only after commit. */ };
    });
  };
  return {
    namedDrafts: {
      readTrashed: () => namedTransaction(undefined, "archived-drafts"),
      readTrashedDraft: async id => (await namedTransaction(undefined, "archived-drafts")).find(value => (value as OwnerNamedDraft).id === id) ?? null,
      read: () => namedTransaction(),
      update: async transform => await namedTransaction(transform) as OwnerNamedDraft[],
    },
    async read() {
      const db = await openDatabase(getFactory());
      return new Promise((resolve, reject) => {
        let transaction: IDBTransaction;
        try { transaction = db.transaction(OBJECT_STORE, "readonly"); }
        catch (error) { db.close(); reject(error); return; }
        let result: unknown | null = null;
        const request = transaction.objectStore(OBJECT_STORE).get(WORKSPACE_KEY);
        request.onsuccess = () => { result = request.result ?? null; };
        transaction.oncomplete = () => { db.close(); resolve(result); };
        transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Storage read aborted.")); };
        transaction.onerror = () => { /* onabort reports the failed transaction. */ };
      });
    },
    async update(transform) {
      const db = await openDatabase(getFactory());
      return new Promise((resolve, reject) => {
        let transaction: IDBTransaction;
        try { transaction = db.transaction(OBJECT_STORE, "readwrite"); }
        catch (error) { db.close(); reject(error); return; }
        const store = transaction.objectStore(OBJECT_STORE);
        let result: OwnerWorkspace | undefined;
        let transformError: unknown;
        const request = store.get(WORKSPACE_KEY);
        request.onsuccess = () => {
          try { result = transform(request.result ?? null); store.put(result, WORKSPACE_KEY); }
          catch (error) { transformError = error; transaction.abort(); }
        };
        transaction.oncomplete = () => {
          db.close();
          if (!result) { reject(new OwnerStorageError("write", "The browser did not confirm this save. Your changes have not been marked as saved.")); return; }
          notifyBrowser(); resolve(structuredClone(result));
        };
        transaction.onabort = () => { db.close(); reject(transformError ?? transaction.error ?? new Error("Storage write aborted.")); };
        transaction.onerror = () => { /* Never resolve until oncomplete; quota errors abort. */ };
      });
    },
    subscribe(callback) {
      if (typeof window === "undefined") return () => {};
      window.addEventListener(OWNER_STORAGE_EVENT, callback);
      let channel: BroadcastChannel | undefined;
      try {
        if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel(OWNER_STORAGE_EVENT); channel.onmessage = callback; }
      } catch { /* In-tab events and manual reload remain available. */ }
      return () => { window.removeEventListener(OWNER_STORAGE_EVENT, callback); channel?.close(); };
    },
  };
}
export function createBrowserOwnerStore(): OwnerStore { return createOwnerStore(createIndexedDBOwnerAdapter()); }
