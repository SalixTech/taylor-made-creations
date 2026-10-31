import { websiteDeployment } from "./website-deployment";
import { websiteStoragePath } from "../owner/website-workspace";
import "server-only";
import { CLOUD_BUCKET, CLOUD_FILE_ID, CLOUD_FILE_MAX_BYTES, CLOUD_PHOTO_MAX_BYTES, CLOUD_FONT_MAX_BYTES, CLOUD_FONT_TYPES } from "@/owner/cloud-files-model";
import { apiErrorResponse, TaylorApiError, verifyTaylorOwner } from "./taylor-auth";

/** No Admin credentials, token URLs, redirects, or disk fallback. Storage Rules decide every read. */
export async function readCloudFileResponse(request: Request, id: string, kind: "photo" | "pdf" | "document" | "file" | "font"): Promise<Response> {
  try {
    const { workspace } = websiteDeployment(request.headers.get("host"));
    if (workspace === "beta") throw new TaylorApiError(403, "Beta assets require the authenticated chunk gateway.");
    if (kind === "document") throw new TaylorApiError(403, "Website documents use the protected document gateway.");
    if (!CLOUD_FILE_ID.test(id)) throw new TaylorApiError(404, "File not found.");
    if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== CLOUD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "taylor-made-creations") throw new TaylorApiError(503, "Shared file storage is not configured on this deployment.");
    const authorization = request.headers.get("authorization");
    if (authorization || kind === "pdf" || kind === "file") await verifyTaylorOwner(request);
    const relativeObject = kind === "photo" ? `photos/${id}.webp` : kind === "font" ? `fonts/${id}.font` : kind === "file" ? `files/${id}.bin` : `files/${id}.pdf`;
    const object = websiteStoragePath(workspace, relativeObject);
    // Only the owner's validated ID token is forwarded. Public reads remain anonymous.
    const upstream = await fetch(`https://firebasestorage.googleapis.com/v0/b/${CLOUD_BUCKET}/o/${encodeURIComponent(object)}?alt=media`, {
      headers: authorization ? { Authorization: `Firebase ${authorization.slice(7)}` } : {},
      cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      if ([401, 403, 404].includes(upstream.status)) throw new TaylorApiError(404, "File unavailable or not published.");
      throw new TaylorApiError(503, "Shared file storage could not be reached. Try again.");
    }
    const receivedType = upstream.headers.get("content-type")?.split(";")[0];
    const contentType = kind === "photo" ? "image/webp" : kind === "font" ? receivedType : kind === "file" ? "application/octet-stream" : "application/pdf";
    const maxBytes = kind === "photo" ? CLOUD_PHOTO_MAX_BYTES : kind === "font" ? CLOUD_FONT_MAX_BYTES : CLOUD_FILE_MAX_BYTES;
    const length = Number(upstream.headers.get("content-length"));
    if (!contentType || (kind === "font" && !Object.values(CLOUD_FONT_TYPES).includes(contentType as "font/woff")) || receivedType !== contentType || !upstream.body || !Number.isSafeInteger(length) || length <= 0 || length > maxBytes) {
      await upstream.body?.cancel(); throw new TaylorApiError(502, "The stored file did not pass the download checks.");
    }
    if (kind === "font") {
      const { validateFont } = await import("./dev-fonts");
      const reader = upstream.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
      try {
        while (true) { const part = await reader.read(); if (part.done) break; count += part.value.byteLength; if (count > maxBytes || count > length) throw new TaylorApiError(502, "Invalid stored font size."); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (count !== length) throw new TaylorApiError(502, "Incomplete font download.");
      const bytes = Buffer.concat(chunks); await validateFont(bytes, contentType);
      return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; sandbox" } });
    }
    // Stream private files; never embed active documents or expose download tokens.
    let received = 0;
    const stream = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { received += chunk.byteLength; if (received > maxBytes || received > length) throw new Error("File exceeds its declared size."); controller.enqueue(chunk); },
      flush() { if (received !== length) throw new Error("Incomplete file download."); },
    }));
    return new Response(stream, { headers: {
      "Content-Type": contentType, "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": `${kind === "photo" ? "inline" : "attachment"}; filename="${id}.${kind === "photo" ? "webp" : kind === "file" ? "bin" : "pdf"}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return apiErrorResponse(error); }
}

/** Owner-only generation check. Never return Firebase metadata/download tokens. */
export async function readOwnerCloudPhotoMetadata(request: Request, id: string): Promise<Response> {
  try {
    const { workspace } = websiteDeployment(request.headers.get("host"));
    if (workspace === "beta") throw new TaylorApiError(403, "Beta assets require the authenticated chunk gateway.");
    if (!CLOUD_FILE_ID.test(id)) throw new TaylorApiError(404, "Photo unavailable.");
    if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== CLOUD_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "taylor-made-creations") throw new TaylorApiError(503, "Shared photo storage is not configured.");
    await verifyTaylorOwner(request);
    const header = request.headers.get("authorization")!;
    const upstream = await fetch(`https://firebasestorage.googleapis.com/v0/b/${CLOUD_BUCKET}/o/${encodeURIComponent(websiteStoragePath(workspace, `photos/${id}.webp`))}`, { headers: { Authorization: `Firebase ${header.slice(7)}` }, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) });
    if (!upstream.ok) { await upstream.body?.cancel(); throw new TaylorApiError([401,403,404].includes(upstream.status) ? 404 : 503, "Private photo could not be checked."); }
    const reader = upstream.body?.getReader(); if (!reader) throw new TaylorApiError(502, "Invalid photo metadata.");
    const parts: Uint8Array[] = []; let count = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; count += part.value.byteLength; if (count > 16384) throw new TaylorApiError(502, "Photo metadata is too large."); parts.push(part.value); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const value = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (value.name !== websiteStoragePath(workspace, `photos/${id}.webp`) || value.bucket !== CLOUD_BUCKET || value.contentType !== "image/webp" || !/^[0-9]{1,32}$/.test(value.generation ?? "") || !/^[0-9]+$/.test(String(value.size)) || !Number.isSafeInteger(Number(value.size)) || Number(value.size) <= 0 || Number(value.size) > CLOUD_PHOTO_MAX_BYTES || value.metadata?.fileId !== id) throw new TaylorApiError(502, "The private photo metadata did not match.");
    return Response.json({ ok: true, generation: value.generation, bytes: Number(value.size), contentType: "image/webp" }, { headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiErrorResponse(error); }
}
