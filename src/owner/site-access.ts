/** Public-safe runtime gate only. Never add owner, contact, draft or secret data here. */
export type SiteAccess = { schemaVersion: 1; revision: number; constructionMode: boolean };
export const SITE_ACCESS_DOCUMENT = "site/access";

/** Revision zero is an in-memory default only; absence never opens the website. */
export function defaultSiteAccess(): SiteAccess { return { schemaVersion: 1, revision: 0, constructionMode: true }; }

export function decodeSiteAccess(raw: unknown): SiteAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) throw new Error("Invalid website access settings.");
  const value = raw as SiteAccess;
  if (Object.keys(value).length !== 3 || Object.keys(value).some(key => !["schemaVersion", "revision", "constructionMode"].includes(key))
    || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.constructionMode !== "boolean") throw new Error("Invalid website access settings.");
  return { schemaVersion: 1, revision: value.revision, constructionMode: value.constructionMode };
}

export function decodeSiteAccessRestDocument(raw: unknown): SiteAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid website access response.");
  const fields = (raw as { fields?: Record<string, Record<string, unknown>> }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length !== 3 || Object.keys(fields).some(key => !["schemaVersion", "revision", "constructionMode"].includes(key))) throw new Error("Invalid website access fields.");
  const integer = (field: Record<string, unknown> | undefined) => {
    if (!field || Object.keys(field).length !== 1 || typeof field.integerValue !== "string" || !/^(0|[1-9]\d*)$/.test(field.integerValue)) throw new Error("Invalid website access number.");
    return Number(field.integerValue);
  };
  if (!fields.constructionMode || Object.keys(fields.constructionMode).length !== 1 || typeof fields.constructionMode.booleanValue !== "boolean") throw new Error("Invalid Construction Mode value.");
  return decodeSiteAccess({ schemaVersion: integer(fields.schemaVersion), revision: integer(fields.revision), constructionMode: fields.constructionMode.booleanValue });
}
