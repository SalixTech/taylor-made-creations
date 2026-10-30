"use client";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CLIENT_HUB_FUNCTIONS_REGION, ClientHubError, verifiedClientHubConnection } from "./client";
import { hubCallableOwnerSession } from "./callable-owner-session";
import { clearHubPhotoCache } from "./private-photo-cache";
import { assertClientHubProjectId, clientHubObject, ClientHubDataError, type ClientHubProject } from "./model";

export const HUB_FILE_COPIES_CHANGED = "tmc-hub-file-copies-changed";
export type HubFileCopySelection = { kind: "photo" | "attachment"; fileId: string };
export type HubFileCopyDeletion = HubFileCopySelection & { deleted: true; deletedAt: string; cleanupEligible: boolean; physicalCleanupEnabled: false };
async function connection(project: ClientHubProject, owner: boolean, signal?: AbortSignal) {
  assertClientHubProjectId(project.projectId);
  if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
  if (owner) { const session = await hubCallableOwnerSession(); session.assertCurrent(); return session; }
  const session = await verifiedClientHubConnection(signal, false);
  if (session.session.clientId !== project.clientId) throw new ClientHubError("session-expired", "This commission is not part of your active Client Hub session.");
  session.assertCurrent(); return session;
}
function selection(file: HubFileCopySelection) {
  if (!file || !["photo", "attachment"].includes(file.kind)) throw new ClientHubDataError("Choose a photo or attachment.");
  assertClientHubProjectId(file.fileId);
  return { kind: file.kind, fileId: file.fileId };
}
export async function deleteHubFileCopy(project: ClientHubProject, owner: boolean, input: HubFileCopySelection): Promise<HubFileCopyDeletion> {
  const file = selection(input), session = await connection(project, owner);
  const result = clientHubObject((await httpsCallable<unknown, unknown>(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcHubDeleteFileCopy")({ projectId: project.projectId, ...file })).data);
  session.assertCurrent();
  if (result.kind !== file.kind || result.fileId !== file.fileId || result.deleted !== true || typeof result.deletedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result.deletedAt) || !Number.isFinite(Date.parse(result.deletedAt)) || typeof result.cleanupEligible !== "boolean" || result.physicalCleanupEnabled !== false) throw new ClientHubDataError("Your file-copy deletion could not be confirmed. Refresh before retrying.");
  clearHubPhotoCache();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(HUB_FILE_COPIES_CHANGED, { detail: { projectId: project.projectId, clientId: project.clientId, owner } }));
  return result as unknown as HubFileCopyDeletion;
}
/** Call after all asynchronous archive/blob preparation, immediately before download. */
export async function verifyHubFileCopies(project: ClientHubProject, owner: boolean, selected: HubFileCopySelection[], signal?: AbortSignal): Promise<void> {
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 200) throw new ClientHubDataError("Choose 1 to 200 file copies to verify.");
  const files = selected.map(selection), session = await connection(project, owner, signal);
  const result = clientHubObject((await httpsCallable<unknown, unknown>(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcHubVerifyFileCopies")({ projectId: project.projectId, files })).data);
  session.assertCurrent();
  if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
  if (result.verified !== true || !Array.isArray(result.files) || result.files.length !== files.length || result.files.some((value: unknown, index: number) => { const file = clientHubObject(value); return file.kind !== files[index].kind || file.fileId !== files[index].fileId; })) throw new ClientHubDataError("File-copy access could not be confirmed. Refresh before downloading.");
}
