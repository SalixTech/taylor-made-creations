import { assertClientHubId, assertClientHubProjectId, assertClientHubVersion, type ClientHubProject } from "./model";
export type HubNavigationTab = "overview" | "chat" | "photos" | "support" | "deleted";
export type HubNavigation = { projectId: string; tab: HubNavigationTab };
const TABS: HubNavigationTab[] = ["overview", "chat", "photos", "support", "deleted"];
const PREFIX = "tmc-hub-navigation-v1:";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function key(clientId: string, epoch: number) { assertClientHubId(clientId); assertClientHubVersion(epoch); return `${PREFIX}${clientId}:${epoch}`; }
function browserStorage(): StorageLike | undefined { try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; } }
/** Restore only an actual reload, not fresh navigation/new tabs (including copied sessionStorage).
 * Browser session restoration can preserve a tab; this is not a promise to erase browser history. */
export function restoreHubNavigation(clientId: string, epoch: number, projects: Pick<ClientHubProject, "projectId" | "clientId">[], storage = browserStorage(), navigationType = typeof window === "undefined" ? "navigate" : (window.performance?.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type): HubNavigation | null {
  try {
    const name = key(clientId, epoch);
    if (navigationType !== "reload") { storage?.removeItem(name); return null; }
    const value = JSON.parse(storage?.getItem(name) ?? "null");
    if (!value || Object.keys(value).sort().join(",") !== "projectId,tab" || !TABS.includes(value.tab) || !projects.some(project => project.projectId === value.projectId && project.clientId === clientId)) return null;
    assertClientHubProjectId(value.projectId);
    return { projectId: value.projectId, tab: value.tab };
  } catch { return null; }
}
export function saveHubNavigation(clientId: string, epoch: number, selection: HubNavigation, storage = browserStorage()) {
  try { assertClientHubProjectId(selection.projectId); if (!TABS.includes(selection.tab)) return; storage?.setItem(key(clientId, epoch), JSON.stringify({ projectId: selection.projectId, tab: selection.tab })); } catch { /* Storage denial must not block navigation. */ }
}
export function clearHubNavigation(clientId: string, epoch: number, storage = browserStorage()) { try { storage?.removeItem(key(clientId, epoch)); } catch { /* No credentials or private content are stored here. */ } }
