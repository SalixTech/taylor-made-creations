"use client";
import { assertHubWindowSession, acceptHubWindowSignIn, revokeHubWindows, watchHubWindowSession } from "./window-session";
import { clearHubPhotoCache } from "./private-photo-cache";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { browserSessionPersistence, initializeAuth, onIdTokenChanged, signInWithCustomToken, signOut, type Auth, type User } from "firebase/auth";
import { collection, doc, getDocFromServer, getDocsFromServer, getFirestore, query, where, onSnapshot, type Firestore } from "firebase/firestore";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { ClientHubDataError, decodeClientHubClient, decodeClientHubProject, decodeClientHubSession, isClientHubCode, isClientHubId, clientHubObject, normalizeClientHubCode, type ClientHubClient, type ClientHubDashboard, type ClientHubSession } from "./model";

export const CLIENT_HUB_APP_NAME = "tmc-client-hub";
export const CLIENT_HUB_FUNCTIONS_REGION = "us-central1";
export class ClientHubError extends Error {
  constructor(public readonly code: "configuration" | "setup" | "session-expired" | "invalid-code" | "busy" | "invalid-response", message: string) { super(message); this.name = "ClientHubError"; }
}
export type ClientHubFirebaseEnvironment = { apiKey?: string; authDomain?: string; projectId?: string; storageBucket?: string; messagingSenderId?: string; appId?: string };
export type ClientHubFirebaseConfig = { status: "ready"; options: FirebaseOptions } | { status: "missing" | "invalid"; fields: string[] };
const envNames: Record<keyof ClientHubFirebaseEnvironment, string> = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY", authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};
/** Public web identifiers only. No owner UID, service account, or login code belongs here. */
export function readClientHubFirebaseConfig(environment: ClientHubFirebaseEnvironment = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}): ClientHubFirebaseConfig {
  const keys = Object.keys(envNames) as (keyof ClientHubFirebaseEnvironment)[];
  const missing = keys.filter(key => !environment[key]?.trim());
  if (missing.length) return { status: "missing", fields: missing.map(key => envNames[key]) };
  const invalid = keys.filter(key => /REDACTED|REPLACE|PLACEHOLDER|YOUR[_ -]|[<>]/i.test(environment[key]!) || environment[key] !== environment[key]!.trim());
  if (!/^AIza[A-Za-z0-9_-]{30,50}$/.test(environment.apiKey!)) invalid.push("apiKey");
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(environment.authDomain!)) invalid.push("authDomain");
  if (environment.projectId !== "taylor-made-creations") invalid.push("projectId");
  if (!/^[a-z0-9][a-z0-9.-]+$/.test(environment.storageBucket!)) invalid.push("storageBucket");
  if (!/^\d+$/.test(environment.messagingSenderId!)) invalid.push("messagingSenderId");
  if (!/^1:\d+:web:[a-f0-9]+$/i.test(environment.appId!)) invalid.push("appId");
  if (invalid.length) return { status: "invalid", fields: [...new Set(invalid)].map(key => envNames[key]) };
  return { status: "ready", options: { ...environment } };
}
type ClientConnection = { auth: Auth; db: Firestore; functions: Functions };
/** Separate named app: client sign-in/sign-out must never replace Taylor's owner session. */
function connection(): ClientConnection {
  if (typeof window === "undefined") throw new ClientHubError("configuration", "Client Hub sign-in is available only in the browser.");
  const config = readClientHubFirebaseConfig();
  if (config.status !== "ready") throw new ClientHubError("configuration", "Client Hub connection setup is incomplete. Please contact Taylor; no client information has been loaded.");
  const existing = getApps().find(app => app.name === CLIENT_HUB_APP_NAME);
  if (existing && Object.entries(config.options).some(([key, value]) => existing.options[key as keyof FirebaseOptions] !== value)) throw new ClientHubError("configuration", "Client Hub connection settings changed. Reload this page before signing in.");
  const app = existing ?? initializeApp(config.options, CLIENT_HUB_APP_NAME);
  // Session-only Firebase tokens; the reusable sign-in code is never stored anywhere.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  return { auth, db: getFirestore(app), functions: getFunctions(app, CLIENT_HUB_FUNCTIONS_REGION) };
}
/** Used only by the guarded ordinary-public theme bridge for the hinted role. */
export function getClientThemeAuth(): Auth { return connection().auth; }

