import { isSafeImageSource, type GalleryItem } from "./model";
export type PrivateGallery = { schemaVersion: 1; revision: number; updatedAt: string; items: GalleryItem[] };
export function decodePrivateGallery(raw: unknown): PrivateGallery {
 const bad = () => { throw new Error("Private gallery data is invalid. Nothing was overwritten."); };
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad();
 const value = raw as PrivateGallery;
 if (Object.keys(value).length !== 4 || Object.keys(value).some(key => !["schemaVersion", "revision", "updatedAt", "items"].includes(key)) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt || !Array.isArray(value.items) || value.items.length > 200) return bad();
 const ids = new Set<string>();
 for (const item of value.items) {
  if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["id", "name", "src", "alt", "width", "height", "visible", "displayNumber"].includes(key)) || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(item.id) || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 150 || typeof item.src !== "string" || !isSafeImageSource(item.src) || /^\/api\/(?:media|fonts)\//.test(item.src) || typeof item.alt !== "string" || !item.alt.trim() || item.alt.length > 500 || typeof item.visible !== "boolean" || ![item.width, item.height].every(d => Number.isSafeInteger(d) && d > 0 && d <= 20000) || (item.displayNumber !== undefined && (typeof item.displayNumber !== "string" || item.displayNumber.length > 24))) return bad();
  ids.add(item.id);
 }
 return structuredClone(value);
}
