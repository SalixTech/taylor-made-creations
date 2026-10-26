import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export async function GET() {
  // No request parameter, public flag or deployment setting can enable this in production.
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const image = await readFile(path.join(process.cwd(), "dev-fixtures", "product.png"));
  return new Response(image, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
