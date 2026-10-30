/** Presentation only. These definitions never change status, payment, or assigned keys. */
export const LABEL_BUILTINS = { status: "Commission status", information: "Information labels", "paid-100": "100% paid", "paid-partial": "Partially paid", "dtd-needed": "DTD needed", "dtd-received": "DTD Received" } as const;
export type LabelPresentationEntry = { name: string; color: string | null; hidden: boolean; deleted: boolean };
export type LabelPresentation = { schemaVersion: 1; revision: number; updatedAt: string | null; entries: Record<string, LabelPresentationEntry>; order: string[] };
export type SaveLabelPresentationInput = Pick<LabelPresentation, "entries" | "order"> & { operationId: string; expectedRevision: number; legacyProjectId?: string; adoptLegacyKeys?: string[] };
export const isBuiltinLabel = (key: string): key is keyof typeof LABEL_BUILTINS => Object.hasOwn(LABEL_BUILTINS, key);
export const isCustomLabelKey = (key: string) => /^custom:[^\x00-\x1f\x7f]{1,60}$/.test(key) && key === key.trim();
export function fallbackLabelDefinition(key: string): LabelPresentationEntry { return { name: isBuiltinLabel(key) ? LABEL_BUILTINS[key] : /^custom:id_[a-f0-9]{32}$/.test(key) ? "Custom label" : key.startsWith("custom:") ? key.slice(7).trim() : key, color: null, hidden: false, deleted: false }; }
/** Deleted picker entries retain their assigned-card appearance. Never filter a badge by deleted. */
export function assignedLabelDefinition(presentation: LabelPresentation | null | undefined, key: string): LabelPresentationEntry { return presentation?.entries[key] ?? fallbackLabelDefinition(key); }
export function newCustomLabelKey(): string { return `custom:id_${crypto.randomUUID().replaceAll("-", "")}`; }
export function emptyLabelPresentation(): LabelPresentation { const keys = Object.keys(LABEL_BUILTINS); return { schemaVersion: 1, revision: 0, updatedAt: null, entries: Object.fromEntries(keys.map(key => [key, fallbackLabelDefinition(key)])), order: keys }; }
export function decodeLabelPresentation(raw: unknown): LabelPresentation {
 const bad = (): never => { throw new Error("Label presentation could not be verified. Refresh before continuing."); };
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad(); const value = raw as LabelPresentation;
 if (Object.keys(value).some(key => !["schemaVersion", "revision", "updatedAt", "entries", "order"].includes(key)) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !(value.updatedAt === null || typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) && new Date(value.updatedAt).toISOString() === value.updatedAt) || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) return bad();
 const keys = Object.keys(value.entries); if (keys.length > 1000 || Object.keys(LABEL_BUILTINS).some(key => !Object.hasOwn(value.entries, key)) || keys.some(key => !isBuiltinLabel(key) && !isCustomLabelKey(key))) return bad();
 const entries: Record<string, LabelPresentationEntry> = {};
 for (const key of keys) { const entry = value.entries[key]; if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 4 || Object.keys(entry).some(field => !["name", "color", "hidden", "deleted"].includes(field)) || typeof entry.name !== "string" || !entry.name.trim() || entry.name !== entry.name.trim() || entry.name.length > 60 || /[\x00-\x1f\x7f]/.test(entry.name) || !(entry.color === null || typeof entry.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(entry.color)) || typeof entry.hidden !== "boolean" || typeof entry.deleted !== "boolean" || isBuiltinLabel(key) && entry.deleted || !isBuiltinLabel(key) && entry.hidden) return bad(); entries[key] = { ...entry, color: entry.color?.toUpperCase() ?? null }; }
 if (!Array.isArray(value.order) || value.order.length !== keys.length || new Set(value.order).size !== keys.length || value.order.some(key => typeof key !== "string" || !Object.hasOwn(entries, key))) return bad();
 return { schemaVersion: 1, revision: value.revision, updatedAt: value.updatedAt, entries, order: [...value.order] };
}

export type LabelDefinition = LabelPresentationEntry;
