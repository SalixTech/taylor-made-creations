import { collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore/lite";
import { taylorOwnerSession } from "./taylor-services-client";
import { REQUEST_STATUSES, timestampText, verifyRequestDecision, type RequestDecision, type RequestStatus, type RequestSummary } from "./commission-requests-model";

/** Updates only the decision, with a version check and immutable audit record.
 * This never sends a reply, creates a contract, charges, or changes site content. */
export async function decideCommissionRequest(request: RequestSummary, status: RequestDecision): Promise<{ status: RequestStatus; version: number }> {
  const session = await taylorOwnerSession();
  const actorUid = session.auth.currentUser?.uid;
  if (!actorUid) throw new Error("Sign in with Taylor’s owner account to continue.");
  return runTransaction(session.db, async transaction => {
    session.assertCurrent();
    const reference = doc(session.db, "commissionRequests", request.id);
    const snapshot = await transaction.get(reference);
    session.assertCurrent();
    if (!snapshot.exists()) throw new Error("This request no longer exists. Refresh the inbox; nothing was changed.");
    const decision = verifyRequestDecision(snapshot.data(), request, status);
    const history = doc(reference, "history", String(decision.version));
    transaction.update(reference, { status, version: decision.version, updatedAt: serverTimestamp(), updatedBy: actorUid });
    transaction.set(history, { ...decision, actorUid, createdAt: serverTimestamp() });
    return { status, version: decision.version };
  }).then(result => { session.assertCurrent(); return result; });
}
export type RequestHistory = { id: string; fromStatus: RequestStatus; toStatus: RequestStatus; version: number; actorUid: string; createdAt: string | null };
export async function readCommissionHistory(id: string): Promise<RequestHistory[]> {
  const session = await taylorOwnerSession();
  const snapshot = await getDocs(query(collection(session.db, "commissionRequests", id, "history"), orderBy("version", "desc"), limit(20)));
  session.assertCurrent();
  return snapshot.docs.map(document => {
    const value = document.data();
    if (!REQUEST_STATUSES.includes(value.fromStatus) || !REQUEST_STATUSES.includes(value.toStatus) || !Number.isSafeInteger(value.version) || typeof value.actorUid !== "string") throw new Error("A decision history entry could not be read safely. It has not been changed.");
    return { id: document.id, fromStatus: value.fromStatus, toStatus: value.toStatus, version: value.version, actorUid: value.actorUid, createdAt: timestampText(value.createdAt) };
  });
}
