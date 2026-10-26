import { apiErrorResponse, privateJson, verifyTaylorOwner } from "@/server/taylor-auth";
import { readFontBody, validateFont } from "@/server/dev-fonts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await verifyTaylorOwner(request);
    const { bytes, contentType } = await readFontBody(request);
    const font = await validateFont(bytes, contentType);
    return privateJson({ ok: true, ...font });
  } catch (error) { return apiErrorResponse(error); }
}