function errorCode(error: unknown): string { return error && typeof error === "object" && "code" in error ? String(error.code) : ""; }
export function isClientHubSessionError(error: unknown): boolean {
  return error instanceof ClientHubError && error.code === "session-expired" || ["permission-denied", "unauthenticated", "firestore/permission-denied", "firestore/unauthenticated", "auth/user-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/invalid-user-token", "auth/user-not-found", "storage/unauthorized", "functions/unauthenticated", "functions/permission-denied"].includes(errorCode(error));
}
export function clientHubErrorMessage(error: unknown): string {
  if (error instanceof ClientHubError || error instanceof ClientHubDataError) return error.message;
  const code = errorCode(error);
  if (isClientHubSessionError(error)) return "Your Client Hub session is no longer active. Sign in again with your current code, or contact Taylor.";
  if (["functions/not-found", "functions/unimplemented", "auth/configuration-not-found", "auth/operation-not-allowed", "auth/invalid-api-key", "auth/unauthorized-domain", "auth/app-not-authorized"].includes(code)) return "Client Hub setup is incomplete. Please contact Taylor so the connection can be checked.";
  if (["functions/aborted", "functions/already-exists"].includes(code)) return "This record changed on another device. Refresh before trying again.";
  if (["functions/resource-exhausted", "auth/too-many-requests"].includes(code)) return "Too many attempts. Please wait a little before trying again.";
  if (code === "functions/failed-precondition") return "This action could not be completed in the record’s current state. Refresh and check the client status before trying again.";
  if (code === "functions/permission-denied" || code === "functions/unauthenticated") return "Your account cannot perform this Client Hub action. Sign in again with the correct account.";
  if (code === "functions/invalid-argument") return "Please check the client or commission details and try again.";
  return "Client Hub could not be reached. Check your connection and try again. No connection has been confirmed.";
}
function expired(): ClientHubError { return new ClientHubError("session-expired", "Your Client Hub session changed or expired. Sign in again with your current code."); }
function assertCurrent(auth: Auth, user: User, signal?: AbortSignal, allowSuppressed = false) {
  if (signal?.aborted) throw new DOMException("The Client Hub request was cancelled.", "AbortError");
  if (auth.currentUser !== user || suppressSessions && !allowSuppressed) throw expired();
  if (!allowSuppressed) assertHubWindowSession("client", user.uid);
}
async function verifiedSession(auth: Auth, user: User, forceRefresh: boolean, signal?: AbortSignal, allowSuppressed = false): Promise<ClientHubSession> {
  assertCurrent(auth, user, signal, allowSuppressed);
  const token = await user.getIdTokenResult(forceRefresh);
  assertCurrent(auth, user, signal, allowSuppressed);
  try { return decodeClientHubSession(user.uid, token.claims); } catch { throw expired(); }
}

