import { apiErrorResponse, TaylorApiError, verifyTaylorOwner } from "@/server/taylor-auth";
import { MEDIA_ID_PATTERN, publicContentReferencesMedia, readDevelopmentMedia, requireDevelopmentMedia } from "@/server/dev-media";
import { readPublishedSite } from "@/server/published-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireDevelopmentMedia();
    const { id } = await context.params;
    if (!MEDIA_ID_PATTERN.test(id)) throw new TaylorApiError(404, "Photo not found.");
    if (request.headers.has("authorization")) await verifyTaylorOwner(request);
    else {
      // Fail closed on an unavailable/currently missing publication, and recheck every read.
      const state = await readPublishedSite();
      if (state.status !== "published" || !publicContentReferencesMedia(state.snapshot.content, `/api/media/${id}`)) throw new TaylorApiError(404, "Photo not found.");
    }
    const bytes = await readDevelopmentMedia(id);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp", "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${id.toLowerCase()}.webp"`,
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return apiErrorResponse(error); }
}
