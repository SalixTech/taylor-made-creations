"use client";
import { useRef, useState } from "react";
import { CLIENT_INFORMATION_TAG_LABELS } from "@/client-hub/presentation";
import type { ClientHubInformationTag } from "@/client-hub/model";
import styles from "./OwnerClientHub.module.css";

export function LabelHierarchyEditor({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [dragView, setDragView] = useState<{x:number;y:number;target?:string}|null>(null);
  const original = useRef<string[] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; tag: string; x: number; y: number; moved: boolean } | null>(null);
  const label = (tag: string) => tag === "status" ? "Commission status" : tag === "information" ? "Information labels" : CLIENT_INFORMATION_TAG_LABELS[tag as ClientHubInformationTag] ?? tag.replace(/^custom:/, "");
  function begin(tag: string) { if (disabled) return; original.current = [...value]; setPicked(tag); }
  function move(tag: string, target: string) { if (disabled || tag === target) return; const from = value.indexOf(tag), to = value.indexOf(target); if (from < 0 || to < 0) return; const next = [...value]; next.splice(from, 1); next.splice(to, 0, tag); onChange(next); }
  function finish(cancel = false) { if (cancel && original.current && !pointer.current) onChange(original.current); original.current = null; pointer.current = null; setPicked(null); setDragView(null); }
  function targetAt(x: number, y: number) {
    // Use this list's live geometry, not a drag ghost or captured event target.
    for (const row of list.current?.querySelectorAll<HTMLElement>("[data-label-key]") ?? []) {
      const rect = row.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return row.dataset.labelKey;
    }
  }
  return <><p className={styles.hint}>Drag a label to reorder. With a keyboard, press Space to pick it up, use arrow keys to move, then Space to drop. Escape cancels.</p><div ref={list} className={styles.hierarchyList} role="list" aria-label="Card label order">{value.map((tag,index) => <div key={tag} role="listitem" className={styles.hierarchyRow} data-label-key={tag} data-dragging={picked === tag || undefined} data-drop-target={dragView?.target === tag || undefined}><button type="button" data-owner-button className={styles.hierarchyHandle} disabled={disabled} draggable={false} aria-label={`Reorder ${label(tag)}`} aria-pressed={picked === tag} onKeyDown={event => { if (disabled) return; if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (picked === tag) finish(); else begin(tag); } else if (picked === tag && event.key === "Escape") { event.preventDefault(); finish(true); } else if (picked === tag && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); const target = value[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) move(tag, target); } }} onPointerDown={event => {
    if (disabled || event.button !== 0 || pointer.current) return;
    pointer.current = { id:event.pointerId, tag, x:event.clientX, y:event.clientY, moved:false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const drag = pointer.current; if (!drag || drag.id !== event.pointerId || disabled) return;
    if (drag.moved) setDragView({x:event.clientX,y:event.clientY,target:targetAt(event.clientX,event.clientY)});
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 5) { drag.moved = true; begin(drag.tag); setDragView({x:event.clientX,y:event.clientY,target:targetAt(event.clientX,event.clientY)}); }
  }} onPointerUp={event => {
    const drag = pointer.current; if (!drag || drag.id !== event.pointerId) return;
    if (!disabled && drag.moved) { const target = targetAt(event.clientX,event.clientY); if (target) move(drag.tag,target); }
    finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }} onPointerCancel={() => finish(true)} onLostPointerCapture={() => { if (pointer.current) finish(true); }}><span>{label(tag)}</span><small>{index + 1}</small></button></div>)}</div>{dragView && picked && <div className={styles.labelDragGhost} aria-hidden="true" style={{left:dragView.x+12,top:dragView.y+12}}>{label(picked)}</div>}<span className={styles.reorderStatus} role="status">{picked ? `${label(picked)} picked up. Position ${value.indexOf(picked) + 1} of ${value.length}.` : ""}</span></>;
}
