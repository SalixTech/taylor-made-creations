import { readCloudFileResponse } from "@/server/cloud-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return readCloudFileResponse(request, (await context.params).id, new URL(request.url).searchParams.get("kind") === "file" ? "file" : "pdf");
}
