"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { lockPageScroll } from "@/components/modal-scroll-lock";
import styles from "./OwnerPortal.module.css";
import dialogStyles from "./OwnerDialog.module.css";
import buttons from "./OwnerButton.module.css";

export function Dialog({ title, children, onClose, actions, dismissDisabled = false, wide = false, maximizable = false }: { title: string; children?: ReactNode; onClose: () => void; actions: ReactNode; dismissDisabled?: boolean; wide?: boolean; maximizable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [maximized, setMaximized] = useState(false);
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
    return () => { dialog?.close(); unlock(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""} ${dialogStyles.dialog} ${maximized ? dialogStyles.maximized : ""}`} data-maximized={maximized} data-compact={!children} onCancel={event => { event.preventDefault(); if (!dismissDisabled) onClose(); }} onPointerDown={event => { backdropDown.current = event.target === event.currentTarget && outside(event); }} onClick={event => { const dismiss = backdropDown.current && event.target === event.currentTarget && outside(event); backdropDown.current = false; if (dismiss && !dismissDisabled) onClose(); }} aria-labelledby={titleId}><div className={styles.dialogHeading}><h2 id={titleId}>{title}</h2><div className={dialogStyles.headingActions}>{maximizable && <button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet} ${buttons.icon}`} aria-label={maximized ? "Restore preview size" : "Maximize preview"} title={maximized ? "Restore preview size" : "Maximize preview"} aria-pressed={maximized} onClick={() => setMaximized(value => !value)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{maximized ? <path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" /> : <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />}</svg></button>}<button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet} ${buttons.icon}`} aria-label="Close dialog" disabled={dismissDisabled} onClick={onClose}>×</button></div></div><div className={styles.dialogBody}>{children}</div><div className={styles.dialogActions}>{actions}</div></dialog>;
}

