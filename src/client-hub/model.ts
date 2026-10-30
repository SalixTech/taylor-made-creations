import type { HubConversationVisibility } from "./conversation-state";
export class ClientHubDataError extends Error {
  constructor(message: string) { super(message); this.name = "ClientHubDataError"; }
}

/** Safe public Client Hub records. Login codes and contact details are never part of these records. */
export const CLIENT_HUB_STATUSES = ["active", "suspended"] as const;
export const CLIENT_HUB_PROJECT_STATUSES = ["queued", "in-progress", "on-hold", "delayed", "completed", "shipped", "delivered", "cancelled"] as const;
export type ClientHubStatus = typeof CLIENT_HUB_STATUSES[number];
export type ClientHubProjectStatus = typeof CLIENT_HUB_PROJECT_STATUSES[number];
/** Manual studio organization only; never proof of payment or checkout authority. */
export const CLIENT_HUB_INFORMATION_TAGS = ["paid-100", "paid-partial", "dtd-needed", "dtd-received"] as const;
export type ClientHubInformationTag = typeof CLIENT_HUB_INFORMATION_TAGS[number] | `custom:${string}`;
export function validateClientHubInformationTags(value: unknown): ClientHubInformationTag[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || JSON.stringify(value).length > 12000 || value.some(tag => typeof tag !== "string" || !(CLIENT_HUB_INFORMATION_TAGS.includes(tag as typeof CLIENT_HUB_INFORMATION_TAGS[number]) || /^custom:[^\x00-\x1f\x7f]{1,60}$/.test(tag) && tag === tag.trim())) || new Set(value).size !== value.length || value.includes("paid-100") && value.includes("paid-partial") || value.includes("dtd-needed") && value.includes("dtd-received")) throw new ClientHubDataError("Choose distinct commission labels (custom labels: up to 60 characters), with only one paid and DTD label.");
  return [...CLIENT_HUB_INFORMATION_TAGS.filter(tag => value.includes(tag)), ...value.filter(tag => !CLIENT_HUB_INFORMATION_TAGS.includes(tag))] as ClientHubInformationTag[];
}
export type ProjectLocalLabelDefinition = { name: string; color: string | null; deleted?: true };
export type ProjectLocalLabelDefinitions = Record<string, ProjectLocalLabelDefinition>;
export type LocalLabelDefinition = ProjectLocalLabelDefinition;
export type LocalLabelDefinitions = ProjectLocalLabelDefinitions;
export function validateLocalLabelDefinitions(value: unknown): ProjectLocalLabelDefinitions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 100) throw new ClientHubDataError("Keep at most 100 commission-only label definitions.");
  return Object.fromEntries(Object.keys(value).sort().map(key => {
    const entry = (value as Record<string, ProjectLocalLabelDefinition>)[key];
    if (!/^custom:local_[a-f0-9]{32}$/.test(key) || !entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length < 2 || Object.keys(entry).length > 3 || Object.keys(entry).some(field => !["name", "color", "deleted"].includes(field)) || (entry.deleted !== undefined && entry.deleted !== true) || typeof entry.name !== "string" || !entry.name.trim() || entry.name !== entry.name.trim() || entry.name.length > 60 || /[\x00-\x1f\x7f]/.test(entry.name) || !(entry.color === null || typeof entry.color === "string" && /^#[0-9a-fA-F]{6}$/.test(entry.color))) throw new ClientHubDataError("Check the commission-only label identity, name, and hex color.");
    return [key, { name: entry.name, color: entry.color?.toUpperCase() ?? null, ...(entry.deleted === true ? { deleted: true as const } : {}) }];
  }));
}
export function newLocalLabelKey(existingKeys: Iterable<string> = []): `custom:${string}` {
  const used = new Set(existingKeys);
  for (let attempt = 0; attempt < 10; attempt++) { const key = `custom:local_${crypto.randomUUID().replaceAll("-", "")}` as const; if (!used.has(key)) return key; }
  throw new ClientHubDataError("A fresh label identity could not be created. Try again.");
}
export type HubMilestone = { id: string; label: string; status: ClientHubProjectStatus; hidden?: boolean; stageLabel?: string };
export const DEFAULT_HUB_MILESTONES: HubMilestone[] = [
  { id: "queued", label: "Not Started", status: "queued" }, { id: "making", label: "Making", status: "in-progress" },
  { id: "completed", label: "Completed", status: "completed" }, { id: "shipped", label: "Shipped", status: "shipped" }, { id: "delivered", label: "Delivered", status: "delivered" },
];
export function validateHubMilestones(value: unknown): HubMilestone[] {
  if (!Array.isArray(value) || value.length < 3 || JSON.stringify(value).length > 16000) throw new ClientHubDataError("Choose a valid milestone list.");
  const nodes = value.map(item => {
    const node = clientHubObject(item);
    if (Object.keys(node).some(key => !["id", "label", "status", "hidden", "stageLabel"].includes(key)) || typeof node.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id) || !CLIENT_HUB_PROJECT_STATUSES.includes(node.status as ClientHubProjectStatus)) throw new ClientHubDataError("Choose a valid milestone identifier and lifecycle status.");
    if (node.hidden !== undefined && typeof node.hidden !== "boolean") throw new ClientHubDataError("Choose whether this milestone is visible.");
    if (node.stageLabel !== undefined && (typeof node.stageLabel !== "string" || !node.stageLabel.trim() || node.stageLabel !== node.stageLabel.trim() || node.stageLabel.length > 60 || /[\x00-\x1f\x7f]/.test(node.stageLabel) || ["completed", "shipped", "delivered"].includes(node.status as string))) throw new ClientHubDataError("Use a custom progress stage of up to 60 characters. Completion stages keep their usual meaning.");
    return { ...(node.stageLabel === undefined ? {} : { stageLabel: node.stageLabel as string }), id: node.id, label: string(node.label, "milestone label", 60).trim(), status: node.status as ClientHubProjectStatus, ...(node.hidden === undefined ? {} : { hidden: node.hidden as boolean }) };
  });
  if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw new ClientHubDataError("Milestone identifiers must be unique.");
  return nodes;
}
export function getProjectMilestones(project: Pick<ClientHubProject, "milestones">): HubMilestone[] {
  const nodes = project.milestones ?? DEFAULT_HUB_MILESTONES;
  let missing = Math.max(0, 3 - nodes.filter(node => !node.hidden).length);
  return nodes.map(node => node.hidden && missing-- > 0 ? { ...node, hidden: false } : node);
}
export type ClientHubClient = {
  clientId: string; displayName: string; nickname?: string; avatarVersion?: number; status: ClientHubStatus; authVersion: number;
  createdAt: string; updatedAt: string;
};
export type HubCompletionEpisode = { episode: number; state: "paused" | "active"; completedAt: string | null; expiresAt: string | null; expiredThroughEpisode: number };
/** Empty order inherits account defaults; this changes presentation only. */
export function validateProjectLabelOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1100 || new Set(value).size !== value.length) throw new ClientHubDataError("Choose a valid commission label order.");
  for (const key of value) { if (key !== "status" && key !== "information") validateClientHubInformationTags([key]); }
  return [...value] as string[];
}
export type ClientHubProject = { labelOrder?: string[]; localLabelDefinitions?: ProjectLocalLabelDefinitions; trackingEnabled?: boolean; completionEpisode?: HubCompletionEpisode; milestones?: HubMilestone[]; activeMilestoneId?: string | null; ownerArchived?: boolean; clientArchived?: boolean;
  projectId: string; clientId: string; title: string; summary: string; status: ClientHubProjectStatus; informationTags?: ClientHubInformationTag[];
  progress: number | null; progressSource: "manual" | "trello"; trackingUrl: string | null; trelloUrl?: string | null; requestId: string | null;
  version: number; createdAt: string; updatedAt: string;
};
export type ClientHubSession = { uid: string; clientId: string; authVersion: number };
export type ClientHubDashboard = { client: ClientHubClient; projects: ClientHubProject[] };
export type ClientHubCreateClientInput = { labelOrder?: string[]; localLabelDefinitions?: ProjectLocalLabelDefinitions; informationTags?: ClientHubInformationTag[]; operationId: string; displayName: string; email?: string; projectTitle?: string; requestId?: string };
export type ClientHubCreateProjectInput = { labelOrder?: string[]; localLabelDefinitions?: ProjectLocalLabelDefinitions; trackingEnabled?: boolean; operationId: string; clientId: string; title: string; summary?: string; requestId?: string; informationTags?: ClientHubInformationTag[] };
export type ClientHubUpdateProjectInput = { labelOrder?: string[]; localLabelDefinitions?: ProjectLocalLabelDefinitions; trackingEnabled?: boolean; milestones?: HubMilestone[]; activeMilestoneId?: string | null; projectId: string; expectedVersion: number; title: string; summary: string; status: ClientHubProjectStatus; progress: number | null; trackingUrl?: string | null; trelloUrl?: string | null; informationTags?: ClientHubInformationTag[] };
export type ClientHubCreateClientResult = { client: ClientHubClient; project: ClientHubProject | null; signInCode?: string };
export type ClientHubUpdateClientProfileInput = { clientId: string; expectedUpdatedAt: string; displayName: string; email?: string };
export type ClientHubResetCodeResult = { clientId: string; authVersion: number; signInCode: string };

