"use client";

import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { taylorOwnerSession } from "@/owner/taylor-services-client";
import { hubCallableOwnerSession } from "./callable-owner-session";
import { CLIENT_HUB_FUNCTIONS_REGION, ClientHubError, verifiedClientHubConnection } from "./client";
import { clientHubObject, ClientHubDataError, decodeClientHubProject, decodeHubNotification, type HubNotification } from "./model";

export type HubNotificationAction = "acknowledge" | "dismiss";
async function connection(owner: boolean, signal?: AbortSignal, read = false) {
  if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
  if (!owner) return verifiedClientHubConnection(signal, read);
  const session = await (read ? taylorOwnerSession() : hubCallableOwnerSession());
  return { ...session, db: getFirestore(session.auth.app), functions: getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), session: undefined, assertCurrent() {
    if (signal?.aborted) throw new DOMException("Request cancelled.", "AbortError");
    session.assertCurrent();
  } };
}
function capturedItems(owner: boolean, items: HubNotification[]) {
  const seen = new Set<string>();
  return items.map(value => {
    const item = decodeHubNotification(value);
    if (item.recipientRole !== (owner ? "owner" : "client") || seen.has(item.notificationId)) throw new ClientHubDataError("Choose each of your notifications only once.");
    seen.add(item.notificationId);
    return item;
  });
}
function assertScope(items: HubNotification[], clientId?: string) {
  if (clientId && items.some(item => item.clientId !== clientId)) throw new ClientHubError("session-expired", "This notification is not part of your active Client Hub session.");
}

/** Captures versions once, chunks the entire set, and never invokes conversation-read semantics. */
export async function changeHubNotifications(owner: boolean, action: HubNotificationAction, items: HubNotification[], signal?: AbortSignal): Promise<HubNotification[]> {
  if (action !== "acknowledge" && action !== "dismiss") throw new ClientHubDataError("Choose a valid notification action.");
  const captured = capturedItems(owner, items);
  if (!captured.length) return [];
  const session = await connection(owner, signal), results: HubNotification[] = [];
  assertScope(captured, session.session?.clientId);
  for (let start = 0; start < captured.length; start += 100) {
    session.assertCurrent();
    const chunk = captured.slice(start, start + 100);
    const response = await httpsCallable<unknown, unknown>(session.functions, "tmcHubMarkConversationRead")({
      notificationAction: action,
      notifications: chunk.map(item => ({ projectId: item.projectId, channel: item.channel, ...(item.requestId ? { requestId: item.requestId } : {}), version: item.version })),
    });
    session.assertCurrent();
    const raw = clientHubObject(response.data);
    if (!Array.isArray(raw.notifications) || raw.notifications.length !== chunk.length) throw new ClientHubDataError("The notification action could not be confirmed.");
    const updated = raw.notifications.map((value, index) => {
      const before = chunk[index], item = decodeHubNotification(value, before.notificationId);
      const cursor = action === "dismiss" ? item.dismissedVersion : item.acknowledgedVersion;
      if (item.clientId !== before.clientId || item.version < before.version || (cursor ?? 0) < before.version) throw new ClientHubDataError("The notification action could not be confirmed.");
      return item;
    });
    results.push(...updated);
  }
  return results;
}

/** Read only authorized shared commission titles; never client contacts or message previews. */
export async function loadHubNotificationLabels(owner: boolean, items: HubNotification[], signal?: AbortSignal): Promise<Record<string, string>> {
  const captured = capturedItems(owner, items);
  if (!captured.length) return {};
  const session = await connection(owner, signal, true);
  assertScope(captured, session.session?.clientId);
  const projects = [...new Map(captured.map(item => [item.projectId, item])).values()], labels: Record<string, string> = {};
  // Bound concurrent server reads. Nothing is cached outside this caller's account lifetime.
  for (let start = 0; start < projects.length; start += 4) {
    session.assertCurrent();
    await Promise.all(projects.slice(start, start + 4).map(async item => {
      const snapshot = await getDocFromServer(doc(session.db, "hubProjects", item.projectId));
      session.assertCurrent();
      if (!snapshot.exists()) return;
      const project = decodeClientHubProject(snapshot.data(), item.projectId);
      if (project.clientId !== item.clientId) throw new ClientHubDataError("The notification commission could not be verified.");
      labels[item.projectId] = project.title;
    }));
  }
  session.assertCurrent();
  return labels;
}
