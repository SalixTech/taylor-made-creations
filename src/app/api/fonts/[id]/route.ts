import { apiErrorResponse, TaylorApiError, verifyTaylorOwner } from "@/server/taylor-auth";
import { MEDIA_ID_PATTERN, requireDevelopmentMedia } from "@/server/dev-media";
import { publicContentReferencesFont, readDevelopmentFont } from "@/server/dev-fonts";
import { readPublishedSite } from "@/server/published-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireDevelopmentMedia();
    const { id } = await context.params;
    if (!MEDIA_ID_PATTERN.test(id)) throw new TaylorApiError(404, "Font not found.");
    if (request.headers.has("authorization")) await verifyTaylorOwner(request);
    else {
      const state = await readPublishedSite();
      if (state.status !== "published" || !publicContentReferencesFont(state.snapshot.content, `/api/fonts/${id}`)) throw new TaylorApiError(404, "Font not found.");
    }
    const { bytes, contentType, format } = await readDevelopmentFont(id);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": contentType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${id.toLowerCase()}.${format}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return apiErrorResponse(error); }
}