export function isClientHubId(value: unknown): value is string { return typeof value === "string" && /^TMC-[A-F0-9]{16}$/.test(value); }
export function isClientHubCode(value: unknown): value is string { return typeof value === "string" && (CLIENT_HUB_LEGACY_CODE.test(value) || CLIENT_HUB_COMPACT_CODE.test(value)); }
export function assertClientHubId(value: unknown): asserts value is string {
  if (!isClientHubId(value)) throw new ClientHubDataError("This permanent client ID is not valid.");
}
export function assertClientHubVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ClientHubDataError("This record version is not valid. Refresh before continuing.");
}
export function assertClientHubProjectId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new ClientHubDataError("This commission ID is not valid.");
}
export function clientHubObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClientHubDataError("The Client Hub returned an unreadable record. Refresh and try again.");
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ClientHubDataError(`The Client Hub returned an invalid ${label}.`);
  return value;
}
function iso(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ClientHubDataError("The Client Hub returned an invalid date.");
  return value;
}
export function safeClientHubTrackingUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim()) throw new ClientHubDataError("Use a valid HTTPS tracking link.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ClientHubDataError("Use a valid HTTPS tracking link."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname.includes(".")) throw new ClientHubDataError("Use a valid HTTPS tracking link.");
  return value;
}
export function safeClientHubTrelloUrl(value: unknown): string | null {
  const url = safeClientHubTrackingUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.hostname !== "trello.com" || parsed.port || !/^\/c\/[A-Za-z0-9]{8,}(?:\/[A-Za-z0-9_-]+)?\/?$/.test(parsed.pathname) || parsed.search || parsed.hash) throw new ClientHubDataError("Use a full Trello card link, such as https://trello.com/c/Ab12Cd34/card-name.");
  return url;
}
export function decodeClientHubClient(value: unknown, documentId?: string): ClientHubClient {
  const raw = clientHubObject(value); assertClientHubId(raw.clientId); assertClientHubVersion(raw.authVersion);
  if (documentId !== undefined && documentId !== raw.clientId) throw new ClientHubDataError("The Client Hub returned a mismatched client record.");
  if (!CLIENT_HUB_STATUSES.includes(raw.status as ClientHubStatus)) throw new ClientHubDataError("The Client Hub returned an invalid account status.");
  return { clientId: raw.clientId, displayName: string(raw.displayName, "client name", 100), ...(raw.nickname !== undefined ? { nickname: string(raw.nickname, "display nickname", 60, true) } : {}), ...(raw.avatarVersion !== undefined ? { avatarVersion: positiveSequence(raw.avatarVersion) } : {}), status: raw.status as ClientHubStatus, authVersion: raw.authVersion, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
}
export function decodeClientHubProject(value: unknown, documentId?: string): ClientHubProject {
  const raw = clientHubObject(value); assertClientHubProjectId(raw.projectId); assertClientHubId(raw.clientId); assertClientHubVersion(raw.version);
  if (documentId !== undefined && documentId !== raw.projectId) throw new ClientHubDataError("The Client Hub returned a mismatched commission record.");
  if (!CLIENT_HUB_PROJECT_STATUSES.includes(raw.status as ClientHubProjectStatus)) throw new ClientHubDataError("The Client Hub returned an invalid commission status.");
  if (raw.progress !== null && (!Number.isSafeInteger(raw.progress) || (raw.progress as number) < 0 || (raw.progress as number) > 100)) throw new ClientHubDataError("The Client Hub returned invalid commission progress.");
  if (raw.progressSource !== "manual" && raw.progressSource !== "trello") throw new ClientHubDataError("The commission progress source is not supported.");
  if (raw.trackingEnabled !== undefined && typeof raw.trackingEnabled !== "boolean") throw new ClientHubDataError("Choose whether commission tracking is shown.");
  const requestId = raw.requestId === null ? null : string(raw.requestId, "request reference", 128);
  if (requestId !== null && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestId)) throw new ClientHubDataError("The Client Hub returned an invalid request reference.");
  const milestones = raw.milestones === undefined ? undefined : validateHubMilestones(raw.milestones);
  if (raw.clientArchived !== undefined && typeof raw.clientArchived !== "boolean") throw new ClientHubDataError("The client commission archive flag is invalid.");
  if (raw.ownerArchived !== undefined && typeof raw.ownerArchived !== "boolean") throw new ClientHubDataError("The commission archive flag is invalid.");
  if (raw.activeMilestoneId !== undefined && raw.activeMilestoneId !== null && typeof raw.activeMilestoneId !== "string") throw new ClientHubDataError("The commission milestone is invalid.");
  return { ...(raw.labelOrder === undefined ? {} : { labelOrder: validateProjectLabelOrder(raw.labelOrder) }), ...(raw.localLabelDefinitions === undefined ? {} : { localLabelDefinitions: validateLocalLabelDefinitions(raw.localLabelDefinitions) }), ...(raw.clientArchived === undefined ? {} : { clientArchived: raw.clientArchived as boolean }), ...(raw.trackingEnabled === undefined ? {} : { trackingEnabled: raw.trackingEnabled as boolean }), ...(milestones === undefined ? {} : { milestones }), ...(raw.activeMilestoneId === undefined ? {} : { activeMilestoneId: raw.activeMilestoneId as string | null }), ...(raw.ownerArchived === undefined ? {} : { ownerArchived: raw.ownerArchived as boolean }), ...(raw.completionEpisode === undefined ? {} : { completionEpisode: decodeHubCompletionEpisode(raw.completionEpisode) }), projectId: raw.projectId, clientId: raw.clientId, title: string(raw.title, "commission title", 150), ...(raw.informationTags !== undefined ? { informationTags: validateClientHubInformationTags(raw.informationTags) } : {}), summary: string(raw.summary, "commission summary", 3000, true), status: raw.status as ClientHubProjectStatus, progress: raw.progress as number | null, progressSource: raw.progressSource, trackingUrl: safeClientHubTrackingUrl(raw.trackingUrl), trelloUrl: safeClientHubTrelloUrl(raw.trelloUrl), requestId, version: raw.version, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
}
export function decodeClientHubSession(uid: unknown, claims: Record<string, unknown>): ClientHubSession {
  if (claims.hubRole !== "client" || !isClientHubId(claims.hubClientId) || uid !== `hub:${claims.hubClientId}` || !Number.isSafeInteger(claims.hubAuthVersion) || (claims.hubAuthVersion as number) < 1) throw new ClientHubDataError("Your Client Hub session is not valid. Sign in again with your current code.");
  return { uid: uid as string, clientId: claims.hubClientId, authVersion: claims.hubAuthVersion as number };
}

/** Workspace documents intentionally exclude owner contact details and sign-in secrets. */
export type HubMessage = { attachmentIds?: string[]; messageId: string; projectId: string; clientId: string; senderRole: "owner" | "client"; body: string; createdAt: string };
export type HubPhoto = { photoId: string; projectId: string; clientId: string; storagePath: string; fileName: string; caption: string; contentType: "image/jpeg" | "image/png" | "image/webp"; size: number; createdAt: string; folderName?: string; sequence?: number };
export type HubSupportRequest = { attachmentIds?: string[]; requestId: string; projectId: string; clientId: string; type: "update" | "support" | "photo-deletion"; body: string; photoId: string | null; status: "open" | "resolved" | "closed" | "cancelled"; senderRole?: "owner" | "client"; unansweredSince?: string | null; lastClientMessageAt?: string | null; lastOwnerMessageAt?: string | null; response: string; createdAt: string; updatedAt: string; version: number };
export type HubMaterialRequirement = { inventoryItemId: string; requiredQuantity: number };
export type HubPrivateWorkspace = { projectId: string; clientId: string; notes: string; materials: HubMaterialRequirement[]; version: number; updatedAt: string };
export type HubSupportReply = { attachmentIds?: string[]; replyId: string; requestId: string; projectId: string; clientId: string; senderRole: "owner" | "client"; body: string; createdAt: string };
export type HubNotificationChannel = "chat" | "photos" | "requests";
export type HubNotification = { notificationId: string; requestId?: string; projectId: string; clientId: string; recipientRole: "owner" | "client"; channel: HubNotificationChannel; latestItemId: string; latestAt: string; version: number; readVersion: number; acknowledgedVersion?: number; dismissedVersion?: number; readAt: string | null; throughItemId: string | null; throughCreatedAt: string | null };
export type HubReadCursor = HubNotification;
export type HubProjectWorkspace = { visibility?: HubConversationVisibility[]; requestReplies?: HubSupportReply[]; notifications?: HubNotification[]; receipts?: HubReadCursor[]; messages: HubMessage[]; photos: HubPhoto[]; requests: HubSupportRequest[]; privateWorkspace: HubPrivateWorkspace | null };
export const HUB_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const HUB_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const HUB_WORKSPACE_READ_LIMIT = 200;
function workspaceIdentity(raw: Record<string, unknown>, project?: Pick<ClientHubProject, "clientId" | "projectId">) {
  assertClientHubId(raw.clientId); assertClientHubProjectId(raw.projectId);
  if (project && (raw.clientId !== project.clientId || raw.projectId !== project.projectId)) throw new ClientHubDataError("This workspace record belongs to a different commission. No data can be shown.");
  return { clientId: raw.clientId, projectId: raw.projectId };
}
function recordId(value: unknown, documentId?: string): string {
  assertClientHubProjectId(value);
  if (documentId !== undefined && documentId !== value) throw new ClientHubDataError("The Client Hub returned a mismatched workspace record.");
  return value;
}
export function decodeHubMessage(value: unknown, documentId?: string, project?: ClientHubProject): HubMessage {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project);
  if (raw.senderRole !== "owner" && raw.senderRole !== "client") throw new ClientHubDataError("The message sender could not be verified.");
  if (raw.attachmentIds !== undefined && (!Array.isArray(raw.attachmentIds) || raw.attachmentIds.length < 1 || raw.attachmentIds.length > 5 || new Set(raw.attachmentIds).size !== raw.attachmentIds.length)) throw new ClientHubDataError("The message attachments could not be verified.");
  return { ...identity, ...(raw.attachmentIds === undefined ? {} : { attachmentIds: (raw.attachmentIds as unknown[]).map(value => recordId(value)) }), messageId: recordId(raw.messageId, documentId), senderRole: raw.senderRole, body: string(raw.body, "message", 4000), createdAt: iso(raw.createdAt) };
}
export function hubPhotoPath(photo: Pick<HubPhoto, "clientId" | "projectId" | "photoId">): string {
  assertClientHubId(photo.clientId); assertClientHubProjectId(photo.projectId); assertClientHubProjectId(photo.photoId);
  return `hub-progress/${photo.clientId}/${photo.projectId}/${photo.photoId}`;
}
export function decodeHubPhoto(value: unknown, documentId?: string, project?: ClientHubProject): HubPhoto {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project), photoId = recordId(raw.photoId, documentId);
  if (!HUB_PHOTO_TYPES.includes(raw.contentType as HubPhoto["contentType"]) || !Number.isSafeInteger(raw.size) || (raw.size as number) <= 0 || (raw.size as number) > HUB_PHOTO_MAX_BYTES || raw.storagePath !== hubPhotoPath({ ...identity, photoId })) throw new ClientHubDataError("This photo could not be verified safely.");
  return { ...identity, photoId, storagePath: raw.storagePath as string, contentType: raw.contentType as HubPhoto["contentType"], size: raw.size as number, fileName: string(raw.fileName, "photo name", 180), caption: string(raw.caption, "photo caption", 1000, true), createdAt: iso(raw.createdAt), ...(raw.folderName !== undefined ? { folderName: string(raw.folderName, "photo folder", 80, true) } : {}), ...(raw.sequence !== undefined ? { sequence: positiveSequence(raw.sequence) } : {}) };
}
function supportIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5 || new Set(value).size !== value.length) throw new ClientHubDataError("The request attachments are invalid.");
  return value.map(id => recordId(id));
}
export function decodeHubSupportRequest(value: unknown, documentId?: string, project?: ClientHubProject): HubSupportRequest {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project);
  if (!["update", "support", "photo-deletion"].includes(raw.type as string) || !["open", "resolved", "closed", "cancelled"].includes(raw.status as string)) throw new ClientHubDataError("This support request could not be read safely.");
  const photoId = raw.photoId === null ? null : recordId(raw.photoId);
  if (raw.type === "photo-deletion" ? photoId === null : photoId !== null) throw new ClientHubDataError("This support request contains an invalid photo reference.");
  assertClientHubVersion(raw.version);
  return { ...identity, ...(raw.attachmentIds === undefined ? {} : { attachmentIds: supportIds(raw.attachmentIds) }), requestId: recordId(raw.requestId, documentId), type: raw.type as HubSupportRequest["type"], body: string(raw.body, "request", 4000), photoId, status: raw.status as HubSupportRequest["status"], ...(raw.senderRole !== undefined ? { senderRole: senderRole(raw.senderRole) } : {}), ...(raw.unansweredSince !== undefined ? { unansweredSince: raw.unansweredSince === null ? null : iso(raw.unansweredSince) } : {}), ...(raw.lastClientMessageAt !== undefined ? { lastClientMessageAt: raw.lastClientMessageAt === null ? null : iso(raw.lastClientMessageAt) } : {}), ...(raw.lastOwnerMessageAt !== undefined ? { lastOwnerMessageAt: raw.lastOwnerMessageAt === null ? null : iso(raw.lastOwnerMessageAt) } : {}), response: string(raw.response, "support response", 4000, true), createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt), version: raw.version };
}
export function validateHubMaterials(value: unknown): HubMaterialRequirement[] {
  if (!Array.isArray(value) || value.length > 50) throw new ClientHubDataError("Use up to 50 material estimates per commission.");
  const result = value.map(item => {
    const raw = clientHubObject(item);
    if (typeof raw.inventoryItemId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.inventoryItemId)) throw new ClientHubDataError("Choose a valid inventory item.");
    if (typeof raw.requiredQuantity !== "number" || !Number.isFinite(raw.requiredQuantity) || raw.requiredQuantity <= 0 || raw.requiredQuantity > 1_000_000 || Math.abs(raw.requiredQuantity * 1000 - Math.round(raw.requiredQuantity * 1000)) > 0.000001) throw new ClientHubDataError("Material estimates must be positive quantities with up to three decimal places.");
    return { inventoryItemId: raw.inventoryItemId, requiredQuantity: raw.requiredQuantity };
  });
  if (new Set(result.map(item => item.inventoryItemId)).size !== result.length) throw new ClientHubDataError("Each inventory item can appear only once in a material estimate.");
  return result;
}
export function decodeHubPrivateWorkspace(value: unknown, documentId?: string, project?: ClientHubProject): HubPrivateWorkspace {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project); recordId(raw.projectId, documentId); assertClientHubVersion(raw.version);
  return { ...identity, notes: string(raw.notes, "private studio notes", 10000, true), materials: validateHubMaterials(raw.materials), version: raw.version, updatedAt: iso(raw.updatedAt) };
}

