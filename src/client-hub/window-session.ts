"use client";
import { clearAccountChatDrafts } from "./chat-text-drafts";

/** Non-secret logout generations only. Firebase credentials stay in its existing
 * tab-scoped session persistence; no custom token/code handoff is performed. */
export type HubWindowRole = "owner" | "client";
const scopes = new Map<string, { generation: string; durable: boolean; locked: boolean }>();
const installed = new Set<string>();
const activeUids: Partial<Record<HubWindowRole, string>> = {};
const markerKey = (role: HubWindowRole, uid: string) => `tmc-hub-logout-v1:${role}:${uid}`;
const tabKey = (role: HubWindowRole, uid: string) => `tmc-hub-window-v1:${role}:${uid}`;
function blocked(): Error { return Object.assign(new Error("This window’s sign-in changed. Sign in again before continuing."), { code: "auth/user-token-expired" }); }
function durableGeneration(role: HubWindowRole, uid: string): string { return window.localStorage.getItem(markerKey(role, uid)) ?? "0"; }
function popupGeneration(role: HubWindowRole): string | null {
  if (typeof window === "undefined" || window.location?.pathname !== "/hub-window") return null;
  const query = new URLSearchParams(window.location.search);
  return query.get("role") === role ? query.get("generation") : null;
}
function scope(role: HubWindowRole, uid: string) {
  const key = `${role}:${uid}`, previous = scopes.get(key); if (previous) return previous;
  let generation = "0", durable = false;
  const expected = popupGeneration(role);
  try {
    generation = durableGeneration(role, uid);
    const saved = window.sessionStorage.getItem(tabKey(role, uid));
    if (expected !== null && expected !== generation || saved !== null && saved !== generation) throw blocked();
    window.sessionStorage.setItem(tabKey(role, uid), generation); durable = true;
  } catch (error) {
    if (expected !== null || (error as { code?: string })?.code === "auth/user-token-expired") throw blocked();
    // Existing single-tab sign-in still works when browser storage is blocked.
    // Independent windows cannot open unless coordination storage is available.
  }
  const result = { generation, durable, locked: false }; scopes.set(key, result); return result;
}
export function assertHubWindowSession(role: HubWindowRole, uid: string): void {
  const current = scope(role, uid);
  if (current.locked) throw blocked();
  if (!current.durable) { if (popupGeneration(role) !== null) throw blocked(); activeUids[role] = uid; return; }
  try { if (durableGeneration(role, uid) !== current.generation) throw blocked(); }
  catch { current.locked = true; throw blocked(); }
  activeUids[role] = uid;
}
/** Only successful explicit credentials sign-in can accept a newer generation. */
export function acceptHubWindowSignIn(role: HubWindowRole, uid: string): void {
  let generation = "0", durable = false;
  try { generation = durableGeneration(role, uid); window.sessionStorage.setItem(tabKey(role, uid), generation); durable = true; }
  catch { if (typeof window !== "undefined" && window.location?.pathname === "/hub-window") throw new Error("Independent Hub windows need browser storage for safe sign-out. Use the main Hub in this browser."); }
  scopes.set(`${role}:${uid}`, { generation, durable, locked: false }); activeUids[role] = uid;
}
export function revokeHubWindows(role: HubWindowRole, uid: string): boolean {
  try { clearAccountChatDrafts(window.localStorage, role, uid); } catch { /* Generation invalidation still prevents restoration when storage is unavailable. */ }
  const key = `${role}:${uid}`, previous = scopes.get(key);
  if (previous) previous.locked = true;
  const previousGeneration = previous?.generation, nextGeneration = crypto.randomUUID(); let persisted = false;
  try { window.localStorage.setItem(markerKey(role, uid), nextGeneration); persisted = true; } catch { /* Still notify active peers and always complete the local SDK logout. */ }
  try { const channel = new BroadcastChannel("tmc-hub-logout-v1"); channel.postMessage({ role, uid, previousGeneration, nextGeneration }); channel.close(); } catch { /* durable startup/focus checks remain authoritative when storage succeeded */ }
  return persisted || !previous?.durable;
}
export function watchHubWindowSession(role: HubWindowRole, uid: string, onLock: () => void): void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  const key = `${role}:${uid}`; if (installed.has(key)) return; installed.add(key);
  const check = () => { if (activeUids[role] !== uid) return; try { assertHubWindowSession(role, uid); } catch { window.dispatchEvent(new CustomEvent("tmc-hub-session-lock", { detail: { role, uid } })); onLock(); } };
  window.addEventListener?.("storage", event => { if (event.key === markerKey(role, uid)) check(); });
  window.addEventListener?.("focus", check);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "hidden") check(); });
  try { const channel = new BroadcastChannel("tmc-hub-logout-v1"); channel.onmessage = event => {
    if (event.data?.role !== role || event.data?.uid !== uid || activeUids[role] !== uid) return;
    const current = scopes.get(key);
    // Lock active peers even when the sender's durable write failed. A delayed
    // earlier logout cannot lock an explicitly reauthenticated newer generation.
    if (current && event.data.previousGeneration === current.generation) { current.locked = true; window.dispatchEvent(new CustomEvent("tmc-hub-session-lock", { detail: { role, uid } })); onLock(); }
    else check();
  }; } catch { /* persistent marker also checked at every scoped operation */ }
}
export function hubWindowGeneration(role: HubWindowRole, uid: string): string {
  assertHubWindowSession(role, uid); const current = scope(role, uid);
  if (!current.durable) throw new Error("Allow browser storage to open an independent Hub window. Your current Hub is still available.");
  // Probe writes too: read-only/blocked storage cannot support a later sign-out.
  const probe = `tmc-hub-storage-probe:${crypto.randomUUID()}`;
  try { window.localStorage.setItem(probe, "1"); window.localStorage.removeItem(probe); } catch { throw new Error("Allow browser storage to open an independent Hub window."); }
  assertHubWindowSession(role, uid);
  return current.generation;
}

export function activeHubWindowUid(role: HubWindowRole): string { const uid = activeUids[role]; if (!uid) throw new Error("Sign in to your Hub before opening a window."); assertHubWindowSession(role, uid); return uid; }

/** Only a local path is carried across windows: never a URL, query, token or code. */
export function safeHubReturnPath(value: string | null, owner: boolean): string {
  const fallback = owner ? "/taylor" : "/client-hub";
  if (!value || !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(value) || value.startsWith("//") || value === "/hub-window" || /^\/(?:api|_next)(?:\/|$)/.test(value)) return fallback;
  return value;
}
export function returnFromHubWindow(owner: boolean): void {
  const path = safeHubReturnPath(new URLSearchParams(window.location.search).get("returnTo"), owner);
  const full = window.open(path, "_blank");
  if (!full) { window.location.assign(path); return; }
  try { full.opener = null; } catch { /* Safe fixed-origin path; no credentials are passed. */ }
  window.close();
}
