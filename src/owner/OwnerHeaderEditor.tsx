"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { getPageNavPlacement, isPageAvailable, validatePageSlug, type OwnerContent, type OwnerPage } from "./model";
import { MoveButtons, OwnerSelect, Toggle } from "./OwnerFields";
import { OwnerPageSlug } from "./OwnerPageSlug";
import { reorderById } from "./builder-interactions";
import { getAutomaticMorePage, getHeaderNavigation } from "./header-navigation";
import { createNavigationDragGhost, navigationDropAfter } from "./navigation-drag";
import styles from "./OwnerVisualBuilder.module.css";

const placements = [{ value: "main", label: "Top bar" }, { value: "more", label: "More dropdown" }, { value: "unlisted", label: "Unlisted (address still works)" }];
export function OwnerPageNavigation({ page, onEdit }: { page: OwnerPage; onEdit: (change: (page: OwnerPage) => void) => void }) {
  return <>
    {page.builtinKey === "terms" ? <p className={styles.navAddressHint}>TOS stays pinned to the top bar while this page is accessible.</p> : <OwnerSelect label="Menu placement" value={getPageNavPlacement(page)} options={placements} onChange={value => { if (!placements.some(option => option.value === value)) return; onEdit(target => { target.navPlacement = value as OwnerPage["navPlacement"]; target.showInNav = value !== "unlisted"; }); }} />}
    {page.builtinKey !== "home" && <Toggle label="Page address is accessible" checked={page.availability !== "hidden"} onChange={enabled => onEdit(target => { target.availability = enabled ? "public" : "hidden"; })} hint="Off: the page is hidden everywhere and its address returns 404. Unlisted pages remain accessible by address when this is on." />}
  </>;
}

type PointerDrag = { id: string; pointerId: number; handle: HTMLElement; card: HTMLElement; x: number; y: number; active: boolean; touch: boolean; timer?: ReturnType<typeof setTimeout>; ghost?: ReturnType<typeof createNavigationDragGhost>; target: string | null; after: boolean };

