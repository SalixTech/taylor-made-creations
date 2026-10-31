"use client";

import { hubWindowGeneration } from "./window-session";
import { CHAT_DRAFT_PREFIX, type VerifiedChatDraftScope } from "./chat-text-drafts";
import { startHubTiming } from "./hub-timing";
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore, limit, onSnapshot, orderBy, query, startAfter, where } from "firebase/firestore";
import { decodeHubConversationVisibility, decodeHubUpdateRequestCooldown, type HubConversationVisibility } from "./conversation-state";
import { onIdTokenChanged, type Auth } from "firebase/auth";
import { hubPhotoMemoryCache, clearHubPhotoCache } from "./private-photo-cache";
import { HUB_FILE_COPIES_CHANGED } from "./file-copy-client";
export { clearHubPhotoCache } from "./private-photo-cache";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getBlob, getMetadata, getStorage, ref, uploadBytes } from "firebase/storage";
import { hubCallableOwnerSession } from "./callable-owner-session";
import { taylorOwnerSession } from "@/owner/taylor-services-client";
import { CLIENT_HUB_FUNCTIONS_REGION, ClientHubError, verifiedClientHubConnection, captureClientHubSessionOwnership, isClientHubSessionError, signOutClient } from "./client";
import {
  assertClientHubProjectId, assertClientHubVersion, validateRefSheetChatColor, clientHubObject, ClientHubDataError, decodeHubMessage, decodeHubPhoto,
  decodeHubPrivateWorkspace, decodeHubSupportRequest, decodeHubSupportReply, decodeHubNotification, decodeClientHubClient, decodeClientHubProject, hubPhotoPath, HUB_PHOTO_MAX_BYTES,
  HUB_PHOTO_TYPES, HUB_WORKSPACE_READ_LIMIT, validateHubMaterials,
  type ClientHubClient, type ClientHubProject, type HubMaterialRequirement, type HubPhoto, type HubPrivateWorkspace,
  type HubProjectWorkspace, type HubSupportRequest, type HubSupportReply, type HubNotification, type HubNotificationChannel,
} from "./model";

