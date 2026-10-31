/** Public-safe opt-in only; separate from the authoritative site access gate. */
export type ConstructionWhimsy = { schemaVersion: 1; revision: number; enabled: boolean };
export const CONSTRUCTION_WHIMSY_DOCUMENT = "site/constructionWhimsy";
export function defaultConstructionWhimsy(): ConstructionWhimsy { return { schemaVersion: 1, revision: 0, enabled: false }; }
export function decodeConstructionWhimsy(raw: unknown): ConstructionWhimsy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid construction whimsy settings.");
  const value = raw as ConstructionWhimsy;
  if (Object.keys(value).length !== 3 || Object.keys(value).some(key => !["schemaVersion", "revision", "enabled"].includes(key)) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.enabled !== "boolean") throw new Error("Invalid construction whimsy settings.");
  return { schemaVersion: 1, revision: value.revision, enabled: value.enabled };
}
export function decodeConstructionWhimsyRestDocument(raw: unknown): ConstructionWhimsy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid construction whimsy response.");
  const fields = (raw as { fields?: Record<string, Record<string, unknown>> }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length !== 3 || Object.keys(fields).some(key => !["schemaVersion", "revision", "enabled"].includes(key))) throw new Error("Invalid construction whimsy fields.");
  const integer = (field: Record<string, unknown> | undefined) => {
    if (!field || Object.keys(field).length !== 1 || typeof field.integerValue !== "string" || !/^(0|[1-9]\d*)$/.test(field.integerValue)) throw new Error("Invalid construction whimsy number.");
    return Number(field.integerValue);
  };
  if (!fields.enabled || Object.keys(fields.enabled).length !== 1 || typeof fields.enabled.booleanValue !== "boolean") throw new Error("Invalid construction whimsy flag.");
  return decodeConstructionWhimsy({ schemaVersion: integer(fields.schemaVersion), revision: integer(fields.revision), enabled: fields.enabled.booleanValue });
}
