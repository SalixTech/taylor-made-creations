"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import type { OwnerFont } from "./model";
import { FONT_UPLOAD_ACCEPT, ownerFontRecord, uploadOwnerFont } from "./font-client";
import { useCloudFiles } from "./use-cloud-files";
import { cloudFileToOwnerFont, isFolderTrashed } from "./cloud-files-model";
import { UploadActivity } from "./PhotoUpload";
import styles from "./AssetLibrary.module.css";
import buttons from "./OwnerButton.module.css";
import uploadStyles from "./PhotoManager.module.css";

export function FontUpload({ onUploaded }: { onUploaded: (font: OwnerFont) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), active = useRef<AbortController | null>(null), alive = useRef(true);
  const finish = useRef<(() => void) | null>(null), latest = useRef(onUploaded), activity = useContext(UploadActivity);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { latest.current = onUploaded; }, [onUploaded]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); finish.current?.(); finish.current = null; }; }, []);
  async function upload(file: File | undefined) {
    if (!file || active.current) return;
    const controller = new AbortController(); active.current = controller;
    finish.current = activity.begin(() => controller.abort());
    setBusy(true); setError(""); setMessage("");
    try {
      const font = await uploadOwnerFont(file, controller.signal);
      if (!alive.current) return;
      if (controller.signal.aborted) throw new Error("Upload stopped.");
      latest.current(font);
      setMessage(`${font.name} is saved in your Fonts folder and available in this draft. Choose it in a font control, then Save draft or Publish live.`);
    } catch (failure) {
      if (alive.current) setError(controller.signal.aborted ? "Upload stopped. Refresh the private font library to check whether it finished saving; your selected fonts have not changed." : failure instanceof Error ? failure.message : "Font upload was not confirmed. Try again.");
    } finally {
      active.current = null; finish.current?.(); finish.current = null;
      if (alive.current) setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return <div className={uploadStyles.upload}>
    <input id={id} ref={input} className={uploadStyles.fileInput} type="file" accept={FONT_UPLOAD_ACCEPT} aria-label="Upload a font" aria-describedby={`${id}-help`} disabled={busy} onChange={event => { void upload(event.target.files?.[0]); }} />
    <div className={uploadStyles.uploadActions}><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>{busy ? "Checking and saving font…" : "Upload a font"}</button>{busy && <button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet}`} onClick={() => active.current?.abort()}>Stop upload</button>}</div>
    <small id={`${id}-help`}>WOFF, WOFF2, TTF or OTF · 4 MB each. Saved in File Hub’s Fonts folder. Uploading does not change your website’s fonts.</small>
    {message && <p className={uploadStyles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
export function OwnerFontLibrary({ fonts = [], onChange }: { fonts?: OwnerFont[]; onChange: (fonts: OwnerFont[]) => void }) {
  const library = useCloudFiles();
  function add(font: OwnerFont) {
    const safe = ownerFontRecord(font);
    if (!fonts.some(existing => existing.id === safe.id)) onChange([...fonts, safe]);
  }
  const available = library.files.filter(file => file.status === "ready" && !file.trashedAt && !isFolderTrashed(library.folders, file.parentId)).flatMap(file => { const font = cloudFileToOwnerFont(file); return font && !fonts.some(existing => existing.id === font.id) ? [font] : []; });
  return <section className={styles.library} aria-label="Uploaded fonts">
    <div className={styles.heading}><h3>Uploaded fonts</h3><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${styles.fontRefresh}`} aria-label="Refresh fonts" title="Refresh fonts" disabled={library.loading} aria-busy={library.loading} onClick={() => { void library.refresh(); }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M19.4 12a7.5 7.5 0 1 0-1.8 5" /></svg></button></div>
    <p className={styles.description}>Add your own font, then choose it for headings, body text or an individual section. Your fonts are shared across your owner devices.</p>
    <FontUpload onUploaded={font => { add(font); void library.refresh(); }} />
    {fonts.length > 0 && <ul className={styles.fontList}>{fonts.map(font => <li key={font.id}><span>{font.name}<small>{font.format.toUpperCase()} · available in this draft</small></span></li>)}</ul>}
    {library.loading && <p className={styles.status} role="status">Loading your private font library…</p>}
    {library.error && <p className={styles.error} role="alert">{library.error}</p>}
    {available.length > 0 && <><h4>Available in your Fonts folder</h4><ul className={styles.fontList}>{available.map(font => <li key={font.id}><span>{font.name}<small>{font.format.toUpperCase()}</small></span><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={() => add(font)}>Add to draft</button></li>)}</ul></>}
  </section>;
}
