import { readOwnerCloudPhotoMetadata } from "@/server/cloud-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return readOwnerCloudPhotoMetadata(request, (await context.params).id); }