async function scopedConnection(project: ClientHubProject, owner: boolean, signal?: AbortSignal, verifyRecord = true) {
  assertClientHubProjectId(project.projectId);
  if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
  if (owner) {
    const session = await (verifyRecord ? taylorOwnerSession() : hubCallableOwnerSession());
    return { ...session, db: getFirestore(session.auth.app), session: undefined, functions: getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), assertCurrent: () => {
      if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
      session.assertCurrent();
    } };
  }
  const connection = await verifiedClientHubConnection(signal, verifyRecord);
  if (connection.session.clientId !== project.clientId) throw new ClientHubError("session-expired", "This commission is not part of your active Client Hub session.");
  return connection;
}
/** Resolve durable text scope only after the existing authenticated project boundary. */
export async function verifiedHubChatDraftScope(project: ClientHubProject, owner: boolean): Promise<VerifiedChatDraftScope> {
  const connection = await scopedConnection(project, owner);
  connection.assertCurrent();
  const uid = connection.auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in before restoring a chat draft.");
  const role = owner ? "owner" : "client", generation = hubWindowGeneration(role, uid);
  const key = CHAT_DRAFT_PREFIX + encodeURIComponent(JSON.stringify([role, uid, project.clientId, project.projectId, connection.session?.authVersion ?? null, generation]));
  return { key, assertCurrent: () => { connection.assertCurrent(); if (connection.auth.currentUser?.uid !== uid || hubWindowGeneration(role, uid) !== generation) throw new Error("Your chat draft session changed."); } };
}
function cleanText(value: string, label: string, max: number, optional = false): string {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ClientHubDataError(`Check the ${label}. Use ${optional ? "up to" : "1 to"} ${max.toLocaleString()} characters.`);
  return value.trim();
}
async function call(project: ClientHubProject, owner: boolean, name: string, payload: unknown, signal?: AbortSignal) {
  const action = ({ tmcHubSendMessage: "message", tmcHubReplySupportRequest: "support-reply", tmcHubSetSupportRequestStatus: "support-status" } as const)[name as "tmcHubSendMessage" | "tmcHubReplySupportRequest" | "tmcHubSetSupportRequestStatus"];
  const timing = action ? startHubTiming(action, owner) : undefined;
  try {
    const session = await scopedConnection(project, owner, signal, false);
    session.assertCurrent(); timing?.("auth-ready");
    const response = await httpsCallable<unknown, unknown>(session.functions, name)(payload);
    session.assertCurrent(); timing?.("callable-confirmed");
    return clientHubObject(response.data);
  } catch (cause) { timing?.("failed"); throw cause; }
}
type PhotoCursor = { createdAt: string; photoId: string };
async function readPhotoPage(session: Awaited<ReturnType<typeof scopedConnection>>, project: ClientHubProject, options: { cursor?: PhotoCursor | null; folderName?: string; uploadDate?: string } = {}) {
  session.assertCurrent();
  const result = clientHubObject((await httpsCallable<unknown, unknown>(session.functions, "tmcHubListPhotos")({ projectId: project.projectId, limit: HUB_WORKSPACE_READ_LIMIT, ...options })).data);
  session.assertCurrent();
  if (!Array.isArray(result.photos) || result.photos.length > HUB_WORKSPACE_READ_LIMIT) throw new ClientHubDataError("The photo list could not be verified. Refresh the gallery.");
  const photos = result.photos.map(value => { const photo = clientHubObject(value); return decodeHubPhoto(photo, String(photo.photoId), project); });
  let nextCursor: PhotoCursor | null = null;
  if (result.nextCursor !== null) {
    const cursor = clientHubObject(result.nextCursor); assertClientHubProjectId(cursor.photoId);
    if (typeof cursor.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt))) throw new ClientHubDataError("The photo page could not be verified.");
    nextCursor = { createdAt: cursor.createdAt, photoId: cursor.photoId as string };
  }
  return { photos, nextCursor };
}
async function readVisiblePhotos(session: Awaited<ReturnType<typeof scopedConnection>>, project: ClientHubProject) {
  const photos: HubPhoto[] = [], seen = new Set<string>(); let cursor: PhotoCursor | null = null;
  for (let pageNumber = 0; pageNumber < 25; pageNumber++) {
    const page = await readPhotoPage(session, project, cursor ? { cursor } : {});
    for (const photo of page.photos) { if (seen.has(photo.photoId)) throw new ClientHubDataError("The photo list changed. Refresh the gallery."); seen.add(photo.photoId); photos.push(photo); }
    if (photos.length >= HUB_WORKSPACE_READ_LIMIT || !page.nextCursor) return { photos: photos.slice(0, HUB_WORKSPACE_READ_LIMIT) };
    if (cursor && (page.nextCursor.createdAt > cursor.createdAt || page.nextCursor.createdAt === cursor.createdAt && page.nextCursor.photoId >= cursor.photoId)) throw new ClientHubDataError("The photo list did not advance. Refresh the gallery.");
    cursor = page.nextCursor;
  }
  throw new ClientHubDataError("There are too many deleted photo records to load this gallery in one view. Ask Taylor for help; no incomplete gallery was displayed.");
}
/** Queries stay scoped to both client and commission. Newest 200 records per section. */
export async function loadProjectWorkspace(project: ClientHubProject, owner: boolean, signal?: AbortSignal): Promise<HubProjectWorkspace> {
  const session = await scopedConnection(project, owner, signal);
  const read = (name: string) => getDocsFromServer(query(collection(session.db, name), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId), orderBy("createdAt", "desc"), limit(HUB_WORKSPACE_READ_LIMIT)));
  const [messages, photos, requests, replies, notices, visibility, privateSnapshot] = await Promise.all([
    read("hubMessages"), readVisiblePhotos(session, project), read("hubSupportRequests"), read("hubSupportReplies"),
    getDocsFromServer(query(collection(session.db, "hubNotifications"), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId))),
    getDocsFromServer(query(collection(session.db, "hubConversationVisibility"), where("viewerUid", "==", session.auth.currentUser!.uid), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId))),
    owner ? getDocFromServer(doc(session.db, "hubProjectPrivate", project.projectId)) : Promise.resolve(null),
  ]);
  session.assertCurrent();
  const notifications = notices.docs.map(item => decodeHubNotification(item.data(), item.id, project));
  return {
    requestReplies: replies.docs.map(item => decodeHubSupportReply(item.data(), item.id, project)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.replyId.localeCompare(b.replyId)),
    visibility: visibility.docs.map(item => decodeHubConversationVisibility(item.data(), project, session.auth.currentUser!.uid, owner, item.id)),
    notifications, receipts: notifications,
    messages: messages.docs.map(item => decodeHubMessage(item.data(), item.id, project)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.messageId.localeCompare(b.messageId)),
    photos: photos.photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.photoId.localeCompare(b.photoId)),
    requests: requests.docs.map(item => decodeHubSupportRequest(item.data(), item.id, project)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.requestId.localeCompare(b.requestId)),
    privateWorkspace: privateSnapshot?.exists() ? decodeHubPrivateWorkspace(privateSnapshot.data(), project.projectId, project) : null,
  };
}
export async function sendHubMessage(project: ClientHubProject, owner: boolean, body: string, operationId: string) {
  assertClientHubProjectId(operationId);
  const response = await call(project, owner, "tmcHubSendMessage", { operationId, projectId: project.projectId, body: cleanText(body, "message", 4000) });
  return { message: decodeHubMessage(response.message, operationId, project) };
}
export async function createHubSupportRequest(project: ClientHubProject, owner: boolean, input: { operationId: string; type: HubSupportRequest["type"]; body: string; photoId?: string | null; attachmentIds?: string[] }) {
  assertClientHubProjectId(input.operationId);
  if (!["update", "support", "photo-deletion"].includes(input.type)) throw new ClientHubDataError("Choose a valid request type.");
  const photoId = input.photoId ?? null;
  if (input.type === "photo-deletion") assertClientHubProjectId(photoId);
  else if (photoId !== null) throw new ClientHubDataError("Only photo deletion requests can include a photo.");
  const response = await call(project, owner, "tmcHubCreateSupportRequest", { operationId: input.operationId, projectId: project.projectId, type: input.type, body: cleanText(input.body, "request", 4000), photoId, ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}) });
  return { request: decodeHubSupportRequest(response.request, input.operationId, project) };
}
export async function resolveHubSupportRequest(request: HubSupportRequest, responseText: string) {
  const project = { projectId: request.projectId, clientId: request.clientId } as ClientHubProject;
  const response = await call(project, true, "tmcHubResolveSupportRequest", { requestId: request.requestId, expectedVersion: request.version, response: cleanText(responseText, "response", 4000) });
  const resolved = decodeHubSupportRequest(response.request, request.requestId, project);
  if (resolved.version !== request.version + 1 || resolved.status !== "resolved") throw new ClientHubDataError("The request update was not confirmed. Refresh before retrying.");
  return { request: resolved };
}
export async function saveHubPrivateWorkspace(project: ClientHubProject, previous: HubPrivateWorkspace | null, notes: string, materials: HubMaterialRequirement[]) {
  if (previous && (previous.projectId !== project.projectId || previous.clientId !== project.clientId)) throw new ClientHubDataError("These private notes belong to a different commission.");
  const expectedVersion = previous?.version ?? 0;
  const response = await call(project, true, "tmcHubSavePrivateWorkspace", { projectId: project.projectId, expectedVersion, notes: cleanText(notes, "private notes", 10000, true), materials: validateHubMaterials(materials) });
  const workspace = decodeHubPrivateWorkspace(response.workspace, project.projectId, project);
  if (workspace.version !== expectedVersion + 1) throw new ClientHubDataError("The private workspace save was not confirmed. Refresh before retrying.");
  return { workspace };
}
let activePhotoReads = 0;
const photoReadQueue: { start: () => void; cancel: () => void; signal?: AbortSignal }[] = [];
async function withPhotoReadSlot<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  if (signal?.aborted) throw new DOMException("Photo request cancelled.", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const entry = {
      signal,
      start: () => { signal?.removeEventListener("abort", entry.cancel); activePhotoReads++; resolve(); },
      cancel: () => { const index = photoReadQueue.indexOf(entry); if (index >= 0) photoReadQueue.splice(index, 1); reject(new DOMException("Photo request cancelled.", "AbortError")); },
    };
    if (activePhotoReads < 2) entry.start();
    else { photoReadQueue.push(entry); signal?.addEventListener("abort", entry.cancel, { once: true }); }
  });
  try {
    if (signal?.aborted) throw new DOMException("Photo request cancelled.", "AbortError");
    return await work();
  } finally {
    activePhotoReads--;
    const next = photoReadQueue.shift();
    if (next) next.start();
  }
}

