"use client";
import { onIdTokenChanged as onOwnerTokenChanged } from "firebase/auth";
import { collection as liveCollection, doc as liveDoc, getFirestore as getLiveFirestore, onSnapshot as onLiveSnapshot, query as liveQuery, where as liveWhere } from "firebase/firestore";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore/lite";
import { getFunctions, httpsCallable } from "firebase/functions";
import { hubCallableOwnerSession } from "@/client-hub/callable-owner-session";
import { taylorOwnerSession } from "./taylor-services-client";
import { CLIENT_HUB_FUNCTIONS_REGION, clientHubErrorMessage as publicClientHubErrorMessage } from "@/client-hub/client";
import {
  validateProjectLabelOrder, validateLocalLabelDefinitions, validateHubMilestones, type HubMilestone, ClientHubDataError, assertClientHubId, assertClientHubProjectId, assertClientHubVersion, clientHubObject, decodeClientHubClient, decodeClientHubProject,
  isClientHubCode, validateClientHubInformationTags, CLIENT_HUB_PROJECT_STATUSES, safeClientHubTrackingUrl, safeClientHubTrelloUrl,
  type ClientHubClient, type ClientHubProject, type ClientHubDashboard, type ClientHubCreateClientInput, type ClientHubCreateClientResult,
  type ClientHubCreateProjectInput, type ClientHubUpdateProjectInput, type ClientHubUpdateClientProfileInput, type ClientHubResetCodeResult, type ClientHubStatus,
} from "@/client-hub/model";
/** Owner-facing diagnostics must not tell Taylor to enter a client's code. */
export function clientHubErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["permission-denied", "unauthenticated", "firestore/permission-denied", "firestore/unauthenticated", "functions/permission-denied", "functions/unauthenticated", "auth/user-token-expired", "auth/invalid-user-token", "denied", "expired"].includes(code)) return "Client Hub owner access could not be verified. Sign in with Taylor’s owner account; if this continues, check the deployed Client Hub rules and functions.";
  if (["functions/not-found", "functions/unimplemented"].includes(code)) return "Client Hub functions are not connected yet. The Client Hub backend must be deployed before clients can be managed.";
  if (error instanceof Error && error.message === "The private owner connection is not configured. Ask Salix to check the Firebase setup.") return "The owner Firebase connection is not configured. Check the deployment settings before managing clients.";
  if (error instanceof Error && ["Sign in with Taylor’s owner account to continue.", "Your owner session changed. Sign in again to continue."].includes(error.message)) return "Your owner session could not be verified. Sign in again and refresh the client record before retrying; a pending change may already have completed.";
  return publicClientHubErrorMessage(error);
}
export type ClientHubDetail = ClientHubDashboard & { email?: string };

