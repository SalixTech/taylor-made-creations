import { isStudioOwnerUid } from "@/owner/studio-owner-identity";
import "server-only";
import { TaylorApiError } from "./taylor-auth";

// Confirmed by the user. Never accept a recipient from a request or browser setting.
export const TAYLOR_HELP_RECIPIENT: string | null = "tobias.wolf@salixtechnologies.com";
const SUBJECT = "Taylor Needs Help";
const TEXT = "Taylor Needs Help";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HelpEnvironment = { apiKey?: string; from?: string };
export type HelpConfiguration = { configured: boolean; reason: "ready" | "recipient-pending" | "sender-missing" | "credentials-missing"; delivery: "not-verified" };
function environment(): HelpEnvironment { return { apiKey: process.env.RESEND_API_KEY, from: process.env.TMC_HELP_FROM }; }

export function helpConfiguration(env = environment()): HelpConfiguration {
  const reason = !TAYLOR_HELP_RECIPIENT ? "recipient-pending"
    : !env.apiKey?.trim() || !/^re_[A-Za-z0-9_-]+$/.test(env.apiKey) || /replace|placeholder|example/i.test(env.apiKey) ? "credentials-missing"
    : !env.from || env.from.length > 200 || /[\r\n]/.test(env.from) || !/^(?:[^<>\r\n]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env.from) ? "sender-missing" : "ready";
  return { configured: reason === "ready", reason, delivery: "not-verified" };
}

export async function readHelpRequestId(request: Request): Promise<string> {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new TaylorApiError(403, "Open Taylor’s Space on this website to ask for help.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new TaylorApiError(415, "This help request was not understood. Reload the page and try again.");
  if (Number(request.headers.get("content-length") ?? 0) > 256) throw new TaylorApiError(413, "The help request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new TaylorApiError(400, "A help request identifier is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256) { await reader.cancel(); throw new TaylorApiError(413, "The help request is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !("requestId" in data) || typeof data.requestId !== "string" || !UUID.test(data.requestId)) throw new Error("Invalid payload");
    return data.requestId;
  } catch (error) {
    if (error instanceof TaylorApiError) throw error;
    throw new TaylorApiError(400, "This help request was not understood. Reload the page and try again.");
  } finally { reader.releaseLock(); }
}

type Accepted = { ok: true; status: "accepted"; message: string };
const accepted: Accepted = { ok: true, status: "accepted", message: "Your help email was accepted for sending. Inbox delivery is not yet confirmed." };
const recent = new Map<string, { acceptedAt: number; result: Accepted }>();
const pending = new Map<string, Promise<Accepted>>();
let latestAcceptedAt = 0;
let latestAttemptAt = 0;

/** One fixed-purpose email, only after the route has cryptographically verified Taylor. */
export async function sendTaylorHelp(uid: string, requestId: string): Promise<Accepted> {
  if (!isStudioOwnerUid(uid)) throw new TaylorApiError(403, "This account does not have owner access.");
  if (!UUID.test(requestId)) throw new TaylorApiError(400, "A valid help request identifier is required.");
  const env = environment();
  if (!helpConfiguration(env).configured) throw new TaylorApiError(503, "Help email is not connected yet. No email has been sent. Salix needs to finish the email setup.");
  const now = Date.now();
  for (const [key, value] of recent) if (now - value.acceptedAt > 86_400_000) recent.delete(key);
  const receiptKey = `${uid}:${requestId}`;
  const previous = recent.get(receiptKey);
  if (previous) return previous.result;
  const existing = pending.get(receiptKey);
  if (existing) return existing;
  if (now - latestAcceptedAt < 60_000) throw new TaylorApiError(429, "A help email was just accepted. Please wait one minute before sending another.", Math.ceil((60_000 - (now - latestAcceptedAt)) / 1000));
  if (pending.size || now - latestAttemptAt < 5_000) throw new TaylorApiError(429, "A help request is already being checked. Please wait a few seconds and try again.", 5);
  latestAttemptAt = now;
  const operation = (async (): Promise<Accepted> => {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { "Authorization": `Bearer ${env.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `tmc-help/${uid}/${requestId}` },
        body: JSON.stringify({ from: env.from, to: [TAYLOR_HELP_RECIPIENT], subject: SUBJECT, text: TEXT }),
      });
    } catch { throw new TaylorApiError(502, "We could not confirm whether the email was accepted. Try again here to safely retry the same help request."); }
    if (!response.ok) throw new TaylorApiError(502, "The email service did not confirm this help request. Please try again. If it keeps failing, the email setup needs attention.");
    let result: unknown;
    try { result = await response.json(); } catch { /* An invalid receipt is not success. */ }
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id.trim()) throw new TaylorApiError(502, "We could not confirm whether the email was accepted. Try again here to safely retry the same help request.");
    latestAcceptedAt = Date.now();
    recent.set(receiptKey, { acceptedAt: latestAcceptedAt, result: accepted });
    return accepted;
  })();
  pending.set(receiptKey, operation);
  try { return await operation; } finally { pending.delete(receiptKey); }
}
