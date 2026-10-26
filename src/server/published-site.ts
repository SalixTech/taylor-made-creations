import { cache } from "react";
import { assertPublishedOwnerSnapshot, type PublishedOwnerSnapshot } from "../owner/model";

export type PublicSiteState =
  | { status: "locked" }
  | { status: "baseline"; reason: "unconfigured" | "not-published" }
  | { status: "published"; snapshot: PublishedOwnerSnapshot }
  | { status: "error"; message: string };
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

/** Public Firestore REST GET: no Admin SDK, credentials, cookies, or owner token. Rules remain authoritative. */
export async function readPublishedSite({ projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, fetcher = fetch }: { projectId?: string; fetcher?: typeof fetch } = {}): Promise<PublicSiteState> {
  // Temporary construction lock, including the root layout's serialized RSC props,
  // direct page routes, public JSON, media and fonts. Only an explicit SERVER setting
  // opens it; query strings, browser storage and client Firebase state cannot.
  // Firestore /site/published rules must also be owner-only while this is locked.
  if (process.env.TMC_PUBLIC_SITE_ACCESS !== "open") return { status: "locked" };
  if (!projectId) return { status: "baseline", reason: "unconfigured" };
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) return unavailable();
  try {
    const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/site/published`, {
      method: "GET", cache: "no-store", credentials: "omit", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      const error = await response.json() as { error?: { status?: string; message?: string } };
      // A missing database/project/endpoint is not evidence of a never-published site.
      return error.error?.status === "NOT_FOUND" && /^Document\s.+\snot found\.?$/i.test(error.error.message ?? "")
        ? { status: "baseline", reason: "not-published" } : unavailable();
    }
    if (!response.ok) return unavailable();
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PUBLIC_BYTES * 2 + 20_000) return unavailable();
    return { status: "published", snapshot: decodePublishedRestDocument(JSON.parse(text)) };
  } catch { return unavailable(); }
}
/** One coherent snapshot per server render, with no persistent cross-request cache. */
export const getPublishedSite = cache(readPublishedSite);
