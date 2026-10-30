"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { validElementBox, type ElementBox } from "@/owner/box-geometry";
import styles from "./GeometryBox.module.css";
import { layoutSize } from "@/owner/box-affine";
/** Only customized boxes add a wrapper; old published content keeps its original DOM. */
export function GeometryBox({ box, children, target, editable, inline = false }: { box?: ElementBox; children: ReactNode; target?: string; editable?: boolean; inline?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const contents = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<{ width: number; naturalHeight: number } | null>(null);
  const valid = validElementBox(box);
  const baseWidth = valid ? box.baseWidthPx : 0, baseHeight = valid ? box.baseHeightPx : 0;
  const flowMode = valid && !!box.flow, widthPercent = valid ? box.widthPercent : 0, referenceParent = valid ? box.referenceParentPx : 0;
  useLayoutEffect(() => {
    const frame = ref.current, source = contents.current;
    if (!valid || !frame || !source) { setSize(null); return; }
    let active = true;
    let measured = { width: layoutSize(frame, "width"), naturalHeight: layoutSize(source, "height") };
    // DOMRects include ancestor transforms/zoom. Feeding those pixels back into
    // a transform compounds scale. Observe layout boxes, never visual bounds or
    // scrollHeight (which can include transformed descendant overflow).
    const measure = (entries: ResizeObserverEntry[] = []) => {
      if (!active) return;
      const frameEntry = entries.find(entry => entry.target === frame);
      const sourceEntry = entries.find(entry => entry.target === source);
      const width = frameEntry?.contentRect.width ?? (entries.length ? measured.width : layoutSize(frame, "width"));
      const naturalHeight = sourceEntry?.contentRect.height ?? (entries.length ? measured.naturalHeight : layoutSize(source, "height"));
      if (!Number.isSafeInteger(Math.ceil(width)) || width <= 0 || !Number.isSafeInteger(Math.ceil(naturalHeight)) || naturalHeight <= 0) return;
      measured = { width, naturalHeight };
      setSize(current => current?.width === width && current.naturalHeight === naturalHeight ? current : { width, naturalHeight });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(frame); observer?.observe(source);
    const resize = () => measure();
    window.addEventListener("resize", resize);
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [valid, baseWidth, baseHeight, flowMode, widthPercent, referenceParent]);
  if (!valid) return <>{children}</>;
  const designWidth = box.referenceParentPx * box.widthPercent / 100;
  const actualWidth = size?.width ?? designWidth;
  const responsiveScale = actualWidth / designWidth;
  const scaleX = actualWidth / box.baseWidthPx, scaleY = box.heightPx * responsiveScale / box.baseHeightPx;
  const height = Math.max(box.baseHeightPx, size?.naturalHeight ?? box.baseHeightPx) * scaleY;
  const Tag = inline ? "span" : "div";
  if (box.flow) {
    const slotWidthPercent = box.baseWidthPx / box.referenceParentPx * 100;
    const frameWidthPercent = designWidth / box.baseWidthPx * 100;
    const margin = (value: number) => `${value / box.referenceParentPx * 100}%`;
    return <Tag className={`${styles.flowSlot} ${inline ? styles.inline : ""}`} data-owner-flow-slot="true" style={{ width: `${slotWidthPercent}%`, height: height + box.yPx * responsiveScale, marginTop: margin(box.flow.marginTopPx), marginRight: margin(box.flow.marginRightPx), marginBottom: margin(box.flow.marginBottomPx), marginLeft: margin(box.flow.marginLeftPx) }}>
      <Tag ref={node => { ref.current = node; }} className={`${styles.frame} ${styles.flowFrame}`} data-owner-geometry="true" data-owner-edit={editable ? target : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? "Edit content box" : undefined} style={{ width: `${frameWidthPercent}%`, height, left: `${(box.xPercent-box.flow.xPercent)/slotWidthPercent*100}%`, top: box.yPx * responsiveScale, transform: box.rotationDeg ? `rotate(${box.rotationDeg}deg)` : undefined, transformOrigin: "center center" }}>
        <Tag ref={node => { contents.current = node; }} className={`${styles.contents} ${styles.flowContents}`} style={{ width: box.baseWidthPx + 1/64, minHeight: box.baseHeightPx, transform: `scale(${scaleX}, ${scaleY})` }}>{children}</Tag>
      </Tag>
    </Tag>;
  }
  return <Tag ref={node => { ref.current = node; }} className={`${styles.frame} ${inline ? styles.inline : ""}`} data-owner-geometry="true" data-owner-edit={editable ? target : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? "Edit content box" : undefined} style={{ width: `${box.widthPercent}%`, height, marginLeft: `${box.xPercent}%`, marginTop: box.yPx * responsiveScale, transform: box.rotationDeg ? `rotate(${box.rotationDeg}deg)` : undefined, transformOrigin: "center center" }}><Tag ref={node => { contents.current = node; }} className={styles.contents} style={{ width: box.baseWidthPx, minHeight: box.baseHeightPx, transform: `scale(${scaleX}, ${scaleY})` }}>{children}</Tag></Tag>;
}
