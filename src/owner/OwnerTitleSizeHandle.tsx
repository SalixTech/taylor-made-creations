"use client";

import { useRef, useState } from "react";
import styles from "./OwnerVisualBuilder.module.css";

const constrain = (size: number) => Math.max(8, Math.min(240, Math.round(size)));

export function OwnerTitleSizeHandle({ size, onSize }: { size: number; onSize: (size: number) => void }) {
  const drag = useRef<{ x: number; pointerId: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  return <button
    type="button"
    data-owner-button
    data-owner-canvas-controls
    className={styles.titleSizeHandle}
    aria-label="Resize title text"
    title="Drag left or right to change title size. Arrow keys adjust by one pixel."
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, pointerId: event.pointerId };
      setPreview(size);
    }}
    onPointerMove={event => {
      if (drag.current?.pointerId === event.pointerId) setPreview(constrain(size + (event.clientX - drag.current.x) / 2));
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      const next = constrain(size + (event.clientX - drag.current.x) / 2);
      drag.current = null;
      setPreview(null);
      if (next !== Math.round(size)) onSize(next);
    }}
    onLostPointerCapture={() => { drag.current = null; setPreview(null); }}
    onKeyDown={event => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        drag.current = null;
        setPreview(null);
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onSize(constrain(size + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1)));
    }}
  >{preview === null ? "Resize title text" : `${preview} px`}</button>;
}
