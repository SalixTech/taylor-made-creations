import { apiErrorResponse, privateJson, TaylorApiError, verifyTaylorOwner } from "@/server/taylor-auth";
import { developmentMediaEnabled, listDevelopmentMedia, uploadedAssetName, MAX_MEDIA_BYTES, readMediaBody, requireDevelopmentMedia, storeDevelopmentMedia } from "@/server/dev-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let activeUploads = 0;

export async function GET(request: Request) {
  try {
    await verifyTaylorOwner(request);
    const available = developmentMediaEnabled();
    return privateJson({ ok: true, photos: available ? await listDevelopmentMedia() : [], available, storage: available ? "development-disk" : null, maxBytes: MAX_MEDIA_BYTES, message: available ? "Photos are stored on this development server’s disk, not the home drive or Google Drive. Back up this folder before moving the project. Uploaded photos remain private until referenced in a published version." : "Uploads are not connected on this server. Production storage has not been configured." });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  let acquired = false;
  try {
    await verifyTaylorOwner(request);
    requireDevelopmentMedia();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new TaylorApiError(403, "Upload photos from Taylor’s Space on this site.");
    if (activeUploads >= 2) throw new TaylorApiError(429, "Two photos are already uploading. Wait for them to finish, then try again.", 2);
    activeUploads++; acquired = true;
    const { bytes, contentType } = await readMediaBody(request);
    const media = await storeDevelopmentMedia(bytes, contentType, uploadedAssetName(request, "Uploaded photo"));
    return privateJson({ ok: true, media }, 201);
  } catch (error) { return apiErrorResponse(error); }
  finally { if (acquired) activeUploads--; }
}
