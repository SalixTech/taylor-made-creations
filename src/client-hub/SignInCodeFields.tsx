"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";
import { cleanCodeSegment, CODE_SEGMENT_LENGTHS, codeSegments, joinCodeSegments, pastedSignInCode } from "./code-input";
import styles from "./SignInCodeFields.module.css";

type Props = { value: string; onChange: (value: string) => void; disabled: boolean; show: boolean; invalid: boolean; inputRef: RefObject<HTMLInputElement | null>; describedBy: string };
const labels = ["Part 1: three letters or numbers", "Part 2: three name letters", "Part 3: three numbers", "Part 4: two letters"];
export function SignInCodeFields({ value, onChange, disabled, show, invalid, inputRef, describedBy }: Props) {
  const legacy = pastedSignInCode(value)?.kind === "legacy";
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const parts = codeSegments(value);
  function focus(index: number) { fields.current[index]?.focus(); fields.current[index]?.select(); }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = pastedSignInCode(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault(); onChange(pasted.value);
    if (pasted.kind === "compact") requestAnimationFrame(() => focus(3));
  }
  function change(index: number, raw: string) {
    const whole = pastedSignInCode(raw);
    if (whole) { onChange(whole.value); if (whole.kind === "compact") focus(3); return; }
    const next = [...parts] as typeof parts;
    next[index] = cleanCodeSegment(raw, index).slice(0, CODE_SEGMENT_LENGTHS[index]);
    onChange(joinCodeSegments(next));
    if (next[index].length === CODE_SEGMENT_LENGTHS[index] && index < 3) focus(index + 1);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !parts[index] && index > 0) {
      event.preventDefault(); const next = [...parts] as typeof parts;
      next[index - 1] = next[index - 1].slice(0, -1); onChange(joinCodeSegments(next)); focus(index - 1);
    } else if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0 && index > 0) { event.preventDefault(); focus(index - 1); }
    else if (event.key === "ArrowRight" && event.currentTarget.selectionStart === parts[index].length && index < 3) { event.preventDefault(); focus(index + 1); }
  }
  return <div className={styles.root}>
    {legacy ? <input ref={inputRef} id="client-signin-code" className={styles.legacy} name="client-code-legacy" type={show ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} onPaste={paste} placeholder="A10-TSE-621-FC" aria-label="Client code" required maxLength={160} autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy} /> : <div className={styles.segments} role="group" aria-labelledby="client-code-label" aria-describedby={describedBy}>
      {CODE_SEGMENT_LENGTHS.map((length, index) => <span className={styles.part} key={index}>
        {index > 0 && <span className={styles.hyphen} aria-hidden="true">-</span>}
        <input ref={node => { fields.current[index] = node; if (index === 0) inputRef.current = node; }} id={index === 0 ? "client-signin-code" : `client-signin-code-${index + 1}`} name={`client-code-part-${index + 1}`} aria-label={labels[index]} type={show ? "text" : "password"} inputMode={index === 2 ? "numeric" : "text"} autoCapitalize="characters" autoComplete={index === 0 ? "one-time-code" : "off"} autoCorrect="off" spellCheck={false} value={parts[index]} onChange={event => change(index, event.target.value)} onPaste={paste} onKeyDown={event => keyDown(event, index)} placeholder={["GDT", "TSE", "621", "FC"][index]} required minLength={length} maxLength={length} pattern={index === 2 ? "[0-9]{3}" : index === 0 ? "[A-Za-z0-9]{3}" : `[A-Za-z]{${length}}`} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy} />
      </span>)}
    </div>}

  </div>;
}
