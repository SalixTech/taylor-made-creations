"use client";

import { collection, getDocs, limit, query } from "firebase/firestore/lite";
import { getFunctions, httpsCallable } from "firebase/functions";
import { hubCallableOwnerSession } from "@/client-hub/callable-owner-session";
import { assertClientHubProjectId, assertClientHubVersion, CLIENT_HUB_PROJECT_STATUSES as HUB_PROJECT_STATUSES, clientHubObject, decodeClientHubProject, type ClientHubProject, type ClientHubProjectStatus } from "@/client-hub/model";
export const TRELLO_PROJECT_STATUSES = HUB_PROJECT_STATUSES.filter(status => status !== "cancelled");
const CLIENT_HUB_PROJECT_STATUSES = TRELLO_PROJECT_STATUSES;
import { taylorOwnerSession } from "./taylor-services-client";

export const TRELLO_CALLBACK_URL = "https://us-central1-taylor-made-creations.cloudfunctions.net/tmcTrelloWebhook";
export const TRELLO_ID = /^[a-f0-9]{24}$/;
export type TrelloPublicFields = Pick<ClientHubProject, "title" | "summary" | "status" | "progress">;
export type TrelloMappingPreview = { previewHash: string; projectId: string; cardId: string; local: TrelloPublicFields & { sections: TrelloChecklistSection[] }; remote: TrelloPublicFields & { sections: TrelloChecklistSection[] } };
export type TrelloConfig = { version: number; enabled: boolean; boardId: string; lists: Record<Exclude<ClientHubProjectStatus, "cancelled">, string>; callbackUrl: string; publicTransferApproved: boolean; webhookId?: string | null; registrationUncertain?: boolean };
export type TrelloChecklistSection = { id: string; name: string; items: { id: string; name: string; complete: boolean }[] };
export type TrelloMapping = { projectId: string; cardId: string; version: number; state: string; lastError?: string | null; sections: TrelloChecklistSection[]; lastSyncedAt?: string | null; conflict?: { local: TrelloPublicFields; remote: TrelloPublicFields; detectedAt: string; reason?: string; localSections?: TrelloChecklistSection[]; remoteSections?: TrelloChecklistSection[] } | null };
export type TrelloStatus = { config: TrelloConfig | null; ready: boolean; gaps: string[]; mappings: TrelloMapping[] };
export type TrelloConfigInput = Omit<TrelloConfig, "version" | "webhookId" | "registrationUncertain"> & { expectedVersion: number };

