"use client";
import type { Auth, User } from "firebase/auth";
import type { ThemeAccountRole } from "./theme-settings-client";
import { THEME_AREAS, type ThemeModes } from "./theme-settings";
export const PUBLIC_THEME_ROLE_KEY = "tmc-public-theme-role-v1";
export const PUBLIC_THEME_MODES_KEY = "tmc-public-theme-modes-v1";
export type PublicThemeAccount = { role: ThemeAccountRole; accountKey: string; uid: string; assertCurrent: () => void };
export function isOrdinaryPublicThemeRoute(pathname: string): boolean {
  return pathname.startsWith("/") && !/^\/(?:taylor|owner|client-hub|hub-window|api)(?:\/|$)/.test(pathname);
}
/** Non-secret hint only, written after a role gate independently verified identity. */
export function rememberPublicThemeRole(role: ThemeAccountRole) {
  if (role !== "owner" && role !== "client") return;
  try { window.sessionStorage.setItem(PUBLIC_THEME_ROLE_KEY, role); } catch { /* Guest/browser mode remains available. */ }
}
export function readPublicThemeRole(): ThemeAccountRole | null {
  try { const value = window.sessionStorage.getItem(PUBLIC_THEME_ROLE_KEY); return value === "owner" || value === "client" ? value : null; } catch { return null; }
}
/** Before-paint hint contains only acknowledged cosmetic choices, never identity.
 * A late snapshot from the other role may not replace the last verified role. */
export function rememberPublicThemeModes(role: ThemeAccountRole, modes: ThemeModes) {
  if (readPublicThemeRole() !== role || Object.keys(modes).length !== THEME_AREAS.length || THEME_AREAS.some(area => !["inherit", "light", "dark"].includes(modes[area]))) return;
  try { window.sessionStorage.setItem(PUBLIC_THEME_MODES_KEY, JSON.stringify({ role, modes })); } catch { /* Optional first-paint cache. */ }
}
/** Cosmetic bridge only. It never starts either login gate or changes credentials.
 * In particular, importing an owner/preview route cannot initialize client Auth. */
export function watchPublicThemeAccount(pathname: string, receive: (account: PublicThemeAccount | null) => void): () => void {
  if (!isOrdinaryPublicThemeRoute(pathname)) return () => {};
  const role = readPublicThemeRole(); if (!role) return () => {};
  let active = true, sequence = 0, current: PublicThemeAccount | null = null;
  let stopAuth: (() => void) | undefined, stopEpoch: (() => void) | undefined;
  const clear = () => { ++sequence; stopEpoch?.(); stopEpoch = undefined; current = null; if (active) receive(null); };
  const check = () => { if (!active || !current) return; try { current.assertCurrent(); } catch { clear(); } };
  const lock = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.role === role && detail.uid === current?.uid) clear(); };
  window.addEventListener("focus", check); window.addEventListener("storage", check); window.addEventListener("tmc-hub-session-lock", lock);
  const visible = () => { if (document.visibilityState !== "hidden") check(); }; document.addEventListener("visibilitychange", visible);
  void (async () => {
    // This import and the selected connection are deliberately after both guards.
    const { onAuthStateChanged } = await import("firebase/auth");
    if (!active) return;
    let auth: Auth, verify: (user: User) => Promise<{ account: PublicThemeAccount; watchEpoch?: (fail: () => void) => () => void }>;
    if (role === "owner") {
      const owner = await import("@/owner/firebase-client"); if (!active) return;
      const config = owner.readOwnerFirebaseConfig(); if (config.status !== "ready") throw new Error("Owner theme is unavailable.");
      const connection = owner.getOwnerFirebaseClient(config); auth = connection.auth;
      verify = async user => {
        if (user.uid !== config.ownerUid) throw new Error("Owner identity changed.");
        const { assertHubWindowSession } = await import("@/client-hub/window-session");
        const assertCurrent = () => { if (auth.currentUser !== user || user.uid !== config.ownerUid) throw new Error("Owner identity changed."); assertHubWindowSession("owner", user.uid); };
        assertCurrent(); await user.reload(); assertCurrent(); await user.getIdToken(true); assertCurrent();
        return { account: { role, accountKey: user.uid, uid: user.uid, assertCurrent } };
      };
    } else {
      const client = await import("@/client-hub/client"); if (!active) return;
      auth = client.getClientThemeAuth();
      verify = async user => {
        const ownsSession = client.captureClientHubSessionOwnership();
        const connection = await client.verifiedClientHubConnection();
        const assertCurrent = () => { if (auth.currentUser !== user || !ownsSession()) throw new Error("Client identity changed."); connection.assertCurrent(); };
        assertCurrent();
        const firestore = await import("firebase/firestore"), model = await import("@/client-hub/model"); assertCurrent();
        return { account: { role, accountKey: connection.session.clientId, uid: user.uid, assertCurrent }, watchEpoch: fail => firestore.onSnapshot(firestore.doc(connection.db, "hubClients", connection.session.clientId), { includeMetadataChanges: true }, snapshot => {
          if (snapshot.metadata.fromCache) return;
          try { assertCurrent(); if (!snapshot.exists()) throw new Error("Client account is unavailable."); const record = model.decodeClientHubClient(snapshot.data(), connection.session.clientId); if (record.status !== "active" || record.authVersion !== connection.session.authVersion) throw new Error("Client epoch changed."); } catch { fail(); }
        }, fail) };
      };
    }
    await auth.authStateReady(); if (!active) return;
    stopAuth = onAuthStateChanged(auth, user => {
      if (!active || user !== auth.currentUser) return;
      clear(); const request = sequence; if (!user) return;
      void verify(user).then(value => {
        if (!active || request !== sequence || auth.currentUser !== user) return;
        value.account.assertCurrent();
        const stop = value.watchEpoch?.(() => { if (active && request === sequence) clear(); });
        if (!active || request !== sequence) { stop?.(); return; }
        stopEpoch = stop; current = value.account; receive(current);
      }).catch(() => { if (active && request === sequence) clear(); });
    }, () => { if (active) clear(); });
    if (!active) stopAuth();
  })().catch(() => { if (active) clear(); });
  return () => { active = false; clear(); stopAuth?.(); window.removeEventListener("focus", check); window.removeEventListener("storage", check); window.removeEventListener("tmc-hub-session-lock", lock); document.removeEventListener("visibilitychange", visible); };
}
