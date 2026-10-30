"use client";
import { useRequestBanner } from "./use-request-banner";
import { TrashIcon } from "./TrashIcon";
import { SpadeMark } from "@/client-hub/SpadeMark";
import { RefreshButton } from "@/components/RefreshButton";

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, query, orderBy, documentId, startAfter, type QueryDocumentSnapshot } from "firebase/firestore/lite";
import { serviceReadError, taylorOwnerSession } from "./taylor-services-client";
import { IntakeHubAction, CodeRecoveryInbox } from "./IntakeInbox";
import styles from "./TaylorServices.module.css";

import { Dialog } from "./OwnerFields";
import { requestSummary, REQUEST_STATUS_LABELS, type RequestDecision, type RequestSummary } from "./commission-requests-model";
import { decideCommissionRequest, setCommissionRequestTrashed, readCommissionHistory, type RequestHistory } from "./commission-requests-client";
import ui from "./OwnerPortal.module.css";
import decisions from "./CommissionRequests.module.css";

const newest = (left: RequestSummary | undefined, right: RequestSummary) => left && (left.version ?? -1) >= (right.version ?? -1) ? left : right;

export function CommissionRequests({onBusyChange,onDirtyChange}:{onBusyChange?:(value:boolean)=>void;onDirtyChange?:(value:boolean)=>void}={}) {
  const [showDeleted,setShowDeleted]=useState(false),[dragId,setDragId]=useState<string|null>(null),[overTrash,setOverTrash]=useState(false);
  const [trashAction,setTrashAction]=useState<{request:RequestSummary;trashed:boolean;operationId:string}|null>(null);
  const [trashError, setTrashError, trashErrorBanner] = useRequestBanner();
  const [detailBusy,setDetailBusy]=useState(false),[detailOpen,setDetailOpen]=useState(false);
  const [recoveryBusy,setRecoveryBusy]=useState(false),[recoveryOpen,setRecoveryOpen]=useState(false);
  const cursor=useRef<QueryDocumentSnapshot|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [requests, setRequests] = useState<RequestSummary[] | null>(null);
  const loaded = useRef<RequestSummary[] | null>(null);
  const setLoaded = useCallback((update: (previous: RequestSummary[] | null) => RequestSummary[] | null) => {
    const next = update(loaded.current); loaded.current = next; setRequests(next);
  }, []);
  const [busy, setBusy] = useState(true);
  const [error, setError, errorBanner] = useRequestBanner();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ request: RequestSummary; status: RequestDecision } | null>(null);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError, decisionErrorBanner] = useRequestBanner();
  const [, setNotice, noticeBanner] = useRequestBanner();
  const [history, setHistory] = useState<{ id: string; items: RequestHistory[] | null; error: string | null } | null>(null);
  useEffect(()=>{onBusyChange?.(saving||detailBusy||recoveryBusy);return()=>onBusyChange?.(false);},[saving,detailBusy,recoveryBusy,onBusyChange]);
  useEffect(()=>{onDirtyChange?.(detailOpen||recoveryOpen||!!trashAction);return()=>onDirtyChange?.(false);},[detailOpen,recoveryOpen,trashAction,onDirtyChange]);
  const mutation = useRef(false);
  const historySequence = useRef(0);
  const active = useRef(false);
  const pending = useRef(false);
  const readSequence = useRef(0);
  const acknowledged = useRef(new Map<string, RequestSummary>());
  const refresh = useCallback(async (append=false) => {
    if (pending.current || mutation.current) return;
    const read = ++readSequence.current; pending.current = true; setBusy(true); setError(null); setHistory(null); setNotice(null); ++historySequence.current;
    try {
      const session = await taylorOwnerSession();
      const snapshot = await getDocs(query(collection(session.db, "commissionRequests"), orderBy(documentId()), ...(append&&cursor.current ? [startAfter(cursor.current)] : []), limit(50)));
      session.assertCurrent();
      if (!active.current || read !== readSequence.current) return;
      const items = snapshot.docs.map(document => {
        const item = requestSummary(document.id, document.data()), saved = acknowledged.current.get(item.id);
        if (saved && item.version !== null && item.version > (saved.version ?? -1)) acknowledged.current.delete(item.id);
        return newest(loaded.current?.find(previous => previous.id === item.id), newest(saved, item));
      });
      for (const saved of acknowledged.current.values()) if (!items.some(item => item.id === saved.id)) items.push(saved);
      items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      cursor.current=snapshot.docs.at(-1)??null;setHasMore(snapshot.docs.length===50);
      setLoaded(previous => {
        if (!append) return items;
        const merged = new Map((previous ?? []).map(item => [item.id, item]));
        for (const item of items) merged.set(item.id, newest(merged.get(item.id), item));
        return [...merged.values()].sort((a,b)=>(b.createdAt??"").localeCompare(a.createdAt??""));
      }); setCheckedAt(new Date().toISOString());
    } catch (cause) { if (active.current && read === readSequence.current) { setError(serviceReadError(cause, "Commission requests")); } }
    finally { if (read === readSequence.current) { pending.current = false; if (active.current) setBusy(false); } }
  }, [setError, setNotice, setLoaded]);
  useEffect(() => { const lifecycle = readSequence; active.current = true; void Promise.resolve().then(()=>refresh()); return () => { active.current = false; ++lifecycle.current; pending.current = false; }; }, [refresh]);

  async function applyDecision() {
    if (!decision || mutation.current || pending.current) return;
    mutation.current = true; setSaving(true); setDecisionError(null); setNotice(null);
    try {
      const saved = await decideCommissionRequest(decision.request, decision.status);
      if (!active.current) return;
      const received = { ...decision.request, ...saved };
      const updated = newest(loaded.current?.find(item => item.id === received.id), newest(acknowledged.current.get(received.id), received));
      acknowledged.current.set(updated.id, updated);
      setLoaded(items => items?.map(item => item.id === decision.request.id ? updated : item) ?? null);
      setHistory(null); ++historySequence.current;
      setNotice(updated.version !== received.version ? "The earlier decision is confirmed, but this request has a newer saved update. Its latest known state is shown." : `${decision.request.name}: ${REQUEST_STATUS_LABELS[saved.status]} saved privately. Reference pictures and history are kept. No message, contract, or charge was sent.`);
      setDecision(null);
    } catch (cause) { if (active.current) setDecisionError(serviceReadError(cause, "Commission decision")); }
    finally { mutation.current = false; if (active.current) setSaving(false); }
  }
  function askTrash(request:RequestSummary, trashed:boolean) {
    if (mutation.current || pending.current || saving || busy || detailBusy || recoveryBusy || request.version === null) return;
    setTrashError(null); setTrashAction({request,trashed,operationId:crypto.randomUUID()}); setDragId(null); setOverTrash(false);
  }
  async function applyTrash() {
    if (!trashAction || mutation.current || pending.current) return;
    mutation.current=true;setSaving(true);setTrashError(null);
    try {
      const saved = await setCommissionRequestTrashed(trashAction.request,trashAction.trashed,trashAction.operationId);
      if(!active.current)return;
      const received = { ...trashAction.request, ...saved };
      const updated = newest(loaded.current?.find(item => item.id === received.id), newest(acknowledged.current.get(received.id), received));
      acknowledged.current.set(updated.id, updated);
      ++readSequence.current;
      setLoaded(items => {
        const loaded = items ?? [];
        return loaded.some(item => item.id === updated.id) ? loaded.map(item => item.id === updated.id ? updated : item) : [...loaded, updated];
      });
      if (updated.version !== received.version) setShowDeleted(!!updated.trashedAt);
      else if (!trashAction.trashed) setShowDeleted(false);
      setTrashAction(null);setHistory(null);++historySequence.current;
      if(active.current)setNotice(updated.version !== received.version ? "The earlier change is confirmed, but this request has a newer saved update. Its latest known state is shown." : trashAction.trashed ? "Request moved to Deleted. Files, decisions and history are kept." : "Request restored. Its files, decisions and history are unchanged.");
    }catch(cause){if(active.current)setTrashError(serviceReadError(cause,"Request Deleted change"));}
    finally{mutation.current=false;if(active.current)setSaving(false);}
  }
  const visibleRequests=requests?.filter(request=>!!request.trashedAt===showDeleted);
  async function showHistory(id: string) {
    const sequence = ++historySequence.current;
    setHistory({ id, items: null, error: null });
    try { const items = await readCommissionHistory(id); if (active.current && sequence === historySequence.current) setHistory({ id, items, error: null }); }
    catch (cause) { if (active.current && sequence === historySequence.current) setHistory({ id, items: null, error: serviceReadError(cause, "Decision history") }); }
  }
  return <div className={decisions.inboxColumns}><section className={`${styles.card} ${decisions.inboxPanel}`} aria-labelledby="commission-inbox-heading">
    <div className={styles.heading}><div><h2 id="commission-inbox-heading">Commission Requests</h2><p>A private place for incoming commission requests.</p></div><div className={decisions.inboxTools}><button type="button" className={decisions.trashTarget} data-drag-over={overTrash || undefined} aria-label={`${showDeleted ? "Back to commission requests" : "Deleted commission requests"} (${requests?.filter(r=>r.trashedAt).length ?? 0})`} title={dragId ? "Drop to review moving this request to Deleted" : showDeleted ? "Back to commission requests" : "Deleted commission requests"} aria-pressed={showDeleted} disabled={busy||saving||detailBusy||recoveryBusy} onClick={()=>setShowDeleted(value=>!value)} onDragOver={event=>{if(dragId&&!saving){event.preventDefault();event.dataTransfer.dropEffect="move";setOverTrash(true);}}} onDragLeave={()=>setOverTrash(false)} onDrop={event=>{event.preventDefault();const request=requests?.find(item=>item.id===dragId);if(request&&!request.trashedAt)askTrash(request,true);setDragId(null);setOverTrash(false);}}><TrashIcon/><span aria-hidden="true">{requests?.filter(r=>r.trashedAt).length ?? 0}</span></button><RefreshButton label="Refresh inbox" busy={busy} disabled={saving} onClick={() => void refresh()} /></div></div>
    {!showDeleted && <p className={styles.footnote}>Drag a card to the header trash, or focus the card and press Delete. You will confirm before it moves.</p>}
    {error && !errorBanner && requests !== null && <p className={styles.footnote}>The latest inbox read is not confirmed. Refresh inbox to check again; the previous list is retained.</p>}
    {errorBanner && requests !== null && <p className={styles.error} role="alert">{errorBanner} The previous inbox remains below.</p>}
    {noticeBanner && <p className={styles.notice} role="status">{noticeBanner}</p>}
    {busy && requests === null ? <div className={styles.empty} role="status"><strong>Checking your inbox…</strong><p>Reading from Firestore with your current owner session.</p></div>
      : error && !requests?.length ? <div className={styles.empty} role="alert"><strong>Inbox not connected</strong><p>{errorBanner || "Refresh inbox to check the connection again."}</p><small>This is not a confirmed empty inbox. No requests have been deleted or replaced.</small></div>
      : visibleRequests?.length === 0 ? <div className={styles.empty}><span aria-hidden="true" className={`${styles.inboxIcon} ${styles.inboxBrand}`}><SpadeMark /></span><strong>{hasMore ? "No matching requests in this batch" : showDeleted ? "No deleted requests" : "No requests yet"}</strong><p>{hasMore ? "More saved requests are available. Load more before treating this list as empty." : "The private inbox was read successfully and this list is empty."}</p></div>
      : <div className={styles.requests}>{visibleRequests?.map(request => <article className={decisions.requestCard} key={request.id} tabIndex={0} aria-label={`Request from ${request.name}`} aria-keyshortcuts={!showDeleted ? "Delete" : undefined} aria-description={!showDeleted ? "Drag to the header trash, or press Delete to review moving this request to Deleted." : undefined} onKeyDown={event=>{if(event.key==="Delete"&&!showDeleted&&event.target===event.currentTarget){event.preventDefault();askTrash(request,true);}}} draggable={!showDeleted&&!saving&&!busy&&!detailBusy&&!recoveryBusy&&request.version!==null} data-dragging={dragId===request.id||undefined} onDragStart={event=>{if(showDeleted||saving||busy){event.preventDefault();return;}event.dataTransfer.setData("text/plain",request.id);event.dataTransfer.effectAllowed="move";setDragId(request.id);}} onDragEnd={()=>{setDragId(null);setOverTrash(false);}}>
        <IntakeHubAction onOpenChange={setDetailOpen} onBusyChange={setDetailBusy} request={request} onSaved={()=>void refresh()}
          triggerClassName={decisions.requestOpen} triggerContent={<><span><strong>{request.name}</strong><span>{request.email}</span></span><span className={decisions.badge} data-request-status={request.status ?? "unknown"}>{request.status ? REQUEST_STATUS_LABELS[request.status] : "Unsupported status"}</span></>}
          actions={<>{(!showDeleted ? [['approved', 'Approve'], ['denied', 'Deny'], ['waitlisted', 'Waitlist']] as const : []).map(([status, label]) => <button type="button" className={`${decisions.decisionButton} ${decisions[status]}`} key={status} disabled={saving || detailBusy || recoveryBusy || !!request.referencePurge || status === "denied" && request.linked || request.status === status || request.status === null || request.version === null} onClick={() => { setDecisionError(null); setDecision({ request, status }); }}>{label}</button>)}{(request.status === null || request.version === null) && <p className={styles.error}>This request needs a status/version review before it can be changed. Its original content is safe.</p>}</>}
        />
        {showDeleted && <button type="button" className={decisions.trashRequest} aria-label={`Restore: ${request.name}`} title="Restore request" disabled={saving||busy||detailBusy||recoveryBusy||request.version===null} onClick={()=>askTrash(request,false)}>Restore</button>}
        {request.status && request.status !== "received" && <button type="button" className={decisions.historyButton} aria-label={`History for ${request.name}`} title="History" onClick={() => void showHistory(request.id)}><svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Zm0 0v15"/></svg></button>}
      </article>)}</div>}
    {hasMore&&<button type="button" className={ui.secondary} disabled={busy||saving} onClick={()=>void refresh(true)}>{busy?"Loading more…":"Load more requests"}</button>}
    {history && <Dialog title="History" onClose={() => { ++historySequence.current; setHistory(null); }} actions={<button type="button" className={ui.secondary} onClick={() => { ++historySequence.current; setHistory(null); }}>Close</button>}><div className={decisions.history} aria-live="polite">{history.error ? <p role="alert">{history.error}</p> : history.items === null ? <p>Reading saved decisions…</p> : history.items.length === 0 ? <p>No recorded decisions yet.</p> : <ol>{history.items.map(entry => <li key={entry.id}><strong>{REQUEST_STATUS_LABELS[entry.fromStatus]} → {REQUEST_STATUS_LABELS[entry.toStatus]}</strong><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Date not supplied"} · Version {entry.version}</small></li>)}</ol>}</div></Dialog>}

    {!busy && !error && checkedAt && <p className={styles.footnote}>Read confirmed at {new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. {requests?.length??0} requests loaded{hasMore ? "; more are available" : ""}. Decisions are owner-only status updates with a saved history.</p>}
    {trashAction && <Dialog title={`${trashAction.trashed ? "Move to Deleted" : "Restore request"}: ${trashAction.request.name}?`} dismissDisabled={saving} onClose={()=>{if(!saving)setTrashAction(null);}} actions={<><button type="button" className={ui.secondary} disabled={saving} onClick={()=>setTrashAction(null)}>Cancel</button><button type="button" className={ui.primary} disabled={saving} onClick={()=>void applyTrash()}>{saving?"Saving…":trashAction.trashed?"Move to Deleted":"Restore request"}</button></>}><p>{trashAction.trashed ? "This hides the request in a restorable Deleted list." : "This returns the request to the inbox."} Its files, decision history and any linked commission stay intact. Nothing is purged or denied.</p>{trashErrorBanner&&<p role="alert" className={ui.errorNotice}>{trashErrorBanner}</p>}{trashError&&<p>The change is not confirmed. Retry this same action, or cancel and refresh before starting another change.</p>}</Dialog>}
    {decision && <Dialog title={`${decision.status === "denied" ? "Deny" : decision.status === "approved" ? "Approve" : "Waitlist"}: ${decision.request.name}?`} dismissDisabled={saving} onClose={() => { if (!saving) setDecision(null); }} actions={<><button type="button" className={ui.secondary} disabled={saving} onClick={() => setDecision(null)}>Cancel</button><button type="button" className={ui.primary} disabled={saving} onClick={() => void applyDecision()}>{saving ? "Saving…" : "Save"}</button></>}>{decision.status === "denied" ? <p>This marks the request as denied. Its reference pictures, text, and decision history stay private and are kept. Nothing is deleted.</p> : <p>This changes only this request’s private status from {decision.request.status ? REQUEST_STATUS_LABELS[decision.request.status] : "unknown"} to {REQUEST_STATUS_LABELS[decision.status]}. The owner decision and time are recorded in its history.</p>}<p>No email, customer reply, contract, or charge will be sent.</p>{decisionErrorBanner && <p className={ui.errorNotice} role="alert">{decisionErrorBanner}</p>}{decisionError && <p>The decision is not confirmed. Keep this request open to retry, or cancel and refresh its saved status.</p>}</Dialog>}
  </section><CodeRecoveryInbox onOpenChange={setRecoveryOpen} onBusyChange={setRecoveryBusy} /></div>;
}
