"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { isBuiltinLabel, newCustomLabelKey, type LabelPresentation } from "@/client-hub/label-presentation";
import { labelAppearanceFields } from "./label-appearance-fields";
import { TrashIcon } from "./TrashIcon";
import { Dialog } from "./OwnerDialog";
import buttons from "./OwnerButton.module.css";
import styles from "./LabelPresentationEditor.module.css";

export type LabelPresentationDraft = Pick<LabelPresentation, "entries" | "order">;
type Edit = { key: string; fresh: boolean; name: string; hex: string; rgb: string[]; defaultColor: boolean };
const colorValid = (hex: string) => /^#[\da-f]{6}$/i.test(hex);
const rgbOf = (hex: string) => [1, 3, 5].map(offset => String(parseInt(hex.slice(offset, offset + 2), 16)));
const rgbValid = (rgb: string[]) => rgb.every(value => /^\d{1,3}$/.test(value) && Number(value) <= 255);
const primary = `${buttons.button} ${buttons.primary} ${buttons.compact}`;
const secondary = `${buttons.button} ${buttons.secondary} ${buttons.compact}`;
function Pencil() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/></svg>; }

/** Stages presentation only. The containing dialog owns the explicit cloud save. */
export function LabelPresentationEditor({ value, baselineEntries, onChange, disabled = false }: { value: LabelPresentationDraft; baselineEntries: LabelPresentationDraft["entries"]; onChange: (value: LabelPresentationDraft) => void; disabled?: boolean }) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const list = useRef<HTMLDivElement>(null), current = useRef(value);
  const originalOrder = useRef<string[] | null>(null);
  const pendingRects = useRef<Map<string, DOMRect> | null>(null);
  const pointer = useRef<{ id: number; key: string; x: number; y: number; dx: number; dy: number; width: number; height: number; moved: boolean } | null>(null);
  const editingRef = useRef<Edit | null>(null), deletingRef = useRef<string | null>(null);
  useLayoutEffect(() => { current.current = value; }, [value]);
  const rows = value.order.filter(key => value.entries[key] && !value.entries[key].deleted);
  const blocked = disabled || edit !== null || deleting !== null;
  function change(next: LabelPresentationDraft) { current.current = next; onChange(next); }
  function snapshotRows() { pendingRects.current = new Map(Array.from(list.current?.querySelectorAll<HTMLElement>("[data-label-key]") ?? []).map(row => [row.dataset.labelKey!, row.getBoundingClientRect()])); }
  useLayoutEffect(() => {
    const before = pendingRects.current; pendingRects.current = null;
    if (!before || typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const row of list.current?.querySelectorAll<HTMLElement>("[data-label-key]") ?? []) {
      const previous = before.get(row.dataset.labelKey!), next = row.getBoundingClientRect();
      if (previous && previous.top !== next.top && typeof row.animate === "function") row.animate([{ transform: `translateY(${previous.top - next.top}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [value.order]);
  function move(key: string, target: string) {
    if (disabled || key === target) return;
    const order = [...current.current.order], from = order.indexOf(key), to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    snapshotRows(); order.splice(from, 1); order.splice(to, 0, key); change({ ...current.current, order });
  }
  function begin(key: string) { if (blocked) return; originalOrder.current = [...current.current.order]; setPicked(key); }
  function finish(cancel = false) {
    if (cancel && originalOrder.current && !disabled) { snapshotRows(); change({ ...current.current, order: originalOrder.current }); }
    originalOrder.current = null; pointer.current = null; setPicked(null); setGhost(null);
  }
  function targetAt(x: number, y: number) {
    const elements = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-label-key]") ?? []);
    for (const row of elements) {
      const rect = row.getBoundingClientRect();
      // Hit-test layout slots, not the temporary FLIP transform: transformed
      // rows otherwise swap back and forth under a stationary pointer.
      const top = row.offsetParent === list.current ? list.current!.getBoundingClientRect().top + row.offsetTop - list.current!.scrollTop : rect.top;
      const bottom = row.offsetParent === list.current ? top + row.offsetHeight : rect.bottom;
      if (x >= rect.left && x <= rect.right && y >= top && y <= bottom) return row.dataset.labelKey;
    }
  }
  function openEditor(key: string, fresh = false) {
    if (disabled || picked) return;
    const entry = current.current.entries[key], hex = entry?.color ?? "#7f0011";
    const next = { key, fresh, name: fresh ? "" : entry.name, hex, rgb: rgbOf(hex), defaultColor: !entry?.color };
    editingRef.current = next; setEdit(next); setFeedback("");
  }
  function updateEdit(patch: Partial<Edit>) { if (disabled || !editingRef.current) return; const next = { ...editingRef.current, ...patch }; editingRef.current = next; setEdit(next); }
  const nameValid = (name: string) => name.trim().length > 0 && name.trim().length <= 60 && !/[\x00-\x1f\x7f]/.test(name);
  const editValid = !!edit && nameValid(edit.name) && (edit.defaultColor || colorValid(edit.hex) && rgbValid(edit.rgb));
  function closeEditor() { if (disabled) return; editingRef.current = null; setEdit(null); }
  function saveEditor() {
    const draft = editingRef.current; if (disabled || !draft || !nameValid(draft.name) || !draft.defaultColor && (!colorValid(draft.hex) || !rgbValid(draft.rgb))) return;
    const before = current.current.entries[draft.key];
    if (before?.deleted || !draft.fresh && !before) { setFeedback("This label changed. Close the editor and try again."); return; }
    editingRef.current = null; // Synchronous double-click guard.
    const entry = { name: draft.name.trim(), color: draft.defaultColor ? null : draft.hex.toUpperCase(), hidden: before?.hidden ?? false, deleted: false };
    change({ entries: { ...current.current.entries, [draft.key]: entry }, order: draft.fresh ? [...current.current.order, draft.key] : [...current.current.order] });
    setEdit(null); setFeedback("Label staged. Save default to apply it.");
  }
  function remove(key: string) {
    if (disabled || picked) return;
    if (isBuiltinLabel(key)) { const entry = current.current.entries[key]; change({ ...current.current, entries: { ...current.current.entries, [key]: { ...entry, hidden: !entry.hidden } } }); return; }
    deletingRef.current = key; setDeleting(key);
  }
  function confirmDelete() {
    const key = deletingRef.current; if (disabled || !key) return;
    deletingRef.current = null; const entry = current.current.entries[key];
    if (entry && !entry.deleted) {
      const baseline = baselineEntries[key];
      if (baseline) change({ ...current.current, entries: { ...current.current.entries, [key]: { ...baseline, deleted: true } } });
      else { const entries = { ...current.current.entries }; delete entries[key]; change({ entries, order: current.current.order.filter(id => id !== key) }); }
    }
    setDeleting(null); setFeedback("Removed from future choices. Assigned cards keep their last appearance.");
  }
  const canAdd = Object.keys(value.entries).length < 1000 && Object.keys(value.entries).filter(key => !isBuiltinLabel(key) && !value.entries[key].deleted).length < 100;
  return <div className={styles.editor}>
    <div className={styles.add}><button type="button" data-owner-button className={secondary} disabled={blocked || !!picked || !canAdd} onClick={() => openEditor(newCustomLabelKey(), true)}>Add label</button></div>
    <p className={styles.hint}>Drag the whole label card to reorder. Keyboard: Space, arrows, Space to drop; Escape cancels. Changes here are staged until Save default.</p>
    <div ref={list} className={styles.list} role="list" aria-label="Card label order" onPointerMove={event => {
        const drag = pointer.current; if (!drag || drag.id !== event.pointerId || blocked) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        if (!drag.moved) { drag.moved = true; begin(drag.key); }
        setGhost({ x: event.clientX - drag.dx, y: event.clientY - drag.dy, width: drag.width, height: drag.height });
        const target = targetAt(event.clientX, event.clientY); if (target) move(drag.key, target);
      }} onPointerUp={event => { const drag = pointer.current; if (!drag || drag.id !== event.pointerId) return; finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => finish(true)} onLostPointerCapture={event => { if (event.target === event.currentTarget && pointer.current?.id === event.pointerId) finish(true); }}>{rows.map((key, index) => { const entry = value.entries[key]; return <div key={key} role="listitem" data-label-key={key} data-dragging={picked === key || undefined} className={styles.row}>
      <span className={styles.ordinal} aria-hidden="true">{index + 1}.</span>
      <button type="button" data-owner-button className={styles.handle} disabled={blocked || picked !== null && picked !== key} draggable={false} aria-label={`Reorder ${entry.name}`} aria-pressed={picked === key} onKeyDown={event => {
        if (blocked) return;
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (picked === key) finish(); else begin(key); }
        else if (picked === key && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true); }
        else if (picked === key && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const active = current.current.order.filter(id => !current.current.entries[id].deleted), target = active[active.indexOf(key) + (event.key === "ArrowUp" ? -1 : 1)]; if (target) move(key, target); }
      }} onPointerDown={event => {
        if (blocked || event.button !== 0 || pointer.current) return;
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        pointer.current = { id: event.pointerId, key, x: event.clientX, y: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width, height: rect.height, moved: false };
        // Capture the stable list, not a keyed row that React moves during reflow.
        list.current?.setPointerCapture(event.pointerId);
      }}>
        {entry.color && <span className={styles.swatch} style={{ backgroundColor: entry.color }} aria-hidden="true"/>}<span>{entry.name}<small>{entry.hidden ? "Hidden on cards" : isBuiltinLabel(key) ? "Built-in · presentation only" : "Custom label"}</small></span>
      </button>
      <button type="button" data-owner-button className={`${secondary} ${styles.icon}`} disabled={blocked || !!picked} aria-label={`Edit ${entry.name}`} onClick={() => openEditor(key)}><Pencil /></button>
      <button type="button" data-owner-button className={`${secondary} ${styles.trash}`} disabled={blocked || !!picked} aria-label={`${entry.hidden ? "Show" : isBuiltinLabel(key) ? "Hide" : "Delete"} ${entry.name}`} onClick={() => remove(key)}>{entry.hidden ? <span className={styles.show}>Show</span> : <TrashIcon />}</button>
    </div>; })}</div>
    {ghost && picked && <div className={`${styles.row} ${styles.ghost}`} aria-hidden="true" style={{ left: ghost.x, top: ghost.y, width: ghost.width, height: ghost.height } as CSSProperties}><span className={styles.ordinal}>{rows.indexOf(picked) + 1}.</span><strong>{value.entries[picked].name}</strong><Pencil /><TrashIcon /></div>}
    <p className={styles.hint} role="status">{picked ? `${value.entries[picked].name} picked up. Position ${rows.indexOf(picked) + 1} of ${rows.length}.` : feedback}</p>
    {edit && <Dialog title={edit.fresh ? "Add label" : "Edit label"} dismissDisabled={disabled} onClose={closeEditor} actions={<><button type="button" data-owner-button className={secondary} disabled={disabled} onClick={closeEditor}>Cancel</button><button type="button" data-owner-button className={primary} disabled={disabled || !editValid} onClick={saveEditor}>Save label</button></>}>
      {
// eslint-disable-next-line react-hooks/refs -- Pure field renderer only attaches the callback to input events; it never invokes it while rendering.
labelAppearanceFields(edit,disabled,updateEdit,edit.key === "status" ? "Card wording only; actual commission status and retention stay unchanged." : edit.key === "information" ? "Hiding this group hides manual badges without unassigning them." : isBuiltinLabel(edit.key) ? "Badge appearance only, not payment or commission meaning." : "Updates currently assigned cards; saved history is kept.")}
    </Dialog>}
    {deleting && <Dialog title={`Delete ${value.entries[deleting].name}?`} dismissDisabled={disabled} onClose={() => { if (!disabled) { deletingRef.current = null; setDeleting(null); } }} actions={<><button type="button" data-owner-button className={secondary} disabled={disabled} onClick={() => { deletingRef.current = null; setDeleting(null); }}>Cancel</button><button type="button" data-owner-button className={primary} disabled={disabled} onClick={confirmDelete}>Delete label</button></>}><p>This removes the label from future choices. Cards already using it keep their last saved name and color, and history stays intact. Unsaved edits to this label are discarded. Unassign it separately from a commission to remove that badge.</p></Dialog>}
  </div>;
}
