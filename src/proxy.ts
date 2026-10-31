import { NextResponse, type NextRequest } from "next/server";
import { websiteDeployment } from "./server/website-deployment";
/** Deployment routing is NOT authentication. Every beta data endpoint verifies owner auth. */
export function proxy(request: NextRequest) {
  try {
    const deployment = websiteDeployment(request.headers.get("host"));
    if (deployment.workspace === "beta") {
      const path = request.nextUrl.pathname;
      const allowedApi = /^\/api\/(?:beta-publication|cloud-(?:media|fonts|files|documents)\/[a-f0-9-]{36}|taylor\/(?:cloud-media-check\/[a-f0-9-]{36}|cloud-fonts\/validate|cloud-files\/maintenance))$/;
      if ((path.startsWith("/api/") && !allowedApi.test(path)) || path === "/_next/image") return new NextResponse("Unavailable in the beta website workspace.", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
      if (!path.startsWith("/api/") && !path.startsWith("/_next/") && !/^\/(?:images|fonts|audio|downloads)\//.test(path)) {
        const destination = request.nextUrl.clone(); destination.pathname = "/website-workspace-entry";
        const requestHeaders = new Headers(request.headers); requestHeaders.set("x-tmc-website-path", path);
        return NextResponse.rewrite(destination, { request: { headers: requestHeaders }, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
      }
    }
    return NextResponse.next();
  } catch { return new NextResponse("Website deployment unavailable.", { status: 503, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
}
export const config = { matcher: ["/((?!_next/static|_next/webpack-hmr|favicon.ico|icon.svg).*)"] };
