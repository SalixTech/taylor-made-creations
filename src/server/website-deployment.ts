import { requireWebsiteWorkspace, type WebsiteWorkspace } from "../owner/website-workspace";
import { websiteHostRole } from "../owner/website-hosts";
export { BETA_HOST, BUILD_HOST } from "../owner/website-hosts";
export function websiteDeployment(host: string | null, server = process.env.TMC_WEBSITE_WORKSPACE ?? "main", browser = process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE ?? "main"): { workspace: WebsiteWorkspace; builder: boolean } {
  const workspace = requireWebsiteWorkspace(server);
  if (workspace !== requireWebsiteWorkspace(browser)) throw new Error("Website deployment configuration does not match.");
  const betaPreview = process.env.TMC_BETA_PREVIEW_HOST ?? "", buildPreview = process.env.TMC_BUILD_PREVIEW_HOST ?? "";
  if (betaPreview !== (process.env.NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST ?? "") || buildPreview !== (process.env.NEXT_PUBLIC_TMC_BUILD_PREVIEW_HOST ?? "")) throw new Error("Website preview host configuration does not match.");
  const role = websiteHostRole(host, betaPreview, buildPreview);
  if (workspace === "beta" ? !role : !!role) throw new Error("This hostname is not configured for this website workspace.");
  return { workspace, builder: role === "build" };
}
