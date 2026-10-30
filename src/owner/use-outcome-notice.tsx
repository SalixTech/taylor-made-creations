"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import styles from "./OutcomeNotice.module.css";

type Kind = "success" | "error";
/** Explicit persistence is for validation, credentials, setup or reconciliation—not a timeout guess. */
export function useOutcomeNotice(kind: Kind = "success", defaultPersistent = false) {
  const [state, setState] = useState({ message: "", persistent: defaultPersistent, revision: 0 });
  const setMessage = useCallback((message: string | null, persistent = defaultPersistent) => {
    setState(previous => ({ message: message ?? "", persistent, revision: previous.revision + 1 }));
  }, [defaultPersistent]);
  const dismiss = useCallback(() => setState(previous => ({ ...previous, message: "" })), []);
  useEffect(() => {
    if (!state.message || state.persistent) return;
    const revision = state.revision;
    const timer = window.setTimeout(() => setState(previous => previous.revision === revision ? { ...previous, message: "" } : previous), kind === "error" ? 8_000 : 5_000);
    return () => window.clearTimeout(timer);
  }, [state.message, state.persistent, state.revision, kind]);
  // A render helper keeps the semantic alert and its native dismiss button in the caller's tree.
  const render = (className = "", label = kind === "error" ? "Dismiss error" : "Dismiss notification") => state.message ? <div key={state.revision} className={`${className} ${styles.message}`} role={kind === "error" ? "alert" : "status"} data-outcome={kind} data-transient-outcome={!state.persistent || undefined}>
    <span>{state.message}</span>{!state.persistent && <button type="button" data-owner-button className={styles.close} aria-label={label} onClick={dismiss}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}
  </div> : null;
  return [state.message, setMessage, render] as const;
}

/** Only transient failures of read-only operations may vanish; auth/setup stays actionable. */
export function temporaryReadFailure(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String(error.code).split("/").at(-1) : "";
  return ["unavailable", "network-request-failed", "deadline-exceeded"].includes(code ?? "") || error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

/** This helper must be bound to a particular private save, never send/pay/publish. */
export function localSaveOnEnter(event: KeyboardEvent<HTMLElement>, enabled: boolean, save: () => void) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || event.keyCode === 229) return;
  if ((event.target as HTMLElement)?.tagName !== "INPUT") return;
  event.preventDefault(); if (enabled && !event.repeat) save();
}
