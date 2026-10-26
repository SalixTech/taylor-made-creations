export const OWNER_UID = "a4ARjp0z8ZOByKlC2AfGzmMRj843";
export const BUCKET = "taylor-made-creations.firebasestorage.app";
export const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export function objectPath(id, kind) {
  if (!ID.test(id)) throw new Error("Invalid file identity.");
  if (kind === "photo") return `photos/${id}.webp`;
  if (kind === "pdf") return `files/${id}.pdf`;
  if (kind === "font") return `fonts/${id}.font`;
  if (kind === "file") return `files/${id}.bin`;
  throw new Error("Invalid file kind.");
}
/** Return the first time the file became trashed through itself or an ancestor. */
export function trashTime(file, folders) {
  let earliest = file.trashedAt ? Date.parse(file.trashedAt) : Infinity;
  let current = file.parentId; const seen = new Set();
  while (current !== "root") {
    if (!ID.test(current) || seen.has(current) || seen.size >= 8 || !folders[current]) throw new Error("Invalid folder graph; cleanup stopped safely.");
    seen.add(current); const folder = folders[current];
    if (folder.trashedAt) earliest = Math.min(earliest, Date.parse(folder.trashedAt));
    current = folder.parentId;
  }
  if (!Number.isFinite(earliest)) return null;
  return Math.max(earliest, Date.parse(file.createdAt));
}
export function canPurge({ file, folders, publishedIds, now, automatic, revision }) {
  if (!file || !["photo", "pdf", "file", "font"].includes(file.kind) || !["ready", "deleting"].includes(file.status)) return false;
  if (publishedIds.includes(file.id)) return false;
  if (file.status === "deleting") return true; // Server-reserved, immutable and retryable.
  if (revision !== undefined && file.revision !== revision) return false;
  const trashed = trashTime(file, folders);
  return trashed !== null && (!automatic || now - trashed >= RETENTION_MS);
}
export function cleanupHealth(lastRunAt, now = Date.now()) {
  const date = typeof lastRunAt === "string" ? Date.parse(lastRunAt) : NaN;
  return Number.isFinite(date) && now >= date && now - date <= 48 * 60 * 60 * 1000;
}

export function wrapperReferences(wrapper, id) {
  if (!wrapper || wrapper.schemaVersion !== 1 || !Number.isSafeInteger(wrapper.revision) || wrapper.revision < 1 || typeof wrapper.payload !== "string" || Buffer.byteLength(wrapper.payload) > 700000) throw new Error("Saved content is invalid. Cleanup is blocked.");
  const value = JSON.parse(wrapper.payload);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Saved content is invalid. Cleanup is blocked.");
  let found = false;
  function visit(node, depth) {
    if (depth > 100) throw new Error("Saved content is too deeply nested.");
    if (typeof node === "string" && new RegExp(`^/api/(?:cloud-media|cloud-fonts|cloud-files)/${id}(?:\\?kind=(?:file|pdf))?$`).test(node)) found = true;
    else if (node && typeof node === "object") for (const entry of Object.values(node)) visit(entry, depth + 1);
  }
  visit(value, 0); return found;
}
