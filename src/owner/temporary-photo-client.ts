"use client";

import { OWNER_MEDIA_SOURCE_PATTERN, PHOTO_UPLOAD_MAX_BYTES, type UploadedPhoto } from "./media-client";
import { notifyPrivateAssetLibraryChanged } from "./asset-library-client";

export type StagedPhoto = UploadedPhoto & { name: string; createdAt: string; trashedAt?: string | null; revision?: number };
export function isStagedPhoto(value: unknown): value is StagedPhoto {
  if (!value || typeof value !== "object") return false;
  const photo = value as Partial<StagedPhoto>;
  return typeof photo.id === "string" && photo.src === `/api/media/${photo.id}` && OWNER_MEDIA_SOURCE_PATTERN.test(photo.src)
    && typeof photo.name === "string" && photo.name.length > 0 && photo.name.length <= 150
    && typeof photo.createdAt === "string" && Number.isFinite(Date.parse(photo.createdAt))
    && (photo.trashedAt === undefined || photo.trashedAt === null || typeof photo.trashedAt === "string" && Number.isFinite(Date.parse(photo.trashedAt)))
    && (photo.revision === undefined || Number.isSafeInteger(photo.revision) && photo.revision >= 0)
    && photo.storage === "development-disk" && photo.contentType === "image/webp"
    && Number.isInteger(photo.width) && Number.isInteger(photo.height) && (photo.width ?? 0) > 0 && (photo.width ?? 0) <= 20_000 && (photo.height ?? 0) > 0 && (photo.height ?? 0) <= 20_000
    && Number.isInteger(photo.bytes) && (photo.bytes ?? 0) > 0 && (photo.bytes ?? 0) <= PHOTO_UPLOAD_MAX_BYTES;
}

/** Library-only Trash. The server keeps image bytes and all draft/published references intact. */
export async function changeTemporaryPhotoTrash(id: string, action: "trash" | "restore", signal?: AbortSignal): Promise<StagedPhoto> {
  if (!OWNER_MEDIA_SOURCE_PATTERN.test(`/api/media/${id}`)) throw new Error("Choose a valid temporary photo.");
  const { taylorOwnerSession, responseObject } = await import("./taylor-services-client");
  const session = await taylorOwnerSession();
  session.assertCurrent();
  const response = await fetch("/api/taylor/media", {
    method: "PATCH", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }), cache: "no-store", credentials: "same-origin", signal,
  });
  const result = await responseObject(response);
  session.assertCurrent();
  if (!isStagedPhoto(result.media) || result.media.id !== id || (action === "trash") !== Boolean(result.media.trashedAt)) throw new Error("The server did not confirm this library change. Refresh to check the photo’s status.");
  notifyPrivateAssetLibraryChanged("/api/taylor/media");
  return result.media;
}

export type ConfirmedTrashEntry = { id: string; trashedAt: string; revision: number };
export type EmptyTrashOutcome = { id: string; status: "removed" | "already-removed" | "changed" | "failed" };
/** A fixed confirmed snapshot, batched without adding later arrivals to Trash. */
export async function emptyTemporaryPhotoTrash(entries: readonly ConfirmedTrashEntry[], signal?: AbortSignal): Promise<EmptyTrashOutcome[]> {
  if (!entries.length || new Set(entries.map(entry => entry.id.toLowerCase())).size !== entries.length
    || entries.some(entry => !OWNER_MEDIA_SOURCE_PATTERN.test(`/api/media/${entry.id}`)
      || typeof entry.trashedAt !== "string" || !Number.isFinite(Date.parse(entry.trashedAt)) || new Date(entry.trashedAt).toISOString() !== entry.trashedAt
      || !Number.isSafeInteger(entry.revision) || entry.revision < 0)) throw new Error("Choose valid temporary Trash entries before confirming removal.");
  const confirmed = entries.map(entry => ({ ...entry }));
  const { taylorOwnerSession, responseObject } = await import("./taylor-services-client");
  const session = await taylorOwnerSession();
  const outcomes: EmptyTrashOutcome[] = [];
  try {
    for (let offset = 0; offset < confirmed.length; offset += 100) {
      session.assertCurrent();
      signal?.throwIfAborted();
      const batch = confirmed.slice(offset, offset + 100).map(entry => ({ id: entry.id.toLowerCase(), trashedAt: entry.trashedAt, revision: entry.revision }));
      const response = await fetch("/api/taylor/media", {
        method: "DELETE", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "empty-trash", entries: batch }), cache: "no-store", credentials: "same-origin", signal,
      });
      const result = await responseObject(response);
      session.assertCurrent();
      const values = result.outcomes;
      if (result.filesRetained !== true || !Array.isArray(values) || values.length !== batch.length
        || values.some((value: unknown, index: number) => !value || typeof value !== "object" || !("id" in value) || value.id !== batch[index].id
          || !("status" in value) || typeof value.status !== "string" || !["removed", "already-removed", "changed", "failed"].includes(value.status))) throw new Error("The server did not confirm all requested library removals.");
      outcomes.push(...values as EmptyTrashOutcome[]);
    }
    return outcomes;
  } finally {
    // Even a lost response can follow a committed removal; never keep a stale list.
    notifyPrivateAssetLibraryChanged("/api/taylor/media");
  }
}
