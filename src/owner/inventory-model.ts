export const INVENTORY_STANDARD_UNITS = ["pieces", "yards", "metres", "feet", "inches", "grams", "kilograms"] as const;
export type InventoryCategory = { id: string; name: string };
export type InventoryCategories = { schemaVersion: 1; revision: number; categories: InventoryCategory[]; itemTypes?: InventoryCategory[]; units?: string[] };
export type StockChange = { at: string; from: number; to: number; fromUnit: string; unit: string; note: string };
export type InventoryItem = {
  id: string; schemaVersion: 1; revision: number; name: string; kind: string;
  categoryId: string; barcode: string; tags: string[]; quantity: number; unit: string;
  lowStock: number; notes: string; archived: boolean; createdAt: string; updatedAt: string; history: StockChange[];
  trashedAt?: string | null; barcodeKeys?: string[];
};
export type InventoryEdit = Pick<InventoryItem, "name" | "kind" | "categoryId" | "barcode" | "tags" | "quantity" | "unit" | "lowStock" | "notes" | "archived">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function inventoryId(value: string) { if (!uuid.test(value)) throw new Error("Invalid inventory identity."); return value; }
function text(value: unknown, max: number, required = false): value is string { return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value); }
export function inventoryQuantity(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001; }
export function normalizeBarcode(value: string) { return value.trim().toUpperCase(); }
export function validInventoryBarcode(value: unknown): value is string { return typeof value === "string" && /^[A-Z0-9.-]{1,24}$/.test(value); }
export function inventoryTags(value: string) { return [...new Map(value.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => [tag.toLowerCase(), tag])).values()]; }
export function inventoryStatus(item: Pick<InventoryItem, "quantity" | "lowStock">) { return item.quantity === 0 ? "out" : item.quantity <= item.lowStock ? "low" : "available"; }
export const emptyInventoryCategories = (): InventoryCategories => ({ schemaVersion: 1, revision: 0, categories: [] });
export function decodeInventoryCategories(value: unknown): InventoryCategories {
  if (!value || typeof value !== "object") throw new Error("Inventory categories could not be read.");
  const v = value as InventoryCategories;
  if (v.schemaVersion !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 0 || !Array.isArray(v.categories) || v.categories.length > 200 || v.categories.some(c => !c || !uuid.test(c.id) || !text(c.name, 80, true)) || new Set(v.categories.map(c => c.id)).size !== v.categories.length || new Set(v.categories.map(c => c.name.trim().toLowerCase())).size !== v.categories.length) throw new Error("Inventory categories are invalid. Refresh before making changes.");
  if (v.itemTypes !== undefined && (!Array.isArray(v.itemTypes) || v.itemTypes.length > 200 || v.itemTypes.some(c => !c || !uuid.test(c.id) || !text(c.name, 80, true)) || new Set(v.itemTypes.map(c => c.id)).size !== v.itemTypes.length || new Set(v.itemTypes.map(c => c.name.trim().toLowerCase())).size !== v.itemTypes.length || v.itemTypes.some(c => ["material", "materials", "finished", "finished item", "finished items"].includes(c.name.trim().toLowerCase())))) throw new Error("Inventory item types are invalid.");
  if (v.units !== undefined && (!Array.isArray(v.units) || v.units.length > 200 || v.units.some(u => !text(u, 30, true)) || new Set(v.units.map(u => u.trim().toLowerCase())).size !== v.units.length)) throw new Error("Inventory units are invalid.");
  return v;
}
export function inventoryThreshold(value: unknown): value is number { return inventoryQuantity(value) && Number.isInteger(value * 2); }
export function validateInventoryEdit(value: InventoryEdit, allowLegacyThreshold = false) {
  if (!text(value.name, 150, true)) throw new Error("Enter an item name of up to 150 characters.");
  if (!["material", "finished"].includes(value.kind) && !uuid.test(value.kind)) throw new Error("Choose material or finished item.");
  if (value.categoryId !== "" && !uuid.test(value.categoryId)) throw new Error("Choose a valid category.");
  if (!validInventoryBarcode(value.barcode)) throw new Error("Use 1–24 letters, numbers, periods or hyphens for the barcode.");
  if (!Array.isArray(value.tags) || value.tags.length > 20 || value.tags.some(tag => !text(tag, 50, true)) || new Set(value.tags.map(tag => tag.toLowerCase())).size !== value.tags.length) throw new Error("Use up to 20 different tags, each no longer than 50 characters.");
  if (!inventoryQuantity(value.quantity)) throw new Error("Quantity must be between 0 and 1,000,000, with up to three decimal places.");
  if (!(allowLegacyThreshold ? inventoryQuantity(value.lowStock) : inventoryThreshold(value.lowStock))) throw new Error("Quantity threshold must be a whole number or half value, such as 1 or 1.5, between 0 and 1,000,000.");
  if (!text(value.unit, 30, true)) throw new Error("Enter a unit such as pieces, yards or metres.");
  if (typeof value.notes !== "string" || value.notes.length > 2000 || typeof value.archived !== "boolean") throw new Error("Keep notes under 2,000 characters.");
  return value;
}
export function decodeInventoryItem(value: unknown, id: string): InventoryItem {
  inventoryId(id);
  if (!value || typeof value !== "object") throw new Error("This inventory item could not be read.");
  const raw = value as InventoryItem & { trashedAt?: unknown };
  const v: InventoryItem = { ...raw, id, trashedAt: inventoryTimestamp(raw.trashedAt) };
  if (v.barcodeKeys !== undefined && (!Array.isArray(v.barcodeKeys) || v.barcodeKeys.length !== 2 || v.barcodeKeys.some((key, index) => key !== barcodeKey(barcodeAliases(v.barcode)[index])))) throw new Error("This inventory item's barcode registry is invalid.");
  validateInventoryEdit(v, true);
  if (v.schemaVersion !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 1 || !Number.isFinite(Date.parse(v.createdAt)) || !Number.isFinite(Date.parse(v.updatedAt)) || !Array.isArray(v.history) || v.history.length > 30 || v.history.some(h => !h || !Number.isFinite(Date.parse(h.at)) || !inventoryQuantity(h.from) || !inventoryQuantity(h.to) || !text(h.fromUnit, 30, true) || !text(h.unit, 30, true) || !text(h.note, 200))) throw new Error("This inventory item has invalid saved data. Refresh before editing.");
  return v;
}
// Code 39's standard character patterns and Mod43 check digit. Wide:narrow = 3:1.
// Reference: ISO/IEC 16388 character set; ZXing Code39Reader (Apache-2.0).
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
const patterns = [0x034,0x121,0x061,0x160,0x031,0x130,0x070,0x025,0x124,0x064,0x109,0x049,0x148,0x019,0x118,0x058,0x00d,0x10c,0x04c,0x01c,0x103,0x043,0x142,0x013,0x112,0x052,0x007,0x106,0x046,0x016,0x181,0x0c1,0x1c0,0x091,0x190,0x0d0,0x085,0x184,0x0c4,0x0a8,0x0a2,0x08a,0x02a];
export function barcodeChecksum(value: string) { if (!validInventoryBarcode(value)) throw new Error("Invalid barcode."); return alphabet[[...value].reduce((sum, char) => sum + alphabet.indexOf(char), 0) % 43]; }
export function barcodeAliases(value: string) { return [value, value + barcodeChecksum(value)]; }
export function barcodeKey(value: string) { return [...value].map(char => char.charCodeAt(0).toString(16).padStart(2, "0")).join(""); }
export function code39Bars(value: string) {
  const encoded = `*${value}${barcodeChecksum(value)}*`; let x = 12; const bars: { x: number; width: number }[] = [];
  for (const char of encoded) {
    const pattern = char === "*" ? 0x094 : patterns[alphabet.indexOf(char)];
    for (let i = 8; i >= 0; i--) { const width = pattern & (1 << i) ? 3 : 1; if (i % 2 === 0) bars.push({ x, width }); x += width; }
    x += 1;
  }
  return { width: x + 11, height: Math.max(50, Math.ceil((x - 12) * 0.15)), bars, checksum: barcodeChecksum(value) };
}
export function generatedInventoryBarcode() { return `TMC${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`; }
export function matchesInventory(item: InventoryItem, query: string) {
  const q = query.trim().toUpperCase();
  return !q || barcodeAliases(item.barcode).includes(q) || item.name.toUpperCase().includes(q) || item.barcode.includes(q) || item.tags.some(tag => tag.toUpperCase().includes(q));
}

