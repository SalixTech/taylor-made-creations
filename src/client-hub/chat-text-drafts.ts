/** Local-device text only. Identity is supplied by the verified transport, never a URL. */
export type ChatAttempt = { operationId: string; body: string; createdAt: string; state: "pending" | "failed" };
export type ChatTextDraft = { draftId: string; message: string; attempt: ChatAttempt | null };
export type VerifiedChatDraftScope = { key: string; assertCurrent: () => void; baseline?: string | null };
export const CHAT_DRAFT_PREFIX = "tmc-maker-chat-text-v1:";
const MAX_RECORDS = 60, MAX_AGE = 90 * 86400000;
export function decodeChatDraft(raw: string, now = Date.now()): ChatTextDraft {
  if (raw.length > 18000) throw new Error("Draft exceeds the local text limit.");
  const x = JSON.parse(raw);
  if (x?.version !== 1 || typeof x.draftId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(x.draftId) || !Number.isFinite(x.updatedAt) || x.updatedAt > now + 60000 || now - x.updatedAt > MAX_AGE || typeof x.message !== "string" || x.message.length > 4000) throw new Error("Saved chat draft could not be verified.");
  let attempt: ChatAttempt | null = null;
  if (x.attempt !== null) {
    const a = x.attempt;
    if (!a || typeof a.operationId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(a.operationId) || typeof a.body !== "string" || !a.body.trim() || a.body.length > 4000 || typeof a.createdAt !== "string" || !Number.isFinite(Date.parse(a.createdAt)) || !["pending", "failed"].includes(a.state) || x.message.trim() !== a.body || x.draftId !== a.operationId) throw new Error("Saved send attempt could not be verified.");
    attempt = { operationId: a.operationId, body: a.body, createdAt: a.createdAt, state: "failed" };
  }
  return { draftId: x.draftId, message: x.message, attempt };
}
export function readChatDraft(storage: Storage, scope: VerifiedChatDraftScope): ChatTextDraft | null {
  scope.assertCurrent(); const raw = storage.getItem(scope.key); scope.baseline = raw; if (raw === null) return null;
  const value = decodeChatDraft(raw); scope.assertCurrent(); return value;
}
export function writeChatDraft(storage: Storage, scope: VerifiedChatDraftScope, value: ChatTextDraft): void {
  scope.assertCurrent();
  if (scope.baseline === undefined || storage.getItem(scope.key) !== scope.baseline) throw new Error("This chat draft changed in another window. Your text is still here.");
  if (!value.message && !value.attempt) { storage.removeItem(scope.key); scope.baseline = null; return; }
  const raw = JSON.stringify({ version: 1, updatedAt: Date.now(), draftId: value.draftId, message: value.message, attempt: value.attempt });
  decodeChatDraft(raw);
  if (storage.getItem(scope.key) === null) {
    let count = 0;
    for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(CHAT_DRAFT_PREFIX)) count++;
    // Never evict another commission's foreground/uncertain draft to make space.
    if (count >= MAX_RECORDS) throw new Error("Local chat draft storage is full. Keep this tab open and send or clear an older draft first.");
  }
  storage.setItem(scope.key, raw); scope.assertCurrent();
  if (storage.getItem(scope.key) !== raw) throw new Error("This browser did not retain your chat draft.");
  scope.baseline = raw;
}

/** Explicit logout/revocation removes only this verified role/UID's local text. */
export function clearAccountChatDrafts(storage: Storage, role: "owner" | "client", uid: string): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (!key?.startsWith(CHAT_DRAFT_PREFIX)) continue;
    try { const identity = JSON.parse(decodeURIComponent(key.slice(CHAT_DRAFT_PREFIX.length))); if (Array.isArray(identity) && identity[0] === role && identity[1] === uid) keys.push(key); } catch { /* Unrecognized records never grant access. */ }
  }
  for (const key of keys) storage.removeItem(key);
}
