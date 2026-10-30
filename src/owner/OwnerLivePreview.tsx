"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { canPinPreview, createPinnedPreviewController } from "./document-pip-preview";
import { SiteContentFrame } from "@/components/SiteContent";
import { ColorModeToggle, useColorMode } from "@/components/ColorMode";
import { FirebaseOwnerGate } from "./FirebaseOwnerGate";
import { isPreviewMessage, PREVIEW_CHANNEL, readPreviewSnapshot, validPreviewNonce, type PreviewSnapshot } from "./live-preview-channel";
import styles from "./OwnerLivePreview.module.css";

const subscribeCapability = () => () => {};
const readPinCapability = () => canPinPreview(window);

export function OwnerLivePreview({ assertCurrent }: { assertCurrent: () => void }) {
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [message, setMessage] = useState("Waiting for your verified editor window…");
  const [pageId, setPageId] = useState<string | null>(null);
  const colorMode = useColorMode("public");
  const pinSupported = useSyncExternalStore(subscribeCapability, readPinCapability, () => false);
  const [pinnedWindow, setPinnedWindow] = useState<Window | null>(null), [pinError, setPinError] = useState<string | null>(null);
  const pinController = useRef<ReturnType<typeof createPinnedPreviewController> | null>(null);
  useEffect(() => {
    const controller = createPinnedPreviewController(window, assertCurrent, setPinnedWindow, setPinError);
    pinController.current = controller;
    return () => { pinController.current = null; controller.dispose(); };
  }, [assertCurrent]);
  useEffect(() => {
    const peer = window.opener as Window | null, origin = window.location.origin;
    let nonce: string | null = null, sequence = -1, lastSeen = Date.now(), locked = false;
    const lock = (text: string) => { locked = true; pinController.current?.close(); setSnapshot(null); setMessage(text); };
    const receive = (event: MessageEvent) => {
      try { assertCurrent(); } catch { lock("Your owner session changed. Sign in again to reopen the preview."); return; }
      if (locked || !isPreviewMessage(event, origin, peer) || !validPreviewNonce(event.data.nonce) || (nonce !== null && event.data.nonce !== nonce)) return;
      const { kind } = event.data;
      if (!["snapshot", "heartbeat", "locked", "unavailable"].includes(kind)) return;
      if (kind === "locked") { lock("The editor session ended. Reopen this preview from Taylor’s Space."); return; }
      if (kind === "snapshot") {
        const next = readPreviewSnapshot(event.data.snapshot);
        if (!next || next.sequence <= sequence) return;
        nonce = event.data.nonce; sequence = next.sequence; setSnapshot(next); setPageId(next.pageId); setMessage("");
      } else if (kind === "unavailable") { nonce = event.data.nonce; setSnapshot(null); setMessage("The current fields are unfinished. Complete them in the editor to resume the preview."); }
      else if (nonce === null) return;
      lastSeen = Date.now();
    };
    window.addEventListener("message", receive);
    const requestSnapshot = () => {
      if (!peer || locked || nonce !== null || peer.closed) return;
      try { assertCurrent(); } catch { lock("Your owner session changed. Sign in again to reopen the preview."); return; }
      peer.postMessage({ channel: PREVIEW_CHANNEL, kind: "ready" }, origin);
    };
    if (peer) requestSnapshot();
    else void Promise.resolve().then(() => { if (!locked) setMessage("Open this synchronized preview using Pop out preview in Taylor’s Space."); });
    const watch = window.setInterval(() => {
      if (!peer || locked) return;
      try { assertCurrent(); } catch { lock("Your owner session changed. Sign in again to reopen the preview."); return; }
      if (peer.closed || Date.now() - lastSeen > 20_000) { lock("The editor connection paused or ended. Reopen this preview from Taylor’s Space."); return; }
      // The authenticated child may mount before the editor listener is ready.
      // Retry only the empty handshake; private data still requires all peer checks.
      requestSnapshot();
    }, 3000);
    return () => { locked = true; window.removeEventListener("message", receive); window.clearInterval(watch); };
  }, [assertCurrent]);
  const page = snapshot?.content.pages.find(item => item.id === pageId && !item.trashedAt);
  const preview = <main className={styles.preview} data-color-mode={colorMode} data-theme-scope="public" aria-label="Synchronized private preview">
    <header className={styles.toolbar}><div><strong>Private live preview</strong><span>{pinnedWindow ? "Pinned preview · closes with this editor" : "Unsaved draft · preview only"}</span></div><ColorModeToggle scope="public" />{pinSupported && snapshot && <button type="button" aria-pressed={!!pinnedWindow} title="Always-on-top preview where supported. Browser security controls remain; closes with this preview." onClick={() => { setPinError(null); if (pinnedWindow) pinController.current?.close(); else void pinController.current?.open(); }}>{pinnedWindow ? "Unpin preview" : "Pin preview"}</button>}<button type="button" onClick={() => window.close()}>Close preview</button></header>
    {pinError && <p className={styles.pinError} role="alert">{pinError}</p>}
    {snapshot && page ? <SiteContentFrame content={snapshot.content} page={page} mode="editor" editable={false} onNavigate={next => setPageId(next.id)} /> : <p className={styles.message} role="status">{message}</p>}
  </main>;
  return pinnedWindow ? <><main className={styles.preview}><p className={styles.message}>Preview is pinned. <button type="button" onClick={() => pinController.current?.close()}>Return preview here</button></p></main>{createPortal(preview, pinnedWindow.document.body)}</> : preview;
}

/** Re-verify owner access in the child before accepting any private draft bytes. */
export default function OwnerLivePreviewEntry() { return <FirebaseOwnerGate>{({ recoveryIdentity }) => <OwnerLivePreview assertCurrent={recoveryIdentity.assertCurrent} />}</FirebaseOwnerGate>; }
