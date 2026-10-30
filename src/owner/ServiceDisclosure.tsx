"use client";
import type { ReactNode } from "react";
import styles from "./TaylorServices.module.css";
/** Native disclosure hides presentation only. Children remain mounted so an
 * unsaved provider draft and its dirty/busy guards survive collapse/reopen. */
export function ServiceDisclosure({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className={styles.disclosure} open={defaultOpen}>
    <summary className={styles.disclosureHeading}><span>{title}</span><span className={styles.disclosureChevron} aria-hidden="true">▶</span></summary>
    <div className={styles.disclosureBody}>{children}</div>
  </details>;
}
