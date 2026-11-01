"use client";

import { useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { inlinePlainText, editInlinePlainText, applyInlineHyperlink, removeInlineHyperlink, inlineLinkAtSelection, snapGraphemeRange, type InlineSelection } from "./inline-text-editing";
import { OwnerHyperlinkDialog } from "./OwnerHyperlinkDialog";
import { WebsiteAssetPicker } from "./WebsiteAssetPicker";
import { isWebsiteDocumentHref } from "./model";
import styles from "./OwnerPortal.module.css";
import controls from "./OwnerLinkedTextField.module.css";
import buttons from "./OwnerButton.module.css";

type Props = { revision?: object; disabled?: boolean; label: string; value: string; onChange: (value: string) => void | boolean; hint?: string; multiline?: boolean; selectionHint?: InlineSelection; contextKey: string; linkRequest?: InlineSelection & { requestId: number } };
/** Plain-text inputs retain portable, validated links; local insertion never publishes. */
export function OwnerLinkedTextField({ label, value, onChange, hint, multiline = false, selectionHint, contextKey, linkRequest, revision, disabled = false }: Props) {
  const id = useId(), ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [href, setHref] = useState("");
  const [selection, setSelection] = useState<InlineSelection | null>(null), [selectionContext, setSelectionContext] = useState(contextKey), [error, setError] = useState("");
  const [editing, setEditing] = useState(false), [modal, setModal] = useState(false);
  const container=useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const tracked = useRef<(InlineSelection & { contextKey: string }) | null>(null), composing = useRef(false), pending = useRef(false);
  const activeOpen = useRef(false), generation = useRef(0), selectionRevision = useRef<object | undefined>(revision);
  const live = useRef({ value, contextKey, onChange, revision, disabled, mounted: true }), requestSeen = useRef<number | null>(null);
  useLayoutEffect(() => { live.current = { value, contextKey, onChange, revision, disabled, mounted: true }; return () => { live.current.mounted = false; }; }, [value, contextKey, onChange, revision, disabled]);
  function closeLinkEditor() { activeOpen.current = false; generation.current++; setOpen(false); }
  useLayoutEffect(() => {
    if (activeOpen.current && (selection?.value !== value || selectionContext !== contextKey || selectionRevision.current !== revision)) closeLinkEditor();
  }, [value, contextKey, revision, selection, selectionContext]);
  const [pickerGeneration, setPickerGeneration] = useState(0);
  const plain = inlinePlainText(value);
  function remember() { const input = ref.current; if (input && !composing.current) tracked.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0, value, contextKey }; }
  function openFor(captured: InlineSelection, asModal = false) {
    if (disabled || pending.current || composing.current || captured.value !== value) return;
    const normalized=snapGraphemeRange(plain,captured.start,captured.end);if(!normalized){setError("This selection could not be read safely. Select the complete character again.");return;}
    const safe={...normalized,value},link = inlineLinkAtSelection(value, safe), chosen = link?.selection ?? safe;
    if(chosen.end<=chosen.start){setError("Highlight the words you want to link first.");return;}
    setSelection(chosen); setSelectionContext(contextKey);
    setName(link?.label ?? plain.slice(chosen.start, chosen.end)); setHref(link?.href ?? "");
    setModal(asModal); setEditing(!!link); setError(""); setNotice(""); selectionRevision.current = revision; setPickerGeneration(++generation.current); activeOpen.current = true; setOpen(true);
  }
  useLayoutEffect(() => {
    if (linkRequest && linkRequest.value === value && requestSeen.current !== linkRequest.requestId) { requestSeen.current = linkRequest.requestId; openFor(linkRequest, true); }
    // A request is a single captured user action, not a subscription to field edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkRequest?.requestId, value, contextKey]);
  function applyModalLink(destination:string|null):boolean {
    if (!activeOpen.current || !live.current.mounted || live.current.disabled || pending.current || composing.current || generation.current !== pickerGeneration || !selection || selection.value !== value || live.current.value !== value || live.current.contextKey !== contextKey || selectionContext !== contextKey || live.current.revision !== revision || selectionRevision.current !== revision) return false;
    const next = destination === null ? removeInlineHyperlink(value,selection) : applyInlineHyperlink(value,selection,name,destination,"selection");
    if (next === null || live.current.onChange(next) === false) return false;
    closeLinkEditor(); setNotice(destination===null?"Link removed in your draft.":editing?"Link updated in your draft.":"Link added to your draft."); return true;
  }
  function insert() {
    if (disabled || !activeOpen.current || pending.current || composing.current) return;
    if (!contextKey || !selection || selection.value !== value || selectionContext !== contextKey || selectionRevision.current !== revision) { setError("This text changed while the link controls were open. Close these controls and select the text again."); return; }
    const next = applyInlineHyperlink(value, selection, name, href, "selection");
    if (next === null) { setError("Choose nonempty link text and a safe site path, HTTPS address, email link or section anchor."); return; }
    const expected = value, scope = contextKey, capturedRevision = revision, intent = generation.current;
    pending.current = true; setBusy(true); setError("");
    // Yield for truthful local application feedback. No network operation or simulated percentage.
    setTimeout(() => {
      try {
        if (!live.current.mounted || !activeOpen.current || generation.current !== intent || live.current.disabled) return;
        if (live.current.value !== expected || live.current.contextKey !== scope || live.current.revision !== capturedRevision) { setError("This text changed while the link controls were open. Select it again; nothing was inserted."); return; }
        if (live.current.onChange(next) === false) { setError("The selected text changed. Select it again; nothing was inserted."); return; }
        closeLinkEditor(); setNotice(editing ? "Link updated in your draft." : "Link added to your draft.");
        setName(""); setHref(""); ref.current?.focus();
      } finally { pending.current = false; if (live.current.mounted) setBusy(false); }
    }, 0);
  }
  useLayoutEffect(()=>{if(!open||modal)return;const close=(event:PointerEvent)=>{if(!pending.current&&!container.current?.contains(event.target as Node))closeLinkEditor();};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[open,modal]);
  const input = { id, value: plain, disabled: busy || disabled, onSelect: remember, onKeyUp: remember, onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; remember(); }, onChange: (event: { target: { value: string } }) => { if (!disabled && !busy) onChange(editInlinePlainText(value, event.target.value)); }, onContextMenu: (event: MouseEvent) => { if (disabled || composing.current || pending.current) return; remember(); const captured = tracked.current; if (captured && (captured.end > captured.start || inlineLinkAtSelection(value, captured))) { event.preventDefault(); event.stopPropagation(); openFor(captured); } }, "aria-describedby": hint ? `${id}-hint` : undefined };
  const secondary = `${buttons.button} ${buttons.secondary} ${buttons.compact}`;
  return <div ref={container} data-owner-text-tools className={styles.field} onKeyDown={event=>{if(event.key==="Escape"&&open&&!modal&&!busy&&!composing.current&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();closeLinkEditor();}}}>
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...input} ref={element => { ref.current = element; }} rows={4} /> : <input {...input} ref={element => { ref.current = element; }} type="text" />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    <button data-owner-button type="button" disabled={busy || disabled} className={`${buttons.button} ${buttons.quiet} ${buttons.compact}`} aria-expanded={open} aria-controls={`${id}-links`} onClick={() => {
      if (disabled || busy) return;
      if (open) { closeLinkEditor(); return; }
      const external = selectionHint?.value === value ? selectionHint : null, saved = tracked.current?.value === value && tracked.current.contextKey === contextKey ? tracked.current : external;
      const current = ref.current, start = saved?.start ?? (document.activeElement === current ? current?.selectionStart : plain.length) ?? plain.length, end = saved?.end ?? (document.activeElement === current ? current?.selectionEnd : start) ?? start;
      openFor({ start, end, value });
    }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></svg>Add hyperlink</button>
    {notice && <p role="status">{notice}</p>}
    {!open&&error&&<p role="alert">{error}</p>}
    {open && !modal && <div className={controls.linkEditor} id={`${id}-links`} aria-busy={busy}>
      <p>{editing ? "Edit existing hyperlink" : "Link highlighted text"}</p>
      {selection&&<p><mark className={controls.selectionPreview}>{plain.slice(selection.start,selection.end)}</mark></p>}
      <label>Link text<input value={name} disabled={busy || disabled} onChange={event => setName(event.target.value)} /></label>
      <label>Link destination<input value={href} disabled={busy || disabled} placeholder="https://example.com or /contact" onChange={event => setHref(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); insert(); } }} /></label>
      {!busy && <WebsiteAssetPicker disabled={disabled} key={`${contextKey}:${pickerGeneration}`} kind="document" targetId={`inline-pdf:${contextKey}:${pickerGeneration}`} revision={revision} value={href} onSelect={destination => {
        if (!isWebsiteDocumentHref(destination) || !live.current.mounted || live.current.disabled || pending.current || !activeOpen.current || generation.current !== pickerGeneration || live.current.value !== value || live.current.contextKey !== contextKey || live.current.revision !== revision || selectionRevision.current !== revision) return;
        setHref(destination); setError("");
      }} />}
      {error && <p role="alert">{error}</p>}
      {busy && <div role="status" className={controls.applying}><span className={controls.progress} aria-hidden="true" />Applying link to your draft…</div>}
      <div><button data-owner-button type="button" disabled={busy || disabled} className={secondary} onClick={() => { closeLinkEditor(); ref.current?.focus(); }}>Cancel</button><button data-owner-button type="button" disabled={busy || disabled} className={`${buttons.button} ${buttons.primary} ${buttons.compact}`} onClick={insert}>{editing ? "Update link" : "Insert link"}</button></div>
    </div>}
    {open && modal && <OwnerHyperlinkDialog key={`${contextKey}:${pickerGeneration}`} href={href} selectionText={name} disabled={disabled||busy} revision={revision} targetId={`inline-modal:${contextKey}:${pickerGeneration}`} canRemove={editing} onApply={applyModalLink} onClose={()=>{if(!disabled&&!busy)closeLinkEditor();}}/>}
  </div>;
}