export const CLIENT_HUB_COMPACT_CODE = /^[A-Z0-9]{3}-[A-Z]{3}-[0-9]{3}-[A-Z]{2}$/;
export const CLIENT_HUB_LEGACY_CODE = /^TMC-[A-Za-z0-9_-]{32}$/;
/** Only the new shape is case-insensitive. Legacy secrets retain every original byte. */
export function normalizeClientHubCode(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9]{3}-[A-Za-z]{3}-[0-9]{3}-[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

function positiveSequence(value: unknown): number { assertClientHubVersion(value); return value; }
function senderRole(value: unknown): "owner" | "client" {
  if (value !== "owner" && value !== "client") throw new ClientHubDataError("The sender could not be verified.");
  return value;
}
export function decodeHubSupportReply(value: unknown, documentId?: string, project?: ClientHubProject): HubSupportReply {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project);
  return { ...identity, ...(raw.attachmentIds === undefined ? {} : { attachmentIds: supportIds(raw.attachmentIds) }), replyId: recordId(raw.replyId, documentId), requestId: recordId(raw.requestId), senderRole: senderRole(raw.senderRole), body: string(raw.body, "reply", 4000), createdAt: iso(raw.createdAt) };
}
export function decodeHubNotification(value: unknown, documentId?: string, project?: ClientHubProject): HubNotification {
  const raw = clientHubObject(value), identity = workspaceIdentity(raw, project), recipientRole = senderRole(raw.recipientRole);
  if (!["chat", "photos", "requests"].includes(raw.channel as string)) throw new ClientHubDataError("The notification channel could not be verified.");
  const channel = raw.channel as HubNotificationChannel, requestId = raw.requestId === undefined ? undefined : recordId(raw.requestId), notificationId = `${identity.projectId}-${recipientRole}-${channel}${requestId ? `-${requestId}` : ""}`;
  if ((channel === "requests") !== Boolean(requestId)) throw new ClientHubDataError("The notification thread could not be verified.");
  if (raw.notificationId !== notificationId || documentId !== undefined && documentId !== notificationId || !Number.isSafeInteger(raw.version) || (raw.version as number) < 1 || !Number.isSafeInteger(raw.readVersion) || (raw.readVersion as number) < 0 || (raw.readVersion as number) > (raw.version as number)) throw new ClientHubDataError("The notification state could not be verified.");
  for (const field of ["acknowledgedVersion", "dismissedVersion"] as const) {
    if (raw[field] !== undefined && (!Number.isSafeInteger(raw[field]) || (raw[field] as number) < 0 || (raw[field] as number) > (raw.version as number))) throw new ClientHubDataError("The notification acknowledgment could not be verified.");
  }
  const readAt = raw.readAt === null ? null : iso(raw.readAt), throughCreatedAt = raw.throughCreatedAt === null ? null : iso(raw.throughCreatedAt), throughItemId = raw.throughItemId === null ? null : recordId(raw.throughItemId);
  if (raw.readVersion === 0 ? readAt !== null || throughCreatedAt !== null || throughItemId !== null : readAt === null || throughCreatedAt === null || throughItemId === null) throw new ClientHubDataError("The read receipt state could not be verified.");
  return { ...identity, notificationId, ...(requestId ? { requestId } : {}), recipientRole, channel, latestItemId: recordId(raw.latestItemId), latestAt: iso(raw.latestAt), version: raw.version as number, readVersion: raw.readVersion as number, ...(raw.acknowledgedVersion !== undefined ? { acknowledgedVersion: raw.acknowledgedVersion as number } : {}), ...(raw.dismissedVersion !== undefined ? { dismissedVersion: raw.dismissedVersion as number } : {}), readAt, throughItemId, throughCreatedAt };
}

