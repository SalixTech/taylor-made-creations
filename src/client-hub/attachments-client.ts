"use client";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CLIENT_HUB_FUNCTIONS_REGION, ClientHubError, verifiedClientHubConnection } from "./client";
import { hubCallableOwnerSession } from "./callable-owner-session";
import { assertClientHubProjectId, clientHubObject, ClientHubDataError, decodeClientHubProject, type ClientHubProject } from "./model";
import { attachmentDate, decodeHubAttachment, HUB_ATTACHMENT_CHUNK_BYTES, HUB_ATTACHMENT_MAX_BYTES, HUB_ATTACHMENT_MAX_FILES, type HubAttachment, type HubAttachmentCursor, type HubAttachmentPage, type HubAttachmentProgress, type HubAttachmentRetention } from "./attachments-model";
export type { HubAttachment, HubAttachmentCursor, HubAttachmentPage, HubAttachmentProgress, HubAttachmentRetention } from "./attachments-model";
import { createAttachmentTransferQueue, type AttachmentPriority } from "./attachment-transfer-queue";
const aborted = () => new DOMException("Attachment request cancelled.", "AbortError");
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw aborted(); }
async function connection(project: ClientHubProject, owner: boolean, signal?: AbortSignal) {
  assertClientHubProjectId(project.projectId); checkAbort(signal);
  if (owner) { const session = await hubCallableOwnerSession(); session.assertCurrent(); return { auth: session.auth, functions: getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), assertCurrent: () => { checkAbort(signal); session.assertCurrent(); } }; }
  const session = await verifiedClientHubConnection(signal, false);
  if (session.session.clientId !== project.clientId) throw new ClientHubError("session-expired", "This commission is not part of your active Client Hub session.");
  return session;
}
async function call(project: ClientHubProject, owner: boolean, method: string, payload: unknown, signal?: AbortSignal, assertTransfer?: () => void) {
  assertTransfer?.();
  const session = await connection(project, owner, signal); session.assertCurrent(); assertTransfer?.();
  const response = await httpsCallable<unknown, unknown>(session.functions, method, { timeout: 120000 })(payload);
  session.assertCurrent(); assertTransfer?.(); return clientHubObject(response.data);
}
async function checksum(bytes: ArrayBuffer): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join(""); }
function base64(bytes: Uint8Array): string { let result = ""; for (let index = 0; index < bytes.length; index += 8192) result += String.fromCharCode(...bytes.subarray(index, index + 8192)); return btoa(result); }
function decodeBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value.length > Math.ceil(HUB_ATTACHMENT_CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new ClientHubDataError("The attachment chunk is invalid.");
  const decoded = atob(value), bytes = new Uint8Array(decoded.length); for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index); return bytes;
}
async function cancelBatch(project: ClientHubProject, owner: boolean, batchId: string, assertTransfer?: () => void): Promise<{ batchId: string; status: "cancelled" }> {
  assertClientHubProjectId(batchId);
  const result = await call(project, owner, "tmcHubCancelAttachmentBatch", { projectId: project.projectId, batchId }, undefined, assertTransfer);
  if (result.batchId !== batchId || result.status !== "cancelled") throw new ClientHubDataError("Attachment cancellation was not confirmed.");
  return { batchId, status: "cancelled" };
}
export async function cancelHubAttachmentBatch(project: ClientHubProject, owner: boolean, batchId: string): Promise<{ batchId: string; status: "cancelled" }> { return cancelBatch(project, owner, batchId); }
export type HubAttachmentUploadOptions = { batchId?: string; attachmentIds?: string[]; signal?: AbortSignal; onProgress?: (progress: HubAttachmentProgress) => void };
/** Files transfer sequentially, 256 KiB per authenticated call. Retain supplied
 * IDs for a retry after an ambiguous network failure. Abort cancels the whole
 * unpublished batch; a send already in commit cannot be withdrawn/deleted. */