function requiredText(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ClientHubDataError(`Check the ${label} (${optional ? "up to" : "1–"}${max} characters).`);
  return value.trim();
}
function requestReference(value: string | undefined): { requestId?: string } {
  if (value === undefined || value === "") return {};
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new ClientHubDataError("The linked request reference is not valid.");
  return { requestId: value };
}
function operationId(value: string): string { assertClientHubProjectId(value); return value; }
async function callOwner(name: string, input: unknown): Promise<Record<string, unknown>> {
  const session = await hubCallableOwnerSession();
  session.assertCurrent();
  const callable = httpsCallable<unknown, unknown>(getFunctions(session.auth.app, CLIENT_HUB_FUNCTIONS_REGION), name);
  const response = await callable(input);
  // A lost owner session after a write is not a confirmed success or a fake rollback.
  session.assertCurrent();
  return clientHubObject(response.data);
}
export async function listClients(): Promise<ClientHubClient[]> {
  const session = await taylorOwnerSession();
  const snapshot = await getDocs(collection(session.db, "hubClients"));
  session.assertCurrent();
  return snapshot.docs.map(document => decodeClientHubClient(document.data(), document.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.clientId.localeCompare(b.clientId));
}
export async function getClientDetail(clientId: string): Promise<ClientHubDetail> {
  assertClientHubId(clientId);
  const session = await taylorOwnerSession();
  const [clientSnapshot, privateSnapshot, projectSnapshot] = await Promise.all([
    getDoc(doc(session.db, "hubClients", clientId)), getDoc(doc(session.db, "hubClientPrivate", clientId)),
    getDocs(query(collection(session.db, "hubProjects"), where("clientId", "==", clientId))),
  ]);
  session.assertCurrent();
  if (!clientSnapshot.exists()) throw new ClientHubDataError("This client no longer exists. Refresh the client list.");
  const client = decodeClientHubClient(clientSnapshot.data(), clientId);
  const projects = projectSnapshot.docs.map(document => decodeClientHubProject(document.data(), document.id));
  if (projects.some(project => project.clientId !== clientId)) throw new ClientHubDataError("A commission was returned for a different client. Refresh before continuing.");
  let email: string | undefined;
  if (privateSnapshot.exists()) {
    const privateRecord = clientHubObject(privateSnapshot.data());
    if (privateRecord.clientId !== clientId || typeof privateRecord.email !== "string" || privateRecord.email.length > 254 || /[\u0000-\u001f\u007f]/.test(privateRecord.email)) throw new ClientHubDataError("The private client contact record could not be read safely.");
    email = privateRecord.email || undefined;
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.projectId.localeCompare(b.projectId));
  return { client, projects, ...(email ? { email } : {}) };
}
function verifySavedLocalLabels(project: ClientHubProject | null, input: { labelOrder?: string[]; localLabelDefinitions?: ClientHubProject["localLabelDefinitions"]; informationTags?: ClientHubProject["informationTags"] }) {
  if (input.labelOrder !== undefined && JSON.stringify(project?.labelOrder) !== JSON.stringify(input.labelOrder)) throw new ClientHubDataError("Commission label order could not be confirmed. Refresh before trying again.");
  if (input.localLabelDefinitions === undefined) return;
  if (!project || JSON.stringify(validateLocalLabelDefinitions(project.localLabelDefinitions)) !== JSON.stringify(validateLocalLabelDefinitions(input.localLabelDefinitions)) || input.informationTags !== undefined && JSON.stringify(validateClientHubInformationTags(project.informationTags)) !== JSON.stringify(validateClientHubInformationTags(input.informationTags))) throw new ClientHubDataError("Commission-only labels could not be confirmed. Refresh before trying again.");
}
export async function createClient(input: ClientHubCreateClientInput): Promise<ClientHubCreateClientResult> {
  const payload: ClientHubCreateClientInput = { operationId: operationId(input.operationId), displayName: requiredText(input.displayName, "client name", 100), ...requestReference(input.requestId) };
  if (input.email?.trim()) {
    const email = requiredText(input.email, "email address", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ClientHubDataError("Enter a valid email address, or leave it blank.");
    payload.email = email;
  }
  if (input.projectTitle?.trim()) payload.projectTitle = requiredText(input.projectTitle, "commission title", 150);
  if (input.labelOrder !== undefined) payload.labelOrder = validateProjectLabelOrder(input.labelOrder);
  if (input.localLabelDefinitions !== undefined) payload.localLabelDefinitions = validateLocalLabelDefinitions(input.localLabelDefinitions);
  if (input.informationTags !== undefined) payload.informationTags = validateClientHubInformationTags(input.informationTags);
  const response = await callOwner("tmcHubCreateClient", payload);
  const client = decodeClientHubClient(response.client);
  const project = response.project === null ? null : decodeClientHubProject(response.project);
  verifySavedLocalLabels(project, input);
  if (project && project.clientId !== client.clientId) throw new ClientHubDataError("The created commission did not match the client. Refresh before continuing.");
  if (response.signInCode !== undefined && !isClientHubCode(response.signInCode)) throw new ClientHubDataError("The client was returned without a valid sign-in code. Refresh the client and reset the code if needed.");
  return { client, project, ...(response.signInCode ? { signInCode: response.signInCode as string } : {}) };
}
export async function createProject(input: ClientHubCreateProjectInput) {
  assertClientHubId(input.clientId);
  const payload: ClientHubCreateProjectInput = { operationId: operationId(input.operationId), clientId: input.clientId, title: requiredText(input.title, "commission title", 150), ...requestReference(input.requestId) };
  if (input.trackingEnabled !== undefined) {
    if (typeof input.trackingEnabled !== "boolean") throw new ClientHubDataError("Choose whether commission tracking is shown.");
    payload.trackingEnabled = input.trackingEnabled;
  }
  if (input.informationTags !== undefined) payload.informationTags = validateClientHubInformationTags(input.informationTags);
  if (input.summary !== undefined) payload.summary = requiredText(input.summary, "commission summary", 3000, true);
  if (input.labelOrder !== undefined) payload.labelOrder = validateProjectLabelOrder(input.labelOrder);
  if (input.localLabelDefinitions !== undefined) payload.localLabelDefinitions = validateLocalLabelDefinitions(input.localLabelDefinitions);
  const response = await callOwner("tmcHubCreateProject", payload);
  const project = decodeClientHubProject(response.project);
  verifySavedLocalLabels(project, input);
  if (project.clientId !== input.clientId) throw new ClientHubDataError("The created commission did not match the client. Refresh before continuing.");
  if (input.trackingEnabled !== undefined && project.trackingEnabled !== input.trackingEnabled) throw new ClientHubDataError("The tracking choice could not be confirmed. Refresh the commission before trying again.");
  return { project };
}
export async function updateProject(input: ClientHubUpdateProjectInput) {
  assertClientHubProjectId(input.projectId); assertClientHubVersion(input.expectedVersion);
  if (!CLIENT_HUB_PROJECT_STATUSES.includes(input.status)) throw new ClientHubDataError("Choose a valid commission status.");
  if (input.progress !== null && (!Number.isSafeInteger(input.progress) || input.progress < 0 || input.progress > 100)) throw new ClientHubDataError("Enter a whole progress percentage from 0 to 100, or leave it blank.");
  const payload: ClientHubUpdateProjectInput = { projectId: input.projectId, expectedVersion: input.expectedVersion, title: requiredText(input.title, "commission title", 150), summary: requiredText(input.summary, "commission summary", 3000, true), status: input.status, progress: input.progress, ...(input.informationTags !== undefined ? { informationTags: validateClientHubInformationTags(input.informationTags) } : {}), ...(input.trackingUrl !== undefined ? { trackingUrl: safeClientHubTrackingUrl(input.trackingUrl) } : {}), ...(input.trelloUrl !== undefined ? { trelloUrl: safeClientHubTrelloUrl(input.trelloUrl) } : {}) };
  if (input.trackingEnabled !== undefined) {
    if (typeof input.trackingEnabled !== "boolean") throw new ClientHubDataError("Choose whether commission tracking is shown.");
    payload.trackingEnabled = input.trackingEnabled;
  }
  if (input.milestones !== undefined) payload.milestones = validateHubMilestones(input.milestones);
  if (input.activeMilestoneId !== undefined) payload.activeMilestoneId = input.activeMilestoneId;
  if (input.labelOrder !== undefined) payload.labelOrder = validateProjectLabelOrder(input.labelOrder);
  if (input.localLabelDefinitions !== undefined) payload.localLabelDefinitions = validateLocalLabelDefinitions(input.localLabelDefinitions);
  const response = await callOwner("tmcHubUpdateProject", payload);
  const project = decodeClientHubProject(response.project, input.projectId);
  verifySavedLocalLabels(project, input);
  if (project.version !== input.expectedVersion + 1) throw new ClientHubDataError("The commission update could not be confirmed. Refresh before retrying.");
  if (input.trackingEnabled !== undefined && project.trackingEnabled !== input.trackingEnabled) throw new ClientHubDataError("The tracking choice could not be confirmed. Refresh the commission before trying again.");
  return { project };
}
export async function resetClientLoginCode(input: { clientId: string; expectedAuthVersion: number }): Promise<ClientHubResetCodeResult> {
  assertClientHubId(input.clientId); assertClientHubVersion(input.expectedAuthVersion);
  const response = await callOwner("tmcHubResetClientCode", { clientId: input.clientId, expectedAuthVersion: input.expectedAuthVersion });
  if (response.clientId !== input.clientId || response.authVersion !== input.expectedAuthVersion + 1 || !isClientHubCode(response.signInCode)) throw new ClientHubDataError("The reset was not confirmed. Refresh the client record before trying another reset.");
  return { clientId: input.clientId, authVersion: response.authVersion as number, signInCode: response.signInCode };
}
export async function setClientStatus(input: { clientId: string; expectedAuthVersion: number; status: ClientHubStatus }) {
  assertClientHubId(input.clientId); assertClientHubVersion(input.expectedAuthVersion);
  if (input.status !== "active" && input.status !== "suspended") throw new ClientHubDataError("Choose a valid client account status.");
  const response = await callOwner("tmcHubSetClientStatus", { clientId: input.clientId, expectedAuthVersion: input.expectedAuthVersion, status: input.status });
  const client = decodeClientHubClient(response.client, input.clientId);
  if (client.status !== input.status || client.authVersion < input.expectedAuthVersion) throw new ClientHubDataError("The account status change could not be confirmed. Refresh before retrying.");
  return { client };
}

/** Profile editing never rotates credentials or changes the permanent ID. */
export async function updateClientProfile(input: ClientHubUpdateClientProfileInput): Promise<{ client: ClientHubClient; email: string }> {
  assertClientHubId(input.clientId);
  if (typeof input.expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.expectedUpdatedAt) || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) throw new ClientHubDataError("Refresh this client profile before saving.");
  const displayName = requiredText(input.displayName, "client name", 100);
  const email = requiredText(input.email ?? "", "contact email", 254, true);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ClientHubDataError("Enter a valid email address, or leave it blank.");
  const response = await callOwner("tmcHubUpdateClientProfile", { clientId: input.clientId, expectedUpdatedAt: input.expectedUpdatedAt, displayName, email });
  const client = decodeClientHubClient(response.client, input.clientId);
  if (client.displayName !== displayName || Date.parse(client.updatedAt) <= Date.parse(input.expectedUpdatedAt) || response.email !== email) throw new ClientHubDataError("The profile update was not confirmed. Refresh before retrying.");
  return { client, email };
}

/** A separate full Firestore component shares owner auth, never the legacy lite
 * db object. Existing owner services remain on their original adapter. */
export function subscribeClients(onData: (clients: ClientHubClient[]) => void, onError: (error: unknown) => void): () => void {
  let active = true; const stops: (() => void)[] = [];
  const stop = () => { active = false; stops.splice(0).forEach(unsubscribe => unsubscribe()); };
  const fail = (error: unknown) => { if (!active) return; stop(); onError(error); };
  void taylorOwnerSession().then(session => {
    if (!active) return;
    const db = getLiveFirestore(session.auth.app);
    stops.push(onLiveSnapshot(liveCollection(db, "hubClients"), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { session.assertCurrent(); onData(snapshot.docs.map(item => decodeClientHubClient(item.data(), item.id)).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.clientId.localeCompare(b.clientId))); } catch (error) { fail(error); }
    }, fail));
    stops.push(onOwnerTokenChanged(session.auth, () => { if (!active) return; try { session.assertCurrent(); } catch (error) { fail(error); } }, fail));
  }).catch(fail);
  return stop;
}
export function subscribeClientDetail(clientId: string, onData: (detail: ClientHubDetail) => void, onError: (error: unknown) => void): () => void {
  let active = true; const stops: (() => void)[] = [];
  const stop = () => { active = false; stops.splice(0).forEach(unsubscribe => unsubscribe()); };
  const fail = (error: unknown) => { if (!active) return; stop(); onError(error); };
  try { assertClientHubId(clientId); } catch (error) { queueMicrotask(() => fail(error)); return stop; }
  void taylorOwnerSession().then(session => {
    if (!active) return;
    const db = getLiveFirestore(session.auth.app), pending = new Set(["client", "private", "projects"]);
    let client: ClientHubClient | null = null, email: string | undefined, projects: ClientHubDashboard["projects"] = [];
    const emit = (key: string) => { pending.delete(key); if (!active || pending.size || !client) return; session.assertCurrent(); onData({ client, projects, ...(email ? { email } : {}) }); };
    stops.push(onLiveSnapshot(liveDoc(db, "hubClients", clientId), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { if (!snapshot.exists()) throw new ClientHubDataError("This client no longer exists."); client = decodeClientHubClient(snapshot.data(), clientId); emit("client"); } catch (error) { fail(error); }
    }, fail));
    stops.push(onLiveSnapshot(liveDoc(db, "hubClientPrivate", clientId), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { const raw = snapshot.exists() ? clientHubObject(snapshot.data()) : null; if (raw && (raw.clientId !== clientId || typeof raw.email !== "string" || raw.email.length > 254 || /[\u0000-\u001f\u007f]/.test(raw.email))) throw new ClientHubDataError("The private client contact record could not be read safely."); email = raw?.email as string | undefined; emit("private"); } catch (error) { fail(error); }
    }, fail));
    stops.push(onLiveSnapshot(liveQuery(liveCollection(db, "hubProjects"), liveWhere("clientId", "==", clientId)), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { projects = snapshot.docs.map(item => decodeClientHubProject(item.data(), item.id)); if (projects.some(project => project.clientId !== clientId)) throw new ClientHubDataError("A commission belongs to a different client."); projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.projectId.localeCompare(b.projectId)); emit("projects"); } catch (error) { fail(error); }
    }, fail));
    stops.push(onOwnerTokenChanged(session.auth, () => { if (!active) return; try { session.assertCurrent(); } catch (error) { fail(error); } }, fail));
  }).catch(fail);
  return stop;
}

