"use client";

import { useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { inlinePlainText, editInlinePlainText, applyInlineHyperlink, inlineLinkAtSelection, snapGraphemeRange, type InlineSelection } from "./inline-text-editing";
import styles from "./OwnerPortal.module.css";
import controls from "./OwnerLinkedTextField.module.css";
import buttons from "./OwnerButton.module.css";

type Props = { label: string; value: string; onChange: (value: string) => void | boolean; hint?: string; multiline?: boolean; selectionHint?: InlineSelection; contextKey: string; linkRequest?: InlineSelection & { requestId: number } };
/** Plain-text inputs retain portable, validated links; local insertion never publishes. */
export function OwnerLinkedTextField({ label, value, onChange, hint, multiline = false, selectionHint, contextKey, linkRequest }: Props) {
  const id = useId(), ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [href, setHref] = useState("");
  const [selection, setSelection] = useState<InlineSelection | null>(null), [selectionContext, setSelectionContext] = useState(contextKey), [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const container=useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const tracked = useRef<(InlineSelection & { contextKey: string }) | null>(null), composing = useRef(false), pending = useRef(false);
  const live = useRef({ value, contextKey, onChange, mounted: true }), requestSeen = useRef<number | null>(null);
  useLayoutEffect(() => { live.current = { value, contextKey, onChange, mounted: true }; return () => { live.current.mounted = false; }; }, [value, contextKey, onChange]);
  const plain = inlinePlainText(value);
  function remember() { const input = ref.current; if (input && !composing.current) tracked.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0, value, contextKey }; }
  function openFor(captured: InlineSelection) {
    if (pending.current || composing.current || captured.value !== value) return;
    const normalized=snapGraphemeRange(plain,captured.start,captured.end);if(!normalized){setError("This selection could not be read safely. Select the complete character again.");return;}
    const safe={...normalized,value},link = inlineLinkAtSelection(value, safe), chosen = link?.selection ?? safe;
    if(chosen.end<=chosen.start){setError("Highlight the words you want to link first.");return;}
    setSelection(chosen); setSelectionContext(contextKey);
    setName(link?.label ?? plain.slice(chosen.start, chosen.end)); setHref(link?.href ?? "");
    setEditing(!!link); setError(""); setNotice(""); setOpen(true);
  }
  useLayoutEffect(() => {
    if (linkRequest && linkRequest.value === value && requestSeen.current !== linkRequest.requestId) { requestSeen.current = linkRequest.requestId; openFor(linkRequest); }
    // A request is a single captured user action, not a subscription to field edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkRequest?.requestId, value, contextKey]);
  function insert() {
    if (pending.current || composing.current) return;
    if (!contextKey || !selection || selection.value !== value || selectionContext !== contextKey) { setError("This text changed while the link controls were open. Close these controls and select the text again."); return; }
    const next = applyInlineHyperlink(value, selection, name, href, "selection");
    if (next === null) { setError("Choose nonempty link text and a safe site path, HTTPS address, email link or section anchor."); return; }
    const expected = value, scope = contextKey;
    pending.current = true; setBusy(true); setError("");
    // Yield for truthful local application feedback. No network operation or simulated percentage.
    setTimeout(() => {
      try {
        if (!live.current.mounted) return;
        if (live.current.value !== expected || live.current.contextKey !== scope) { setError("This text changed while the link controls were open. Select it again; nothing was inserted."); return; }
        if (live.current.onChange(next) === false) { setError("The selected text changed. Select it again; nothing was inserted."); return; }
        setOpen(false); setNotice(editing ? "Link updated in your draft." : "Link added to your draft.");
        setName(""); setHref(""); ref.current?.focus();
      } finally { pending.current = false; if (live.current.mounted) setBusy(false); }
    }, 0);
  }
  useLayoutEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!pending.current&&!container.current?.contains(event.target as Node))setOpen(false);};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[open]);
  const input = { id, value: plain, disabled: busy, onSelect: remember, onKeyUp: remember, onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; remember(); }, onChange: (event: { target: { value: string } }) => onChange(editInlinePlainText(value, event.target.value)), onContextMenu: (event: MouseEvent) => { if (composing.current || pending.current) return; remember(); const captured = tracked.current; if (captured && (captured.end > captured.start || inlineLinkAtSelection(value, captured))) { event.preventDefault(); event.stopPropagation(); openFor(captured); } }, "aria-describedby": hint ? `${id}-hint` : undefined };
  const secondary = `${buttons.button} ${buttons.secondary} ${buttons.compact}`;
  return <div ref={container} data-owner-text-tools className={styles.field} onKeyDown={event=>{if(event.key==="Escape"&&open&&!busy&&!composing.current&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();setOpen(false);}}}>
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...input} ref={element => { ref.current = element; }} rows={4} /> : <input {...input} ref={element => { ref.current = element; }} type="text" />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    <button data-owner-button type="button" disabled={busy} className={`${buttons.button} ${buttons.quiet} ${buttons.compact}`} aria-expanded={open} aria-controls={`${id}-links`} onClick={() => {
      if (open) { setOpen(false); return; }
      const external = selectionHint?.value === value ? selectionHint : null, saved = tracked.current?.value === value && tracked.current.contextKey === contextKey ? tracked.current : external;
      const current = ref.current, start = saved?.start ?? (document.activeElement === current ? current?.selectionStart : plain.length) ?? plain.length, end = saved?.end ?? (document.activeElement === current ? current?.selectionEnd : start) ?? start;
      openFor({ start, end, value });
    }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></svg>Add hyperlink</button>
    {notice && <p role="status">{notice}</p>}
    {!open&&error&&<p role="alert">{error}</p>}
    {open && <div className={controls.linkEditor} id={`${id}-links`} aria-busy={busy}>
      <p>{editing ? "Edit existing hyperlink" : "Link highlighted text"}</p>
      {selection&&<p><mark className={controls.selectionPreview}>{plain.slice(selection.start,selection.end)}</mark></p>}
      <label>Link text<input value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <label>Link destination<input value={href} disabled={busy} placeholder="https://example.com or /contact" onChange={event => setHref(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); insert(); } }} /></label>
      {error && <p role="alert">{error}</p>}
      {busy && <div role="status" className={controls.applying}><span className={controls.progress} aria-hidden="true" />Applying link to your draft…</div>}
      <div><button data-owner-button type="button" disabled={busy} className={secondary} onClick={() => { setOpen(false); ref.current?.focus(); }}>Cancel</button><button data-owner-button type="button" disabled={busy} className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} onClick={insert}>{editing ? "Update link" : "Insert link"}</button></div>
    </div>}
  </div>;
}
