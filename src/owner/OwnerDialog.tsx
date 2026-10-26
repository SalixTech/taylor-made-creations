"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { lockPageScroll } from "@/components/modal-scroll-lock";
import styles from "./OwnerPortal.module.css";
import dialogStyles from "./OwnerDialog.module.css";

export function Dialog({ title, children, onClose, actions, dismissDisabled = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode; dismissDisabled?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdropDown = useRef(false);
  function outside(event: { currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    try { dialog?.showModal(); } catch (error) { unlock(); throw error; }
    return () => { dialog?.close(); unlock(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""} ${dialogStyles.dialog}`} onCancel={event => { event.preventDefault(); if (!dismissDisabled) onClose(); }} onPointerDown={event => { backdropDown.current = event.target === event.currentTarget && outside(event); }} onClick={event => { const dismiss = backdropDown.current && event.target === event.currentTarget && outside(event); backdropDown.current = false; if (dismiss && !dismissDisabled) onClose(); }} aria-labelledby={titleId}><div className={styles.dialogHeading}><h2 id={titleId}>{title}</h2><button type="button" className={styles.iconButton} aria-label="Close dialog" disabled={dismissDisabled} onClick={onClose}>×</button></div><div className={styles.dialogBody}>{children}</div><div className={styles.dialogActions}>{actions}</div></dialog>;
}