/** Inline controls: no modal, no live writes; keyboard/touch alternatives to native dragging. */
export function OwnerHeaderEditor({ content, onEdit, open, onOpenChange, disabled = false }: {
  content: OwnerContent; onEdit: (change: (draft: OwnerContent) => void) => void; open: boolean; onOpenChange: (open: boolean) => void; disabled?: boolean;
}) {
  const editorId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerDrag | null>(null);
  const clickGuard = useRef(false);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pages = content.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order);
  const morePages = getHeaderNavigation(content).more;
  const automaticMorePage = getAutomaticMorePage(content);
  function editPage(id: string, change: (page: OwnerPage) => void) {
    if (!disabled) onEdit(draft => {
      const target = draft.pages.find(page => page.id === id && !page.trashedAt);
      if (target) { const previous = getPageNavPlacement(target); change(target); if (previous !== "more" && getPageNavPlacement(target) === "more") draft.site.moreEnabled = true; }
    });
  }
  function reorder(sourceId: string, targetId: string, after = false) {
    if (disabled) return;
    onEdit(draft => { const active = draft.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order); const slots = active.map(page => page.order); if (reorderById(active, sourceId, targetId, after)) active.forEach((page, index) => { page.order = slots[index]; }); });
    setAnnouncement("Navigation order updated in your draft.");
  }
  function movePage(id: string, direction: -1 | 1) {
    if (disabled) return;
    onEdit(draft => { const active = draft.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order); const slots = active.map(page => page.order); const from = active.findIndex(page => page.id === id); const target = active[from + direction]; if (from >= 0 && target && reorderById(active, id, target.id, direction > 0)) active.forEach((page, index) => { page.order = slots[index]; }); });
    setAnnouncement("Navigation order updated in your draft.");
  }
  function clearDrag() {
    const state = pointer.current;
    pointer.current = null;
    if (state?.timer) clearTimeout(state.timer);
    state?.ghost?.remove();
    if (state?.handle.hasPointerCapture?.(state.pointerId)) state.handle.releasePointerCapture(state.pointerId);
    setOver(null);
  }
  useEffect(() => {
    const cancel = () => { const state = pointer.current; pointer.current = null;
    if (state?.timer) clearTimeout(state.timer); state?.ghost?.remove(); if (state?.handle.hasPointerCapture?.(state.pointerId)) state.handle.releasePointerCapture(state.pointerId); setOver(null); };
    if (!open || disabled) cancel();
    const preventActiveTouchScroll = (event: TouchEvent) => { if (pointer.current?.active) event.preventDefault(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("touchmove", preventActiveTouchScroll, { passive: false });
    return () => { window.removeEventListener("blur", cancel); window.removeEventListener("touchmove", preventActiveTouchScroll); cancel(); };
  }, [open, disabled]);
  function beginPointer(event: PointerEvent<HTMLDivElement>, id: string) {
    if (disabled || event.button !== 0 || event.isPrimary === false) return;
    const card = event.currentTarget;
    const target = event.target as HTMLElement;
    if (target?.closest?.("button,input,textarea,select,a,label,summary,[role='button'],[role='combobox'],[role='option'],[contenteditable='true'],[data-no-card-drag]")) return;
    clearDrag();
    const state: PointerDrag = { id, pointerId: event.pointerId, handle: card, card, x: event.clientX, y: event.clientY, active: false, touch: event.pointerType === "touch", target: null, after: false };
    pointer.current = state;
    if (state.touch) state.timer = setTimeout(() => activatePointer(state), 160);
  }
  function activatePointer(state: PointerDrag) {
    if (pointer.current !== state) return;
    state.active = true;
    state.card.setPointerCapture?.(state.pointerId);
    state.card.focus({ preventScroll: true });
    state.ghost = createNavigationDragGhost(state.card, state.x, state.y);
    setAnnouncement("Moving menu card. Drop to reorder, or press Escape to cancel.");
  }
  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const state = pointer.current;
    if (!state || state.pointerId !== event.pointerId || disabled) return;
    if (!state.active) {
      const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y);
      if (state.touch) { if (distance > 8) clearDrag(); return; }
      if (distance < 5) return;
      activatePointer(state);
    }
    event.preventDefault();
    state.ghost?.move(event.clientX, event.clientY);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-nav-card]");
    if (target && listRef.current?.contains(target) && target.dataset.navCard !== state.id) {
      const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-nav-card]:not([data-drag-ghost])")];
      const columns = rows.length > 1 && Math.abs(rows[0].getBoundingClientRect().top - rows[1].getBoundingClientRect().top) < 5;
      state.target = target.dataset.navCard ?? null; state.after = navigationDropAfter(target.getBoundingClientRect(), event.clientX, event.clientY, columns);
      setOver(state.target ? { id: state.target, after: state.after } : null);
    } else { state.target = null; setOver(null); }
    if (event.clientY < 64) window.scrollBy?.({ top: -16, behavior: "instant" });
    else if (event.clientY > window.innerHeight - 64) window.scrollBy?.({ top: 16, behavior: "instant" });
  }
  function endPointer(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const state = pointer.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.active) { event.preventDefault(); clickGuard.current = true; }
    if (!cancelled && state.active && state.target) reorder(state.id, state.target, state.after);
    else if (state.active) setAnnouncement("Move cancelled. Navigation order is unchanged.");
    clearDrag();
  }
  function toggleMore(enabled: boolean) {
    if (disabled) return;
    let moved = "";
    onEdit(draft => {
      draft.site.moreEnabled = enabled;
      const active = draft.pages.filter(page => isPageAvailable(draft, page) && page.builtinKey !== "terms").sort((a, b) => a.order - b.order);
      if (enabled && !active.some(page => getPageNavPlacement(page) === "more")) {
        const last = active.filter(page => page.builtinKey !== "home" && getPageNavPlacement(page) === "main").at(-1);
        if (last) { last.navPlacement = "more"; last.showInNav = true; moved = last.navLabel || last.title; }
      }
    });
    setAnnouncement(enabled ? moved ? `More is on. ${moved} moved into More; change any card's Menu placement to customize it.` : "More is on. Choose More dropdown on a page card to add it." : "More is off. Its page assignments are kept for next time.");
  }
  return <section className={styles.headerEditor} aria-label="Inline navigation editor" onKeyDown={event => { if (event.key === "Escape" && open && !disabled) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); openerRef.current?.focus({ preventScroll: true }); } }} onPointerDownCapture={() => { clickGuard.current = false; }} onKeyDownCapture={event => { if (event.key === "Escape" && pointer.current) { event.preventDefault(); event.stopPropagation(); clickGuard.current = true; clearDrag(); setAnnouncement("Move cancelled. Navigation order is unchanged."); } }} onClickCapture={event => { if (clickGuard.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className={styles.headerEditorHeading}><button ref={openerRef} type="button" disabled={disabled} aria-expanded={open} aria-controls={editorId} onClick={() => { if (!disabled) onOpenChange(!open); }}>{open ? "−" : "＋"} Edit top bar items</button><span>Edit names and addresses. Drag a card to move it, or focus it and use the arrow keys. On touchscreens, briefly hold before dragging. Draft only.</span></div>
    {open && <fieldset id={editorId} disabled={disabled}>
      <Toggle label="Enable the More dropdown" checked={content.site.moreEnabled === true} onChange={toggleMore} hint="With no assigned More items, your last available top-bar page appears in More. Choose each card’s Menu placement below. Home and TOS are not moved. Turning More off keeps its assignments but hides that dropdown." />
      {content.site.moreEnabled && <p className={styles.moreStatus} role="status">{morePages.length ? automaticMorePage ? `${automaticMorePage.navLabel || automaticMorePage.title} appears in More automatically. Choose More dropdown on cards to customize it.` : `${morePages.length} page${morePages.length === 1 ? "" : "s"} in More. Open Browse site to try the dropdown.` : "More has no accessible pages yet. Choose More dropdown on an accessible page below."}</p>}
      <div ref={listRef} className={styles.navRows}>{pages.map((page, index) => <div key={page.id} className={styles.navRow} data-nav-card={page.id} data-drop-target={over?.id === page.id} data-drop-after={over?.id === page.id && over.after} tabIndex={disabled ? -1 : 0} aria-label={`${page.navLabel || page.title} menu card. Drag to move, or use arrow keys.`} onPointerDown={event => beginPointer(event, page.id)} onPointerMove={movePointer} onPointerUp={event => endPointer(event)} onPointerCancel={event => endPointer(event, true)} onLostPointerCapture={event => endPointer(event, true)} onPointerLeave={() => { if (pointer.current && !pointer.current.active) clearDrag(); }} onKeyDown={event => { if (event.target === event.currentTarget && ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.key)) { event.preventDefault(); movePage(page.id, event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1); } }} onDragStart={event => event.preventDefault()}>
        <div className={styles.navRowHeading}><span>{page.title}</span><MoveButtons label={`${page.title} menu item`} index={index} length={pages.length} onMove={direction => movePage(page.id, direction)} /></div>
        <label className={styles.navLabel}><span>Menu text</span><input id={`owner-nav-${page.id}`} type="text" maxLength={80} value={page.navLabel} onChange={event => { const value = event.target.value; editPage(page.id, target => { target.navLabel = value; }); }} /></label>
        <OwnerPageSlug page={page} pages={content.pages} disabled={disabled} onChange={slug => { if (!disabled) onEdit(draft => { const target = draft.pages.find(item => item.id === page.id && !item.trashedAt); if (target && target.builtinKey !== "home" && !validatePageSlug(slug, draft.pages, target.id)) target.slug = slug; }); }} />
        <OwnerPageNavigation page={page} onEdit={change => editPage(page.id, change)} />
        <small>/{page.slug}{automaticMorePage?.id === page.id ? " · Automatically in More" : ""}{page.availability === "hidden" ? " · Hidden / 404" : page.builtinKey === "terms" ? " · TOS is pinned to the top bar" : getPageNavPlacement(page) === "unlisted" ? " · Unlisted" : getPageNavPlacement(page) === "more" && !content.site.moreEnabled ? " · More is off" : ""}</small>
      </div>)}</div>
    </fieldset>}
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
  </section>;
}
