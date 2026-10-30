"use client";
import { SpadeMark } from "./SpadeMark";

/* eslint-disable @next/next/no-img-element -- Private authenticated blob URLs never enter an image optimizer or CDN. */

import { focusWorkspaceTab } from "./workspace-tab-focus";
import { useChatTextDraft } from "./use-chat-text-draft";
import { useConfirmAction } from "./use-confirm-action";
import { DownloadIcon } from "@/components/DownloadIcon";
import { ProgressPhotoQueue } from "./ProgressPhotoQueue";
import SiteSelect from "@/components/SiteSelect";
import { readStudioSettings } from "@/owner/use-studio-settings";
import { getProjectMilestones } from "./model";
import { watchHubAreaPresence } from "./notification-presence";
import { RefreshIcon } from "@/components/RefreshIcon";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ClientHubProject, HubPhoto, HubSupportRequest, HubSupportReply, HubMessage, HubPrivateWorkspace, HubMaterialRequirement, HubNotification } from "./model";
import { clientHubErrorMessage, isClientHubSessionError } from "./client";
import { getHubCommissionFolders, createHubCommissionFolder, loadProjectWorkspace, subscribeProjectWorkspace, sendHubMessage, uploadHubPhoto, createHubSupportRequest, replyHubSupportRequest, setHubSupportRequestStatus, markHubConversationRead, saveHubPrivateWorkspace, loadHubPhotoBlob, listHubPhotoFolder, clearHubPhotoCache, loadHubSupportRequestPage, loadHubSupportReplyPage, loadHubSupportRequest, type HubHistoryCursor, type HubConnectionState } from "./workspace-client";
import { readInventory } from "@/owner/inventory-client";
import type { InventoryItem } from "@/owner/inventory-model";
import { clientUpdateDate, safeTrackingUrl, makerTime } from "./presentation";
import { SupportArchiveDialog } from "./SupportArchiveDialog";
import { InformationTags } from "./InformationTags";
import { PresentedStatus } from "./LabelPresentationContext";
import { mergeSupportRequests, mergeSupportReplies, emptySupportReplyDraft, type SupportReplyDraft } from "./support-history";
import { PhotoLightbox } from "./PhotoLightbox";
import { createPhotoZip, safeArchiveName, HUB_ZIP_MAX_BYTES, HUB_ZIP_MAX_FILES } from "./photo-zip";
import { conversationHidden, type HubConversationVisibility } from "./conversation-state";
import { CooldownCountdown, UpdateRequestCooldownControl, useUpdateRequestCooldown } from "./UpdateRequestCooldown";
import { setHubConversationVisibility } from "./workspace-client";
import { createHiddenRequestRefresher } from "./hidden-request-refresh";
import { MakerChatAttachments, AttachmentPaperclip, type AttachmentOpenRequest } from "./MakerChatAttachments";
import { useConversationScroll } from "./use-conversation-scroll";
import { HubActionDialog } from "./HubActionDialog";
import { deleteHubFileCopy, verifyHubFileCopies } from "./file-copy-client";
import { HubTimingDiagnostics } from "./HubTimingDiagnostics";
import { timeHubSnapshotFrame } from "./hub-timing";
import styles from "./ProjectWorkspace.module.css";

export type WorkspaceTab = "overview" | "chat" | "photos" | "support" | "studio" | "deleted";
type Tab = WorkspaceTab;
type WorkspaceData = Awaited<ReturnType<typeof loadProjectWorkspace>>;
type Props = { project: ClientHubProject; owner?: boolean; disabled?: boolean; clientDisplayName?: string; clientNickname?: string; accountKey?: string; navigation?: { tab: Tab; version: number; requestId?: string; projectId?: string }; onTabChange?: (tab: Tab) => void; onSessionError?: (error: unknown) => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; onDiscardAvailabilityChange?: (safe: (() => boolean) | null) => void };
const empty = (): WorkspaceData => ({ messages: [], photos: [], requests: [], requestReplies: [], notifications: [], privateWorkspace: null });
const timeText = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const requestLabel = { update: "Progress update", support: "Support", "photo-deletion": "Photo deletion" };
function sessionFailure(error: unknown) { const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""; return isClientHubSessionError(error) || ["functions/unauthenticated", "functions/permission-denied"].includes(code); }
/** Enter is local to this composer, never a page-level publish/payment shortcut. */
export function submitComposerOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || event.keyCode === 229) return;
  event.preventDefault();
  if (event.repeat || event.currentTarget.disabled) return;
  const form = event.currentTarget.form;
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (form && submit && !submit.disabled) form.requestSubmit(submit);
}

/** Keep implicit single-line saves native, but never submit an IME/repeated Enter. */
export function guardFormEnter(event: KeyboardEvent<HTMLFormElement>) {
  if ((event.target as HTMLElement)?.tagName === "TEXTAREA") return;
  if (event.key === "Enter" && (event.repeat || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || event.keyCode === 229)) event.preventDefault();
}

function Icon({ kind }: { kind: Tab | "refresh" | "check" }) {
  if (kind === "refresh") return <RefreshIcon />;
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "overview" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></> : kind === "chat" ? <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0ZM7 9h10M7 13h7" /> : kind === "photos" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></> : (kind === "support" || kind === "deleted") ? <><circle cx="12" cy="12" r="9" /><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" /></> : kind === "studio" ? <><path d="M12 3 3 8v8l9 5 9-5V8L12 3ZM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5" /></> : <path d="m5 12 4 4L19 6" />}</svg>;
}

export function PhotoTile({ photo, project, owner, onDeleteCopy, onFailure, onOpen }: { photo: HubPhoto; project: ClientHubProject; owner: boolean; onDeleteCopy: () => void; onFailure: (error: unknown) => void; onOpen?: (trigger: HTMLElement) => void }) {
  const { photoId, projectId, clientId, storagePath, fileName, caption, contentType, size, createdAt } = photo;
  const stablePhoto = useMemo(() => ({ photoId, projectId, clientId, storagePath, fileName, caption, contentType, size, createdAt }), [photoId, projectId, clientId, storagePath, fileName, caption, contentType, size, createdAt]);
  const [url, setUrl] = useState(""), [error, setError] = useState(""), [downloading, setDownloading] = useState(false), [retryGeneration, setRetryGeneration] = useState(0);
  const preview = useRef<HTMLElement>(null);
  const mounted = useRef(false), downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true; let active = true, objectUrl = ""; const request = new AbortController();
    const read = () => { void loadHubPhotoBlob(stablePhoto, owner, request.signal).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(cause => { if (active && !request.signal.aborted) { setError("This photo could not be loaded. Retry this photo when you are ready."); if (sessionFailure(cause)) onFailure(cause); } }); };
    // Even a large expanded folder only loads private previews as they approach view.
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined" && preview.current) { observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); read(); } }, { rootMargin: "160px" }); observer.observe(preview.current); } else read();
    return () => { active = false; mounted.current = false; observer?.disconnect(); request.abort(); downloadRequest.current?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [stablePhoto, owner, onFailure, retryGeneration]);
  async function download() {
    if (downloadRequest.current) return;
    const request = new AbortController(); downloadRequest.current = request; setDownloading(true); setError("");
    try {
      const blob = await loadHubPhotoBlob(stablePhoto, owner, request.signal); await verifyHubFileCopies(project, owner, [{ kind: "photo", fileId: photo.photoId }], request.signal); if (!mounted.current || request.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob), link = document.createElement("a"); link.href = objectUrl; link.download = safeArchiveName(photo.fileName, "progress-photo"); link.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) { if (mounted.current && !request.signal.aborted) { setError("Download could not be completed. Please try again."); if (sessionFailure(cause)) onFailure(cause); } }
    finally { if (downloadRequest.current === request) downloadRequest.current = null; if (mounted.current) setDownloading(false); }
  }
  return <article ref={preview} className={styles.photoCard}><button type="button" className={styles.photoOpen} disabled={!onOpen} aria-label={`Enlarge ${photo.caption || photo.fileName}`} aria-haspopup="dialog" onClick={event => onOpen?.(event.currentTarget)} /><div className={styles.photoPreview}>{url ? <img src={url} alt={photo.caption || `Progress photo: ${photo.fileName}`} loading="lazy" /> : <span role="status" aria-label={error ? "Photo unavailable" : "Loading photo"}>{error ? "Photo unavailable" : <span className={styles.photoSpinner} aria-hidden="true" />}</span>}</div><div className={styles.photoInfo}><h4>{photo.caption || photo.fileName}</h4><p>{photo.fileName} · {(photo.size / 1024 / 1024).toFixed(1)} MB<br /><time dateTime={photo.createdAt}>Uploaded {makerTime(photo.createdAt)}</time></p><div className={styles.photoActions}><button type="button" className={`${styles.button} ${styles.danger}`} disabled={downloading} aria-label={`Download ${photo.fileName}`} title="Download" onClick={() => void download()}>{downloading ? "Downloading…" : <DownloadIcon />}</button><button type="button" className={styles.button} onClick={onDeleteCopy}>Delete my copy</button></div>{error && <p className={styles.inlineError} role="alert">{error}</p>}{error && !url && <button type="button" className={styles.button} onClick={() => { setError(""); setRetryGeneration(value => value + 1); }}>Retry this photo</button>}</div></article>;
}

