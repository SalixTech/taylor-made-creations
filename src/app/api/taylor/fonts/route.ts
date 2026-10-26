import { apiErrorResponse, privateJson, TaylorApiError, verifyTaylorOwner } from "@/server/taylor-auth";
import { developmentMediaEnabled, requireDevelopmentMedia } from "@/server/dev-media";
import { listDevelopmentFonts, MAX_FONT_BYTES, readFontBody, storeDevelopmentFont } from "@/server/dev-fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let activeUploads = 0;
export async function GET(request: Request) {
  try {
    await verifyTaylorOwner(request);
    const available = developmentMediaEnabled();
    return privateJson({ ok: true, available, fonts: available ? await listDevelopmentFonts() : [], maxBytes: MAX_FONT_BYTES, storage: available ? "development-disk" : null, message: available ? "Fonts are stored privately on this development server. Only fonts used in a published site can be read publicly. Back up the upload folder; it is not replicated to cloud storage." : "Font uploads require a persistent local development server. Production font storage is not connected." });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  let acquired = false;
  try {
    await verifyTaylorOwner(request);
    requireDevelopmentMedia();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new TaylorApiError(403, "Upload fonts from Taylor’s Space on this site.");
    if (activeUploads >= 2) throw new TaylorApiError(429, "Two fonts are already being checked. Wait for them to finish, then try again.", 2);
    activeUploads++; acquired = true;
    const { bytes, contentType } = await readFontBody(request);
    const font = await storeDevelopmentFont(bytes, contentType);
    return privateJson({ ok: true, font }, 201);
  } catch (error) { return apiErrorResponse(error); }
  finally { if (acquired) activeUploads--; }
}