/** Photo bytes are served by a current-session callable, not Firebase bearer URLs.
 * Direct client Storage access is denied because its metadata API can mint a
 * download token that survives auth changes. Blob URLs live only in the UI. */
const observedPhotoAuth = new WeakSet<Auth>();
function watchPhotoAuth(auth: Auth) {
  if (observedPhotoAuth.has(auth)) return;
  observedPhotoAuth.add(auth);
  let currentUser = auth.currentUser;
  onIdTokenChanged(auth, user => { if (currentUser !== user) { currentUser = user; clearHubPhotoCache(); } }, () => clearHubPhotoCache());
}
export async function loadHubPhotoBlob(photo: HubPhoto, owner: boolean, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw new DOMException("Photo request cancelled.", "AbortError");
  const checked = decodeHubPhoto(photo, photo.photoId);
  const project = { clientId: checked.clientId, projectId: checked.projectId } as ClientHubProject;
  // Do not attach one caller's AbortSignal to a shared authorization operation.
  // Each consumer is independently cancelled below; a late prior session cannot
  // insert bytes because its captured connection and cache scope are rechecked.
  const session = await scopedConnection(project, owner);
  session.assertCurrent();
  const user = session.auth.currentUser;
  if (!user) throw new ClientHubError("session-expired", "Sign in again before loading private photos.");
  watchPhotoAuth(session.auth);
  const epoch = session.session?.authVersion ?? "owner";
  const accountKey = `${owner ? "owner" : "client"}:${user.uid}:${checked.clientId}:${checked.projectId}:${epoch}`;
  const key = JSON.stringify([checked.photoId, checked.storagePath, checked.contentType, checked.fileName, checked.size, checked.createdAt]);
  const scope = { user, accountKey };
  const blob = await hubPhotoMemoryCache.run(scope, key, (previous, sharedSignal) => withPhotoReadSlot(sharedSignal, async () => {
    session.assertCurrent();
    const response = clientHubObject((await httpsCallable<unknown, unknown>(session.functions, "tmcHubReadPhoto")({ photoId: checked.photoId, ...(previous ? { knownGeneration: previous.generation } : {}) })).data);
    session.assertCurrent();
    if (sharedSignal.aborted) throw new DOMException("Photo request cancelled.", "AbortError");
    if (response.photoId !== checked.photoId || response.contentType !== checked.contentType || response.fileName !== checked.fileName || response.size !== checked.size) throw new ClientHubDataError("This photo changed or could not be verified. Refresh the gallery.");
    const generation = typeof response.generation === "string" && /^[0-9]{1,32}$/.test(response.generation) ? response.generation : undefined;
    if (response.notModified === true) {
      if (!previous || !generation || generation !== previous.generation || response.base64 !== undefined || previous.blob.size !== checked.size || previous.blob.type !== checked.contentType) throw new ClientHubDataError("This cached photo could not be verified. Refresh the gallery.");
      return { blob: previous.blob, generation };
    }
    if (response.notModified !== undefined || response.generation !== undefined && !generation || typeof response.base64 !== "string" || response.base64.length !== 4 * Math.ceil(checked.size / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.base64)) throw new ClientHubDataError("This photo changed or could not be verified. Refresh the gallery.");
    let binary: string;
    try { binary = atob(response.base64); } catch { throw new ClientHubDataError("The photo response was not readable. Try again."); }
    if (binary.length !== checked.size) throw new ClientHubDataError("The photo response was incomplete. Try again.");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    // Older deployed handlers return no generation: valid bytes still display,
    // but are deliberately not retained or conditionally requested.
    return { blob: new Blob([bytes], { type: checked.contentType }), generation };
  }), signal).catch(error => {
    // Revocation invalidates all private bytes, not only the requested tile.
    // An ordinary consumer cancellation is not a session failure.
    if (isClientHubSessionError(error)) hubPhotoMemoryCache.clearIfCurrent(scope);
    throw error;
  });
  try { session.assertCurrent(); } catch (error) { if (isClientHubSessionError(error)) hubPhotoMemoryCache.clearIfCurrent(scope); throw error; }
  if (signal?.aborted) throw new DOMException("Photo request cancelled.", "AbortError");
  return blob;
}
export async function validateHubPhotoFile(file: File): Promise<void> {
  if (!HUB_PHOTO_TYPES.includes(file.type as HubPhoto["contentType"]) || file.size < 1 || file.size > HUB_PHOTO_MAX_BYTES) throw new ClientHubDataError("Choose a JPG, PNG or WebP image up to 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : webp)) throw new ClientHubDataError("This file does not match its image type. Export it as a JPG, PNG or WebP and try again.");
}
async function identicalBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [left, right] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  return x.every((value, index) => value === y[index]);
}
export async function uploadHubPhoto(project: ClientHubProject, file: File, caption: string, photoId: string, folderName = "", nameStem = "") {
  assertClientHubProjectId(photoId); await validateHubPhotoFile(file);
  const safeCaption = cleanText(caption, "photo caption", 1000, true);
  if (nameStem && (!nameStem.trim() || nameStem.trim().length + (file.type === "image/webp" ? 5 : 4) > 42 || /[\\/\u0000-\u001f\u007f]/.test(nameStem) || [".", ".."].includes(nameStem.trim()))) throw new ClientHubDataError("Use a file name of 42 characters or fewer, including its extension, without slashes.");
  const fileName = cleanText(file.name.replace(/[\\/]/g, "_"), "photo filename", 180);
  const session = await scopedConnection(project, true), path = hubPhotoPath({ ...project, photoId });
  const target = ref(getStorage(session.auth.app), path);
  const publication = { photoId, projectId: project.projectId, caption: safeCaption, fileName, folderName: cleanText(folderName, "photo folder", 80, true), ...(nameStem.trim() ? { nameStem: cleanText(nameStem, "photo name", 42) } : {}) };
  try {
    await uploadBytes(target, file, { contentType: file.type, contentDisposition: "inline", customMetadata: { clientId: project.clientId, projectId: project.projectId, photoId } });
  } catch (error) {
    // A successful publish may have lost its response. Check ONLY an existing
    // authoritative operation first; this cannot publish a different upload.
    try {
      const replay = clientHubObject((await httpsCallable<unknown, unknown>(session.functions, "tmcHubPublishPhoto")({ ...publication, replayOnly: true })).data);
      session.assertCurrent();
      const photo = decodeHubPhoto(replay.photo, photoId, project);
      if (!await identicalBytes(file, await loadHubPhotoBlob(photo, true))) throw error;
      return { photo };
    } catch { session.assertCurrent(); }
    // An unpublished interrupted upload can still be checked through owner-only
    // metadata/byte reads. Published objects never permit direct Storage GET.
    try {
      session.assertCurrent();
      const existing = await getMetadata(target);
      if (existing.contentType !== file.type || existing.customMetadata?.clientId !== project.clientId || existing.customMetadata?.projectId !== project.projectId || existing.customMetadata?.photoId !== photoId) throw error;
      const blob = await getBlob(target, HUB_PHOTO_MAX_BYTES);
      if (!await identicalBytes(file, blob)) throw error;
    } catch { throw error; }
  }
  session.assertCurrent();
  const response = await httpsCallable<unknown, unknown>(session.functions, "tmcHubPublishPhoto")(publication);
  session.assertCurrent();
  return { photo: decodeHubPhoto(clientHubObject(response.data).photo, photoId, project) };
}

