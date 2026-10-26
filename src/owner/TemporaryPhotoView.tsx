"use client";

import Image from "next/image";
import { useOwnerMediaSource } from "./media-client";
import { Dialog } from "./OwnerDialog";
import type { StagedPhoto } from "./temporary-photo-client";
import styles from "./AssetLibrary.module.css";

export function TemporaryPhotoView({ photo, onClose }: { photo: StagedPhoto; onClose: () => void }) {
  const media = useOwnerMediaSource(photo.src);
  return <Dialog title={photo.name} wide onClose={onClose} actions={<button type="button" className={styles.button} onClick={onClose}>Close photo</button>}>
    <div className={styles.fullPreview}>{media.error ? <p className={styles.error} role="alert">{media.error}</p> : media.src ? <Image unoptimized src={media.src} alt={photo.name} width={photo.width} height={photo.height} /> : <p role="status">Loading private photo…</p>}</div>
    <p className={styles.description}>{photo.width} × {photo.height} pixels · {Math.max(1, Math.round(photo.bytes / 1024))} KB · {photo.trashedAt ? "In temporary-photo Trash" : "Temporary photo"}. Viewing does not change or publish your image.</p>
  </Dialog>;
}
