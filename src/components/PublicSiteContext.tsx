"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { assertPublishedOwnerSnapshot, publicContentToOwnerContent } from "@/owner/model";
import type { PublicSiteState } from "@/server/published-site";

const publicationEvent = "tmc:published";
const publicationChannel = "tmc-publication";
const baseline: PublicSiteState = { status: "baseline", reason: "unconfigured" };
export const PUBLIC_REFRESH_MS = 30_000;
const MIN_REFRESH_MS = 2_000;
const REFRESH_TIMEOUT_MS = 8_000;
type PublicSiteContextValue = { state: PublicSiteState; acceptServerState: (incoming: PublicSiteState) => void };
const PublicSiteContext = createContext<PublicSiteContextValue>({ state: baseline, acceptServerState: () => {} });
function reconcile(previous: PublicSiteState, next: PublicSiteState, lastPublishedRevision: number | null): PublicSiteState {
  if (next.status === "baseline" && lastPublishedRevision !== null) return { status: "error", message: "The published website is temporarily unavailable. Previously published pages have not been replaced with the original site.", accessRevision: next.accessRevision };
  if (next.status === "published" && lastPublishedRevision !== null && next.snapshot.revision < lastPublishedRevision) return { ...previous, accessRevision: next.accessRevision ?? previous.accessRevision };
  if (previous.status === "published" && next.status === "published" && previous.snapshot.revision >= next.snapshot.revision && previous.accessRevision === next.accessRevision) return previous;
  return next;
}
function validAccessRevision(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1; }
export function notifyPublicSitePublished() {
  try { window.dispatchEvent(new Event(publicationEvent)); } catch { /* advisory */ }
  try { const channel = new BroadcastChannel(publicationChannel); channel.postMessage("published"); channel.close(); } catch { /* bounded polling/focus still refreshes */ }
}
export function PublicSiteProvider({ initialState, children }: { initialState: PublicSiteState; children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const lastPublishedRevision = useRef<number | null>(initialState.status === "published" ? initialState.snapshot.revision : null);
  const lastAccessRevision = useRef(initialState.accessRevision ?? 0);
  const acceptServerState = useCallback((incoming: PublicSiteState) => {
    // Access has its own monotonic revision: an old OFF response cannot reopen
    // a newer ON decision, even when the published content did not change.
    if (validAccessRevision(incoming.accessRevision)) {
      if (incoming.accessRevision < lastAccessRevision.current) return;
      lastAccessRevision.current = incoming.accessRevision;
    }
    const knownRevision = lastPublishedRevision.current;
    if (incoming.status === "published") lastPublishedRevision.current = Math.max(knownRevision ?? 0, incoming.snapshot.revision);
    // Retain the access high-water mark even when a failed check has no revision.
    const next = incoming.accessRevision === undefined && lastAccessRevision.current > 0 ? { ...incoming, accessRevision: lastAccessRevision.current } : incoming;
    setState(previous => reconcile(previous, next, knownRevision));
  }, []);
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(?:taylor|owner)(?:\/|$)/.test(pathname)) return;
    let alive = true;
    let sequence = 0;
    let inFlight = false;
    let lastStarted = -Infinity;
    let controller: AbortController | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState !== "hidden";
    const refresh = async () => {
      if (!alive || !visible() || inFlight || Date.now() - lastStarted < MIN_REFRESH_MS) return;
      lastStarted = Date.now();
      inFlight = true;
      const request = ++sequence;
      const currentController = new AbortController();
      controller = currentController;
      const timeout = setTimeout(() => {
        if (!alive || request !== sequence) return;
        sequence++; inFlight = false; currentController.abort();
        acceptServerState({ status: "locked" });
      }, REFRESH_TIMEOUT_MS);
      requestTimer = timeout;
      try {
        const response = await fetch("/api/site-published", { cache: "no-store", credentials: "omit", signal: currentController.signal });
        const next: PublicSiteState = await response.json();
        if (!alive || request !== sequence || currentController.signal.aborted) return;
        if (next.status === "locked") {
          if (next.accessRevision !== undefined && !validAccessRevision(next.accessRevision)) throw new Error("Invalid access revision");
          acceptServerState(next.accessRevision === undefined ? { status: "locked" } : { status: "locked", accessRevision: next.accessRevision, ...(next.constructionWhimsyEnabled === true ? { constructionWhimsyEnabled: true } : {}) });
          return;
        }
        if (!response.ok || next.status !== "published" || !validAccessRevision(next.accessRevision)) throw new Error("Publication unavailable");
        assertPublishedOwnerSnapshot(next.snapshot);
        acceptServerState({ status: "published", snapshot: next.snapshot, accessRevision: next.accessRevision });
      } catch {
        // Never keep rendering a cached public snapshot after a failed check.
        if (alive && request === sequence) acceptServerState({ status: "locked" });
      } finally {
        clearTimeout(timeout);
        if (request === sequence) inFlight = false;
      }
    };
    const onFocus = () => { if (visible()) void refresh(); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(publicationChannel);
    if (channel) channel.onmessage = onFocus;
    window.addEventListener("focus", onFocus);
    window.addEventListener(publicationEvent, onFocus);
    document.addEventListener("visibilitychange", onFocus);
    let pollTimer: ReturnType<typeof setTimeout>;
    const poll = () => { if (!alive) return; onFocus(); pollTimer = setTimeout(poll, PUBLIC_REFRESH_MS); };
    pollTimer = setTimeout(poll, PUBLIC_REFRESH_MS);
    onFocus();
    return () => {
      alive = false; sequence++; controller?.abort(); clearTimeout(requestTimer); clearTimeout(pollTimer); channel?.close();
      window.removeEventListener("focus", onFocus); window.removeEventListener(publicationEvent, onFocus); document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pathname, acceptServerState]);
  return <PublicSiteContext value={{ state, acceptServerState }}>{children}</PublicSiteContext>;
}
export function usePublicSiteState() { return useContext(PublicSiteContext).state; }
export function usePublicServerState(serverState: PublicSiteState) {
  const { state, acceptServerState } = useContext(PublicSiteContext);
  useEffect(() => { acceptServerState(serverState); }, [acceptServerState, serverState]);
  // An unchanged locked RSC prop must not pin a tab shut after a fresh poll opens
  // it. Only a newer access revision immediately outranks shared client state;
  // an unreadable/unversioned navigation still closes via the effect above.
  if (serverState.status === "locked" && serverState.accessRevision !== undefined && serverState.accessRevision > (state.accessRevision ?? 0)) return serverState;
  // A soft navigation can bring a newer publication than the retained layout.
  // Use it immediately, rather than briefly calling a valid new product missing
  // while the effect above synchronizes the provider. Never outrank a newer lock.
  if (state.status === "published" && serverState.status === "published" && validAccessRevision(serverState.accessRevision) && serverState.accessRevision >= (state.accessRevision ?? 0) && serverState.snapshot.revision > state.snapshot.revision) return serverState;
  return state;
}
export function usePublicOwnerContent() {
  const state = usePublicSiteState();
  return state.status === "published" ? publicContentToOwnerContent(state.snapshot.content) : null;
}
