export const REQUEST_STATUSES = ["received", "approved", "denied", "waitlisted"] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];
export type RequestDecision = Exclude<RequestStatus, "received">;
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = { received: "Received", approved: "Approved", denied: "Denied", waitlisted: "Waitlisted" };
export type RequestSummary = { id: string; name: string; email: string; description: string; createdAt: string | null; status: RequestStatus | null; version: number | null; referenceCount?: number; referencePurge?: { status: "pending" | "failed" | "complete" }; linked?: boolean; trashedAt?: string | null };
export function timestampText(value: unknown): string | null {
  let date: Date | undefined;
  if (typeof value === "string") date = new Date(value);
  else if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") { try { date = value.toDate(); } catch { /* Missing is not a timestamp. */ } }
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function requestState(value: Record<string, unknown>): { status: RequestStatus | null; version: number | null } {
  return { status: value.status === undefined ? "received" : REQUEST_STATUSES.includes(value.status as RequestStatus) ? value.status as RequestStatus : null, version: value.version === undefined ? 0 : Number.isSafeInteger(value.version) && Number(value.version) >= 0 ? Number(value.version) : null };
}
export function requestSummary(id: string, value: Record<string, unknown>): RequestSummary {
  const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  return { id, trashedAt: timestampText(value.trashedAt), name: text(value.name, 120) || text(value.customerName, 120) || "Unnamed request", email: text(value.email, 254), description: text(value.description, 2000) || text(value.message, 2000), createdAt: timestampText(value.createdAt), referenceCount: Array.isArray(value.references) ? value.references.length : 0, ...(value.referencePurge && typeof value.referencePurge === "object" && "status" in value.referencePurge && ["pending", "failed", "complete"].includes(String(value.referencePurge.status)) ? { referencePurge: { status: value.referencePurge.status as "pending" | "failed" | "complete" } } : {}), linked: !!value.hubLink, ...requestState(value) };
}
export function verifyRequestDecision(current: Record<string, unknown>, expected: Pick<RequestSummary, "status" | "version">, nextStatus: RequestDecision) {
  if (current.referencePurge) throw new Error("This denied request has a reference-cleanup record. Its decision is locked to protect deleted references.");
  const state = requestState(current);
  if (state.status === null || state.version === null || !Number.isSafeInteger(state.version + 1)) throw new Error("This request has an unsupported status or version. Nothing was changed; ask for help before updating it.");
  if (state.status !== expected.status || state.version !== expected.version) throw new Error("This request changed in another tab or device. Refresh the inbox and review its current status before deciding again.");
  if (!["approved", "denied", "waitlisted"].includes(nextStatus)) throw new Error("Choose Approve, Deny, or Waitlist.");
  if (state.status === nextStatus) throw new Error("This request already has that status. Refresh the inbox to see the current decision.");
  return { fromStatus: state.status, toStatus: nextStatus, version: state.version + 1 };
}
