import type { HubSupportReply, HubSupportRequest } from "./model";
export function mergeSupportRequests(older: HubSupportRequest[], current: HubSupportRequest[]) {
  const records = new Map(older.map(item => [item.requestId, item]));
  for (const item of current) { const previous = records.get(item.requestId); if (!previous || item.version >= previous.version) records.set(item.requestId, item); }
  return [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.requestId.localeCompare(a.requestId));
}
export function mergeSupportReplies(older: HubSupportReply[], current: HubSupportReply[]) {
  return [...new Map([...older, ...current].map(item => [item.replyId, item])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.replyId.localeCompare(b.replyId));
}
export type SupportReplyDraft = { body: string; attachmentIds?: string[]; attempt: { operationId: string; body: string; attachmentIds?: string[]; state: "pending" | "failed" } | null };
export const emptySupportReplyDraft = (): SupportReplyDraft => ({ body: "", attempt: null });
