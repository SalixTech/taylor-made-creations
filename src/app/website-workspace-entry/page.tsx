import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { websiteDeployment } from "@/server/website-deployment";
import OwnerLivePreviewEntry from "@/owner/OwnerLivePreview";
import OwnerWorkspaceEntry from "@/owner/OwnerWorkspaceEntry";
import { BetaWebsiteEntry } from "@/owner/BetaWebsiteEntry";
/** Only the proxy's dedicated inert segment executes on beta/build page requests. */
export default async function WebsiteWorkspaceEntryRoute() {
  const requestHeaders = await headers();
  const deployment = websiteDeployment(requestHeaders.get("host"));
  if (deployment.workspace !== "beta") notFound();
  const pathname = requestHeaders.get("x-tmc-website-path") ?? "/";
  if (deployment.builder && pathname === "/taylor/live-preview") return <OwnerLivePreviewEntry />;
  return deployment.builder ? <OwnerWorkspaceEntry fullPageBuilder /> : <BetaWebsiteEntry pathname={pathname} />;
}
