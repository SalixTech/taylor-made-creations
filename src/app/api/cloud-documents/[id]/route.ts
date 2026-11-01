import { CLOUD_FILE_ID } from "@/owner/cloud-files-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Main-only renderer: the fixed tokenless gateway rechecks current publication. */
export async function GET(_request: Request, context: { params: Promise<{id:string}> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  const {id} = await context.params;
  if (!CLOUD_FILE_ID.test(id)) return new Response("File not found.", {status:404,headers});
  return new Response(null, {status:302,headers:{...headers,Location:`https://us-central1-taylor-made-creations.cloudfunctions.net/tmcPublishedWebsiteDocument?id=${id}`}});
}
