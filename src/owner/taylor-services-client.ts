import { STUDIO_OWNER_UID, isStudioOwnerUid } from "./studio-owner-identity";
import { assertHubWindowSession } from "@/client-hub/window-session";
import { getOwnerFirebaseClient, readOwnerFirebaseConfig, verifyOwnerSession } from "./firebase-client";

/** Private tools reuse the existing browser-session-only Firebase connection. */
export async function taylorOwnerSession() {
  const config = readOwnerFirebaseConfig();
  if (config.status !== "ready" || config.options.projectId !== "taylor-made-creations" || config.ownerUid !== STUDIO_OWNER_UID) throw new Error("The private owner connection is not configured. Ask Salix to check the Firebase setup.");
  const client = getOwnerFirebaseClient(config);
  const user = client.auth.currentUser;
  const actorUid = user?.uid;
  if (!user || !isStudioOwnerUid(actorUid)) throw new Error("Sign in with an authorized studio owner account to continue.");
  await verifyOwnerSession(client, user);
  const token = await user.getIdToken();
  const assertCurrent = () => {
    assertHubWindowSession("owner", user.uid);
    if (client.auth.currentUser !== user || client.auth.currentUser?.uid !== actorUid) throw new Error("Your owner session changed. Sign in again to continue.");
  };
  assertCurrent();
  return { ...client, token, assertCurrent };
}

export function serviceReadError(error: unknown, feature: string): string {
  if (error instanceof ServiceResponseError) return error.message;
  const code = error && typeof error === "object" && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
  if (["permission-denied", "unauthenticated"].includes(code)) return `${feature} is not connected for this account yet. Salix needs to check owner access and the deployed Firestore rules.`;
  if (error instanceof Error && !code && !["TypeError", "AbortError", "TimeoutError"].includes(error.name)) return error.message;
  return `${feature} could not be checked. Check your connection and try again.`;
}

export class ServiceResponseError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = "ServiceResponseError"; }
}

export async function responseObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("The service returned an unreadable response. Please try again.");
  const result = body as Record<string, unknown>;
  if (!response.ok || result.ok !== true) throw new ServiceResponseError(typeof result.message === "string" ? result.message : "The service did not confirm this request. Please try again.", response.status, typeof result.code === "string" ? result.code : undefined);
  return result;
}
