"use client";

import { useEffect, useState } from "react";
import { loadOwnerPrivateMedia } from "./private-media-cache";
import { CLOUD_PHOTO_SOURCE } from "./cloud-files-model";

export const OWNER_MEDIA_SOURCE_PATTERN = /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const PHOTO_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
export const PHOTO_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";
export type UploadedPhoto = { id: string; src: string; width: number; height: number; bytes: number; contentType: "image/webp"; storage: "development-disk" | "firebase-storage" };
export async function uploadOwnerPhoto(file: File, signal?: AbortSignal): Promise<UploadedPhoto> {
  if (!PHOTO_UPLOAD_ACCEPT.split(",").includes(file.type)) throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF photo. SVG is not supported.");
  if (!file.size || file.size > PHOTO_UPLOAD_MAX_BYTES) throw new Error("Each photo must be non-empty and 12 MB or smaller.");
  const { taylorOwnerSession, responseObject } = await import("./taylor-services-client");
  const session = await taylorOwnerSession();
  session.assertCurrent();
  const response = await fetch("/api/taylor/media", { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": file.type, "X-TMC-File-Name": encodeURIComponent(file.name.replace(/\.[^.]+$/, "").slice(0, 150)) }, body: file, cache: "no-store", credentials: "same-origin", signal });
  const body = await responseObject(response);
  session.assertCurrent();
  const media = body.media as Partial<UploadedPhoto> | undefined;
  if (!media || typeof media.id !== "string" || media.src !== `/api/media/${media.id}` || !OWNER_MEDIA_SOURCE_PATTERN.test(media.src) || !Number.isInteger(media.width) || !Number.isInteger(media.height) || !media.width || !media.height || media.contentType !== "image/webp" || media.storage !== "development-disk") throw new Error("The server did not return a valid saved photo. Your draft was not changed.");
  return media as UploadedPhoto;
}

/** Tokens stay in Authorization headers. Draft bytes never need a public URL or token query string. */
export function useOwnerMediaSource(source: string, enabled = true): { src: string | null; error: string | null } {
  const privateMedia = enabled && (OWNER_MEDIA_SOURCE_PATTERN.test(source) || CLOUD_PHOTO_SOURCE.test(source));
  const key = privateMedia ? source : "";
  const [result, setResult] = useState<{ source: string; src: string | null; error: string | null }>({ source: key, src: null, error: null });
  // Reset at the identity boundary, including A → B → A and preview-mode changes.
  // A revoked blob from an earlier request must never flash while a new load starts.
  if (result.source !== key) setResult({ source: key, src: null, error: null });
  useEffect(() => {
    if (!privateMedia) return;
    let alive = true;
    let objectUrl: string | null = null;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    const revoke = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; };
    void (async () => {
      try {
        const { taylorOwnerSession } = await import("./taylor-services-client");
        const session = await taylorOwnerSession();
        if (!alive) return;
        unsubscribe = session.auth.onAuthStateChanged(() => {
          try { session.assertCurrent(); } catch {
            controller.abort(); revoke();
            if (alive) setResult({ source, src: null, error: "Sign in again to view this private photo." });
          }
        });
        const blob = await loadOwnerPrivateMedia(source, session, controller.signal);
        session.assertCurrent();
        if (!alive || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ source, src: objectUrl, error: null });
      } catch (error) {
        if (alive && !controller.signal.aborted) setResult({ source, src: null, error: error instanceof Error ? error.message : "This private photo could not be loaded." });
      }
    })();
    return () => { alive = false; controller.abort(); unsubscribe?.(); revoke(); };
  }, [source, privateMedia]);
  if (!privateMedia) return { src: source, error: null };
  return result?.source === source ? { src: result.src, error: result.error } : { src: null, error: null };
}
