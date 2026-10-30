"use client";
import { rememberPublicThemeModes, rememberPublicThemeRole } from "./theme-public-account";
import { useEffect } from "react";
import { decodeThemePreferences, type ThemePreferences } from "./theme-settings";
import { bindThemeAccount, THEME_ACCOUNT_KEY } from "./theme-runtime";
import { saveAccountTheme, watchAccountTheme, type ThemeAccountRole } from "./theme-settings-client";
/** Mounted only INSIDE the verified role gate. Never initializes another role. */
export function AccountThemeSync({ role, accountKey }: { role: ThemeAccountRole; accountKey: string }) {
  useEffect(() => {
    rememberPublicThemeRole(role);
    let active = true, confirmed: ThemePreferences | null = null, cached: ThemePreferences | null = null;
    try { const raw = localStorage.getItem(THEME_ACCOUNT_KEY(role, accountKey)); if (raw && raw.length < 1000) cached = decodeThemePreferences(JSON.parse(raw)); } catch { /* Never trust malformed preference cache. */ }
    const persist = (value: ThemePreferences) => { rememberPublicThemeModes(role, value.modes); try { if (value.revision > 0) localStorage.setItem(THEME_ACCOUNT_KEY(role, accountKey), JSON.stringify(value)); else localStorage.removeItem(THEME_ACCOUNT_KEY(role, accountKey)); } catch { /* Cosmetic cache is optional. */ } };
    const binding = bindThemeAccount(role, accountKey, cached, async modes => {
      if (!active || !confirmed) throw new Error("Account display settings are still connecting.");
      const result = await saveAccountTheme(role, accountKey, confirmed, modes);
      if (!active) throw new Error("Your account changed.");
      if (!confirmed || result.revision >= confirmed.revision) confirmed = result; persist(confirmed); return confirmed;
    });
    const stop = watchAccountTheme(role, accountKey, value => { if (!active || confirmed && value.revision < confirmed.revision) return; confirmed = value; persist(value); binding.update(value); }, () => { if (active) { confirmed = null; binding.fail(); } });
    return () => { active = false; stop(); binding.close(); };
  }, [role, accountKey]);
  return null;
}
