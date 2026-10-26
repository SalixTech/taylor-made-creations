import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PublicOwnerContent } from "@/owner/model";
import { TaylorApiError } from "./taylor-auth";

/** Development adapter only. Never use a Vercel/production ephemeral filesystem as storage. */
export const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MEDIA_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const MEDIA_SOURCE_PATTERN = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type StagedMedia = UploadedMedia & { name: string; createdAt: string; trashedAt?: string | null; revision?: number };
type StoredMedia = StagedMedia & { emptiedAt?: string };
export type EmptyTrashEntry = { id: string; trashedAt: string; revision: number };
export type EmptyTrashOutcome = { id: string; status: "removed" | "already-removed" | "changed" | "failed" };
export const EMPTY_TRASH_BATCH_SIZE = 100;
export type UploadedMedia = { id: string; src: string; width: number; height: number; bytes: number; contentType: "image/webp"; storage: "development-disk" };
const unavailable = "Photo uploads are not connected on this server. Development uploads need a persistent local development server; production needs an authorized storage service.";
export function developmentMediaEnabled(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.TMC_DEV_MEDIA_ENABLED !== "false";
}
export function requireDevelopmentMedia(): void {
  if (!developmentMediaEnabled()) throw new TaylorApiError(503, unavailable);
}
function containedIn(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
export async function mediaDirectory(): Promise<string> {
  requireDevelopmentMedia();
  const directory = path.resolve(process.env.TMC_DEV_MEDIA_DIR || path.join(process.cwd(), ".tmc-media"));
  // Uploads must never enter Next's automatically public static tree.
  if (containedIn(path.resolve(process.cwd(), "public"), directory)) throw new TaylorApiError(503, "The development photo folder must be outside the public folder.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  const actual = path.resolve(await realpath(directory));
  const samePath = process.platform === "win32" ? actual.toLowerCase() === directory.toLowerCase() : actual === directory;
  if (!info.isDirectory() || info.isSymbolicLink() || !samePath) throw new TaylorApiError(503, "The development photo folder must be a real private directory, not a symbolic link.");
  return directory;
}
function imageFormat(bytes: Buffer): "png" | "jpeg" | "webp" | "gif" | "avif" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "gif";
  // AVIF is an ISO BMFF file with an explicit AV1 image brand, not generic HEIC.
  if (bytes.length >= 24 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize >= 24 && boxSize <= Math.min(bytes.length, 1024) && boxSize % 4 === 0) {
      const brands = [bytes.toString("ascii", 8, 12)];
      for (let offset = 16; offset < boxSize; offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
      if (brands.includes("avif") || brands.includes("avis")) return "avif";
    }
  }
  return null;
}
/** MIME + magic + complete decode. Re-encoding removes EXIF/location and appended active payloads. */
export async function normalizeMedia(bytes: Buffer, contentType: string): Promise<{ data: Buffer; width: number; height: number }> {
  if (!bytes.length) throw new TaylorApiError(400, "Choose a photo file that is not empty.");
  if (bytes.length > MAX_MEDIA_BYTES) throw new TaylorApiError(413, "Each photo must be 12 MB or smaller. You can add as many photos as your saved document can hold.");
  const format = imageFormat(bytes);
  if (!format || contentType !== `image/${format}`) throw new TaylorApiError(415, "The file contents must match its PNG, JPEG, WebP, GIF or AVIF file type. SVG and other file types are not supported.");
  try {
    const input = sharp(bytes, { animated: true, failOn: "warning", limitInputPixels: MAX_MEDIA_PIXELS });
    const metadata = await input.metadata();
    const frameHeight = metadata.pageHeight ?? metadata.height ?? 0;
    const width = metadata.width ?? 0;
    const frames = metadata.pages ?? 1;
    if ((format === "avif" ? metadata.format !== "heif" || metadata.compression !== "av1" : metadata.format !== format) || !width || !frameHeight || width > 20_000 || frameHeight > 20_000 || frames > 256 || width * frameHeight * frames > MAX_MEDIA_PIXELS) throw new TaylorApiError(413, "This photo is too large to process safely. Use up to 40 million total pixels and 256 animation frames.");
    const { data, info } = await input.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_MEDIA_BYTES) throw new TaylorApiError(413, "The processed photo is larger than 12 MB. Please resize it and try again.");
    return { data, width: info.width, height: info.pageHeight ?? info.height };
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(415, "This photo could not be decoded safely. It may be damaged or too large. Try exporting a fresh PNG, JPEG, WebP, GIF or AVIF.");
  }
}

