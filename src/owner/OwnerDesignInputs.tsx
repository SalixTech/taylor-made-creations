"use client";

import { useId, useRef, useState } from "react";
import { boundedNumber, normalizeHexColor } from "./builder-interactions";
import styles from "./OwnerDesignPanel.module.css";

/** Keep partial typing local. Only complete, bounded values enter the draft. */
export function OwnerNumberInput({ label, value, min, max, step = 1, unit, hint, placeholder = "Inherited", commitMode = "change", disabled = false, onChange }: {
  label: string; value?: number; min: number; max: number; step?: number; unit?: string; hint?: string; placeholder?: string; commitMode?: "change" | "blur"; disabled?: boolean; onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  const [typing, setTyping] = useState<string | null>(null);
  const composing = useRef(false), touched = useRef(false);
  const invalid = typing !== null && typing !== "" && boundedNumber(typing, min, max) === undefined;
  function commit(raw: string) {
    if (disabled || composing.current || !touched.current) return;
    touched.current = false;
    if (raw === "") onChange(undefined);
    else { const number = boundedNumber(raw, min, max); if (number !== undefined && number !== value) onChange(number); }
  }
  return <div className={styles.numberField}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.numberEntry}><input id={id} type="number" min={min} max={max} step={step} value={typing ?? value ?? ""} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} disabled={disabled} onFocus={() => { touched.current = false; setTyping(String(value ?? "")); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => {
      composing.current = false; const raw = event.currentTarget.value; setTyping(raw);
      if (commitMode === "change" && !disabled && !event.currentTarget.validity?.badInput) {
        if (raw === "") onChange(undefined);
        else { const number = boundedNumber(raw, min, max); if (number !== undefined) onChange(number); }
      }
    }} onChange={event => {
      const raw = event.target.value; setTyping(raw); touched.current = true;
      if (disabled || composing.current || (event.nativeEvent as InputEvent)?.isComposing || event.target.validity?.badInput || commitMode === "blur") return;
      if (raw === "") onChange(undefined);
      else { const number = boundedNumber(raw, min, max); if (number !== undefined) onChange(number); }
    }} onKeyDown={event => {
      if (commitMode !== "blur" || composing.current || event.nativeEvent?.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); touched.current = false; setTyping(null); }
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!event.currentTarget.validity?.badInput) commit(event.currentTarget.value); setTyping(null); }
    }} onBlur={event => { if (commitMode === "blur" && !event.currentTarget.validity?.badInput) commit(event.currentTarget.value); touched.current = false; setTyping(null); }} />{unit && <span aria-hidden="true">{unit}</span>}</div>
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