/** Overdue measures the oldest unanswered client activity, not owner inactivity after a reply. */
export function supportRequestOverdue(request: HubSupportRequest, now = Date.now()): boolean {
  if (request.status !== "open") return false;
  const awaiting = request.unansweredSince === undefined ? (request.lastClientMessageAt ?? request.createdAt) : request.unansweredSince;
  return !!awaiting && (!request.lastOwnerMessageAt || awaiting > request.lastOwnerMessageAt) && now - Date.parse(awaiting) > 96 * 60 * 60 * 1000;
}
export function RequestCard({ request, replies = [], owner, busy, expanded = true, onToggle, onReply, onStatus, onDraftChange, clientName = "Client", receiptCursor, draftState, onDraftStateChange, onLoadOlder, onHide, visible = true, historyLoading = false, overdue = supportRequestOverdue(request) }: { request: HubSupportRequest; replies?: HubSupportReply[]; owner: boolean; busy: boolean; expanded?: boolean; onToggle?: () => void; onReply: (request: HubSupportRequest, body: string, operationId: string, attachmentIds?: string[]) => Promise<boolean>; onAttach?: (trigger: HTMLElement) => void; onViewAttachments?: (trigger: HTMLElement) => void; onStatus: (request: HubSupportRequest, status: HubSupportRequest["status"]) => Promise<boolean>; onDraftChange: (id: string, dirty: boolean) => void; clientName?: string; receiptCursor?: HubNotification; draftState?: SupportReplyDraft; onDraftStateChange?: (id: string, patch: Partial<SupportReplyDraft>) => void; onLoadOlder?: () => void; onHide?: () => void; visible?: boolean; historyLoading?: boolean; overdue?: boolean }) {
  const { confirm, confirmation } = useConfirmAction();
  const [localResponse, setLocalResponse] = useState(""), [localAttempt, setLocalAttempt] = useState<SupportReplyDraft["attempt"]>(null);
  const response = draftState?.body ?? localResponse, attempt = draftState ? draftState.attempt : localAttempt;
  const setResponse = useCallback((body: string) => { setLocalResponse(body); onDraftStateChange?.(request.requestId, { body }); }, [request.requestId, onDraftStateChange]);
  const setAttempt = useCallback((value: SupportReplyDraft["attempt"]) => { setLocalAttempt(value); onDraftStateChange?.(request.requestId, { attempt: value }); }, [request.requestId, onDraftStateChange]);
  const pending = useRef(false), alive = useRef(true), threadId = useId(), threadLog = useRef<HTMLDivElement>(null), threadPinned = useRef(true);
  const newestReplyId = replies.at(-1)?.replyId;
  const onThreadScroll = useConversationScroll(threadLog, threadPinned, visible && expanded, `${replies.length}:${newestReplyId ?? ""}:${attempt?.operationId ?? ""}:${attempt?.state ?? ""}`);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDraftChange(request.requestId, !!response.trim() || !!attempt); return () => onDraftChange(request.requestId, false); }, [request.requestId, response, attempt, onDraftChange]);
  async function reply(event: FormEvent) {
    event.preventDefault(); if (pending.current || busy || !response.trim()) return;
    const next = attempt ?? { operationId: crypto.randomUUID(), body: response.trim(), attachmentIds: draftState?.attachmentIds ?? [], state: "pending" as const }; pending.current = true; setAttempt({ ...next, state: "pending" });
    try { const saved = await onReply(request, next.body, next.operationId, next.attachmentIds); if (alive.current) { if (saved) { setResponse(""); setAttempt(null); } else setAttempt({ ...next, state: "failed" }); } }
    finally { pending.current = false; }
  }
  useEffect(() => {
    if (!attempt || !replies.some(item => item.replyId === attempt.operationId)) return;
    let active = true; void Promise.resolve().then(() => { if (active && alive.current) { setResponse(""); setAttempt(null); } }); return () => { active = false; };
  }, [replies, attempt, setResponse, setAttempt]);
  const receiptText = (createdAt: string) => receiptCursor?.throughCreatedAt && receiptCursor.readAt && receiptCursor.throughCreatedAt >= createdAt ? `Read · ${timeText(receiptCursor.readAt)}` : `Sent · ${timeText(createdAt)}`;
  const canReply = request.status === "open";
  return <article className={styles.requestCard} data-overdue={overdue || undefined}>{confirmation}
    <button type="button" className={styles.threadToggle} aria-expanded={expanded} aria-controls={threadId} onClick={onToggle}><span><strong>{requestLabel[request.type]}</strong><small>{timeText(request.createdAt)}</small></span><span className={styles.badge} data-state={overdue ? "overdue" : request.status}>{overdue ? "Overdue" : request.status[0].toUpperCase() + request.status.slice(1)}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div id={threadId} hidden={!expanded} className={styles.threadBody}><div ref={threadLog} onScroll={onThreadScroll} className={styles.threadLog} role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions">{onLoadOlder && <button type="button" className={styles.textButton} disabled={historyLoading} onClick={onLoadOlder}>{historyLoading ? "Loading earlier replies…" : "Load earlier replies"}</button>}<article className={styles.message} data-own={owner ? request.senderRole === "owner" : request.senderRole !== "owner"}><div><strong>{request.senderRole === "owner" ? "Taylor" : owner ? clientName : "You"}</strong><time dateTime={request.createdAt}>{timeText(request.createdAt)}</time></div><p>{request.body}</p>{(owner ? request.senderRole === "owner" : request.senderRole !== "owner") && <small className={styles.receipt}>{receiptText(request.createdAt)}</small>}</article>{request.photoId && <p className={styles.caption}>Photo reference: <code>{request.photoId}</code>.</p>}{request.response && <article className={styles.message} data-own={owner}><div><strong>Taylor</strong><small>Earlier response</small></div><p>{request.response}</p></article>}{replies.map(item => <article className={styles.message} data-own={owner ? item.senderRole === "owner" : item.senderRole === "client"} key={item.replyId}><div><strong>{item.senderRole === "owner" ? "Taylor" : owner ? clientName : "You"}</strong><time dateTime={item.createdAt}>{timeText(item.createdAt)}</time></div><p>{item.body}</p>{(owner ? item.senderRole === "owner" : item.senderRole === "client") && <small className={styles.receipt}>{receiptText(item.createdAt)}</small>}</article>)}{attempt && !replies.some(item => item.replyId === attempt.operationId) && <article className={styles.message} data-own="true" data-pending="true"><p>{attempt.body}</p><small className={styles.receipt}>{attempt.state === "pending" ? "Sending…" : "Not confirmed · retry below"}</small></article>}</div>
      {canReply && <form className={styles.resolveForm} onKeyDown={guardFormEnter} onSubmit={event => void reply(event)}><label>Reply<textarea value={response} onKeyDown={submitComposerOnEnter} onChange={event => setResponse(event.target.value)} maxLength={4000} rows={2} required disabled={busy} readOnly={!!attempt} placeholder="Keep the conversation going…" /></label><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || !response.trim()}>{attempt?.state === "failed" ? "Retry reply" : "Send reply"}</button>{attempt?.state === "failed" && <p className={styles.caption}>Not confirmed. Retry uses the same reply, without creating a duplicate.</p>}</form>}
      <div className={styles.threadActions}>{owner && onHide && <button type="button" className={styles.button} disabled={busy} onClick={onHide}>Hide for me</button>}{canReply ? <><button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={async () => { if (!response.trim() || await confirm("Close this chat? Your unsent reply will remain as a draft until you leave.")) void onStatus(request, "closed"); }}>Close chat</button>{owner && request.status !== "resolved" && <button type="button" className={styles.button} disabled={busy} onClick={() => void onStatus(request, "resolved")}>Mark resolved</button>}{!owner && <button type="button" className={styles.button} disabled={busy} onClick={() => void onStatus(request, "cancelled")}>Cancel request</button>}</> : <button type="button" className={styles.button} disabled={busy} onClick={() => void onStatus(request, "open")}>Reopen chat</button>}{!owner && onHide && <button type="button" className={styles.button} disabled={busy} onClick={onHide}>Hide for me</button>}</div>{request.type === "photo-deletion" && <p className={styles.caption}>Request status records the conversation only. Resolved does not confirm that a photo was deleted.</p>}
    </div>
  </article>;
}
export function StudioPanel({ project, previous, busy, onSave, onDirtyChange }: { project: ClientHubProject; previous: HubPrivateWorkspace | null; busy: boolean; onSave: (notes: string, materials: HubMaterialRequirement[], baseline: HubPrivateWorkspace | null) => Promise<HubPrivateWorkspace | null>; onDirtyChange: (dirty: boolean) => void }) {
  const { confirm, confirmation } = useConfirmAction();
  const [baseline, setBaseline] = useState(previous);
  const [notes, setNotes] = useState(previous?.notes ?? ""), [materials, setMaterials] = useState<HubMaterialRequirement[]>(previous?.materials ?? []);
  const [inventory, setInventory] = useState<InventoryItem[]>([]), [inventoryError, setInventoryError] = useState(""), [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryAttempt, setInventoryAttempt] = useState(0), [inventoryLoadedAt, setInventoryLoadedAt] = useState("");
  const savePending = useRef(false);
  const [itemId, setItemId] = useState(""), [quantity, setQuantity] = useState("1"), [formError, setFormError] = useState("");
  const dirty = notes !== (baseline?.notes ?? "") || JSON.stringify(materials) !== JSON.stringify(baseline?.materials ?? []);
  const changedElsewhere = (previous?.version ?? 0) !== (baseline?.version ?? 0);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { let active = true; void readInventory().then(result => { if (active) { setInventory(result.items.filter(item => !item.trashedAt && !item.archived)); setInventoryLoadedAt(new Date().toISOString()); } }).catch(() => { if (active) { setInventory([]); setInventoryError("Inventory could not be loaded. Saved material estimates are preserved; refresh stock to try again."); } }).finally(() => { if (active) setInventoryLoading(false); }); return () => { active = false; }; }, [project.projectId, inventoryAttempt]);
  function addMaterial() {
    const value = Number(quantity);
    if (!itemId || !Number.isFinite(value) || value <= 0 || value > 1_000_000 || Math.abs(value * 1000 - Math.round(value * 1000)) > .000001) { setFormError("Choose an inventory item and a positive quantity with up to three decimal places."); return; }
    if (materials.some(item => item.inventoryItemId === itemId)) { setFormError("This item is already in the estimate. Remove it before adding a different quantity."); return; }
    if (materials.length >= 50) { setFormError("Use up to 50 material items per commission."); return; }
    setMaterials(items => items.some(item => item.inventoryItemId === itemId) ? items : [...items, { inventoryItemId: itemId, requiredQuantity: value }]); setItemId(""); setQuantity("1"); setFormError("");
  }
  return <div className={styles.studio}>{confirmation}
    <div className={styles.privateBanner}><Icon kind="studio" /><div><strong>Only you can see this</strong><p>Private notes and material estimates never appear in the client’s hub.</p></div></div>
    <form className={styles.form} onKeyDown={guardFormEnter} onSubmit={async event => { event.preventDefault(); if (savePending.current || busy || !dirty || changedElsewhere) return; savePending.current = true; setFormError(""); try { const saved = await onSave(notes, materials, baseline); if (saved) { setBaseline(saved); setNotes(saved.notes); setMaterials(saved.materials); } } finally { savePending.current = false; } }}>
      {changedElsewhere && <div className={styles.retryNote}>This workspace changed on another device. Your draft has not been overwritten. Reload the saved version before editing again.<button type="button" className={styles.textButton} disabled={busy} onClick={async () => { if (dirty && !await confirm("Discard your local studio draft and load the newer saved version?")) return; setBaseline(previous); setNotes(previous?.notes ?? ""); setMaterials(previous?.materials ?? []); }}>Load saved version</button></div>}
      <label>Private studio notes<textarea rows={5} maxLength={10000} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} placeholder="Fitting reminders, supplier details, internal decisions…" /></label>
      <section><div className={styles.row}><div><h3>Materials estimate</h3><p className={styles.caption}>Compare this commission’s needs with current inventory.</p></div><span className={styles.badge}>Estimate only</span></div>
        {inventoryError && <p className={styles.inlineError} role="alert">{inventoryError}</p>}
        {materials.length ? <div className={styles.materialList}>{materials.map(material => { const item = inventory.find(entry => entry.id === material.inventoryItemId), shortage = item ? Math.max(0, material.requiredQuantity - item.quantity) : null; return <div className={styles.materialRow} key={material.inventoryItemId}><div><strong>{item?.name ?? "Saved inventory item"}</strong><small>{material.requiredQuantity} {item?.unit ?? "units"} needed · {item ? `${item.quantity} ${item.unit} in stock` : "Inventory unavailable"}</small></div><span className={styles.stock} data-short={shortage !== null && shortage > 0}>{shortage === null ? "Not checked" : shortage > 0 ? `Need ${Number(shortage.toFixed(3))} more` : "In stock"}</span><button type="button" className={styles.iconButton} aria-label={`Remove ${item?.name ?? "material"} from estimate`} disabled={busy} onClick={() => setMaterials(items => items.filter(entry => entry.inventoryItemId !== material.inventoryItemId))}>×</button></div>; })}</div> : <p className={styles.emptySmall}>No materials estimated yet. Add the parts or fabric you expect to use.</p>}
        <div className={styles.materialAdd}><fieldset disabled={busy || inventoryLoading || !!inventoryError}><label htmlFor="hub-inventory-item">Inventory item</label><SiteSelect id="hub-inventory-item" value={itemId} onChange={setItemId} options={[{ value: "", label: inventoryLoading ? "Loading inventory…" : "Choose an item" }, ...inventory.map(item => ({ value: item.id, label: `${item.name} (${item.quantity} ${item.unit})` }))]} /></fieldset><label>Quantity<input type="number" min="0.001" max="1000000" step="0.001" value={quantity} onKeyDown={event => { if (event.key !== "Enter") return; if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.keyCode === 229) return; event.preventDefault(); if (!event.repeat && !busy && itemId) addMaterial(); }} onChange={event => setQuantity(event.target.value)} disabled={busy} /></label><button type="button" className={styles.button} onClick={addMaterial} disabled={busy || !itemId}>Add</button></div>
        <div className={styles.stockRefresh}><span className={styles.caption}>{inventoryLoadedAt && !inventoryError ? `Stock checked ${timeText(inventoryLoadedAt)}.` : "Stock has not been verified."}</span><button type="button" className={styles.textButton} disabled={busy || inventoryLoading} onClick={() => { setInventoryLoading(true); setInventoryError(""); setInventoryAttempt(value => value + 1); }}>{inventoryLoading ? "Checking stock…" : "Refresh stock"}</button></div><p className={styles.caption}>Stock is not reserved or deducted. Other commissions may need the same materials. No order is placed.</p>
      </section>
      {formError && <p className={styles.inlineError} role="alert">{formError}</p>}<div className={styles.formFooter}><span className={styles.caption}>{dirty ? "You have unsaved studio changes." : baseline ? `Saved ${timeText(baseline.updatedAt)}` : "Not saved yet"}</span><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || !dirty || changedElsewhere}>{busy ? "Saving…" : "Save private workspace"}</button></div>
    </form>
  </div>;
}


