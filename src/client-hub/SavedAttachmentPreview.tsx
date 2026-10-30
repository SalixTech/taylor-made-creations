"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated raster blobs are short-lived and revoked here. */
import { useEffect, useMemo, useRef, useState } from "react";
import { loadHubAttachmentPreview, isRasterAttachment, watchHubFileSession } from "./attachments-client";
import type { HubAttachment } from "./attachments-model";
import type { ClientHubProject } from "./model";
import { HUB_FILE_COPIES_CHANGED } from "./file-copy-client";
import { PrivateImageLightbox } from "@/components/PrivateImageLightbox";
import styles from "./MakerChatAttachments.module.css";
function usePreview(project: ClientHubProject, owner: boolean, file: HubAttachment, enabled: boolean, background = false) {
  const [asset, setAsset] = useState<{key:object|null;url:string;error:string}>({ key: null, url: "", error: "" });
  const identity = JSON.stringify([project.clientId,project.projectId,project.version,owner,file.attachmentId,file.fileName,file.sha256,file.size,file.available,file.expiresAt]);
  const key=useMemo(()=>({identity,enabled,background}),[identity,enabled,background]);
  useEffect(() => {
    if (!enabled || !isRasterAttachment(file) || file.available === false) return;
    let live = true, url = "", unsubscribe: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined; const request = new AbortController();
    const clear = () => { request.abort(); if (url) { URL.revokeObjectURL(url); url = ""; } if (live) setAsset({ key, url: "", error: "Preview access changed. Reopen the file to check it again." }); };
    const expires = () => { if (!file.expiresAt) return; const remaining = Date.parse(file.expiresAt) - Date.now(); if (remaining <= 0) clear(); else timer = setTimeout(expires, Math.min(remaining, 2147483647)); };
    const changed = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.clientId === project.clientId && detail?.projectId === project.projectId && detail?.owner === owner) clear(); };
    const locked = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.role === (owner ? "owner" : "client")) clear(); };
    window.addEventListener("tmc-hub-session-lock", locked);
    window.addEventListener(HUB_FILE_COPIES_CHANGED, changed); expires();
    void watchHubFileSession(project, owner, clear, request.signal).then(stop => { if (!live || request.signal.aborted) stop(); else unsubscribe = stop; }).catch(() => { if (live && !request.signal.aborted) clear(); });
    void loadHubAttachmentPreview(project, owner, file, request.signal, background ? "background" : "interactive").then(blob => { if (!live || request.signal.aborted) return; url = URL.createObjectURL(blob); setAsset({ key, url, error: "" }); }).catch(() => { if (live && !request.signal.aborted) setAsset({ key, url: "", error: "Preview unavailable. You can still try downloading your copy." }); });
    return () => { live = false; request.abort(); if (timer) clearTimeout(timer); if (url) URL.revokeObjectURL(url); window.removeEventListener(HUB_FILE_COPIES_CHANGED, changed); window.removeEventListener("tmc-hub-session-lock", locked); unsubscribe?.(); };
    // The key captures every byte/access/display identity. No background retry loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, background]);
  if (file.available === false || !isRasterAttachment(file)) return { key, url: "", error: "This file has no available image preview." };
  return enabled && asset.key === key ? asset : { key, url: "", error: "" };
}
function SavedAttachmentGallery({ project, owner, file, onClose }: { project: ClientHubProject; owner: boolean; file: HubAttachment; onClose: () => void }) {
  const asset = usePreview(project, owner, file, true);
  return <PrivateImageLightbox src={asset.url} title={file.fileName} loading={!asset.url && !asset.error} error={asset.error} onClose={onClose} />;
}
export function SavedAttachmentPreview({ project, owner, file, enabled = true }: { project: ClientHubProject; owner: boolean; file: HubAttachment; enabled?: boolean }) {
  const [failedImage, setFailedImage] = useState("");
  const [open, setOpen] = useState(false), [visible, setVisible] = useState(false);
  const tile = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!enabled || !tile.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "0px" });
    observer.observe(tile.current);
    return () => observer.disconnect();
  }, [enabled]);
  // An explicit preview has its own reserved lane. Cancel the tile transfer,
  // rather than making the click wait behind unseen/background originals.
  const loadingTile = enabled && visible && !open;
  const asset = usePreview(project, owner, file, loadingTile, true), raster = isRasterAttachment(file);
  return <><button ref={tile} type="button" className={styles.savedThumbnail} disabled={!raster || file.available === false} aria-label={raster ? `Preview ${file.fileName}` : `${file.fileName} · download only`} title={asset.error || (raster ? "Preview image" : "Download only")} onClick={() => setOpen(true)}>{asset.url && asset.url !== failedImage ? <img src={asset.url} alt="" onError={() => setFailedImage(asset.url)} /> : <span>{file.available === false ? "Unavailable" : raster ? asset.error || !!asset.url && asset.url === failedImage ? "Retry preview" : loadingTile ? <span className={styles.previewSpinner} role="status" aria-label="Loading image preview" /> : "Preview" : "FILE"}</span>}</button>{open && <SavedAttachmentGallery key={`${file.attachmentId}:${file.fileName}`} project={project} owner={owner} file={file} onClose={() => setOpen(false)} />}</>;
}
