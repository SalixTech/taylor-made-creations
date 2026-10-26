"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { OwnerPage, PageBlock } from "./model";
import { MoveButtons } from "./OwnerFields";
import { resizePercent } from "./builder-interactions";
import styles from "./OwnerVisualBuilder.module.css";

type Bounds = { left: number; top: number; width: number; height: number; parentWidth: number };
type Resize = { pointerId: number; x: number; y: number; width: number; height: number; parentWidth: number; viewportHeight: number; originalWidth?: number; originalHeight?: number };
export function OwnerCanvasSectionTools({ canvasRef, page, block, disabled, onEdit, onAnnouncement }: {
  canvasRef: RefObject<HTMLDivElement | null>; page: OwnerPage; block: PageBlock; disabled: boolean; onEdit: (change: (page: OwnerPage) => void) => void; onAnnouncement: (message: string) => void;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const resizing = useRef<Resize | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const node = canvas && Array.from(canvas.querySelectorAll<HTMLElement>("[data-owner-edit]")).find(item => item.dataset.ownerEdit === `block:${block.id}`);
    if (!canvas || !node || !node.getBoundingClientRect) return;
    const update = () => { const rect = node.getBoundingClientRect(); const base = canvas.getBoundingClientRect(); const next = { left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height, parentWidth: node.parentElement?.getBoundingClientRect().width ?? base.width }; setBounds(previous => previous && Object.entries(next).every(([key, value]) => previous[key as keyof Bounds] === value) ? previous : next); };
    const frame = requestAnimationFrame(update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(node); observer?.observe(canvas);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [canvasRef, block, page]);
  function apply(width: number, height: number) { if (disabled) return; onEdit(target => { const item = target.blocks.find(item => item.id === block.id); if (item) { item.appearance ??= {}; item.appearance.widthPercent = width; item.appearance.heightPercent = height; } }); }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || !bounds || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const viewportHeight = Math.max(1, window.innerHeight);
    resizing.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: block.appearance?.widthPercent ?? bounds.width / bounds.parentWidth * 100, height: block.appearance?.heightPercent ?? bounds.height / viewportHeight * 100, parentWidth: bounds.parentWidth, viewportHeight, originalWidth: block.appearance?.widthPercent, originalHeight: block.appearance?.heightPercent };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function cancelResize(button: HTMLButtonElement) {
    const state = resizing.current; if (!state) return;
    onEdit(target => { const item = target.blocks.find(item => item.id === block.id); if (!item?.appearance) return; if (state.originalWidth === undefined) delete item.appearance.widthPercent; else item.appearance.widthPercent = state.originalWidth; if (state.originalHeight === undefined) delete item.appearance.heightPercent; else item.appearance.heightPercent = state.originalHeight; });
    resizing.current = null; if (button.hasPointerCapture(state.pointerId)) button.releasePointerCapture(state.pointerId); onAnnouncement("Section resize canceled.");
  }
  if (!bounds) return null;
  const index = page.blocks.findIndex(item => item.id === block.id);
  return <div className={styles.sectionTools} data-owner-canvas-controls="true">
    <div className={styles.sectionMoveTools} style={{ left: Math.max(0, bounds.left), top: Math.max(0, bounds.top - 30) }}><span>Section {index + 1}</span><MoveButtons label={`selected section ${index + 1}`} index={index} length={page.blocks.length} onMove={direction => { if (disabled) return; onEdit(target => { const from = target.blocks.findIndex(item => item.id === block.id); const to = from + direction; if (from >= 0 && to >= 0 && to < target.blocks.length) [target.blocks[from], target.blocks[to]] = [target.blocks[to], target.blocks[from]]; }); onAnnouncement("Section order updated in your draft."); }} /></div>
    <button type="button" className={styles.resizeHandle} style={{ left: Math.max(0, bounds.left + bounds.width - 28), top: Math.max(0, bounds.top + bounds.height - 28) }} disabled={disabled} aria-label="Resize selected section. Left and right arrows adjust width; up and down arrows adjust minimum height." title="Drag to resize. Or use arrow keys / typed percentages in the editor." onPointerDown={start} onPointerMove={event => { const state = resizing.current; if (!state || state.pointerId !== event.pointerId || disabled) return; apply(resizePercent(state.width, event.clientX - state.x, state.parentWidth, 10, 100), resizePercent(state.height, event.clientY - state.y, state.viewportHeight, 10, 200)); }} onPointerUp={event => { if (!resizing.current) return; resizing.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onAnnouncement("Section size updated in your draft."); }} onPointerCancel={event => cancelResize(event.currentTarget)} onLostPointerCapture={event => { if (resizing.current) cancelResize(event.currentTarget); }} onKeyDown={event => { if (event.key === "Escape" && resizing.current) { event.preventDefault(); event.stopPropagation(); cancelResize(event.currentTarget); return; } if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1; const width = block.appearance?.widthPercent ?? Math.round(bounds.width / bounds.parentWidth * 100); const height = block.appearance?.heightPercent ?? Math.round(bounds.height / Math.max(1, window.innerHeight) * 100); apply(Math.min(100, Math.max(10, width + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0))), Math.min(200, Math.max(10, height + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)))); onAnnouncement("Section size updated in your draft."); }}>↘</button>
  </div>;
}
