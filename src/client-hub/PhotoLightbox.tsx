"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private blob, never an optimizer URL. */
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { verifyHubFileCopies } from "./file-copy-client";
import type { ClientHubProject, HubPhoto } from "./model";
import { loadHubPhotoBlob } from "./workspace-client";
import { lockPageScroll } from "@/components/modal-scroll-lock";
import styles from "./ProjectWorkspace.module.css";
import galleryStyles from "@/components/FursuitGallery.module.css";
import privateStyles from "@/components/PrivateImageLightbox.module.css";

export function PhotoLightbox({ photos, activeId, owner, project, onChange, onClose, onFailure, trigger }: { photos: HubPhoto[]; project?: ClientHubProject; activeId: string | null; owner: boolean; onChange: (photoId: string) => void; onClose: () => void; onFailure: (error: unknown) => void; trigger: RefObject<HTMLElement | null> }) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), [asset, setAsset] = useState({ key: "", url: "", error: "" }), [retry, setRetry] = useState(0);
  const transfer = useRef<AbortController | null>(null), [downloadState, setDownloadState] = useState({ key: "", busy: false, error: "" });
  const active = activeId === null ? -1 : photos.findIndex(item => item.photoId === activeId);
  const selectedPhoto = active < 0 ? undefined : photos[active];
  // Preserve the active private image when a live snapshot decodes fresh objects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePhoto = useMemo(() => selectedPhoto, [selectedPhoto?.photoId, selectedPhoto?.storagePath, selectedPhoto?.clientId, selectedPhoto?.projectId, selectedPhoto?.fileName, selectedPhoto?.contentType, selectedPhoto?.size]);
  const photo = selectedPhoto;
  const isOpen = !!photo;
  const imageKey = photo ? `${owner}:${photo.clientId}:${photo.projectId}:${photo.photoId}:${photo.storagePath}` : "";
  const transferKey = JSON.stringify([imageKey, photo?.fileName, photo?.contentType, photo?.size, project?.clientId, project?.projectId, project?.version]);
  const url = asset.key === imageKey ? asset.url : "", error = asset.key === imageKey ? asset.error : "";
  useEffect(() => {
    if (!isOpen || !dialog.current) return;
    const modal = dialog.current, returnFocus = trigger.current, releaseScroll = lockPageScroll(); modal.showModal(); closeButton.current?.focus();
    return () => { modal.close(); releaseScroll(); returnFocus?.focus({ preventScroll: true }); };
  }, [isOpen, trigger]);
  useEffect(() => {
    if (!stablePhoto) return;
    let live = true, objectUrl = ""; const request = new AbortController();
    void Promise.resolve().then(() => { if (!live) return null; setAsset({ key: imageKey, url: "", error: "" }); return loadHubPhotoBlob(stablePhoto, owner, request.signal); }).then(blob => { if (live && blob) { objectUrl = URL.createObjectURL(blob); setAsset({ key: imageKey, url: objectUrl, error: "" }); } }).catch(cause => { if (live && !request.signal.aborted) { setAsset({ key: imageKey, url: "", error: "This private photo could not be loaded." }); onFailure(cause); } });
    return () => { live = false; request.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [stablePhoto, owner, retry, onFailure, imageKey]);
  useEffect(() => () => { transfer.current?.abort(); transfer.current = null; }, [transferKey]);
  async function download() {
    if (!photo || !project || project.clientId !== photo.clientId || project.projectId !== photo.projectId || transfer.current) return;
    const request = new AbortController(); transfer.current = request; setDownloadState({ key: transferKey, busy: true, error: "" });
    try {
      const blob = await loadHubPhotoBlob(photo, owner, request.signal);
      await verifyHubFileCopies(project, owner, [{ kind: "photo", fileId: photo.photoId }], request.signal);
      if (request.signal.aborted || transfer.current !== request) return;
      const objectUrl = URL.createObjectURL(blob), link = document.createElement("a"); link.href = objectUrl; link.download = photo.fileName; link.rel = "noopener"; link.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) { if (!request.signal.aborted && transfer.current === request) { setDownloadState({ key: transferKey, busy: false, error: "Download could not be confirmed. Try again." }); onFailure(cause); } }
    finally { if (transfer.current === request) { transfer.current = null; setDownloadState(previous => ({ ...previous, busy: false })); } }
  }
  const move = (direction: number) => { if (active >= 0 && photos.length > 1) onChange(photos[(active + direction + photos.length) % photos.length].photoId); };
  return <dialog ref={dialog} className={`${galleryStyles.dialog} ${privateStyles.dialog}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
    {photo && <div className={`${galleryStyles.panel} ${privateStyles.panel}`}><div className={`${galleryStyles.toolbar} ${privateStyles.toolbar}`}><h2 id={`${id}-title`} aria-live="polite">{photo.caption || photo.fileName}</h2><button ref={closeButton} type="button" className={privateStyles.close} onClick={onClose} aria-label="Close enlarged photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div><div className={galleryStyles.imageStage}>{url ? <img src={url} alt={photo.caption || `Progress photo: ${photo.fileName}`} className={galleryStyles.expandedImage} /> : <div role="status" aria-label={error || "Loading photo"}>{error || <span className={styles.photoSpinner} aria-hidden="true" />}{error && <button type="button" className={galleryStyles.control} onClick={() => setRetry(value => value + 1)}>Retry photo</button>}</div>}</div>{downloadState.key === transferKey && downloadState.error && <p role="alert">{downloadState.error}</p>}<div className={galleryStyles.navigation}><button type="button" className={galleryStyles.control} disabled={photos.length < 2} onClick={() => move(-1)} aria-label="Previous progress photo">← Previous</button><span aria-live="polite">{active + 1} / {photos.length}</span>{project?.clientId === photo.clientId && project.projectId === photo.projectId && <button type="button" className={`${galleryStyles.control} ${privateStyles.download}`} aria-label={`Download ${photo.fileName}`} title="Download photo" disabled={downloadState.key === transferKey && downloadState.busy} onClick={() => void download()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg></button>}<button type="button" className={galleryStyles.control} disabled={photos.length < 2} onClick={() => move(1)} aria-label="Next progress photo">Next →</button></div><p id={`${id}-help`} className={galleryStyles.help}>Use arrow keys to browse. Press Escape or click outside to close.</p></div>}
  </dialog>;
}