/** Listeners initialize asynchronously but unsubscribe synchronously and never
 * publish a late setup result or data from an old auth/project scope. */
export type HubConnectionState = "connecting" | "connected" | "disconnected";
export function subscribeProjectWorkspace(project: ClientHubProject, owner: boolean, onData: (workspace: HubProjectWorkspace) => void, onError: (error: unknown) => void, onConnection?: (state: HubConnectionState) => void): () => void {
  let active = true; const ownsSession = owner ? () => true : captureClientHubSessionOwnership(); const stops: (() => void)[] = [], controller = new AbortController();
  const streams = ["messages", "photos", "requests", "requestReplies", "notifications", "visibility", owner ? "privateWorkspace" : "epoch"];
  const serverReady = new Set<string>();
  const reportConnection = (key?: string, fromCache = false) => {
    if (!active || !ownsSession()) return;
    if (key) { if (fromCache) serverReady.delete(key); else serverReady.add(key); }
    onConnection?.(typeof navigator !== "undefined" && navigator.onLine === false ? "disconnected" : streams.every(stream => serverReady.has(stream)) ? "connected" : "connecting");
  };
  const offline = () => { serverReady.clear(); if (active && ownsSession()) onConnection?.("disconnected"); };
  const online = () => { serverReady.clear(); reportConnection(); };
  if (typeof window !== "undefined") { window.addEventListener?.("offline", offline); window.addEventListener?.("online", online);
    stops.push(() => { window.removeEventListener?.("offline", offline); window.removeEventListener?.("online", online); }); }
  reportConnection();
  const stop = () => { active = false; controller.abort(); stops.splice(0).forEach(unsubscribe => unsubscribe()); };
  const fail = (error: unknown) => { if (!active) return; if (!ownsSession()) { stop(); return; } onConnection?.("disconnected"); stop(); if (!owner && isClientHubSessionError(error)) void signOutClient().catch(() => {}); onError(error); };
  void scopedConnection(project, owner, controller.signal).then(session => {
    if (!active) return;
    const workspace: HubProjectWorkspace = { messages: [], photos: [], requests: [], requestReplies: [], notifications: [], receipts: [], privateWorkspace: null };
    const pending = new Set(["messages", "photos", "requests", "requestReplies", "notifications", "visibility", ...(owner ? ["privateWorkspace"] : [])]);
    const emit = (key: string) => { pending.delete(key); if (!active || pending.size) return; session.assertCurrent(); onData({ ...workspace }); };
    const watch = <T,>(name: string, key: "messages" | "photos" | "requests" | "requestReplies", decode: (raw: unknown, id: string, project: ClientHubProject) => T) => {
      const target = query(collection(session.db, name), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId), orderBy("createdAt", "desc"), limit(HUB_WORKSPACE_READ_LIMIT));
      stops.push(onSnapshot(target, { includeMetadataChanges: true }, snapshot => {
        if (!active || !ownsSession()) return;
        reportConnection(key, snapshot.metadata.fromCache);
        if (snapshot.metadata.fromCache) return;
        try {
          const items = snapshot.docs.map(item => decode(item.data(), item.id, project));
          // Newest-first for gallery/requests, chronological for conversations.
          (workspace[key] as T[]) = key === "messages" || key === "requestReplies" ? items.reverse() : items;
          emit(key);
        } catch (error) { fail(error); }
      }, fail));
    };
    let photoRefreshVersion = 0, photoRefreshRunning = false, photoNoticeVersion: string | undefined, copyRevision: number | undefined;
    const refreshPhotos = () => {
      photoRefreshVersion++;
      if (photoRefreshRunning || !active) return;
      photoRefreshRunning = true;
      void (async () => {
        while (active && ownsSession()) {
          const version = photoRefreshVersion, page = await readVisiblePhotos(session, project);
          if (!active || !ownsSession()) return;
          if (version !== photoRefreshVersion) continue; // Never revive an older pre-deletion list.
          workspace.photos = page.photos; reportConnection("photos"); emit("photos"); return;
        }
      })().catch(fail).finally(() => { photoRefreshRunning = false; });
    };
    refreshPhotos();
    const copiesChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId === project.projectId && detail?.clientId === project.clientId && detail?.owner === owner) refreshPhotos();
    };
    if (typeof window !== "undefined") {
      window.addEventListener(HUB_FILE_COPIES_CHANGED, copiesChanged); window.addEventListener("online", refreshPhotos);
      stops.push(() => { window.removeEventListener(HUB_FILE_COPIES_CHANGED, copiesChanged); window.removeEventListener("online", refreshPhotos); });
    }
    stops.push(onSnapshot(doc(session.db, "hubFileCopyRevisions", project.projectId, "viewers", owner ? "owner" : "client"), { includeMetadataChanges: true }, snapshot => {
      if (!active || !ownsSession() || snapshot.metadata.fromCache) return;
      try {
        session.assertCurrent(); const value = snapshot.exists() ? snapshot.data() : null, revision = value?.revision ?? 0;
        if (!Number.isSafeInteger(revision) || revision < 0 || value && (value.projectId !== project.projectId || value.clientId !== project.clientId || value.viewerUid !== session.auth.currentUser?.uid || value.viewerRole !== (owner ? "owner" : "client"))) throw new ClientHubDataError("The file-copy visibility update could not be verified.");
        if (revision !== copyRevision) {
          if (copyRevision !== undefined) {
            clearHubPhotoCache(); workspace.photos = []; emit("photos");
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(HUB_FILE_COPIES_CHANGED, { detail: { projectId: project.projectId, clientId: project.clientId, owner } }));
            else refreshPhotos();
          } else refreshPhotos();
        }
        copyRevision = revision;
      } catch (error) { fail(error); }
    }, fail));
    watch("hubMessages", "messages", decodeHubMessage); watch("hubSupportRequests", "requests", decodeHubSupportRequest); watch("hubSupportReplies", "requestReplies", decodeHubSupportReply);
    stops.push(onSnapshot(query(collection(session.db, "hubNotifications"), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId)), { includeMetadataChanges: true }, snapshot => {
      if (!active || !ownsSession()) return;
      reportConnection("notifications", snapshot.metadata.fromCache);
      if (snapshot.metadata.fromCache) return;
      try {
        const notices = snapshot.docs.map(item => decodeHubNotification(item.data(), item.id, project)); workspace.notifications = notices; workspace.receipts = notices;
        const version = notices.filter(notice => notice.channel === "photos").map(notice => `${notice.notificationId}:${notice.version}`).sort().join("|");
        if (version !== photoNoticeVersion) refreshPhotos();
        photoNoticeVersion = version; emit("notifications");
      } catch (error) { fail(error); }
    }, fail));
    const viewerUid = session.auth.currentUser!.uid;
    stops.push(onSnapshot(query(collection(session.db, "hubConversationVisibility"), where("viewerUid", "==", viewerUid), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId)), { includeMetadataChanges: true }, snapshot => {
      if (!active || !ownsSession()) return;
      reportConnection("visibility", snapshot.metadata.fromCache);
      if (snapshot.metadata.fromCache) return;
      try { workspace.visibility = snapshot.docs.map(item => decodeHubConversationVisibility(item.data(), project, viewerUid, owner, item.id)); emit("visibility"); } catch (error) { fail(error); }
    }, fail));
    if (owner) stops.push(onSnapshot(doc(session.db, "hubProjectPrivate", project.projectId), { includeMetadataChanges: true }, snapshot => {
      if (!active || !ownsSession()) return;
      reportConnection("privateWorkspace", snapshot.metadata.fromCache);
      if (snapshot.metadata.fromCache) return;
      try { workspace.privateWorkspace = snapshot.exists() ? decodeHubPrivateWorkspace(snapshot.data(), project.projectId, project) : null; emit("privateWorkspace"); } catch (error) { fail(error); }
    }, fail));
    else stops.push(onSnapshot(doc(session.db, "hubClients", project.clientId), { includeMetadataChanges: true }, snapshot => {
      if (!active || !ownsSession()) return;
      reportConnection("epoch", snapshot.metadata.fromCache);
      if (snapshot.metadata.fromCache) return;
      try { session.assertCurrent(); if (!snapshot.exists()) throw new ClientHubError("session-expired", "Your Client Hub session is no longer active."); const client = decodeClientHubClient(snapshot.data(), project.clientId); if (client.status !== "active" || client.authVersion !== session.session?.authVersion) throw new ClientHubError("session-expired", "Your Client Hub session is no longer active."); } catch (error) { fail(error); }
    }, fail));
    stops.push(onIdTokenChanged(session.auth, () => { if (!active) return; try { session.assertCurrent(); } catch (error) { fail(error); } }, fail));
  }).catch(fail);
  return stop;
}
export async function replyHubSupportRequest(request: HubSupportRequest, owner: boolean, body: string, operationId: string, attachmentIds?: string[]): Promise<{ reply: HubSupportReply; request: HubSupportRequest }> {
  assertClientHubProjectId(operationId);
  const project = { clientId: request.clientId, projectId: request.projectId } as ClientHubProject;
  const response = await call(project, owner, "tmcHubReplySupportRequest", { requestId: request.requestId, operationId, body: cleanText(body, "reply", 4000), ...(attachmentIds?.length ? { attachmentIds } : {}) });
  const reply = decodeHubSupportReply(response.reply, operationId, project), updated = decodeHubSupportRequest(response.request, request.requestId, project);
  if (reply.requestId !== request.requestId) throw new ClientHubDataError("The support reply could not be verified. Refresh the conversation.");
  return { reply, request: updated };
}
export async function setHubSupportRequestStatus(request: HubSupportRequest, owner: boolean, status: HubSupportRequest["status"]): Promise<{ request: HubSupportRequest }> {
  if (!["open", "resolved", "closed", "cancelled"].includes(status) || !owner && status === "resolved") throw new ClientHubDataError("Choose an allowed request status.");
  const project = { clientId: request.clientId, projectId: request.projectId } as ClientHubProject;
  const response = await call(project, owner, "tmcHubSetSupportRequestStatus", { requestId: request.requestId, expectedVersion: request.version, status });
  const updated = decodeHubSupportRequest(response.request, request.requestId, project);
  if (updated.status !== status || updated.version < request.version) throw new ClientHubDataError("The request status could not be confirmed. Refresh before retrying.");
  return { request: updated };
}
/** Call only for recipient content actually visible in the foreground. Opening a
 * bell or loading a background snapshot must never invoke this operation. */
