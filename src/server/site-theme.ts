import { cache } from "react";
import { decodeThemePreferences, initialThemeDefaults, type ThemeDefaults } from "@/components/theme-settings";
function rest(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid theme.");
  const v = value as Record<string, unknown>; if (Object.keys(v).length !== 1) throw new Error("Invalid theme field.");
  if (typeof v.stringValue === "string") return v.stringValue;
  if (typeof v.integerValue === "string" && /^(0|[1-9]\d*)$/.test(v.integerValue)) return Number(v.integerValue);
  if (v.mapValue && typeof v.mapValue === "object") { const fields = (v.mapValue as { fields?: unknown }).fields; if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length > 8) throw new Error("Invalid theme map."); return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, rest(item)])); }
  throw new Error("Invalid theme value.");
}
export async function readPublicTheme({ projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, fetcher = fetch }: { projectId?: string; fetcher?: typeof fetch } = {}): Promise<ThemeDefaults> {
  if ((process.env.TMC_WEBSITE_WORKSPACE ?? "main") !== "main" || (process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE ?? "main") !== "main") return initialThemeDefaults();
  if (projectId !== "taylor-made-creations") return initialThemeDefaults();
  try {
    const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/site/theme`, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return initialThemeDefaults();
    const raw = await response.text(); if (raw.length > 4096) throw new Error("Theme too large.");
    const document = JSON.parse(raw); if (!document.fields || Object.keys(document.fields).length !== 4) throw new Error("Invalid theme document.");
    return decodeThemePreferences(Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, rest(value)])), true) as ThemeDefaults;
  } catch { return initialThemeDefaults(); }
}
export const getPublicTheme = cache(readPublicTheme);
