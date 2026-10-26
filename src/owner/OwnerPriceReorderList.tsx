"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createNavigationDragGhost, navigationDropAfter } from "./navigation-drag";
import styles from "./OwnerPricesManager.module.css";

type Drag = { id: string; pointerId: number; card: HTMLElement; x: number; y: number; active: boolean; touch: boolean; timer?: ReturnType<typeof setTimeout>; ghost?: ReturnType<typeof createNavigationDragGhost>; target: string | null; after: boolean };
type Props<T extends { id: string }> = {
  items: readonly T[]; label: string; layout?: "list" | "grid";
  itemLabel: (item: T) => string; expandedItemId?: string | null; disabled?: boolean;
  onReorder: (sourceId: string, targetId: string, after: boolean) => void;
  onStep: (sourceId: string, direction: -1 | 1) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
};
export const CARD_HOLD_DELAY = 160;
export const CARD_DRAG_DISTANCE = 5;
/** Mouse/pen movement starts a move; touch keeps a short hold so scrolling still works. */
export function OwnerPriceReorderList<T extends { id: string }>({ items, label, itemLabel, layout = "list", expandedItemId = null, disabled = false, onReorder, onStep, children }: Props<T>) {
  const instructionsId = useId(), list = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null), clickGuard = useRef(false);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function clear() {
    const current = drag.current; drag.current = null;
    if (current?.timer) clearTimeout(current.timer);
    current?.ghost?.remove();
    if (current?.card.hasPointerCapture?.(current.pointerId)) current.card.releasePointerCapture(current.pointerId);
    setOver(null);
  }
  useEffect(() => {
    const cancel = () => {
      const current = drag.current; drag.current = null;
      if (current?.timer) clearTimeout(current.timer);
      current?.ghost?.remove();
      if (current?.card.hasPointerCapture?.(current.pointerId)) current.card.releasePointerCapture(current.pointerId);
      setOver(null);
    };
    const preventActiveTouchScroll = (event: TouchEvent) => { if (drag.current?.active && event.cancelable) event.preventDefault(); };
    if (disabled) cancel();
    window.addEventListener("blur", cancel);
    document.addEventListener("touchmove", preventActiveTouchScroll, { passive: false });
    return () => { window.removeEventListener("blur", cancel); document.removeEventListener("touchmove", preventActiveTouchScroll); cancel(); };
  }, [disabled]);
  function focusCard(id: string) {
    requestAnimationFrame(() => [...list.current?.querySelectorAll<HTMLElement>("[data-price-sort-card]") ?? []].find(node => node.dataset.priceSortCard === id && node.parentElement === list.current)?.focus({ preventScroll: true }));
  }
  function begin(event: PointerEvent<HTMLDivElement>, id: string) {
    if (disabled || items.length < 2 || event.button !== 0 || event.isPrimary === false) return;
    const card = event.currentTarget, target = event.target as HTMLElement;
    if (card.parentElement !== list.current || target.closest?.("[data-price-sort-card]") !== card) return;
    if (target.closest?.("button,a,input,textarea,select,label,summary,[role=button],[role=combobox],[role=option],[contenteditable=true],[data-no-card-drag]")) return;
    event.stopPropagation(); clear();
    const current: Drag = { id, pointerId: event.pointerId, card, x: event.clientX, y: event.clientY, active: false, touch: event.pointerType === "touch", target: null, after: false };
    drag.current = current;
    if (current.touch) current.timer = setTimeout(() => activate(current), CARD_HOLD_DELAY);
  }
  function activate(current: Drag) {
    if (drag.current !== current || !current.card.isConnected) return;
    current.active = true;
    current.card.setPointerCapture?.(current.pointerId);
    current.ghost = createNavigationDragGhost(current.card, current.x, current.y);
    current.card.focus({ preventScroll: true });
    setAnnouncement(`Moving card. Drop to reorder, or press Escape to cancel.`);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || disabled) return;
    if (!current.active) {
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (current.touch) { if (distance > 8) clear(); return; }
      if (distance < CARD_DRAG_DISTANCE) return;
      activate(current);
      if (!current.active) return;
    }
    event.preventDefault(); event.stopPropagation();
    current.ghost?.move(event.clientX, event.clientY);
    let target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-price-sort-card]");
    while (target && target.parentElement !== list.current) target = target.parentElement?.closest<HTMLElement>("[data-price-sort-card]");
    if (target && !target.dataset.dragGhost && target.dataset.priceSortCard !== current.id) {
      current.target = target.dataset.priceSortCard ?? null;
      current.after = navigationDropAfter(target.getBoundingClientRect(), event.clientX, event.clientY, layout === "grid");
      setOver(current.target ? { id: current.target, after: current.after } : null);
    } else { current.target = null; setOver(null); }
    if (event.clientY < 64) window.scrollBy?.({ top: -16, behavior: "instant" });
    else if (event.clientY > window.innerHeight - 64) window.scrollBy?.({ top: 16, behavior: "instant" });
  }
  function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.active) { event.preventDefault(); event.stopPropagation(); clickGuard.current = true; }
    if (!disabled && !cancelled && current.active && current.target) {
      onReorder(current.id, current.target, current.after);
      setAnnouncement(`${label} order updated in your draft.`); focusCard(current.id);
    } else if (current.active) setAnnouncement("Move cancelled. Order is unchanged.");
    clear();
  }
  return <div className={styles.reorderRegion} onPointerDownCapture={() => { clickGuard.current = false; }} onClickCapture={event => { if (clickGuard.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }} onKeyDownCapture={event => {
    if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); clickGuard.current = true; clear(); setAnnouncement("Move cancelled. Order is unchanged."); }
  }}>
    <p id={instructionsId} className={styles.srOnly}>Drag a card to move it. On touchscreens, briefly hold before dragging. You can also focus the card and use the arrow keys. Press Escape to cancel.</p>
    <div ref={list} className={`${styles.reorderList} ${layout === "grid" ? styles.gridList : ""}`} data-price-sort-list={label} aria-label={label}>{items.map(item => <div key={item.id} className={styles.sortCard} data-price-sort-card={item.id} data-price-drag-handle={item.id} data-expanded={expandedItemId === item.id} data-drop-target={over?.id === item.id} data-drop-after={over?.id === item.id && over.after} data-sort-disabled={disabled || items.length < 2} tabIndex={disabled || items.length < 2 ? -1 : 0} role="group" aria-label={`${itemLabel(item)}; drag to move or use arrow keys`} aria-describedby={instructionsId}
      onPointerDown={event => begin(event, item.id)} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)} onPointerLeave={event => { if (drag.current && !drag.current.active) end(event, true); }} onContextMenu={event => { if (drag.current?.id === item.id) event.preventDefault(); }} onDragStart={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || disabled || !["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
        if (!items[items.findIndex(entry => entry.id === item.id) + direction]) return;
        clear(); onStep(item.id, direction); setAnnouncement(`${itemLabel(item)} moved in your draft.`); focusCard(item.id);
      }}>{children(item, null)}</div>)}</div>
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
  </div>;
}
