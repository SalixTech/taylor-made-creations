import { apiErrorResponse, privateJson, verifyTaylorOwner } from "@/server/taylor-auth";
import { readHelpRequestId, sendTaylorHelp } from "@/server/taylor-help";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const owner = await verifyTaylorOwner(request);
    const requestId = await readHelpRequestId(request);
    return privateJson(await sendTaylorHelp(owner.uid, requestId));
  } catch (error) { return apiErrorResponse(error); }
}
