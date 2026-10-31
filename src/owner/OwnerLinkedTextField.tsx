"use client";

import { useId, useRef, useState } from "react";
import {inlinePlainText,editInlinePlainText,applyInlineHyperlink,type InlineSelection} from "./inline-text-editing";
import styles from "./OwnerPortal.module.css";
import controls from "./OwnerLinkedTextField.module.css";
import buttons from "./OwnerButton.module.css";

type Props = { label: string; value: string; onChange: (value: string) => void; hint?: string; multiline?: boolean; selectionHint?:InlineSelection };
/** The insertion tool keeps selection local and stores safe, portable link text. */
export function OwnerLinkedTextField({ label, value, onChange, hint, multiline = false, selectionHint }: Props) {
  const id = useId();
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [href, setHref] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number; value: string } | null>(null);
  const [error, setError] = useState("");
  const [mode,setMode]=useState<"selection"|"insert"|null>(null);
  const tracked=useRef<InlineSelection|null>(null);
  const plain=inlinePlainText(value);
  function remember(){const input=ref.current;if(input)tracked.current={start:input.selectionStart??0,end:input.selectionEnd??0,value};}
  function insert() {
    if(!mode||!selection){setError("Select existing text, or choose Insert new link at the cursor.");return;}
    if(selection.value!==value){setError("This text changed while the link controls were open. Close these controls and select the text again.");return;}
    const next=applyInlineHyperlink(value,selection,name,href,mode);
    if(next===null){setError("Choose nonempty link text and a safe site path, HTTPS address, email link or section anchor.");return;}
    onChange(next);
    setOpen(false); setError(""); setName(""); setHref("");
    ref.current?.focus();
  }
  const input = { id, value:plain, onSelect:remember, onKeyUp:remember, onChange: (event: { target: { value: string } }) => onChange(editInlinePlainText(value,event.target.value)), "aria-describedby": hint ? `${id}-hint` : undefined };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...input} ref={element => { ref.current = element; }} rows={4} /> : <input {...input} ref={element => { ref.current = element; }} type="text" />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    <button data-owner-button type="button" className={`${buttons.button} ${buttons.quiet} ${buttons.compact}`} aria-expanded={open} aria-controls={`${id}-links`} onClick={() => {
      if (open) { setOpen(false); return; }
      const external=selectionHint?.value===value?selectionHint:null;
      const saved=external??(tracked.current?.value===value?tracked.current:null);
      const current=ref.current;const start=saved?.start??(document.activeElement===current?current?.selectionStart:plain.length)??plain.length,end=saved?.end??(document.activeElement===current?current?.selectionEnd:start)??start;
      setSelection({start,end,value});setMode(end>start?"selection":null);setName(plain.slice(start,end));setError("");setOpen(true);
    }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></svg>Add hyperlink</button>
    {open && <div className={controls.linkEditor} id={`${id}-links`}>
      <div><button type="button" disabled={!selection||selection.start===selection.end} aria-pressed={mode==="selection"} onClick={()=>setMode("selection")}>Link selected text</button><button type="button" aria-pressed={mode==="insert"} onClick={()=>setMode("insert")}>Insert new link at cursor</button></div>
      {!mode&&<p>Select words to link, or explicitly insert a new link at the cursor. Existing words will not be overwritten.</p>}
      <label>Link text<input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Link destination<input value={href} placeholder="https://example.com or /contact" onChange={event => setHref(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); insert(); } }} /></label>
      {error && <p role="alert">{error}</p>}
      <div><button data-owner-button type="button" className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} onClick={() => { setOpen(false); ref.current?.focus(); }}>Cancel</button><button data-owner-button type="button" className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} onClick={insert}>Insert link</button></div>
    </div>}
  </div>;
}
