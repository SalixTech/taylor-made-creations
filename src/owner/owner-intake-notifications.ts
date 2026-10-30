"use client";
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { taylorOwnerSession } from "./taylor-services-client";
import { timestampText } from "./commission-requests-model";
export type OwnerIntakeNotification = { notificationId: string; kind: "commission-request" | "code-request"; requestId: string; createdAt: string; readAt: string | null };
function decode(id: string, value: Record<string, unknown>): OwnerIntakeNotification {
  const createdAt = timestampText(value.createdAt), readAt = timestampText(value.readAt);
  if (value.notificationId !== id || id !== `${value.kind === "commission-request" ? "commission" : "recovery"}-${value.requestId}` || !["commission-request", "code-request"].includes(String(value.kind)) || typeof value.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(value.requestId) || !createdAt || value.readAt !== null && !readAt) throw new Error("An intake alert could not be verified.");
  return { notificationId: id, kind: value.kind as OwnerIntakeNotification["kind"], requestId: value.requestId, createdAt, readAt };
}
/** Owner-only feed. Fixed labels contain no client names, email addresses or secrets. */
export function watchOwnerIntakeNotifications(onValue: (items: OwnerIntakeNotification[]) => void, onError: (error: unknown) => void): () => void {
  let stopped = false, unsubscribe: (() => void) | undefined;
  void taylorOwnerSession().then(session => {
    if (stopped) return;
    unsubscribe = onSnapshot(query(collection(getFirestore(session.auth.app), "ownerIntakeNotifications"), orderBy("createdAt", "desc"), limit(100)), snapshot => {
      if (stopped || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      try { session.assertCurrent(); onValue(snapshot.docs.map(entry => decode(entry.id, entry.data()))); }
      catch (error) { unsubscribe?.(); if (!stopped) onError(error); }
    }, error => { if (!stopped) onError(error); });
  }).catch(error => { if (!stopped) onError(error); });
  return () => { stopped = true; unsubscribe?.(); };
}
export async function markOwnerIntakeNotificationRead(item: OwnerIntakeNotification) {
  const valid = decode(item.notificationId, item), session = await taylorOwnerSession();
  session.assertCurrent();
  await updateDoc(doc(getFirestore(session.auth.app), "ownerIntakeNotifications", valid.notificationId), { readAt: serverTimestamp() });
  session.assertCurrent();
}
