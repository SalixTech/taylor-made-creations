"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

export const THEME_POSITION_KEY = "tmc-theme-toggle-position";
const POSITION_EVENT = "tmc-theme-toggle-position-change";
export type TogglePosition = { x: number; y: number };
export function clampTogglePosition(position: TogglePosition, width: number, height: number): TogglePosition {
  return { x: Math.max(0, Math.min(Math.max(0, width - 44), position.x)), y: Math.max(0, Math.min(Math.max(0, height - 44), position.y)) };
}
export function parseTogglePosition(raw: string | null): TogglePosition | null {
  try { const p = JSON.parse(raw ?? "null"); return p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null; } catch { return null; }
}
let volatilePosition: TogglePosition | null | undefined;
function readPosition() {
  if (volatilePosition !== undefined) return volatilePosition;
  try { return parseTogglePosition(window.localStorage.getItem(THEME_POSITION_KEY)); } catch { return null; }
}
function writePosition(value: TogglePosition | null) {
  // Only a browser preference, never website content or cloud data.
  try { window.localStorage.setItem(THEME_POSITION_KEY, JSON.stringify(value)); volatilePosition = undefined; }
  catch { volatilePosition = value; }
  window.dispatchEvent(new Event(POSITION_EVENT));
}
function normalizeTogglePosition(value: TogglePosition | null, anchor: HTMLElement | null) {
  if (!value) return null;
  const next = clampTogglePosition(value, window.innerWidth, window.innerHeight);
  const rect = anchor?.getBoundingClientRect?.();
  // Measure the CSS default including any safe-area offsets.
  const home = rect && rect.width > 0 ? { x: rect.left, y: rect.top } : { x: Math.max(0, window.innerWidth - 62), y: Math.max(0, window.innerHeight - 62) };
  return Math.abs(next.x - home.x) <= 2 && Math.abs(next.y - home.y) <= 2 ? null : next;
}
export function useThemeTogglePosition(defaultAnchor: RefObject<HTMLSpanElement | null>) {
  const [position, setPosition] = useState<TogglePosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; startX: number; startY: number; origin: TogglePosition; previous: TogglePosition | null; current: TogglePosition; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const bound = (value: TogglePosition) => clampTogglePosition(value, window.innerWidth, window.innerHeight);
  useEffect(() => {
    const cancel = () => { if (drag.current) { setPosition(drag.current.previous); suppressClick.current = drag.current.moved; drag.current = null; setDragging(false); } };
    const sync = () => { cancel(); const saved = readPosition(); setPosition(normalizeTogglePosition(saved, defaultAnchor.current)); };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === THEME_POSITION_KEY) { volatilePosition = undefined; sync(); } };
    const move = (event: globalThis.PointerEvent) => {
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      const dx = event.clientX - active.startX, dy = event.clientY - active.startY;
      if (!active.moved && Math.hypot(dx, dy) < 6) return;
      active.moved = true; suppressClick.current = true; setDragging(true);
      active.current = bound({ x: active.origin.x + dx, y: active.origin.y + dy }); setPosition(active.current);
      if (event.cancelable) event.preventDefault();
    };
    const up = (event: globalThis.PointerEvent) => {
      const active = drag.current; if (!active || active.id !== event.pointerId) return;
      drag.current = null; setDragging(false); if (active.moved) writePosition(normalizeTogglePosition(active.current, defaultAnchor.current));
    };
    const pointerCancel = (event: globalThis.PointerEvent) => { if (drag.current?.id === event.pointerId) cancel(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    sync();
    window.addEventListener("resize", sync); window.addEventListener("storage", storage); window.addEventListener(POSITION_EVENT, sync);
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("blur", cancel); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", sync); window.removeEventListener("storage", storage); window.removeEventListener(POSITION_EVENT, sync); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", pointerCancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape); };
  }, [defaultAnchor]);
  return {
    position, dragging,
    resetPosition() {
      drag.current = null; suppressClick.current = false; setDragging(false); setPosition(null); writePosition(null);
    },
    consumeDragClick() { const result = suppressClick.current; suppressClick.current = false; return result; },
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || event.isPrimary === false) return;
      suppressClick.current = false;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: { x: rect.left, y: rect.top }, previous: position, current: { x: rect.left, y: rect.top }, moved: false };
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === "Enter" || event.key === " ") suppressClick.current = false;
      // Keep ordinary Enter/Space activation and browser arrow navigation intact.
      if (!event.altKey) return;
      if (event.key === "Home") { event.preventDefault(); writePosition(null); return; }
      const delta: Record<string, TogglePosition> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
      const step = delta[event.key]; if (!step) return; event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      writePosition(normalizeTogglePosition({ x: (position?.x ?? rect.left) + step.x, y: (position?.y ?? rect.top) + step.y }, defaultAnchor.current));
    },
  };
}
