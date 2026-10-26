"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { assertPublishedOwnerSnapshot, publicContentToOwnerContent } from "@/owner/model";
import type { PublicSiteState } from "@/server/published-site";

const publicationEvent = "tmc:published";
const publicationChannel = "tmc-publication";
const baseline: PublicSiteState = { status: "baseline", reason: "unconfigured" };
type PublicSiteContextValue = { state: PublicSiteState; acceptServerState: (incoming: PublicSiteState) => void };
const PublicSiteContext = createContext<PublicSiteContextValue>({ state: baseline, acceptServerState: () => {} });
function reconcile(previous: PublicSiteState, next: PublicSiteState, lastPublishedRevision: number | null): PublicSiteState {
  if (next.status === "baseline" && lastPublishedRevision !== null) return { status: "error", message: "The published website is temporarily unavailable. Previously published pages have not been replaced with the original site." };
  if (next.status === "published" && lastPublishedRevision !== null && next.snapshot.revision < lastPublishedRevision) return previous;
  if (previous.status === "published" && next.status === "published" && previous.snapshot.revision >= next.snapshot.revision) return previous;
  return next;
}
export function notifyPublicSitePublished() {
  try { window.dispatchEvent(new Event(publicationEvent)); } catch { /* advisory */ }
  try { const channel = new BroadcastChannel(publicationChannel); channel.postMessage("published"); channel.close(); } catch { /* focus/reload still refreshes */ }
}
export function PublicSiteProvider({ initialState, children }: { initialState: PublicSiteState; children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const lastPublishedRevision = useRef<number | null>(initialState.status === "published" ? initialState.snapshot.revision : null);
  const acceptServerState = useCallback((incoming: PublicSiteState) => {
    const knownRevision = lastPublishedRevision.current;
    if (incoming.status === "published") lastPublishedRevision.current = Math.max(knownRevision ?? 0, incoming.snapshot.revision);
    setState(previous => reconcile(previous, incoming, knownRevision));
  }, []);
  const pathname = usePathname();
  const locked = state.status === "locked";
  useEffect(() => {
    if (locked || /^\/(?:taylor|owner)(?:\/|$)/.test(pathname)) return;
    let alive = true;
    let sequence = 0;
    let controller: AbortController | undefined;
    const refresh = async () => {
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/site-published", { cache: "no-store", credentials: "omit", signal: controller.signal });
        const next: PublicSiteState = await response.json();
        // A deployment can close the site while an already-open tab is focused.
        if (next.status === "locked") {
          if (alive && request === sequence) acceptServerState({ status: "locked" });
          return;
        }
        if (!response.ok) throw new Error("Publication unavailable");
        if (next.status === "published") assertPublishedOwnerSnapshot(next.snapshot);
        else if (next.status !== "baseline" || !["unconfigured", "not-published"].includes(next.reason)) throw new Error("Invalid publication");
        if (!alive || request !== sequence) return;
        acceptServerState(next);
      } catch {
        if (alive && request === sequence) setState({ status: "error", message: "The published website could not be refreshed. Please try again shortly. No older or private content has been substituted." });
      }
    };
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(publicationChannel);
    if (channel) channel.onmessage = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(publicationEvent, onFocus);
    document.addEventListener("visibilitychange", onFocus);
    void refresh();
    return () => { alive = false; sequence++; controller?.abort(); channel?.close(); window.removeEventListener("focus", onFocus); window.removeEventListener(publicationEvent, onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [pathname, acceptServerState, locked]);
  return <PublicSiteContext value={{ state, acceptServerState }}>{children}</PublicSiteContext>;
}
export function usePublicSiteState() { return useContext(PublicSiteContext).state; }
export function usePublicServerState(serverState: PublicSiteState) {
  const { state, acceptServerState } = useContext(PublicSiteContext);
  useEffect(() => { acceptServerState(serverState); }, [acceptServerState, serverState]);
  if (serverState.status === "locked" || state.status === "locked") return { status: "locked" } as const;
  // Fresh RSC navigation updates both this page and the persistent shared chrome.
  if (serverState.status === "published" && state.status !== "error" && (state.status !== "published" || serverState.snapshot.revision > state.snapshot.revision)) return serverState;
  return state;
}
export function usePublicOwnerContent() {
  const state = usePublicSiteState();
  return state.status === "published" ? publicContentToOwnerContent(state.snapshot.content) : null;
}