/** The subscription emits null on logout and reports setup/auth failures separately. */
export function subscribeClientSession(callback: (session: ClientHubSession | null) => void, onError?: (error: unknown) => void): () => void {
  let active = true, sequence = 0;
  let stopEpoch: (() => void) | null = null;
  let client: ClientConnection;
  try { client = connection(); } catch (error) {
    queueMicrotask(() => { if (active) { callback(null); onError?.(error); } });
    return () => { active = false; };
  }
  const lock = (event: Event) => { const detail = (event as CustomEvent).detail; if (!active || detail?.role !== "client" || detail.uid !== client.auth.currentUser?.uid) return; ++sequence; stopEpoch?.(); stopEpoch = null; callback(null); onError?.(expired()); };
  window.addEventListener?.("tmc-hub-session-lock", lock);
  const unsubscribe = onIdTokenChanged(client.auth, user => {
    if (!active || user !== client.auth.currentUser) return;
    const request = ++sequence;
    stopEpoch?.(); stopEpoch = null;
    if (!user) { if (active) callback(null); return; }
    const generation = authGeneration, transition = signInTransition;
    void (async () => {
      // Firebase can emit a user before a pending custom-token exchange returns.
      // Never publish a cancelled or not-yet-verified sign-in to UI subscribers.
      if (transition) await transition.settled;
      if (!active || request !== sequence || generation !== authGeneration || transition && !transition.accepted) return;
      if (suppressSessions) throw expired();
      watchHubWindowSession("client", user.uid, () => { if (client.auth.currentUser?.uid === user.uid) void signOutClient(false).catch(() => {}); });
      const session = await verifiedSession(client.auth, user, false);
      if (!active || request !== sequence || generation !== authGeneration) return;
      // Rules re-evaluate this live record when its status/epoch changes. A
      // suspended/reset session is cleared immediately, even in an idle tab.
      stopEpoch = onSnapshot(doc(client.db, "hubClients", session.clientId), { includeMetadataChanges: true }, snapshot => {
        if (!active || request !== sequence || generation !== authGeneration || snapshot.metadata.fromCache) return;
        try {
          assertCurrent(client.auth, user);
          if (!snapshot.exists()) throw expired();
          const record = decodeClientHubClient(snapshot.data(), session.clientId);
          if (record.status !== "active" || record.authVersion !== session.authVersion) throw expired();
          callback(session);
        } catch (error) { revoke(error); }
      }, revoke);
      function revoke(error: unknown) {
        if (!active || request !== sequence || generation !== authGeneration || client.auth.currentUser !== user) return;
        ++sequence; stopEpoch?.(); stopEpoch = null; callback(null); onError?.(error);
        if (isClientHubSessionError(error)) void signOutClient().catch(() => {});
      }
    })().catch(error => {
      if (active && request === sequence && generation === authGeneration && client.auth.currentUser === user) { callback(null); onError?.(error); }
    });
  }, error => { if (active) { ++sequence; callback(null); onError?.(error); } });
  return () => { active = false; ++sequence; stopEpoch?.(); stopEpoch = null; unsubscribe(); window.removeEventListener?.("tmc-hub-session-lock", lock); };
}
let authGeneration = 0;
let signingIn = false;
let signingOut = 0;
// A failed SDK logout must never silently reopen the hub on a later token event.
let suppressSessions = false;
type SignInTransition = { settled: Promise<void>; finish: () => void; accepted: boolean };
let signInTransition: SignInTransition | null = null;
export async function signInClient(code: string): Promise<ClientHubSession> {
  const normalizedCode = normalizeClientHubCode(code);
  if (!isClientHubCode(normalizedCode)) throw new ClientHubError("invalid-code", "That sign-in code is invalid or incorrect.");
  if (signingIn || signingOut) throw new ClientHubError("busy", "A sign-in or sign-out is already in progress. Please wait.");
  const client = connection();
  const generation = ++authGeneration;
  clearHubPhotoCache();
  signingIn = true;
  let finish!: () => void;
  const transition: SignInTransition = { settled: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish(), accepted: false };
  signInTransition = transition;
  let credentialUser: User | null = null;
  try {
    const callable = httpsCallable<{ code: string }, unknown>(client.functions, "tmcHubSignIn");
    const response = clientHubObject((await callable({ code: normalizedCode })).data);
    if (generation !== authGeneration) throw expired();
    if (typeof response.token !== "string" || !response.token || !isClientHubId(response.clientId)) throw new ClientHubError("invalid-response", "Client Hub could not verify the sign-in response. Please try again.");
    const credential = await signInWithCustomToken(client.auth, response.token);
    credentialUser = credential.user;
    if (generation !== authGeneration) {
      if (client.auth.currentUser === credential.user) await signOut(client.auth);
      throw expired();
    }
    const session = await verifiedSession(client.auth, credential.user, true, undefined, true);
    if (generation !== authGeneration || session.clientId !== response.clientId) {
      if (client.auth.currentUser === credential.user) await signOut(client.auth);
      throw expired();
    }
    acceptHubWindowSignIn("client", credential.user.uid);
    suppressSessions = false;
    transition.accepted = true;
    return session;
  } catch (error) {
    if (credentialUser && client.auth.currentUser === credentialUser) { suppressSessions = true; await signOut(client.auth); }
    if (["functions/unauthenticated", "functions/permission-denied", "auth/invalid-custom-token", "auth/custom-token-mismatch"].includes(errorCode(error))) throw new ClientHubError("invalid-code", "That sign-in code is invalid or incorrect.");
    throw error;
  } finally { signingIn = false; if (signInTransition === transition) signInTransition = null; transition.finish(); }
}
export async function signOutClient(coordinate = true): Promise<void> {
  const user = connection().auth.currentUser;
  const coordinated = !coordinate || !user || revokeHubWindows("client", user.uid);
  clearHubPhotoCache();
  suppressSessions = true;
  ++authGeneration; // Also cancels an in-flight exchange before it can establish a later session.
  ++signingOut;
  try { await signOut(connection().auth); if (!coordinated) throw new ClientHubError("busy", "This tab is signed out, but the browser could not save the cross-window logout marker. Close any other Hub windows on this device before leaving it shared."); } finally { --signingOut; }
}
/** Read-only Firestore access, constrained by clientId and the server-enforced auth epoch. */
export async function loadClientDashboard(session: ClientHubSession, signal?: AbortSignal): Promise<ClientHubDashboard> {
  if (signal?.aborted) throw new DOMException("The Client Hub request was cancelled.", "AbortError");
  const client = connection(), user = client.auth.currentUser;
  if (!user || suppressSessions) throw expired();
  try {
    const current = await verifiedSession(client.auth, user, false, signal);
    if (current.uid !== session.uid || current.clientId !== session.clientId || current.authVersion !== session.authVersion) throw expired();
    const clientSnapshot = await getDocFromServer(doc(client.db, "hubClients", current.clientId));
    assertCurrent(client.auth, user, signal);
    if (!clientSnapshot.exists()) throw expired();
    const record = decodeClientHubClient(clientSnapshot.data(), current.clientId);
    if (record.status !== "active" || record.authVersion !== current.authVersion) throw expired();
    const projectSnapshot = await getDocsFromServer(query(collection(client.db, "hubProjects"), where("clientId", "==", current.clientId)));
    assertCurrent(client.auth, user, signal);
    const projects = projectSnapshot.docs.map(document => decodeClientHubProject(document.data(), document.id));
    if (projects.some(project => project.clientId !== current.clientId)) throw new ClientHubError("invalid-response", "Client Hub returned a mismatched commission. No commission data can be shown.");
    projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.projectId.localeCompare(b.projectId));
    return { client: record, projects };
  } catch (error) { if (isClientHubSessionError(error)) throw expired(); throw error; }
}

