"use client";
import { emptyThemeModes, resolveThemeMode, type ThemeArea, type ThemeDefaults, type ThemeMode, type ThemePreferences } from "./theme-settings";
import type { ThemeAccountRole } from "./theme-settings-client";
export const THEME_BROWSER_KEY = "tmc-display-areas-v1";
export const THEME_ACCOUNT_KEY = (role: ThemeAccountRole, key: string) => `tmc-display-account-v1:${role}:${key}`;
const listeners = new Set<() => void>();
let volatile: Partial<Record<ThemeArea, ThemeMode>> = {};
type Account = { token: object; role: ThemeAccountRole; key: string; settings: ThemePreferences; save: (modes: ThemePreferences["modes"]) => Promise<ThemePreferences>; pending: boolean; pendingModes: ThemePreferences["modes"] | null; pendingRevision: number; ready: boolean; error: string };
const accounts = new Map<ThemeArea, Account>();
let publicDefaults: ThemeDefaults | null = null;
export function announceTheme() { listeners.forEach(listener => listener()); }
export function themeSubscribe(listener: () => void) {
  listeners.add(listener); const receive = (event: StorageEvent) => { if (!event.key || event.key === THEME_BROWSER_KEY || event.key === "tmc-color-mode") { volatile = {}; announceTheme(); } };
  window.addEventListener("storage", receive); return () => { listeners.delete(listener); window.removeEventListener("storage", receive); };
}
export function readBrowserTheme(area: ThemeArea): ThemeMode | undefined {
  if (volatile[area]) return volatile[area];
  try {
    const raw = window.localStorage.getItem(THEME_BROWSER_KEY), modes = raw ? JSON.parse(raw) : {};
    const value = modes[area]; if (value === "light" || value === "dark") return value;
    const legacy = window.localStorage.getItem("tmc-color-mode") ?? window.localStorage.getItem(`tmc-${area === "hub" ? "public" : area}-color-mode`);
    return legacy === "dark" || legacy === "light" ? legacy : undefined;
  } catch { return undefined; }
}
export function effectiveTheme(area: ThemeArea, defaults: ThemeDefaults): ThemeMode {
  const account = accounts.get(area), base = publicDefaults ?? defaults;
  if (account) return resolveThemeMode(area, base, account.pending && account.pendingRevision === account.settings.revision ? account.pendingModes ?? account.settings.modes : account.settings.modes);
  return readBrowserTheme(area) ?? resolveThemeMode(area, base);
}
export function applySiteThemeDefaults(value: ThemeDefaults) { if (!publicDefaults || value.revision >= publicDefaults.revision) { publicDefaults = value; announceTheme(); } }
export function themeSaveState(area: ThemeArea) { const account = accounts.get(area); return account ? !account.ready ? account.error || "Connecting…" : account.pending ? "Saving…" : account.error : ""; }
export function bindThemeAccount(role: ThemeAccountRole, key: string, initial: ThemePreferences | null, save: Account["save"]) {
  const token = {}, value: Account = { token, role, key, settings: initial ?? { schemaVersion: 1, revision: 0, modes: emptyThemeModes() }, save, pending: false, pendingModes: null, pendingRevision: -1, ready: false, error: "" };
  const areas: ThemeArea[] = role === "owner" ? ["owner", "public"] : ["hub", "public"];
  areas.forEach(area => accounts.set(area, value)); announceTheme();
  return {
    update(settings: ThemePreferences) { if (!value.ready || settings.revision >= value.settings.revision) { value.settings = settings; value.ready = true; value.error = ""; } announceTheme(); },
    fail() { value.ready = false; value.error = "Account display settings could not connect. Refresh to retry."; announceTheme(); },
    close() { for (const area of areas) if (accounts.get(area)?.token === token) accounts.delete(area); announceTheme(); },
  };
}
export function chooseTheme(area: ThemeArea, mode: ThemeMode) {
  const account = accounts.get(area);
  if (account) {
    if (account.pending || !account.ready) return;
    const before = account.settings, modes = { ...before.modes, [area]: mode }; account.pendingModes = modes; account.pendingRevision = before.revision; account.pending = true; account.error = ""; announceTheme();
    void account.save(modes).then(saved => { if (saved.revision >= account.settings.revision) account.settings = saved; account.error = ""; }).catch(() => { account.error = "Display preference was not saved. Try again."; }).finally(() => { account.pending = false; account.pendingModes = null; announceTheme(); });
    return;
  }
  volatile = { ...volatile, [area]: mode };
  try { window.sessionStorage.removeItem("tmc-public-theme-modes-v1"); } catch { /* A guest choice still applies without optional storage. */ }
  try { const raw = window.localStorage.getItem(THEME_BROWSER_KEY); const saved = raw ? JSON.parse(raw) : {}; window.localStorage.setItem(THEME_BROWSER_KEY, JSON.stringify({ ...saved, [area]: mode })); document.cookie = `tmc-theme-${area}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* This visit still follows the selected mode. */ }
  announceTheme();
}