export async function markHubConversationRead(project: ClientHubProject, owner: boolean, input: { channel: HubNotificationChannel; itemId: string; requestId?: string }): Promise<{ notification: HubNotification | null }> {
  assertClientHubProjectId(input.itemId); if (input.requestId) assertClientHubProjectId(input.requestId);
  const response = await call(project, owner, "tmcHubMarkConversationRead", { projectId: project.projectId, ...input });
  return { notification: response.notification === null ? null : decodeHubNotification(response.notification, undefined, project) };
}
export function subscribeHubNotifications(owner: boolean, onData: (notifications: HubNotification[]) => void, onError: (error: unknown) => void): () => void {
  const ownsSession = owner ? () => true : captureClientHubSessionOwnership();
  let active = true; const stops: (() => void)[] = [];
  const stop = () => { active = false; stops.splice(0).forEach(unsubscribe => unsubscribe()); };
  const fail = (error: unknown) => { if (!active) return; if (!ownsSession()) { stop(); return; } stop(); if (!owner && isClientHubSessionError(error)) void signOutClient().catch(() => {}); onError(error); };
  void (owner ? taylorOwnerSession().then(session => ({ ...session, db: getFirestore(session.auth.app), clientId: undefined as string | undefined })) : verifiedClientHubConnection().then(session => ({ ...session, clientId: session.session.clientId }))).then(session => {
    if (!active) return;
    const target = query(collection(session.db, "hubNotifications"), ...(session.clientId ? [where("clientId", "==", session.clientId)] : []), where("recipientRole", "==", owner ? "owner" : "client"));
    stops.push(onSnapshot(target, { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { session.assertCurrent(); const notices = snapshot.docs.map(item => decodeHubNotification(item.data(), item.id)); if (session.clientId && notices.some(item => item.clientId !== session.clientId)) throw new ClientHubError("session-expired", "The notification scope changed."); onData(notices.sort((a, b) => b.latestAt.localeCompare(a.latestAt))); } catch (error) { fail(error); }
    }, fail));
    // Dependency changes alone do not always re-evaluate a query stream.
    // Independently watch the authoritative epoch even when the bell is reused
    // without the dashboard/session component mounted around it.
    if (session.clientId) stops.push(onSnapshot(doc(session.db, "hubClients", session.clientId), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { session.assertCurrent(); if (!snapshot.exists()) throw new ClientHubError("session-expired", "Your Client Hub session is no longer active."); const client = decodeClientHubClient(snapshot.data(), session.clientId); if (client.status !== "active" || !("session" in session) || client.authVersion !== session.session.authVersion) throw new ClientHubError("session-expired", "Your Client Hub session is no longer active."); } catch (error) { fail(error); }
    }, fail));
    stops.push(onIdTokenChanged(session.auth, () => { if (!active) return; try { session.assertCurrent(); } catch (error) { fail(error); } }, fail));
  }).catch(fail);
  return stop;
}
/** Completeness check for a named UTC-day folder; rejects instead of silently
 * returning only the current live page. Bytes still use authenticated readPhoto. */
