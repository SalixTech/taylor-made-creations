import { assertClientHubId, assertClientHubProjectId } from "@/client-hub/model";
import type { WorkspaceTab } from "@/client-hub/ProjectWorkspace";
export type OwnerHubLocation = { clientId: string; projectId?: string; tab: WorkspaceTab };
export const OWNER_HUB_LOCATION_RESTORE = "tmc-owner-hub-location-restore";
export const OWNER_HUB_LOCATION_CHANGED = "tmc-owner-hub-location-changed";
const PATH = "/taylor/client-hub";
const tabs: WorkspaceTab[] = ["overview", "chat", "photos", "support", "studio", "deleted"];
/** Navigation hints only. The authenticated directory and detail reads grant access. */
export function readOwnerHubLocation(href: string): OwnerHubLocation | null {
  try {
    const url = new URL(href, "https://owner.invalid");
    if (url.pathname.replace(/\/$/, "") !== PATH || ["client", "commission", "tab"].some(key => url.searchParams.getAll(key).length > 1)) return null;
    const clientId = url.searchParams.get("client"), projectId = url.searchParams.get("commission");
    assertClientHubId(clientId); if (projectId) assertClientHubProjectId(projectId);
    const rawTab = url.searchParams.get("tab");
    return { clientId, ...(projectId ? { projectId } : {}), tab: tabs.includes(rawTab as WorkspaceTab) ? rawTab as WorkspaceTab : "overview" };
  } catch { return null; }
}
export function ownerHubHref(selection: OwnerHubLocation | null): string {
  if (!selection) return PATH;
  assertClientHubId(selection.clientId); if (selection.projectId) assertClientHubProjectId(selection.projectId);
  if (!tabs.includes(selection.tab)) throw new Error("Unknown workspace tab.");
  const query = new URLSearchParams({ client: selection.clientId, ...(selection.projectId ? { commission: selection.projectId, tab: selection.tab } : {}) });
  return `${PATH}?${query}`;
}
/** Replace this entry only; preserve Next and the sole owner's history marker. */
export function replaceOwnerHubLocation(selection: OwnerHubLocation | null, browser: Window = window): boolean {
  try {
    if (browser.location.pathname.replace(/\/$/, "") !== PATH) return false;
    const href = ownerHubHref(selection);
    if (browser.location.pathname + browser.location.search === href) return true;
    browser.history.replaceState(browser.history.state, "", href);
    browser.dispatchEvent(new Event(OWNER_HUB_LOCATION_CHANGED));
    return true;
  } catch { return false; } // Navigation persistence never discards the foreground workspace.
}
