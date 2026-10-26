import { apiErrorResponse, privateJson, verifyTaylorOwner } from "@/server/taylor-auth";
import { developmentMediaEnabled } from "@/server/dev-media";
import { helpConfiguration } from "@/server/taylor-help";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only configuration check. This endpoint NEVER sends a test email. */
export async function GET(request: Request) {
  try {
    await verifyTaylorOwner(request);
    return privateJson({ ok: true, checkedAt: new Date().toISOString(), auth: "verified", email: helpConfiguration(), files: developmentMediaEnabled() ? "development-disk" : "home-storage-not-connected" });
  } catch (error) { return apiErrorResponse(error); }
}
