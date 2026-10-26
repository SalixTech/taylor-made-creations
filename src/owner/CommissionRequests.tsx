"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore/lite";
import { serviceReadError, taylorOwnerSession } from "./taylor-services-client";
import styles from "./TaylorServices.module.css";

import { Dialog } from "./OwnerFields";
import { requestSummary, REQUEST_STATUS_LABELS, type RequestDecision, type RequestSummary } from "./commission-requests-model";
import { decideCommissionRequest, readCommissionHistory, type RequestHistory } from "./commission-requests-client";
import ui from "./OwnerPortal.module.css";
import decisions from "./CommissionRequests.module.css";

export function CommissionRequests() {
  const [requests, setRequests] = useState<RequestSummary[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ request: RequestSummary; status: RequestDecision } | null>(null);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; items: RequestHistory[] | null; error: string | null } | null>(null);
  const mutation = useRef(false);
  const historySequence = useRef(0);
  const active = useRef(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current || mutation.current) return;
    pending.current = true; setBusy(true); setError(null); setRequests(null); setHistory(null); setNotice(null); ++historySequence.current;
    try {
      const session = await taylorOwnerSession();
      const snapshot = await getDocs(query(collection(session.db, "commissionRequests"), limit(50)));
      session.assertCurrent();
      if (!active.current) return;
      const items = snapshot.docs.map(document => requestSummary(document.id, document.data()));
      items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setRequests(items); setCheckedAt(new Date().toISOString());
    } catch (cause) { if (active.current) { setRequests(null); setError(serviceReadError(cause, "Commission requests")); } }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }, []);
  useEffect(() => { active.current = true; void Promise.resolve().then(refresh); return () => { active.current = false; }; }, [refresh]);

  async function applyDecision() {
    if (!decision || mutation.current || pending.current) return;
    mutation.current = true; setSaving(true); setDecisionError(null); setNotice(null);
    try {
      const saved = await decideCommissionRequest(decision.request, decision.status);
      if (!active.current) return;
      setRequests(items => items?.map(item => item.id === decision.request.id ? { ...item, ...saved } : item) ?? null);
      setHistory(null); ++historySequence.current;
      setNotice(`${decision.request.name}: ${REQUEST_STATUS_LABELS[saved.status]} saved privately. No message, contract, or charge was sent.`);
      setDecision(null);
    } catch (cause) { if (active.current) setDecisionError(serviceReadError(cause, "Commission decision")); }
    finally { mutation.current = false; if (active.current) setSaving(false); }
  }
  async function showHistory(id: string) {
    const sequence = ++historySequence.current;
    setHistory({ id, items: null, error: null });
    try { const items = await readCommissionHistory(id); if (active.current && sequence === historySequence.current) setHistory({ id, items, error: null }); }
    catch (cause) { if (active.current && sequence === historySequence.current) setHistory({ id, items: null, error: serviceReadError(cause, "Decision history") }); }
  }
  return <section className={styles.card} aria-labelledby="commission-inbox-heading">
    <div className={styles.heading}><div><h2 id="commission-inbox-heading">Commission Requests</h2><p>A private place for incoming commission requests.</p></div><button type="button" className={styles.secondary} disabled={busy || saving} onClick={() => void refresh()}>{busy ? "Checking…" : "Refresh inbox"}</button></div>
    <div className={styles.inboxNotice}>Public request submission is not connected yet. The inbox will only show requests that actually exist in your private cloud collection.</div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {busy ? <div className={styles.empty} role="status"><strong>Checking your inbox…</strong><p>Reading from Firestore with your current owner session.</p></div>
      : error ? <div className={styles.empty} role="alert"><strong>Inbox not connected</strong><p>{error}</p><small>This is not a confirmed empty inbox. No requests have been deleted or replaced.</small></div>
      : requests?.length === 0 ? <div className={styles.empty}><span aria-hidden="true" className={styles.inboxIcon}>↓</span><strong>No requests yet</strong><p>The private inbox was read successfully and is empty.</p></div>
      : <div className={styles.requests}>{requests?.map(request => <article className={styles.request} key={request.id}><div><h3>{request.name}</h3><span className={`${styles.badge} ${request.status === "approved" ? styles.good : styles.waiting}`}>{request.status ? REQUEST_STATUS_LABELS[request.status] : "Unsupported status"}</span></div>{request.email && <p className={styles.email}>{request.email}</p>}{request.description && <p className={styles.description}>{request.description}</p>}<small>{request.createdAt ? new Date(request.createdAt).toLocaleString() : "Date not supplied"} · Request {request.id}</small><div className={decisions.actions}>{([['approved', 'Approve'], ['denied', 'Deny'], ['waitlisted', 'Waitlist']] as const).map(([status, label]) => <button type="button" className={styles.secondary} key={status} disabled={saving || request.status === status || request.status === null || request.version === null} onClick={() => { setDecisionError(null); setDecision({ request, status }); }}>{label}</button>)}<button type="button" className={ui.textButton} onClick={() => void showHistory(request.id)}>Decision history</button></div>{(request.status === null || request.version === null) && <p className={styles.error}>This request needs a status/version review before it can be changed. Its original content is safe.</p>}{history?.id === request.id && <div className={decisions.history} aria-live="polite"><strong>Decision history</strong>{history.error ? <p role="alert">{history.error}</p> : history.items === null ? <p>Reading saved decisions…</p> : history.items.length === 0 ? <p>No recorded decisions yet.</p> : <ol>{history.items.map(entry => <li key={entry.id}><strong>{REQUEST_STATUS_LABELS[entry.fromStatus]} → {REQUEST_STATUS_LABELS[entry.toStatus]}</strong><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Date not supplied"} · Version {entry.version} · Owner {entry.actorUid}</small></li>)}</ol>}<button type="button" className={ui.textButton} onClick={() => { ++historySequence.current; setHistory(null); }}>Close history</button></div>}</article>)}</div>}
    {!busy && !error && checkedAt && <p className={styles.footnote}>Read confirmed at {new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Showing up to 50 requests. Decisions are owner-only status updates with a saved history. They do not send replies, create contracts, or charge customers.</p>}
    {decision && <Dialog title={`${REQUEST_STATUS_LABELS[decision.status]}: ${decision.request.name}?`} dismissDisabled={saving} onClose={() => { if (!saving) setDecision(null); }} actions={<><button type="button" className={ui.secondary} disabled={saving} onClick={() => setDecision(null)}>Cancel</button><button type="button" className={ui.primary} disabled={saving} onClick={() => void applyDecision()}>{saving ? "Saving decision…" : "Save decision"}</button></>}><p>This changes only this request’s private status from {decision.request.status ? REQUEST_STATUS_LABELS[decision.request.status] : "unknown"} to {REQUEST_STATUS_LABELS[decision.status]}. The owner decision and time are recorded in its history.</p><p>No email, customer reply, contract, or charge will be sent.</p>{decisionError && <p className={ui.errorNotice} role="alert">{decisionError}</p>}</Dialog>}
  </section>;
}
