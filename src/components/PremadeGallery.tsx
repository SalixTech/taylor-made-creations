"use client";

import Image from "next/image";
import { lockPageScroll } from "./modal-scroll-lock";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { isSafeImageSource, type OwnerPremade, type OwnerPremadePhoto } from "@/owner/model";
import { getPremadeCoverPhoto, getPremadePhotos } from "@/owner/premade-gallery";
import { useOwnerMediaSource } from "@/owner/media-client";
import styles from "./PremadeGallery.module.css";

type GalleryMode = "public" | "private-preview" | "editor";

function PremadeImage({ photo, mode, fit = "contain", position = "50% 50%", thumbnail = false }: {
  photo: OwnerPremadePhoto; mode: GalleryMode; fit?: "cover" | "contain"; position?: string; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Private media is fetched with owner authorization into a short-lived blob.
  // The public renderer never requests owner credentials or private content.
  const media = useOwnerMediaSource(photo.src, mode !== "public");
  const src = mode === "public" ? photo.src : media.src;
  if (!isSafeImageSource(photo.src) || failed || media.error) return <span className={styles.unavailable} role="status">{thumbnail ? "Unavailable" : `This photo could not be displayed. ${photo.alt}`}</span>;
  if (!src) return <span className={styles.unavailable} role="status">{thumbnail ? "Loading…" : "Loading photo…"}</span>;
  return <Image src={src} alt={thumbnail ? "" : photo.alt} fill unoptimized sizes={thumbnail ? "72px" : "(max-width:650px) 94vw, 700px"} style={{ objectFit: fit, objectPosition: position }} onError={() => setFailed(true)} />;
}

function ThumbnailImage({ photo, mode }: { photo: OwnerPremadePhoto; mode: GalleryMode }) {
  const [visible, setVisible] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Native image lazy loading cannot defer the authenticated blob fetch, so
    // mount private image readers only when their thumbnail reaches the strip.
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const node = wrapper.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "96px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <span ref={wrapper} className={styles.thumbnailImage}>{visible && <PremadeImage key={`${mode}-${photo.src}`} photo={photo} mode={mode} thumbnail />}</span>;
}

/** Listing-local image browsing only. This never changes cart or checkout state. */
export function PremadeGallery({ item, mode = "public", listingHref, external = false }: { item: OwnerPremade; mode?: GalleryMode; listingHref?: string; external?: boolean }) {
  const photos = getPremadePhotos(item);
  const cover = getPremadeCoverPhoto(item);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const photo = photos.find(candidate => candidate.id === selectedId) ?? cover;
  const index = photos.findIndex(candidate => candidate.id === photo.id);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const titleId = `premade-photo-title-${dialogId}`;
  const helpId = `premade-photo-help-${dialogId}`;

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    if (!modal) return;
    const opener = trigger.current;
    const releaseScroll = lockPageScroll();
    modal.showModal();
    closeButton.current?.focus();
    return () => {
      modal.close();
      releaseScroll();
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  const move = (direction: number) => setSelectedId(photos[(index + direction + photos.length) % photos.length].id);

  return <div className={styles.gallery}>
    {listingHref ? <>
      {external ? <a className={styles.cover} href={listingHref} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} third-party listing`}><PremadeImage key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} /><span className={styles.enlarge}>View listing ↗</span></a> : <Link className={styles.cover} href={listingHref} aria-label={`View ${item.name} details`}><PremadeImage key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} /><span className={styles.enlarge}>View details →</span></Link>}
      <button ref={trigger} type="button" className={styles.control} aria-label={`Enlarge photo ${index + 1} of ${photos.length} of ${item.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>Enlarge photo ↗</button>
    </> : <button ref={trigger} type="button" className={styles.cover} aria-label={`Enlarge photo ${index + 1} of ${photos.length} of ${item.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <PremadeImage key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} />
      <span className={styles.enlarge} aria-hidden="true">View larger ↗</span>
    </button>}
    {photos.length > 1 && <div className={styles.thumbnails} role="group" aria-label={`${item.name} photos`}>
      {photos.map((candidate, photoIndex) => <button key={candidate.id} type="button" className={styles.thumbnail} aria-label={`Show photo ${photoIndex + 1} of ${photos.length}: ${candidate.alt}`} aria-pressed={candidate.id === photo.id} onClick={() => setSelectedId(candidate.id)}>
        <ThumbnailImage photo={candidate} mode={mode} />
        <span className={styles.photoNumber} aria-hidden="true">{photoIndex + 1}</span>
      </button>)}
    </div>}
    {photos.length > 1 && <p className={styles.count} aria-live="polite">Photo {index + 1} of {photos.length}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
      }}>
      {open && <div className={styles.panel}>
        <div className={styles.toolbar}><h2 id={titleId}>{item.name}</h2><button ref={closeButton} className={styles.control} type="button" onClick={() => setOpen(false)} aria-label="Close enlarged premade photo">Close <span aria-hidden="true">×</span></button></div>
        <div className={styles.stage}><PremadeImage key={`${mode}-${photo.src}`} photo={photo} mode={mode} /></div>
        <div className={styles.navigation}><button className={styles.control} type="button" disabled={photos.length < 2} onClick={() => move(-1)} aria-label="Previous premade photo">← Previous</button><span aria-live="polite">{index + 1} / {photos.length}</span><button className={styles.control} type="button" disabled={photos.length < 2} onClick={() => move(1)} aria-label="Next premade photo">Next →</button></div>
        <p className={styles.description}>{photo.alt}</p>
        <p id={helpId} className={styles.help}>{photos.length > 1 ? "Use arrow keys to browse. " : ""}Press Escape or click outside to close.</p>
      </div>}
    </dialog>
  </div>;
}
