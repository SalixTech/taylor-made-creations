"use client";
import { doc, getDocFromServer, getFirestore, onSnapshot, runTransaction } from "firebase/firestore";
import { THEME_AREAS, decodeThemePreferences, emptyThemeModes, initialThemeDefaults, type ThemeDefaults, type ThemeModes, type ThemePreferences } from "./theme-settings";
import { verifiedClientHubConnection } from "@/client-hub/client";
import { taylorOwnerSession } from "@/owner/taylor-services-client";
export type ThemeAccountRole = "owner" | "client";
async function account(role: ThemeAccountRole, accountKey?: string) {
  if (role === "owner") { const session = await taylorOwnerSession(); if (accountKey && session.auth.currentUser?.uid !== accountKey) throw new Error("Your account changed."); return { ...session, db: getFirestore(session.auth.app), uid: session.auth.currentUser!.uid }; }
  const session = await verifiedClientHubConnection();
  if (accountKey && session.session.clientId !== accountKey) throw new Error("Your account changed.");
  return { ...session, uid: session.auth.currentUser!.uid };
}
export function watchAccountTheme(role: ThemeAccountRole, accountKey: string, receive: (value: ThemePreferences) => void, fail: (error: unknown) => void): () => void {
  let active = true, stop: (() => void) | undefined;
  void account(role, accountKey).then(session => {
    if (!active) return;
    stop = onSnapshot(doc(session.db, "accountDisplayPreferences", session.uid), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { session.assertCurrent(); receive(snapshot.exists() ? decodeThemePreferences(snapshot.data()) : { schemaVersion: 1, revision: 0, modes: emptyThemeModes() }); } catch (error) { fail(error); }
    }, error => { if (active) fail(error); });
  }).catch(error => { if (active) fail(error); });
  return () => { active = false; stop?.(); };
}
export async function saveAccountTheme(role: ThemeAccountRole, accountKey: string, before: ThemePreferences, modes: ThemeModes): Promise<ThemePreferences> {
  const session = await account(role, accountKey), target = doc(session.db, "accountDisplayPreferences", session.uid);
  const next = decodeThemePreferences({ schemaVersion: 1, revision: before.revision + 1, modes });
  await runTransaction(session.db, async tx => {
    session.assertCurrent(); const snapshot = await tx.get(target); session.assertCurrent();
    const current = snapshot.exists() ? decodeThemePreferences(snapshot.data()) : { revision: 0 };
    if (current.revision === next.revision && "modes" in current && THEME_AREAS.every(area => current.modes[area] === next.modes[area])) return;
    if (current.revision !== before.revision) throw new Error("Your display preference changed elsewhere. Refresh before saving.");
    tx.set(target, next);
  }); session.assertCurrent(); return next;
}
export async function readSiteTheme(): Promise<ThemeDefaults> {
  const session = await account("owner"), snapshot = await getDocFromServer(doc(session.db, "site", "theme")); session.assertCurrent();
  return snapshot.exists() ? decodeThemePreferences(snapshot.data(), true) as ThemeDefaults : initialThemeDefaults();
}
export async function saveSiteTheme(before: ThemeDefaults, value: Pick<ThemeDefaults, "defaultMode" | "modes">): Promise<ThemeDefaults> {
  const session = await account("owner"), target = doc(session.db, "site", "theme");
  const next = decodeThemePreferences({ schemaVersion: 1, revision: before.revision + 1, ...value }, true) as ThemeDefaults;
  await runTransaction(session.db, async tx => { session.assertCurrent(); const snapshot = await tx.get(target); session.assertCurrent(); const current = snapshot.exists() ? decodeThemePreferences(snapshot.data(), true) : { revision: 0 }; if (current.revision === next.revision && "modes" in current && THEME_AREAS.every(area => current.modes[area] === next.modes[area]) && "defaultMode" in current && current.defaultMode === next.defaultMode) return; if (current.revision !== before.revision) throw new Error("Site display defaults changed elsewhere. Refresh before saving."); tx.set(target, next); }); session.assertCurrent(); return next;
}
