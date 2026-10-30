"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { lockPageScroll } from "@/components/modal-scroll-lock";
import styles from "./ProjectWorkspace.module.css";
export function SupportArchiveDialog({ children, onClose, busy = false, empty = false }: { children: ReactNode; onClose: () => void; busy?: boolean; empty?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), titleId = useId();
  useEffect(() => {
    const modal = dialog.current, trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    try { modal?.showModal(); closeButton.current?.focus(); } catch (error) { unlock(); throw error; }
    return () => { modal?.close(); unlock(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.archiveDialog} data-empty={empty || undefined} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><header><div><h2 id={titleId}>Resolved requests</h2><p>Reopen a request to continue the conversation.</p></div><button ref={closeButton} type="button" className={styles.iconButton} aria-label="Close request archive" disabled={busy} onClick={onClose}>×</button></header><div className={styles.archiveBody}>{children}</div></dialog>;
}
