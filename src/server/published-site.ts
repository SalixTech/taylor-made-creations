import { decodeConstructionWhimsyRestDocument } from "../owner/construction-whimsy";
import { cache } from "react";
import { assertPublishedOwnerSnapshot, type PublishedOwnerSnapshot } from "../owner/model";
import { decodeSiteAccessRestDocument } from "../owner/site-access";

export type PublicSiteState = (
  | { status: "locked"; constructionWhimsyEnabled?: boolean }
  | { status: "baseline"; reason: "unconfigured" | "not-published" }
  | { status: "published"; snapshot: PublishedOwnerSnapshot }
  | { status: "error"; message: string }
) & { accessRevision?: number };
const unavailable = (): PublicSiteState => ({ status: "error", message: "The published website could not be loaded. Please try again shortly. No older or private draft content has been substituted." });
const MAX_PUBLIC_BYTES = 700_000;

/** Decode only the allowlisted public document's REST representation, never private workspace fields. */
export function decodePublishedRestDocument(value: unknown): PublishedOwnerSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid public document.");
  const fields = (value as { fields?: Record<string, Record<string, unknown>> }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length !== 3 || Object.keys(fields).some(key => !["schemaVersion", "revision", "payload"].includes(key))) throw new Error("Invalid public fields.");
  const integer = (field: Record<string, unknown> | undefined) => {
    if (!field || Object.keys(field).length !== 1 || typeof field.integerValue !== "string" || !/^(0|[1-9]\d*)$/.test(field.integerValue)) throw new Error("Invalid public number.");
    const number = Number(field.integerValue);
    if (!Number.isSafeInteger(number)) throw new Error("Invalid public number.");
    return number;
  };
  const revision = integer(fields.revision);
  if (integer(fields.schemaVersion) !== 1 || revision < 1 || !fields.payload || Object.keys(fields.payload).length !== 1 || typeof fields.payload.stringValue !== "string" || new TextEncoder().encode(fields.payload.stringValue).byteLength > MAX_PUBLIC_BYTES) throw new Error("Invalid public payload.");
  const snapshot: unknown = JSON.parse(fields.payload.stringValue);
  assertPublishedOwnerSnapshot(snapshot);
  if (snapshot.revision !== revision) throw new Error("Public revisions differ.");
  return snapshot;
}

/** Public Firestore REST GETs: no Admin SDK, credentials, cookies, or owner token.
 * The safe access document and deployed rules, not a build-time flag, authorize
 * publication. Missing configuration never opens the bundled baseline site. */
export async function readPublishedSite({ projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, fetcher = fetch }: { projectId?: string; fetcher?: typeof fetch } = {}): Promise<PublicSiteState> {
  if (!projectId || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) return { status: "locked" };
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/site`;
  const read = (path: string) => fetcher(`${base}/${path}`, {
    method: "GET", cache: "no-store", credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
  });
  let accessRevision: number;
  try {
    const response = await read("access");
    if (!response.ok) return { status: "locked" };
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 4096) return { status: "locked" };
    const access = decodeSiteAccessRestDocument(JSON.parse(text));
    accessRevision = access.revision;
    if (access.constructionMode) {
      // Optional tiny public flag only. A failed/absent flag never unlocks the site
      // or causes a draft/publication fetch while construction mode is active.
      try {
        const whimsy = await read("constructionWhimsy");
        if (whimsy.ok) {
          const body = await whimsy.text();
          if (new TextEncoder().encode(body).byteLength <= 4096 && decodeConstructionWhimsyRestDocument(JSON.parse(body)).enabled) return { status: "locked", accessRevision, constructionWhimsyEnabled: true };
        }
      } catch { /* Missing or invalid optional settings remain off. */ }
      return { status: "locked", accessRevision };
    }
  } catch { return { status: "locked" }; }
  try {
    const response = await read("published");
    // A valid OFF flag is not permission to substitute defaults or a draft when
    // the published document disappears, is denied, or cannot be validated.
    if (!response.ok) return { ...unavailable(), accessRevision };
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PUBLIC_BYTES * 2 + 20_000) return { ...unavailable(), accessRevision };
    return { status: "published", snapshot: decodePublishedRestDocument(JSON.parse(text)), accessRevision };
  } catch { return { ...unavailable(), accessRevision }; }
}
/** One coherent snapshot per server render, with no persistent cross-request cache. */
export const getPublishedSite = cache(readPublishedSite);