/** A verified scoped connection for workspace reads and callable mutations. No secret is retained. */
export async function verifiedClientHubConnection(signal?: AbortSignal, verifyRecord = true) {
  const client = connection(), user = client.auth.currentUser, generation = authGeneration;
  if (!user || suppressSessions) throw expired();
  const session = await verifiedSession(client.auth, user, false, signal);
  // Browser reads/final downloads require a fresh authoritative record. Hot
  // callable-only paths may skip this redundant read: the server verifies the
  // revoked token and checks this same epoch transactionally on every operation.
  if (verifyRecord) {
    const snapshot = await getDocFromServer(doc(client.db, "hubClients", session.clientId));
    assertCurrent(client.auth, user, signal);
    if (generation !== authGeneration || !snapshot.exists()) throw expired();
    const record = decodeClientHubClient(snapshot.data(), session.clientId);
    if (record.status !== "active" || record.authVersion !== session.authVersion) throw expired();
  }
  assertCurrent(client.auth, user, signal);
  if (generation !== authGeneration) throw expired();
  return { ...client, session, assertCurrent: () => {
    assertCurrent(client.auth, user, signal);
    if (generation !== authGeneration) throw expired();
  } };
}

/** Capture ownership before async setup. Old listeners may fail after another account
 * signs in; that failure must not revoke or replace the newer account's session. */
export function captureClientHubSessionOwnership(): () => boolean {
  const generation = authGeneration;
  try { const { auth } = connection(), user = auth.currentUser; return () => auth.currentUser === user && authGeneration === generation; }
  catch { return () => authGeneration === generation; } // Async setup still reports configuration errors through the normal onError callback.
}

