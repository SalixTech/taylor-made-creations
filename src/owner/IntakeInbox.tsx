"use client";

import { useRequestBanner } from "./use-request-banner";
import { PrivateImageLightbox } from "@/components/PrivateImageLightbox";
import SiteSelect from "@/components/SiteSelect";
import { SpadeMark } from "@/client-hub/SpadeMark";
import { TrashIcon } from "./TrashIcon";
import { DownloadIcon } from "@/components/DownloadIcon";
import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore/lite";
import { RefreshButton } from "@/components/RefreshButton";
import { createClient, listClients, getClientDetail, resetClientLoginCode } from "./client-hub-client";
import { taylorOwnerSession, serviceReadError } from "./taylor-services-client";
import { callOwnerIntake, referenceDisplayName } from "./intake-client";
import { Dialog } from "./OwnerFields";
import type { RequestSummary } from "./commission-requests-model";
import type { ClientHubClient, ClientHubProject } from "@/client-hub/model";
import ui from "./OwnerPortal.module.css";
import styles from "./TaylorServices.module.css";
import inbox from "./IntakeInbox.module.css";

type Recovery = { requestId: string; name: string; email: string; message: string; status: "open" | "closed"; resolution?: "handled" | "denied" | null; trashedAt?: string | null; createdAt: string; version: number };
const newestRecovery = (left: Recovery | undefined, right: Recovery) => left && left.version >= right.version ? left : right;
type RecoveryAction = "handle" | "reopen" | "deny" | "trash" | "restore";
export function CodeRecoveryInbox({ onOpenChange, onBusyChange }: { onOpenChange?: (value: boolean) => void; onBusyChange?: (value: boolean) => void } = {}) {
  const [items, setItems] = useState<Recovery[] | null>(null), [error, setError, errorBanner] = useRequestBanner(), [busy, setBusy] = useState(false);
  const loaded = useRef<Recovery[] | null>(null);
  const setLoaded = useCallback((update: (previous: Recovery[] | null) => Recovery[] | null) => { const next = update(loaded.current); loaded.current = next; setItems(next); }, []);
  const [selected, setSelected] = useState<Recovery | null>(null), [clients, setClients] = useState<ClientHubClient[]>([]), [clientId, setClientId] = useState("");
  const [verified, setVerified] = useState(false), [confirmReset, setConfirmReset] = useState(false), [attempted, setAttempted] = useState(false);
  const [code, setCode] = useState<string | null>(null), [, setNotice, noticeBanner] = useRequestBanner();
  const [showTrash, setShowTrash] = useState(false), [confirmTrash, setConfirmTrash] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null), [overTrash, setOverTrash] = useState(false);
  const acknowledged = useRef(new Map<string, Recovery>());
  const trashFromDetail = useRef(false);
  const active = useRef(true), pending = useRef(false), sequence = useRef(0);
  useEffect(() => { const lifecycle = sequence; active.current = true; return () => { active.current = false; ++lifecycle.current; }; }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return; const read = ++sequence.current; pending.current = true; setBusy(true); setError("");
    try {
      const session = await taylorOwnerSession(), snapshot = await getDocs(query(collection(session.db, "hubCodeRecoveryRequests"), limit(100))); session.assertCurrent();
      const data = snapshot.docs.map(entry => { const value = entry.data(); if (value.requestId !== entry.id || typeof value.name !== "string" || typeof value.email !== "string" || typeof value.message !== "string" || !["open", "closed"].includes(value.status) || !Number.isSafeInteger(value.version) || typeof value.createdAt !== "string" || (value.resolution !== undefined && ![null,"handled","denied"].includes(value.resolution)) || (value.trashedAt !== undefined && value.trashedAt !== null && typeof value.trashedAt !== "string")) throw new Error("A recovery request could not be read safely."); return value as Recovery; }).sort((a,b) => Number(a.status === "closed") - Number(b.status === "closed") || b.createdAt.localeCompare(a.createdAt));
      if (active.current && read === sequence.current) {
        const merged = data.map(item => { const saved = acknowledged.current.get(item.requestId); if (saved && item.version > saved.version) acknowledged.current.delete(item.requestId); return newestRecovery(loaded.current?.find(old => old.requestId === item.requestId), newestRecovery(saved, item)); });
        for (const saved of acknowledged.current.values()) if (!merged.some(item => item.requestId === saved.requestId)) merged.push(saved);
        setLoaded(() => merged);
      }
    } catch (cause) { if (active.current && read === sequence.current) setError(serviceReadError(cause, "Code requests")); }
    finally { if (read === sequence.current) { pending.current = false; if (active.current) setBusy(false); } }
  }, [setError, setLoaded]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]); // This private inbox loads once; refresh is explicit afterwards.
  async function changeRequest(item: Recovery, action: RecoveryAction) {
    if (pending.current) return; pending.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try {
      const value = await callOwnerIntake("tmcHubResolveCodeRequest", { requestId: item.requestId, expectedVersion: item.version, action });
      if (!["open", "closed"].includes(value.status as string) || value.version !== item.version + 1 || ![null, "handled", "denied"].includes(value.resolution as null | string) || !(value.trashedAt === null || typeof value.trashedAt === "string")) throw new Error("The update was not confirmed. Refresh this request before trying again.");
      const received = { ...item, status: value.status, resolution: value.resolution, trashedAt: value.trashedAt, version: value.version } as Recovery;
      const updated = newestRecovery(loaded.current?.find(row => row.requestId === item.requestId), newestRecovery(acknowledged.current.get(item.requestId), received));
      if (active.current) {
        acknowledged.current.set(updated.requestId, updated);
        setLoaded(old => old?.map(row => row.requestId === item.requestId ? updated : row) ?? null);
        setSelected(old => old?.requestId === item.requestId ? updated : old);
        setVerified(false); setConfirmReset(false); setConfirmTrash(false); setClientId(""); if (action !== "handle") setCode(null); setAttempted(false);
        if (action === "restore") { setShowTrash(false); setSelected(null); onOpenChange?.(false); }
        if (action === "trash") { setSelected(null); onOpenChange?.(false); }
        setNotice(updated.version !== received.version ? "The earlier change is confirmed, but this request has a newer saved update. Its latest known state is shown." : ({ handle: "Request marked handled. No code was emailed.", reopen: "Request reopened. Verify the person again before replacing any code.", deny: "Request denied. No client access was changed.", trash: "Request moved to Deleted. Its history is kept and it can be restored.", restore: "Request restored. No client access was changed." })[action]);
        if (action === "reopen") { setClients([]); try { const available = await listClients(); if (active.current) setClients(available); } catch (cause) { if (active.current) setError(serviceReadError(cause, "Client list after confirmed reopen")); } }
      }
    } catch (cause) { if (active.current) setError(serviceReadError(cause, "Code request update")); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) setBusy(false); }
  }
  function askTrash(item: Recovery) {
    if (pending.current || item.trashedAt) return;
    trashFromDetail.current = false; ++sequence.current; setSelected(item); setConfirmTrash(true); setConfirmReset(false);
    setVerified(false); setClientId(""); setClients([]); setCode(null); setAttempted(false);
    setNotice(""); setError(""); setDragId(null); setOverTrash(false); onOpenChange?.(true);
  }
  function cancelTrash() { if (pending.current) return; if (trashFromDetail.current) setConfirmTrash(false); else dismiss(); }
  async function show(item: Recovery) {
    if (pending.current) return;
    const seq = ++sequence.current; pending.current = true; setBusy(true); onBusyChange?.(true); onOpenChange?.(true);
    setSelected(item); setConfirmTrash(false); setClients([]); setClientId(""); setVerified(false); setConfirmReset(false); setAttempted(false); setCode(null); setNotice(""); setError("");
    try { const available = await listClients(); if (active.current && seq === sequence.current) setClients(available); }
    catch (cause) { if (active.current && seq === sequence.current) setError(serviceReadError(cause, "Client list")); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) setBusy(false); }
  }
  async function generate() {
    const client = clients.find(item => item.clientId === clientId);
    if (pending.current || !selected || selected.status !== "open" || selected.trashedAt || !client || client.status !== "active" || !verified || attempted || !confirmReset) return;
    pending.current = true; setBusy(true); onBusyChange?.(true); setAttempted(true); setError(""); setConfirmReset(false);
    const seq = sequence.current;
    try {
      const result = await resetClientLoginCode({ clientId, expectedAuthVersion: client.authVersion });
      if (active.current && seq === sequence.current) { setCode(result.signInCode); setNotice("New code ready. The previous code no longer works and existing client sessions will sign out."); }
    } catch (cause) { if (active.current && seq === sequence.current) setError(`${serviceReadError(cause, "Code reset")} The outcome may be uncertain. Check this client in Client Hub before attempting another reset; this screen will not repeat it automatically.`); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) setBusy(false); }
  }
  function dismiss() { if (pending.current) return; ++sequence.current; setSelected(null); setCode(null); setConfirmReset(false); setConfirmTrash(false); setError(""); onOpenChange?.(false); }
  async function copy() {
    if (!code) return; const seq = sequence.current;
    try { await navigator.clipboard.writeText(code); if (active.current && seq === sequence.current) setNotice("Code copied. Share it privately with the person you verified."); }
    catch { if (active.current && seq === sequence.current) setError("Clipboard unavailable. Select and copy the code."); }
  }
  return <section className={styles.card} id="client-code-requests"><div className={styles.heading}><div><h2>Client code requests</h2><p>Verify the person before resetting or sharing access. A request never proves ownership.</p></div><div className={inbox.recoveryTools}><button type="button" className={inbox.deletedToggle} data-drag-over={overTrash || undefined} onDragOver={event=>{if(dragId&&!busy){event.preventDefault();event.dataTransfer.dropEffect="move";setOverTrash(true);}}} onDragLeave={()=>setOverTrash(false)} onDrop={event=>{event.preventDefault();const item=items?.find(row=>row.requestId===dragId);if(item)askTrash(item);setDragId(null);setOverTrash(false);}} aria-label={`${showTrash ? "Back to requests" : "Deleted code requests"} (${items?.filter(item => item.trashedAt).length ?? 0})`} title={showTrash ? "Back to requests" : "Deleted code requests"} aria-pressed={showTrash} disabled={busy} onClick={() => setShowTrash(value => !value)}><TrashIcon /><span aria-hidden="true">{items?.filter(item => item.trashedAt).length ?? 0}</span></button><RefreshButton label="Refresh client code requests" busy={busy} onClick={() => void refresh()} /></div></div>
    {!showTrash && <p className={styles.footnote}>Drag a card to the header trash, or focus it and press Delete. You will confirm before it moves.</p>}
    {!selected && error && !errorBanner && <p className={styles.footnote}>The latest read or update is not confirmed. Refresh code requests before continuing.</p>}
    {!selected && errorBanner && <p role="alert" className={ui.errorNotice}>{errorBanner}</p>}{!selected && noticeBanner && <p role="status" className={ui.notice}>{noticeBanner}</p>}
    {items === null ? <p role="status">{busy ? "Checking code requests…" : "The private inbox has not been read yet."}</p> : !items.some(item => !!item.trashedAt === showTrash) ? <div className={styles.empty}><span aria-hidden="true" className={`${styles.inboxIcon} ${styles.inboxBrand}`}><SpadeMark /></span><strong>{items.length >= 100 ? "No matching code requests in this batch" : showTrash ? "No deleted code requests." : "No saved code requests."}</strong><p>{items.length >= 100 ? "No matching code requests in the first 100 loaded records. This is not a confirmed empty inbox." : showTrash ? "Deleted code requests will appear here." : "Client code requests will appear here."}</p></div> : <div className={inbox.recoveryList}>{items.filter(item => !!item.trashedAt === showTrash).map(item => <button type="button" key={item.requestId} className={inbox.recoveryCard} draggable={!showTrash&&!busy} data-dragging={dragId===item.requestId||undefined} aria-keyshortcuts={!showTrash ? "Delete" : undefined} aria-description={!showTrash ? "Drag to the header trash, or press Delete to review moving this request to Deleted." : undefined} onKeyDown={event=>{if(event.key==="Delete"&&!showTrash){event.preventDefault();askTrash(item);}}} onDragStart={event=>{if(showTrash||busy){event.preventDefault();return;}event.dataTransfer.setData("text/plain",item.requestId);event.dataTransfer.effectAllowed="move";setDragId(item.requestId);}} onDragEnd={()=>{setDragId(null);setOverTrash(false);}} disabled={busy} onClick={() => void show(item)}><span><strong>{item.name}</strong><span>{item.email}</span></span><span className={inbox.recoveryMeta}><span>{item.trashedAt ? "Deleted" : item.status === "open" ? "Open" : item.resolution === "denied" ? "Denied" : "Handled"}</span><small>{new Date(item.createdAt).toLocaleDateString()}</small></span></button>)}</div>}
    {selected && !confirmTrash && <Dialog title="Help with a client code" dismissDisabled={busy} onClose={dismiss} actions={<button type="button" className={ui.secondary} disabled={busy} onClick={dismiss}>Close</button>}><div className={inbox.detailGrid}><div><strong>Request from</strong><p>{selected.name}</p></div><div><strong>Contact supplied</strong><p>{selected.email}</p></div><div><strong>Their note</strong><p>{selected.message || "No note supplied."}</p></div></div>
      {busy && <p role="status">Checking or updating this request…</p>}
      {errorBanner && <p role="alert" className={ui.errorNotice}>{errorBanner}</p>}{noticeBanner && <p role="status" className={ui.notice}>{noticeBanner}</p>}{error && !errorBanner && <p>The last operation is not confirmed. Close and refresh this request before continuing.</p>}{attempted && !code && <p>Code replacement has been attempted. Check the saved client in Client Hub before another reset; this screen will not repeat it automatically.</p>}
      {selected.status === "open" && !selected.trashedAt && !attempted && <><fieldset className={inbox.clientChoice} disabled={busy}><label htmlFor="verified-recovery-client">Verified client</label><SiteSelect id="verified-recovery-client" value={clientId} searchable placeholder="Choose the client yourself" onChange={value => { if (busy) return; setClientId(value); setVerified(false); setConfirmReset(false); }} options={clients.filter(client => client.status === "active").map(client => ({ value: client.clientId, label: `${client.displayName}${client.nickname ? ` (${client.nickname})` : ""} · ${client.clientId}` }))} /></fieldset><label className={inbox.check}><input type="checkbox" checked={verified} disabled={busy || !clientId} onChange={event => setVerified(event.target.checked)} />I verified this person through a trusted channel and checked the selected client.</label><button type="button" className={ui.primary} disabled={busy || !clientId || !verified} onClick={() => setConfirmReset(true)}>Generate replacement code</button></>}
      {confirmReset && <div className={inbox.confirm} role="group" aria-label="Confirm code replacement"><strong>Replace {clients.find(client => client.clientId === clientId)?.displayName}’s code?</strong><p>The old code will stop working and their existing sessions will sign out. The new code appears once here. No email is sent.</p><div className={inbox.actions}><button type="button" className={ui.secondary} onClick={() => setConfirmReset(false)}>Cancel</button><button type="button" className={ui.danger} onClick={() => void generate()} disabled={busy}>{busy ? "Replacing…" : "Replace code now"}</button></div></div>}
      {code && <div className={inbox.code}><strong>New sign-in code</strong><code>{code}</code><button type="button" className={ui.secondary} onClick={() => void copy()}>Copy code</button><p>Copy before closing. This screen does not save the code.</p></div>}
      {!selected.trashedAt && <div className={inbox.actions}>{selected.status === "open" ? <><button type="button" className={ui.secondary} disabled={busy} onClick={() => void changeRequest(selected,"handle")}>Handled</button><button type="button" className={ui.secondary} disabled={busy || attempted} onClick={() => void changeRequest(selected,"deny")}>Deny</button></> : <button type="button" className={ui.primary} disabled={busy} onClick={() => void changeRequest(selected,"reopen")}>Reopen</button>}<button type="button" className={`${ui.secondary} ${inbox.iconButton}`} aria-label="Delete request" title="Delete request" disabled={busy} onClick={() => { trashFromDetail.current = true; setConfirmTrash(true); }}><TrashIcon /></button></div>}
      {selected.trashedAt && <button type="button" className={ui.secondary} disabled={busy} onClick={() => void changeRequest(selected,"restore")}>{busy ? "Restoring…" : "Restore request"}</button>}
    </Dialog>}
    {selected && confirmTrash && <Dialog title="Move this request to Deleted?" dismissDisabled={busy} onClose={cancelTrash} actions={<><button type="button" className={ui.secondary} disabled={busy} onClick={cancelTrash}>Cancel</button><button type="button" className={ui.danger} disabled={busy} onClick={() => void changeRequest(selected,"trash")}>{busy ? "Moving…" : "Move to Deleted"}</button></>}>
      <p><strong>{selected.name}</strong> · {selected.email}</p><p>The request and its history stay recoverable. This does not delete the client or change their code.</p>
      {errorBanner && <p role="alert" className={ui.errorNotice}>{errorBanner}</p>}{error && !errorBanner && <p>The change is not confirmed. Retry this same request or cancel and refresh its saved state.</p>}
    </Dialog>}
  </section>;
}

