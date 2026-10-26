"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import type { OwnerFont } from "./model";
import { FONT_UPLOAD_ACCEPT, isOwnerFont, ownerFontRecord, uploadOwnerFont } from "./font-client";
import { usePrivateAssetLibrary } from "./asset-library-client";
import { UploadActivity } from "./PhotoUpload";
import styles from "./AssetLibrary.module.css";
import buttons from "./OwnerButton.module.css";
import uploadStyles from "./PhotoManager.module.css";

export function FontUpload({ onUploaded }: { onUploaded: (font: OwnerFont) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), active = useRef<AbortController | null>(null), alive = useRef(true);
  const finish = useRef<(() => void) | null>(null), latest = useRef(onUploaded), activity = useContext(UploadActivity);
  const [rights, setRights] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { latest.current = onUploaded; }, [onUploaded]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); finish.current?.(); finish.current = null; }; }, []);
  async function upload(file: File | undefined) {
    if (!file || active.current) return;
    const controller = new AbortController(); active.current = controller;
    finish.current = activity.begin(() => controller.abort());
    setBusy(true); setError(""); setMessage("");
    try {
      const font = await uploadOwnerFont(file, rights, controller.signal);
      if (!alive.current) return;
      if (controller.signal.aborted) throw new Error("Upload stopped.");
      latest.current(font);
      setMessage(`${font.name} is saved to this development server and available in this draft. Choose it in a font control, then Save draft or Publish live. Uploading alone does not change any font.`);
    } catch (failure) {
      if (alive.current) setError(controller.signal.aborted ? "Upload stopped. Refresh the private font library to check whether it finished saving; your selected fonts have not changed." : failure instanceof Error ? failure.message : "Font upload was not confirmed. Try again.");
    } finally {
      active.current = null; finish.current?.(); finish.current = null;
      if (alive.current) setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return <div className={uploadStyles.upload}>
    <label className={styles.rights}><input type="checkbox" checked={rights} disabled={busy} onChange={event => setRights(event.target.checked)} /><span>I have permission to use and embed this font on my website. Check your font license if you are unsure.</span></label>
    <input id={id} ref={input} className={uploadStyles.fileInput} type="file" accept={FONT_UPLOAD_ACCEPT} aria-label="Upload a font" aria-describedby={`${id}-help`} disabled={!rights || busy} onChange={event => { void upload(event.target.files?.[0]); }} />
    <div className={uploadStyles.uploadActions}><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={!rights || busy} aria-busy={busy} onClick={() => input.current?.click()}>{busy ? "Checking and saving font…" : "Upload a font"}</button>{busy && <button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet}`} onClick={() => active.current?.abort()}>Stop upload</button>}</div>
    <small id={`${id}-help`}>WOFF, WOFF2, TTF or OTF · 4 MB each. Private development-server storage, not cloud storage. Only fonts used by your published website become public. Website font choices stay inside the site preview and published site.</small>
    {message && <p className={uploadStyles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
export function OwnerFontLibrary({ fonts = [], onChange }: { fonts?: OwnerFont[]; onChange: (fonts: OwnerFont[]) => void }) {
  const library = usePrivateAssetLibrary("/api/taylor/fonts", "fonts", isOwnerFont);
  function add(font: OwnerFont) {
    const safe = ownerFontRecord(font);
    if (!fonts.some(existing => existing.id === safe.id)) onChange([...fonts, safe]);
  }
  const available = library.assets.filter(font => !fonts.some(existing => existing.id === font.id));
  return <section className={styles.library} aria-label="Uploaded fonts">
    <div className={styles.heading}><h3>Uploaded fonts</h3><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={library.loading} aria-busy={library.loading} onClick={library.refresh}>Refresh fonts</button></div>
    <p className={styles.description}>Add your own font, then choose it for headings, body text or an individual section. The font files stay on this development server; your draft saves references only.</p>
    <FontUpload onUploaded={font => { library.add(font); add(font); }} />
    {fonts.length > 0 && <ul className={styles.fontList}>{fonts.map(font => <li key={font.id}><span>{font.name}<small>{font.format.toUpperCase()} · available in this draft</small></span></li>)}</ul>}
    {library.loading && <p className={styles.status} role="status">Loading your private font library…</p>}
    {library.error && <p className={styles.error} role="alert">{library.error}</p>}
    {available.length > 0 && <><h4>Previously uploaded on this server</h4><ul className={styles.fontList}>{available.map(font => <li key={font.id}><span>{font.name}<small>{font.format.toUpperCase()}</small></span><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={() => add(font)}>Add to draft</button></li>)}</ul></>}
  </section>;
}