/** A private, live project workspace. Every adapter revalidates the active account. */
export function ProjectWorkspace({ project, owner = false, disabled = false, clientDisplayName = "Client", clientNickname = "", accountKey, navigation, onTabChange, onSessionError, onDirtyChange, onBusyChange, onDiscardAvailabilityChange }: Props) {
  const { confirm, confirmation } = useConfirmAction();
  const baseId = useId();
  // Adapter scope is immutable: content updates must not reconnect live data or drop drafts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableProject = useMemo(() => project, [project.projectId, project.clientId]);
  const [visiblePhotos, setVisiblePhotos] = useState(12), [tab, setTab] = useState<Tab>("overview"), [data, setData] = useState<WorkspaceData>(empty), [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false), [historyRequests, setHistoryRequests] = useState<HubSupportRequest[]>([]), [historyReplies, setHistoryReplies] = useState<HubSupportReply[]>([]);
  const [requestCursor, setRequestCursor] = useState<HubHistoryCursor | null | undefined>(undefined), [replyCursor, setReplyCursor] = useState<HubHistoryCursor | null | undefined>(undefined), [historyLoading, setHistoryLoading] = useState(false);
  const [supportDrafts, setSupportDrafts] = useState<Record<string, SupportReplyDraft>>({});
  const hiddenRequestRefresher = useRef<ReturnType<typeof createHiddenRequestRefresher> | null>(null);
  const historyController = useRef<AbortController | null>(null), threadNavigation = useRef<AbortController | null>(null);
  const onReplyState = useCallback((id: string, patch: Partial<SupportReplyDraft>) => setSupportDrafts(previous => ({ ...previous, [id]: { ...(previous[id] ?? emptySupportReplyDraft()), ...patch } })), []);
  const [cooldownBusy, setCooldownBusy] = useState(false), [cooldownDirty, setCooldownDirty] = useState(false);
  const [persistentError, setPersistentError] = useState(false);
  // Notification persistence is not evidence that a write reached the server.
  // Untracked writes retain their own conservative, action-specific uncertainty.
  const [uncertainWrites, setUncertainWrites] = useState<Record<string,{label:string;expectedVersion:number|null}>>({});
  const uncertainWritesRef = useRef<Record<string,{label:string;expectedVersion:number|null}>>({}), discardRevoked = useRef(false);
  const [photoNameError, setPhotoNameError] = useState("");
  useEffect(() => { if (!photoNameError) return; const timer = window.setTimeout(() => setPhotoNameError(""), 8000); return () => window.clearTimeout(timer); }, [photoNameError]);
  const attachmentTarget = useRef<string | null>(null);
  const [requestAttachments, setRequestAttachments] = useState<string[]>([]);
  const [attachmentOpen, setAttachmentOpen] = useState<AttachmentOpenRequest | undefined>(undefined);
  const [attachmentDirty, setAttachmentDirty] = useState(false), [attachmentBusy, setAttachmentBusy] = useState(false);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const streamFailed = useRef(false);
  const [connectionState, setConnectionState] = useState<HubConnectionState>("connecting");
  const [error, setError] = useState(""), [noticeState, setNoticeState] = useState({ text: "", revision: 0 }), [locked, setLocked] = useState(false), [busy, setBusy] = useState(false), [lastChecked, setLastChecked] = useState("");
  const chatDraft = useChatTextDraft(stableProject, owner);
  const { message, setMessage, attempt: messageAttempt, setAttempt: setMessageAttempt, clear: clearChatDraft, clearRevoked: revokeChatDraft } = chatDraft;
  const [requestType, setRequestType] = useState<"update" | "support">("support"), [requestBody, setRequestBody] = useState(""), [requestPhoto, setRequestPhoto] = useState<string | null>(null), [requestAttempt, setRequestAttempt] = useState<{ operationId: string; type: "update" | "support" | "photo-deletion"; body: string; photoId: string | null; attachmentIds?: string[] } | null>(null);
  const [folders, setFolders] = useState<{ version: number; folderNames: string[] } | null>(null);
  const [folderError, setFolderError] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  useEffect(() => { if (!owner) return; let active = true; void getHubCommissionFolders(stableProject).then(value => { if (active) setFolders(value); }).catch(() => { if (active) setFolderError("Saved folders could not be loaded. Refresh this workspace before creating another folder."); }); return () => { active = false; }; }, [owner, stableProject]);
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]), [photoCaption, setPhotoCaption] = useState(""), [photoFolder, setPhotoFolder] = useState("");
  const [photoAttempt, setPhotoAttempt] = useState<{ entries: { file: File; photoId: string; nameStem?: string }[]; completed: string[]; caption: string; folder: string } | null>(null), [studioDirty, setStudioDirty] = useState(false), [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [deletePhoto, setDeletePhoto] = useState<HubPhoto | null>(null);
  const [ownerAction, setOwnerAction] = useState<{ requestId: string; version: number; kind: "hide" | "status"; activityKey?: string; status?: HubSupportRequest["status"] } | null>(null);
  const pendingAction = useRef<{ operationId?: string } | null>(null), selectionRevision = useRef(0);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null), [zipProgress, setZipProgress] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, boolean>>({}), [clock, setClock] = useState(() => Date.now());
  const alive = useRef(false), generation = useRef(0), snapshotVersion = useRef(0), pending = useRef(false), readPending = useRef(false), controller = useRef<AbortController | null>(null), zipController = useRef<AbortController | null>(null), uploadCancelled = useRef(false), chatLog = useRef<HTMLDivElement>(null), chatPinned = useRef(true), fileInput = useRef<HTMLInputElement>(null), lightboxTrigger = useRef<HTMLElement | null>(null), heading = useRef<HTMLElement>(null), readAttempts = useRef(new Set<string>());
  const notice = noticeState.text;
  const setNotice = useCallback((text: string) => setNoticeState(previous => ({ text, revision: previous.revision + 1 })), []);
  const sessionHandler = useRef(onSessionError);
  useEffect(() => { sessionHandler.current = onSessionError; }, [onSessionError]);
  useEffect(() => () => { clearHubPhotoCache?.(); }, [project.clientId, project.projectId, owner]);
  const onReplyDraft = useCallback((id: string, value: boolean) => { setReplyDrafts(previous => previous[id] === value ? previous : { ...previous, [id]: value }); }, []);
  const dirty = Object.keys(uncertainWrites).length > 0 || !!messageAttempt || !!requestAttempt || !!photoAttempt || !!ownerAction || requestAttachments.length > 0 || Object.values(supportDrafts).some(draft => !!draft.attachmentIds?.length) || attachmentDirty || (!chatDraft.durable && (!!message.trim() || !!messageAttempt)) || !!requestBody.trim() || !!photoFiles.length || !!photoCaption.trim() || !!photoFolder.trim() || studioDirty || cooldownDirty || Object.values(replyDrafts).some(Boolean) || Object.values(supportDrafts).some(draft => !!draft.body.trim() || !!draft.attempt);
  const blocked = busy || attachmentBusy || cooldownBusy || locked || disabled;
  const discardSafe = !busy && !attachmentBusy && !cooldownBusy && !folderBusy && !locked && !Object.keys(uncertainWrites).length && !messageAttempt && !requestAttempt && !photoAttempt && !ownerAction && !attachmentDirty && !cooldownDirty && !requestAttachments.length && !Object.values(supportDrafts).some(draft => !!draft.attempt || !!draft.attachmentIds?.length);
  useEffect(() => { onDiscardAvailabilityChange?.(discardSafe ? () => !pending.current && !discardRevoked.current && !Object.keys(uncertainWritesRef.current).length : null); return () => onDiscardAvailabilityChange?.(null); }, [discardSafe, onDiscardAvailabilityChange]);
  const reportFailure = useCallback((cause: unknown) => {
    if (!alive.current) return;
    setPersistentError(true); setError(clientHubErrorMessage(cause));
    if (sessionFailure(cause)) {
      discardRevoked.current = true;
      revokeChatDraft();
      ++generation.current; controller.current?.abort(); zipController.current?.abort(); uploadCancelled.current = true;
      historyController.current?.abort(); hiddenRequestRefresher.current?.stop(); threadNavigation.current?.abort(); setArchiveOpen(false); setHistoryRequests([]); setHistoryReplies([]); setSupportDrafts({}); setData(empty()); setLoaded(false); setLocked(true); setBusy(false); setZipProgress(""); clearChatDraft(); setRequestBody(""); setRequestAttachments([]); attachmentTarget.current = null; setRequestAttempt(null); setPhotoFiles([]); setPhotoNames([]); setPhotoCaption(""); setPhotoFolder(""); setPhotoAttempt(null); setStudioDirty(false); setActivePhotoId(null); setDeletePhoto(null); setOwnerAction(null); setAttachmentOpen(undefined); setSelectedRequestId(null); setReplyDrafts({}); sessionHandler.current?.(cause);
    }
  }, [revokeChatDraft, clearChatDraft]);
  const refresh = useCallback(async (initial = false) => {
    if (readPending.current || !alive.current) return;
    const sequence = generation.current, revision = snapshotVersion.current, request = new AbortController(); controller.current?.abort(); controller.current = request; readPending.current = true; setLoading(true); if (initial) setError("");
    try { const result = await loadProjectWorkspace(stableProject, owner, request.signal); if (alive.current && sequence === generation.current && !request.signal.aborted && revision === snapshotVersion.current) { setData(result); setHistoryRequests(previous => mergeSupportRequests(previous, result.requests)); setHistoryReplies(previous => mergeSupportReplies(previous, result.requestReplies ?? [])); setLoaded(true); setLocked(false); setError(""); setLastChecked(new Date().toISOString()); } }
    catch (cause) { if (alive.current && sequence === generation.current && !request.signal.aborted && (sessionFailure(cause) || revision === snapshotVersion.current)) reportFailure(cause); }
    finally { if (controller.current === request) { readPending.current = false; controller.current = null; } if (alive.current && sequence === generation.current) setLoading(false); }
  }, [stableProject, owner, reportFailure]);
  useEffect(() => {
    alive.current = true; let active = true; const lifecycle = generation, life = ++lifecycle.current;
    void Promise.resolve().then(() => { if (active) void refresh(true); });
    const unsubscribe = subscribeProjectWorkspace(stableProject, owner, result => {
      if (!active || !alive.current || life !== generation.current) return;
      ++snapshotVersion.current; setData(result); timeHubSnapshotFrame(owner); setHistoryRequests(previous => mergeSupportRequests(previous, result.requests)); setHistoryReplies(previous => mergeSupportReplies(previous, result.requestReplies ?? [])); setLoaded(true); setLoading(false); setLastChecked(new Date().toISOString());
    }, cause => { if (active && life === generation.current) { streamFailed.current = !sessionFailure(cause); setLoading(false); reportFailure(cause); } }, state => { if (active && life === generation.current) setConnectionState(state); });
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => { active = false; alive.current = false; ++lifecycle.current; controller.current?.abort(); zipController.current?.abort(); historyController.current?.abort(); threadNavigation.current?.abort(); uploadCancelled.current = true; unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [stableProject, owner, refresh, reportFailure, streamAttempt]);
  useEffect(() => {
    if (!navigation || navigation.tab === "studio" && !owner || navigation.projectId && navigation.projectId !== stableProject.projectId) return;
    const request = new AbortController(); threadNavigation.current?.abort(); threadNavigation.current = request;
    void Promise.resolve().then(async () => {
      if (request.signal.aborted) return;
      setTab(navigation.tab); setSelectedRequestId(null); setArchiveOpen(false);
      heading.current?.focus({ preventScroll: true });
      if (navigation.requestId && navigation.tab === "support") {
        try {
          const target = await loadHubSupportRequest(stableProject, owner, navigation.requestId, request.signal);
          if (request.signal.aborted || !alive.current) return;
          setHistoryRequests(previous => mergeSupportRequests(previous, [target])); setSelectedRequestId(target.requestId); setArchiveOpen(target.status === "resolved");
        } catch (cause) { if (!request.signal.aborted && alive.current) reportFailure(cause); }
      }
    });
    return () => request.abort();
  }, [navigation, owner, stableProject, reportFailure]);
  function checkUpdates() { if (streamFailed.current && !locked) { streamFailed.current = false; setConnectionState("connecting"); setStreamAttempt(value => value + 1); } else void refresh(); }
  function closeArchive() { historyController.current?.abort(); threadNavigation.current?.abort(); setArchiveOpen(false); setSelectedRequestId(null); }
  const composer = useRef<HTMLFormElement>(null);
  const tabFocusContext = useRef<{ navigation: typeof navigation; clientId: string; projectId: string; tab: Tab } | null>(null);
  const [tabFocusIntent, setTabFocusIntent] = useState(0);
  useEffect(() => {
    const intent = tabFocusContext.current;
    if (!tabFocusIntent || !intent || intent.navigation !== navigation || intent.clientId !== project.clientId || intent.projectId !== project.projectId || intent.tab !== tab) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame?.(() => { if (!cancelled && heading.current) focusWorkspaceTab(heading.current, composer.current, tab === "chat"); });
    return () => { cancelled = true; if (frame !== undefined) window.cancelAnimationFrame?.(frame); };
  }, [tabFocusIntent, tab, navigation, project.clientId, project.projectId]);
  function selectTab(next: Tab) { tabFocusContext.current = { navigation, clientId: project.clientId, projectId: project.projectId, tab: next }; setTabFocusIntent(value => value + 1); ++selectionRevision.current; if (next !== "support") closeArchive(); setTab(next); onTabChange?.(next); }

  useEffect(() => { if (tab !== "photos") { zipController.current?.abort(); void Promise.resolve().then(() => { if (alive.current) setActivePhotoId(null); }); } }, [tab]);
  useEffect(() => { if (!disabled) return; zipController.current?.abort(); uploadCancelled.current = true; void Promise.resolve().then(() => { if (alive.current) setActivePhotoId(null); }); }, [disabled]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || attachmentBusy || cooldownBusy || !!zipProgress); return () => onBusyChange?.(false); }, [busy, attachmentBusy, cooldownBusy, zipProgress, onBusyChange]);
  useEffect(() => { if (!dirty && !busy && !zipProgress) return; const block = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", block); return () => window.removeEventListener("beforeunload", block); }, [dirty, busy, zipProgress]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5_000); return () => window.clearTimeout(timer); }, [notice, noticeState.revision, setNotice]);
  // Height depends ONLY on viewport size, never the element's moving top or ancestor resize.
  // The previous scroll listener created a feedback loop: scrolling enlarged chat, shifting the page again.
  useEffect(() => {
    const workspace = heading.current;
    if (tab !== "chat" || !workspace?.style) return;
    const measure = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (!Number.isFinite(height)) return;
      const log = chatLog.current, pinned = chatPinned.current;
      workspace.style.setProperty("--chat-available-height", `${Math.max(320, Math.min(640, Math.floor(height * .68)))}px`);
      if (pinned && log) log.scrollTop = log.scrollHeight;
    };
    measure(); window.addEventListener("resize", measure); window.visualViewport?.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, [tab]);
  const newestMessageId = data.messages.at(-1)?.messageId;
  const onChatScroll = useConversationScroll(chatLog, chatPinned, tab === "chat" && !locked, `${data.messages.length}:${newestMessageId ?? ""}:${messageAttempt?.operationId ?? ""}:${messageAttempt?.state ?? ""}`);
  useEffect(() => { if (!messageAttempt || !data.messages.some(item => item.messageId === messageAttempt.operationId && item.senderRole === (owner ? "owner" : "client") && item.body === messageAttempt.body)) return; let active = true; void Promise.resolve().then(() => { if (active && alive.current) { clearChatDraft(); if (owner && pendingAction.current?.operationId === messageAttempt.operationId) { pendingAction.current = null; pending.current = false; setBusy(false); } } }); return () => { active = false; }; }, [data.messages, messageAttempt, owner, clearChatDraft]);
  const cooldown = useUpdateRequestCooldown(stableProject, owner, tab === "support" && loaded && !locked, reportFailure);
  const notificationRows = data.notifications ?? data.receipts ?? [], myRole = owner ? "owner" : "client", otherRole = owner ? "client" : "owner";
  const allRequests = mergeSupportRequests(historyRequests, data.requests), requestReplies = mergeSupportReplies(historyReplies, data.requestReplies ?? []), selectedRequest = allRequests.find(item => item.requestId === selectedRequestId);
  // Persisted legacy Maker Chat markers are ignored, never erased or acted on.
  const visibility = (data.visibility ?? []).filter(item => item.channel === "requests");
  useEffect(() => {
    if (!loaded || locked) return;
    const life = generation.current;
    const refresher = createHiddenRequestRefresher((requestId, signal) => loadHubSupportRequest(stableProject, owner, requestId, signal), value => {
      if (alive.current && life === generation.current) setHistoryRequests(previous => mergeSupportRequests(previous, [value]));
    }, cause => { if (alive.current && life === generation.current) reportFailure(cause); });
    hiddenRequestRefresher.current = refresher;
    return () => { refresher.stop(); if (hiddenRequestRefresher.current === refresher) hiddenRequestRefresher.current = null; };
  }, [stableProject, owner, loaded, locked, reportFailure]);
  useEffect(() => {
    // An old parent request can fall outside the createdAt-ordered live200 even
    // while its newest replies/notifications arrive. Refresh that parent's
    // authoritative version; never navigate to it or mark it read.
    const candidates = [...(data.visibility ?? []).filter(item => item.hidden && item.channel === "requests" && item.requestId).map(item => ({ requestId: item.requestId!, version: item.version })), ...(ownerAction?.kind === "hide" ? [{ requestId: ownerAction.requestId, version: ownerAction.version }] : [])];
    hiddenRequestRefresher.current?.update(candidates.filter(item => !data.requests.some(request => request.requestId === item.requestId)).map(item => ({
      requestId: item.requestId!,
      activityKey: `${item.version}|${(data.notifications ?? data.receipts ?? []).filter(notice => notice.requestId === item.requestId).map(notice => `${notice.recipientRole}:${notice.version}:${notice.latestItemId}`).sort().join(";")}|${(data.requestReplies ?? []).filter(reply => reply.requestId === item.requestId).at(-1)?.replyId ?? ""}`,
    })));
  }, [data.visibility, data.requests, data.notifications, data.receipts, data.requestReplies, loaded, locked, ownerAction]);
  const requestActivityKey = (requestId: string) => `${notificationRows.filter(item => item.requestId === requestId).map(item => `${item.recipientRole}:${item.version}:${item.latestItemId}`).sort().join(";")}|${requestReplies.filter(item => item.requestId === requestId).map(item => item.replyId).sort().join(";")}`;
  const hiddenRequest = (request: HubSupportRequest) => (ownerAction?.kind === "hide" && ownerAction.requestId === request.requestId && request.version <= ownerAction.version && ownerAction.activityKey === requestActivityKey(request.requestId)) || conversationHidden(visibility.find(item => item.requestId === request.requestId), request.version);
  const currentRequests = allRequests.filter(item => item.status !== "resolved" && !hiddenRequest(item)), archivedRequests = allRequests.filter(item => item.status === "resolved" && !hiddenRequest(item));
  const visibleSelectedRequest = tab === "support" && selectedRequest && !hiddenRequest(selectedRequest) && (selectedRequest.status === "resolved" ? archiveOpen : !archiveOpen) ? selectedRequest : undefined;
  let readTarget: { channel: HubNotification["channel"]; itemId: string; requestId?: string } | null = null;
  if (tab === "chat") { const latest = data.messages.filter(item => item.senderRole === otherRole).at(-1); if (latest) readTarget = { channel: "chat", itemId: latest.messageId }; }
  if (tab === "photos" && data.photos[0]) readTarget = { channel: "photos", itemId: data.photos[0].photoId };
  if (visibleSelectedRequest) { const threadNotice = notificationRows.find(item => item.recipientRole === myRole && item.channel === "requests" && item.requestId === visibleSelectedRequest.requestId), latest = requestReplies.filter(item => item.requestId === visibleSelectedRequest.requestId && item.senderRole === otherRole).at(-1); if (threadNotice?.latestItemId === visibleSelectedRequest.requestId || requestReplies.some(item => item.requestId === visibleSelectedRequest.requestId && item.replyId === threadNotice?.latestItemId)) readTarget = { channel: "requests", itemId: threadNotice!.latestItemId, requestId: visibleSelectedRequest.requestId }; else if (latest) readTarget = { channel: "requests", itemId: latest.replyId, requestId: visibleSelectedRequest.requestId }; else if ((visibleSelectedRequest.senderRole ?? "client") === otherRole) readTarget = { channel: "requests", itemId: visibleSelectedRequest.requestId, requestId: visibleSelectedRequest.requestId }; }
  const attentionChannel = tab === "chat" ? "chat" : tab === "photos" ? "photos" : visibleSelectedRequest ? "requests" : null;
  const attentionRequestId = visibleSelectedRequest?.requestId;
  useEffect(() => {
    if (!loaded || locked || disabled || !attentionChannel || !heading.current) return;
    return watchHubAreaPresence({ role: owner ? "owner" : "client", clientId: project.clientId, projectId: project.projectId, channel: attentionChannel, ...(attentionRequestId ? { requestId: attentionRequestId } : {}) }, heading.current);
  }, [loaded, locked, disabled, attentionChannel, attentionRequestId, owner, project.clientId, project.projectId]);
  const readChannel = readTarget?.channel, readItemId = readTarget?.itemId, readRequestId = readTarget?.requestId;
  const readEventVersion = notificationRows.find(item => item.recipientRole === myRole && item.channel === readChannel && item.requestId === readRequestId)?.version ?? 0;
  useEffect(() => {
    if (!loaded || locked || !readChannel || !readItemId) return;
    let active = true;
    const mark = () => {
      if (!active || document.visibilityState === "hidden") return;
      const key = `${readChannel}:${readRequestId ?? ""}:${readItemId}:${readEventVersion}`; if (readAttempts.current.has(key)) return; readAttempts.current.add(key);
      void markHubConversationRead(stableProject, owner, { channel: readChannel, itemId: readItemId, ...(readRequestId ? { requestId: readRequestId } : {}) }).then(result => { if (!active || !alive.current || !result.notification) return; const saved = result.notification; setData(previous => ({ ...previous, notifications: [...(previous.notifications ?? []).filter(item => item.notificationId !== saved.notificationId), saved] })); }).catch(cause => { readAttempts.current.delete(key); if (active && sessionFailure(cause)) reportFailure(cause); });
    };
    mark(); document.addEventListener("visibilitychange", mark); window.addEventListener("focus", mark); return () => { active = false; document.removeEventListener("visibilitychange", mark); window.removeEventListener("focus", mark); };
  }, [loaded, locked, readChannel, readItemId, readRequestId, readEventVersion, stableProject, owner, reportFailure, lastChecked]);
  async function perform(work: (current: () => boolean) => Promise<void>, operationId?: string, uncertainty?: {key:string;label:string;expectedVersion:number|null;confirmed:()=>number|true|undefined}) {
    if (pending.current || cooldownBusy || locked || disabled) return false;
    const life = generation.current, action = { operationId }; pendingAction.current = action; pending.current = true; setBusy(true); setError(""); setPersistentError(false); const current = () => alive.current && life === generation.current && pendingAction.current === action;
    try {
      await work(current);
      const prior=uncertainty?uncertainWritesRef.current[uncertainty.key]:undefined,ack=uncertainty?.confirmed();
      if(current() && uncertainty && prior && (prior.expectedVersion===null?ack===true:typeof ack==="number"&&Number.isSafeInteger(ack)&&ack>prior.expectedVersion)) {
        const next={...uncertainWritesRef.current}; delete next[uncertainty.key];
        uncertainWritesRef.current=next; setUncertainWrites(next);
      }
      return current();
    } catch (cause) {
      if (current()) {
        if(uncertainty){const before=uncertainWritesRef.current[uncertainty.key];const version=uncertainty.expectedVersion===null?null:Math.max(uncertainty.expectedVersion,before?.expectedVersion??0);const next={...uncertainWritesRef.current,[uncertainty.key]:{label:uncertainty.label,expectedVersion:version}};uncertainWritesRef.current=next;setUncertainWrites(next);}
        reportFailure(cause);
      }
      return false;
    }
    finally { if (pendingAction.current === action) { if (current()) setBusy(false); pendingAction.current = null; pending.current = false; } }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (pending.current || locked || disabled || !loaded || !message.trim()) return;
    const attempt = messageAttempt ?? { operationId: chatDraft.draftId, body: message.trim(), createdAt: new Date().toISOString(), state: "pending" as const }; if (!setMessageAttempt({ ...attempt, state: "pending" })) { setMessageAttempt({ ...attempt, state: "failed" }); return; }
    const saved = await perform(async current => { const result = await sendHubMessage(stableProject, owner, attempt.body, attempt.operationId); if (!current()) return; setData(previous => ({ ...previous, messages: [...previous.messages.filter(item => item.messageId !== result.message.messageId), result.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) })); clearChatDraft();  }, attempt.operationId);
    if (!saved && alive.current && !locked) setMessageAttempt(previous => previous?.operationId === attempt.operationId ? { ...previous, state: "failed" } : previous);
  }
  async function sendRequest(event: FormEvent) {
    event.preventDefault(); if (pending.current || locked || disabled || !loaded || !requestBody.trim()) return;
    const attempt = requestAttempt ?? { operationId: crypto.randomUUID(), type: requestType, body: requestBody.trim(), photoId: requestPhoto, ...(requestType === "support" ? { attachmentIds: requestAttachments } : {}) }; setRequestAttempt(attempt);
    await perform(async current => { const result = await createHubSupportRequest(stableProject, owner, attempt); if (!current()) return; setData(previous => ({ ...previous, requests: [result.request, ...previous.requests.filter(item => item.requestId !== result.request.requestId)] })); setSelectedRequestId(result.request.requestId); setRequestBody(""); setRequestAttachments([]); setRequestPhoto(null); setRequestAttempt(null); setRequestType("support"); void cooldown.refresh(); });
  }
  async function changeVisibility(channel: "requests", action: "hide" | "restore", request?: HubSupportRequest, previous?: HubConversationVisibility) {
    const currentRecord = previous ?? visibility.find(item => item.channel === channel && item.requestId === request?.requestId);
    const requestId = request?.requestId ?? previous?.requestId;
    if (action === "hide" && !!supportDrafts[requestId!]?.body.trim() && !await confirm("Hide this conversation for you? Your unsent draft stays in this workspace until you leave.")) return;
    const life = generation.current, revision = selectionRevision.current, selectedBefore = selectedRequestId;
    let acknowledgedVersion:number|undefined;
    const saved = await perform(async current => {
      if (owner && request && action === "hide") { setOwnerAction({ requestId: request.requestId, version: request.version, kind: "hide", activityKey: requestActivityKey(request.requestId) }); setSelectedRequestId(null); }
      const result = await setHubConversationVisibility(stableProject, owner, { operationId: crypto.randomUUID(), channel, ...(requestId ? { requestId } : {}), expectedVersion: currentRecord?.version ?? 0, action, ...(action === "hide" ? { capturedRequestVersion: request!.version } : {}) });
      if (!current()) return;
      if(result.visibility.requestId!==requestId || result.visibility.channel!==channel || result.visibility.hidden!==(action==="hide") || action==="hide"&&result.visibility.capturedRequestVersion!==request?.version)throw Error("The request visibility change was not confirmed for this conversation.");
      acknowledgedVersion=result.visibility.version;
      setData(data => ({ ...data, visibility: [...(data.visibility ?? []).filter(item => item.visibilityId !== result.visibility.visibilityId), result.visibility] }));
      if (!owner) setSelectedRequestId(null);
      setNotice(action === "hide" ? "Hidden Successfully" : "Restore Successful");
    }, undefined, {key:JSON.stringify([stableProject.clientId,stableProject.projectId,owner,accountKey,"visibility",channel,requestId,action,action==="hide"?request?.version:null]),label:"Request visibility",expectedVersion:currentRecord?.version??0,confirmed:()=>acknowledgedVersion});
    if (owner && alive.current && life === generation.current) {
      setOwnerAction(previous => previous?.requestId === requestId ? null : previous);
      if (!saved && selectionRevision.current === revision) setSelectedRequestId(selectedBefore);
    }
  }

  async function uploadPhoto(event: FormEvent) {
    event.preventDefault(); if (pending.current || locked || disabled || !loaded || !photoFiles.length) return;
    if (photoFiles.length > 50 || photoFiles.reduce((sum, file) => sum + file.size, 0) > HUB_ZIP_MAX_BYTES || photoFiles.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size <= 0)) { setPersistentError(true); setError("Choose up to 50 JPG, PNG or WebP photos, each up to 10 MB and up to 100 MB per batch."); return; }
    if (!photoAttempt && photoNames.some((value, index) => value?.trim() && (value.trim().length + (photoFiles[index]?.type === "image/webp" ? 5 : 4) > 42 || /[\\/\u0000-\u001f\u007f]/.test(value) || [".", ".."].includes(value.trim())))) { setPhotoNameError("Use simple photo names up to 42 characters including the extension, without slashes."); return; }
    const attempt = photoAttempt ?? { entries: photoFiles.map((file, index) => ({ file, photoId: crypto.randomUUID(), ...(photoNames[index]?.trim() ? { nameStem: photoNames[index].trim() } : {}) })), completed: [], caption: photoCaption.trim(), folder: photoFolder.trim() }; setPhotoAttempt(attempt); uploadCancelled.current = false;
    await perform(async current => {
      const completed = [...attempt.completed];
      for (const entry of attempt.entries) {
        if (!current() || uploadCancelled.current) return;
        if (completed.includes(entry.photoId)) continue;
        const result = await uploadHubPhoto(stableProject, entry.file, attempt.caption, entry.photoId, attempt.folder, entry.nameStem);
        if (!current()) return;
        completed.push(entry.photoId); setPhotoAttempt({ ...attempt, completed: [...completed] }); setData(previous => ({ ...previous, photos: [result.photo, ...previous.photos.filter(item => item.photoId !== result.photo.photoId)] }));
      }
      if (!current()) return;
      setPhotoFiles([]); setPhotoNames([]); setPhotoCaption(""); setPhotoFolder(""); setPhotoAttempt(null); if (fileInput.current) fileInput.current.value = ""; setNotice("Saved Successfully"); void getHubCommissionFolders(stableProject).then(value => { if (current()) setFolders(value); }).catch(() => { if (current()) setFolderError("Photos were shared, but folder history could not be refreshed. Refresh before creating another folder."); });
    });
  }
  async function replyRequest(request: HubSupportRequest, body: string, operationId: string, attachmentIds?: string[]) {
    const saved = await perform(async current => {
      const result = await replyHubSupportRequest(request, owner, body, operationId, attachmentIds); if (!current()) return;
      setHistoryRequests(previous => mergeSupportRequests(previous, [result.request]));
      setData(previous => ({ ...previous, requests: mergeSupportRequests(previous.requests, [result.request]), requestReplies: mergeSupportReplies(previous.requestReplies ?? [], [result.reply]) }));
      setSupportDrafts(previous => previous[request.requestId]?.attempt?.operationId === operationId ? { ...previous, [request.requestId]: emptySupportReplyDraft() } : previous);
    });
    if (!saved && alive.current && !locked) setSupportDrafts(previous => { const draft = previous[request.requestId]; return draft?.attempt?.operationId === operationId ? { ...previous, [request.requestId]: { ...draft, attempt: { ...draft.attempt, state: "failed" } } } : previous; });
    return saved;
  }
  async function verifySelectedRequest(requestId: string) {
    const request = new AbortController(), life = generation.current;
    threadNavigation.current?.abort(); threadNavigation.current = request;
    try {
      const result = await loadHubSupportRequest(stableProject, owner, requestId, request.signal);
      if (!alive.current || request.signal.aborted || life !== generation.current) return;
      setHistoryRequests(previous => mergeSupportRequests(previous, [result]));
      if (result.status !== "resolved") setArchiveOpen(false);
    } catch (cause) { if (alive.current && !request.signal.aborted && life === generation.current) reportFailure(cause); }
  }
  async function changeRequestStatus(request: HubSupportRequest, status: HubSupportRequest["status"]) {
    if (pending.current || locked || disabled) return false;
    const life = generation.current, revision = selectionRevision.current, selectedBefore = selectedRequestId;
    let acknowledgedVersion:number|undefined;
    const saved = await perform(async current => {
      if (owner) { setOwnerAction({ requestId: request.requestId, version: request.version, kind: "status", status }); if (status !== "open") setSelectedRequestId(null); }
      const result = await setHubSupportRequestStatus(request, owner, status); if (!current()) return; acknowledgedVersion=result.request.version;
      setHistoryRequests(previous => mergeSupportRequests(previous, [result.request]));
      setData(previous => ({ ...previous, requests: mergeSupportRequests(previous.requests, [result.request]) }));
      if (status === "resolved") setSelectedRequestId(null);
      else if (request.status === "resolved") { historyController.current?.abort(); setArchiveOpen(false); setSelectedRequestId(request.requestId); }
      setNotice("Saved Successfully");
    }, undefined, {key:JSON.stringify([stableProject.clientId,stableProject.projectId,owner,accountKey,"request-status",request.requestId,status]),label:"Request status",expectedVersion:request.version,confirmed:()=>acknowledgedVersion});
    if (owner && alive.current && life === generation.current) { setOwnerAction(previous => previous?.requestId === request.requestId ? null : previous); if (!saved && selectionRevision.current === revision) setSelectedRequestId(selectedBefore); }
    // An old archived case may fall outside the live200. Refresh its version after an uncertain conflict.
    if (!saved && alive.current && !locked && life === generation.current) await verifySelectedRequest(request.requestId);
    return saved;
  }
  const hasOlderRequests = requestCursor === undefined ? data.requests.length >= 200 : !!requestCursor;
  const hasOlderReplies = replyCursor === undefined ? (data.requestReplies?.length ?? 0) >= 200 : !!replyCursor;
  async function loadHistory(kind: "requests" | "replies") {
    if (historyController.current && !historyController.current.signal.aborted || locked || disabled) return;
    const request = new AbortController(), life = generation.current; historyController.current = request; setHistoryLoading(true);
    const rows = kind === "requests" ? data.requests.map(item => ({ createdAt: item.createdAt, id: item.requestId })) : (data.requestReplies ?? []).map(item => ({ createdAt: item.createdAt, id: item.replyId }));
    const cursor = kind === "requests" ? requestCursor : replyCursor;
    const before = cursor === undefined ? rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).at(-1) : cursor;
    try {
      if (kind === "requests") {
        const result = await loadHubSupportRequestPage(stableProject, owner, before, request.signal);
        if (!alive.current || request.signal.aborted || life !== generation.current) return;
        setHistoryRequests(previous => mergeSupportRequests(previous, result.items)); setRequestCursor(result.next);
      } else {
        const result = await loadHubSupportReplyPage(stableProject, owner, before, request.signal);
        if (!alive.current || request.signal.aborted || life !== generation.current) return;
        setHistoryReplies(previous => mergeSupportReplies(previous, result.items)); setReplyCursor(result.next);
      }
    } catch (cause) { if (!request.signal.aborted && alive.current && life === generation.current) reportFailure(cause); }
    finally { if (historyController.current === request) { historyController.current = null; if (alive.current) setHistoryLoading(false); } }
  }
  async function saveStudio(notes: string, materials: HubMaterialRequirement[], baseline: HubPrivateWorkspace | null) { let saved: HubPrivateWorkspace | null = null; await perform(async current => { const result = await saveHubPrivateWorkspace(stableProject, baseline, notes, materials); if (!current()) return; if(result.workspace.notes!==notes.trim() || JSON.stringify(result.workspace.materials.map(item=>[item.inventoryItemId,item.requiredQuantity]))!==JSON.stringify(materials.map(item=>[item.inventoryItemId,item.requiredQuantity])))throw Error("The private workspace response did not confirm these notes and materials."); saved = result.workspace; setData(previous => ({ ...previous, privateWorkspace: result.workspace })); setStudioDirty(false); setNotice("Saved Successfully"); }, undefined, {key:JSON.stringify([stableProject.clientId,stableProject.projectId,owner,accountKey,"studio",notes.trim(),materials.map(item=>[item.inventoryItemId,item.requiredQuantity])]),label:"Private studio notes/materials",expectedVersion:baseline?.version??0,confirmed:()=>saved?.version}); return saved; }
  async function discardAttempt(kind: "message" | "request" | "photo") {
    if (pending.current || !await confirm("An earlier attempt may already have reached the server. Clear this draft and check saved updates before starting a new one?")) return;
    if (kind === "message") { clearChatDraft(); } if (kind === "request") { setRequestBody(""); setRequestAttachments([]); setRequestPhoto(null); setRequestAttempt(null); setRequestType("support"); } if (kind === "photo") { setPhotoFiles([]); setPhotoNames([]); setPhotoCaption(""); setPhotoFolder(""); setPhotoAttempt(null); if (fileInput.current) fileInput.current.value = ""; } void refresh();
  }
  async function confirmDeletePhoto() {
    if (!deletePhoto || pending.current || locked || disabled) return;
    const target = deletePhoto;
    let deletionConfirmed=false;
    await perform(async current => {
      await deleteHubFileCopy(stableProject, owner, { kind: "photo", fileId: target.photoId });
      if (!current()) return;
      deletionConfirmed=true;
      setData(previous => ({ ...previous, photos: previous.photos.filter(item => item.photoId !== target.photoId) }));
      setActivePhotoId(previous => previous === target.photoId ? null : previous); setDeletePhoto(null);
      setNotice("Your photo copy was deleted. The other person’s copy is unchanged.");
    }, undefined, {key:JSON.stringify([stableProject.clientId,stableProject.projectId,owner,accountKey,"photo-copy",target.photoId]),label:"Photo-copy change",expectedVersion:null,confirmed:()=>deletionConfirmed?true:undefined});
  }
  async function downloadFolder(folderName: string, uploadDate: string) {
    if (zipController.current || locked || disabled) return;
    const request = new AbortController(), life = generation.current; zipController.current = request; setZipProgress("Checking folder…"); setError("");
    try {
      const photos = await listHubPhotoFolder(stableProject, owner, { folderName, uploadDate }, request.signal); request.signal.throwIfAborted();
      if (!photos.length || photos.length > HUB_ZIP_MAX_FILES || photos.reduce((sum, photo) => sum + photo.size, 0) > HUB_ZIP_MAX_BYTES) throw new Error("Choose a folder with 1–200 photos up to 100 MB.");
      const entries: { name: string; blob: Blob }[] = []; let bytes = 0;
      for (const photo of photos) {
        request.signal.throwIfAborted(); if (!alive.current || life !== generation.current) return;
        setZipProgress(`Preparing ${entries.length + 1} of ${photos.length} photos…`);
        const blob = await loadHubPhotoBlob(photo, owner, request.signal); bytes += blob.size; if (bytes > HUB_ZIP_MAX_BYTES) throw new Error("This folder exceeds the 100 MB ZIP limit.");
        entries.push({ name: `${safeArchiveName(folderName || project.title)}/${safeArchiveName(uploadDate)}/${safeArchiveName(photo.fileName)}`, blob });
      }
      const blob = await createPhotoZip(entries, request.signal); await verifyHubFileCopies(stableProject, owner, photos.map(photo => ({ kind: "photo" as const, fileId: photo.photoId })), request.signal); if (!alive.current || life !== generation.current || request.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${safeArchiveName(project.title)}-${safeArchiveName(folderName || "progress")}-${uploadDate}.zip`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`${photos.length} photos prepared in a private folder ZIP.`);
    } catch (cause) { if (alive.current && life === generation.current && !request.signal.aborted) reportFailure(cause); }
    finally { if (zipController.current === request) zipController.current = null; if (alive.current && life === generation.current) setZipProgress(""); }
  }
  const trackingUrl = safeTrackingUrl(project.trackingUrl), shipped = ["shipped", "delivered"].includes(project.status);
  const trelloUrl = project.trelloUrl && /^https:\/\/trello\.com\/c\/[A-Za-z0-9]{8,}(?:\/[A-Za-z0-9_-]+)?\/?$/.test(project.trelloUrl) ? project.trelloUrl : null;
  const unread = (channel: HubNotification["channel"]) => notificationRows.filter(item => item.recipientRole === myRole && item.channel === channel).reduce((count, item) => count + Math.max(0, item.version - item.readVersion), 0);
  const hiddenSupport = visibility.filter(item => item.hidden && conversationHidden(item, allRequests.find(request => request.requestId === item.requestId)?.version ?? item.capturedRequestVersion ?? 0));
  const hasDeleted = hiddenSupport.length > 0;
  useEffect(() => { let active = true; if (tab === "deleted" && !hasDeleted) void Promise.resolve().then(() => { if (active) setTab("support"); }); return () => { active = false; }; }, [tab, hasDeleted]);
  const tabs: { value: Tab; label: string; count?: number }[] = [{ value: "overview", label: "Overview" }, { value: "chat", label: "Maker Chat", count: unread("chat") }, { value: "photos", label: "Photos", count: unread("photos") }, { value: "support", label: "Requests", count: unread("requests") }, ...(hasDeleted ? [{ value: "deleted" as const, label: "Deleted" }] : []), ...(owner ? [{ value: "studio" as const, label: "Studio notes" }] : [])];
  const photoGroups = Object.values(data.photos.reduce<Record<string, { folderName: string; day: string; photos: HubPhoto[] }>>((groups, photo) => { const day = photo.createdAt.slice(0, 10), folderName = photo.folderName ?? "", key = folderName; (groups[key] ??= { day, folderName, photos: [] }).photos.push(photo); return groups; }, {})).sort((a, b) => b.day.localeCompare(a.day) || a.folderName.localeCompare(b.folderName));
  const shownPhotos = data.photos.slice(0, visiblePhotos), clientName = clientNickname && clientNickname !== clientDisplayName ? `${clientDisplayName} (${clientNickname})` : clientDisplayName;
  const stages = getProjectMilestones(project);
  const visibleStages = stages.map((stage, index) => ({ stage, index })).filter(({ stage }) => stages.filter(node => !node.hidden).length < 3 || !stage.hidden);
  const selectedStage = stages.findIndex(stage => stage.id === project.activeMilestoneId);
  const statusStage = stages.findIndex(stage => stage.status === project.status);
  const activeStage = selectedStage >= 0 ? selectedStage : statusStage >= 0 ? statusStage : Math.max(0, stages.findIndex(stage => stage.status === "in-progress"));
  function receipt(item: HubMessage) { const cursor = notificationRows.find(row => row.channel === "chat" && row.recipientRole === (item.senderRole === "owner" ? "client" : "owner")); return cursor?.throughCreatedAt && cursor.readAt && cursor.throughCreatedAt >= item.createdAt ? `Read · ${timeText(cursor.readAt)}` : `Sent · ${timeText(item.createdAt)}`; }
  function renderRequest(request: HubSupportRequest) {
    return <RequestCard key={request.requestId} request={request} replies={requestReplies.filter(item => item.requestId === request.requestId)} owner={owner} clientName={clientName} receiptCursor={notificationRows.find(item => item.channel === "requests" && item.recipientRole === otherRole && item.requestId === request.requestId)} busy={blocked} visible={tab === "support" && (request.status === "resolved" ? archiveOpen : !archiveOpen)} onHide={() => void changeVisibility("requests", "hide", request)} expanded={selectedRequestId === request.requestId} onToggle={() => { ++selectionRevision.current; threadNavigation.current?.abort(); const opening = selectedRequestId !== request.requestId; setSelectedRequestId(opening ? request.requestId : null); if (opening && !data.requests.some(item => item.requestId === request.requestId)) void verifySelectedRequest(request.requestId); }} onReply={replyRequest} onStatus={changeRequestStatus} onDraftChange={onReplyDraft} draftState={supportDrafts[request.requestId]} onDraftStateChange={onReplyState} overdue={supportRequestOverdue(request, clock)} onLoadOlder={hasOlderReplies ? () => void loadHistory("replies") : undefined} historyLoading={historyLoading} />;
  }
  return <section ref={heading} tabIndex={-1} className={styles.workspace} data-active-tab={tab} data-owner-workspace={owner ? "true" : undefined} aria-label={`${project.title} commission workspace`}>{confirmation}{photoNameError && <HubActionDialog title="Check the photo name" cancelLabel="Keep editing" onClose={() => setPhotoNameError("")}><p role="alert">{photoNameError}</p></HubActionDialog>}{/* Shared modal stays outside hidden tab panels. */}<MakerChatAttachments hideTrigger key={`${project.clientId}:${project.projectId}:${accountKey ?? ""}`} project={project} owner={owner} disabled={blocked || !loaded} onFailure={reportFailure} onDirtyChange={setAttachmentDirty} onBusyChange={setAttachmentBusy} openRequest={attachmentOpen} onUploaded={ids => { const target = attachmentTarget.current; if (target === "new") setRequestAttachments(ids); else if (target) onReplyState(target, { attachmentIds: ids }); attachmentTarget.current = null; }} />
    <div className={styles.workspaceNavigation}><div className={styles.tabs} role="tablist" aria-label="Commission sections">{tabs.map((item, index) => <button key={item.value} type="button" role="tab" id={`${baseId}-${item.value}-tab`} aria-selected={tab === item.value} aria-controls={`${baseId}-${item.value}-panel`} tabIndex={tab === item.value ? 0 : -1} className={styles.tab} onClick={() => selectTab(item.value)} onKeyDown={event => { let next = index; if (event.key === "ArrowRight") next = (index + 1) % tabs.length; else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = tabs.length - 1; else return; event.preventDefault(); selectTab(tabs[next].value); document.getElementById(`${baseId}-${tabs[next].value}-tab`)?.focus(); }}><Icon kind={item.value} /><span>{item.label}</span>{!!item.count && <small aria-label={`${item.count} unread ${item.value === "chat" ? "messages" : "updates"}`}>{item.count}</small>}</button>)}</div>
    <button type="button" className={styles.refreshButton} aria-label="Refresh" title="Refresh updates" disabled={loading || busy || locked} onClick={() => { readAttempts.current.clear(); checkUpdates(); if (tab === "support") void cooldown.refresh(); }}><Icon kind="refresh" /><span className={styles.srOnly}>Refresh</span></button></div>
    {notice && <div key={noticeState.revision} className={styles.notice} data-transient="notice" role="status"><Icon kind="check" /><span>{notice}</span><button type="button" className={styles.iconButton} aria-label="Dismiss workspace notice" onClick={() => setNotice("")}>×</button></div>}
    {deletePhoto && <HubActionDialog title="Delete your photo copy?" confirmLabel="Delete my copy" busy={busy} onClose={() => setDeletePhoto(null)} onConfirm={() => void confirmDeletePhoto()}><p>{deletePhoto.fileName}</p><p>This removes your access to this photo. The other person’s copy is unchanged. The stored file is not physically removed.</p>{error && <p role="alert">{error}</p>}</HubActionDialog>}
    {Object.keys(uncertainWrites).length > 0 && <p className={styles.retryNote} role="status">Still awaiting confirmation: {[...new Set(Object.values(uncertainWrites).map(item=>item.label))].join(", ")}. Check the saved state and finish the matching action before discarding this workspace. A refresh alone does not confirm these writes.</p>}
    {ownerAction && <p className={styles.notice} role="status">{ownerAction.kind === "hide" ? "Hiding for you…" : ownerAction.status === "closed" ? "Closing chat…" : "Saving chat status…"} Waiting for server confirmation.</p>}
    {error && <div key={error} className={styles.error} data-transient={!persistentError && !locked && loaded ? "error" : undefined} role="alert">{!locked && <button type="button" className={styles.iconButton} aria-label="Dismiss workspace error" onClick={() => setError("")}>×</button>}<strong>{locked ? "Your session needs attention" : "That could not be confirmed"}</strong><p>{error}</p>{!locked && <button type="button" className={styles.button} disabled={busy || loading} onClick={checkUpdates}>Check saved updates</button>}</div>}
    {disabled && <p className={styles.disabledNote}>Client access is suspended. Reactivate this client before adding new workspace activity.</p>}
    {!locked && <>
      <div role="tabpanel" id={`${baseId}-overview-panel`} aria-labelledby={`${baseId}-overview-tab`} hidden={tab !== "overview"} className={styles.panel}>
        {shipped && <section className={styles.shippingCard}><div><h3>Package Tracking</h3><p>{project.status === "delivered" ? "Your commission has been delivered! I hope you are as happy as I am" : "Your commission has shipped."}{project.status !== "delivered" && !trackingUrl && <> Check back soon for your tracking number and updates.</>}</p></div>{trackingUrl && <a className={styles.button} href={trackingUrl} target="_blank" rel="noopener noreferrer">Open tracking ↗</a>}</section>}
        <div className={styles.overviewHero}><div><p className={styles.eyebrow}>{owner ? "COMMISSION WORKSPACE" : "YOUR COMMISSION"}</p><h2>{project.title}</h2></div><div className={styles.informationLabels}><InformationTags tags={project.informationTags} order={project.labelOrder} localDefinitions={project.localLabelDefinitions} /></div></div>
        <p className={styles.summary}>{project.summary.trim() || "Your commission details will appear here live as updates happen"}</p>
        {project.trackingEnabled !== false && <section className={styles.progressSection}><div className={styles.row}><h3>From idea to doorstep</h3><PresentedStatus className={styles.badge} status={project.status} /></div>{visibleStages.length > 0 && <div className={styles.milestones} role="region" aria-label="Commission milestones" tabIndex={0}>{visibleStages.map(({ stage, index }, visibleIndex) => <div key={stage.id} data-current={index === activeStage} data-complete={index < activeStage || project.status === "delivered"} aria-current={index === activeStage ? "step" : undefined}><span>{index < activeStage || project.status === "delivered" ? <Icon kind="check" /> : visibleIndex + 1}</span><small>{stage.label}</small></div>)}</div>}</section>}
        {trelloUrl && <section className={styles.tracking}><div><h3>Trello project card</h3><p>{project.progressSource === "trello" ? "Last progress update received from Trello. Access depends on Taylor’s sharing settings." : "Linked card. Progress is currently managed in this studio; access depends on Taylor’s sharing settings."}</p></div><a className={styles.button} href={trelloUrl} target="_blank" rel="noopener noreferrer">Open Trello card ↗</a></section>}
        <p className={styles.caption}>Commission last updated {clientUpdateDate(project.updatedAt)}.</p>
      </div>
      <div role="tabpanel" id={`${baseId}-chat-panel`} aria-labelledby={`${baseId}-chat-tab`} hidden={tab !== "chat"} className={`${styles.panel} ${styles.chatPanel}`}>
        <div className={styles.panelHeading}><div><h2>Maker Chat</h2><p>A shared place for the little details that make it yours.</p></div><div className={styles.supportActions}><span className={`${styles.badge} ${styles.connectionBadge}`} data-connection={connectionState} role="status" aria-label={`Private messaging: ${connectionState === "connected" ? "connected" : connectionState === "connecting" ? "connecting" : "disconnected"}`} title={connectionState === "connected" ? "Connected" : connectionState === "connecting" ? "Checking connection" : "Disconnected"}>Private messaging</span><button type="button" className={styles.composerAttachment} aria-label="Shared attachments" title="Shared attachment history" aria-haspopup="dialog" disabled={busy || cooldownBusy || locked || disabled || !loaded} onClick={event => { attachmentTarget.current = null; setAttachmentOpen(previous => ({ sequence: (previous?.sequence ?? 0) + 1, mode: "history", trigger: event.currentTarget })); }}><AttachmentPaperclip /></button></div></div>
        <div ref={chatLog} className={styles.chatLog} onScroll={onChatScroll} role="log" aria-label="Maker Chat messages" aria-live="polite" aria-relevant="additions">{data.messages.length ? data.messages.map(item => { const own = item.senderRole === myRole; return <article className={styles.message} data-own={own} data-sender-role={item.senderRole} key={item.messageId}><div><strong>{item.senderRole === "owner" ? "Taylor" : owner ? clientName : clientNickname || "You"}</strong><time dateTime={item.createdAt}>{timeText(item.createdAt)}</time></div><p>{item.attachmentIds?.length ? <button type="button" className={styles.attachmentMessage} disabled={blocked || !loaded} aria-haspopup="dialog" aria-label={`Open ${item.attachmentIds.length} shared attachment${item.attachmentIds.length === 1 ? "" : "s"}`} onClick={event => { attachmentTarget.current = null; setAttachmentOpen(previous => ({ sequence: (previous?.sequence ?? 0) + 1, mode: "history", batchId: item.messageId, attachmentIds: item.attachmentIds, trigger: event.currentTarget })); }}>{item.body}</button> : item.body}</p>{own && <small className={styles.receipt}>{receipt(item)}</small>}</article>; }) : !messageAttempt && <div className={styles.empty}><Icon kind="chat" /><h3>Start a conversation.</h3><p>Questions, ideas and quick check-ins belong here.</p></div>}{messageAttempt && !data.messages.some(item => item.messageId === messageAttempt.operationId) && <article className={styles.message} data-own="true" data-sender-role={myRole} data-pending="true"><div><strong>You</strong><time dateTime={messageAttempt.createdAt}>{timeText(messageAttempt.createdAt)}</time></div><p>{messageAttempt.body}</p><small className={styles.receipt}>{messageAttempt.state === "pending" ? "Sending…" : "Not confirmed · retry below"}</small></article>}</div>
        {data.messages.length >= 200 && <p className={styles.caption}>Showing the newest 200 messages. Older messages remain saved.</p>}
        <form ref={composer} className={styles.composer} onKeyDown={guardFormEnter} onSubmit={event => void sendMessage(event)}><label htmlFor={`${baseId}-message`}>Message {owner ? "your client" : "Taylor"}</label><div className={styles.composerInput}><textarea id={`${baseId}-message`} onKeyDown={submitComposerOnEnter} rows={2} maxLength={4000} value={message} readOnly={!!messageAttempt} disabled={blocked || !loaded} onChange={event => setMessage(event.target.value)} placeholder="No Awooo - $350 fine" required /></div><div className={styles.formFooter}><span className={styles.caption}>Enter sends · Shift+Enter adds a line. {chatDraft.problem || (message && chatDraft.durable ? "Unsent text saved on this browser." : "")}</span><div className={styles.composerActions}><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={blocked || !loaded || !message.trim()}>{busy ? "Sending…" : messageAttempt ? "Retry message" : "Send Awoo"}</button><button type="button" className={styles.composerAttachment} aria-label="Attach files" aria-haspopup="dialog" disabled={busy || cooldownBusy || locked || disabled || !loaded} onClick={event => { attachmentTarget.current = null; setAttachmentOpen(previous => ({ sequence: (previous?.sequence ?? 0) + 1, mode: "upload", trigger: event.currentTarget })); }}><AttachmentPaperclip /></button></div></div>{chatDraft.problem && <button type="button" className={styles.textButton} disabled={busy || locked} onClick={chatDraft.retry}>Retry browser draft storage</button>}{messageAttempt?.state === "failed" && !busy && <div className={styles.retryNote}>An earlier send was not confirmed. Retry uses the same message, so it cannot create a duplicate.<button type="button" className={styles.textButton} onClick={() => discardAttempt("message")}>Clear this draft</button></div>}</form>
      </div>
      <div role="tabpanel" id={`${baseId}-photos-panel`} aria-labelledby={`${baseId}-photos-tab`} hidden={tab !== "photos"} className={styles.panel}>
        <div className={styles.panelHeading}><div><h2>Progress photos</h2><p>The latest little milestones.</p></div><span className={styles.badge}>{data.photos.length} photos</span></div>
        {owner && <form className={styles.uploadForm} onKeyDown={guardFormEnter} onSubmit={event => void uploadPhoto(event)}><label>Choose progress photos<input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={blocked || !loaded || !!photoAttempt} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; setPhotoFiles(files); setPhotoNames(readStudioSettings() ? files.map(file => readStudioSettings()?.photoNamingMode === "original" ? file.name.replace(/\.[^.]+$/, "") : "") : []); }} /></label><label>Or choose a photo folder<input type="file" multiple {...{ webkitdirectory: "", directory: "" }} accept="image/jpeg,image/png,image/webp" disabled={blocked || !loaded || !!photoAttempt} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; setPhotoFiles(files); setPhotoNames(readStudioSettings() ? files.map(file => readStudioSettings()?.photoNamingMode === "original" ? file.name.replace(/\.[^.]+$/, "") : "") : []); if (files[0]) setPhotoFolder(files[0].webkitRelativePath.split("/")[0] ?? ""); }} /></label>{photoFiles.length > 0 && <ProgressPhotoQueue files={photoFiles} names={photoNames} disabled={!!blocked || !!photoAttempt} onChange={(files, names) => { setPhotoFiles(files); setPhotoNames(names); }} />}<fieldset className={styles.savedFolderField} disabled={blocked || !!photoAttempt || folderBusy}><label htmlFor={`${baseId}-saved-folder`}>Saved commission folder</label><SiteSelect id={`${baseId}-saved-folder`} value={folders?.folderNames.includes(photoFolder) ? photoFolder : ""} onChange={value => { if (!blocked && !photoAttempt && !folderBusy) setPhotoFolder(value); }} options={[{ value: "", label: "Unfiled photos / new folder" }, ...(folders?.folderNames ?? []).map(name => ({ value: name, label: name }))]} /></fieldset><label>Folder name<input maxLength={80} value={photoFolder} onChange={event => setPhotoFolder(event.target.value)} disabled={blocked || !!photoAttempt || folderBusy} placeholder="Optional new folder name" /></label><button type="button" className={styles.button} disabled={blocked || folderBusy || !folders || !photoFolder.trim() || folders.folderNames.includes(photoFolder.trim())} onClick={async () => { if (!folders) return; setFolderBusy(true); setFolderError(""); try { setFolders(await createHubCommissionFolder(stableProject, photoFolder.trim(), folders.version)); } catch { setFolderError("Folder save was not confirmed. Refresh the workspace to check before retrying."); } finally { setFolderBusy(false); } }}>{folderBusy ? "Saving folder…" : "Create reusable folder"}</button>{folderError && <p role="alert" className={styles.inlineError}>{folderError}</p>}<label>Caption<input maxLength={1000} value={photoCaption} onChange={event => setPhotoCaption(event.target.value)} disabled={blocked || !!photoAttempt} placeholder="For example, the first fitting of your head base" /></label><div className={styles.formFooter}><span className={styles.caption}>{photoAttempt ? `${photoAttempt.completed.length}/${photoAttempt.entries.length} confirmed · retries keep the same file IDs` : `${photoFiles.length} selected · up to 50 photos, 10 MB each, 100 MB per batch`}. Names left blank are numbered automatically for this commission.</span><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={blocked || !loaded || !photoFiles.length}>{busy ? <><span className={styles.photoSpinner} aria-hidden="true" />Sharing photos…</> : photoAttempt ? "Resume / retry photos" : "Share photos"}</button></div>{busy && photoAttempt && <button type="button" className={styles.button} onClick={() => { uploadCancelled.current = true; setNotice("Stopping after the current photo finishes. Confirmed photos stay saved; resume when ready."); }}>Cancel remaining uploads</button>}{photoAttempt && !busy && <div className={styles.retryNote}>Confirmed photos stay saved. Resume checks the same file IDs without duplicates.<button type="button" className={styles.textButton} onClick={() => discardAttempt("photo")}>Clear this upload</button></div>}</form>}
        {zipProgress && <div className={styles.zipProgress} role="status"><span>{zipProgress}</span><button type="button" className={styles.button} onClick={() => zipController.current?.abort()}>Cancel ZIP</button></div>}
        {photoGroups.length ? photoGroups.map(group => <section key={`${group.day}:${group.folderName}`} className={styles.photoGroup}><header className={styles.folderHeading}><div><h3>{group.folderName || "Progress photos"}</h3><p>{group.photos.length} shared photo{group.photos.length === 1 ? "" : "s"} · latest {makerTime(group.photos[0].createdAt)}</p></div><button type="button" className={styles.button} disabled={!!zipProgress || locked || disabled} aria-label={`Download ${group.folderName || "Progress photos"} folder as ZIP`} title="Download folder (.zip)" onClick={() => void downloadFolder(group.folderName, group.day)}><DownloadIcon /></button></header>{tab === "photos" && <div className={styles.photoGrid}>{group.photos.filter(photo => shownPhotos.some(shown => shown.photoId === photo.photoId)).map(photo => <PhotoTile key={photo.photoId} photo={photo} project={stableProject} owner={owner} onDeleteCopy={() => setDeletePhoto(photo)} onFailure={reportFailure} onOpen={trigger => { lightboxTrigger.current = trigger; setActivePhotoId(photo.photoId); }} />)}</div>}</section>) : <div className={styles.empty}><SpadeMark /><h3>The story is just starting.</h3><p>{owner ? "Share the first progress photos when you are ready." : "Taylor’s progress photos will appear here as your character takes shape."}</p></div>}
        {visiblePhotos < data.photos.length && <button type="button" className={styles.button} onClick={() => setVisiblePhotos(count => count + 12)}>Load 12 more photos</button>}
        {data.photos.length >= 200 && <p className={styles.caption}>Showing the newest 200 photos. Folder ZIPs check the complete folder separately and support up to 200 photos / 100 MB.</p>}

        {tab === "photos" && <PhotoLightbox project={stableProject} photos={data.photos} activeId={activePhotoId} owner={owner} onChange={setActivePhotoId} onClose={() => setActivePhotoId(null)} onFailure={reportFailure} trigger={lightboxTrigger} />}
      </div>
      <div role="tabpanel" id={`${baseId}-support-panel`} aria-labelledby={`${baseId}-support-tab`} hidden={tab !== "support"} className={styles.panel}>
        <div className={styles.panelHeading}><div><h2>Requests & support</h2><p>{owner ? "Keep track of what your client needs." : "Need an update or a little help? Leave a request for Taylor."}</p></div><div className={styles.supportActions}><span className={styles.badge} data-state="open">{currentRequests.filter(item => item.status === "open").length} open</span><button type="button" className={styles.button} disabled={!loaded || locked} aria-haspopup="dialog" onClick={() => { threadNavigation.current?.abort(); setSelectedRequestId(null); setArchiveOpen(true); }}>Archive{archivedRequests.length ? ` (${archivedRequests.length})` : ""}</button></div></div>
        {owner && <UpdateRequestCooldownControl project={stableProject} value={cooldown.value} onSaved={cooldown.accept} onReload={() => void cooldown.refresh()} onBusyChange={setCooldownBusy} onDirtyChange={setCooldownDirty} onFailure={cause => { if (sessionFailure(cause)) reportFailure(cause); }} disabled={blocked || !loaded} />}
        {cooldown.error && <p className={styles.caption} role="status">Update timing could not be checked. <button type="button" className={styles.textButton} onClick={() => void cooldown.refresh()}>Check again</button></p>}
        {!owner && <form className={styles.form} data-request-composer onKeyDown={guardFormEnter} onSubmit={event => void sendRequest(event)}><div className={styles.requestChoices}>{[{ value: "support", label: "I need help" }, { value: "update", label: "Request an update" }].map(choice => <button type="button" key={choice.value} className={styles.button} aria-pressed={requestType === choice.value} disabled={blocked || !!requestAttempt} onClick={() => { setRequestType(choice.value as "support" | "update"); setRequestPhoto(null); }}>{choice.label}</button>)}</div><label className={styles.attachedField}>{requestType === "update" ? "What would you like an update on?" : "How can Taylor help?"}<textarea value={requestBody} onKeyDown={submitComposerOnEnter} rows={3} maxLength={4000} onChange={event => setRequestBody(event.target.value)} disabled={blocked || !loaded} readOnly={!!requestAttempt} required placeholder={requestType === "update" ? "Want to see how your commission is going?" : "How can I help?"} /></label><div className={styles.formFooter}><span className={styles.caption}>{requestType === "update" ? <CooldownCountdown value={cooldown.value} checkedAt={cooldown.checkedAt} /> : "Enter sends · Shift+Enter adds a line."}</span><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={blocked || !loaded || !requestBody.trim()}>{busy ? "Saving…" : requestAttempt ? "Retry request" : "Send request"}</button></div>{requestAttempt && !busy && <div className={styles.retryNote}>Retry checks the same request without creating another.<button type="button" className={styles.textButton} onClick={() => discardAttempt("request")}>Clear this draft</button></div>}</form>}
        <div className={styles.requestList}>{currentRequests.length ? currentRequests.map(renderRequest) : <div className={styles.empty}><Icon kind="support" /><h3>No current requests.</h3><p>Resolved conversations are in the archive.</p></div>}</div>
        {hasOlderRequests && <button type="button" className={styles.button} disabled={historyLoading || blocked} onClick={() => void loadHistory("requests")}>{historyLoading ? "Loading earlier requests…" : "Load earlier requests"}</button>}
        {archiveOpen && tab === "support" && <SupportArchiveDialog onClose={closeArchive} busy={busy} empty={!archivedRequests.length && !hasOlderRequests}><div className={styles.requestList}>{archivedRequests.length ? archivedRequests.map(renderRequest) : <p className={styles.emptySmall}>No resolved requests in the loaded history.</p>}</div>{error && <p role="alert" className={styles.inlineError}>{error}</p>}{hasOlderRequests && <button type="button" className={styles.button} disabled={historyLoading || blocked} onClick={() => void loadHistory("requests")}>{historyLoading ? "Loading earlier requests…" : "Load earlier requests"}</button>}</SupportArchiveDialog>}

      </div>
      <div role="tabpanel" id={`${baseId}-deleted-panel`} aria-labelledby={`${baseId}-deleted-tab`} hidden={tab !== "deleted"} className={styles.panel}>
        <div className={styles.panelHeading}><div><h2>Deleted · only your view</h2><p>Hidden support conversations.</p></div></div>
        {hiddenSupport.length ? <div className={styles.requestList}>{hiddenSupport.sort((a,b) => (b.hiddenAt ?? "").localeCompare(a.hiddenAt ?? "")).map(item => { const request = allRequests.find(row => row.requestId === item.requestId), hidden = conversationHidden(item, request?.version ?? item.capturedRequestVersion ?? 0); return <article key={item.visibilityId} className={styles.deletedRow}><div><strong>{request ? requestLabel[request.type] : "Support conversation"}</strong><p className={styles.caption}>Hidden {timeText(item.hiddenAt!)}{item.restoredAt ? ` · Restored ${timeText(item.restoredAt)}` : item.hidden && !hidden ? " · New activity: visible again" : ""}</p>{request && <p>{request.body}</p>}</div>{item.hidden && <button type="button" className={styles.button} disabled={blocked} onClick={() => void changeVisibility("requests", "restore", request, item)}>Restore for me</button>}</article>; })}</div> : <p className={styles.emptySmall}>Nothing hidden by you in this commission.</p>}
      </div>
      {owner && <div role="tabpanel" id={`${baseId}-studio-panel`} aria-labelledby={`${baseId}-studio-tab`} hidden={tab !== "studio"} className={styles.panel}>{loaded ? <><HubTimingDiagnostics /><StudioPanel project={project} previous={data.privateWorkspace} busy={blocked} onSave={saveStudio} onDirtyChange={setStudioDirty} /></> : <p className={styles.emptySmall}>Connect to the workspace before editing private notes.</p>}</div>}
    </>}
  </section>;
}
