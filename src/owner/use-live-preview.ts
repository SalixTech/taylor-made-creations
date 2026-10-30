"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPreviewSnapshot, isPreviewMessage, PREVIEW_CHANNEL } from "./live-preview-channel";
import type { OwnerContent } from "./model";

export function useLivePreview(content: OwnerContent | null, pageId: string | undefined, onError: (message: string) => void, assertCurrent?: () => void) {
  const child = useRef<Window | null>(null), nonce = useRef(""), sequence = useRef(0), active = useRef(true), ready = useRef(false);
  const current = useRef({ content, pageId });
  const heartbeat = useRef<number | null>(null);
  const send = useCallback(() => {
    if (!active.current || !ready.current || !child.current || child.current.closed || !nonce.current) return;
    const value = current.current;
    try {
      assertCurrent?.();
      if (!value.content || !value.pageId) throw new Error("Choose a page to preview.");
      const snapshot = createPreviewSnapshot(value.content, value.pageId, ++sequence.current);
      child.current.postMessage({ channel: PREVIEW_CHANNEL, kind: "snapshot", nonce: nonce.current, snapshot }, window.location.origin);
    } catch (error) {
      child.current.postMessage({ channel: PREVIEW_CHANNEL, kind: "unavailable", nonce: nonce.current }, window.location.origin);
      onError(error instanceof Error ? error.message : "The pop-out preview could not update.");
    }
  }, [onError, assertCurrent]);
  const close = useCallback(() => {
    active.current = false;
    if (heartbeat.current !== null) { window.clearInterval(heartbeat.current); heartbeat.current = null; }
    if (child.current && !child.current.closed) {
      child.current.postMessage({ channel: PREVIEW_CHANNEL, kind: "locked", nonce: nonce.current }, window.location.origin);
      child.current.close();
    }
    child.current = null; nonce.current = ""; ready.current = false;
  }, []);
  useEffect(() => {
    active.current = true;
    const receive = (event: MessageEvent) => {
      // This endpoint accepts only a ready handshake, never navigation, save,
      // publication, credential or editing commands from the other window.
      if (isPreviewMessage(event, window.location.origin, child.current) && event.data.kind === "ready") { ready.current = true; send(); }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); close(); };
  }, [send, close]);
  useEffect(() => { current.current = { content, pageId }; const timer = window.setTimeout(send, 180); return () => window.clearTimeout(timer); }, [content, pageId, send]);
  const open = useCallback(() => {
    try { assertCurrent?.(); } catch { onError("Your owner session changed. Sign in again before opening a preview."); return; }
    if (!active.current || !current.current.content || !current.current.pageId) return;
    // An explicit reopen creates a fresh authenticated receiver, including after
    // a throttled/background window expired its heartbeat. Never revive stale bytes.
    if (child.current && !child.current.closed) {
      child.current.postMessage({ channel: PREVIEW_CHANNEL, kind: "locked", nonce: nonce.current }, window.location.origin);
      child.current.close();
    }
    ready.current = false; nonce.current = crypto.randomUUID();
    child.current = window.open("/taylor/live-preview", `tmc-preview-${nonce.current}`, "popup,width=1280,height=900");
    if (heartbeat.current !== null) { window.clearInterval(heartbeat.current); heartbeat.current = null; }
    if (!child.current) { onError("The browser blocked the preview window. Allow pop-ups for this site, then try again."); return; }
    heartbeat.current = window.setInterval(() => {
      try { assertCurrent?.(); } catch { close(); return; }
      if (!child.current || child.current.closed) { if (heartbeat.current !== null) window.clearInterval(heartbeat.current); heartbeat.current = null; return; }
      if (active.current && nonce.current) child.current.postMessage({ channel: PREVIEW_CHANNEL, kind: "heartbeat", nonce: nonce.current }, window.location.origin);
    }, 3000);
  }, [onError, close, assertCurrent]);
  return { open, close };
}
