import { OWNER_HUB_LOCATION_CHANGED, OWNER_HUB_LOCATION_RESTORE } from "./owner-hub-location";
/** Owner workspace URLs are intentionally separate from /taylor/preview/*. */
export const OWNER_SECTION_SLUGS = {
  overview: "overview", pages: "pages", prices: "prices", photos: "photos",
  premades: "premades", home: "home", requests: "requests", clients: "client-hub",
  commissionForm: "commission-form", files: "file-hub", inventory: "inventory", services: "services", settings: "settings",
} as const;
export type OwnerSection = keyof typeof OWNER_SECTION_SLUGS;
export type OwnerDestination = { section: OwnerSection; pageId?: string };
export type OwnerNavigationIntent = OwnerDestination & { historyIndex?: number };

export function ownerSectionFromSlug(slug: string): OwnerSection | null {
  return (Object.keys(OWNER_SECTION_SLUGS) as OwnerSection[]).find(section => OWNER_SECTION_SLUGS[section] === slug) ?? null;
}

export function ownerDestinationHref(destination: OwnerDestination): string {
  const page = destination.section === "pages" && destination.pageId ? `?page=${encodeURIComponent(destination.pageId)}` : "";
  return `/taylor/${OWNER_SECTION_SLUGS[destination.section]}${page}`;
}

export function ownerDestinationFromUrl(href: string): OwnerDestination | null {
  const url = new URL(href, "https://owner.invalid");
  const path = url.pathname.replace(/\/$/, "");
  if (path === "/taylor") return { section: "overview" };
  const match = path.match(/^\/taylor\/([^/]+)$/);
  const section = match ? ownerSectionFromSlug(match[1]) : null;
  return section ? { section, ...(section === "pages" && url.searchParams.get("page") ? { pageId: url.searchParams.get("page")! } : {}) } : null;
}

type HistoryMark = { session: string; index: number };
const HISTORY_KEY = "__tmcOwnerNavigation";
function historyMark(state: unknown): HistoryMark | null {
  const mark = state && typeof state === "object" ? (state as Record<string, unknown>)[HISTORY_KEY] as Partial<HistoryMark> | undefined : undefined;
  return mark && typeof mark.session === "string" && Number.isSafeInteger(mark.index) ? mark as HistoryMark : null;
}

/**
 * Keep one authenticated editor mounted as its URL changes. On guarded Back or
 * Forward, first return to the original history entry, then ask Save/Discard/
 * Keep editing. Cancel never pushes a duplicate entry or destroys Forward.
 * State is merged, not replaced, so Next's own history metadata stays intact.
 */
export function createOwnerNavigation(browser: Window, callbacks: {
  blocked: () => boolean;
  dirty: () => boolean;
  current: () => OwnerDestination;
  arrive: (destination: OwnerDestination) => void;
  confirm: (destination: OwnerNavigationIntent) => void;
  interrupted: () => void;
}) {
  const existing = historyMark(browser.history.state);
  let current = { session: existing?.session ?? `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`, index: existing?.index ?? 0 };
  let currentUrl = browser.location.href;
  let currentState = { ...browser.history.state, [HISTORY_KEY]: current };
  let restoring: { index: number; pending: OwnerNavigationIntent | null } | null = null;
  let approvedIndex: number | null = null;
  browser.history.replaceState(currentState, "", currentUrl);

  const acceptPop = (destination: OwnerDestination, mark: HistoryMark) => {
    current = mark; currentUrl = browser.location.href; currentState = browser.history.state;
    callbacks.arrive(destination);
    if (destination.section === "clients") browser.dispatchEvent(new Event(OWNER_HUB_LOCATION_RESTORE));
  };
  const onPopState = (event: PopStateEvent) => {
    const mark = historyMark(event.state ?? browser.history.state);
    const destination = ownerDestinationFromUrl(browser.location.href);
    if (mark?.session === current.session && destination) {
      // The same workspace owns these entries; do not let Next remount it and
      // drop unsaved in-memory edits before our guard has made a decision.
      event.stopImmediatePropagation();
      if (restoring) {
        if (mark.index !== restoring.index) { browser.history.go(restoring.index - mark.index); return; }
        const pending = restoring.pending; restoring = null;
        if (pending) callbacks.confirm(pending);
        return;
      }
      if (approvedIndex === mark.index) { approvedIndex = null; acceptPop(destination, mark); return; }
      approvedIndex = null;
      if (callbacks.blocked() || (callbacks.dirty() && destination.section !== callbacks.current().section)) {
        const pending = callbacks.blocked() ? null : { ...destination, historyIndex: mark.index };
        restoring = { index: current.index, pending };
        if (!pending) callbacks.interrupted();
        browser.history.go(current.index - mark.index);
      } else acceptPop(destination, mark);
      return;
    }
    // Leaving the workspace normally uses a document navigation and native
    // beforeunload. This fallback also protects an older, unowned SPA entry.
    if ((callbacks.dirty() || callbacks.blocked()) && !browser.confirm("You have unsaved changes or an operation in progress. Leave Taylor’s Space without saving?")) {
      event.stopImmediatePropagation();
      browser.history.pushState(currentState, "", currentUrl);
    }
  };
  browser.addEventListener("popstate", onPopState, true);
  const hubLocationChanged = () => {
    const mark = historyMark(browser.history.state);
    if (restoring || approvedIndex !== null || mark?.session !== current.session || mark.index !== current.index || ownerDestinationFromUrl(browser.location.href)?.section !== "clients") return;
    currentUrl = browser.location.href; currentState = browser.history.state;
  };
  browser.addEventListener(OWNER_HUB_LOCATION_CHANGED, hubLocationChanged);

  return {
    get restoring() { return restoring !== null || approvedIndex !== null; },
    replace(destination: OwnerDestination) {
      if (restoring || approvedIndex !== null) return;
      currentState = { ...browser.history.state, [HISTORY_KEY]: current };
      browser.history.replaceState(currentState, "", ownerDestinationHref(destination));
      currentUrl = browser.location.href;
      callbacks.arrive(destination);
    },
    arrive(destination: OwnerNavigationIntent) {
      if (restoring || approvedIndex !== null) return;
      if (destination.historyIndex !== undefined && destination.historyIndex !== current.index) {
        approvedIndex = destination.historyIndex;
        browser.history.go(destination.historyIndex - current.index);
        return;
      }
      const url = ownerDestinationHref(destination);
      if (new URL(currentUrl, "https://owner.invalid").pathname + new URL(currentUrl, "https://owner.invalid").search !== url) {
        current = { ...current, index: current.index + 1 };
        currentState = { ...browser.history.state, [HISTORY_KEY]: current };
        browser.history.pushState(currentState, "", url);
        currentUrl = browser.location.href;
      }
      callbacks.arrive(destination);
    },
    dispose() { browser.removeEventListener("popstate", onPopState, true); browser.removeEventListener(OWNER_HUB_LOCATION_CHANGED, hubLocationChanged); },
  };
}