function invalid(): never { throw new Error("The Trello connection returned an unreadable record. Refresh before continuing."); }
function trelloId(value: unknown): string { if (typeof value !== "string" || !TRELLO_ID.test(value)) invalid(); return value; }
function text(value: unknown, max: number, empty = false): string { if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(); return value; }
function iso(value: unknown): string { const result = text(value, 32); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) invalid(); return result; }
export function validateTrelloCallbackUrl(value: string): string {
  if (value !== TRELLO_CALLBACK_URL) throw new Error("Use the exact configured Taylor Made Creations Trello webhook endpoint.");
  return value;
}
function sections(value: unknown): TrelloChecklistSection[] {
  if (!Array.isArray(value) || value.length > 12) invalid();
  const result = value.map(row => {
    const raw = clientHubObject(row);
    if (!Array.isArray(raw.items) || raw.items.length > 60) invalid();
    return { id: trelloId(raw.id), name: text(raw.name, 150), items: raw.items.map(item => {
      const entry = clientHubObject(item); if (typeof entry.complete !== "boolean") invalid();
      return { id: trelloId(entry.id), name: text(entry.name, 300), complete: entry.complete };
    }) };
  });
  const itemIds = result.flatMap(section => section.items.map(item => item.id));
  const ids = [...result.map(section => section.id), ...itemIds];
  if (itemIds.length > 60) invalid();
  if (new Set(result.map(section => section.id)).size !== result.length || new Set(ids).size !== ids.length) invalid();
  return result;
}
function publicFields(value: unknown): TrelloPublicFields {
  const raw = clientHubObject(value);
  if (!CLIENT_HUB_PROJECT_STATUSES.includes(raw.status as Exclude<ClientHubProjectStatus, "cancelled">) || raw.progress !== null && (!Number.isSafeInteger(raw.progress) || (raw.progress as number) < 0 || (raw.progress as number) > 100)) invalid();
  return { title: text(raw.title, 150), summary: text(raw.summary, 3000, true), status: raw.status as ClientHubProjectStatus, progress: raw.progress as number | null };
}
function config(value: unknown): TrelloConfig {
  const raw = clientHubObject(value), lists = clientHubObject(raw.lists);
  assertClientHubVersion(raw.version);
  if (typeof raw.enabled !== "boolean" || typeof raw.publicTransferApproved !== "boolean") invalid();
  if (new Set(CLIENT_HUB_PROJECT_STATUSES.map(status => lists[status])).size !== CLIENT_HUB_PROJECT_STATUSES.length) invalid();
  const result: TrelloConfig = { version: raw.version, enabled: raw.enabled, boardId: trelloId(raw.boardId), lists: Object.fromEntries(CLIENT_HUB_PROJECT_STATUSES.map(status => [status, trelloId(lists[status])])) as TrelloConfig["lists"], callbackUrl: validateTrelloCallbackUrl(text(raw.callbackUrl, 2048)), publicTransferApproved: raw.publicTransferApproved };
  if (raw.registrationUncertain !== undefined) { if (typeof raw.registrationUncertain !== "boolean") invalid(); result.registrationUncertain = raw.registrationUncertain; }
  if (raw.webhookId !== undefined) result.webhookId = raw.webhookId === null ? null : trelloId(raw.webhookId);
  return result;
}
function mapping(value: unknown): TrelloMapping {
  const raw = clientHubObject(value); assertClientHubProjectId(raw.projectId); assertClientHubVersion(raw.version);
  const result: TrelloMapping = { projectId: raw.projectId, cardId: trelloId(raw.cardId), version: raw.version, state: text(raw.state, 40), sections: sections(raw.sections ?? []) };
  if (raw.lastError !== undefined) result.lastError = raw.lastError === null ? null : text(raw.lastError, 600);
  if (raw.lastSyncedAt !== undefined) result.lastSyncedAt = raw.lastSyncedAt === null ? null : iso(raw.lastSyncedAt);
  if (raw.conflict !== undefined) {
    const conflict = raw.conflict === null ? null : clientHubObject(raw.conflict);
    result.conflict = conflict && { local: publicFields(conflict.local), remote: publicFields(conflict.remote), detectedAt: iso(conflict.detectedAt), ...(conflict.reason !== undefined ? { reason: text(conflict.reason, 600) } : {}), ...((conflict.localSections ?? clientHubObject(conflict.local).sections) !== undefined ? { localSections: sections(conflict.localSections ?? clientHubObject(conflict.local).sections) } : {}), ...((conflict.remoteSections ?? clientHubObject(conflict.remote).sections) !== undefined ? { remoteSections: sections(conflict.remoteSections ?? clientHubObject(conflict.remote).sections) } : {}) };
  }
  return result;
}
export function decodeTrelloStatus(value: unknown): TrelloStatus {
  const raw = clientHubObject(value);
  if (typeof raw.ready !== "boolean" || !Array.isArray(raw.gaps) || raw.gaps.length > 40 || !Array.isArray(raw.mappings) || raw.mappings.length > 1000) invalid();
  const mappings = raw.mappings.map(mapping);
  if (new Set(mappings.map(item => item.projectId)).size !== mappings.length || new Set(mappings.map(item => item.cardId)).size !== mappings.length) invalid();
  return { config: raw.config === null ? null : config(raw.config), ready: raw.ready, gaps: raw.gaps.map(value => text(value, 400)), mappings };
}
async function call(name: string, input: unknown): Promise<Record<string, unknown>> {
  const session = await hubCallableOwnerSession(); session.assertCurrent();
  const response = await httpsCallable<unknown, unknown>(getFunctions(session.auth.app, "us-central1"), name)(input);
  session.assertCurrent(); return clientHubObject(response.data);
}
export async function loadTrelloStatus(): Promise<TrelloStatus> { return decodeTrelloStatus(await call("tmcTrelloStatus", {})); }
export async function listTrelloProjects(): Promise<ClientHubProject[]> {
  const session = await taylorOwnerSession();
  const snapshot = await getDocs(query(collection(session.db, "hubProjects"), limit(501))); session.assertCurrent();
  if (snapshot.size > 500) throw new Error("There are more than 500 commissions. Filtered commission selection needs to be configured before mapping.");
  return snapshot.docs.map(row => decodeClientHubProject(row.data(), row.id)).sort((a, b) => a.title.localeCompare(b.title) || a.projectId.localeCompare(b.projectId));
}
export async function saveTrelloConfig(input: TrelloConfigInput): Promise<void> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || typeof input.enabled !== "boolean" || typeof input.publicTransferApproved !== "boolean") throw new Error("Refresh Trello setup before saving.");
  const lists = Object.fromEntries(CLIENT_HUB_PROJECT_STATUSES.map(status => [status, trelloId(input.lists[status])])) as TrelloConfig["lists"];
  if (new Set(Object.values(lists)).size !== CLIENT_HUB_PROJECT_STATUSES.length) throw new Error("Each commission status needs a different Trello list ID.");
  await call("tmcTrelloSaveConfig", { expectedVersion: input.expectedVersion, boardId: trelloId(input.boardId), lists, callbackUrl: validateTrelloCallbackUrl(input.callbackUrl), enabled: input.enabled, publicTransferApproved: input.publicTransferApproved });
}
export async function mapTrelloProject(input: { projectId: string; expectedProjectVersion: number; cardId: string; publicTransferApproved: true; initialDirection: "hub" | "trello"; importChecklistSections: boolean; previewHash: string }): Promise<void> {
  assertClientHubProjectId(input.projectId); assertClientHubVersion(input.expectedProjectVersion);
  if (typeof input.previewHash !== "string" || !/^[a-f0-9]{64}$/.test(input.previewHash) || typeof input.importChecklistSections !== "boolean" || input.publicTransferApproved !== true || !["hub", "trello"].includes(input.initialDirection)) throw new Error("Review and approve this commission’s public transfer before mapping.");
  await call("tmcTrelloMapProject", { projectId: input.projectId, expectedProjectVersion: input.expectedProjectVersion, cardId: trelloId(input.cardId), publicTransferApproved: true, initialDirection: input.initialDirection, importChecklistSections: input.importChecklistSections, previewHash: input.previewHash });
}
export async function queueTrelloSync(projectId: string, expectedMappingVersion: number): Promise<void> {
  assertClientHubProjectId(projectId); assertClientHubVersion(expectedMappingVersion); await call("tmcTrelloSyncNow", { projectId, expectedMappingVersion });
}
export async function resolveTrelloConflict(projectId: string, expectedMappingVersion: number, choice: "hub" | "trello"): Promise<void> {
  assertClientHubProjectId(projectId); assertClientHubVersion(expectedMappingVersion);
  if (!["hub", "trello"].includes(choice)) throw new Error("Choose the reviewed version to keep.");
  await call("tmcTrelloResolveConflict", { projectId, expectedMappingVersion, choice });
}
export async function registerTrelloWebhook(expectedConfigVersion: number): Promise<void> {
  assertClientHubVersion(expectedConfigVersion); await call("tmcTrelloRegisterWebhook", { expectedConfigVersion, confirmation: "register-webhook" });
}

