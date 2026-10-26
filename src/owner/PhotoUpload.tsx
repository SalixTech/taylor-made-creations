"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PHOTO_UPLOAD_ACCEPT, uploadOwnerPhoto, type UploadedPhoto } from "./media-client";
import styles from "./PhotoManager.module.css";
import buttons from "./OwnerButton.module.css";

type UploadActivityValue = { begin: (cancel?: () => void) => () => void; cancelAll: () => void };
const idleUpload: UploadActivityValue = { begin: () => () => undefined, cancelAll: () => undefined };
export const UploadActivity = createContext<UploadActivityValue>(idleUpload);
export function OwnerUploadProvider({ children, onBusyChange }: { children: ReactNode; onBusyChange: (busy: boolean) => void }) {
  const count = useRef(0);
  const cancellations = useRef(new Set<() => void>());
  const callback = useRef(onBusyChange);
  useEffect(() => { callback.current = onBusyChange; }, [onBusyChange]);
  const begin = useCallback((cancel?: () => void) => {
    if (cancel) cancellations.current.add(cancel);
    count.current++; callback.current(true);
    let ended = false;
    return () => { if (ended) return; ended = true; if (cancel) cancellations.current.delete(cancel); count.current = Math.max(0, count.current - 1); callback.current(count.current > 0); };
  }, []);
  const cancelAll = useCallback(() => { for (const cancel of cancellations.current) cancel(); }, []);
  return <UploadActivity.Provider value={{ begin, cancelAll }}>{children}</UploadActivity.Provider>;
}

export function OwnerUploadCancel({ className }: { className?: string }) {
  const activity = useContext(UploadActivity) ?? idleUpload;
  return <button type="button" className={className} onClick={() => activity.cancelAll()}>Stop upload</button>;
}

export function PhotoUpload({ multiple = false, onUploaded, label = multiple ? "Upload photos" : "Upload a photo", staged = false, libraryOnly = false }: { multiple?: boolean; onUploaded: (photos: { media: UploadedPhoto; name: string }[]) => void; label?: string; staged?: boolean; libraryOnly?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const activity = useContext(UploadActivity) ?? idleUpload;
  const finishActivity = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const active = useRef<AbortController | null>(null);
  const latest = useRef(onUploaded);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { latest.current = onUploaded; }, [onUploaded]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); finishActivity.current?.(); finishActivity.current = null; }; }, []);
  async function upload(files: File[]) {
    if (!files.length || active.current) return;
    const controller = new AbortController(); active.current = controller;
    finishActivity.current = activity.begin(() => controller.abort());
    setMessage(""); setError("");
    let completed = 0;
    const failures: string[] = [];
    try {
      // No count cap. Sequential requests bound memory and give each file its own truthful result.
      for (const [index, file] of files.entries()) {
        if (!alive.current || controller.signal.aborted) break;
        setProgress(`Uploading photo ${index + 1} of ${files.length}…`);
        try {
          const media = await uploadOwnerPhoto(file, controller.signal);
          if (!alive.current || controller.signal.aborted) break;
          latest.current([{ media, name: file.name.replace(/\.[^.]+$/, "").slice(0, 150) || "Uploaded photo" }]);
          completed++;
        } catch (failure) {
          if (controller.signal.aborted) break;
          failures.push(`${file.name}: ${failure instanceof Error ? failure.message : "Upload not confirmed. Try again."}`);
        }
      }
      if (!alive.current) return;
      if (completed) setMessage(staged ? `${completed} ${completed === 1 ? "photo saved" : "photos saved"} to the temporary library on this development server. ${libraryOnly ? "Choose it from a page’s photo picker when you are ready; no page image has changed." : "Choose Use photo below to place it; your current image has not changed."}` : `${completed} ${completed === 1 ? "photo saved" : "photos saved"} to this development server and added to this draft. Save the draft to keep its photo references; this does not publish anything.`);
      if (failures.length) setError(failures.join("\n"));
      else if (controller.signal.aborted) setError(staged ? "Upload stopped. Photos already confirmed above are kept; the in-progress file may have reached the disk but was not selected. Refresh the temporary library to check completed uploads." : "Upload stopped. Photos already confirmed above are kept; the in-progress file may have reached the disk but was not added to this draft. Refresh the temporary library to check completed uploads.");
    } finally {
      active.current = null;
      finishActivity.current?.(); finishActivity.current = null;
      if (alive.current) setProgress("");
      if (input.current) input.current.value = "";
    }
  }
  return <div className={styles.upload}>
    <input ref={input} id={id} className={styles.fileInput} aria-label={label} aria-describedby={`${id}-help`} type="file" accept={PHOTO_UPLOAD_ACCEPT} multiple={multiple} disabled={Boolean(progress)} onChange={event => { void upload(Array.from(event.target.files ?? [])); }} />
    <div className={styles.uploadActions}><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={Boolean(progress)} aria-busy={Boolean(progress)} onClick={() => input.current?.click()}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></svg>{progress || label}</button>{progress && <button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet}`} onClick={() => active.current?.abort()}>Stop upload</button>}</div>
    <small id={`${id}-help`}>{multiple ? "No fixed photo-count limit. " : ""}PNG, JPEG, WebP, GIF or AVIF · 12 MB each. Converted to WebP at high quality; embedded metadata is removed, originals are untouched. Development-server disk only; shared cloud storage is not connected.</small>
    {progress && <p role="status">{progress}</p>}{message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