/** A raw one-file request avoids unbounded multipart buffering and filename/path handling. */
export async function readMediaBody(request: Request): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(contentType)) throw new TaylorApiError(415, "Upload a PNG, JPEG, WebP, GIF or AVIF photo, one file per request.");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_MEDIA_BYTES)) throw new TaylorApiError(413, "Each photo must be 12 MB or smaller.");
  if (!request.body) throw new TaylorApiError(400, "No photo was received.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TaylorApiError(408, "The photo upload timed out. Please try again.")), 30_000); });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) { complete = true; break; }
      length += result.value.byteLength;
      if (length > MAX_MEDIA_BYTES) throw new TaylorApiError(413, "Each photo must be 12 MB or smaller.");
      chunks.push(Buffer.from(result.value));
    }
    if (declared !== null && Number(declared) !== length) throw new TaylorApiError(400, "The photo upload was incomplete. Please try again.");
    return { bytes: Buffer.concat(chunks, length), contentType };
  } finally {
    if (timer) clearTimeout(timer);
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function storeDevelopmentMedia(bytes: Buffer, contentType: string, name = "Uploaded photo"): Promise<StagedMedia> {
  requireDevelopmentMedia();
  const normalized = await normalizeMedia(bytes, contentType);
  let filename: string | undefined;
  let created = false;
  try {
    const directory = await mediaDirectory();
    const id = randomUUID();
    filename = path.join(directory, `${id}.webp`);
    const file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    try { await file.writeFile(normalized.data); await file.sync(); } finally { await file.close(); }
    const media: StagedMedia = { id, src: `/api/media/${id}`, width: normalized.width, height: normalized.height, bytes: normalized.data.length, contentType: "image/webp", storage: "development-disk", name: assetDisplayName(name, "Uploaded photo"), createdAt: new Date().toISOString() };
    // One sidecar per UUID avoids a lost-update-prone global JSON index. Bytes never enter Firestore.
    await writePrivateAssetRecord(directory, `${id}.photo.json`, media);
    return media;
  } catch (error) {
    if (created && filename) await unlink(filename).catch(() => undefined);
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(503, "The photo could not be saved to the development disk. Check its free space and folder permissions, then try again. Nothing was added to your draft.");
  }
}
export async function readDevelopmentMedia(id: string): Promise<Buffer> {
  requireDevelopmentMedia();
  if (!MEDIA_ID_PATTERN.test(id)) throw new TaylorApiError(404, "Photo not found.");
  try {
    const directory = await mediaDirectory();
    const filename = path.join(directory, `${id.toLowerCase()}.webp`);
    // lstat also protects platforms where O_NOFOLLOW is not available.
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MEDIA_BYTES || info.size === 0) throw new TaylorApiError(404, "Photo not found.");
    const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_MEDIA_BYTES || stat.ino !== info.ino || stat.dev !== info.dev) throw new TaylorApiError(404, "Photo not found.");
      const data = await file.readFile();
      if (imageFormat(data) !== "webp") throw new TaylorApiError(404, "Photo not found.");
      return data;
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(404, "Photo not found.");
  }
}
/** Only public content image fields grant anonymous reads, never IDs or arbitrary text. */
export function publicContentReferencesMedia(content: PublicOwnerContent, source: string): boolean {
  if (!MEDIA_SOURCE_PATTERN.test(source)) return false;
  const same = (src: string) => src.toLowerCase() === source.toLowerCase();
  return Object.values(content.contentOverrides?.images ?? {}).some(image => image && same(image.src))
    || same(content.home.image.src)
    || content.gallery.some(photo => same(photo.src))
    || content.premades.some(item => same(item.image) || item.photos?.some(photo => same(photo.src)))
    || content.pages.some(page => page.blocks.some(block => (block.type === "image" || block.type === "feature") && same(block.src)));
}

