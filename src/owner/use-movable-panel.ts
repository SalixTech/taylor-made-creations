"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

import { panelEditSessionToken, subscribePanelEditSession, readPanelPosition, savePanelPosition } from "./panel-edit-session";

export function usePanelEditSession() {
  const [token, setToken] = useState(panelEditSessionToken);
  useEffect(() => { const update = () => setToken(panelEditSessionToken()); const off = subscribePanelEditSession(update); update(); return off; }, []);
  return token;
}

type Point = { x: number; y: number };
type Bounds = { left: number; top: number; width: number; height: number };
const zero = { x: 0, y: 0 };
/** Clamp the complete panel to the viewport. Oversized panels keep their header reachable. */
export function constrainPanelOffset(point: Point, origin: Bounds, viewport: { width: number; height: number }): Point {
  const pad = 8;
  const xMax = Math.max(pad, viewport.width - origin.width - pad);
  const yMax = Math.max(pad, viewport.height - origin.height - pad);
  return { x: Math.min(xMax, Math.max(pad, origin.left + point.x)) - origin.left, y: Math.min(yMax, Math.max(pad, origin.top + point.y)) - origin.top };
}

/** Only the header moves a panel; inputs, selections and buttons keep their ordinary gestures. */
export function useMovablePanel(ref: RefObject<HTMLElement | null>, disabled = false, options: { memoryKey?: string; defaultPosition?: Point } = {}) {
  const session = usePanelEditSession();
  const memoryKey = options.memoryKey;
  const defaultX = options.defaultPosition?.x, defaultY = options.defaultPosition?.y;
  const [offset, setOffset] = useState<Point>(zero);
  const [moving, setMoving] = useState(false);
  const current = useRef(offset);
  const drag = useRef<{ pointerId: number; x: number; y: number; before: Point; origin: Bounds } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const commit = (next: Point) => { current.current = next; setOffset(next); };
  const remember = (point: Point, origin: Bounds) => { if (memoryKey) savePanelPosition(session, memoryKey, { x: origin.left + point.x, y: origin.top + point.y }); };
  const stop = (cancel: boolean) => {
    const active = drag.current;
    drag.current = null;
    cleanup.current?.(); cleanup.current = null;
    if (cancel && active) commit(active.before);
    if (!cancel && active) remember(current.current, active.origin);
    setMoving(false);
  };
  useEffect(() => () => { cleanup.current?.(); cleanup.current = null; drag.current = null; }, []);
  useEffect(() => {
    if (disabled) {
      const active = drag.current;
      cleanup.current?.(); cleanup.current = null; drag.current = null;
      if (active) { current.current = active.before; setOffset(active.before); }
      setMoving(false);
    }
  }, [disabled]);
  useEffect(() => {
    if (disabled || !memoryKey) return;
    const restore = () => {
      const panel = ref.current;
      if (!panel?.getBoundingClientRect) return;
      const bounds = panel.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const origin = { left: bounds.left - current.current.x, top: bounds.top - current.current.y, width: bounds.width, height: bounds.height };
      const saved = readPanelPosition(session, memoryKey);
      const desired = saved ?? (defaultX !== undefined && defaultY !== undefined ? { x: defaultX, y: defaultY } : null);
      const next = desired ? constrainPanelOffset({ x: desired.x - origin.left, y: desired.y - origin.top }, origin, { width: window.innerWidth, height: window.innerHeight }) : zero;
      commit(next);
    };
    // Native dialogs become measurable after showModal; ordinary panels are already mounted.
    const timer = setTimeout(restore, 0);
    return () => clearTimeout(timer);
  }, [disabled, memoryKey, session, defaultX, defaultY, ref]);
  useEffect(() => {
    const resize = () => {
      const panel = ref.current;
      if (!panel || !panel.getBoundingClientRect) return;
      const bounds = panel.getBoundingClientRect();
      const old = current.current;
      const origin = { left: bounds.left - old.x, top: bounds.top - old.y, width: bounds.width, height: bounds.height };
      const next = constrainPanelOffset(old, origin, { width: window.innerWidth, height: window.innerHeight });
      current.current = next; setOffset(next);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [ref]);
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (disabled || event.button !== 0 || event.isPrimary === false || drag.current) return;
    if ((event.target as Element).closest?.("button,a,input,select,textarea,[role=combobox]")) return;
    const panel = ref.current;
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const before = current.current;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, before, origin: { left: bounds.left - before.x, top: bounds.top - before.y, width: bounds.width, height: bounds.height } };
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const handle = event.currentTarget;
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* Window listeners still keep a drag usable. */ }
    setMoving(true);
    const move = (next: globalThis.PointerEvent) => {
      const active = drag.current;
      if (!active || next.pointerId !== active.pointerId) return;
      next.preventDefault();
      commit(constrainPanelOffset({ x: active.before.x + next.clientX - active.x, y: active.before.y + next.clientY - active.y }, active.origin, { width: window.innerWidth, height: window.innerHeight }));
    };
    const up = (next: globalThis.PointerEvent) => { if (next.pointerId === drag.current?.pointerId) stop(false); };
    const cancel = (next: globalThis.PointerEvent) => { if (next.pointerId === drag.current?.pointerId) stop(true); };
    const blur = () => stop(true);
    const key = (next: globalThis.KeyboardEvent) => { if (next.key === "Escape" && drag.current) { next.preventDefault(); next.stopImmediatePropagation(); stop(true); } };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    handle.addEventListener?.("lostpointercapture", cancel);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", key, true);
    cleanup.current = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", blur); window.removeEventListener("keydown", key, true); handle.removeEventListener?.("lostpointercapture", cancel); try { if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId); } catch { /* It may already have been released by the browser. */ } };
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (disabled || event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    const panel = ref.current;
    if (!panel) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Home") { const bounds = panel.getBoundingClientRect(); const origin = { left: bounds.left - current.current.x, top: bounds.top - current.current.y, width: bounds.width, height: bounds.height }; commit(zero); remember(zero, origin); return; }
    const bounds = panel.getBoundingClientRect();
    const old = current.current;
    const step = event.shiftKey ? 32 : 12;
    const delta = { x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0 };
    const origin = { left: bounds.left - old.x, top: bounds.top - old.y, width: bounds.width, height: bounds.height };
    const next = constrainPanelOffset({ x: old.x + delta.x, y: old.y + delta.y }, origin, { width: window.innerWidth, height: window.innerHeight });
    commit(next); remember(next, origin);
  }
  return {
    style: disabled ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` } as CSSProperties,
    moving: !disabled && moving,
    handleProps: { onPointerDown, onKeyDown, tabIndex: disabled ? undefined : 0, "aria-label": "Move panel. Drag, or use arrow keys. Home resets its position.", "data-move-handle": disabled ? undefined : true },
  };
}
