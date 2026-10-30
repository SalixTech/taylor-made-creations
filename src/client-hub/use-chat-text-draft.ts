"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { readChatDraft, writeChatDraft, type ChatAttempt, type ChatTextDraft, type VerifiedChatDraftScope } from "./chat-text-drafts";
import { verifiedHubChatDraftScope } from "./workspace-client";
import type { ClientHubProject } from "./model";
const emptyDraft = (): ChatTextDraft => ({ draftId: crypto.randomUUID(), message: "", attempt: null });
export function useChatTextDraft(project: ClientHubProject, owner: boolean) {
  const [value, setValue] = useState<ChatTextDraft>(emptyDraft);
  const current = useRef(value), scope = useRef<VerifiedChatDraftScope | null>(null), revoked = useRef(false);
  const [retry, setRetry] = useState(0);
  const [durable, setDurable] = useState(false), [problem, setProblem] = useState("");
  const persist = useCallback((next: ChatTextDraft) => {
    current.current = next; setValue(next);
    try { if (!scope.current || revoked.current) throw new Error("Chat draft storage is not ready."); writeChatDraft(window.localStorage, scope.current, next); setDurable(true); setProblem(""); return true; }
    catch { setDurable(false); setProblem("Your unsent message is only in this tab. Sending is paused until browser draft storage is available, so an unconfirmed message cannot be duplicated after refresh."); return false; }
  }, []);
  const clearRevoked = useCallback(() => {
    revoked.current = true;
    try { if (scope.current) window.localStorage.removeItem(scope.current.key); } catch { /* Logout generation prevents this record being restored. */ }
    scope.current = null; current.current = emptyDraft(); setValue(current.current); setDurable(false);
  }, []);
  useEffect(() => {
    let active = true; revoked.current = false;
    void Promise.resolve().then(() => verifiedHubChatDraftScope(project, owner)).then(verified => {
      if (!active || revoked.current) return;
      const saved = readChatDraft(window.localStorage, verified); scope.current = verified;
      if (current.current.message || current.current.attempt) {
        // A person already typing wins; never replace foreground text on a slow identity read.
        if (saved && (saved.message !== current.current.message || saved.attempt && saved.attempt.operationId !== current.current.attempt?.operationId)) { setProblem("A saved chat draft also exists. Keep this tab open; your current text has not replaced it."); setDurable(false); scope.current = null; return; }
        persist(current.current);
      } else { current.current = saved ?? emptyDraft(); setValue(current.current); setDurable(true); setProblem(""); }
    }).catch(() => { if (active) { setDurable(false); setProblem("Browser chat draft storage is unavailable. Keep this tab open to keep unsent text."); } });
    const storageChanged = (event: StorageEvent) => { if (scope.current && event.key === scope.current.key && event.newValue !== scope.current.baseline) { setDurable(false); setProblem("This chat draft changed in another window. Your text is still here; keep this tab open before resolving it."); } };
    const locked = () => { try { scope.current?.assertCurrent(); } catch { clearRevoked(); } };
    window.addEventListener("storage", storageChanged); window.addEventListener("tmc-hub-session-lock", locked);
    return () => { active = false; scope.current = null; window.removeEventListener("storage", storageChanged); window.removeEventListener("tmc-hub-session-lock", locked); };
    // ProjectWorkspace is keyed by verified session + project by its host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectId, project.clientId, owner, retry]);
  const clear = useCallback(() => persist(emptyDraft()), [persist]);
  return { retry: () => setRetry(value => value + 1), draftId: value.draftId, message: value.message, attempt: value.attempt, durable, problem, clearRevoked,
    setMessage: (update: SetStateAction<string>) => persist({ ...current.current, draftId: current.current.attempt ? current.current.draftId : crypto.randomUUID(), message: typeof update === "function" ? update(current.current.message) : update }),
    setAttempt: (update: SetStateAction<ChatAttempt | null>) => persist({ ...current.current, attempt: typeof update === "function" ? update(current.current.attempt) : update }),
    clear };
}
