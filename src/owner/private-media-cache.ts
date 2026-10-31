"use client";
import { betaAssetMetadata, readBetaWebsiteAsset, betaAssetSourceId } from "./beta-assets-client";
import { WEBSITE_WORKSPACE, workspaceBrowserKey } from "./website-workspace-config";
import { PrivatePhotoMemoryCache } from "@/client-hub/private-photo-cache";
import { CLOUD_PHOTO_SOURCE, CLOUD_PHOTO_MAX_BYTES } from "./cloud-files-model";
import type { taylorOwnerSession } from "./taylor-services-client";
type Session = Awaited<ReturnType<typeof taylorOwnerSession>>;
const cache = new PrivatePhotoMemoryCache(32 * 1024 * 1024, 24, 5 * 60_000);
const watched = new WeakMap<object, { user: object; accountKey: string }>();
let running = 0;
const queue: { start: () => void; signal: AbortSignal }[] = [];
function pump() { while (running < 2 && queue.length) { const job = queue.shift()!; if (!job.signal.aborted) { running++; job.start(); } } }
async function bounded<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const job = { signal, start: () => { signal.removeEventListener("abort", abort); resolve(); } };
    const abort = () => { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); reject(new DOMException("Cancelled", "AbortError")); };
    queue.push(job); signal.addEventListener("abort", abort, { once: true }); pump();
  });
  try { if (signal.aborted) throw new DOMException("Cancelled", "AbortError"); return await work(); } finally { running--; pump(); }
}
export function clearOwnerMediaCache() { cache.clear(); }
export async function loadOwnerPrivateMedia(source: string, session: Session, signal: AbortSignal): Promise<Blob> {
  session.assertCurrent(); const user = session.auth.currentUser;
  // Test/development sessions without an SDK user cannot retain private bytes.
  if (!user) return readBytes(source, session, signal);
  const scope = { user, accountKey: workspaceBrowserKey(`owner:${user.uid}`) };
  if (!watched.has(session.auth)) {
    watched.set(session.auth, scope);
    session.auth.onAuthStateChanged(() => { const current = watched.get(session.auth); if (current && session.auth.currentUser !== current.user) cache.clearIfCurrent(current); });
  } else watched.set(session.auth, scope);
  const match = source.match(CLOUD_PHOTO_SOURCE);
  if (!match) return readBytes(source, session, signal);
  return cache.run(scope, source, (previous, sharedSignal) => bounded(sharedSignal, async () => {
    session.assertCurrent(); const before = await metadata(match[1], session, sharedSignal); session.assertCurrent();
    if (previous?.generation === before.generation && previous.blob.size === before.bytes) return { blob: previous.blob, generation: before.generation };
    const blob = await readBytes(source, session, sharedSignal); session.assertCurrent();
    const after = await metadata(match[1], session, sharedSignal); session.assertCurrent();
    if (after.generation !== before.generation || after.bytes !== before.bytes || blob.size !== before.bytes) throw new Error("This photo changed while loading. Try again.");
    return { blob, generation: after.generation };
  }), signal).then(blob => { session.assertCurrent(); return blob; });
}
async function metadata(id: string, session: Session, signal: AbortSignal): Promise<{ generation: string; bytes: number }> {
  if (WEBSITE_WORKSPACE === "beta") { const value = await betaAssetMetadata(id, session, signal); if (value.file.kind !== "photo") throw new Error("Invalid beta photo."); return { generation: value.generation, bytes: value.file.bytes }; }
  const response = await fetch(`/api/taylor/cloud-media-check/${id}`, { headers: { Authorization: `Bearer ${session.token}` }, credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("This private photo could not be checked. Refresh to try again.");
  const data = await response.json();
  if (data.ok !== true || typeof data.generation !== "string" || !/^[0-9]{1,32}$/.test(data.generation) || !Number.isSafeInteger(data.bytes) || data.bytes < 1 || data.bytes > CLOUD_PHOTO_MAX_BYTES || data.contentType !== "image/webp") throw new Error("Invalid private photo response.");
  return data;
}
async function readBytes(source: string, session: Session, signal: AbortSignal): Promise<Blob> {
  if (WEBSITE_WORKSPACE === "beta") return readBetaWebsiteAsset(betaAssetSourceId(source, "photo"), session, signal);
  const response = await fetch(source, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok || response.headers.get("content-type") !== "image/webp") {
    const body = await response.json().catch(() => null);
    throw new Error(body && typeof body.message === "string" ? body.message : "This private photo could not be loaded.");
  }
  const blob = await response.blob(); session.assertCurrent();
  if (blob.size <= 0 || blob.size > CLOUD_PHOTO_MAX_BYTES) throw new Error("The private photo is too large or empty.");
  return blob;
}
