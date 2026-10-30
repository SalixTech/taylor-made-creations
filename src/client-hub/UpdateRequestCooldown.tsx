"use client";
import { useConfirmAction } from "./use-confirm-action";
import { useEffect, useRef, useState, useCallback, useId, type FormEvent } from "react";
import SiteSelect from "@/components/SiteSelect";
import type { ClientHubProject } from "./model";
import { getHubUpdateRequestCooldown, setHubUpdateRequestCooldown } from "./workspace-client";
import { cooldownText, type HubUpdateRequestCooldown } from "./conversation-state";
import { clientHubErrorMessage, isClientHubSessionError } from "./client";
import { HubActionDialog } from "./HubActionDialog";
import styles from "./ProjectWorkspace.module.css";

export function useUpdateRequestCooldown(project: ClientHubProject, owner: boolean, active: boolean, onFailure: (error: unknown) => void) {
  const [value, setValue] = useState<HubUpdateRequestCooldown | null>(null), [checkedAt, setCheckedAt] = useState(0), [error, setError] = useState("");
  const lifecycle = useRef(0), controller = useRef<AbortController | null>(null);
  const failure = useRef(onFailure); useEffect(() => { failure.current = onFailure; }, [onFailure]);
  const refresh = useCallback(async () => {
    const life = lifecycle.current, request = new AbortController(); controller.current?.abort(); controller.current = request;
    try { const next = await getHubUpdateRequestCooldown(project, owner, request.signal); if (request.signal.aborted || life !== lifecycle.current) return; setValue(next); setCheckedAt(Date.now()); setError(""); }
    catch (cause) { if (!request.signal.aborted && life === lifecycle.current) { setError(clientHubErrorMessage(cause)); if (isClientHubSessionError(cause)) failure.current(cause); } }
  }, [project, owner]);
  useEffect(() => { const lifecycleRef = lifecycle; lifecycleRef.current++; return () => { lifecycleRef.current++; controller.current?.abort(); }; }, [project, owner]);
  useEffect(() => {
    if (!active) return; let subscribed = true; void Promise.resolve().then(() => { if (subscribed) void refresh(); });
    const check = () => { if (document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { subscribed = false; controller.current?.abort(); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [active, refresh]);
  return { value, checkedAt, error, refresh, accept: (next: HubUpdateRequestCooldown) => { setValue(next); setCheckedAt(Date.now()); setError(""); } };
}
export function UpdateRequestCooldownControl({ project, value, onSaved, onFailure, onReload, onBusyChange, onDirtyChange, disabled }: { project: ClientHubProject; value: HubUpdateRequestCooldown | null; onSaved: (value: HubUpdateRequestCooldown) => void; onFailure: (cause: unknown) => void; onReload: () => void; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void; disabled: boolean }) {
  const { confirm, confirmation } = useConfirmAction();
  const intervalId = useId();
  const [draft, setDraft] = useState<{ choice: string; revision: number } | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [retrying, setRetrying] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const alive = useRef(false), pending = useRef(false), attempt = useRef<{ operationId: string; expectedRevision: number; overrideDays?: number | null; reset?: true } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choice = draft?.choice ?? (value?.overrideDays == null ? "inherit" : String(value.overrideDays));
  const changedElsewhere = !!draft && !!value && draft.revision !== value.revision;
  const changeChoice = (choice: string) => { if (value) setDraft(previous => ({ choice, revision: previous?.revision ?? value.revision })); };
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(!!draft || retrying); return () => onDirtyChange?.(false); }, [draft, retrying, onDirtyChange]);
  async function save(event?: FormEvent, reset = false) {
    event?.preventDefault(); if (!value || pending.current || disabled || changedElsewhere && !reset) return;
    const days = choice === "inherit" ? null : Number(choice);
    if (!reset && (choice !== "inherit" && (!/^\d+$/.test(choice) || !Number.isInteger(days) || days! < 0 || days! > 365))) { setNotice("Use 0–365 days, or inherit the global setting."); return; }
    const input = attempt.current ?? { operationId: crypto.randomUUID(), expectedRevision: reset ? value.revision : draft?.revision ?? value.revision, ...(reset ? { reset: true as const } : { overrideDays: days }) }; attempt.current = input; setRetrying(true); pending.current = true; setBusy(true); setNotice("");
    try { const result = await setHubUpdateRequestCooldown(project, input); if (!alive.current) return; attempt.current = null; setRetrying(false); setDraft(previous => input.reset ? previous && previous.revision === input.expectedRevision ? { ...previous, revision: result.revision } : previous : null); onSaved(result); setResetOpen(false); setNotice("Saved Successfully"); }
    catch (cause) { if (alive.current) { setNotice(clientHubErrorMessage(cause)); onFailure(cause); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <details className={styles.cooldownControl}>{confirmation}<summary>Update request timing for this client</summary>{changedElsewhere && <p className={styles.retryNote}>The saved client interval changed elsewhere. Your staged value is unchanged. <button type="button" className={styles.textButton} disabled={busy} onClick={async () => { if (await confirm("Discard your staged interval and use the newly saved value?")) setDraft(null); }}>Use saved interval</button></p>}<p className={styles.caption}>{value ? `Effective interval: ${value.effectiveDays === 0 ? "off" : `${value.effectiveDays} days`} · ${value.source === "global" ? "global setting" : "client override"}. Global controls are in Settings.` : "Checking the saved interval…"}</p><form className={styles.cooldownForm} onSubmit={event => void save(event)}><label htmlFor={intervalId}>Client interval<fieldset disabled={busy || disabled || !value || retrying}><SiteSelect id={intervalId} value={choice === "inherit" ? "inherit" : "custom"} onChange={next => { if (!busy && !disabled && value && !retrying) changeChoice(next === "inherit" ? "inherit" : String(value.effectiveDays)); }} options={[{ value: "inherit", label: "Use global interval" }, { value: "custom", label: "Client override" }]} /></fieldset></label>{choice !== "inherit" && <label>Days (0 disables)<input type="number" min="0" max="365" step="1" value={choice} disabled={busy || disabled || retrying} onChange={event => changeChoice(event.target.value)} /></label>}<button className={styles.button} type="submit" disabled={busy || disabled || !value || changedElsewhere}>{busy ? "Saving…" : retrying ? "Retry change" : "Save client interval"}</button><button className={styles.button} type="button" disabled={busy || disabled || !value || retrying} onClick={() => setResetOpen(true)}>Reset cooldown</button></form>{retrying && !busy && <button className={styles.textButton} type="button" onClick={async () => { if (!await confirm("The earlier change may have saved. Check the saved interval before making another change?")) return; attempt.current = null; setRetrying(false); setDraft(null); setNotice(""); onReload(); }}>Check saved interval / clear retry</button>}{notice && <p className={styles.caption} role="status">{notice}</p>}<p className={styles.caption}>0 disables only the business cooldown. Safety quotas and server checks remain active.</p>{resetOpen && <HubActionDialog title="Reset update cooldown?" confirmLabel="Reset cooldown" busy={busy} onClose={() => setResetOpen(false)} onConfirm={() => void save(undefined, true)}><p>This client can request an update immediately. General request limits still apply.</p>{notice && <p role="alert">{notice}</p>}</HubActionDialog>}</details>;
}
export function CooldownCountdown({ value, checkedAt }: { value: HubUpdateRequestCooldown | null; checkedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  return <span>{cooldownText(value, now - checkedAt)}</span>;
}
