/** IDs, not display names, form every Storage path. No paths or URLs are accepted as IDs. */
export const CLOUD_FILE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const CLOUD_PHOTO_SOURCE = /^\/api\/cloud-media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
export const CLOUD_BUCKET = "taylor-made-creations.firebasestorage.app";
export const CLOUD_FILE_MAX_BYTES = 500_000_000;
export const CLOUD_FONT_MAX_BYTES = 4_000_000;
export const CLOUD_FONTS_FOLDER_ID = "00000000-0000-4000-8000-000000000001";
export const CLOUD_FONT_SOURCE = /^\/api\/cloud-fonts\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
export const CLOUD_FONT_TYPES = { woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as const;
export const CLOUD_PRIVATE_EXTENSIONS = ["pdf", "zip", "7z", "rar", "mp4", "mov", "webm", "m4v", "avi", "mkv", "mp3", "wav", "flac", "psd", "psb", "ai", "eps", "afdesign", "afphoto", "clip", "kra", "blend", "obj", "stl", "dxf", "plt", "pes", "dst", "jef", "vp3", "exp", "hus", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf", "odt", "ods"];
export const CLOUD_UPLOAD_ACCEPT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".woff", ".woff2", ".ttf", ".otf", ...CLOUD_PRIVATE_EXTENSIONS.map(extension => `.${extension}`)].join(",");
export const CLOUD_PHOTO_MAX_BYTES = 12 * 1024 * 1024;
export const CLOUD_PHOTO_INPUT_MAX_BYTES = 30_000_000;
export const CLOUD_FOLDER_LIMIT = 200;
export const CLOUD_FOLDER_DEPTH = 8;
export const PUBLIC_PHOTO_LIMIT = 500;
export type CloudFile = { id: string; schemaVersion: 1; revision: number; kind: "photo" | "pdf" | "file" | "font"; name: string; parentId: string; contentType: "image/webp" | "application/pdf" | "application/octet-stream" | "font/woff" | "font/woff2" | "font/ttf" | "font/otf"; bytes: number; width: number; height: number; status: "uploading" | "ready" | "deleting"; trashedAt: string | null; createdAt: string; updatedAt: string };
export type CloudFolder = { name: string; parentId: string; trashedAt: string | null };
export type CloudFolders = { schemaVersion: 1; revision: number; folders: Record<string, CloudFolder> };
export const emptyCloudFolders = (): CloudFolders => ({ schemaVersion: 1, revision: 0, folders: {} });
export function validFileName(value: unknown): value is string { return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= 150 && !/[\u0000-\u001f\u007f/\\]/.test(value) && value !== "." && value !== ".."; }
export function assertCloudId(id: string): void { if (!CLOUD_FILE_ID.test(id)) throw new Error("Choose a valid cloud file or folder."); }
export function cloudPhotoSource(id: string): string { assertCloudId(id); return `/api/cloud-media/${id}`; }
export function cloudObjectPath(file: Pick<CloudFile, "id" | "kind">): string { assertCloudId(file.id); return file.kind === "photo" ? `photos/${file.id}.webp` : file.kind === "pdf" ? `files/${file.id}.pdf` : file.kind === "font" ? `fonts/${file.id}.font` : `files/${file.id}.bin`; }
const iso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function decodeCloudFile(raw: unknown, id: string): CloudFile {
  assertCloudId(id);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Cloud file metadata could not be read safely.");
  const file = raw as CloudFile;
  const keys = ["schemaVersion", "revision", "kind", "name", "parentId", "contentType", "bytes", "width", "height", "status", "trashedAt", "createdAt", "updatedAt"];
  if (Object.keys(file).length !== keys.length || Object.keys(file).some(key => !keys.includes(key)) || file.schemaVersion !== 1 || !Number.isSafeInteger(file.revision) || file.revision < 1 || !validFileName(file.name)
    || !(file.parentId === "root" || CLOUD_FILE_ID.test(file.parentId)) || !["uploading", "ready", "deleting"].includes(file.status) || !(file.trashedAt === null || iso(file.trashedAt)) || !iso(file.createdAt) || !iso(file.updatedAt)
    || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !Number.isSafeInteger(file.width) || !Number.isSafeInteger(file.height)
    || !(file.kind === "photo" && file.contentType === "image/webp" && file.bytes <= CLOUD_PHOTO_MAX_BYTES && file.width > 0 && file.width <= 4096 && file.height > 0 && file.height <= 4096 || file.kind === "pdf" && file.contentType === "application/pdf" && file.bytes <= CLOUD_FILE_MAX_BYTES && file.width === 0 && file.height === 0 || file.kind === "file" && file.contentType === "application/octet-stream" && file.bytes <= CLOUD_FILE_MAX_BYTES && file.width === 0 && file.height === 0 || file.kind === "font" && Object.values(CLOUD_FONT_TYPES).includes(file.contentType as "font/woff") && file.bytes <= CLOUD_FONT_MAX_BYTES && file.width === 0 && file.height === 0)) throw new Error("Cloud file metadata is invalid. Nothing was overwritten.");
  return { ...file, id };
}
export function folderAncestors(registry: CloudFolders, parentId: string): string[] {
  const seen = new Set<string>(); let current = parentId;
  while (current !== "root") {
    assertCloudId(current);
    if (seen.has(current) || seen.size >= CLOUD_FOLDER_DEPTH || !Object.hasOwn(registry.folders, current)) throw new Error("This folder path is missing, too deep, or contains a cycle.");
    seen.add(current); current = registry.folders[current].parentId;
  }
  return [...seen];
}
export function decodeCloudFolders(raw: unknown): CloudFolders {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Folder metadata is invalid.");
  const value = raw as CloudFolders;
  if (Object.keys(value).length !== 3 || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.folders || typeof value.folders !== "object" || Array.isArray(value.folders) || Object.keys(value.folders).length > CLOUD_FOLDER_LIMIT) throw new Error("Folder metadata is invalid.");
  for (const [id, folder] of Object.entries(value.folders)) {
    assertCloudId(id);
    if (!folder || Object.keys(folder).length !== 3 || !validFileName(folder.name) || !(folder.trashedAt === null || iso(folder.trashedAt))) throw new Error("Folder metadata is invalid.");
    folderAncestors(value, id);
  }
  return value;
}
export function isFolderTrashed(registry: CloudFolders, parentId: string): boolean { return folderAncestors(registry, parentId).some(id => registry.folders[id].trashedAt !== null); }
export function assertActiveFolder(registry: CloudFolders, parentId: string): void { if (isFolderTrashed(registry, parentId)) throw new Error("Restore this folder before adding or moving files into it."); }
/** Only actual image fields from the already projected PUBLIC snapshot are indexed. */
export function publishedCloudPhotoIds(content: import("./model").PublicOwnerContent): string[] {
  const sources = [...Object.values(content.contentOverrides?.images ?? {}).map(image => image.src), content.home.image.src, ...content.gallery.map(image => image.src), ...content.premades.flatMap(item => [item.image, ...(item.photos?.map(photo => photo.src) ?? [])]), ...content.pages.flatMap(page => page.blocks.flatMap(block => block.type === "image" || block.type === "feature" ? [block.src] : []))];
  const ids = [...new Set(sources.flatMap(source => source.match(CLOUD_PHOTO_SOURCE)?.[1] ?? []))].sort();
  if (ids.length > PUBLIC_PHOTO_LIMIT) throw new Error(`A publication can contain up to ${PUBLIC_PHOTO_LIMIT} distinct cloud photos. Nothing was published.`);
  return ids;
}

export function cloudFileToOwnerFont(file: CloudFile): import("./model").OwnerFont | null {
  const format = Object.entries(CLOUD_FONT_TYPES).find(([, type]) => type === file.contentType)?.[0] as keyof typeof CLOUD_FONT_TYPES | undefined;
  return file.kind === "font" && file.status === "ready" && !file.trashedAt && format ? { id: file.id, name: file.name.replace(/\.(woff2?|ttf|otf)$/i, "").slice(0, 100), src: `/api/cloud-fonts/${file.id}`, format } : null;
}
export function publishedCloudAssetIds(content: import("./model").PublicOwnerContent): string[] {
  const ids = [...new Set([...publishedCloudPhotoIds(content), ...(content.fonts ?? []).flatMap(font => font.src.match(CLOUD_FONT_SOURCE)?.[1] ?? [])])].sort();
  if (ids.length > PUBLIC_PHOTO_LIMIT) throw new Error(`A publication can contain up to ${PUBLIC_PHOTO_LIMIT} cloud photos and fonts.`);
  return ids;
}

export const CLOUD_ORIGINAL_PHOTO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
export function isOriginalCloudPhoto(file: CloudFile): boolean { return file.kind === "file" && Object.hasOwn(CLOUD_ORIGINAL_PHOTO_TYPES, file.name.toLowerCase().split(".").pop() ?? ""); }

/** Exact app-owned references only; never treat arbitrary URLs as storage paths. */
export function cloudReferencedAssetIds(value: unknown): string[] {
  const ids = new Set<string>(); const seen = new Set<object>();
  function visit(node: unknown, depth: number) {
    if (depth > 100) throw new Error("Content is too deeply nested to check its file references.");
    if (typeof node === "string") { const match = node.match(/^\/api\/(?:cloud-media|cloud-fonts|cloud-files)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\?kind=(?:file|pdf))?$/); if (match) ids.add(match[1]); }
    else if (node && typeof node === "object") { if (seen.has(node)) throw new Error("Content contains a circular reference."); seen.add(node); for (const entry of Object.values(node)) visit(entry, depth + 1); seen.delete(node); }
  }
  visit(value, 0); return [...ids].sort();
}
