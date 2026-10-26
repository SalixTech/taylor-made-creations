"use client";

import { useId, useState } from "react";
import { boundedNumber, normalizeHexColor } from "./builder-interactions";
import styles from "./OwnerDesignPanel.module.css";

/** Keep partial typing local. Only complete, bounded values enter the draft. */
export function OwnerNumberInput({ label, value, min, max, step = 1, unit, hint, placeholder = "Inherited", onChange }: {
  label: string; value?: number; min: number; max: number; step?: number; unit?: string; hint?: string; placeholder?: string; onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  const [typing, setTyping] = useState<string | null>(null);
  const invalid = typing !== null && typing !== "" && boundedNumber(typing, min, max) === undefined;
  return <div className={styles.numberField}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.numberEntry}><input id={id} type="number" min={min} max={max} step={step} value={typing ?? value ?? ""} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onFocus={() => setTyping(String(value ?? ""))} onChange={event => {
      const raw = event.target.value; setTyping(raw);
      if (event.target.validity?.badInput) return;
      if (raw === "") onChange(undefined);
      else { const number = boundedNumber(raw, min, max); if (number !== undefined) onChange(number); }
    }} onBlur={() => setTyping(null)} />{unit && <span aria-hidden="true">{unit}</span>}</div>
    <small id={`${id}-hint`}>{invalid ? `Enter a number from ${min} to ${max}. Your last valid value is kept.` : hint ?? `${min}–${max}${unit ?? ""}. Clear to use the website default.`}</small>
  </div>;
}

export function OwnerHexInput({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const id = useId();
  const [typing, setTyping] = useState<string | null>(null);
  const invalid = typing !== null && !normalizeHexColor(typing);
  return <div className={styles.hexField}>
    <label htmlFor={id}>{label} hex</label>
    <input id={id} type="text" inputMode="text" maxLength={7} spellCheck={false} autoComplete="off" value={typing ?? value.toUpperCase()} placeholder="#800014" aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} onFocus={() => setTyping(value.toUpperCase())} onChange={event => { const raw = event.target.value; setTyping(raw); const color = normalizeHexColor(raw); if (color) onChange(color); }} onBlur={() => setTyping(null)} />
    {invalid && <small id={`${id}-error`}>Use 3 or 6 hex digits. Last valid color is kept.</small>}
  </div>;
}
