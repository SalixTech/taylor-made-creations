import type { HubNotification } from "./model";
import { activeHubWindowUid } from "./window-session";

/** Local attention hints only: never credentials, authority, or read receipts. */
export type HubAreaPresence = { uid: string; role: "owner" | "client"; clientId: string; projectId: string; channel: HubNotification["channel"]; requestId?: string; expires: number };
const PREFIX = "tmc-hub-attention-v1:";
const TTL = 15000;
export function presenceMatches(presence: HubAreaPresence, item: Pick<HubNotification, "recipientRole" | "clientId" | "projectId" | "channel" | "requestId">, uid: string, now = Date.now()): boolean {
  return presence.uid === uid && presence.role === item.recipientRole && presence.clientId === item.clientId && presence.projectId === item.projectId && presence.channel === item.channel && (item.channel !== "requests" || !!item.requestId && item.requestId === presence.requestId) && Number.isFinite(presence.expires) && presence.expires > now && presence.expires <= now + TTL;
}
const local = new Map<string, HubAreaPresence>();
export function notificationAreaIsActive(item: HubNotification): boolean {
  let uid: string;
  try { uid = activeHubWindowUid(item.recipientRole); } catch { return false; }
  const now = Date.now();
  if ([...local.values()].some(value => presenceMatches(value, item, uid, now))) return true;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i); if (!key?.startsWith(PREFIX)) continue;
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (value && presenceMatches(value, item, uid, now)) return true;
    }
  } catch { /* Storage denied: local attention still works; prefer an alert over silence. */ }
  return false;
}

/** A focused, visible matching workspace suppresses sound in its other windows.
 * Short leases prevent a crashed/closed tab suppressing future activity forever. */
export function watchHubAreaPresence(area: Omit<HubAreaPresence, "uid" | "expires">, element: HTMLElement): () => void {
  const key = `${PREFIX}${crypto.randomUUID()}`;
  let intersecting = true;
  const clear = () => { local.delete(key); try { window.localStorage.removeItem(key); } catch { /* Optional attention hint only. */ } };
  const update = () => {
    if (!intersecting || document.visibilityState !== "visible" || (typeof document.hasFocus !== "function" || !document.hasFocus()) || !element.isConnected) { clear(); return; }
    let uid: string; try { uid = activeHubWindowUid(area.role); } catch { clear(); return; }
    const value = { ...area, uid, expires: Date.now() + TTL }; local.set(key, value);
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Same-window map still works. */ }
  };
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => { intersecting = entries.some(entry => entry.isIntersecting); update(); });
  observer?.observe(element);
  update(); const timer = window.setInterval(update, 5000);
  window.addEventListener("focus", update); window.addEventListener("blur", clear); window.addEventListener("pagehide", clear); document.addEventListener("visibilitychange", update);
  return () => { clear(); observer?.disconnect(); window.clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("blur", clear); window.removeEventListener("pagehide", clear); document.removeEventListener("visibilitychange", update); };
}
