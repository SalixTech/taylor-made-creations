"use client";

import { AssetLibrary } from "./AssetLibrary";
import styles from "./AssetLibrary.module.css";

/** Temporary photos only; shared cloud files/folders await an authorized storage connection. */
export function TemporaryFileHub() {
  return <div className={styles.fileHub}>
    <section className={styles.connectionNotice} aria-label="Cloud file storage"><h2>Firebase Cloud Storage is not connected yet</h2><p>Firebase Cloud Storage is planned but not configured. Shared folders, project files, and client sharing are not available here yet. Temporary photos are not backed up to Firebase or shared across devices.</p></section>
    <AssetLibrary manager />
  </div>;
}