export async function saveTrelloChecklist(projectId: string, expectedMappingVersion: number, items: { id: string; complete: boolean }[]): Promise<void> {
  assertClientHubProjectId(projectId); assertClientHubVersion(expectedMappingVersion);
  if (!Array.isArray(items) || items.length > 60 || items.some(item => !TRELLO_ID.test(item.id) || typeof item.complete !== "boolean") || new Set(items.map(item => item.id)).size !== items.length) throw new Error("Refresh the mapped checklist before saving.");
  await call("tmcTrelloSaveChecklist", { projectId, expectedMappingVersion, items: items.map(item => ({ id: item.id, complete: item.complete })) });
}

export async function previewTrelloMapping(input: { projectId: string; expectedProjectVersion: number; cardId: string; importChecklistSections: boolean }): Promise<TrelloMappingPreview> {
  assertClientHubProjectId(input.projectId); assertClientHubVersion(input.expectedProjectVersion);
  if (typeof input.importChecklistSections !== "boolean") throw new Error("Review the checklist import choice first.");
  const cardId = trelloId(input.cardId);
  const response = await call("tmcTrelloPreviewMapping", { projectId: input.projectId, expectedProjectVersion: input.expectedProjectVersion, cardId, importChecklistSections: input.importChecklistSections });
  if (response.projectId !== input.projectId || response.cardId !== cardId || typeof response.previewHash !== "string" || !/^[a-f0-9]{64}$/.test(response.previewHash)) invalid();
  const local = clientHubObject(response.local), remote = clientHubObject(response.remote);
  return { projectId: input.projectId, cardId, previewHash: response.previewHash, local: { ...publicFields(local), sections: sections(local.sections) }, remote: { ...publicFields(remote), sections: sections(remote.sections) } };
}

export async function verifyTrelloWebhook(expectedConfigVersion: number, webhookId: string): Promise<void> {
  assertClientHubVersion(expectedConfigVersion); await call("tmcTrelloVerifyWebhook", { expectedConfigVersion, webhookId: trelloId(webhookId) });
}
