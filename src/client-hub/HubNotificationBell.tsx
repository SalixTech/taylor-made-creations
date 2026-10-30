"use client";

import { useEffect, useId, useRef, useState } from "react";
import { hubNotificationUnreadCount, type HubNotification } from "./model";
import { subscribeHubNotifications } from "./workspace-client";
import { changeHubNotifications, loadHubNotificationLabels, type HubNotificationAction } from "./notification-client";
import { watchOwnerIntakeNotifications, markOwnerIntakeNotificationRead, type OwnerIntakeNotification } from "@/owner/owner-intake-notifications";
import styles from "./HubNotificationBell.module.css";
import { useInvoiceInbox } from "./InvoiceInbox";
import { notificationAreaIsActive } from "./notification-presence";
import { createStudioNotificationAudio, playNotificationAudio, primeStudioNotificationAudio } from "./notification-audio";

const channelName = { chat: "Maker Chat", photos: "Photos", requests: "Requests" };
type Preference = { desktop: boolean; sound: boolean };
/** Account-scoped summaries. Notification actions never claim that a conversation was viewed. */
export function HubNotificationBell({ owner, accountKey, onNavigate, onNavigateIntake }: { owner: boolean; accountKey: string; onNavigate?: (item: HubNotification) => void; onNavigateIntake?: (item: OwnerIntakeNotification) => boolean }) {
  const invoices = useInvoiceInbox(owner, accountKey);
  const id = useId(), [open, setOpen] = useState(false), [accountItems, setAccountItems] = useState<{ key: string; items: HubNotification[] } | null>(null), [error, setError] = useState("");
  const [intakeState, setIntakeState] = useState<{ key: string; items: OwnerIntakeNotification[]; error: string } | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const intakeAction = useRef(false);
  const [labels, setLabels] = useState<{ key: string; titles: Record<string, string> } | null>(null);
  const [optimistic, setOptimistic] = useState<{ key: string; versions: Record<string, number>; action: HubNotificationAction } | null>(null);
  const [actionState, setActionState] = useState<{ key: string; busy: boolean; error: string } | null>(null);
  const [preference, setPreference] = useState<Preference>({ desktop: false, sound: false }), [permission, setPermission] = useState(""), [permissionBusy, setPermissionBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), versions = useRef<Map<string, number> | null>(null), currentPreference = useRef(preference), soundPlayer = useRef<HTMLAudioElement | null>(null);
  const prefKey = `tmc-hub-notifications:${owner ? "owner" : "client"}:${accountKey}`;
  const preferenceScope = useRef({ key: prefKey, generation: 0, active: true }), permissionAttempt = useRef<object | null>(null), actionAttempt = useRef<AbortController | null>(null);
  useEffect(() => {
    versions.current = null; permissionAttempt.current = null; actionAttempt.current?.abort(); actionAttempt.current = null; currentPreference.current = { desktop: false, sound: false };
    const scope = { key: prefKey, generation: preferenceScope.current.generation + 1, active: true }; preferenceScope.current = scope;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setPermissionBusy(false); setPermission(""); setPreference({ desktop: false, sound: false }); setActionState(null); setOptimistic(null);
      try { const value = JSON.parse(window.localStorage.getItem(prefKey) ?? "null"); const preference = { desktop: value?.desktop === true, sound: !owner && value?.sound === true }; setPreference(preference); currentPreference.current = preference; } catch { /* Optional local display preference, never authority. */ }
    });
    return () => { active = false; scope.active = false; actionAttempt.current?.abort(); soundPlayer.current?.pause(); soundPlayer.current = null; };
  }, [prefKey, owner]);
  useEffect(() => { currentPreference.current = preference; }, [preference]);
  useEffect(() => {
    let active = true, projectKeys = "", labelRequest: AbortController | null = null;
    const unsubscribe = subscribeHubNotifications(owner, next => {
      if (!active) return;
      const mine = next.filter(item => item.recipientRole === (owner ? "owner" : "client"));
      const prior = versions.current, changed = prior && mine.some(item => hubNotificationUnreadCount(item) > 0 && item.version > (prior.get(item.notificationId) ?? 0) && !notificationAreaIsActive(item));
      versions.current = new Map(mine.map(item => [item.notificationId, item.version]));
      setAccountItems({ key: prefKey, items: mine }); setError("");
      const nextProjectKeys = [...new Set(mine.map(item => `${item.clientId}:${item.projectId}`))].sort().join("|");
      if (nextProjectKeys !== projectKeys) {
        projectKeys = nextProjectKeys; labelRequest?.abort(); const request = new AbortController(); labelRequest = request;
        setLabels(null);
        void loadHubNotificationLabels(owner, mine, request.signal).then(titles => { if (active && !request.signal.aborted) setLabels({ key: prefKey, titles }); }).catch(() => { /* Keep a neutral commission identifier if an authorized title cannot load. */ });
      }
      try { if (changed && currentPreference.current.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
        // Never put a client's name, commission title, or private message body on a lock screen.
        // Clients use the browser/OS cue only. The owner retains the supplied studio cue.
        const notification = new Notification("Taylor Made Creations", { body: "New activity in your private Client Hub.", tag: `tmc-hub-${owner ? "owner" : "client"}`, silent: owner || !currentPreference.current.sound });
        notification.onclick = () => { if (!active) { notification.close(); return; } window.focus(); setOpen(true); notification.close(); };
      }
      } catch { /* Native notifications are optional and cannot interrupt live data. */ }
      if (changed && owner && currentPreference.current.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
        // No client Audio element, synthesized sound, object URL or mount-time playback.
        soundPlayer.current ??= createStudioNotificationAudio();
        playNotificationAudio(soundPlayer.current);
      }
    }, () => { if (active) { labelRequest?.abort(); setLabels(null); setAccountItems({ key: prefKey, items: [] }); setError("Notifications could not connect. Open a workspace to check updates."); } });
    return () => { active = false; labelRequest?.abort(); unsubscribe(); };
  }, [owner, accountKey, prefKey]);
  useEffect(() => {
    if (!owner) return;
    let active = true, seen: Set<string> | null = null;
    const unsubscribe = watchOwnerIntakeNotifications(next => {
      if (!active) return;
      const changed = seen !== null && next.some(item => !item.readAt && !seen!.has(item.notificationId));
      seen = new Set(next.map(item => item.notificationId));
      setIntakeState({ key: prefKey, items: next, error: "" });
      if (!changed || !currentPreference.current.desktop || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      try {
        const alert = new Notification("Taylor Made Creations", { body: "A new private request is waiting in your studio inbox.", tag: "tmc-owner-intake", silent: true });
        alert.onclick = () => { if (active) { window.focus(); setOpen(true); } alert.close(); };
      } catch { /* Browser alerts are optional; the in-site inbox stays available. */ }
      soundPlayer.current ??= createStudioNotificationAudio();
      playNotificationAudio(soundPlayer.current);
    }, () => { if (active) setIntakeState(previous => ({ key: prefKey, items: previous?.key === prefKey ? previous.items : [], error: "Request alerts could not connect. Open your request inbox to check." })); });
    return () => { active = false; unsubscribe(); };
  }, [owner, prefKey]);
  async function acknowledgeIntake(captured: OwnerIntakeNotification[]) {
    if (!owner || intakeAction.current || !captured.length) return;
    const scope = preferenceScope.current;
    intakeAction.current = true; setIntakeBusy(true);
    try {
      await Promise.all(captured.map(markOwnerIntakeNotificationRead));
      if (scope.active && preferenceScope.current === scope) setIntakeState(previous => previous?.key !== prefKey ? previous : { ...previous, error: "" });
    } catch {
      if (scope.active && preferenceScope.current === scope) setIntakeState(previous => ({ key: prefKey, items: previous?.key === prefKey ? previous.items : [], error: "Could not clear that request alert. The request is unchanged." }));
    } finally { intakeAction.current = false; if (scope.active && preferenceScope.current === scope) setIntakeBusy(false); }
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  function armOwnerSound() { if (!owner) return; soundPlayer.current ??= createStudioNotificationAudio(); if (soundPlayer.current) primeStudioNotificationAudio(soundPlayer.current); }
  function savePreference(value: Preference) { if (owner && !value.desktop) soundPlayer.current?.pause(); const safe = { desktop: value.desktop, sound: !owner && value.sound }; setPreference(safe); currentPreference.current = safe; try { window.localStorage.setItem(prefKey, JSON.stringify(owner ? { desktop: safe.desktop } : safe)); } catch { /* Unavailable storage does not block the bell. */ } }
  async function enableDesktop() {
    if (permissionAttempt.current) return;
    if (typeof Notification === "undefined") { setPermission("Desktop notifications are unavailable in this browser."); return; }
    const scope = preferenceScope.current, attempt = {}; permissionAttempt.current = attempt; setPermissionBusy(true);
    if (owner) armOwnerSound();
    try { const result = await Notification.requestPermission(); if (!scope.active || preferenceScope.current !== scope) return; savePreference({ ...currentPreference.current, desktop: result === "granted" }); if (result !== "granted" && owner) soundPlayer.current?.pause(); setPermission(result === "granted" ? "Desktop notifications enabled on this browser." : "Notifications are off. You can change this in your browser settings."); }
    catch { if (scope.active && preferenceScope.current === scope) setPermission("The browser could not enable desktop notifications."); }
    finally { if (permissionAttempt.current === attempt) permissionAttempt.current = null; if (scope.active && preferenceScope.current === scope) setPermissionBusy(false); }
  }
  async function act(action: HubNotificationAction, captured: HubNotification[]) {
    if (actionAttempt.current || !captured.length) return;
    const scope = preferenceScope.current, controller = new AbortController(); actionAttempt.current = controller;
    setActionState({ key: prefKey, busy: true, error: "" });
    setOptimistic({ key: prefKey, versions: Object.fromEntries(captured.map(item => [item.notificationId, item.version])), action });
    try {
      const updated = await changeHubNotifications(owner, action, captured, controller.signal);
      if (!scope.active || preferenceScope.current !== scope || controller.signal.aborted) return;
      const cursors = new Map(updated.map(item => [item.notificationId, item]));
      setAccountItems(previous => previous?.key !== prefKey ? previous : { ...previous, items: previous.items.map(item => {
        const result = cursors.get(item.notificationId);
        // Overlay only acknowledgment cursors, never stale versions/latest events or actual receipts.
        return result ? { ...item, acknowledgedVersion: Math.max(item.acknowledgedVersion ?? 0, Math.min(result.acknowledgedVersion ?? 0, item.version)), dismissedVersion: Math.max(item.dismissedVersion ?? 0, Math.min(result.dismissedVersion ?? 0, item.version)) } : item;
      }) });
      setOptimistic(null);
      setActionState({ key: prefKey, busy: false, error: "" });
    } catch {
      if (scope.active && preferenceScope.current === scope && !controller.signal.aborted) { setOptimistic(null); setActionState({ key: prefKey, busy: false, error: "The notification action could not be confirmed. Please try again. Messages are unchanged." }); }
    } finally { if (actionAttempt.current === controller) actionAttempt.current = null; }
  }
  const items = (accountItems?.key === prefKey ? accountItems.items : []).map(item => {
    const captured = optimistic?.key === prefKey ? optimistic.versions[item.notificationId] : undefined;
    if (captured === undefined) return item;
    const field = optimistic?.action === "dismiss" ? "dismissedVersion" : "acknowledgedVersion";
    return { ...item, [field]: Math.max(item[field] ?? 0, Math.min(captured, item.version)) };
  });
  const unread = items.filter(item => hubNotificationUnreadCount(item) > 0).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  const intakeUnread = owner && intakeState?.key === prefKey ? intakeState.items.filter(item => !item.readAt) : [];
  const intakeError = owner && intakeState?.key === prefKey ? intakeState.error : "";
  const unreadCount = unread.reduce((count, item) => count + hubNotificationUnreadCount(item), 0) + intakeUnread.length + invoices.unread;
  const titles = labels?.key === prefKey ? labels.titles : {}, busy = actionState?.key === prefKey && actionState.busy, actionError = actionState?.key === prefKey ? actionState.error : "";
  return <div className={styles.root} data-hub-notifications>
    <button ref={trigger} type="button" className={styles.bell} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread updates` : ""}`} title="Notifications" aria-expanded={open} aria-controls={id} onClick={() => { if (owner && currentPreference.current.desktop) armOwnerSound(); setOpen(value => !value); }}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{unreadCount > 0 && <span className={styles.count}>{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
    {open && <div ref={panel} id={id} className={styles.panel} role="region" aria-label="Notifications">
      <header><strong>Your studio updates</strong><button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus(); }}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button></header>
      {unreadCount > 0 && <div className={styles.actions}><button type="button" disabled={busy || intakeBusy || invoices.busy} onClick={() => { void act("acknowledge", unread); void acknowledgeIntake(intakeUnread); invoices.markAllRead(); }} title="Clears these notifications only. Conversation read receipts change when you view the messages.">{busy ? "Updating…" : "Mark all as read"}</button><small>Notification controls don’t change message read receipts.</small></div>}
      {actionError && <p role="status">{actionError}</p>}
      {error ? <p role="status">{error}</p> : unread.length ? <ul aria-label="Unread notifications">{unread.map(item => {
        const count = hubNotificationUnreadCount(item), title = titles[item.projectId] || `Commission ${item.projectId.slice(0, 8)}`, unit = item.channel === "chat" ? "message" : "update";
        return <li key={item.notificationId} className={styles.notificationCard}>
          <button type="button" className={styles.openNotification} aria-label={`Open ${title}, ${channelName[item.channel]}, ${count} unread ${unit}${count === 1 ? "" : "s"}`} onClick={() => { onNavigate?.(item); if (!onNavigate) window.dispatchEvent(new CustomEvent("tmc-hub-open-notification", { detail: item })); setOpen(false); }}><span className={styles.unreadDot} aria-hidden="true" /><span className={styles.notificationText}><strong>{title}</strong><span className={styles.channel}>{channelName[item.channel]} · {count} unread {unit}{count === 1 ? "" : "s"}</span><small>{new Date(item.latestAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span></button>
          <button type="button" className={styles.dismiss} disabled={busy} aria-label={`Dismiss ${title}, ${channelName[item.channel]} notification`} title="Dismiss notification, not messages" onClick={() => void act("dismiss", [item])}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
        </li>;
      })}</ul> : !intakeUnread.length && !intakeError && !invoices.unread && !invoices.checking ? <p>You’re all caught up.</p> : null}
      {intakeError && <p role="status">{intakeError}</p>}
      {intakeUnread.length > 0 && <ul aria-label="Unread request alerts">{intakeUnread.map(item => {
        const title = item.kind === "commission-request" ? "New commission request" : "Client code requested";
        return <li key={item.notificationId} className={styles.notificationCard}><button type="button" className={styles.openNotification} onClick={() => {
          if (onNavigateIntake?.(item)) { setOpen(false); void acknowledgeIntake([item]); }
        }}><span className={styles.unreadDot} aria-hidden="true" /><span className={styles.notificationText}><strong>{title}</strong><span className={styles.channel}>Open your private request inbox</span><small>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span></button><button type="button" className={styles.dismiss} disabled={intakeBusy} aria-label={`Dismiss ${title.toLowerCase()} alert`} title="Dismiss alert, not request" onClick={() => void acknowledgeIntake([item])}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button></li>;
      })}</ul>}
      {invoices.alertSection}
      <div className={styles.preferences}><strong>This browser</strong><button type="button" disabled={permissionBusy} onClick={() => { if (preference.desktop) savePreference({ ...preference, desktop: false }); else void enableDesktop(); }}>{permissionBusy ? "Waiting for browser…" : preference.desktop ? "Turn desktop notifications off" : "Enable desktop notifications"}</button>{!owner && <><label><input type="checkbox" checked={preference.sound} onChange={event => savePreference({ ...preference, sound: event.target.checked })} /> Sound alerts</label><small>Uses your browser or device’s notification sound. Desktop notifications must be on; sound availability depends on browser and system settings.</small></>}{permission && <p role="status">{permission}</p>}</div>
    </div>}
    {invoices.dialog}
  </div>;
}