/** Bell acknowledgment/dismissal never changes actual conversation read receipts. */
export function hubNotificationUnreadCount(item: HubNotification): number {
  return Math.max(0, item.version - Math.max(item.readVersion, item.acknowledgedVersion ?? 0, item.dismissedVersion ?? 0));
}

export function decodeHubCompletionEpisode(value: unknown): HubCompletionEpisode {
  const raw = clientHubObject(value);
  if (!Number.isSafeInteger(raw.episode) || (raw.episode as number) < 0 || !Number.isSafeInteger(raw.expiredThroughEpisode) || (raw.expiredThroughEpisode as number) < -1 || (raw.expiredThroughEpisode as number) >= (raw.episode as number) || !["paused", "active"].includes(raw.state as string)) throw new ClientHubDataError("The attachment retention state is invalid.");
  const completedAt = raw.completedAt === null ? null : iso(raw.completedAt), expiresAt = raw.expiresAt === null ? null : iso(raw.expiresAt);
  if (raw.state === "active" ? completedAt === null || expiresAt === null || Date.parse(expiresAt) - Date.parse(completedAt) !== 60 * 24 * 60 * 60 * 1000 : completedAt !== null || expiresAt !== null) throw new ClientHubDataError("The attachment retention dates are invalid.");
  return { episode: raw.episode as number, state: raw.state as "paused" | "active", completedAt, expiresAt, expiredThroughEpisode: raw.expiredThroughEpisode as number };
}
