"use client";
import { collection, doc, getDocsFromServer, where, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
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

/** One authoritative snapshot captures immutable unread IDs before any write.
 * A size refusal is explicit; never partially clears a truncated result. */
export async function captureOwnerIntakeNotifications(signal?:AbortSignal):Promise<OwnerIntakeNotification[]> {
  const session=await taylorOwnerSession(),current=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');session.assertCurrent();};
  current();const snapshot=await getDocsFromServer(query(collection(getFirestore(session.auth.app),'ownerIntakeNotifications'),where('readAt','==',null),limit(5001)));current();
  if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)throw Error('Request alerts could not be verified from the server.');
  if(snapshot.docs.length>5000)throw Object.assign(Error('Too many request alerts for one safe capture.'),{code:'clear-all-too-large'});
  const seen=new Set<string>();return snapshot.docs.map(row=>{if(seen.has(row.id))throw Error('Duplicate request alerts.');seen.add(row.id);const item=decode(row.id,row.data());if(item.readAt)throw Error('The unread request alert snapshot changed.');return item;});
}