export async function uploadHubAttachments(project: ClientHubProject, owner: boolean, files: File[], options: HubAttachmentUploadOptions = {}): Promise<{ batchId: string; attachments: HubAttachment[] }> {
  if (Array.isArray(files) && files.some(file => file.name.length > 42)) throw new ClientHubDataError("Use file names of 42 characters or fewer.");
  if (!Array.isArray(files) || files.length < 1 || files.length > HUB_ATTACHMENT_MAX_FILES || files.some(file => !Number.isSafeInteger(file.size) || file.size < 1 || file.size > HUB_ATTACHMENT_MAX_BYTES || !file.name.trim() || file.name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(file.name))) throw new ClientHubDataError("Choose up to 5 files, 20 MB each.");
  const batchId = options.batchId ?? crypto.randomUUID(), attachmentIds = options.attachmentIds ?? files.map(() => crypto.randomUUID()); assertClientHubProjectId(batchId);
  if (attachmentIds.length !== files.length || new Set(attachmentIds).size !== files.length) throw new ClientHubDataError("Choose a distinct identifier for each attachment."); attachmentIds.forEach(assertClientHubProjectId);
  const report = (index: number, uploadedBytes: number, phase: HubAttachmentProgress["phase"]) => options.onProgress?.({ attachmentId: attachmentIds[index], fileName: files[index].name, index, totalFiles: files.length, uploadedBytes, totalBytes: files[index].size, phase });
  checkAbort(options.signal); const transferSession = await connection(project, owner); transferSession.assertCurrent(); checkAbort(options.signal);
  let began = false, committing = false;
  try {
    const descriptors: { attachmentId: string; fileName: string; size: number; sha256: string }[] = [];
    for (let index = 0; index < files.length; index++) { transferSession.assertCurrent(); checkAbort(options.signal); report(index, 0, "hashing"); const sha256 = await checksum(await files[index].arrayBuffer()); transferSession.assertCurrent(); checkAbort(options.signal); descriptors.push({ attachmentId: attachmentIds[index], fileName: files[index].name, size: files[index].size, sha256 }); }
    transferSession.assertCurrent(); began = true;
    const begun = await call(project, owner, "tmcHubBeginAttachmentBatch", { batchId, projectId: project.projectId, files: descriptors }, options.signal, transferSession.assertCurrent);
    transferSession.assertCurrent();
    if (begun.batchId !== batchId || begun.chunkBytes !== HUB_ATTACHMENT_CHUNK_BYTES || !Array.isArray(begun.files) || begun.files.length !== files.length || !["staging", "committed"].includes(begun.status as string)) throw new ClientHubDataError("The attachment batch could not be verified.");
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex], saved = clientHubObject(begun.files[fileIndex]);
      if (saved.attachmentId !== attachmentIds[fileIndex] || saved.size !== file.size || !Number.isSafeInteger(saved.receivedBytes) || (saved.receivedBytes as number) < 0 || (saved.receivedBytes as number) > file.size || saved.receivedBytes !== file.size && (saved.receivedBytes as number) % HUB_ATTACHMENT_CHUNK_BYTES !== 0) throw new ClientHubDataError("The attachment upload position is invalid.");
      let offset = saved.receivedBytes as number; report(fileIndex, offset, "uploading");
      while (offset < file.size) {
        transferSession.assertCurrent(); checkAbort(options.signal);
        const bytes = new Uint8Array(await file.slice(offset, offset + HUB_ATTACHMENT_CHUNK_BYTES).arrayBuffer()), index = offset / HUB_ATTACHMENT_CHUNK_BYTES;
        const sha256 = await checksum(bytes.buffer); transferSession.assertCurrent(); checkAbort(options.signal);
        const response = await call(project, owner, "tmcHubUploadAttachmentChunk", { batchId, projectId: project.projectId, attachmentId: attachmentIds[fileIndex], index, offset, sha256, base64: base64(bytes) }, options.signal, transferSession.assertCurrent);
        transferSession.assertCurrent();
        if (response.attachmentId !== attachmentIds[fileIndex] || response.index !== index || response.receivedBytes !== offset + bytes.length) throw new ClientHubDataError("The attachment upload was not confirmed.");
        offset += bytes.length; report(fileIndex, offset, "uploading");
      }
    }
    transferSession.assertCurrent(); checkAbort(options.signal); committing = true; files.forEach((file, index) => report(index, file.size, "committing"));
    // A late Cancel cannot retract an atomic send. Await the actual outcome;
    // still verify role-scoped auth after the response, without abort masking it.
    transferSession.assertCurrent();
    const response = await call(project, owner, "tmcHubCommitAttachmentBatch", { batchId, projectId: project.projectId }, undefined, transferSession.assertCurrent);
    transferSession.assertCurrent();
    if (response.batchId !== batchId || !Array.isArray(response.attachments) || response.attachments.length !== files.length) throw new ClientHubDataError("The attachment send was not confirmed. Refresh before retrying.");
    const attachments = response.attachments.map(value => decodeHubAttachment(value, project));
    if (attachments.some((file, index) => file.attachmentId !== attachmentIds[index] || file.sha256 !== descriptors[index].sha256)) throw new ClientHubDataError("The sent attachment manifest did not match.");
    files.forEach((file, index) => report(index, file.size, "complete")); return { batchId, attachments };
  } catch (error) {
    if (began && !committing && options.signal?.aborted) {
      try { transferSession.assertCurrent(); await cancelBatch(project, owner, batchId, transferSession.assertCurrent); files.forEach((_, index) => report(index, 0, "cancelled")); }
      catch { /* Server abandonment expires after 24h; retained bytes remain within reserved quotas. */ }
    }
    throw error;
  }
}
function decodeRetention(value: unknown): HubAttachmentRetention {
  const raw = clientHubObject(value);
  if (!Number.isSafeInteger(raw.episode) || (raw.episode as number) < 0 || !Number.isSafeInteger(raw.expiredThroughEpisode) || (raw.expiredThroughEpisode as number) < -1 || (raw.expiredThroughEpisode as number) >= (raw.episode as number) || !["paused", "active", "legacy-needs-date"].includes(raw.state as string) || typeof raw.available !== "boolean" || raw.reason !== null && !["expired", "legacy-needs-date"].includes(raw.reason as string)) throw new ClientHubDataError("The attachment retention state is invalid.");
  return { episode: raw.episode as number, expiredThroughEpisode: raw.expiredThroughEpisode as number, state: raw.state as HubAttachmentRetention["state"], completedAt: raw.completedAt === null ? null : attachmentDate(raw.completedAt), expiresAt: raw.expiresAt === null ? null : attachmentDate(raw.expiresAt), available: raw.available, reason: raw.reason as HubAttachmentRetention["reason"] };
}
export async function listHubAttachments(project: ClientHubProject, owner: boolean, options: { cursor?: HubAttachmentCursor | null; limit?: number; batchId?: string; signal?: AbortSignal } = {}): Promise<HubAttachmentPage> {
  if (options.batchId) { assertClientHubProjectId(options.batchId); if (options.cursor) throw new ClientHubDataError("An exact attachment batch cannot use a history cursor."); }
  const maximum = options.batchId ? HUB_ATTACHMENT_MAX_FILES : options.limit ?? 30;
  const response = await call(project, owner, "tmcHubListAttachments", { projectId: project.projectId, limit: maximum, cursor: options.cursor ?? null, ...(options.batchId ? { batchId: options.batchId } : {}) }, options.signal);
  if (!Array.isArray(response.attachments) || response.attachments.length > maximum) throw new ClientHubDataError("The attachment page is invalid.");
  let nextCursor: HubAttachmentCursor | null = null;
  if (response.nextCursor !== null) { const raw = clientHubObject(response.nextCursor); assertClientHubProjectId(raw.attachmentId); nextCursor = { attachmentId: raw.attachmentId, createdAt: attachmentDate(raw.createdAt) }; }
  const attachments = response.attachments.map(value => decodeHubAttachment(value, project));
  if (new Set(attachments.map(item => item.attachmentId)).size !== attachments.length || options.batchId && (nextCursor !== null || attachments.length > HUB_ATTACHMENT_MAX_FILES || attachments.some(item => item.batchId !== options.batchId))) throw new ClientHubDataError("The attachment batch could not be verified.");
  return { attachments, nextCursor, retention: decodeRetention(response.retention) };
}
// One foreground and one background original maximum. No cached bytes or bearer URLs.
const transferQueue = createAttachmentTransferQueue();
async function verifiedAttachmentTransfer<T>(project: ClientHubProject, owner: boolean, attachment: HubAttachment, options: { signal?: AbortSignal; priority?: AttachmentPriority; onProgress?: (receivedBytes: number, totalBytes: number) => void }, consume: (bytes: Uint8Array<ArrayBuffer>, file: HubAttachment, assertCurrent: () => void) => T): Promise<T> {
  const file = decodeHubAttachment(attachment, project), transferSession = await connection(project, owner, options.signal);
  return transferQueue(options.priority ?? "interactive", async () => {
    transferSession.assertCurrent(); checkAbort(options.signal); const bytes = new Uint8Array(file.size);
    for (let offset = 0; offset < file.size; offset += HUB_ATTACHMENT_CHUNK_BYTES) {
      transferSession.assertCurrent();
      const index = offset / HUB_ATTACHMENT_CHUNK_BYTES, response = await call(project, owner, "tmcHubDownloadAttachmentChunk", { projectId: project.projectId, attachmentId: file.attachmentId, index }, options.signal, transferSession.assertCurrent), chunk = decodeBytes(response.base64);
      if (response.attachmentId !== file.attachmentId || response.index !== index || response.offset !== offset || response.size !== file.size || response.fileSha256 !== file.sha256 || response.fileName !== file.fileName || response.contentType !== "application/octet-stream" || response.contentDisposition !== "attachment" || chunk.length !== Math.min(HUB_ATTACHMENT_CHUNK_BYTES, file.size - offset) || await checksum(chunk.buffer) !== response.sha256) throw new ClientHubDataError("The attachment download could not be verified.");
      transferSession.assertCurrent(); checkAbort(options.signal); bytes.set(chunk, offset); options.onProgress?.(offset + chunk.length, file.size);
    }
    if (await checksum(bytes.buffer) !== file.sha256) throw new ClientHubDataError("The attachment checksum did not match.");
    // Hashing may straddle a reset, suspension or the exact expiry deadline.
    // Re-authorize against the server AFTER hashing, not merely the local token.
    // Reuse one bounded chunk; no new bearer URL or unbounded endpoint. Compare
    // synchronously with already verified bytes so no async work follows this
    // last epoch/project/attachment-expiry check before the save-only click.
    transferSession.assertCurrent();
    const confirmation = await call(project, owner, "tmcHubDownloadAttachmentChunk", { projectId: project.projectId, attachmentId: file.attachmentId, index: 0 }, options.signal, transferSession.assertCurrent);
    if (confirmation.attachmentId !== file.attachmentId || confirmation.index !== 0 || confirmation.offset !== 0 || confirmation.size !== file.size || confirmation.fileSha256 !== file.sha256 || confirmation.fileName !== file.fileName || confirmation.contentType !== "application/octet-stream" || confirmation.contentDisposition !== "attachment" || confirmation.base64 !== base64(bytes.subarray(0, HUB_ATTACHMENT_CHUNK_BYTES))) throw new ClientHubDataError("Attachment access could not be confirmed. Refresh before downloading again.");
    transferSession.assertCurrent(); checkAbort(options.signal);
    return consume(bytes, file, transferSession.assertCurrent);
  }, options.signal);
}
export async function downloadHubAttachment(project: ClientHubProject, owner: boolean, attachment: HubAttachment, options: { signal?: AbortSignal; onProgress?: (receivedBytes: number, totalBytes: number) => void } = {}): Promise<void> {
  return verifiedAttachmentTransfer(project, owner, attachment, options, (bytes, file, assertCurrent) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), anchor = document.createElement("a");
    anchor.href = url; anchor.download = file.fileName; anchor.rel = "noopener"; anchor.style.display = "none"; document.body.appendChild(anchor);
    try { assertCurrent(); anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
}
/** Revoke displayed local previews when the authenticated browser identity changes. */
export async function watchHubFileSession(project: ClientHubProject, owner: boolean, onInvalid: () => void, signal?: AbortSignal): Promise<() => void> {
  const session = await connection(project, owner, signal);
  checkAbort(signal);
  return session.auth.onAuthStateChanged(() => { try { session.assertCurrent(); } catch { onInvalid(); } });
}
export function isRasterAttachment(file: HubAttachment): boolean { return /\.(png|jpe?g|webp|gif)$/i.test(file.fileName); }
/** Same authenticated, hash-checked and final-revalidated bytes as download; raster only. No cache or bearer URLs. */
export async function loadHubAttachmentPreview(project: ClientHubProject, owner: boolean, attachment: HubAttachment, signal?: AbortSignal, priority: AttachmentPriority = "interactive"): Promise<Blob> {
  if (!isRasterAttachment(attachment) || attachment.available === false || attachment.expiresAt && Date.parse(attachment.expiresAt) <= Date.now()) throw new ClientHubDataError("This file has no available image preview.");
  return verifiedAttachmentTransfer(project, owner, attachment, { signal, priority }, (bytes, file, assertCurrent) => {
    const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
    let type = "";
    if (/\.png$/i.test(file.fileName) && starts(137,80,78,71,13,10,26,10)) type = "image/png";
    if (/\.jpe?g$/i.test(file.fileName) && starts(255,216,255)) type = "image/jpeg";
    if (/\.gif$/i.test(file.fileName) && starts(71,73,70,56) && [55,57].includes(bytes[4]) && bytes[5] === 97) type = "image/gif";
    if (/\.webp$/i.test(file.fileName) && starts(82,73,70,70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) type = "image/webp";
    if (!type) throw new ClientHubDataError("This file is not a supported raster image.");
    assertCurrent(); checkAbort(signal); return new Blob([bytes], { type });
  });
}
export async function establishHubLegacyCompletion(project: ClientHubProject, input: { operationId: string; completedAt: string; acknowledgeExpired?: boolean }): Promise<ClientHubProject> {
  assertClientHubProjectId(input.operationId); attachmentDate(input.completedAt);
  const result = await call(project, true, "tmcHubEstablishLegacyCompletion", { ...input, projectId: project.projectId, expectedVersion: project.version });
  return decodeClientHubProject(result.project, project.projectId);
}

/** Rename only the active viewer's accessible copy. No bytes or shared manifest change. */
export async function renameHubAttachment(project: ClientHubProject, owner: boolean, attachment: HubAttachment, fileName: string): Promise<HubAttachment> {
  if (fileName.trim().length > 42) throw new ClientHubDataError("Use a file name of 42 characters or fewer.");
  const previous = decodeHubAttachment(attachment, project);
  const checked = decodeHubAttachment({ ...previous, fileName: fileName.trim() }, project);
  const response = await call(project, owner, "tmcHubRenameAttachment", { projectId: project.projectId, attachmentId: previous.attachmentId, expectedFileName: previous.fileName, fileName: checked.fileName });
  const result = decodeHubAttachment(response.attachment, project);
  if (result.attachmentId !== previous.attachmentId || result.batchId !== previous.batchId || result.sha256 !== previous.sha256 || result.size !== previous.size || result.retentionEpisode !== previous.retentionEpisode || result.fileName !== checked.fileName) throw new ClientHubDataError("Your attachment rename was not confirmed. Refresh before trying again.");
  return result;
}
