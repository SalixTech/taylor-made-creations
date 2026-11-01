"use client";
import {WebsiteAuthorText} from "./WebsiteAuthorText";
import {WebsiteTemplateText} from "./WebsiteTemplateText";
import {getTemplateText} from "@/owner/site-design";
import {getElementHref} from "@/owner/canvas-hyperlinks";
import {resolveSiteDestination} from "@/owner/preview-model";
import {useWebsiteDocumentLink} from "./useWebsiteDocumentLink";
import { PhotoLoading } from "./PhotoLoading";

import Image from "next/image";
import { lockPageScroll } from "./modal-scroll-lock";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isSafeImageSource, type OwnerContent, type OwnerPremade, type OwnerPremadePhoto } from "@/owner/model";
import { getPremadeCoverPhoto, getPremadePhotos } from "@/owner/premade-gallery";
import { useOwnerMediaSource } from "@/owner/media-client";
import styles from "./PremadeGallery.module.css";

type GalleryMode = "public" | "private-preview" | "editor";

function PremadeImage({ content, interactive=true, photo, mode, fit = "contain", position = "50% 50%", thumbnail = false }: {
  content?:OwnerContent;interactive?:boolean;photo: OwnerPremadePhoto; mode: GalleryMode; fit?: "cover" | "contain"; position?: string; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Private media is fetched with owner authorization into a short-lived blob.
  // The public renderer never requests owner credentials or private content.
  const media = useOwnerMediaSource(photo.src, mode !== "public");
  const src = mode === "public" ? photo.src : media.src;
  if (!isSafeImageSource(photo.src) || failed || media.error) return <span className={styles.unavailable} role="status">{content?(interactive?getTemplateText(content,"site.photoUnavailable",{alt:photo.alt}):<WebsiteTemplateText mode={mode} content={content} field="site.photoUnavailable" variables={{alt:photo.alt}}/>):`This photo could not be displayed. ${photo.alt}`}</span>;
  if (!src) return <span className={styles.unavailable} role="status"><PhotoLoading label={content?(interactive?getTemplateText(content,"site.photoLoading"):<WebsiteTemplateText mode={mode} content={content} field="site.photoLoading"/>):"Loading photo…"} /></span>;
  return <Image src={src} alt={thumbnail ? "" : photo.alt} fill unoptimized sizes={thumbnail ? "72px" : "(max-width:650px) 94vw, 700px"} style={{ objectFit: fit, objectPosition: position }} onError={() => setFailed(true)} />;
}

function ThumbnailImage({ content, photo, mode }: { content?:OwnerContent;photo: OwnerPremadePhoto; mode: GalleryMode }) {
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
  return <span ref={wrapper} className={styles.thumbnailImage}>{visible && <PremadeImage content={content} key={`${mode}-${photo.src}`} photo={photo} mode={mode} thumbnail />}</span>;
}

/** Listing-local image browsing only. This never changes cart or checkout state. */
export function PremadeGallery({ content, renderText, renderCaption, item, mode = "public", listingHref, external = false }: { content?:OwnerContent;renderCaption?:(photo:OwnerPremadePhoto)=>ReactNode;renderText?:(key:string,variables?:Record<string,string>)=>ReactNode; item: OwnerPremade; mode?: GalleryMode; listingHref?: string; external?: boolean }) {
  const {openDocument,documentError}=useWebsiteDocumentLink(mode,getTemplateText(content,"site.pdfFailureMessage"));
  const text=(key:string,variables?:Record<string,string>)=>renderText?renderText(`premades.${key}`,variables):content?<WebsiteTemplateText mode={mode} content={content} field={`premades.${key}`} variables={variables}/>:getTemplateText(null,`premades.${key}`,variables);
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

  const captionNode=renderCaption?renderCaption(photo):content?<WebsiteAuthorText content={content} fieldId={`author:premadePhoto:${item.id}:${photo.id}`} text={photo.alt}/>:photo.alt,nameNode=content?<WebsiteAuthorText content={content} fieldId={`author:premade:${item.id}:name`} text={item.name}/>:item.name;
  const captionKey=`layout.premade:${item.id}:photo-caption:${photo.id}`,captionHref=content?getElementHref(content,captionKey):undefined,captionDestination=content&&captionHref?resolveSiteDestination(content,captionHref,mode==="public"?"public":"preview"):null;
  const nameHref=content?getElementHref(content,`layout.premade:${item.id}:destination`):undefined,nameDestination=content&&nameHref?resolveSiteDestination(content,nameHref,mode==="public"?"public":"preview"):null;
  const move = (direction: number) => setSelectedId(photos[(index + direction + photos.length) % photos.length].id);

  return <div className={styles.gallery}>
    {listingHref ? <>
      {external ? <a onClick={event=>openDocument(listingHref,event)} className={styles.cover} href={listingHref} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} third-party listing`}><PremadeImage content={content} key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} /><span className={styles.enlarge}>{text("photoViewListing")}</span></a> : <Link onClick={event=>openDocument(listingHref,event)} className={styles.cover} href={listingHref} aria-label={`View ${item.name} details`}><PremadeImage content={content} key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} /><span className={styles.enlarge}>{text("photoViewDetails")}</span></Link>}
      <button ref={trigger} type="button" className={styles.control} aria-label={`Enlarge photo ${index + 1} of ${photos.length} of ${item.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>{text("photoEnlarge")}</button>
    </> : <button ref={trigger} type="button" className={styles.cover} aria-label={`Enlarge photo ${index + 1} of ${photos.length} of ${item.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <PremadeImage content={content} key={`${mode}-${photo.src}`} photo={photo} mode={mode} fit={item.imageFit ?? "contain"} position={`${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`} />
      <span className={styles.enlarge} aria-hidden="true">{text("photoViewLarger")}</span>
    </button>}
    {photos.length > 1 && <div className={styles.thumbnails} role="group" aria-label={`${item.name} photos`}>
      {photos.map((candidate, photoIndex) => <button key={candidate.id} type="button" className={styles.thumbnail} aria-label={`Show photo ${photoIndex + 1} of ${photos.length}: ${candidate.alt}`} aria-pressed={candidate.id === photo.id} onClick={() => setSelectedId(candidate.id)}>
        <ThumbnailImage content={content} photo={candidate} mode={mode} />
        <span className={styles.photoNumber} aria-hidden="true">{text("photoNumber",{number:String(photoIndex+1)})}</span>
      </button>)}
    </div>}
    {photos.length > 1 && <p className={styles.count} aria-live="polite">{text("photoCount",{current:String(index+1),count:String(photos.length)})}</p>}
    {documentError&&<p role="alert">{documentError}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
      }}>
      {open && <div className={styles.panel}>
        <div className={styles.toolbar}><h2 id={titleId}>{nameDestination?<a href={nameDestination.href} onClick={event=>openDocument(nameDestination.href,event)}>{nameNode}</a>:nameNode}</h2><button ref={closeButton} className={styles.control} type="button" onClick={() => setOpen(false)} aria-label="Close enlarged premade photo">{text("photoClose")} <span aria-hidden="true">×</span></button></div>
        <div className={styles.stage}><PremadeImage interactive={false} content={content} key={`${mode}-${photo.src}`} photo={photo} mode={mode} /></div>
        <div className={styles.navigation}><button className={styles.control} type="button" disabled={photos.length < 2} onClick={() => move(-1)} aria-label="Previous premade photo">{text("photoPrevious")}</button><span aria-live="polite">{text("photoCounter",{current:String(index+1),count:String(photos.length)})}</span><button className={styles.control} type="button" disabled={photos.length < 2} onClick={() => move(1)} aria-label="Next premade photo">{text("photoNext")}</button></div>
        <p className={styles.description} {...(mode==="editor"?{"data-owner-edit":`canvas:${captionKey}`,tabIndex:0}: {})}>{captionDestination?<a href={captionDestination.href} onClick={event=>openDocument(captionDestination.href,event)}>{captionNode}</a>:captionNode}</p>
        <p id={helpId} className={styles.help}>{text(photos.length>1?"photoHelp":"photoHelpSingle")}</p>
      </div>}
    </dialog>
  </div>;
}
