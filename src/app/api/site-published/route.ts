import { readPublishedSite } from "@/server/published-site";

export const dynamic = "force-dynamic";
export async function GET() {
  const state = await readPublishedSite();
  return Response.json(state, { status: state.status === "error" ? 503 : 200, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
