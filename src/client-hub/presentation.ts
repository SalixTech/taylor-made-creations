import type { ClientHubProject, ClientHubSession, ClientHubInformationTag } from "./model";

export const CLIENT_HUB_CONTACT_HREF = "mailto:taylormadecreations.dog@gmail.com";

export const CLIENT_PROJECT_STATUS_LABELS: Record<ClientHubProject["status"], string> = {
  queued: "Not Started",
  "in-progress": "In Progress",
  "on-hold": "On hold for Materials",
  delayed: "Delayed",
  completed: "Completed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** A saved percentage is an owner's update, never inferred from a project status. */
export function reportedProgress(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function sameClientSession(first: ClientHubSession | null, second: ClientHubSession | null): boolean {
  return first === second || !!first && !!second && first.uid === second.uid && first.clientId === second.clientId && first.authVersion === second.authVersion;
}

export function clientUpdateDate(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Even an owner-saved link is never allowed to execute a script or change origin credentials. */
export function safeTrackingUrl(value: string | null): string | null {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Labels are owner-entered organizational notes, not PayPal verification. */
export const CLIENT_INFORMATION_TAG_LABELS: Record<ClientHubInformationTag, string> = { "paid-100": "100% paid", "paid-partial": "Partially paid", "dtd-needed": "DTD needed", "dtd-received": "DTD Received" };

/** Photos use Eastern Maker Time, including the correct seasonal EST/EDT label. */
export function makerTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}
