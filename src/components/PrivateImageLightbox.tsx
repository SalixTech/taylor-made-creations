"use client";
/* eslint-disable @next/next/no-img-element -- Private object URLs must never go through a public image optimizer. */
import { useEffect, useId, useRef, useState } from "react";
import { lockPageScroll } from "./modal-scroll-lock";
import gallery from "./FursuitGallery.module.css";
import styles from "./PrivateImageLightbox.module.css";

/** The caller owns and revokes the authenticated/local blob URL. No persistence. */
export function PrivateImageLightbox({ src, title, onClose, onPrevious, onNext, position, loading = false, error = "" }: { src: string; title: string; onClose: () => void; onPrevious?: () => void; onNext?: () => void; position?: string; loading?: boolean; error?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null), titleId = useId();
  const [view, setView] = useState({ src, zoom:1, loaded:false, failed:false });
  const current = view.src === src ? view : { src, zoom:1, loaded:false, failed:false };
  const { zoom, loaded, failed } = current;
  const setZoom = (change: number | ((value:number) => number)) => setView({ ...current, zoom: typeof change === "number" ? change : change(zoom) });
  const safe = src.startsWith("blob:"), ready = safe && loaded && !loading && !error;
  useEffect(() => {
    const modal = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll(); modal?.showModal(); close.current?.focus();
    return () => { modal?.close(); unlock(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={`${gallery.dialog} ${styles.dialog}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => { if (event.key === "ArrowLeft" && onPrevious) { event.preventDefault(); onPrevious(); } else if (event.key === "ArrowRight" && onNext) { event.preventDefault(); onNext(); } }}>
    <div className={`${gallery.panel} ${styles.panel}`}><div className={`${gallery.toolbar} ${styles.toolbar}`}><h2 id={titleId}>{title}</h2><button ref={close} type="button" className={styles.close} aria-label="Close image preview" onClick={onClose}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <div className={styles.stage} aria-busy={loading || safe && !loaded && !failed}>{(error || failed || (!safe && !loading)) ? <p role="alert">{error || "This image could not be displayed."}</p> : <>{(loading || !loaded) && <p role="status"><span className={styles.loadingSpinner} aria-hidden="true" />Loading image…</p>}{safe && <img src={src} alt={title} onLoad={() => setView(value => ({ ...(value.src === src ? value : {src,zoom:1}), loaded:true, failed:false }))} onError={() => setView(value => ({ ...(value.src === src ? value : {src,zoom:1}), loaded:false, failed:true }))} style={{ width: zoom <= 1 ? "auto" : `${zoom * 100}%`, maxWidth: zoom <= 1 ? `${zoom * 100}%` : "none", maxHeight: zoom <= 1 ? "calc(100dvh - 250px)" : "none" }} />}</>}</div>
      <div className={styles.controls}>{onPrevious && <button type="button" onClick={onPrevious} aria-label="Previous image">←</button>}{position && <span aria-live="polite">{position}</span>}<button type="button" disabled={zoom <= .5 || !ready} onClick={() => setZoom(value => Math.max(.5, value - .25))} aria-label="Zoom out">−</button><button type="button" onClick={() => setZoom(1)} disabled={!ready} aria-label="Reset image zoom">{Math.round(zoom * 100)}%</button><button type="button" disabled={zoom >= 3 || !ready} onClick={() => setZoom(value => Math.min(3, value + .25))} aria-label="Zoom in">+</button>{onNext && <button type="button" onClick={onNext} aria-label="Next image">→</button>}</div><p className={gallery.help}>Zoom to inspect the image. Press Escape to close.</p>
    </div>
  </dialog>;
}