export async function listHubPhotoFolder(project: ClientHubProject, owner: boolean, folder: { folderName: string; uploadDate: string }, signal?: AbortSignal): Promise<HubPhoto[]> {
  const name = cleanText(folder.folderName, "photo folder", 80, true);
  const session = await scopedConnection(project, owner, signal), photos: HubPhoto[] = [], seen = new Set<string>();
  let cursor: PhotoCursor | null = null, pages = 0;
  do {
    const page = await readPhotoPage(session, project, { folderName: name, ...(cursor ? { cursor } : {}) });
    session.assertCurrent(); if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
    for (const photo of page.photos) {
      if ((photo.folderName ?? "") !== name || seen.has(photo.photoId)) throw new ClientHubDataError("The photo folder changed. Refresh before downloading.");
      seen.add(photo.photoId); photos.push(photo);
    }
    if (photos.length > 200 || photos.reduce((bytes, photo) => bytes + photo.size, 0) > 100 * 1024 * 1024) throw new ClientHubDataError("This folder exceeds the 200-photo / 100 MB archive limit. Ask Taylor to split it into smaller folders.");
    if (page.nextCursor && cursor && (page.nextCursor.createdAt > cursor.createdAt || page.nextCursor.createdAt === cursor.createdAt && page.nextCursor.photoId >= cursor.photoId)) throw new ClientHubDataError("The photo page did not advance. Refresh before downloading.");
    cursor = page.nextCursor; pages++;
    // Preserve the existing 1000-record scan ceiling; never claim a partial ZIP.
    if (cursor && pages >= 5) throw new ClientHubDataError("This photo folder is too large for one archive. Ask Taylor to split it into smaller folders.");
  } while (cursor); // An empty filtered page may still have visible older files.

  return photos;
}
export async function loadOlderHubMessages(project: ClientHubProject, owner: boolean, before: { createdAt: string; messageId: string }, signal?: AbortSignal) {
  assertClientHubProjectId(before.messageId);
  if (!Number.isFinite(Date.parse(before.createdAt))) throw new ClientHubDataError("Refresh before loading older messages.");
  const session = await scopedConnection(project, owner, signal);
  const snapshot = await getDocsFromServer(query(collection(session.db, "hubMessages"), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), startAfter(before.createdAt, before.messageId), limit(HUB_WORKSPACE_READ_LIMIT)));
  session.assertCurrent();
  return snapshot.docs.map(item => decodeHubMessage(item.data(), item.id, project)).reverse();
}

