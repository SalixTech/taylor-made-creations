"use client";

import { WEBSITE_WORKSPACE, workspaceDocument, workspaceObject, workspaceCallableInput, workspaceBrowserKey } from "./website-workspace-config";

import { decodePrivateGallery, type PrivateGallery } from "./private-gallery";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore/lite";
import { getMetadata, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import { taylorOwnerSession } from "./taylor-services-client";
import { notifyPrivateAssetLibraryChanged } from "./asset-library-client";
import { assertActiveFolder, assertCloudId, CLOUD_BUCKET, CLOUD_DOCUMENT_MAX_BYTES, CLOUD_DOCUMENTS_FOLDER_ID, CLOUD_FILE_MAX_BYTES, CLOUD_FONT_MAX_BYTES, CLOUD_FONTS_FOLDER_ID, CLOUD_COMMISSIONS_FOLDER_ID, isProtectedCloudFolder, CLOUD_FONT_TYPES, CLOUD_PRIVATE_EXTENSIONS, CLOUD_ORIGINAL_PHOTO_TYPES, isOriginalCloudPhoto, CLOUD_PHOTO_MAX_BYTES, CLOUD_PHOTO_INPUT_MAX_BYTES, cloudObjectPath, cloudPhotoSource, decodeCloudFile, decodeCloudFolders, emptyCloudFolders, validFileName, type CloudFile, type CloudFolders } from "./cloud-files-model";

import { decodeCloudFileOrder, emptyCloudFileOrder, reorderCloudKeys, type CloudFileOrder } from "./cloud-file-order";

export const CLOUD_FILES_EVENT = workspaceBrowserKey("cloud-files");
export const CLOUD_FILES_COLLECTION = workspaceDocument("ownerFiles");
export const CLOUD_FOLDERS_DOCUMENT = workspaceDocument("ownerFileFolders/current");
const changed = () => notifyPrivateAssetLibraryChanged(CLOUD_FILES_EVENT);
const message = (error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (/permission-denied|unauthorized|unauthenticated/.test(code)) return new Error("Cloud files access was denied. Check the deployed Firestore and Storage rules and sign in with Taylor’s owner account.");
  if (/bucket-not-found|project-not-found/.test(code)) return new Error("The configured Firebase Storage bucket is not available. Nothing was saved locally instead.");
  return error instanceof Error ? error : new Error("The cloud request was not confirmed. Refresh to check before retrying.");
};
async function connection() {
  const session = await taylorOwnerSession();
  if (session.auth.app.options.storageBucket !== CLOUD_BUCKET) throw new Error("The shared Storage bucket is not configured correctly. Nothing was saved locally instead.");
  const storage = getStorage(session.auth.app);
  storage.maxOperationRetryTime = 15_000;
  storage.maxUploadRetryTime = 120_000;
  return { ...session, storage };
}
function fileData(file: CloudFile) { const { id: _id, ...data } = file; void _id; return data; }
export async function readCloudFiles(): Promise<{ files: CloudFile[]; folders: CloudFolders }> {
  try {
    const session = await connection();
    const [files, folders] = await Promise.all([getDocs(collection(session.db, CLOUD_FILES_COLLECTION)), getDoc(doc(session.db, CLOUD_FOLDERS_DOCUMENT))]);
    session.assertCurrent();
    return { files: files.docs.map(item => decodeCloudFile(item.data(), item.id)), folders: folders.exists() ? decodeCloudFolders(folders.data()) : emptyCloudFolders() };
  } catch (error) { throw message(error); }
}
/** Private layout only. No file bytes, file IDs, parent IDs, or published references are rewritten. */
export async function readCloudFileOrder(parentId: string): Promise<CloudFileOrder> {
  if (parentId !== "root") assertCloudId(parentId);
  const session = await connection();
  const snapshot = await getDoc(doc(session.db, workspaceDocument("ownerFileOrder"), parentId));
  session.assertCurrent();
  return snapshot.exists() ? decodeCloudFileOrder(snapshot.data()) : emptyCloudFileOrder();
}
export async function saveCloudFileOrder(parentId: string, expected: CloudFileOrder, moving: string, targetKey: string, after: boolean): Promise<void> {
  try {
    if (parentId !== "root") assertCloudId(parentId);
    const session = await connection();
    const known = await getDocs(collection(session.db, CLOUD_FILES_COLLECTION));
    session.assertCurrent();
    await runTransaction(session.db, async transaction => {
      const orderRef = doc(session.db, workspaceDocument("ownerFileOrder"), parentId);
      const [orderSnapshot, folderSnapshot] = await Promise.all([transaction.get(orderRef), transaction.get(doc(session.db, CLOUD_FOLDERS_DOCUMENT))]);
      const folders = folderSnapshot.exists() ? decodeCloudFolders(folderSnapshot.data()) : emptyCloudFolders();
      assertActiveFolder(folders, parentId);
      const currentKeys = Object.entries(folders.folders).filter(([, folder]) => folder.parentId === parentId && !folder.trashedAt).sort((a,b) => a[1].name.localeCompare(b[1].name)).map(([id]) => `folder:${id}`);
      // Read the latest metadata in the same transaction, so moves/deletes cannot race order validation.
      const files: CloudFile[] = [];
      for (const item of known.docs) {
        const snapshot = await transaction.get(doc(session.db, CLOUD_FILES_COLLECTION, item.id));
        if (snapshot.exists()) files.push(decodeCloudFile(snapshot.data(), item.id));
      }
      currentKeys.push(...files.filter(file => file.parentId === parentId && !file.trashedAt && file.status !== "deleting").sort((a,b) => a.name.localeCompare(b.name)).map(file => `file:${file.id}`));
      const saved = orderSnapshot.exists() ? decodeCloudFileOrder(orderSnapshot.data()) : emptyCloudFileOrder();
      const next = reorderCloudKeys(saved, expected.revision, currentKeys, moving, targetKey, after);
      session.assertCurrent(); transaction.set(orderRef, next);
    });
    session.assertCurrent(); changed();
  } catch (error) { changed(); throw message(error); }
}
/** A real read probe, not a promise that writes, billing recovery, or backups work. */
export async function checkCloudStorage(): Promise<string> {
  const session = await connection();
  await getDocs(collection(session.db, CLOUD_FILES_COLLECTION)); session.assertCurrent();
  if (WEBSITE_WORKSPACE === "beta") return "Beta file-list read succeeded. Direct Storage access is intentionally disabled. Uploads and downloads are confirmed only by a successful authenticated gateway operation.";
  try { await getMetadata(ref(session.storage, workspaceObject("photos/00000000-0000-0000-0000-000000000000.webp"))); }
  catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "storage/object-not-found") throw message(error); }
  session.assertCurrent();
  return "Firestore file-list read and Storage read probe succeeded. Upload writing is confirmed only after a successful upload. Backups are not configured by this patch.";
}
export async function changeCloudFile(file: CloudFile, change: { name?: string; parentId?: string; trashedAt?: string | null }): Promise<CloudFile> {
  try {
    const session = await connection(); assertCloudId(file.id);
    const result = await runTransaction(session.db, async transaction => {
      session.assertCurrent();
      const target = doc(session.db, CLOUD_FILES_COLLECTION, file.id);
      const [snapshot, folderSnapshot] = await Promise.all([transaction.get(target), transaction.get(doc(session.db, CLOUD_FOLDERS_DOCUMENT))]);
      if (!snapshot.exists()) throw new Error("This file is missing. Refresh your File Hub.");
      const current = decodeCloudFile(snapshot.data(), file.id);
      if (current.status === "deleting") throw new Error("This file is being permanently deleted and cannot be changed.");
      if (current.revision !== file.revision) throw new Error("This file changed on another tab or device. Refresh before changing it again.");
      const folders = folderSnapshot.exists() ? decodeCloudFolders(folderSnapshot.data()) : emptyCloudFolders();
      const next = { ...current, ...change, revision: current.revision + 1, updatedAt: new Date().toISOString() };
      if (change.parentId === CLOUD_COMMISSIONS_FOLDER_ID) throw new Error("Commission files use the private commission sharing controls.");
      if (change.name !== undefined && change.name.length > 42) throw new Error("Use a file name of 42 characters or fewer.");
      if (change.parentId !== undefined) assertActiveFolder(folders, change.parentId);
      if (change.trashedAt === null) { try { assertActiveFolder(folders, next.parentId); } catch { next.parentId = "root"; } }
      decodeCloudFile(fileData(next), file.id); session.assertCurrent();
      transaction.set(target, fileData(next)); return next;
    });
    session.assertCurrent(); changed(); return result;
  } catch (error) { changed(); throw message(error); }
}
export async function changeCloudFolder(registry: CloudFolders, id: string, change: { name?: string; parentId?: string; trashedAt?: string | null }): Promise<CloudFolders> {
  assertCloudId(id);
  if (isProtectedCloudFolder(id)) throw new Error("This protected folder stays at the top of File Hub.");
  try {
    const session = await connection(); session.assertCurrent();
    const response = await httpsCallable<unknown, { folders: unknown }>(getFunctions(session.auth.app, "us-central1"), "tmcOwnerChangeCloudFolder")(workspaceCallableInput({ folderId: id, expectedRevision: registry.revision, change }));
    session.assertCurrent(); const result = decodeCloudFolders(response.data.folders); changed(); return result;
  } catch (error) { changed(); throw message(error); }
}