/** Display names are metadata only, never paths or HTML. */
export function assetDisplayName(value: string, fallback: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150) || fallback;
}
export function uploadedAssetName(request: Request, fallback: string): string {
  const name = request.headers.get("x-tmc-file-name");
  if (!name || name.length > 1800) return fallback;
  try { return assetDisplayName(decodeURIComponent(name), fallback); } catch { return fallback; }
}
export async function writePrivateAssetRecord(directory: string, filename: string, value: object): Promise<void> {
  const file = await open(path.join(directory, filename), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
}
export async function readPrivateAssetRecord(directory: string, filename: string): Promise<unknown> {
  const target = path.join(directory, filename);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > 4096) throw new Error("Invalid asset record");
  const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.ino !== info.ino || stat.dev !== info.dev || stat.size > 4096) throw new Error("Invalid asset record");
    // Bound the read itself, including a file that grows after stat().
    const bytes = Buffer.alloc(4097);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > 4096) throw new Error("Invalid asset record");
    return JSON.parse(bytes.toString("utf8", 0, size));
  } finally { await file.close(); }
}
function validAssetDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 32 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
/** Return an allowlisted projection, never arbitrary fields from a private sidecar. */
async function stagedMediaRecord(directory: string, id: string): Promise<StoredMedia> {
  const raw = await readPrivateAssetRecord(directory, `${id}.photo.json`) as Partial<StoredMedia> | null;
  if (!raw || Array.isArray(raw) || raw.id !== id || raw.src !== `/api/media/${id}` || raw.storage !== "development-disk" || raw.contentType !== "image/webp"
    || typeof raw.name !== "string" || raw.name.length > 150 || !validAssetDate(raw.createdAt)
    || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || !raw.width || raw.width < 1 || raw.width > 20_000 || !raw.height || raw.height < 1 || raw.height > 20_000
    || !Number.isInteger(raw.bytes) || !raw.bytes || raw.bytes < 1 || raw.bytes > MAX_MEDIA_BYTES
    || (raw.trashedAt !== undefined && raw.trashedAt !== null && !validAssetDate(raw.trashedAt))
    || (raw.revision !== undefined && (!Number.isSafeInteger(raw.revision) || raw.revision < 0))
    || (raw.emptiedAt !== undefined && (!validAssetDate(raw.emptiedAt) || !raw.trashedAt))) throw new Error("Invalid photo record");
  const stat = await lstat(path.join(directory, `${id}.webp`));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== raw.bytes) throw new Error("Invalid photo file");
  return { id, src: `/api/media/${id}`, width: raw.width, height: raw.height, bytes: raw.bytes, contentType: "image/webp", storage: "development-disk", name: assetDisplayName(raw.name, "Uploaded photo"), createdAt: raw.createdAt, ...(raw.trashedAt !== undefined ? { trashedAt: raw.trashedAt } : {}), ...(raw.revision !== undefined ? { revision: raw.revision } : {}), ...(raw.emptiedAt ? { emptiedAt: raw.emptiedAt } : {}) };
}
/** Private dev-host library persists across picker opens and browser sessions; no fixed count cap. */
export async function listDevelopmentMedia(includeTrash = false): Promise<StagedMedia[]> {
  const directory = await mediaDirectory(), records: StagedMedia[] = [];
  const entries = await opendir(directory);
  for await (const entry of entries) {
    const id = entry.name.replace(/\.photo\.json$/, "");
    if (!entry.isFile() || !entry.name.endsWith(".photo.json") || !MEDIA_ID_PATTERN.test(id)) continue;
    try {
      const media = await stagedMediaRecord(directory, id);
      if (!media.emptiedAt && (includeTrash || !media.trashedAt)) records.push(media);
    } catch { /* Invalid/missing records cannot turn into public files or break healthy uploads. */ }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const photoMutations = new Map<string, Promise<void>>();
/** Shared in-process queue and exclusive on-disk lock for Trash, Restore and Empty Trash. */
async function mutateMediaRecord<T>(id: string, change: (current: StoredMedia) => { next?: StoredMedia; result: T }): Promise<T> {
  requireDevelopmentMedia();
  if (!MEDIA_ID_PATTERN.test(id)) throw new TaylorApiError(400, "Choose a valid temporary photo.");
  const directory = await mediaDirectory();
  id = id.toLowerCase();
  const target = path.join(directory, `${id}.photo.json`);
  const prior = photoMutations.get(target) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => gate);
  photoMutations.set(target, tail);
  await prior;
  let temporary: string | undefined;
  let lock: string | undefined;
  try {
    // Never follow/remove somebody else's lock or infer that a lock is stale.
    const lockPath = path.join(directory, `${id}.photo.lock`);
    try {
      const handle = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      lock = lockPath;
      await handle.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new TaylorApiError(409, "This photo is being updated. Refresh and try again. If this persists after a development-server restart, its private photo lock needs to be checked.");
      throw error;
    }
    let current: StoredMedia;
    try { current = await stagedMediaRecord(directory, id); } catch { throw new TaylorApiError(404, "Photo not found in the temporary library."); }
    const { next, result } = change(current);
    if (next) {
      const filename = `${id}.${randomUUID()}.photo.tmp`;
      const temporaryPath = path.join(directory, filename);
      const file = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      temporary = temporaryPath;
      try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, target);
      temporary = undefined;
    }
    return result;
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(503, "The photo library could not be updated. Its image bytes and draft references have not been removed. Refresh to check its current status.");
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
    if (lock) await unlink(lock).catch(() => undefined);
    release();
    if (photoMutations.get(target) === tail) photoMutations.delete(target);
  }
}
/** Metadata-only Trash. Never remove bytes: drafts and published references remain valid. */
export async function setDevelopmentMediaTrash(id: string, action: "trash" | "restore"): Promise<StagedMedia> {
  requireDevelopmentMedia();
  if (action !== "trash" && action !== "restore") throw new TaylorApiError(400, "Choose a valid photo and Trash or Restore action.");
  return mutateMediaRecord(id, current => {
    if (current.emptiedAt) throw new TaylorApiError(409, "This entry was permanently removed from the temporary library. It cannot be restored from Trash. Existing photos remain unchanged.");
    if ((current.revision ?? 0) >= Number.MAX_SAFE_INTEGER) throw new TaylorApiError(409, "This photo revision needs to be checked before changing the library.");
    const media: StagedMedia = { ...current, revision: (current.revision ?? 0) + 1, trashedAt: action === "trash" ? current.trashedAt || new Date().toISOString() : null };
    return { next: media, result: media };
  });
}