export async function loadHubAvatarBlob(client: ClientHubClient, owner: boolean, signal?: AbortSignal): Promise<Blob> {
  if (!client.avatarVersion) throw new ClientHubDataError("This client has no avatar.");
  if (signal?.aborted) throw new DOMException("Avatar request cancelled.", "AbortError");
  const session = owner ? await taylorOwnerSession() : await verifiedClientHubConnection(signal);
  if (!owner && "session" in session && session.session.clientId !== client.clientId) throw new ClientHubError("session-expired", "This profile is not part of your account.");
  session.assertCurrent();
  const response = clientHubObject((await httpsCallable<unknown, unknown>(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcHubReadAvatar")({ clientId: client.clientId, avatarVersion: client.avatarVersion })).data);
  session.assertCurrent();
  if (signal?.aborted) throw new DOMException("Avatar request cancelled.", "AbortError");
  if (response.clientId !== client.clientId || response.avatarVersion !== client.avatarVersion || !HUB_PHOTO_TYPES.includes(response.contentType as HubPhoto["contentType"]) || !Number.isSafeInteger(response.size) || (response.size as number) < 1 || (response.size as number) > 256 * 1024 || typeof response.base64 !== "string" || response.base64.length !== 4 * Math.ceil((response.size as number) / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.base64)) throw new ClientHubDataError("The avatar response could not be verified.");
  const binary = atob(response.base64); if (binary.length !== response.size) throw new ClientHubDataError("The avatar response was incomplete.");
  const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: response.contentType as string });
}

/** Fresh server-backed epoch check for a locally prepared private download. */
export async function verifyHubWorkspaceSession(project: ClientHubProject, owner: boolean, signal?: AbortSignal): Promise<void> {
  const session = await scopedConnection(project, owner, signal);
  session.assertCurrent();
}

/** Cursor reads use the existing client/project/date index; status is filtered only after authorization.
 * The cursor includes the document ID, so equal timestamps cannot skip history. */
export type HubHistoryCursor = { createdAt: string; id: string };
export const HUB_HISTORY_PAGE_SIZE = 50;
async function supportHistoryPage(project: ClientHubProject, owner: boolean, name: "hubSupportRequests" | "hubSupportReplies", before?: HubHistoryCursor | null, signal?: AbortSignal) {
  if (before) { assertClientHubProjectId(before.id); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(before.createdAt) || !Number.isFinite(Date.parse(before.createdAt))) throw new ClientHubDataError("Refresh before loading earlier history."); }
  const session = await scopedConnection(project, owner, signal);
  const snapshot = await getDocsFromServer(query(collection(session.db, name), where("clientId", "==", project.clientId), where("projectId", "==", project.projectId), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), ...(before ? [startAfter(before.createdAt, before.id)] : []), limit(HUB_HISTORY_PAGE_SIZE + 1)));
  session.assertCurrent();
  const docs = snapshot.docs.slice(0, HUB_HISTORY_PAGE_SIZE), last = docs.at(-1);
  return { docs, next: snapshot.docs.length > HUB_HISTORY_PAGE_SIZE && last ? { createdAt: String(last.data().createdAt), id: last.id } : null };
}
export async function loadHubSupportRequestPage(project: ClientHubProject, owner: boolean, before?: HubHistoryCursor | null, signal?: AbortSignal) {
  const page = await supportHistoryPage(project, owner, "hubSupportRequests", before, signal);
  return { items: page.docs.map(item => decodeHubSupportRequest(item.data(), item.id, project)), next: page.next };
}
export async function loadHubSupportReplyPage(project: ClientHubProject, owner: boolean, before?: HubHistoryCursor | null, signal?: AbortSignal) {
  const page = await supportHistoryPage(project, owner, "hubSupportReplies", before, signal);
  return { items: page.docs.map(item => decodeHubSupportReply(item.data(), item.id, project)), next: page.next };
}
export async function loadHubSupportRequest(project: ClientHubProject, owner: boolean, requestId: string, signal?: AbortSignal) {
  assertClientHubProjectId(requestId);
  const session = await scopedConnection(project, owner, signal);
  const snapshot = await getDocFromServer(doc(session.db, "hubSupportRequests", requestId));
  session.assertCurrent();
  if (!snapshot.exists()) throw new ClientHubDataError("That support request is no longer available.");
  return decodeHubSupportRequest(snapshot.data(), requestId, project);
}

