"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OwnerContent } from './model';
import type { RecoverySession } from './draft-recovery';
import type { CloudRecoveryEntry, CloudRecoveryPort } from './cloud-recovery';
export const CLOUD_RECOVERY_DEBOUNCE_MS = 3000;
export const CLOUD_RECOVERY_MIN_INTERVAL_MS = 300000;
type CheckpointInput = Parameters<CloudRecoveryPort['checkpointDraft']>[0];
/** Quiet-period cloud snapshots are independent of the continuous local fallback.
 * Listing and restoring never save the workspace or publish. */
export function useCloudDraftRecovery(port: CloudRecoveryPort | undefined, session: RecoverySession | undefined, content: OwnerContent | null, revision: number | undefined, dirty: boolean, ready: boolean) {
  const [entries, setEntries] = useState<CloudRecoveryEntry[]>([]), [status, setStatus] = useState('Cloud recovery waits for your next edit.'), [checkpointProblem, setCheckpointProblem] = useState<string | null>(null), [listProblem, setListProblem] = useState<string | null>(null), [pending, setPending] = useState(false);
  const active = useRef(true), stopped = useRef(false), branch = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), lastSuccess = useRef(0), inFlight = useRef(false);
  const latest = useRef({ content, revision, dirty, ready }), generation = useRef(0), listRequest = useRef(0), attempted = useRef<{ content: OwnerContent; revision: number } | null>(null), pendingAttempt = useRef<CheckpointInput | null>(null);
  useLayoutEffect(() => { latest.current = { content, revision, dirty, ready }; }, [content, revision, dirty, ready]);
  const cancel = useCallback(() => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } }, []);
  const assertCurrent = useCallback(() => { if (stopped.current || !active.current || !port || !session) throw new Error('Cloud recovery is locked. Sign in again.'); session.assertCurrent(); }, [port, session]);
  useEffect(() => {
    // stop() can run before passive mount effects. It is permanent for this
    // mounted owner session, including StrictMode setup/cleanup replay.
    if (stopped.current) return;
    active.current = true; const epoch = generation;
    return () => { active.current = false; epoch.current++; cancel(); };
  }, [cancel]);
  const refresh = useCallback(async () => {
    if (!port) return; const request = generation.current, sequence = ++listRequest.current;
    try { assertCurrent(); const values = await port.listRecovery(); assertCurrent(); if (request !== generation.current || sequence !== listRequest.current) return; setEntries(values); setListProblem(null); }
    catch (error) { if (active.current && request === generation.current && sequence === listRequest.current) setListProblem(error instanceof Error ? error.message : 'Cloud recovery could not be loaded. Try again.'); }
  }, [port, assertCurrent]);
  const performCheckpoint = useCallback(async (value: OwnerContent, expectedRevision: number, saved = false, retry = false) => {
    cancel(); if (!port || stopped.current || !active.current || inFlight.current && !saved) return;
    if (saved) generation.current++;
    const request = generation.current;
    // A manual retry reconciles the retained operation, not newer unsaved edits.
    // Mark the current editor version as observed to avoid an automatic retry
    // storm if that reconciliation fails without any subsequent edit.
    attempted.current = retry && latest.current.content && latest.current.revision !== undefined ? { content: latest.current.content, revision: latest.current.revision } : { content: value, revision: expectedRevision };
    inFlight.current = true; setPending(true);
    try {
      assertCurrent(); branch.current ??= crypto.randomUUID();
      // Retain the exact uncertain attempt for retry, even if the saved cloud
      // revision advanced. Editing different content explicitly starts a new one.
      if (saved || !pendingAttempt.current || JSON.stringify(pendingAttempt.current.content) !== JSON.stringify(value)) pendingAttempt.current = { operationId: crypto.randomUUID(), branchId: branch.current, expectedRevision, content: structuredClone(value), ...(saved ? { reason: 'saved-draft' as const } : {}) };
      const attempt = pendingAttempt.current;
      setStatus(attempt.reason === 'saved-draft' ? 'Draft saved; recovery copy pending.' : 'Saving cloud recovery…'); setCheckpointProblem(null);
      const entry = await port.checkpointDraft(attempt); assertCurrent(); if (request !== generation.current) return;
      if (pendingAttempt.current === attempt) pendingAttempt.current = null;
      if (retry && latest.current.dirty && JSON.stringify(latest.current.content) !== JSON.stringify(attempt.content)) attempted.current = null;
      // A list requested before this acknowledgment cannot replace the newly
      // confirmed entry with an older snapshot that did not include it yet.
      listRequest.current++;
      lastSuccess.current = Date.now(); setStatus(`Cloud recovery saved · ${new Date(entry.createdAt).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`); setCheckpointProblem(null); setEntries(values => [entry, ...values.filter(value => value.id !== entry.id)]);
    } catch (error) { if (active.current && request === generation.current) { setStatus(pendingAttempt.current?.reason === 'saved-draft' ? 'Draft saved; recovery copy not confirmed.' : 'Cloud recovery not confirmed. Browser-local recovery remains separate.'); setCheckpointProblem(error instanceof Error ? error.message : 'Cloud recovery failed. Keep this page open and retry.'); } }
    finally { if (request === generation.current) { inFlight.current = false; if (active.current) setPending(false); } }
  }, [port, assertCurrent, cancel]);
  const checkpoint = useCallback(async () => {
    const current = latest.current; if (!current.ready) return;
    // Retry always reconciles the exact retained operation, even if the owner
    // has made newer unsaved edits since its acknowledgment was lost.
    const uncertain = pendingAttempt.current;
    if (uncertain) { await performCheckpoint(uncertain.content, uncertain.expectedRevision, false, true); return; }
    if (!current.dirty || !current.content || current.revision === undefined) return;
    await performCheckpoint(current.content, current.revision);
  }, [performCheckpoint]);
  const checkpointSaved = useCallback(async (value: OwnerContent, expectedRevision: number) => { await performCheckpoint(value, expectedRevision, true); }, [performCheckpoint]);
  useEffect(() => {
    cancel();
    if (!port || !session || !ready || !dirty || !content || revision === undefined || stopped.current || !active.current || attempted.current?.content === content && attempted.current.revision === revision) return;
    const delay = Math.max(CLOUD_RECOVERY_DEBOUNCE_MS, CLOUD_RECOVERY_MIN_INTERVAL_MS - (Date.now() - lastSuccess.current));
    timer.current = setTimeout(() => {
      const current = latest.current;
      if (current.ready && current.dirty && current.content && current.revision !== undefined) void performCheckpoint(current.content, current.revision);
    }, delay); return cancel;
  }, [port, session, ready, dirty, content, revision, performCheckpoint, cancel, pending]);
  const acknowledgePublication = useCallback(() => {
    if (stopped.current || !active.current) return;
    // Full publication already committed its private/public recovery snapshots.
    // An older in-flight periodic checkpoint must not replace that success with
    // a stale-revision failure after publication advances the workspace.
    generation.current++; cancel(); pendingAttempt.current = null; inFlight.current = false;
    lastSuccess.current = Date.now(); setPending(false); setCheckpointProblem(null); setStatus('Cloud recovery saved with publication.');
  }, [cancel]);
  const stop = useCallback(() => { stopped.current = true; active.current = false; generation.current++; cancel(); branch.current = null; pendingAttempt.current = null; inFlight.current = false; }, [cancel]);
  const restore = useCallback(async (entry: CloudRecoveryEntry, expectedRevision: number) => {
    if (!port) throw new Error('Cloud recovery is unavailable.'); assertCurrent(); const value = await port.readRecovery(entry.id, expectedRevision); assertCurrent();
    cancel(); branch.current = crypto.randomUUID(); pendingAttempt.current = null; lastSuccess.current = 0; generation.current++; inFlight.current = false; setPending(false); return value;
  }, [port, assertCurrent, cancel]);
  const dismiss = useCallback(async (entry: CloudRecoveryEntry) => { if (!port) throw new Error('Cloud recovery is unavailable.'); assertCurrent(); await port.dismissRecovery(entry.id); assertCurrent(); listRequest.current++; setEntries(values => values.filter(value => value.id !== entry.id)); }, [port, assertCurrent]);
  return { enabled: !!port, status, problem: checkpointProblem ?? listProblem, pending, entries, refresh, checkpoint, checkpointSaved, acknowledgePublication, stop, restore, dismiss };
}
