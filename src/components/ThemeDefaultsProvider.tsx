"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { decodeThemePreferences, initialThemeDefaults, type ThemeArea, type ThemeDefaults, type ThemeMode } from "./theme-settings";
import { applySiteThemeDefaults } from "./theme-runtime";
const ThemeContext = createContext({ defaults: initialThemeDefaults(), initialModes: {} as Partial<Record<ThemeArea, ThemeMode>> });
export function ThemeDefaultsProvider({ defaults, initialModes, children }: { defaults: ThemeDefaults; initialModes: Partial<Record<ThemeArea, ThemeMode>>; children: ReactNode }) {
  useEffect(() => {
    let active = true, pending = false, last = 0; let controller: AbortController | null = null;
    const refresh = async () => { if (!active || pending || document.visibilityState === "hidden" || Date.now() - last < 5000) return; pending = true; last = Date.now(); controller = new AbortController(); try { const response = await fetch("/api/site-theme", { cache: "no-store", credentials: "omit", signal: controller.signal }); if (!response.ok) return; const value = await response.json(); if (active && value.revision > 0) applySiteThemeDefaults(decodeThemePreferences(value, true) as ThemeDefaults); } catch { /* Cosmetic defaults never alter or revoke an authenticated session. */ } finally { pending = false; } };
    window.addEventListener("focus", refresh); const timer = setInterval(() => void refresh(), 60_000);
    return () => { active = false; controller?.abort(); window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, []);
  return <ThemeContext value={{ defaults, initialModes }}>{children}</ThemeContext>; }
export function useThemeDefaults() { return useContext(ThemeContext); }
