/** Browser-owned always-on-top preview. This does not navigate or authenticate
 * any window; the already verified preview remains its sole content owner. */
export type DocumentPictureInPictureHost = Window & {
  documentPictureInPicture?: { requestWindow(options?: { width?: number; height?: number }): Promise<Window> };
};
export function canPinPreview(host: DocumentPictureInPictureHost): boolean {
  return host.isSecureContext === true && host.top === host && typeof host.documentPictureInPicture?.requestWindow === "function";
}

function mirrorStyles(source: Document, target: Document): () => void {
  const refresh = () => {
    target.head.querySelectorAll("[data-preview-style]").forEach(node => node.remove());
    // Only styles already present in this document; no supplied HTML or URLs.
    source.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style,link[rel="stylesheet"]').forEach(node => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.removeAttribute("id"); copy.setAttribute("data-preview-style", "true");
      target.head.appendChild(copy);
    });
    target.documentElement.className = source.documentElement.className;
    const theme = source.documentElement.getAttribute("data-color-mode");
    if (theme) target.documentElement.setAttribute("data-color-mode", theme);
    else target.documentElement.removeAttribute("data-color-mode");
    target.documentElement.style.cssText = source.documentElement.style.cssText;
  };
  refresh();
  const Observer = source.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(refresh) : null;
  observer?.observe(source.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "media", "disabled"] });
  observer?.observe(source.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-color-mode"] });
  return () => observer?.disconnect();
}

/** One user-gesture request at a time. An old pending request cannot reopen a
 * disposed/revoked preview. No Auth, Firestore, storage or editor operations. */
export function createPinnedPreviewController(host: DocumentPictureInPictureHost, assertCurrent: () => void, onChange: (child: Window | null) => void, onError: (message: string) => void) {
  let active = true, pending = false, generation = 0, child: Window | null = null, stopStyles: (() => void) | null = null;
  const release = (notify = true) => {
    generation++;
    const previous = child; child = null;
    stopStyles?.(); stopStyles = null;
    if (previous && !previous.closed) previous.close();
    if (notify && active) onChange(null);
  };
  const stop = () => { active = false; release(false); };
  host.addEventListener("pagehide", stop);
  return {
    async open() {
      if (!active || pending) return;
      try { assertCurrent(); } catch { release(); onError("Your owner session changed. Reopen the preview after signing in."); return; }
      if (!canPinPreview(host)) { onError("Pinning is not supported in this browser. The regular preview stays open."); return; }
      if (child && !child.closed) { child.focus(); return; }
      pending = true; const request = ++generation;
      try {
        // Invoke before the first await: requestWindow requires user activation.
        const opened = await host.documentPictureInPicture!.requestWindow({ width: 1000, height: 760 });
        if (!active || generation !== request) { opened.close(); return; }
        try { assertCurrent(); } catch { opened.close(); throw new Error("Your owner session changed. Reopen the preview after signing in."); }
        child = opened;
        opened.document.title = "Private builder preview";
        stopStyles = mirrorStyles(host.document, opened.document);
        opened.addEventListener("pagehide", () => { if (child === opened) { child = null; stopStyles?.(); stopStyles = null; if (active) onChange(null); } }, { once: true });
        onChange(opened);
      } catch (error) {
        if (active && generation === request) { release(); onError(error instanceof Error && error.message.startsWith("Your owner session") ? error.message : "Pinning could not open. Use the regular preview or try Pin preview again."); }
      } finally { if (generation === request || active) pending = false; }
    },
    close() { release(); },
    dispose() { stop(); host.removeEventListener("pagehide", stop); },
  };
}
