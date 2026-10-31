"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {createFoxOpening,type FoxOpening} from "./fox-gold-bank";
import { LightSideFox } from "./LightSideFox";
import { ownerLightGuarded } from "./owner-light-guard";
import { useThemeTogglePosition } from "./theme-toggle-position";

export type Scope = "owner" | "public" | "hub";
import { initialThemeDefaults, resolveThemeMode, type ThemeMode as Mode } from "./theme-settings";
import { chooseTheme, effectiveTheme, themeSubscribe, themeSaveState } from "./theme-runtime";
import { useThemeDefaults } from "./ThemeDefaultsProvider";
export const SHARED_COLOR_MODE_KEY = "tmc-color-mode"; // Read-only legacy migration.
export const defaultColorMode = (scope: Scope): Mode => scope === "owner" ? "dark" : "light";
export function readColorMode(scope: Scope): Mode { return ownerLightGuarded(scope) ? "dark" : typeof window === "undefined" ? defaultColorMode(scope) : effectiveTheme(scope, initialThemeDefaults()); }
export function setColorMode(scope: Scope, mode: Mode) { chooseTheme(scope, mode); }
export function useColorMode(scope: Scope): Mode {
  const { defaults, initialModes } = useThemeDefaults();
  const mode = useSyncExternalStore(themeSubscribe, () => effectiveTheme(scope, defaults), () => initialModes[scope] ?? resolveThemeMode(scope, defaults));
  return ownerLightGuarded(scope) ? "dark" : mode;
}
export function ColorModeToggle({ scope }: { scope: Scope }) {
  const mode = useColorMode(scope);
  const guarded = ownerLightGuarded(scope);
  const [foxOpen,setFoxOpen]=useState(false),[encounter,setEncounter]=useState(0),[opening,setOpening]=useState<FoxOpening|null>(null);
  const opens=useRef(0),foxOpening=useRef(false);
  const saveState = useSyncExternalStore(themeSubscribe, () => themeSaveState(scope), () => "");
  const defaultAnchor = useRef<HTMLSpanElement>(null);
  const movement = useThemeTogglePosition(defaultAnchor);
  const toggle = useRef<HTMLButtonElement>(null);
  const resetPosition = movement.position ? { left: Math.max(0, Math.min(window.innerWidth - 28, movement.position.x + 28)), top: Math.max(0, movement.position.y - 12) } : undefined;
  return <>{foxOpen && opening && <LightSideFox opening={opening} encounter={encounter} onClose={() => { foxOpening.current=false; setFoxOpen(false); }} />}{saveState && <span className="theme-save-state" role={saveState.includes("not saved") ? "alert" : "status"}>{saveState}</span>}<span ref={defaultAnchor} className="color-mode-default-anchor" aria-hidden="true" /><button ref={toggle} type="button" className="color-mode-toggle" data-theme-toggle data-theme-mode={mode} data-dragging={movement.dragging || undefined} style={movement.position ? { left: movement.position.x, top: movement.position.y, right: "auto", bottom: "auto" } : undefined} onPointerDown={movement.onPointerDown} onKeyDown={movement.onKeyDown} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Home" aria-pressed={mode === "dark"} aria-label={`${scope === "owner" ? "Taylor’s Space" : "Website"} dark mode. Drag to move, or use Alt and arrow keys. Alt and Home resets position. Escape cancels dragging.`} title={`Use ${mode === "dark" ? "light" : "dark"} mode`} disabled={saveState === "Saving…" || saveState === "Connecting…"} onClick={() => { if (movement.consumeDragClick()) return; if (guarded && mode === "dark") { if(foxOpening.current)return; foxOpening.current=true; setOpening(createFoxOpening(crypto.randomUUID())); setEncounter(opens.current++); setFoxOpen(true); return; } setColorMode(scope, mode === "dark" ? "light" : "dark"); }}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{mode === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z" />}</svg></button>{movement.position && <button type="button" className="color-mode-reset" data-owner-button data-theme-reset data-theme-mode={mode} style={resetPosition} aria-label="Reset theme button position" title="Return theme button to its default position" onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); movement.resetPosition(); toggle.current?.focus({ preventScroll: true }); }}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>}</>;
}

/** Cosmetic scrollbar fading never changes overflow, scroll position, or tab order. */
export function ColorModeRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => { delete root.dataset.tmcThemePending; }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => { root.dataset.scrollActive = "true"; if (timer) clearTimeout(timer); timer = setTimeout(() => { delete root.dataset.scrollActive; }, 1400); };
    const keyboard = (event: KeyboardEvent) => { if (["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) active(); };
    document.addEventListener("scroll", active, { capture: true, passive: true });
    document.addEventListener("wheel", active, { passive: true });
    document.addEventListener("pointerdown", active, { passive: true });
    document.addEventListener("keydown", keyboard);
    return () => { cancelAnimationFrame(frame); delete root.dataset.tmcThemePending; if (timer) clearTimeout(timer); delete root.dataset.scrollActive; document.removeEventListener("scroll", active, true); document.removeEventListener("wheel", active); document.removeEventListener("pointerdown", active); document.removeEventListener("keydown", keyboard); };
  }, []);
  return null;
}
