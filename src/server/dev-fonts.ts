import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, unlink } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { OwnerFont, PublicOwnerContent } from "@/owner/model";
import { assetDisplayName, mediaDirectory, MEDIA_ID_PATTERN, readPrivateAssetRecord, requireDevelopmentMedia, writePrivateAssetRecord } from "./dev-media";
import { TaylorApiError } from "./taylor-auth";

export const MAX_FONT_BYTES = 4 * 1024 * 1024;
export const MAX_FONT_EXPANDED_BYTES = 32 * 1024 * 1024;
export const FONT_SOURCE_PATTERN = /^\/api\/fonts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const FONT_MIMES = { woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as const;
type FontFormat = keyof typeof FONT_MIMES;
export type StoredFont = OwnerFont & { bytes: number; storage: "development-disk"; createdAt: string };
const invalid = () => new TaylorApiError(415, "This is not a supported, safely readable font. Choose a fresh WOFF, WOFF2, TTF or OTF file; collections, SVG fonts and archives are not supported.");

function fontChecksum(bytes: Buffer, offset: number, length: number, head = false): number {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    let word = 0;
    for (let j = 0; j < 4; j++) word = (word << 8) | (i + j < length && !(head && i + j >= 8 && i + j < 12) ? bytes[offset + i + j] : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/** Reject disguised executables, collections, unreasonable expansions and out-of-range tables before parsing. */
export function inspectFontHeader(bytes: Buffer, contentType: string): FontFormat {
  if (!bytes.length) throw new TaylorApiError(400, "Choose a font file that is not empty.");
  if (bytes.length > MAX_FONT_BYTES) throw new TaylorApiError(413, "Each font must be 4 MB or smaller.");
  if (bytes.length < 12) throw invalid();
  const signature = bytes.toString("ascii", 0, 4);
  const format = signature === "wOFF" ? "woff" : signature === "wOF2" ? "woff2" : signature === "OTTO" ? "otf" : bytes.readUInt32BE(0) === 0x00010000 ? "ttf" : null;
  if (!format || contentType !== FONT_MIMES[format]) throw invalid();
  if (format === "woff" || format === "woff2") {
    const headerLength = format === "woff" ? 44 : 48;
    if (bytes.length < headerLength || bytes.readUInt32BE(8) !== bytes.length || bytes.readUInt16BE(12) < 1 || bytes.readUInt16BE(12) > 128 || bytes.readUInt16BE(14) !== 0 || bytes.readUInt32BE(16) < 12 || bytes.readUInt32BE(16) > MAX_FONT_EXPANDED_BYTES || ![0x00010000, 0x4f54544f].includes(bytes.readUInt32BE(4))) throw invalid();
    if (format === "woff") {
      const count = bytes.readUInt16BE(12), directoryEnd = 44 + count * 20;
      if (directoryEnd > bytes.length) throw invalid();
      const ranges: [number, number][] = [];
      for (let i = 0; i < count; i++) {
        const p = 44 + i * 20, tag = bytes.toString("ascii", p, p + 4), offset = bytes.readUInt32BE(p + 4), compressed = bytes.readUInt32BE(p + 8), original = bytes.readUInt32BE(p + 12);
        if (tag === "SVG " || offset < directoryEnd || offset % 4 !== 0 || compressed > original || original > MAX_FONT_EXPANDED_BYTES || offset + compressed > bytes.length) throw invalid();
        ranges.push([offset, offset + compressed]);
      }
      ranges.sort((a, b) => a[0] - b[0]);
      if (ranges.some((range, i) => i > 0 && range[0] < ranges[i - 1][1])) throw invalid();
    }
  } else {
    const count = bytes.readUInt16BE(4), directoryEnd = 12 + count * 16;
    if (count < 1 || count > 128 || directoryEnd > bytes.length) throw invalid();
    const ranges: [number, number][] = [], tags = new Set<string>();
    let end = directoryEnd, totalLength = 0;
    for (let i = 0; i < count; i++) {
      const p = 12 + i * 16, tag = bytes.toString("ascii", p, p + 4), offset = bytes.readUInt32BE(p + 8), length = bytes.readUInt32BE(p + 12);
      if (tag === "SVG " || tags.has(tag) || offset < directoryEnd || offset % 4 !== 0 || offset + length > bytes.length) throw invalid();
      totalLength += length;
      if (totalLength > bytes.length) throw invalid();
      if (fontChecksum(bytes, offset, length, tag === "head") !== bytes.readUInt32BE(p + 4)) throw invalid();
      tags.add(tag); ranges.push([offset, offset + length]); end = Math.max(end, offset + length);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (ranges.some((range, i) => i > 0 && range[0] < ranges[i - 1][1]) || bytes.length - end > 3 || bytes.subarray(end).some(byte => byte !== 0)) throw invalid();
  }
  return format;
}

// The well-known fontkit parser runs off the request event loop, with memory and wall-time limits.
// Never compile or execute glyph instructions, embedded SVG, supplied JavaScript or uploaded filenames.
const PARSER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
try {
  const fontkit = require(require.resolve('fontkit', { paths: [workerData.root] }));
  const raw = Buffer.from(workerData.bytes);
  const font = fontkit.create(raw);
  const tables = font.directory && font.directory.tables;
  if (!tables || typeof font.getGlyph !== 'function' || Object.keys(tables).length !== font.directory.numTables) throw new Error('Invalid font');
  let expanded = 0, transformed = 0;
  for (const [tag, table] of Object.entries(tables)) {
    if (['SVG ', 'sbix', 'CBDT', 'CBLC', 'EBDT', 'EBLC'].includes(tag)) throw new Error('Embedded image fonts are unsupported');
    const size = table.origLength ?? table.length;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0 || size > workerData.maxExpanded) throw new Error('Invalid table');
    expanded += size;
    const transform = table.transformLength ?? size;
    if (!Number.isInteger(transform) || transform < 0 || transform > workerData.maxExpanded) throw new Error('Invalid transformed table');
    transformed += transform;
  }
  if (expanded > workerData.maxExpanded || transformed > workerData.maxExpanded) throw new Error('Oversize font');
  if (font.type === 'WOFF2') {
    const start = font._dataPos, size = font.directory.totalCompressedSize;
    if (!Number.isInteger(start) || !Number.isInteger(size) || size < 1 || start + size > raw.length) throw new Error('Invalid compressed font');
    const decoded = require('node:zlib').brotliDecompressSync(raw.subarray(start, start + size), { maxOutputLength: workerData.maxExpanded });
    if (decoded.length !== transformed) throw new Error('Invalid font expansion');
  }
  if (!Number.isInteger(font.numGlyphs) || font.numGlyphs < 1 || font.numGlyphs > 65535 || !Number.isFinite(font.unitsPerEm) || font.unitsPerEm < 16 || font.unitsPerEm > 16384 || !font.characterSet.length) throw new Error('Invalid or empty font');
  let commands = 0;
  for (let id = 0; id < font.numGlyphs; id++) {
    const glyph = font.getGlyph(id), path = glyph.path;
    if (!Number.isFinite(glyph.advanceWidth) || !path || !Array.isArray(path.commands)) throw new Error('Invalid glyph');
    commands += path.commands.length;
    if (commands > 2000000) throw new Error('Font outlines are too complex');
    for (const command of path.commands) if (command.args.some(value => !Number.isFinite(value))) throw new Error('Invalid outline');
  }
  if (commands === 0) throw new Error('Font has no outlines');
  const name = font.familyName || font.fullName;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Missing font name');
  parentPort.postMessage({ ok: true, name: String(name) });
} catch { parentPort.postMessage({ ok: false }); }
`;
export async function validateFont(bytes: Buffer, contentType: string): Promise<{ format: FontFormat; name: string }> {
  const format = inspectFontHeader(bytes, contentType);
  const name = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(PARSER, { eval: true, workerData: { bytes, root: process.cwd(), maxExpanded: MAX_FONT_EXPANDED_BYTES }, resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 8 } });
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (value) resolve(value); else reject(invalid());
    };
    const timer = setTimeout(() => finish(), 8_000);
    worker.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "ok" in message && message.ok && "name" in message && typeof message.name === "string") finish(message.name);
      else finish();
    });
    worker.on("error", () => finish()); worker.on("exit", () => finish());
  });
  return { format, name: assetDisplayName(name, "Uploaded font").slice(0, 100) };
}

export async function readFontBody(request: Request): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!(Object.values(FONT_MIMES) as string[]).includes(contentType)) throw invalid();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_FONT_BYTES)) throw new TaylorApiError(413, "Each font must be 4 MB or smaller.");
  if (!request.body) throw new TaylorApiError(400, "No font was received.");
  const reader = request.body.getReader(), chunks: Buffer[] = [];
  let length = 0, complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TaylorApiError(408, "The font upload timed out. Try again.")), 30_000); });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) { complete = true; break; }
      length += result.value.byteLength;
      if (length > MAX_FONT_BYTES) throw new TaylorApiError(413, "Each font must be 4 MB or smaller.");
      chunks.push(Buffer.from(result.value));
    }
    if (declared !== null && Number(declared) !== length) throw new TaylorApiError(400, "The font upload was incomplete. Try again.");
    return { bytes: Buffer.concat(chunks, length), contentType };
  } finally { if (timer) clearTimeout(timer); if (!complete) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export async function storeDevelopmentFont(bytes: Buffer, contentType: string): Promise<StoredFont> {
  requireDevelopmentMedia();
  const parsed = await validateFont(bytes, contentType);
  let filename: string | undefined, created = false;
  try {
    const directory = await mediaDirectory(), id = randomUUID();
    filename = path.join(directory, `${id}.${parsed.format}`);
    const file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    const font: StoredFont = { id, name: parsed.name, src: `/api/fonts/${id}`, format: parsed.format, bytes: bytes.length, storage: "development-disk", createdAt: new Date().toISOString() };
    await writePrivateAssetRecord(directory, `${id}.font.json`, font);
    return font;
  } catch (error) {
    if (created && filename) await unlink(filename).catch(() => undefined);
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(503, "The font could not be saved on this development server. Check its disk space and folder permissions. Your draft has not changed.");
  }
}
function isStoredFont(value: unknown, id: string): value is StoredFont {
  if (!value || typeof value !== "object") return false;
  const font = value as Partial<StoredFont>;
  return font.id === id && font.src === `/api/fonts/${id}` && typeof font.name === "string" && font.name.length <= 100 && typeof font.format === "string" && Object.hasOwn(FONT_MIMES, font.format) && font.storage === "development-disk" && typeof font.bytes === "number" && font.bytes > 0 && font.bytes <= MAX_FONT_BYTES && typeof font.createdAt === "string" && Number.isFinite(Date.parse(font.createdAt));
}
export async function listDevelopmentFonts(): Promise<StoredFont[]> {
  const directory = await mediaDirectory(), fonts: StoredFont[] = [], entries = await opendir(directory);
  for await (const entry of entries) {
    const id = entry.name.replace(/\.font\.json$/, "");
    if (!entry.isFile() || !entry.name.endsWith(".font.json") || !MEDIA_ID_PATTERN.test(id)) continue;
    try {
      const font = await readPrivateAssetRecord(directory, entry.name);
      if (!isStoredFont(font, id)) continue;
      const info = await lstat(path.join(directory, `${id}.${font.format}`));
      if (info.isFile() && !info.isSymbolicLink() && info.size === font.bytes) fonts.push(font);
    } catch { /* Skip damaged metadata, without deleting uploaded originals. */ }
  }
  return fonts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function readDevelopmentFont(id: string): Promise<{ bytes: Buffer; contentType: string; format: FontFormat }> {
  requireDevelopmentMedia();
  if (!MEDIA_ID_PATTERN.test(id)) throw new TaylorApiError(404, "Font not found.");
  id = id.toLowerCase();
  try {
    const directory = await mediaDirectory(), record = await readPrivateAssetRecord(directory, `${id}.font.json`);
    if (!isStoredFont(record, id)) throw new Error("Invalid font record");
    const filename = path.join(directory, `${id}.${record.format}`), info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== record.bytes) throw new Error("Invalid font file");
    const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.ino !== info.ino || stat.dev !== info.dev || stat.size !== record.bytes) throw new Error("Invalid font file");
      const bytes = await file.readFile(), contentType = FONT_MIMES[record.format];
      inspectFontHeader(bytes, contentType);
      return { bytes, contentType, format: record.format };
    } finally { await file.close(); }
  } catch { throw new TaylorApiError(404, "Font not found."); }
}
/** Publication projection retains only font references used in public site styles. */
export function publicContentReferencesFont(content: PublicOwnerContent, source: string): boolean {
  if (!FONT_SOURCE_PATTERN.test(source)) return false;
  const font = content.fonts?.find(item => item.src.toLowerCase() === source.toLowerCase());
  if (!font) return false;
  const used = (style: { fontId?: string } | undefined) => style?.fontId === font.id;
  return content.design?.bodyFontId === font.id || content.design?.headingFontId === font.id
    || Object.values(content.contentOverrides?.styles ?? {}).some(used)
    || content.pages.some(page => used(page.titleAppearance) || page.blocks.some(block => used(block.appearance)));
}
