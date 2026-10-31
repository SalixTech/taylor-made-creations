import { websiteHostRole } from "./website-hosts";
import { requireWebsiteWorkspace, websiteDocumentPath, websiteStoragePath } from "./website-workspace";
/** Compiled deployment identity, never inferred from query strings or browser storage. */
export const WEBSITE_WORKSPACE = requireWebsiteWorkspace(process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE ?? "main");
export const workspaceDocument = (path: string) => websiteDocumentPath(WEBSITE_WORKSPACE, path);
export const workspaceObject = (path: string) => websiteStoragePath(WEBSITE_WORKSPACE, path);
export const workspaceBrowserKey = (key: string) => WEBSITE_WORKSPACE === "main" ? key : `tmc-beta:${key}`;
export const workspaceCallableInput = <T extends object>(input: T): T & { workspace?: "beta" } => WEBSITE_WORKSPACE === "main" ? input : { ...input, workspace: "beta" };
/** Defense in depth before SDK initialization; does not authorize the owner. */
export function assertBrowserWorkspaceHost(host = typeof window === "undefined" ? null : window.location.host): void {
  const betaHost = websiteHostRole(host, process.env.NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST ?? "", process.env.NEXT_PUBLIC_TMC_BUILD_PREVIEW_HOST ?? "") !== null;
  if (WEBSITE_WORKSPACE === "beta" ? !betaHost : betaHost) throw new Error("This website host and workspace configuration do not match. No workspace has been opened.");
}