/** Genuine scoped snapshots; no polling and no cached-first disclosure. */
export function subscribeClientDashboard(session: ClientHubSession, onData: (dashboard: ClientHubDashboard) => void, onError: (error: unknown) => void): () => void {
  let active = true; const ownsSession = captureClientHubSessionOwnership(); const stops: (() => void)[] = [];
  const stop = () => { active = false; stops.splice(0).forEach(unsubscribe => unsubscribe()); };
  const fail = (error: unknown) => { if (!active) return; if (!ownsSession()) { stop(); return; } stop(); if (isClientHubSessionError(error)) void signOutClient().catch(() => {}); onError(error); };
  void verifiedClientHubConnection().then(connection => {
    if (!active) return;
    if (connection.session.uid !== session.uid || connection.session.clientId !== session.clientId || connection.session.authVersion !== session.authVersion) throw expired();
    let record: ClientHubDashboard["client"] | null = null, projects: ClientHubDashboard["projects"] | null = null;
    const emit = () => { if (!active || !record || !projects) return; connection.assertCurrent(); onData({ client: record, projects }); };
    stops.push(onSnapshot(doc(connection.db, "hubClients", session.clientId), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { if (!snapshot.exists()) throw expired(); record = decodeClientHubClient(snapshot.data(), session.clientId); if (record.status !== "active" || record.authVersion !== session.authVersion) throw expired(); emit(); } catch (error) { fail(error); }
    }, fail));
    stops.push(onSnapshot(query(collection(connection.db, "hubProjects"), where("clientId", "==", session.clientId)), { includeMetadataChanges: true }, snapshot => {
      if (!active || snapshot.metadata.fromCache) return;
      try { projects = snapshot.docs.map(item => decodeClientHubProject(item.data(), item.id)); if (projects.some(project => project.clientId !== session.clientId)) throw expired(); projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.projectId.localeCompare(b.projectId)); emit(); } catch (error) { fail(error); }
    }, fail));
  }).catch(fail);
  return stop;
}

/** Account-wide nickname only; canonical owner name and credentials unchanged. */
export async function updateHubNickname(client: ClientHubClient, nickname: string): Promise<{ client: ClientHubClient }> {
  if (typeof nickname !== "string" || nickname.trim().length > 60 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(nickname)) throw new ClientHubDataError("Choose a display name up to 60 characters.");
  const connection = await verifiedClientHubConnection();
  if (connection.session.clientId !== client.clientId) throw expired();
  const response = clientHubObject((await httpsCallable<unknown, unknown>(connection.functions, "tmcHubUpdateNickname")({ clientId: client.clientId, expectedUpdatedAt: client.updatedAt, nickname: nickname.trim() })).data);
  connection.assertCurrent();
  const updated = decodeClientHubClient(response.client, client.clientId);
  if (updated.displayName !== client.displayName || updated.nickname !== nickname.trim()) throw new ClientHubDataError("The display name save could not be confirmed. Refresh before retrying.");
  return { client: updated };
}

/** Small authenticated raster avatar; never a reusable public bearer URL. */
export async function saveHubAvatar(client: ClientHubClient, file: File, operationId: string): Promise<{ client: ClientHubClient }> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 2 * 1024 * 1024) throw new ClientHubDataError("Choose a JPG, PNG or WebP avatar up to 2 MiB.");
  const connection = await verifiedClientHubConnection();
  if (connection.session.clientId !== client.clientId) throw expired();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  connection.assertCurrent();
  const response = clientHubObject((await httpsCallable<unknown, unknown>(connection.functions, "tmcHubSaveAvatar")({ operationId, clientId: client.clientId, expectedAvatarVersion: client.avatarVersion ?? 0, contentType: file.type, base64: btoa(binary) })).data);
  connection.assertCurrent();
  const updated = decodeClientHubClient(response.client, client.clientId);
  if (updated.avatarVersion !== (client.avatarVersion ?? 0) + 1) throw new ClientHubDataError("The avatar save could not be confirmed. Refresh before retrying.");
  return { client: updated };
}
