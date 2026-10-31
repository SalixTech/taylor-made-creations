"use client";
import { WEBSITE_WORKSPACE } from "./website-workspace-config";
import { assertCloudId, decodeCloudFile, type CloudFile } from "./cloud-files-model";
import type { taylorOwnerSession } from "./taylor-services-client";
type Session = Awaited<ReturnType<typeof taylorOwnerSession>>;
const MAX_BYTES = 12 * 1024 * 1024, CHUNK_BYTES = 1024 * 1024;
export type BetaAssetMetadata = { file: CloudFile; generation: string };
export async function requestWebsiteAsset(input: object, signal: AbortSignal | undefined, session: Session): Promise<unknown> {
  const action = "action" in input ? input.action : undefined;
  if (WEBSITE_WORKSPACE === "main" && !["upload", "metadata", "readChunk"].includes(String(action))) throw new Error("This action is unavailable on the main website asset gateway.");
  signal?.throwIfAborted(); session.assertCurrent();
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  signal?.throwIfAborted(); session.assertCurrent();
  const result = await httpsCallable(getFunctions(session.auth.app, "us-central1"), "tmcOwnerWebsiteAssets")({ ...input, workspace: WEBSITE_WORKSPACE });
  signal?.throwIfAborted(); session.assertCurrent(); return result.data;
}
export async function betaAssetMetadata(id: string, session: Session, signal?: AbortSignal): Promise<BetaAssetMetadata> {
  assertCloudId(id);
  const raw = await requestWebsiteAsset({ action: "metadata", fileId: id }, signal, session) as Partial<BetaAssetMetadata>;
  if (!raw || typeof raw !== "object" || !raw.file || raw.file.id !== id || typeof raw.generation !== "string" || !/^[0-9]{1,32}$/.test(raw.generation)) throw new Error("Invalid beta asset metadata.");
  const { id: omitted, ...data } = raw.file; void omitted;
  const file = decodeCloudFile(data, id);
  if ((WEBSITE_WORKSPACE === "main" && file.kind !== "document") || !["photo", "font", "document"].includes(file.kind) || file.status !== "ready" || file.trashedAt || file.bytes > MAX_BYTES) throw new Error("This beta website asset is unavailable.");
  return { file, generation: raw.generation };
}
export async function readBetaWebsiteAsset(id: string, session: Session, signal?: AbortSignal, expected?: BetaAssetMetadata): Promise<Blob> {
  assertCloudId(id);
  const metadata = expected ?? await betaAssetMetadata(id, session, signal);
  if ((WEBSITE_WORKSPACE === "main" && metadata.file.kind !== "document") || metadata.file.id !== id || metadata.file.bytes > MAX_BYTES || metadata.file.bytes < 1) throw new Error("Invalid beta asset identity.");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let offset = 0;
  while (offset < metadata.file.bytes) {
    const value = await requestWebsiteAsset({ action: "readChunk", fileId: id, offset, generation: metadata.generation, revision: metadata.file.revision }, signal, session) as Record<string, unknown>;
    if (!value || value.fileId !== id || value.revision !== metadata.file.revision || value.generation !== metadata.generation || value.contentType !== metadata.file.contentType || value.totalBytes !== metadata.file.bytes || value.offset !== offset || typeof value.base64 !== "string" || value.base64.length > 4 * Math.ceil(CHUNK_BYTES / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)) throw new Error("This beta asset changed or its bytes could not be verified.");
    const decoded = atob(value.base64), bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    if (bytes.length !== Math.min(CHUNK_BYTES, metadata.file.bytes - offset)) throw new Error("Invalid beta asset chunk size.");
    offset += bytes.length;
    if (value.nextOffset !== (offset === metadata.file.bytes ? null : offset)) throw new Error("Incomplete beta asset response.");
    chunks.push(bytes);
  }
  signal?.throwIfAborted(); session.assertCurrent();
  return new Blob(chunks, { type: metadata.file.contentType });
}
export function betaAssetSourceId(source: string, kind: "photo" | "font" | "document"): string {
  const prefix = kind === "photo" ? "cloud-media" : kind === "font" ? "cloud-fonts" : "cloud-documents";
  const match = source.match(new RegExp(`^/api/${prefix}/([a-f0-9-]{36})$`));
  if (!match) throw new Error("This asset is not a beta website asset.");
  assertCloudId(match[1]); return match[1];
}

export type BetaUploadStatus = { fileId: string; registryStatus: "absent" | "uploading" | "ready"; objectStatus: "unknown" | "absent" | "matching" | "mismatch"; receiptStatus: "absent" | "matching" | "mismatch" };
/** Read-only inspection; presence of bytes is never represented as a completed upload. */
export async function betaUploadStatus(id: string, session: Session, signal?: AbortSignal): Promise<BetaUploadStatus> {
  assertCloudId(id);
  if (WEBSITE_WORKSPACE !== "beta") throw new Error("Pending upload inspection is available only in beta.");
  const value = await requestWebsiteAsset({ action: "uploadStatus", fileId: id }, signal, session) as BetaUploadStatus;
  if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "fileId,objectStatus,receiptStatus,registryStatus" || value.fileId !== id || !["absent", "uploading", "ready"].includes(value.registryStatus) || !["unknown", "absent", "matching", "mismatch"].includes(value.objectStatus) || !["absent", "matching", "mismatch"].includes(value.receiptStatus)) throw new Error("This pending upload status could not be verified.");
  return value;
}
