"use client";

import { useRef, useState, type DragEvent } from "react";
import { getPageNavPlacement, type OwnerContent, type OwnerPage } from "./model";
import { MoveButtons, OwnerSelect, Toggle } from "./OwnerFields";
import { reorderById } from "./builder-interactions";
import styles from "./OwnerVisualBuilder.module.css";

const placements = [{ value: "main", label: "Top bar" }, { value: "more", label: "More dropdown" }, { value: "unlisted", label: "Unlisted (address still works)" }];
export function OwnerPageNavigation({ page, onEdit }: { page: OwnerPage; onEdit: (change: (page: OwnerPage) => void) => void }) {
  return <>
    <OwnerSelect label="Menu placement" value={getPageNavPlacement(page)} options={placements} onChange={value => { if (!placements.some(option => option.value === value)) return; onEdit(target => { target.navPlacement = value as OwnerPage["navPlacement"]; target.showInNav = value !== "unlisted"; }); }} />
    {page.builtinKey !== "home" && <Toggle label="Page address is accessible" checked={page.availability !== "hidden"} onChange={enabled => onEdit(target => { target.availability = enabled ? "public" : "hidden"; })} hint="Off: the page is hidden everywhere and its address returns 404. Unlisted pages remain accessible by address when this is on." />}
  </>;
}

/** Inline controls: no modal, no live writes, with keyboard alternatives to every drag. */
export function OwnerHeaderEditor({ content, onEdit, open, onOpenChange, disabled = false }: {
  content: OwnerContent; onEdit: (change: (draft: OwnerContent) => void) => void; open: boolean; onOpenChange: (open: boolean) => void; disabled?: boolean;
}) {
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pages = content.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order);
  function editPage(id: string, change: (page: OwnerPage) => void) { if (!disabled) onEdit(draft => { const target = draft.pages.find(page => page.id === id && !page.trashedAt); if (target) change(target); }); }
  function reorder(sourceId: string, targetId: string, after = false) {
    if (disabled) return;
    onEdit(draft => { const active = draft.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order); if (reorderById(active, sourceId, targetId, after)) active.forEach((page, index) => { page.order = index; }); });
    setAnnouncement("Navigation order updated in your draft.");
  }
  function movePage(id: string, direction: -1 | 1) {
    if (disabled) return;
    onEdit(draft => { const active = draft.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order); const from = active.findIndex(page => page.id === id); const target = active[from + direction]; if (from >= 0 && target && reorderById(active, id, target.id, direction > 0)) active.forEach((page, index) => { page.order = index; }); });
    setAnnouncement("Navigation order updated in your draft.");
  }
  function drop(event: DragEvent, id: string) {
    if (!dragging.current || disabled) return;
    event.preventDefault(); reorder(dragging.current, id); dragging.current = null; setOver(null);
  }
  return <section className={styles.headerEditor} aria-label="Inline navigation editor">
    <div className={styles.headerEditorHeading}><button type="button" disabled={disabled} aria-expanded={open} onClick={() => onOpenChange(!open)}>{open ? "−" : "＋"} Edit top bar items</button><span>Edit names, drag to reorder, or use the up/down buttons. Draft only.</span></div>
    {open && <fieldset disabled={disabled}>
      <Toggle label="Enable the More dropdown" checked={content.site.moreEnabled === true} onChange={value => { if (!disabled) onEdit(draft => { draft.site.moreEnabled = value; }); }} hint="Pages assigned to More appear there only when this is on. Their addresses still work when it is off." />
      <div className={styles.navRows}>{pages.map((page, index) => <div key={page.id} className={styles.navRow} data-drop-target={over === page.id} onDragOver={event => { if (dragging.current && !disabled) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(page.id); } }} onDrop={event => drop(event, page.id)}>
        <div className={styles.navRowHeading}><button type="button" draggable={!disabled} className={styles.dragHandle} aria-label={`Drag ${page.navLabel || page.title} to reorder; use arrow buttons instead with a keyboard`} onDragStart={event => { if (disabled) { event.preventDefault(); return; } dragging.current = page.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", page.id); }} onDragEnd={() => { dragging.current = null; setOver(null); }}>⠿</button><span>{page.title}</span><MoveButtons label={`${page.title} menu item`} index={index} length={pages.length} onMove={direction => movePage(page.id, direction)} /></div>
        <label className={styles.navLabel}><span>Menu text</span><input id={`owner-nav-${page.id}`} type="text" maxLength={100} value={page.navLabel} onChange={event => { const value = event.target.value; editPage(page.id, target => { target.navLabel = value; }); }} /></label>
        <OwnerPageNavigation page={page} onEdit={change => editPage(page.id, change)} />
        <small>/{page.slug}{page.availability === "hidden" ? " · Hidden / 404" : getPageNavPlacement(page) === "unlisted" ? " · Unlisted" : getPageNavPlacement(page) === "more" && !content.site.moreEnabled ? " · More is off" : ""}</small>
      </div>)}</div>
    </fieldset>}
    <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>
  </section>;
}
