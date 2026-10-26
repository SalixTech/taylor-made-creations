"use client";

import { useEffect, useSyncExternalStore } from "react";

type Scope = "owner" | "public";
type Mode = "light" | "dark";
const listeners = new Set<() => void>();
const volatile: Partial<Record<Scope, Mode>> = {};
const key = (scope: Scope) => `tmc-${scope}-color-mode`;
export const defaultColorMode = (scope: Scope): Mode => scope === "owner" ? "dark" : "light";
export function readColorMode(scope: Scope): Mode {
  if (typeof window === "undefined") return defaultColorMode(scope);
  // Storage may be disabled in a private browser. A choice still works this visit.
  if (volatile[scope]) return volatile[scope]!;
  try { const value = window.localStorage.getItem(key(scope)); return value === "dark" || value === "light" ? value : defaultColorMode(scope); }
  catch { return defaultColorMode(scope); }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === key("owner") || event.key === key("public")) { delete volatile.owner; delete volatile.public; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function setColorMode(scope: Scope, mode: Mode) {
  try { window.localStorage.setItem(key(scope), mode); delete volatile[scope]; }
  catch { volatile[scope] = mode; }
  listeners.forEach(listener => listener());
}
/** Deterministic SSR defaults; browser preferences update after hydration.
 * No system listener overrides an explicit choice; no site-design data is edited. */
export function useColorMode(scope: Scope): Mode {
  return useSyncExternalStore(subscribe, () => readColorMode(scope), () => defaultColorMode(scope));
}
export function ColorModeToggle({ scope }: { scope: Scope }) {
  const mode = useColorMode(scope);
  return <button type="button" className="color-mode-toggle" aria-pressed={mode === "dark"} aria-label={`${scope === "owner" ? "Taylor’s Space" : "Website"} dark mode`} title={`Use ${mode === "dark" ? "light" : "dark"} mode on this browser only`} onClick={() => setColorMode(scope, mode === "dark" ? "light" : "dark")}><span aria-hidden="true">{mode === "dark" ? "☾" : "☼"}</span><span>{mode === "dark" ? "Dark" : "Light"}</span></button>;
}

/** Cosmetic scrollbar fading never changes overflow, scroll position, or tab order. */
export function ColorModeRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => { root.dataset.scrollActive = "true"; if (timer) clearTimeout(timer); timer = setTimeout(() => { delete root.dataset.scrollActive; }, 1400); };
    const keyboard = (event: KeyboardEvent) => { if (["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) active(); };
    document.addEventListener("scroll", active, { capture: true, passive: true });
    document.addEventListener("wheel", active, { passive: true });
    document.addEventListener("pointerdown", active, { passive: true });
    document.addEventListener("keydown", keyboard);
    return () => { if (timer) clearTimeout(timer); delete root.dataset.scrollActive; document.removeEventListener("scroll", active, true); document.removeEventListener("wheel", active); document.removeEventListener("pointerdown", active); document.removeEventListener("keydown", keyboard); };
  }, []);
  return null;
}
