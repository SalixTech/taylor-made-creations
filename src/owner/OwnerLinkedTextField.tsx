"use client";

import { useId, useRef, useState } from "react";
import { makeInlineLink } from "./inline-links";
import styles from "./OwnerPortal.module.css";
import controls from "./OwnerLinkedTextField.module.css";
import buttons from "./OwnerButton.module.css";

type Props = { label: string; value: string; onChange: (value: string) => void; hint?: string; multiline?: boolean };
/** The insertion tool keeps selection local and stores safe, portable link text. */
export function OwnerLinkedTextField({ label, value, onChange, hint, multiline = false }: Props) {
  const id = useId();
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [href, setHref] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number; value: string } | null>(null);
  const [error, setError] = useState("");
  function insert() {
    const link = makeInlineLink(name, href);
    if (!link) { setError("Add link text and a site path, HTTPS address, email link or section anchor."); return; }
    // Another control may have changed this field while the link tool was open.
    const unchanged = selection?.value === value;
    const start = unchanged ? selection.start : value.length, end = unchanged ? selection.end : value.length;
    const prefix = !unchanged && value && !/\s$/.test(value) ? " " : "";
    onChange(value.slice(0, start) + prefix + link + value.slice(end));
    setOpen(false); setError(""); setName(""); setHref("");
    ref.current?.focus();
  }
  const input = { id, value, onChange: (event: { target: { value: string } }) => onChange(event.target.value), "aria-describedby": hint ? `${id}-hint` : undefined };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...input} ref={element => { ref.current = element; }} rows={4} /> : <input {...input} ref={element => { ref.current = element; }} type="text" />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    <button data-owner-button type="button" className={`${buttons.button} ${buttons.quiet} ${buttons.compact}`} aria-expanded={open} aria-controls={`${id}-links`} onClick={() => {
      if (open) { setOpen(false); return; }
      const start = ref.current?.selectionStart ?? value.length, end = ref.current?.selectionEnd ?? start;
      setSelection({ start, end, value }); setName(value.slice(start, end)); setError(""); setOpen(true);
    }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></svg>Add hyperlink</button>
    {open && <div className={controls.linkEditor} id={`${id}-links`}>
      <label>Link text<input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Link destination<input value={href} placeholder="https://example.com or /contact" onChange={event => setHref(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); insert(); } }} /></label>
      {error && <p role="alert">{error}</p>}
      <div><button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} onClick={() => { setOpen(false); ref.current?.focus(); }}>Cancel</button><button data-owner-button type="button" className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} onClick={insert}>Insert link</button></div>
    </div>}
  </div>;
}
