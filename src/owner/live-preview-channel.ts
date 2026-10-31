import { workspaceBrowserKey } from "./website-workspace-config";
import { validateOwnerContent, type OwnerContent } from "./model";

export const PREVIEW_CHANNEL = workspaceBrowserKey("tmc-owner-live-preview-v1");
export const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export type PreviewSnapshot = { content: OwnerContent; pageId: string; sequence: number };
export const validPreviewNonce = (nonce: unknown): nonce is string => typeof nonce === "string" && /^[a-f0-9-]{36}$/i.test(nonce);
/** Only the allowlisted site-content model crosses the preview boundary, never portal/session state. */
export function createPreviewSnapshot(content: OwnerContent, pageId: string, sequence: number): PreviewSnapshot {
  const raw = JSON.stringify(content);
  if (raw.length * 2 > PREVIEW_MAX_BYTES || !Number.isSafeInteger(sequence) || sequence < 0 || !validateOwnerContent(content).valid || !content.pages.some(page => page.id === pageId && !page.trashedAt)) throw new Error("Finish the current fields before updating the pop-out preview. Your edits are still here.");
  return { content: JSON.parse(raw) as OwnerContent, pageId, sequence };
}
export function readPreviewSnapshot(value: unknown): PreviewSnapshot | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "content,pageId,sequence") return null;
    const snapshot = value as PreviewSnapshot;
    return createPreviewSnapshot(snapshot.content, snapshot.pageId, snapshot.sequence);
  } catch { return null; }
}
export function isPreviewMessage(event: Pick<MessageEvent, "origin" | "source" | "data">, origin: string, peer: Window | null): boolean {
  return !!peer && event.source === peer && event.origin === origin && !!event.data && typeof event.data === "object" && event.data.channel === PREVIEW_CHANNEL;
}
