import "server-only";
import { websiteDeployment } from "./website-deployment";
import { verifyTaylorOwner, apiErrorResponse, TaylorApiError } from "./taylor-auth";
import { decodePublishedRestDocument } from "./published-site";
/** No unauthenticated payload, public cache, cookie token, or main-site fallback. */
export async function readBetaPublication(request: Request): Promise<Response> {
  try {
    if (websiteDeployment(request.headers.get("host")).workspace !== "beta") throw new TaylorApiError(404, "Preview unavailable.");
    await verifyTaylorOwner(request);
    const authorization = request.headers.get("authorization")!;
    const response = await fetch("https://firestore.googleapis.com/v1/projects/taylor-made-creations/databases/(default)/documents/websiteWorkspaces/beta/site/published", { headers: { Authorization: authorization, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) { await response.body?.cancel(); throw new TaylorApiError(response.status === 404 ? 404 : 503, "No authorized beta publication is available. Publish the beta workspace first."); }
    const reader = response.body?.getReader(); if (!reader) throw new Error("Missing preview.");
    let size = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 1_420_000) throw new Error("Preview too large."); chunks.push(chunk.value); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const snapshot = decodePublishedRestDocument(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return Response.json({ snapshot }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization, Host", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) { return apiErrorResponse(error); }
}