async function normalizePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type) || !file.size || file.size > CLOUD_PHOTO_INPUT_MAX_BYTES) throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF photo no larger than 30 MB. SVG is not allowed.");
  const image = await createImageBitmap(file).catch(() => { throw new Error("This file could not be decoded as an image."); });
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error("Choose a photo with no more than 40 million pixels.");
    const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("This browser could not prepare the photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("This browser could not convert the photo.")), "image/webp", 0.9));
    if (blob.type !== "image/webp" || !blob.size || blob.size > CLOUD_PHOTO_MAX_BYTES) throw new Error("The converted photo is too large or WebP conversion is unavailable.");
    return { blob, width: canvas.width, height: canvas.height };
  } finally { image.close(); }
}
export async function uploadCloudFile(file: File, options: { parentId?: string; signal?: AbortSignal; onProgress?: (percent: number) => void; photoOnly?: boolean; preserveOriginal?: boolean; websiteDocument?: boolean } = {}): Promise<CloudFile> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const fontType = Object.hasOwn(CLOUD_FONT_TYPES, extension) ? CLOUD_FONT_TYPES[extension as keyof typeof CLOUD_FONT_TYPES] : null;
  const originalPhoto = Object.hasOwn(CLOUD_ORIGINAL_PHOTO_TYPES, extension);
  const photo = !options.preserveOriginal && ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type);
  const pdf = extension === "pdf";
  if(options.websiteDocument&&(!pdf||file.type!=="application/pdf"||options.photoOnly||options.preserveOriginal))throw new Error("Choose a PDF for this website document.");
  if (options.photoOnly && !photo) throw new Error("Choose a supported photo.");
  let prepared: { blob: Blob; width: number; height: number };
  if (photo) prepared = await normalizePhoto(file);
  else {
    if (!file.size || file.size > (options.websiteDocument?CLOUD_DOCUMENT_MAX_BYTES:fontType ? CLOUD_FONT_MAX_BYTES : CLOUD_FILE_MAX_BYTES)) throw new Error(options.websiteDocument?"Website PDFs must be no larger than 12 MiB.":fontType ? "Fonts must be no larger than 4 MB." : "Choose a non-empty file no larger than 500 MB.");
    if (!fontType && !CLOUD_PRIVATE_EXTENSIONS.includes(extension) && !(options.preserveOriginal && originalPhoto)) throw new Error("This file type is not supported. Executables, scripts and web pages are not accepted.");
    if (pdf && new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-") throw new Error("This file is not a readable PDF.");
    if (fontType && WEBSITE_WORKSPACE === "main") {
      const session = await connection();
      const check = await fetch("/api/taylor/cloud-fonts/validate", { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": fontType }, body: file, signal, cache: "no-store", credentials: "same-origin" });
      session.assertCurrent();
      if (!check.ok) throw new Error("This font could not be safely validated. Choose a valid WOFF, WOFF2, TTF or OTF file.");
    }
    prepared = { blob: file, width: 0, height: 0 };
  }
  signal?.throwIfAborted();
  if(WEBSITE_WORKSPACE==="beta"&&!photo&&!fontType&&!options.websiteDocument)throw new Error("Beta accepts website photos, fonts and explicitly selected website PDFs. Private originals are not uploaded through this website gateway.");
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, " ").trim().slice(0, 150) || "Uploaded file";
  if (!validFileName(name)) throw new Error("Choose a file with a valid name.");
  if ((fontType||options.websiteDocument) && !options.parentId) await ensureCloudSystemFolders();
  const id = crypto.randomUUID(), now = new Date().toISOString();
  if (options.parentId === CLOUD_COMMISSIONS_FOLDER_ID) throw new Error("Use the private commission sharing controls for commission files.");
  if (name.length > 42) throw new Error("Use a file name of 42 characters or fewer.");
  const record: CloudFile = { id, schemaVersion: 1, revision: 1, kind: options.websiteDocument?"document":photo ? "photo" : fontType ? "font" : pdf ? "pdf" : "file", name, parentId: options.parentId ?? (options.websiteDocument?CLOUD_DOCUMENTS_FOLDER_ID:fontType ? CLOUD_FONTS_FOLDER_ID : "root"), contentType: photo ? "image/webp" : fontType ?? (pdf ? "application/pdf" : "application/octet-stream"), bytes: prepared.blob.size, width: prepared.width, height: prepared.height, status: "uploading", trashedAt: null, createdAt: now, updatedAt: now };
  try {
    const session = await connection(); signal?.throwIfAborted();
    const target = doc(session.db, CLOUD_FILES_COLLECTION, id);
    await runTransaction(session.db, async transaction => {
      const [existing, folders] = await Promise.all([transaction.get(target), transaction.get(doc(session.db, CLOUD_FOLDERS_DOCUMENT))]);
      if (existing.exists()) throw new Error("A file already uses this identity. Nothing was overwritten.");
      assertActiveFolder(folders.exists() ? decodeCloudFolders(folders.data()) : emptyCloudFolders(), record.parentId);
      session.assertCurrent(); signal?.throwIfAborted(); transaction.set(target, fileData(record));
    });
    session.assertCurrent(); signal?.throwIfAborted();
    if(WEBSITE_WORKSPACE==="beta"||record.kind==="document"){
      const bytes=new Uint8Array(await prepared.blob.arrayBuffer());let binary="";for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));session.assertCurrent();signal?.throwIfAborted();
      const result=await httpsCallable<unknown,{file:unknown}>(getFunctions(session.auth.app,"us-central1"),"tmcOwnerWebsiteAssets")({workspace:WEBSITE_WORKSPACE,action:"upload",fileId:record.id,expectedRevision:record.revision,base64:btoa(binary)});session.assertCurrent();signal?.throwIfAborted();const raw=result.data.file as Record<string,unknown>;const {id:returnedId,...data}=raw;if(returnedId!==record.id)throw new Error("The website upload returned another file identity.");const confirmed=decodeCloudFile(data,record.id);if(confirmed.status!=="ready"||confirmed.kind!==record.kind||confirmed.bytes!==record.bytes||confirmed.contentType!==record.contentType)throw new Error("The website upload could not be verified.");onProgress?.(100);changed();return confirmed;
    }
    const task = uploadBytesResumable(ref(session.storage, workspaceObject(cloudObjectPath(record))), prepared.blob, { contentType: record.contentType, cacheControl: "private, no-store, max-age=0", contentDisposition: photo || fontType ? "inline" : "attachment", customMetadata: { fileId: id } });
    const cancel = () => { task.cancel(); };
    const unsubscribe = session.auth.onAuthStateChanged(() => { try { session.assertCurrent(); } catch { cancel(); } });
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await new Promise<void>((resolve, reject) => task.on("state_changed", snapshot => onProgress?.(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, () => resolve()));
    } finally { signal?.removeEventListener("abort", cancel); unsubscribe(); }
    session.assertCurrent(); signal?.throwIfAborted();
    return await confirmCloudUpload(record);
  } catch (error) { changed(); throw message(error); }
}
/** Recover a completed object after a lost response; never re-upload or overwrite bytes. */
export async function confirmCloudUpload(file: CloudFile): Promise<CloudFile> {
  try {
    const session = await connection();
    if(WEBSITE_WORKSPACE==="beta"||file.kind==="document"){const{betaAssetMetadata}=await import("./beta-assets-client");const result=await betaAssetMetadata(file.id,session);session.assertCurrent();if(result.file.status!=="ready"||result.file.kind!==file.kind||result.file.bytes!==file.bytes)throw new Error("This beta upload is not yet confirmed.");changed();return result.file;}
    const metadata = await getMetadata(ref(session.storage, workspaceObject(cloudObjectPath(file)))); session.assertCurrent();
    if (metadata.size !== file.bytes || metadata.contentType !== file.contentType || metadata.customMetadata?.fileId !== file.id) throw new Error("Uploaded bytes do not match this file’s metadata. Nothing was activated.");
    const result = await runTransaction(session.db, async transaction => {
      const target = doc(session.db, CLOUD_FILES_COLLECTION, file.id), snapshot = await transaction.get(target);
      if (!snapshot.exists()) throw new Error("The file record is missing.");
      const current = decodeCloudFile(snapshot.data(), file.id);
      if (current.status === "ready") return current;
      if (current.revision !== file.revision || current.trashedAt) throw new Error("This upload record changed. Refresh before recovering it.");
      const next: CloudFile = { ...current, status: "ready", revision: current.revision + 1, updatedAt: new Date().toISOString() };
      session.assertCurrent(); transaction.set(target, fileData(next)); return next;
    });
    session.assertCurrent(); changed(); return result;
  } catch (error) { changed(); throw message(error); }
}
export async function downloadCloudFile(file: CloudFile, signal?: AbortSignal): Promise<Blob> {
  const session = await connection();
  if(WEBSITE_WORKSPACE==="beta"||file.kind==="document"){const{readBetaWebsiteAsset}=await import("./beta-assets-client");const blob=await readBetaWebsiteAsset(file.id,session,signal);session.assertCurrent();if(blob.size!==file.bytes||blob.type!==file.contentType)throw new Error("The beta file changed. Refresh before downloading it.");return blob;}
  const url = file.kind === "photo" ? cloudPhotoSource(file.id) : file.kind === "font" ? `/api/cloud-fonts/${file.id}` : `/api/cloud-files/${file.id}?kind=${file.kind}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok || response.headers.get("content-type") !== file.contentType) throw new Error("This private file could not be downloaded. Check access and try again.");
  const blob = await response.blob(); session.assertCurrent(); signal?.throwIfAborted();
  if (blob.size !== file.bytes) throw new Error("The downloaded file is incomplete. Try again.");
  return blob;
}

export async function ensureCloudSystemFolders(): Promise<CloudFolders> {
  const session = await connection(); session.assertCurrent();
  const response = await httpsCallable<unknown, { folders: unknown }>(getFunctions(session.auth.app, "us-central1"), "tmcOwnerEnsureCloudFolders")(workspaceCallableInput({}));
  session.assertCurrent(); const result = decodeCloudFolders(response.data.folders); changed(); return result;
}
export const ensureCloudFontsFolder = ensureCloudSystemFolders;
export const ensureCloudGalleryFolder = ensureCloudSystemFolders;
export async function uploadCloudFont(file: File, options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}): Promise<CloudFile> {
  if (!Object.hasOwn(CLOUD_FONT_TYPES, file.name.toLowerCase().split(".").pop() ?? "")) throw new Error("Choose a WOFF, WOFF2, TTF or OTF font.");
  return uploadCloudFile(file, options);
}
export type CloudCleanupStatus = { available: boolean; automaticCleanupEnabled: boolean; lastRunAt: string | null; message: string };
async function maintenance(body?: unknown): Promise<Record<string, unknown>> {
  const session = await connection();
  const response = await fetch("/api/taylor/cloud-files/maintenance", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", credentials: "same-origin" });
  session.assertCurrent();
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.ok !== true) throw new Error(typeof result?.message === "string" ? result.message : "File cleanup is not enabled yet. Your files were not deleted.");
  return result;
}
export async function readCloudCleanupStatus(): Promise<CloudCleanupStatus> {
  try { const result = await maintenance(); return { available: result.available === true && result.manualDeletionConfigured === true, automaticCleanupEnabled: result.automaticCleanupEnabled === true, lastRunAt: typeof result.lastRunAt === "string" ? result.lastRunAt : null, message: result.manualDeletionConfigured !== true ? "Manual Empty Trash is held for approved setup. The cleanup backend has not confirmed the required configuration." : typeof result.message === "string" ? result.message : "Manual cleanup is configured; permissions are checked on confirmed deletion." }; }
  catch (error) { return { available: false, automaticCleanupEnabled: false, lastRunAt: null, message: error instanceof Error ? error.message : "Cleanup is not enabled." }; }
}
export async function permanentDeleteCloudFiles(files: CloudFile[]): Promise<{ deletedIds: string[]; blockedIds: string[]; failedIds: string[] }> {
  if (!files.length || files.length > 100) throw new Error("Select between 1 and 100 files per permanent-delete operation.");
  const result = await maintenance({ action: "delete", confirmation: "permanently-delete", files: files.map(file => ({ id: file.id, revision: file.revision })) });
  changed();
  return { deletedIds: Array.isArray(result.deletedIds) ? result.deletedIds as string[] : [], blockedIds: Array.isArray(result.blockedIds) ? result.blockedIds as string[] : [], failedIds: Array.isArray(result.failedIds) ? result.failedIds as string[] : [] };
}
export async function permanentlyDeleteEmptyCloudFolders(registry: CloudFolders, ids: string[]): Promise<CloudFolders> {
  await maintenance({ action: "delete-empty-folders", confirmation: "permanently-delete", revision: registry.revision, ids });
  changed(); return (await readCloudFiles()).folders;
}

export async function createCloudWebsitePhoto(file: CloudFile, options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}): Promise<CloudFile> {
  if (!isOriginalCloudPhoto(file) || file.status !== "ready" || file.trashedAt) throw new Error("Choose an available original photo.");
  if (file.bytes > CLOUD_PHOTO_INPUT_MAX_BYTES) throw new Error("Keep this original in File Hub, but choose a copy under 30 MB to create a website photo.");
  const bytes = await downloadCloudFile(file, options.signal);
  const type = CLOUD_ORIGINAL_PHOTO_TYPES[file.name.toLowerCase().split(".").pop() ?? ""];
  return uploadCloudFile(new File([bytes], file.name, { type }), { ...options, parentId: file.parentId, photoOnly: true });
}

/** Reuses the verified-owner private-gallery callable, never a public document read. */
export async function readCloudGallery(): Promise<PrivateGallery | null> {
  const session = await connection(); session.assertCurrent();
  const response = await httpsCallable<unknown, { gallery: unknown }>(getFunctions(session.auth.app, "us-central1"), "tmcOwnerReadGallery")(workspaceCallableInput({}));
  session.assertCurrent(); return response.data.gallery === null ? null : decodePrivateGallery(response.data.gallery);
}
