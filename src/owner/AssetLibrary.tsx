"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PHOTO_UPLOAD_MAX_BYTES, OWNER_MEDIA_SOURCE_PATTERN, useOwnerMediaSource, type UploadedPhoto } from "./media-client";
import { usePrivateAssetLibrary } from "./asset-library-client";
import { PhotoUpload } from "./PhotoUpload";
import styles from "./AssetLibrary.module.css";

type StagedPhoto = UploadedPhoto & { name: string; createdAt: string };
function isStagedPhoto(value: unknown): value is StagedPhoto {
  if (!value || typeof value !== "object") return false;
  const photo = value as Partial<StagedPhoto>;
  return typeof photo.id === "string" && photo.src === `/api/media/${photo.id}` && OWNER_MEDIA_SOURCE_PATTERN.test(photo.src) && typeof photo.name === "string" && photo.name.length <= 150 && typeof photo.createdAt === "string" && Number.isFinite(Date.parse(photo.createdAt)) && photo.storage === "development-disk" && photo.contentType === "image/webp" && Number.isInteger(photo.width) && Number.isInteger(photo.height) && !!photo.width && !!photo.height && typeof photo.bytes === "number" && photo.bytes > 0 && photo.bytes <= PHOTO_UPLOAD_MAX_BYTES;
}
function StagedThumbnail({ photo }: { photo: StagedPhoto }) {
  const { src, error } = useOwnerMediaSource(photo.src);
  if (!src || error) return <span className={styles.status}>{error || "Loading private photo…"}</span>;
  return <Image unoptimized src={src} alt={photo.name} width={photo.width} height={photo.height} />;
}
/** Keep large reusable libraries cheap without imposing a photo-count limit. */
function LazyStagedThumbnail({ photo }: { photo: StagedPhoto }) {
  const target = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !target.current) return;
    const observer = new IntersectionObserver(entries => { setNearby(entries.some(entry => entry.isIntersecting)); }, { rootMargin: "200px" });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, []);
  return <div className={styles.preview} ref={target}>{nearby ? <StagedThumbnail photo={photo} /> : <span className={styles.status}>Photo preview</span>}</div>;
}
export function AssetLibrary({ selected, onSelect }: { selected: string; onSelect: (src: string) => void }) {
  const library = usePrivateAssetLibrary("/api/taylor/media", "photos", isStagedPhoto);
  return <section className={styles.library} aria-label="Temporary photo library">
    <div className={styles.heading}><h3>Temporary photo library</h3><button type="button" className={styles.button} disabled={library.loading} onClick={library.refresh}>Refresh library</button></div>
    <p className={styles.description}>Upload first, then choose <strong>Use photo</strong>. Uploading does not replace the current image or publish it. These reusable photos stay on this development server until you remove them outside the app; they are not copied to cloud storage.</p>
    <PhotoUpload multiple staged label="Upload to temporary library" onUploaded={photos => { for (const photo of photos) library.add({ ...photo.media, name: photo.name, createdAt: new Date().toISOString() }); }} />
    {library.loading && <p className={styles.status} role="status">Loading your private photo library…</p>}
    {library.error && <p className={styles.error} role="alert">{library.error}</p>}
    {!library.loading && !library.error && !library.assets.length && <p className={styles.status}>No uploaded photos yet. Your current image stays selected.</p>}
    {library.assets.length > 0 && <ul className={styles.list}>{library.assets.map(photo => <li className={styles.item} key={photo.id} data-selected={selected === photo.src}><LazyStagedThumbnail photo={photo} /><p className={styles.name}>{photo.name}</p><button type="button" className={styles.button} aria-label={`Use photo: ${photo.name}`} aria-pressed={selected === photo.src} onClick={() => onSelect(photo.src)}>{selected === photo.src ? "Selected photo" : "Use photo"}</button></li>)}</ul>}
  </section>;
}