type Reference = { index: number; fileName: string; contentType: string; size: number };
type RequestDetails = { answers: [string,string][]; references: Reference[]; linked: boolean; purged: boolean };
export function IntakeHubAction({ request, onSaved, onOpenChange, onBusyChange, triggerContent, triggerClassName, actions }: { request: RequestSummary; onSaved: () => void; onOpenChange?: (value:boolean) => void; onBusyChange?: (value:boolean) => void; triggerContent?: import("react").ReactNode; triggerClassName?: string; actions?: import("react").ReactNode }) {
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [error,setError,errorBanner] = useRequestBanner();
  const [details,setDetails] = useState<RequestDetails | null>(null);
  const [loadingReference,setLoadingReference] = useState<number | null>(null);
  const [name,setName] = useState(request.name), [email,setEmail] = useState(request.email), [title,setTitle] = useState(`${request.name} commission`);
  const [code,setCode] = useState<string | null>(null), [preview,setPreview] = useState<{ url: string; name: string } | null>(null);
  const [,setConfirmed,confirmedBanner] = useRequestBanner();
  const [clients,setClients] = useState<ClientHubClient[]>([]), [projects,setProjects] = useState<ClientHubProject[]>([]), [clientId,setClientId] = useState(""), [projectId,setProjectId] = useState("");
  const active = useRef(true), pending = useRef(false), sequence = useRef(0), operation = useRef<{ key:string; id:string } | null>(null), previewUrl = useRef<string | null>(null);
  function clearPreview() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPreview(null); }
  useEffect(() => { const lifecycle = sequence; active.current = true; return () => { active.current = false; ++lifecycle.current; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }; }, []);
  async function show() {
    if (pending.current) return; const seq = ++sequence.current;
    pending.current = true; onBusyChange?.(true); onOpenChange?.(true); setOpen(true); setBusy(true); setDetails(null); setClients([]); setProjects([]); setClientId(""); setProjectId(""); setError(""); setCode(null); clearPreview(); setConfirmed("");
    try {
      const session = await taylorOwnerSession(), snapshot = await getDoc(doc(session.db,"commissionRequests",request.id)); session.assertCurrent();
      if (!snapshot.exists()) throw new Error("This request is unavailable.");
      const value = snapshot.data();
      const answers = Array.isArray(value.answers) ? value.answers.flatMap(row => Array.isArray(row) && row.length === 2 && row.every(item => typeof item === "string") ? [row] : row && typeof row.label === "string" && typeof row.value === "string" ? [[row.label,row.value]] : []) as [string,string][] : [];
      const references: Reference[] = !value.referencePurge && Array.isArray(value.references) ? value.references.filter(item => Number.isSafeInteger(item.index) && typeof item.fileName === "string" && ["image/png","image/jpeg","image/webp"].includes(item.contentType) && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= 2*1024*1024) : [];
      if (active.current && seq === sequence.current) setDetails({ answers,references,linked:!!value.hubLink,purged:!!value.referencePurge });
      if (request.status === "approved" && !value.hubLink) { const available = await listClients(); if (active.current && seq === sequence.current) setClients(available); }
    } catch (cause) { if (active.current && seq === sequence.current) setError(serviceReadError(cause,"Request details")); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) setBusy(false); }
  }
  async function chooseClient(id:string) {
    const seq = ++sequence.current; setClientId(id); setProjectId(""); setProjects([]); if (!id) return;
    try { const detail = await getClientDetail(id); if (active.current && seq === sequence.current) setProjects(detail.projects); }
    catch (cause) { if (active.current && seq === sequence.current) setError(serviceReadError(cause,"Client commissions")); }
  }
  async function connect(create:boolean) {
    if (pending.current) return; pending.current = true; onBusyChange?.(true); setBusy(true); setError("");
    try {
      if (create) {
        const key = JSON.stringify({name,email,title}); if (operation.current?.key !== key) operation.current = {key,id:crypto.randomUUID()};
        const result = await createClient({operationId:operation.current.id,displayName:name,email,projectTitle:title,requestId:request.id});
        if (active.current) { setCode(result.signInCode ?? null); setConfirmed(result.signInCode ? "Client and commission created. Copy the code now and share it only after verifying the recipient." : "This request already has a Client Hub. The existing code was not exposed or reset."); }
      } else { await callOwnerIntake("tmcHubLinkCommissionRequest",{requestId:request.id,expectedVersion:request.version,clientId,projectId}); if (active.current) setConfirmed("Request linked to the selected commission. No code was reset or email sent."); }
      if (active.current) setDetails(old => old ? {...old,linked:true} : old);
    } catch (cause) { if (active.current) setError(serviceReadError(cause,"Client Hub handoff")); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) setBusy(false); }
  }
  const displayName = (reference: Reference) => referenceDisplayName(request.name, request.createdAt, reference.index, reference.contentType, reference.fileName);
  async function readReference(reference:Reference, download:boolean) {
    if (pending.current) return; pending.current = true; onBusyChange?.(true); setBusy(true); setError(""); setLoadingReference(reference.index); const seq = sequence.current;
    try {
      const result = await callOwnerIntake("tmcReadCommissionReference",{requestId:request.id,index:reference.index});
      if (typeof result.base64 !== "string" || result.contentType !== reference.contentType || result.fileName !== reference.fileName || result.base64.length !== 4*Math.ceil(reference.size/3)) throw new Error("The reference changed. Reload this request.");
      const bytes = Uint8Array.from(atob(result.base64),char => char.charCodeAt(0)); if (bytes.length !== reference.size) throw new Error("The reference was incomplete.");
      if (!active.current || seq !== sequence.current) return;
      const url = URL.createObjectURL(new Blob([bytes],{type:reference.contentType})), fileName = displayName(reference);
      if (download) { try { const a=document.createElement("a"); a.href=url; a.download=fileName; a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url),1000); } }
      else { clearPreview(); previewUrl.current = url; setPreview({url,name:fileName}); }
    } catch (cause) { if (active.current && seq === sequence.current) setError(serviceReadError(cause,download ? "Reference download" : "Reference preview")); }
    finally { pending.current = false; onBusyChange?.(false); if (active.current) { setBusy(false); setLoadingReference(null); } }
  }
  async function copyCode() {
    if (!code || !open) return; const seq=sequence.current;
    try { await navigator.clipboard.writeText(code); if (active.current && seq === sequence.current) setConfirmed("Code copied. Keep it private."); }
    catch { if (active.current && seq === sequence.current) setError("Clipboard unavailable. Select and copy the code."); }
  }
  function dismiss() { if (pending.current) return; ++sequence.current; setOpen(false); setCode(null); clearPreview(); onOpenChange?.(false); onSaved(); }
  return <><button type="button" className={triggerClassName ?? styles.secondary} disabled={busy} onClick={() => void show()}>{triggerContent ?? "Open request"}</button>{open && <Dialog wide title="Request details & Client Hub" dismissDisabled={busy} onClose={dismiss} actions={<button type="button" className={ui.secondary} disabled={busy} onClick={dismiss}>Close</button>}>
    <p>{request.name} · {request.email}</p>{actions && <div className={inbox.actions}>{actions}</div>}{errorBanner && <p className={ui.errorNotice} role="alert">{errorBanner}</p>}{error && !errorBanner && <p>The last operation is not confirmed. Close and reopen the request to check its saved state.</p>}
    {!details ? <div className={inbox.loading} role="status">{busy ? "Opening request details…" : "Request details could not be loaded. Close and try again."}</div> : <>
      {details.answers.length ? <dl className={inbox.detailGrid}>{details.answers.map(([label,value],index) => <div key={index}><dt>{label}</dt><dd>{label === "Reference images" && details.references.length ? details.references.map(displayName).join("; ") : value}</dd></div>)}</dl> : <p className={inbox.legacyDescription}>{request.description || "No additional answers were supplied."}</p>}
      {!!details.references.length && !request.referencePurge && <section aria-label="Reference pictures"><h3>Reference pictures</h3><div className={inbox.references}>{details.references.map(reference => <div className={inbox.reference} key={reference.index}><span title={displayName(reference)}>{displayName(reference)}</span><div className={inbox.actions}><button type="button" disabled={busy} className={ui.secondary} onClick={() => void readReference(reference,false)}>{loadingReference === reference.index ? "Loading…" : "View picture"}</button><button type="button" disabled={busy} className={`${ui.secondary} ${inbox.iconButton}`} aria-label={`Download ${displayName(reference)}`} title="Download picture" onClick={() => void readReference(reference,true)}><DownloadIcon /></button></div></div>)}</div></section>}
      {(details.purged || request.referencePurge) && <p>Reference pictures are unavailable because an earlier cleanup was requested. The request text and decision history are kept.</p>}
      {preview && <PrivateImageLightbox key={preview.url} src={preview.url} title={preview.name} onClose={clearPreview} />}
      {confirmedBanner && <p className={ui.notice} role="status">{confirmedBanner}</p>}{code && <div className={inbox.code}><strong>Client code</strong><code>{code}</code><button type="button" className={ui.secondary} onClick={() => void copyCode()}>Copy code</button><p>This code is shown once. Closing clears it from this screen.</p></div>}
      {!details.linked && request.status === "approved" && <div className={inbox.handoff}><section><h3>Create a client and commission</h3><label className={inbox.field}>Client name<input autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)}/></label><label className={inbox.field}>Private email<input autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={email} type="email" maxLength={254} disabled={busy} onChange={event => setEmail(event.target.value)}/></label><label className={inbox.field}>Commission title<input autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={title} maxLength={150} disabled={busy} onChange={event => setTitle(event.target.value)}/></label><button type="button" disabled={busy || !name.trim() || !title.trim()} className={ui.primary} onClick={() => void connect(true)}>{busy ? "Working…" : "Create Client Hub"}</button></section><section><h3>Or link an existing commission</h3><label className={inbox.field}>Client<select value={clientId} disabled={busy} onChange={event => void chooseClient(event.target.value)}><option value="">Choose client</option>{clients.map(client => <option key={client.clientId} value={client.clientId}>{client.displayName}</option>)}</select></label><label className={inbox.field}>Commission<select value={projectId} disabled={busy || !clientId} onChange={event => setProjectId(event.target.value)}><option value="">Choose commission</option>{projects.filter(project => !project.requestId || project.requestId === request.id).map(project => <option key={project.projectId} value={project.projectId}>{project.title}</option>)}</select></label><button type="button" disabled={busy || !projectId} className={ui.secondary} onClick={() => void connect(false)}>{busy ? "Working…" : "Link this request"}</button></section></div>}
      {details.linked && !code && !confirmedBanner && <p>This request is linked to a Client Hub. Open Client Hub to manage it.</p>}
    </>}
  </Dialog>}</>;
}