export function uniqueInventoryBarcode(items: Pick<InventoryItem, "barcode">[], generate = generatedInventoryBarcode) {
  const occupied = new Set(items.flatMap(item => barcodeAliases(item.barcode)));
  for (let attempt = 0; attempt < 50; attempt++) { const candidate = generate(); if (validInventoryBarcode(candidate) && barcodeAliases(candidate).every(alias => !occupied.has(alias))) return candidate; }
  throw new Error("Could not generate an unused barcode. Try again.");
}

export const INVENTORY_BARCODE_HOLD_MS = 60 * 24 * 60 * 60 * 1000;
// Firestore timestamps remain raw in storage and become JSON-safe ISO strings here.
export function inventoryTimestamp(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  let milliseconds: number;
  if (typeof value === "string") milliseconds = Date.parse(value);
  else if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") milliseconds = value.toMillis();
  else if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") milliseconds = value.seconds * 1000;
  else throw new Error("Inventory retirement time is invalid.");
  if (!Number.isFinite(milliseconds)) throw new Error("Inventory retirement time is invalid.");
  return new Date(milliseconds).toISOString();
}

export type InventoryChoiceField = "categoryId" | "kind" | "unit";
/** Includes archived and trashed records: restoring must never expose dangling references. */
export function inventoryChoiceReferences(items: Pick<InventoryItem, "name" | "categoryId" | "kind" | "unit">[], field: InventoryChoiceField, value: string) {
  return items.filter(item => item[field] === value);
}
export function inventoryChoiceRemovalError(items: Pick<InventoryItem, "name" | "categoryId" | "kind" | "unit">[], field: InventoryChoiceField, value: string): string | null {
  const used = inventoryChoiceReferences(items, field, value);
  if (!used.length) return null;
  const label = field === "categoryId" ? "category" : field === "kind" ? "item type" : "unit";
  return `This ${label} is used by ${used.length} inventory ${used.length === 1 ? "item" : "items"}: ${used.slice(0, 3).map(item => item.name).join(", ")}${used.length > 3 ? "…" : ""}. Reassign those items first. Archived items and Trash also count; restore them to change their choice.`;
}
/** Spinner controls move in whole steps, while manual values retain fractional precision. */
export function stepInventoryQuantity(value: number, direction: -1 | 1) {
  const current = Number.isFinite(value) ? value : 0;
  return Math.min(1_000_000, Math.max(0, direction > 0 ? Math.floor(current) + 1 : Math.ceil(current) - 1));
}
