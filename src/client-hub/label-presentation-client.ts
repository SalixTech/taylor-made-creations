"use client";
import { onIdTokenChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { hubCallableOwnerSession } from "./callable-owner-session";
import { verifiedClientHubConnection, CLIENT_HUB_FUNCTIONS_REGION } from "./client";
import { assertClientHubProjectId, clientHubObject, type ClientHubProject } from "./model";
import { decodeLabelPresentation, emptyLabelPresentation, isBuiltinLabel, type LabelDefinition, type SaveLabelPresentationInput } from "./label-presentation";
export async function getOwnerLabelPresentation() {
 const session = await hubCallableOwnerSession(); session.assertCurrent();
 const result = await httpsCallable(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcOwnerGetLabelPresentation")({}); session.assertCurrent();
 return decodeLabelPresentation(clientHubObject(result.data).presentation);
}
/** Explicit candidates only: reading never adds old assigned labels back to the picker. */
export async function getOwnerLabelPresentationContext(projectId: string) {
 assertClientHubProjectId(projectId); const session = await hubCallableOwnerSession(); session.assertCurrent();
 const result = await httpsCallable(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcOwnerGetLabelPresentation")({ projectId }); session.assertCurrent();
 const data = clientHubObject(result.data), presentation = decodeLabelPresentation(data.presentation), candidates = clientHubObject(data.legacyCandidates);
 const candidateBase = emptyLabelPresentation();
 if (Object.keys(candidates).length > 1500) throw new Error("Existing label choices exceeded the supported size.");
 const checkedCandidates = Object.fromEntries(Object.entries(candidates).map(([key, entry]) => {
  const checked = decodeLabelPresentation({ ...candidateBase, entries: { ...candidateBase.entries, [key]: entry }, order: [...candidateBase.order, key] });
  return [key, checked.entries[key]];
 }));
 if (Object.keys(candidates).some(key => Object.hasOwn(presentation.entries, key) || !key.startsWith("custom:"))) throw new Error("Existing label choices could not be verified.");
 return { presentation, legacyCandidates: checkedCandidates as Record<string, LabelDefinition> };
}
export async function saveOwnerLabelPresentation(input: SaveLabelPresentationInput) {
 assertClientHubProjectId(input.operationId);
 if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Refresh labels before saving.");
 decodeLabelPresentation({ schemaVersion: 1, revision: input.expectedRevision, updatedAt: null, entries: input.entries, order: input.order });
 const session = await hubCallableOwnerSession(); session.assertCurrent();
 const result = await httpsCallable(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), "tmcOwnerSaveLabelPresentation")(input); session.assertCurrent();
 const saved = decodeLabelPresentation(clientHubObject(result.data).presentation);
 if (saved.revision <= input.expectedRevision) throw new Error("Refresh labels to confirm the saved change.");
 return saved;
}
export async function getClientLabelPresentation(project: ClientHubProject) {
 assertClientHubProjectId(project.projectId); const session = await verifiedClientHubConnection(undefined, false); session.assertCurrent();
 if (session.session.clientId !== project.clientId) throw new Error("This commission is not part of your active Client Hub session.");
 const result = await httpsCallable(session.functions, "tmcHubGetLabelPresentation")({ projectId: project.projectId }); session.assertCurrent(); const data = clientHubObject(result.data);
 if (data.projectId !== project.projectId || data.clientId !== project.clientId) throw new Error("Label presentation belongs to a different commission.");
 const saved = decodeLabelPresentation(data.presentation), assigned = new Set<string>(project.informationTags ?? []);
 // Reject unexpected catalog data, including a response for a newly changed assignment: refresh the project first.
 if (Object.keys(saved.entries).some(key => !isBuiltinLabel(key) && !assigned.has(key))) throw new Error("Commission labels changed. Refresh this commission before loading its labels.");
 return saved;
}

/** Clears the caller's cached labels immediately on observed auth/epoch/scope loss. */
export async function watchLabelPresentationSession(owner: boolean, project: ClientHubProject | undefined, onInvalid: () => void): Promise<{ assertCurrent: () => void; close: () => void; scopeKey: string }> {
 if (!owner && !project) throw new Error("Choose a commission first.");
 const clientSession = owner ? null : await verifiedClientHubConnection();
 const session = clientSession ?? await hubCallableOwnerSession();
 let active = true; const stops: (() => void)[] = [];
 const close = () => { active = false; stops.splice(0).forEach(stop => stop()); };
 const assertCurrent = () => { if (!active) throw new Error("The label session changed."); session.assertCurrent(); };
 const invalidate = () => { if (!active) return; close(); onInvalid(); };
 const track = (stop: () => void) => { if (active) stops.push(stop); else stop(); };
 assertCurrent(); const uid = session.auth.currentUser?.uid; if (!uid) throw new Error("Sign in again before loading labels.");
 track(onIdTokenChanged(session.auth, () => { try { assertCurrent(); } catch { invalidate(); } }, invalidate));
 let scopeKey = `owner:${uid}`;
 if (clientSession && project) {
  if (clientSession.session.clientId !== project.clientId) { close(); throw new Error("This commission is not part of the active session."); }
  const clientId = clientSession.session.clientId, version = clientSession.session.authVersion;
  scopeKey = `client:${uid}:${clientId}:${version}:${project.projectId}`;
  track(onSnapshot(doc(clientSession.db, "hubClients", clientId), { includeMetadataChanges: true }, snapshot => {
   if (!active || snapshot.metadata.fromCache) return;
   try { assertCurrent(); const value = snapshot.exists() ? snapshot.data() : null; if (!value || value.clientId !== clientId || value.status !== "active" || value.authVersion !== version) invalidate(); } catch { invalidate(); }
  }, invalidate));
  track(onSnapshot(doc(clientSession.db, "hubProjects", project.projectId), { includeMetadataChanges: true }, snapshot => {
   if (!active || snapshot.metadata.fromCache) return;
   try { assertCurrent(); const value = snapshot.exists() ? snapshot.data() : null; if (!value || value.projectId !== project.projectId || value.clientId !== clientId) invalidate(); } catch { invalidate(); }
  }, invalidate));
 }
 assertCurrent(); return { assertCurrent, close, scopeKey };
}