/** Own-side presentation only: the callable never deletes conversations or changes read receipts. */
export async function setHubConversationVisibility(project: ClientHubProject, owner: boolean, input: { operationId: string; channel: "chat" | "requests"; requestId?: string; expectedVersion: number; action: "hide" | "restore"; capturedChatVersions?: { owner: number; client: number }; capturedRequestVersion?: number }): Promise<{ visibility: HubConversationVisibility }> {
  if (input.channel !== "requests") throw new ClientHubDataError("Maker Chat cannot be hidden or deleted.");
  const timing = startHubTiming("visibility", owner);
  try {
    const session = await scopedConnection(project, owner, undefined, false); session.assertCurrent(); timing("auth-ready");
    const uid = session.auth.currentUser!.uid;
    const response = clientHubObject((await httpsCallable(session.functions, "tmcHubSetConversationVisibility")({ ...input, projectId: project.projectId })).data); session.assertCurrent(); timing("callable-confirmed");
    return { visibility: decodeHubConversationVisibility(response.visibility, project, uid, owner) };
  } catch (cause) { timing("failed"); throw cause; }
}
export async function getHubUpdateRequestCooldown(project: ClientHubProject, owner: boolean, signal?: AbortSignal) {
  const response = await call(project, owner, "tmcHubGetUpdateRequestCooldown", { clientId: project.clientId }, signal);
  return decodeHubUpdateRequestCooldown(response.cooldown, project.clientId);
}
export async function setHubUpdateRequestCooldown(project: ClientHubProject, input: { operationId: string; expectedRevision: number; overrideDays?: number | null; reset?: true }) {
  const response = await call(project, true, "tmcHubSetUpdateRequestCooldown", { ...input, clientId: project.clientId });
  return decodeHubUpdateRequestCooldown(response.cooldown, project.clientId);
}

export type HubCommissionFolders = { projectId: string; clientId: string; version: number; folderNames: string[] };
function decodeCommissionFolders(raw: unknown, project: ClientHubProject): HubCommissionFolders {
  const value = clientHubObject(raw);
  if (value.projectId !== project.projectId || value.clientId !== project.clientId || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || !Array.isArray(value.folderNames) || value.folderNames.length > 100 || new Set(value.folderNames).size !== value.folderNames.length || value.folderNames.some(name => typeof name !== "string" || !name.trim() || name.length > 80)) throw new ClientHubDataError("Commission folders could not be verified.");
  return value as unknown as HubCommissionFolders;
}
export async function getHubCommissionFolders(project: ClientHubProject): Promise<HubCommissionFolders> {
  return decodeCommissionFolders((await call(project, true, "tmcHubGetCommissionFolders", { projectId: project.projectId })).folders, project);
}
export async function createHubCommissionFolder(project: ClientHubProject, name: string, expectedVersion: number): Promise<HubCommissionFolders> {
  return decodeCommissionFolders((await call(project, true, "tmcHubCreateCommissionFolder", { projectId: project.projectId, name: cleanText(name, "folder name", 80), expectedVersion })).folders, project);
}

/** Client-only archive; does not affect Taylor's archive or shared lifecycle. */
export async function setClientProjectArchived(project: ClientHubProject, archived: boolean): Promise<ClientHubProject> {
  if (typeof archived !== "boolean" || !Number.isSafeInteger(project.version) || project.version < 1) throw new ClientHubDataError("Refresh the commission before changing its archive.");
  const response = await call(project, false, "tmcHubSetClientProjectArchived", { projectId: project.projectId, expectedVersion: project.version, archived });
  const saved = decodeClientHubProject(response.project, project.projectId);
  if (saved.clientId !== project.clientId || saved.version !== project.version + 1 || saved.clientArchived !== archived || saved.ownerArchived !== project.ownerArchived || saved.status !== project.status) throw new ClientHubDataError("Refresh the commission to confirm its client archive state.");
  return saved;
}

/** Rename Taylor's copy only; original/client filename and captions are unchanged. */
export async function renameHubPhoto(project: ClientHubProject, photo: HubPhoto, fileName: string): Promise<HubPhoto> {
  const name = cleanText(fileName, "photo filename", 42);
  const extension = (value: string) => /\.[^.]+$/.exec(value)?.[0].toLowerCase() ?? "";
  if (photo.projectId !== project.projectId || photo.clientId !== project.clientId || /[\\/]/.test(name) || !extension(name) || extension(name) !== extension(photo.fileName)) throw new ClientHubDataError("Use a simple name and keep the photo's original file extension.");
  const response = await call(project, true, "tmcHubRenamePhoto", { projectId: project.projectId, photoId: photo.photoId, expectedFileName: photo.fileName, fileName: name });
  const saved = decodeHubPhoto(response.photo, photo.photoId, project);
  if (saved.fileName !== name || saved.storagePath !== photo.storagePath || saved.contentType !== photo.contentType || saved.size !== photo.size || saved.caption !== photo.caption) throw new ClientHubDataError("Refresh the gallery to confirm your photo name.");
  return saved;
}

/** Shared commission presentation only; no message, invoice or owner-bubble mutation. */
export async function setHubRefSheetChatColor(project: ClientHubProject, owner: boolean, color: string, signal?: AbortSignal): Promise<ClientHubProject> {
  assertClientHubVersion(project.version);
  const normalized = validateRefSheetChatColor(color);
  if (normalized === "#7F0011") throw new ClientHubDataError("That color is reserved for Taylor’s messages. Choose another hex color.");
  const result = await call(project, owner, "tmcHubSetRefSheetChatColor", { projectId: project.projectId, expectedVersion: project.version, color: normalized }, signal);
  const saved = decodeClientHubProject(result.project, project.projectId);
  if (saved.clientId !== project.clientId || saved.version !== project.version + 1 || saved.refSheetChatColor !== normalized) throw new ClientHubDataError("The chat color save could not be verified. Refresh this commission.");
  return saved;
}

/** Explicit server read to reconcile an unknown color save; never retries the write. */
export async function readHubRefSheetChatColor(project: ClientHubProject, owner: boolean, signal?: AbortSignal): Promise<ClientHubProject> {
  const session = await scopedConnection(project, owner, signal);
  session.assertCurrent();
  const snapshot = await getDocFromServer(doc(session.db, "hubProjects", project.projectId));
  session.assertCurrent();
  if (!snapshot.exists()) throw new ClientHubDataError("This commission is unavailable. Refresh the Client Hub.");
  const saved = decodeClientHubProject(snapshot.data(), project.projectId);
  if (saved.clientId !== project.clientId || saved.version < project.version) throw new ClientHubDataError("This commission changed. Refresh the Client Hub.");
  return saved;
}
