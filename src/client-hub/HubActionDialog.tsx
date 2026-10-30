"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./HubWorkspaceWindow.module.css";
export function HubActionDialog({ title, children, onClose, onConfirm, busy = false, confirmLabel = "Confirm", cancelLabel = "Cancel" }: { title: string; children: ReactNode; onClose: () => void; onConfirm?: () => void; busy?: boolean; confirmLabel?: string; cancelLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const dialog = ref.current, previous = document.activeElement; if (dialog && !dialog.open) dialog.showModal(); return () => { if (dialog?.open) dialog.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><header><h2 id={titleId}>{title}</h2><button type="button" disabled={busy} aria-label="Close confirmation" onClick={onClose}>×</button></header><div className={styles.body}>{children}</div><div className={`${styles.actions} ${styles.confirmActions}`}><button type="button" disabled={busy} onClick={onClose}>{cancelLabel}</button>{onConfirm && <button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : confirmLabel}</button>}</div></dialog>;
}