/** Library removal only. No complete, atomic reference registry exists across unsaved
 * edits, local/cloud workspaces, private previews, named drafts and publications.
 * Consequently ALL image bytes are retained, including apparently unused images.
 * A tombstone makes retries idempotent and prevents Restore from resurrecting entries. */
export async function emptyDevelopmentMediaTrash(entries: EmptyTrashEntry[]): Promise<EmptyTrashOutcome[]> {
  requireDevelopmentMedia();
  const confirmed = validateEmptyTrashEntries(entries);
  const outcomes: EmptyTrashOutcome[] = [];
  for (const entry of confirmed) {
    try {
      outcomes.push(await mutateMediaRecord<EmptyTrashOutcome>(entry.id, current => {
        if (current.trashedAt !== entry.trashedAt || (current.revision ?? 0) !== entry.revision) return { result: { id: entry.id, status: "changed" } };
        if (current.emptiedAt) return { result: { id: entry.id, status: "already-removed" } };
        return { next: { ...current, emptiedAt: new Date().toISOString() }, result: { id: entry.id, status: "removed" } };
      }));
    } catch { outcomes.push({ id: entry.id, status: "failed" }); }
  }
  return outcomes;
}
function validateEmptyTrashEntries(raw: unknown): EmptyTrashEntry[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > EMPTY_TRASH_BATCH_SIZE) throw new TaylorApiError(400, "Confirm between 1 and 100 temporary Trash entries per request.");
  const seen = new Set<string>();
  return raw.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || typeof value.id !== "string" || !MEDIA_ID_PATTERN.test(value.id) || !validAssetDate(value.trashedAt)) throw new TaylorApiError(400, "Confirm only photo IDs and their current Trash timestamps and revisions.");
    const id = value.id.toLowerCase();
    if (seen.has(id)) throw new TaylorApiError(400, "Each confirmed Trash entry must appear once.");
    seen.add(id);
    return { id, trashedAt: value.trashedAt, revision: value.revision };
  });
}

/** Small, streamed and strict mutation request; no paths or client metadata are accepted. */
async function readPhotoActionJson(request: Request, maxBytes: number): Promise<unknown> {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new TaylorApiError(403, "Manage photos from Taylor’s Space on this site.");
  if (request.headers.get("content-type")?.trim().toLowerCase() !== "application/json") throw new TaylorApiError(415, "Send a JSON photo action.");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new TaylorApiError(413, "This photo action is too large.");
  if (!request.body) throw new TaylorApiError(400, "Choose a photo action.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0, complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TaylorApiError(408, "The photo action timed out. Refresh and try again.")), 10_000); });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) { complete = true; break; }
      length += result.value.byteLength;
      if (length > maxBytes) throw new TaylorApiError(413, "This photo action is too large.");
      chunks.push(Buffer.from(result.value));
    }
    if (declared !== null && Number(declared) !== length) throw new TaylorApiError(400, "The photo action was incomplete.");
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks, length).toString("utf8")); } catch { throw new TaylorApiError(400, "Choose a valid JSON photo action."); }
    return raw;
  } finally {
    if (timer) clearTimeout(timer);
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function readMediaTrashRequest(request: Request): Promise<{ id: string; action: "trash" | "restore" }> {
  const raw = await readPhotoActionJson(request, 512);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 2 || !Object.hasOwn(raw, "id") || !Object.hasOwn(raw, "action")) throw new TaylorApiError(400, "Choose only a photo ID and Trash or Restore action.");
  const value = raw as { id: unknown; action: unknown };
  if (typeof value.id !== "string" || !MEDIA_ID_PATTERN.test(value.id) || (value.action !== "trash" && value.action !== "restore")) throw new TaylorApiError(400, "Choose a valid photo and Trash or Restore action.");
  return { id: value.id.toLowerCase(), action: value.action };
}
export async function readEmptyMediaTrashRequest(request: Request): Promise<EmptyTrashEntry[]> {
  const raw = await readPhotoActionJson(request, 16_384);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 2
    || !("action" in raw) || raw.action !== "empty-trash" || !("entries" in raw)) throw new TaylorApiError(400, "Explicitly confirm the temporary Trash entries to remove.");
  return validateEmptyTrashEntries(raw.entries);
}
