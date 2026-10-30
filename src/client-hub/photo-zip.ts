/** Minimal ZIP STORE writer. Private bytes stay in memory; paths cannot escape their folder. */
export const HUB_ZIP_MAX_BYTES = 100 * 1024 * 1024;
export const HUB_ZIP_MAX_FILES = 200;
export function safeArchiveName(value: string, fallback = "photos"): string {
  const name = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "-").replace(/^\.+|[. ]+$/g, "").trim().slice(0, 140);
  return name && name !== "." && name !== ".." ? (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name) : fallback;
}
const table = Array.from({ length: 256 }, (_, n) => { let crc = n; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const value of bytes) crc = table[(crc ^ value) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export async function createPhotoZip(entries: { name: string; blob: Blob }[], signal?: AbortSignal): Promise<Blob> {
  if (!entries.length || entries.length > HUB_ZIP_MAX_FILES || entries.reduce((sum, item) => sum + item.blob.size, 0) > HUB_ZIP_MAX_BYTES) throw new Error("A ZIP supports 1–200 photos up to 100 MB. Download a smaller folder instead.");
  const chunks: BlobPart[] = [], directory: BlobPart[] = [], names = new Set<string>(); let offset = 0, directorySize = 0;
  for (const item of entries) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await item.blob.arrayBuffer()); signal?.throwIfAborted();
    const original = item.name.split(/[\\/]/).map(part => safeArchiveName(part)).join("/");
    let name = original, suffix = 2;
    while (names.has(name.toLowerCase())) { const dot = original.lastIndexOf("."); name = dot > original.lastIndexOf("/") ? `${original.slice(0, dot)}-${suffix++}${original.slice(dot)}` : `${original}-${suffix++}`; }
    names.add(name.toLowerCase()); const encoded = new TextEncoder().encode(name), crc = crc32(bytes);
    const local = new Uint8Array(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, encoded.length, true);
    chunks.push(local, encoded, bytes);
    const central = new Uint8Array(46), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, encoded.length, true); cv.setUint32(42, offset, true);
    directory.push(central, encoded); directorySize += central.length + encoded.length; offset += local.length + encoded.length + bytes.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  signal?.throwIfAborted(); return new Blob([...chunks, ...directory, end], { type: "application/zip" });
}
