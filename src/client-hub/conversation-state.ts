import { ClientHubDataError, assertClientHubId, assertClientHubProjectId, clientHubObject, type ClientHubProject, type HubNotification } from "./model";

export type HubConversationVisibility = {
  visibilityId: string; viewerUid: string; viewerRole: "owner" | "client"; clientId: string; projectId: string;
  channel: "chat" | "requests"; requestId?: string; version: number; hidden: boolean;
  hiddenAt: string | null; restoredAt: string | null; capturedChatVersions?: { owner: number; client: number }; capturedRequestVersion?: number;
};
function sequence(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ClientHubDataError("Invalid conversation version. Refresh before continuing."); return value as number; }
function date(value: unknown): string | null { if (value === null) return null; if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ClientHubDataError("Invalid conversation date."); return value; }
export function decodeHubConversationVisibility(value: unknown, project: Pick<ClientHubProject, "clientId" | "projectId">, viewerUid: string, owner: boolean, documentId?: string): HubConversationVisibility {
  const raw = clientHubObject(value), role = owner ? "owner" : "client";
  if (raw.clientId !== project.clientId || raw.projectId !== project.projectId || raw.viewerUid !== viewerUid || raw.viewerRole !== role || !["chat", "requests"].includes(String(raw.channel)) || typeof raw.hidden !== "boolean") throw new ClientHubDataError("This conversation history does not belong to your active workspace.");
  const channel = raw.channel as HubConversationVisibility["channel"];
  if (channel === "requests") assertClientHubProjectId(raw.requestId); else if (raw.requestId !== undefined) throw new ClientHubDataError("Invalid conversation reference.");
  const requestId = channel === "requests" ? raw.requestId as string : undefined;
  const visibilityId = `${project.projectId}-${role}-${channel}${requestId ? `-${requestId}` : ""}`;
  if (raw.visibilityId !== visibilityId || documentId !== undefined && documentId !== visibilityId) throw new ClientHubDataError("Invalid conversation history identity.");
  const captured = raw.capturedChatVersions === undefined ? undefined : clientHubObject(raw.capturedChatVersions);
  return { visibilityId, clientId: project.clientId, projectId: project.projectId, viewerUid, viewerRole: role, channel, ...(requestId ? { requestId } : {}), version: sequence(raw.version), hidden: raw.hidden, hiddenAt: date(raw.hiddenAt), restoredAt: date(raw.restoredAt), ...(captured ? { capturedChatVersions: { owner: sequence(captured.owner), client: sequence(captured.client) } } : {}), ...(raw.capturedRequestVersion !== undefined ? { capturedRequestVersion: sequence(raw.capturedRequestVersion) } : {}) };
}
export function chatActivityVersions(notifications: HubNotification[]): { owner: number; client: number } {
  return { owner: Math.max(0, ...notifications.filter(item => item.channel === "chat" && item.recipientRole === "owner").map(item => item.version)), client: Math.max(0, ...notifications.filter(item => item.channel === "chat" && item.recipientRole === "client").map(item => item.version)) };
}
/** A stale hide never hides newer arriving activity. Neither receipts nor records change. */
export function conversationHidden(record: HubConversationVisibility | undefined, current: number | { owner: number; client: number }): boolean {
  if (!record?.hidden || record.channel === "chat") return false;
  return typeof current === "number" ? record.channel === "requests" && current <= (record.capturedRequestVersion ?? -1) : false;
}
export type HubUpdateRequestCooldown = { clientId: string; settingsRevision: number; revision: number; overrideDays: number | null; effectiveDays: number; source: "global" | "client"; lastRequestedAt: string | null; nextEligibleAt: string | null; eligible: boolean; serverNow: string; resetAt: string | null };
export function decodeHubUpdateRequestCooldown(value: unknown, clientId: string): HubUpdateRequestCooldown {
  const raw = clientHubObject(value); assertClientHubId(raw.clientId);
  const days = (value: unknown) => { const result = sequence(value); if (result > 365) throw new ClientHubDataError("Invalid update request interval."); return result; };
  if (raw.clientId !== clientId || !["global", "client"].includes(String(raw.source)) || typeof raw.eligible !== "boolean") throw new ClientHubDataError("This update request interval could not be verified.");
  const serverNow = date(raw.serverNow); if (!serverNow) throw new ClientHubDataError("The server time could not be verified.");
  return { clientId, settingsRevision: sequence(raw.settingsRevision), revision: sequence(raw.revision), overrideDays: raw.overrideDays === null ? null : days(raw.overrideDays), effectiveDays: days(raw.effectiveDays), source: raw.source as "global" | "client", lastRequestedAt: date(raw.lastRequestedAt), nextEligibleAt: date(raw.nextEligibleAt), eligible: raw.eligible, serverNow, resetAt: date(raw.resetAt) };
}
export function cooldownRemaining(cooldown: HubUpdateRequestCooldown, elapsedMs: number): number {
  return cooldown.nextEligibleAt ? Math.max(0, Date.parse(cooldown.nextEligibleAt) - Date.parse(cooldown.serverNow) - Math.max(0, elapsedMs)) : 0;
}
export function cooldownText(cooldown: HubUpdateRequestCooldown | null, elapsedMs: number): string {
  if (!cooldown) return "Checking update request availability…";
  if (!cooldown.effectiveDays) return "Update request cooldown is off. General request limits still apply.";
  const seconds = Math.ceil(cooldownRemaining(cooldown, elapsedMs) / 1000);
  if (!seconds) return `Ready for your next update request · ${cooldown.effectiveDays}-day interval.`;
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `Next update request in ${days ? `${days}d ` : ""}${hours}h ${minutes}m ${seconds % 60}s.`;
}
