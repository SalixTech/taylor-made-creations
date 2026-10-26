import "server-only";
import { importX509, jwtVerify, type JWTVerifyGetKey } from "jose";

// Deliberately fixed server authorization. Browser configuration cannot grant access.
export const TAYLOR_PROJECT_ID = "taylor-made-creations";
export const TAYLOR_OWNER_UID = "a4ARjp0z8ZOByKlC2AfGzmMRj843";
const CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export class TaylorApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter?: number) { super(message); }
}

let certificateCache: { values: Record<string, string>; expiresAt: number } | undefined;
let certificateRequest: Promise<Record<string, string>> | undefined;

async function certificates(): Promise<Record<string, string>> {
  if (certificateCache && certificateCache.expiresAt > Date.now()) return certificateCache.values;
  if (!certificateRequest) {
    certificateRequest = (async () => {
      try {
        const response = await fetch(CERTIFICATES_URL, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error("Certificate service unavailable");
        const values: unknown = await response.json();
        if (!values || typeof values !== "object" || Array.isArray(values)
          || !Object.values(values).length || Object.values(values).some(value => typeof value !== "string" || !value.startsWith("-----BEGIN CERTIFICATE-----"))) throw new Error("Invalid certificates");
        // Firebase's documented certificate rotation cache contract. Never use stale keys.
        const maxAge = Number(response.headers.get("cache-control")?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1] ?? 0);
        const age = Math.max(0, Number(response.headers.get("age") ?? 0) || 0);
        certificateCache = { values: values as Record<string, string>, expiresAt: Date.now() + Math.max(0, Math.min(maxAge - age, 86_400)) * 1000 };
        return certificateCache.values;
      } catch { throw new TaylorApiError(503, "Owner verification is temporarily unavailable. Please try again."); }
    })().finally(() => { certificateRequest = undefined; });
  }
  return certificateRequest;
}

const signingKey: JWTVerifyGetKey = async header => {
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 128) throw new TaylorApiError(401, "Your owner session could not be verified. Sign in again.");
  const values = await certificates();
  const certificate = Object.hasOwn(values, header.kid) ? values[header.kid] : undefined;
  if (!certificate) throw new TaylorApiError(401, "Your owner session could not be verified. Sign in again.");
  return importX509(certificate, "RS256");
};

/** Signature + all Firebase ID-token claims; no client-supplied UID/email is trusted. */
export async function verifyTaylorOwner(request: Request): Promise<{ uid: string }> {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 16_384 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) throw new TaylorApiError(401, "Sign in to Taylor’s Space to continue.");
  try {
    const { payload } = await jwtVerify(authorization.slice(7), signingKey, {
      algorithms: ["RS256"], issuer: `https://securetoken.google.com/${TAYLOR_PROJECT_ID}`,
      audience: TAYLOR_PROJECT_ID, requiredClaims: ["exp", "iat", "sub", "auth_time"],
    });
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== TAYLOR_PROJECT_ID || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128
      || typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > now
      || typeof payload.auth_time !== "number" || !Number.isFinite(payload.auth_time) || payload.auth_time > now || payload.auth_time < 0) throw new TaylorApiError(401, "Your owner session could not be verified. Sign in again.");
    if (payload.sub !== TAYLOR_OWNER_UID) throw new TaylorApiError(403, "This account does not have owner access.");
    return { uid: payload.sub };
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(401, "Your owner session could not be verified. Sign in again.");
  }
}

export function privateJson(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}

export function apiErrorResponse(error: unknown): Response {
  const known = error instanceof TaylorApiError ? error : new TaylorApiError(500, "This request could not be completed. Please try again.");
  return privateJson({ ok: false, message: known.message }, known.status, known.retryAfter ? { "Retry-After": String(known.retryAfter) } : {});
}
