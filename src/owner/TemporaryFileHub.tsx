"use client";

import { AssetLibrary } from "./AssetLibrary";
import styles from "./AssetLibrary.module.css";

/** Cloud-backed File Hub. Existing legacy references remain readable, but the old chooser is hidden. */
export function TemporaryFileHub() {
  return <div className={styles.fileHub}>
    <AssetLibrary manager />
  </div>;
}