export type HubMilestoneDefaults = { milestones: HubMilestone[]; version: number };
function decodeMilestoneDefaults(raw: Record<string, unknown>): HubMilestoneDefaults {
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 0) throw new ClientHubDataError("Refresh milestone defaults before continuing.");
  return { milestones: validateHubMilestones(raw.milestones), version: raw.version as number };
}
export async function getMilestoneDefaults(): Promise<HubMilestoneDefaults> { return decodeMilestoneDefaults(await callOwner("tmcHubGetMilestoneDefaults", {})); }
export async function saveMilestoneDefaults(input: { milestones: HubMilestone[]; expectedVersion: number }): Promise<HubMilestoneDefaults> {
  return decodeMilestoneDefaults(await callOwner("tmcHubSaveMilestoneDefaults", { ...input, milestones: validateHubMilestones(input.milestones) }));
}
export async function setProjectArchived(projectId: string, expectedVersion: number, archived: boolean) {
  assertClientHubProjectId(projectId); assertClientHubVersion(expectedVersion);
  const response = await callOwner("tmcHubSetProjectArchived", { projectId, expectedVersion, archived });
  const project = decodeClientHubProject(response.project);
  if (project.projectId !== projectId || project.version !== expectedVersion + 1 || project.ownerArchived !== archived) throw new ClientHubDataError("Refresh the commission to confirm its archive state.");
  return { project };
}
