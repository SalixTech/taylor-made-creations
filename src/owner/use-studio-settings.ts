"use client";
import { useSyncExternalStore } from "react";
import { connectStudioSettings, type StudioSettings, type StudioSettingsPatch, type StudioSettingsSession } from "./studio-settings-client";
type Attempt = { operationId: string; expectedRevision: number; patch: StudioSettingsPatch; resetUpdateRequestCooldown?: true };
type State = { settings: StudioSettings | null; loading: boolean; busy: boolean; error: string; retry: boolean };
const initial: State = { settings: null, loading: true, busy: false, error: "", retry: false };
let confirmedSettings: StudioSettings | null = null;
let state = initial, session: StudioSettingsSession | null = null, attempt: Attempt | null = null, generation = 0;
const listeners = new Set<() => void>();
function optimisticSettings() {
  return confirmedSettings && attempt && state.busy && confirmedSettings.revision === attempt.expectedRevision && typeof attempt.patch.whimsyEnabled === "boolean" ? { ...confirmedSettings, whimsyEnabled: attempt.patch.whimsyEnabled } : confirmedSettings;
}
function publish(next: State) { state = next; listeners.forEach(listener => listener()); }
function start() {
  const run = ++generation; let failed = false; session?.close(); session = null; attempt = null; confirmedSettings = null; publish(initial);
  void connectStudioSettings(value => { if (run !== generation || !listeners.size) return; if (!confirmedSettings || value.revision >= confirmedSettings.revision) confirmedSettings = value; publish({ ...state, settings: optimisticSettings(), loading: false }); }, () => {
    if (run !== generation) return; failed = true; session?.close(); session = null; attempt = null; publish({ settings: null, loading: false, busy: false, retry: false, error: "Account preferences could not connect. Check your owner session and deployed settings functions/rules, then refresh." });
  }).then(connection => { if (failed || run !== generation || !listeners.size) connection.close(); else session = connection; }).catch(() => { if (run === generation) publish({ settings: null, loading: false, busy: false, retry: false, error: "Account preferences could not connect. Sign in again or refresh." }); });
}
function subscribe(listener: () => void) {
  listeners.add(listener); if (listeners.size === 1) start();
  return () => { listeners.delete(listener); if (!listeners.size) { ++generation; session?.close(); session = null; attempt = null; confirmedSettings = null; state = initial; } };
}
export function useStudioSettings() { return useSyncExternalStore(subscribe, () => state, () => initial); }
export function readStudioSettings() { return state.settings; }
export function refreshStudioSettings() { if (!state.busy && listeners.size) start(); }
export async function saveStudioSettings(patch: StudioSettingsPatch, resetUpdateRequestCooldown = false, expectedRevision?: number): Promise<boolean> {
  if (state.busy || state.retry || !session || !state.settings) return false;
  const snapshot = structuredClone(patch);
  try { session.assertCurrent(); } catch { session.close(); session = null; attempt = null; publish({ settings: null, loading: false, busy: false, retry: false, error: "Your owner session changed. Sign in again before saving preferences." }); return false; }
  attempt = { operationId: crypto.randomUUID(), expectedRevision: expectedRevision ?? state.settings.revision, patch: snapshot, ...(resetUpdateRequestCooldown ? { resetUpdateRequestCooldown: true } : {}) };
  return runAttempt();
}
export async function retryStudioSettings() { if (!state.busy && attempt && session) return runAttempt(); return false; }
async function runAttempt(): Promise<boolean> {
  const captured = attempt, current = session, run = generation;
  if (!captured || !current) return false;
  publish({ ...state, busy: true, error: "", retry: false });
  publish({ ...state, settings: optimisticSettings() });
  try {
    current.assertCurrent(); const result = await current.save(captured); current.assertCurrent();
    if (run !== generation || session !== current || attempt !== captured) return false;
    attempt = null; if (!confirmedSettings || result.revision >= confirmedSettings.revision) confirmedSettings = result; publish({ settings: confirmedSettings, loading: false, busy: false, error: "", retry: false }); return true;
  } catch (error) {
    if (run !== generation || session !== current || attempt !== captured) return false;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const conflict = /(?:^|\/)aborted$/.test(code);
    if (conflict) attempt = null;
    publish({ ...state, settings: confirmedSettings, busy: false, retry: !conflict, error: conflict ? "Account preferences changed on another device. Refresh before applying your change again." : "This preference save was not confirmed. Retry the same change or refresh the account state before continuing." }); return false;
  }
}
