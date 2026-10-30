"use client";
import { useEffect, useRef } from "react";
/** Whole-unit nudges preserve existing cents instead of rounding a saved price. */
export function stepWholeNumber(value: string | number, direction: -1 | 1): string {
  const amount = Number(value);
  return String(Math.max(0, Math.round((Number.isFinite(amount) ? amount : 0) * 100) + direction * 100) / 100);
}
/** A non-passive listener can consume a focused price wheel without scrolling the page. */
export function useWholeNumberWheel(value: string | number, onChange: (value: string) => void, enabled: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (!input || !enabled) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== input || input.disabled || input.readOnly || event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      onChange(stepWholeNumber(value, event.deltaY < 0 ? 1 : -1));
    };
    input.addEventListener("wheel", wheel, { passive: false });
    return () => input.removeEventListener("wheel", wheel);
  }, [enabled, value, onChange]);
  return ref;
}
