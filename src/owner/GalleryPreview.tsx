"use client";
import { useEffect, useState } from "react";
import { PrivateImageLightbox } from "@/components/PrivateImageLightbox";
import { useOwnerMediaSource } from "./media-client";
import type { GalleryItem } from "./model";
/** Convert approved static/HTTPS photos to ephemeral blobs; authenticated media is
 * already resolved by the owner hook. No preview URL or access token is saved. */
export function GalleryPreview({ photos, initialId, onClose }: { photos: GalleryItem[]; initialId?: string; onClose: () => void }) {
 const [active, setActive] = useState(initialId ?? photos[0]?.id ?? "");
 const index = Math.max(0, photos.findIndex(photo => photo.id === active)), photo = photos[index];
 const media = useOwnerMediaSource(photo?.src ?? "", !!photo);
 const [converted, setConverted] = useState({ source:"", url:"", error:"" });
 useEffect(() => {
  if (!media.src || media.src.startsWith("blob:")) return;
  const source = media.src, controller = new AbortController(); let alive = true, url = "";
  void fetch(source, { signal:controller.signal, credentials:"omit" }).then(response => { if (!response.ok) throw new Error("Photo could not be opened."); return response.blob(); }).then(blob => { if (!blob.type.startsWith("image/")) throw new Error("This file is not a photo."); if (alive) { url = URL.createObjectURL(blob); setConverted({source,url,error:""}); } }).catch(cause => { if (alive && !controller.signal.aborted) setConverted({source,url:"",error:cause instanceof Error ? cause.message : "Photo could not be opened."}); });
  return () => { alive = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
 }, [media.src]);
 if (!photo) return null;
 const url = media.src?.startsWith("blob:") ? media.src : converted.source === media.src ? converted.url : "";
 const error = media.error || (converted.source === media.src ? converted.error : "");
 return <PrivateImageLightbox src={url ?? ""} title={photo.name || photo.alt} loading={!url && !error} error={error || undefined} onClose={onClose} position={`${index + 1} / ${photos.length} · Private preview`} onPrevious={photos.length > 1 ? () => setActive(photos[(index + photos.length - 1) % photos.length].id) : undefined} onNext={photos.length > 1 ? () => setActive(photos[(index + 1) % photos.length].id) : undefined} />;
}
