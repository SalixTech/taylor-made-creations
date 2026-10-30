"use client";
/* eslint-disable @next/next/no-img-element -- Local staged raster files use revocable blob URLs only. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ClientHubProject } from "./model";
import { uploadHubAttachments, listHubAttachments, downloadHubAttachment, cancelHubAttachmentBatch, establishHubLegacyCompletion, renameHubAttachment } from "./attachments-client";
import { HUB_ATTACHMENT_MAX_BYTES, HUB_ATTACHMENT_MAX_FILES, type HubAttachment, type HubAttachmentProgress, type HubAttachmentPage } from "./attachments-model";
import { clientHubErrorMessage, isClientHubSessionError } from "./client";
import { deleteHubFileCopy, HUB_FILE_COPIES_CHANGED } from "./file-copy-client";
import { HubActionDialog } from "./HubActionDialog";
import { makerTime } from "./presentation";
import { SavedAttachmentPreview } from "./SavedAttachmentPreview";
import { PrivateImageLightbox } from "@/components/PrivateImageLightbox";
import styles from "./MakerChatAttachments.module.css";

export type AttachmentOpenRequest = { sequence: number; mode: "upload" | "history"; batchId?: string; attachmentIds?: string[]; trigger?: HTMLElement | null };
export function AttachmentPaperclip() { return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7L13 2M6 15l9-9" /></svg>; }

const previewable = (file: File) => ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type);
function StagedThumbnail({ file, onOpen }: { file: File; onOpen: () => void }) {
  const [asset, setAsset] = useState<{file:File|null;url:string}>({file:null,url:""}),[loaded,setLoaded]=useState(""),[failed,setFailed]=useState("");
  const url=asset.file===file?asset.url:"";
  useEffect(() => { if (!previewable(file)) return; const next = URL.createObjectURL(file); let active = true; queueMicrotask(() => { if (active) setAsset({file,url:next}); }); return () => { active = false; URL.revokeObjectURL(next); }; }, [file]);
  return previewable(file) ? <button type="button" className={styles.stagedThumbnail} aria-label={`Preview ${file.name}`} disabled={!url} onClick={onOpen}>{(!url || loaded!==url) && (!url || failed!==url) && <span className={styles.transferSpinner} role="status" aria-label="Loading photo preview" />}{url && failed===url ? <span>Preview unavailable</span> : url && <img src={url} alt="" style={{opacity:loaded===url?1:0}} onLoad={()=>setLoaded(url)} onError={()=>setFailed(url)} />}</button> : <span className={styles.stagedFileIcon} aria-label="File attachment">FILE</span>;
}
function StagedGallery({ files, index, onChange, onClose }: { files: File[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const file = files[index], [asset, setAsset] = useState({ file: null as File | null, url: "" });
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); let active = true; queueMicrotask(() => { if (active) setAsset({ file, url }); }); return () => { active = false; URL.revokeObjectURL(url); }; }, [file]);
  if (!file) return null;
  return <PrivateImageLightbox src={asset.file === file ? asset.url : ""} loading={asset.file !== file} title={file.name} onClose={onClose} position={`${index + 1} / ${files.length}`} onPrevious={files.length > 1 ? () => onChange((index + files.length - 1) % files.length) : undefined} onNext={files.length > 1 ? () => onChange((index + 1) % files.length) : undefined} />;
}

type AttachmentView = Pick<AttachmentOpenRequest, "mode" | "batchId" | "attachmentIds">;
type Attempt = { batchId: string; attachmentIds: string[]; files: File[] };
export function MakerChatAttachments({ project, owner, disabled, onFailure, onDirtyChange, onBusyChange, openRequest, onUploaded, hideTrigger = false }: { project: ClientHubProject; owner: boolean; disabled?: boolean; onFailure: (error: unknown) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; openRequest?: AttachmentOpenRequest; onUploaded?: (ids: string[]) => void; hideTrigger?: boolean }) {
  const [view, setView] = useState<AttachmentView>({ mode: "history" });
  const returnFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false), [page, setPage] = useState<HubAttachmentPage | null>(null), [files, setFiles] = useState<File[]>([]), [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState<HubAttachmentProgress | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { if (!error) return; const timer = window.setTimeout(() => setError(""), 5000); return () => window.clearTimeout(timer); }, [error]);
  const [deleteTarget, setDeleteTarget] = useState<HubAttachment | null>(null);
  const [renameTarget, setRenameTarget] = useState<HubAttachment | null>(null), [renameValue, setRenameValue] = useState("");
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(timer); }, [notice]);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionDate, setCompletionDate] = useState(""), [acknowledgeExpired, setAcknowledgeExpired] = useState(false);
  const [stagedRename, setStagedRename] = useState<number | null>(null), [stagedName, setStagedName] = useState(""), [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const replacements = useRef<Array<HTMLInputElement | null>>([]);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null), alive = useRef(false), pending = useRef(false), controller = useRef<AbortController | null>(null), listing = useRef<AbortController | null>(null), completionAttempt = useRef<{ operationId: string; completedAt: string; project: ClientHubProject } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); listing.current?.abort(); }; }, []);
  useEffect(() => { onDirtyChange(!!files.length || !!attempt || !!renameTarget); return () => onDirtyChange(false); }, [files, attempt, renameTarget, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { const element = dialog.current; if (open && element && !element.open) element.showModal(); return () => { if (element?.open) element.close(); }; }, [open]);
  function failure(cause: unknown) { if (!alive.current) return; setError(clientHubErrorMessage(cause)); if (isClientHubSessionError(cause)) onFailure(cause); }
  async function refresh(more = false, target: AttachmentView = view) {
    if (more && (listing.current || !page?.nextCursor || target.batchId)) return;
    listing.current?.abort();
    const request = new AbortController(); listing.current = request; setLoading(true);
    if (!more) setPage(null);
    try {
      const result = await listHubAttachments(project, owner, { cursor: more ? page?.nextCursor : null, ...(target.batchId ? { batchId: target.batchId } : {}), signal: request.signal });
      if (!alive.current || request.signal.aborted || listing.current !== request) return;
      if (target.batchId && result.attachments.some(item => item.batchId !== target.batchId || !target.attachmentIds?.includes(item.attachmentId))) throw new Error("This attachment batch could not be verified. Reopen it from its message.");
      setPage(previous => ({ ...result, attachments: more ? [...(previous?.attachments ?? []), ...result.attachments].filter((item, index, items) => items.findIndex(other => other.attachmentId === item.attachmentId) === index) : result.attachments }));
    } catch (cause) { if (!request.signal.aborted && listing.current === request) failure(cause); }
    finally { if (listing.current === request) { listing.current = null; if (alive.current) setLoading(false); } }
  }
  function show(target: AttachmentView = { mode: "history" }, source?: HTMLElement | null) {
    returnFocus.current = source ?? trigger.current; setView(target); setError(""); setNotice(""); setOpen(true); void refresh(false, target);
  }
  useEffect(() => {
    if (!openRequest) return;
    let active = true; void Promise.resolve().then(() => { if (active) show(openRequest, openRequest.trigger); });
    return () => { active = false; };
    // This is a discrete external open command, not a subscription to page/loading state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);
  useEffect(() => {
    if (!open || view.mode !== "history") return;
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId !== project.projectId || detail?.clientId !== project.clientId || detail?.owner !== owner) return;
      if (!pending.current) setDeleteTarget(null);
      void refresh(false, view);
    };
    window.addEventListener(HUB_FILE_COPIES_CHANGED, changed);
    return () => window.removeEventListener(HUB_FILE_COPIES_CHANGED, changed);
    // A verified revision/local deletion is a reload command for the current drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, project.projectId, project.clientId, owner]);
  function close() { listing.current?.abort(); listing.current = null; setLoading(false); setOpen(false); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else trigger.current?.focus(); }
  function clearAttempt() { setStagedRename(null); setPreviewIndex(null); setAttempt(null); setFiles([]); setProgress(null); if (input.current) input.current.value = ""; }
  function saveStagedName(index: number) {
    if (pending.current || attempt || !files[index]) return;
    const original = files[index], dot = original.name.lastIndexOf("."), ext = dot > 0 ? original.name.slice(dot) : "", name = stagedName.trim() + ext;
    if (!stagedName.trim() || name.length > 42 || /[\\/\u0000-\u001f\u007f]/.test(name) || [".", ".."].includes(name)) { setError("Use a simple file name up to 42 characters, including its extension."); return; }
    setFiles(previous => previous.map((file, i) => i === index ? new File([file], name, { type: file.type, lastModified: file.lastModified }) : file)); setStagedRename(null); setError("");
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (pending.current || disabled || stagedRename !== null || !files.length || page?.retention.available !== true) return;
    if (files.length > HUB_ATTACHMENT_MAX_FILES || files.some(file => file.size < 1 || file.size > HUB_ATTACHMENT_MAX_BYTES)) { setError("Choose up to 5 files, each up to 20 MB."); return; }
    if (!attempt && files.some(file => !file.name.trim() || file.name.length > 42 || /[\\/\u0000-\u001f\u007f]/.test(file.name))) { setError("Rename files to simple names of 42 characters or fewer before sending."); return; }
    const next = attempt ?? { batchId: crypto.randomUUID(), attachmentIds: files.map(() => crypto.randomUUID()), files };
    setAttempt(next); pending.current = true; setBusy(true); setError(""); setNotice(""); const request = new AbortController(); controller.current = request; let cancellationConfirmed = false; close();
    try {
      const result = await uploadHubAttachments(project, owner, next.files, { batchId: next.batchId, attachmentIds: next.attachmentIds, signal: request.signal, onProgress: value => { if (!alive.current) return; setProgress(value); if (value.phase === "cancelled") { cancellationConfirmed = true; clearAttempt(); setNotice("Upload Cancelled"); } } });
      if (!alive.current) return;
      setPage(previous => previous ? { ...previous, attachments: [...result.attachments, ...previous.attachments.filter(item => !result.attachments.some(saved => saved.attachmentId === item.attachmentId))] } : previous); clearAttempt(); setNotice("Sent Successfully"); onUploaded?.(result.attachments.map(item => item.attachmentId));
    } catch (cause) { if (alive.current && !request.signal.aborted) { failure(cause); setOpen(true); } else if (alive.current && !cancellationConfirmed) { setError("If cancellation is not confirmed, use Cancel upload again before starting another batch."); setOpen(true); } }
    finally { if (controller.current === request) controller.current = null; pending.current = false; if (alive.current) setBusy(false); }
  }
  async function cancel() {
    if (!attempt || progress?.phase === "committing") return;
    if (pending.current) { controller.current?.abort(); return; }
    pending.current = true; setBusy(true); setError("");
    try { await cancelHubAttachmentBatch(project, owner, attempt.batchId); if (!alive.current) return; clearAttempt(); setNotice("Upload Cancelled"); }
    catch (cause) { failure(cause); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function download(attachment: HubAttachment) {
    if (pending.current || disabled) return; pending.current = true; setBusy(true); setError(""); const request = new AbortController(); controller.current = request;
    try { await downloadHubAttachment(project, owner, attachment, { signal: request.signal, onProgress: (receivedBytes, totalBytes) => { if (alive.current) setProgress({ attachmentId: attachment.attachmentId, fileName: attachment.fileName, index: 0, totalFiles: 1, uploadedBytes: receivedBytes, totalBytes, phase: "uploading" }); } }); if (alive.current) { setProgress(null); setNotice("Download Ready"); } }
    catch (cause) { if (!request.signal.aborted) failure(cause); }
    finally { controller.current = null; pending.current = false; if (alive.current) setBusy(false); }
  }
  function openRename(attachment: HubAttachment) {
    setError(""); setNotice(""); setRenameTarget(attachment);
    const dot = attachment.fileName.lastIndexOf("."); setRenameValue(dot > 0 ? attachment.fileName.slice(0, dot) : attachment.fileName);
  }
  async function renameCopy() {
    if (!renameTarget || pending.current || disabled || !renameValue.trim()) return;
    const target = renameTarget, dot = target.fileName.lastIndexOf("."), extension = dot > 0 ? target.fileName.slice(dot) : "";
    const fileName = `${renameValue.trim()}${extension}`;
    if (fileName.length > 42 || /[\\/\u0000-\u001f\u007f]/.test(fileName) || [".", ".."].includes(fileName)) { setError("Use a simple name up to 42 characters, without slashes."); return; }
    listing.current?.abort(); listing.current = null; setLoading(false); pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const renamed = await renameHubAttachment(project, owner, target, fileName);
      if (!alive.current) return;
      setPage(previous => previous ? { ...previous, attachments: previous.attachments.map(item => item.attachmentId === target.attachmentId ? { ...item, ...renamed } : item) } : previous);
      setRenameTarget(null); setNotice("Your copy was renamed.");
    } catch (cause) { failure(cause); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function deleteCopy() {
    if (!deleteTarget || pending.current || disabled) return;
    const target = deleteTarget; listing.current?.abort(); listing.current = null; setLoading(false); pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await deleteHubFileCopy(project, owner, { kind: "attachment", fileId: target.attachmentId });
      if (!alive.current) return;
      setPage(previous => previous ? { ...previous, attachments: previous.attachments.filter(item => item.attachmentId !== target.attachmentId) } : previous);
      setDeleteTarget(null); setNotice("Your attachment copy was deleted. The other person’s copy is unchanged.");
    } catch (cause) { failure(cause); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function saveCompletion(event: FormEvent) {
    event.preventDefault(); if (pending.current || disabled || attempt || !owner || !completionDate || !acknowledgeExpired) return;
    const date = new Date(`${completionDate}:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) { setError("Choose the actual completion time in the past (UTC)."); return; }
    const completedAt = date.toISOString();
    const next = completionAttempt.current ?? { operationId: crypto.randomUUID(), completedAt, project: { ...project } }; completionAttempt.current = next; setCompletionPending(true); pending.current = true; setBusy(true); setError("");
    try { await establishHubLegacyCompletion(next.project, { operationId: next.operationId, completedAt: next.completedAt, acknowledgeExpired }); if (alive.current) { completionAttempt.current = null; setCompletionPending(false); setNotice("Saved Successfully"); await refresh(); } }
    catch (cause) { if (alive.current && cause && typeof cause === "object" && "code" in cause && cause.code === "functions/invalid-argument") { completionAttempt.current = null; setCompletionPending(false); } failure(cause); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  const legacy = page?.retention.state === "legacy-needs-date";
  return <><button hidden={hideTrigger} style={hideTrigger ? { display: "none" } : undefined} ref={trigger} className={styles.paperclip} type="button" disabled={disabled} aria-label="Maker Chat attachments" title="Shared attachment history" aria-haspopup="dialog" onClick={event => show({ mode: "history" }, event.currentTarget)}><AttachmentPaperclip /></button>
    {!open && (busy || error || notice || attempt) && <div className={styles.backgroundStatus} data-busy={busy || undefined} role={error ? "alert" : "status"}><div className={styles.transferSummary}>{busy && <span className={styles.transferSpinner} aria-hidden="true" />}<span>{error || notice || (busy ? progress?.phase === "committing" ? "Confirming attachment send…" : "Sending attachments…" : "Attachment send needs attention.")}</span>{busy && progress && <><small>{progress.index + 1} / {progress.totalFiles} · {progress.fileName}</small>{progress.phase === "uploading" && <progress aria-label="Attachment upload progress" value={progress.uploadedBytes} max={Math.max(1, progress.totalBytes)} />}</>}</div><div className={styles.transferActions}>{(busy || attempt || error) && <button type="button" onClick={() => setOpen(true)}>View upload</button>}{attempt && <button type="button" disabled={progress?.phase === "committing"} onClick={() => void cancel()}>Cancel upload</button>}</div></div>}
    {previewIndex !== null && <StagedGallery files={files.filter(previewable)} index={previewIndex} onChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} />}
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={`attachments-${project.projectId}`} onCancel={event => { event.preventDefault(); close(); }}><header><div><h2 id={`attachments-${project.projectId}`}>{view.mode === "upload" ? "Send attachments" : view.batchId ? "Attachments from this message" : "Maker Chat attachments"}</h2><p className={styles.caption}>{project.title}</p><p>{view.mode === "upload" ? "Up to 5 files per send · 20 MB each · all file types" : "Shared file history · downloads are saved to your device"}</p></div><button type="button" className={styles.close} aria-label="Close attachments" onClick={close}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header><div className={styles.body}>
      {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
      {page?.retention.available === false ? <p>{page.retention.reason === "expired" ? "Attachments expired 60 days after commission completion." : "Attachment access could not be confirmed. Refresh the attachment list and try again."}</p> : view.mode === "upload" ? <form onSubmit={event => void send(event)} className={styles.upload}><label>Choose files<input ref={input} type="file" multiple disabled={busy || !!attempt || disabled || page?.retention.available !== true} onChange={event => { setStagedRename(null); setPreviewIndex(null); setFiles(Array.from(event.target.files ?? [])); event.target.value = ""; setError(""); }} /></label>{files.length > 0 && <ul className={styles.pendingFiles}>{files.map((file, index) => <li key={`${index}:${file.name}`}><StagedThumbnail file={file} onOpen={() => setPreviewIndex(files.filter(previewable).indexOf(file))} /><span>{stagedRename === index ? <input aria-label={`Name for ${file.name}`} value={stagedName} disabled={busy || !!attempt} onChange={event => setStagedName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); saveStagedName(index); } }} /> : file.name} <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><div><button type="button" disabled={busy || !!attempt} aria-label={stagedRename === index ? `Save name for ${file.name}` : `Rename ${file.name}`} onClick={() => { if (pending.current || attempt) return; if (stagedRename === index) saveStagedName(index); else { setStagedRename(index); const dot = file.name.lastIndexOf("."); setStagedName(dot > 0 ? file.name.slice(0, dot) : file.name); } }}>{stagedRename === index ? "Save name" : "Rename"}</button><button type="button" disabled={busy || !!attempt} onClick={() => replacements.current[index]?.click()} aria-label={`Replace ${file.name}`}>Replace</button><input hidden className={styles.hiddenChooser} style={{ display: "none" }} ref={element => { replacements.current[index] = element; }} type="file" disabled={busy || !!attempt} onChange={event => { const replacement = event.target.files?.[0]; event.target.value = ""; if (!replacement || pending.current || attempt) return; setStagedRename(null); setPreviewIndex(null); setFiles(previous => previous.map((saved, i) => i === index ? replacement : saved)); setError(""); }} /><button type="button" disabled={busy || !!attempt} aria-label={`Remove ${file.name}`} onClick={() => { if (!pending.current && !attempt) { setStagedRename(null); setPreviewIndex(null); setFiles(previous => previous.filter((_, i) => i !== index)); } }}>Remove</button></div></li>)}</ul>}<div className={styles.actions}><button type="submit" disabled={busy || disabled || stagedRename !== null || !files.length || page?.retention.available !== true}>{busy ? "Working…" : attempt ? "Retry upload" : "Send files"}</button>{attempt && <button type="button" disabled={progress?.phase === "committing"} onClick={() => void cancel()}>Cancel upload</button>}{!attempt && files.length > 0 && <button type="button" onClick={clearAttempt}>Clear selection</button>}</div>{attempt && !busy && <p className={styles.caption}>Retry keeps the same files and send ID. Cancel upload to discard this staged batch.</p>}</form> : null}
      {progress && <div className={styles.progress} role="status">{busy && <span className={styles.transferSpinner} aria-hidden="true" />}<span>{!busy && error ? "Paused — check the error before retrying" : progress.phase === "hashing" ? "Preparing" : progress.phase === "committing" ? "Confirming send" : progress.phase === "uploading" ? progress.uploadedBytes === progress.totalBytes ? "Verifying transfer" : "Transferring" : progress.phase} · {progress.fileName}</span>{progress.phase === "uploading" && <progress value={progress.uploadedBytes} max={progress.totalBytes} aria-label="File transfer progress" />}</div>}
      {view.mode === "history" && <><div className={styles.galleryHeading}><h3>{view.batchId ? "Files in this send" : "Shared files"}</h3><button type="button" className={styles.refresh} aria-label="Refresh attachments" title="Refresh attachments" disabled={loading || busy} onClick={() => void refresh()}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 19.6 10M4.4 14A8 8 0 0 0 17.9 17.9" /></svg></button></div>
      <ul className={styles.files}>{page?.attachments.map((attachment) => <li key={attachment.attachmentId}><SavedAttachmentPreview project={project} owner={owner} file={attachment} /><div><strong title={attachment.fileName}>{attachment.fileName}</strong><small>{(attachment.size / 1024 / 1024).toFixed(1)} MB · {attachment.senderRole === "owner" ? "Taylor" : "Client"} · {makerTime(attachment.createdAt)}</small>{attachment.available === false && <small>Unavailable · {attachment.unavailableReason === "expired" ? "expired" : "access could not be confirmed"}</small>}</div><div className={styles.fileActions}><button type="button" disabled={busy || disabled || !!attempt || attachment.available === false} onClick={() => openRename(attachment)}>Rename my copy</button><button type="button" disabled={busy || disabled || !!attempt || attachment.available === false} aria-label={`Download ${attachment.fileName}`} title="Download" onClick={() => void download(attachment)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg></button><button type="button" disabled={busy || disabled || !!attempt} onClick={() => { setError(""); setNotice(""); setDeleteTarget(attachment); }}>Delete my copy</button></div></li>)}</ul>
      {view.batchId && <button type="button" disabled={busy} onClick={() => show({ mode: "history" }, returnFocus.current)}>View all shared files</button>}{loading && <p role="status">Loading attachments…</p>}{!loading && page && !page.attachments.length && <p>{view.batchId ? "No attachments from this message are available in your copy." : page.nextCursor ? "No available files on this page. Load earlier files to keep looking." : "No shared files yet."}</p>}{!loading && page && view.batchId && page.attachments.length > 0 && page.attachments.length < (view.attachmentIds?.length ?? 0) && <p>Some attachments from this message are no longer available in your copy.</p>}{page?.nextCursor && <button type="button" disabled={loading || busy} onClick={() => void refresh(true)}>Load earlier files</button>}</>}{legacy && owner && <details className={styles.completionDetails}><summary>Record completion date (optional)</summary><form onSubmit={event => void saveCompletion(event)} className={styles.legacy}><p>Files stay available without an expiry date until completion is recorded. You may optionally record the actual completion time below to start the 60-day countdown from that time.</p><label>Completion time (UTC)<input type="datetime-local" required value={completionDate} disabled={busy || completionPending || !!attempt} onChange={event => setCompletionDate(event.target.value)} /></label><label className={styles.check}><input type="checkbox" checked={acknowledgeExpired} disabled={busy || !!attempt} onChange={event => setAcknowledgeExpired(event.target.checked)} />I understand that an older date may immediately expire attachments.</label><button type="submit" disabled={busy || disabled || !!attempt || !completionDate || !acknowledgeExpired}>{busy ? "Saving…" : "Save completion date"}</button></form></details>}<p className={styles.caption}>{!page ? "Attachment availability is checked before each transfer." : page.retention.expiresAt ? `Available until ${makerTime(page.retention.expiresAt)}.` : "No expiry date yet. The 60-day countdown starts when commission completion is recorded."}</p>
    </div></dialog>}{renameTarget && <HubActionDialog title="Rename your attachment copy" confirmLabel="Save name" busy={busy} onClose={() => setRenameTarget(null)} onConfirm={() => void renameCopy()}><p>This changes only the name shown and downloaded for you. The other person’s copy and the original file stay unchanged.</p><label className={styles.renameField}>File name<input autoFocus value={renameValue} maxLength={42 - (renameTarget.fileName.lastIndexOf(".") > 0 ? renameTarget.fileName.length - renameTarget.fileName.lastIndexOf(".") : 0)} disabled={busy} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.repeat) { event.preventDefault(); void renameCopy(); } }} /><small>The original file extension is kept.</small></label>{error && <p role="alert">{error}</p>}</HubActionDialog>}{deleteTarget && <HubActionDialog title="Delete your attachment copy?" confirmLabel="Delete my copy" busy={busy} onClose={() => setDeleteTarget(null)} onConfirm={() => void deleteCopy()}><p>{deleteTarget.fileName}</p><p>This removes your access to this attachment. The other person’s copy is unchanged. The stored file is not physically removed.</p>{error && <p role="alert">{error}</p>}</HubActionDialog>}</>;
}
