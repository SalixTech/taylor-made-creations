"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DraftRecoveryBranch, discardRecovery, discardUnavailableRecovery, listRecovery, listUnavailableRecovery, readRecoveryRecord, recoveryPrefix, type RecoveryCandidate, type RecoverySession, type UnavailableRecovery } from "./draft-recovery";
import type { OwnerContent } from "./model";
import type { CloudRecoveryPort } from "./cloud-recovery";
import { useCloudDraftRecovery } from "./use-cloud-draft-recovery";

export function useDraftRecovery(session: RecoverySession | undefined, content: OwnerContent | null, revision: number | undefined, dirty: boolean, ready: boolean, cloudPort?: CloudRecoveryPort) {
  const projectId = session?.projectId, ownerUid = session?.ownerUid, assertCurrent = session?.assertCurrent;
  const identity = useMemo(() => projectId && ownerUid && assertCurrent ? { projectId, ownerUid, assertCurrent } : undefined, [projectId, ownerUid, assertCurrent]);
  const cloud = useCloudDraftRecovery(cloudPort, identity, content, revision, dirty, ready);
  const branch = useRef<DraftRecoveryBranch | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const latest = useRef({ content, revision, dirty, ready });
  const [status, setStatus] = useState("Browser recovery starts after owner sign-in.");
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableRecovery[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const cancelTimer = useCallback(() => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } }, []);
  const refresh = useCallback(() => {
    if (stopped.current || !identity || !branch.current) return;
    try { identity.assertCurrent(); setUnavailable(listUnavailableRecovery(window.localStorage, identity)); setCandidates(listRecovery(window.localStorage, identity).filter(item => item.key !== branch.current?.key)); }
    catch { setProblem("Browser recovery storage is unavailable. Your cloud draft and current edits are unchanged."); }
  }, [identity]);
  useEffect(() => {
    if (stopped.current || !identity || !ready) return;
    let active = true;
    void Promise.resolve().then(() => {
    if (!active || stopped.current) return;
    try {
      identity.assertCurrent();
      branch.current = new DraftRecoveryBranch(window.localStorage, identity, crypto.randomUUID());
      branch.current.protectActive();
      setStatus("Browser-local recovery ready. Cloud save is separate."); refresh();
    } catch { setProblem("Browser recovery is unavailable. Use Save as Draft before leaving this tab."); }
    });
    const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(recoveryPrefix(identity))) refresh(); };
    const renew = () => { try { identity.assertCurrent(); branch.current?.refreshProtection(); } catch { /* Checkpoint still reports any persistence failure; never discard current edits. */ } };
    const leaseTimer = typeof window.setInterval === "function" ? window.setInterval(renew, 60_000) : null;
    window.addEventListener("focus", renew);
    window.addEventListener("storage", storageChanged);
    return () => { active = false; if (leaseTimer !== null) window.clearInterval(leaseTimer); window.removeEventListener("focus", renew); cancelTimer(); branch.current?.dispose(); branch.current = null; window.removeEventListener("storage", storageChanged); };
  }, [identity, ready, cancelTimer, refresh]);
  const flush = useCallback((): boolean => {
    cancelTimer();
    if (stopped.current) return false;
    const current = latest.current;
    if (!current.dirty) return true;
    if (!branch.current || !current.ready || !current.content || current.revision === undefined) return false;
    try {
      identity?.assertCurrent();
      const saved = branch.current.checkpoint(current.content, current.revision);
      setStatus(`Recovery saved locally · ${new Date(saved.record.updatedAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`);
      setProblem(null); return true;
    } catch (error) { setProblem(error instanceof Error ? error.message : "Browser recovery failed. Save as Draft before leaving."); return false; }
  }, [cancelTimer, identity]);
  useEffect(() => {
    latest.current = { content, revision, dirty, ready }; cancelTimer();
    if (stopped.current || !identity || !ready) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || stopped.current || !branch.current) return;
      if (dirty) { setStatus("Saving browser-local recovery…"); timer.current = setTimeout(flush, 650); }
      else { try { branch.current.clear(); setStatus("Cloud draft is current. No unsaved recovery needed."); setProblem(null); } catch { setProblem("The browser could not clear the old recovery copy. Your cloud draft is current; review local storage before leaving a shared device."); } }
    });
    return () => { active = false; cancelTimer(); };
  }, [identity, content, revision, dirty, ready, flush, cancelTimer]);
  const stop = useCallback(() => { stopped.current = true; cancelTimer(); try { branch.current?.dispose(true); } catch { /* Sign-out must still lock auth even if the browser denies storage cleanup. */ } finally { branch.current = null; } }, [cancelTimer]);
  const restore = useCallback((candidate: RecoveryCandidate): OwnerContent => {
    if (stopped.current || !identity || !branch.current || candidate.key !== recoveryPrefix(identity) + candidate.record.branch) throw new Error("Owner recovery is locked.");
    identity.assertCurrent();
    const raw = window.localStorage.getItem(candidate.key);
    if (raw !== candidate.raw) throw new Error("This recovery changed in another tab. Reopen the recovery list.");
    const record = readRecoveryRecord(raw);
    if (!record) throw new Error("This recovery copy is no longer eligible. Your current work is unchanged.");
    return structuredClone(record.content);
  }, [identity]);
  const discard = useCallback((candidate: RecoveryCandidate) => {
    if (stopped.current || !identity || !branch.current) throw new Error("Owner recovery is locked.");
    identity.assertCurrent(); discardRecovery(window.localStorage, identity, candidate); refresh();
  }, [identity, refresh]);
  const clearUnavailable = useCallback(() => {
    if (stopped.current || !identity || !branch.current) throw new Error("Owner recovery is locked.");
    identity.assertCurrent(); discardUnavailableRecovery(window.localStorage, identity, unavailable); refresh();
  }, [identity, unavailable, refresh]);
  return { status, problem, candidates, unavailable, clearUnavailable, refresh, flush, stop, restore, discard, cloud };
}
