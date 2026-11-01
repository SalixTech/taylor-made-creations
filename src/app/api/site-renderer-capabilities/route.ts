import { SITE_RENDERER_CAPABILITIES } from "@/owner/site-renderer-capabilities";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(SITE_RENDERER_CAPABILITIES, { headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
