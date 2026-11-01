import { STUDIO_OWNER_UID, isStudioOwnerUid } from "@/owner/studio-owner-identity";
import "server-only";
import { importX509, jwtVerify, type JWTVerifyGetKey } from "jose";

// Deliberately fixed server authorization. Browser configuration cannot grant access.
export const TAYLOR_PROJECT_ID = "taylor-made-creations";
export const TAYLOR_OWNER_UID = STUDIO_OWNER_UID;
// Firebase tokens are minted remotely; tolerate only small host clock drift.
const CLOCK_TOLERANCE_SECONDS = 5;
const CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export class TaylorApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter?: number, public readonly code?: string) { super(message); }
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
      } catch { throw new TaylorApiError(503, "The server could not reach the sign-in verification service. Try again shortly.", undefined, "verification-unavailable"); }
    })().finally(() => { certificateRequest = undefined; });
  }
  return certificateRequest;
}

const signingKey: JWTVerifyGetKey = async header => {
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 128) throw new TaylorApiError(401, "The server could not validate this session. Check again or sign in again if the problem continues.", undefined, "session-invalid");
  const values = await certificates();
  const certificate = Object.hasOwn(values, header.kid) ? values[header.kid] : undefined;
  if (!certificate) throw new TaylorApiError(401, "The server could not validate this session. Check again or sign in again if the problem continues.", undefined, "session-invalid");
  try { return await importX509(certificate, "RS256"); }
  catch { throw new TaylorApiError(503, "The server could not load its sign-in verification key. Ask Salix to check the server setup.", undefined, "verification-key-unavailable"); }
};

/** Signature + all Firebase ID-token claims; no client-supplied UID/email is trusted. */
export async function verifyTaylorOwner(request: Request): Promise<{ uid: string }> {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 16_384 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) throw new TaylorApiError(401, "Sign in to Taylor’s Space to continue.", undefined, "session-required");
  try {
    const { payload } = await jwtVerify(authorization.slice(7), signingKey, {
      algorithms: ["RS256"], issuer: `https://securetoken.google.com/${TAYLOR_PROJECT_ID}`,
      audience: TAYLOR_PROJECT_ID, clockTolerance: CLOCK_TOLERANCE_SECONDS, requiredClaims: ["exp", "iat", "sub", "auth_time"],
    });
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== TAYLOR_PROJECT_ID || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128
      || typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > now + CLOCK_TOLERANCE_SECONDS
      || typeof payload.auth_time !== "number" || !Number.isFinite(payload.auth_time) || payload.auth_time > now + CLOCK_TOLERANCE_SECONDS || payload.auth_time < 0) throw new TaylorApiError(401, "The server could not validate this session. Check again or sign in again if the problem continues.", undefined, "session-invalid");
    if (!isStudioOwnerUid(payload.sub)) throw new TaylorApiError(403, "This account does not have owner access.", undefined, "owner-denied");
    return { uid: payload.sub };
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ERR_JWT_EXPIRED") throw new TaylorApiError(401, "This session token has expired. Check again to refresh it, or sign in again.", undefined, "session-expired");
    if (["ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWT_INVALID", "ERR_JWS_INVALID", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JOSE_NOT_SUPPORTED"].includes(code)) {
      throw new TaylorApiError(401, "The server could not validate this session. Check again or sign in again if the problem continues.", undefined, "session-invalid");
    }
    // Runtime/key-import failures are not evidence of an invalid user session.
    throw new TaylorApiError(503, "Server sign-in verification is unavailable. Your browser may still be signed in; ask Salix to check the server.", undefined, "verification-unavailable");
  }
}

export function privateJson(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}

export function apiErrorResponse(error: unknown): Response {
  const known = error instanceof TaylorApiError ? error : new TaylorApiError(500, "This request could not be completed. Please try again.");
  return privateJson({ ok: false, message: known.message, ...(known.code ? { code: known.code } : {}) }, known.status, known.retryAfter ? { "Retry-After": String(known.retryAfter) } : {});
}
