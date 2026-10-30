import { readPublicTheme } from "@/server/site-theme";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(await readPublicTheme(), { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
