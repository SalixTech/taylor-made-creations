import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PublicOwnerContent } from "@/owner/model";
import { TaylorApiError } from "./taylor-auth";

/** Development adapter only. Never use a Vercel/production ephemeral filesystem as storage. */
export const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MEDIA_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const MEDIA_SOURCE_PATTERN = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type StagedMedia = UploadedMedia & { name: string; createdAt: string };
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
    return JSON.parse(await file.readFile("utf8"));
  } finally { await file.close(); }
}
/** Private dev-host library persists across picker opens and browser sessions; no fixed count cap. */
export async function listDevelopmentMedia(): Promise<StagedMedia[]> {
  const directory = await mediaDirectory(), records: StagedMedia[] = [];
  const entries = await opendir(directory);
  for await (const entry of entries) {
    const id = entry.name.replace(/\.photo\.json$/, "");
    if (!entry.isFile() || !entry.name.endsWith(".photo.json") || !MEDIA_ID_PATTERN.test(id)) continue;
    try {
      const raw = await readPrivateAssetRecord(directory, entry.name) as Partial<StagedMedia>;
      if (raw.id !== id || raw.src !== `/api/media/${id}` || raw.storage !== "development-disk" || raw.contentType !== "image/webp" || typeof raw.name !== "string" || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt)) || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || !raw.width || !raw.height || !raw.bytes || raw.bytes > MAX_MEDIA_BYTES) continue;
      const stat = await lstat(path.join(directory, `${id}.webp`));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== raw.bytes) continue;
      records.push({ ...raw, name: assetDisplayName(raw.name, "Uploaded photo") } as StagedMedia);
    } catch { /* Invalid/missing records cannot turn into public files or break healthy uploads. */ }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
