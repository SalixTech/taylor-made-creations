import { apiErrorResponse, privateJson, TaylorApiError, verifyTaylorOwner } from "@/server/taylor-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fixed project endpoint, not a caller-controlled URL or a stored Admin credential.
const endpoint = "https://us-central1-taylor-made-creations.cloudfunctions.net/tmcFileMaintenance";
async function forward(request: Request) {
  try {
    await verifyTaylorOwner(request);
    let body: string | undefined;
    if (request.method === "POST") {
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (!Number.isFinite(declared) || declared > 30_000) throw new TaylorApiError(413, "Select fewer files.");
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      if (!reader) throw new TaylorApiError(400, "No cleanup request was supplied.");
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 30_000) throw new TaylorApiError(413, "Select fewer files."); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      body = Buffer.concat(chunks).toString("utf8");
      try { JSON.parse(body); } catch { throw new TaylorApiError(400, "Invalid cleanup request."); }
    }
    const response = await fetch(endpoint, { method: request.method, headers: { Authorization: request.headers.get("authorization")!, ...(body ? { "Content-Type": "application/json" } : {}) }, body, redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]) });
    if (response.status === 404 || response.status === 503) throw new TaylorApiError(503, "File cleanup has not been enabled on this deployment. Files remain in Trash.");
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new TaylorApiError(503, "File cleanup could not be reached. Refresh before retrying.");
    return privateJson(payload, response.status);
  } catch (error) { return apiErrorResponse(error); }
}
export const GET = forward;
export const POST = forward;
