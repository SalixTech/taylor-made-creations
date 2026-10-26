"use client";

import Image from "next/image";
import { lockPageScroll } from "./modal-scroll-lock";
import { useEffect, useRef, useState } from "react";
import { fursuitGallery } from "@/content/fursuit-gallery";
import { useOwnerMediaSource } from "@/owner/media-client";
import { isSafeImageSource } from "@/owner/model";
import styles from "./FursuitGallery.module.css";

export type GalleryPhoto = { id?: string; visible?: boolean; name: string; src: string; alt: string; width: number; height: number; displayNumber?: string };

function GalleryImage({ photo, expanded = false, unoptimized = false, privateMedia = false }: { photo: GalleryPhoto; expanded?: boolean; unoptimized?: boolean; privateMedia?: boolean }) {
  const [failed, setFailed] = useState(false);
  const media = useOwnerMediaSource(photo.src, privateMedia);
  if (!isSafeImageSource(photo.src) || failed || media.error) return <div className={styles.unavailable} role="status">The photo of {photo.name} is unavailable. You can still browse the other suits.</div>;
  if (!media.src) return <div className={styles.unavailable} role="status">Loading photo…</div>;
  return <Image src={media.src} alt={photo.alt} width={photo.width} height={photo.height} unoptimized={unoptimized || privateMedia}
      sizes={expanded ? "95vw" : "(max-width: 650px) 94vw, 48vw"}
      className={expanded ? styles.expandedImage : styles.thumbnail} onError={() => setFailed(true)} />;
}

export function FursuitGallery({ photos = fursuitGallery, unoptimized = false, compact = false, editor = false, privateMedia = false }: { photos?: readonly GalleryPhoto[]; unoptimized?: boolean; compact?: boolean; editor?: boolean; privateMedia?: boolean } = {}) {
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const isOpen = active !== null && active < photos.length;
  const photo = active === null ? null : photos[active];
  const count = photos.length;

  useEffect(() => {
    if (!isOpen) return;
    const modal = dialog.current;
    if (!modal) return;
    const releaseScroll = lockPageScroll();
    modal.showModal();
    closeButton.current?.focus();
    return () => {
      modal.close();
      releaseScroll();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const move = (direction: number) => setActive(index => index === null || count < 2 ? index : (index + direction + count) % count);

  return <>
    <div className={`${styles.grid} ${count % 2 === 1 ? styles.odd : ""} ${compact ? styles.compact : ""}`}>
      {photos.map((item, index) => <figure className={styles.card} key={`${item.src}-${index}`} {...(editor && item.id ? { "data-owner-edit": `gallery:${item.id}`, tabIndex: 0, "aria-label": `Edit ${item.name} gallery photo` } : {})}>
        {editor && item.visible === false && <p className={styles.editorNotice}>Hidden photo · only visible while editing</p>}
        <button type="button" className={styles.open} aria-label={`Enlarge ${item.name} fursuit photos`} aria-haspopup="dialog"
          onClick={event => { trigger.current = event.currentTarget; setActive(index); }}>
          <GalleryImage key={`${privateMedia}-${item.src}`} photo={item} unoptimized={unoptimized} privateMedia={privateMedia} />
        </button>
        <figcaption className={styles.caption}><span>{item.name}</span><span>{item.displayNumber?.trim() || String(count - index).padStart(2, "0")}</span></figcaption>
      </figure>)}
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="fursuit-photo-title" aria-describedby="fursuit-photo-help"
      onCancel={event => { event.preventDefault(); setActive(null); }}
      onClick={event => { if (event.target === event.currentTarget) setActive(null); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
      }}>
      {photo && <div className={styles.panel}>
        <div className={styles.toolbar}>
          <h2 id="fursuit-photo-title" aria-live="polite">{photo.name}</h2>
          <button ref={closeButton} type="button" className={styles.control} onClick={() => setActive(null)} aria-label="Close enlarged photo">Close <span aria-hidden="true">×</span></button>
        </div>
        <div className={styles.imageStage}><GalleryImage key={`${privateMedia}-${photo.src}`} photo={photo} expanded unoptimized={unoptimized} privateMedia={privateMedia} /></div>
        <div className={styles.navigation}>
          <button className={styles.control} type="button" disabled={count < 2} onClick={() => move(-1)} aria-label="Previous fursuit">← Previous</button>
          <span aria-live="polite">{(active ?? 0) + 1} / {count}</span>
          <button className={styles.control} type="button" disabled={count < 2} onClick={() => move(1)} aria-label="Next fursuit">Next →</button>
        </div>
        <p id="fursuit-photo-help" className={styles.help}>Use arrow keys to browse. Press Escape or click outside to close.</p>
      </div>}
    </dialog>
  </>;
}
