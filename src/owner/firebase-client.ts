import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { browserSessionPersistence, initializeAuth, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore/lite";

/** Web-app identifiers only. Never add a service-account key or Admin credential. */
export type OwnerFirebaseEnvironment = {
  apiKey?: string; authDomain?: string; projectId?: string; storageBucket?: string;
  messagingSenderId?: string; appId?: string; ownerUid?: string;
};
export type OwnerFirebaseConfigStatus =
  | { status: "ready"; options: FirebaseOptions; ownerUid: string }
  | { status: "missing" | "invalid"; fields: string[] };

const envNames: Record<keyof OwnerFirebaseEnvironment, string> = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY", authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  ownerUid: "NEXT_PUBLIC_OWNER_UID",
};
const placeholder = /REDACTED|REPLACE|PLACEHOLDER|YOUR[_ -]|[<>]/i;

/** Direct process.env accesses are required for Next.js browser build inlining. */
export function readOwnerFirebaseConfig(environment: OwnerFirebaseEnvironment = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ownerUid: process.env.NEXT_PUBLIC_OWNER_UID,
}): OwnerFirebaseConfigStatus {
  const fields = Object.keys(envNames) as (keyof OwnerFirebaseEnvironment)[];
  const missing = fields.filter(key => !environment[key]?.trim());
  if (missing.length) return { status: "missing", fields: missing.map(key => envNames[key]) };
  const invalid = fields.filter(key => placeholder.test(environment[key]!) || environment[key] !== environment[key]!.trim());
  if (!/^AIza[A-Za-z0-9_-]{30,50}$/.test(environment.apiKey!)) invalid.push("apiKey");
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(environment.authDomain!)) invalid.push("authDomain");
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(environment.projectId!)) invalid.push("projectId");
  if (!/^[a-z0-9][a-z0-9.-]+$/.test(environment.storageBucket!)) invalid.push("storageBucket");
  if (!/^\d+$/.test(environment.messagingSenderId!)) invalid.push("messagingSenderId");
  if (!/^1:\d+:web:[a-f0-9]+$/i.test(environment.appId!)) invalid.push("appId");
  if (!/^[^\s/]{1,128}$/.test(environment.ownerUid!)) invalid.push("ownerUid");
  if (invalid.length) return { status: "invalid", fields: [...new Set(invalid)].map(key => envNames[key]) };
  const { ownerUid, ...options } = environment;
  return { status: "ready", options, ownerUid: ownerUid! };
}

export type OwnerFirebaseClient = { auth: Auth; db: Firestore; ownerUid: string };
const APP_NAME = "tmc-private-owner";

/** Called only by the client gate after every required setting passes validation. */
export function getOwnerFirebaseClient(config: Extract<OwnerFirebaseConfigStatus, { status: "ready" }>): OwnerFirebaseClient {
  if (typeof window === "undefined") throw new Error("Owner sign-in is available only in the browser.");
  const existing = getApps().find(app => app.name === APP_NAME);
  if (existing && Object.entries(config.options).some(([key, value]) => existing.options[key as keyof FirebaseOptions] !== value)) {
    throw new Error("Owner connection settings changed. Reload this page before signing in.");
  }
  const app = existing ?? initializeApp(config.options, APP_NAME);
  // Never use getAuth's default persistent/local browser session.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  return { auth, db: getFirestore(app), ownerUid: config.ownerUid };
}

export class OwnerSessionError extends Error {
  readonly code: "denied" | "expired";
  constructor(code: OwnerSessionError["code"], message: string) { super(message); this.name = "OwnerSessionError"; this.code = code; }
}

/** Verify with Auth before exposing any private UI; stale async results fail closed. */
export async function verifyOwnerSession(client: OwnerFirebaseClient, user: User): Promise<void> {
  if (user.uid !== client.ownerUid) throw new OwnerSessionError("denied", "This account does not have owner access. Sign out and use Taylor’s owner account.");
  await user.reload();
  await user.getIdToken(true);
  if (client.auth.currentUser !== user || client.auth.currentUser.uid !== client.ownerUid) {
    throw new OwnerSessionError("expired", "Your sign-in changed. Please sign in again.");
  }
}

export function ownerSignInError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a little, then try again.";
  if (code === "auth/network-request-failed") return "Could not reach sign-in. Check your connection and try again.";
  if (code === "auth/unauthorized-domain") return "This website address is not approved for owner sign-in yet. Ask your site developer to finish setup.";
  if (["auth/invalid-api-key", "auth/operation-not-allowed", "auth/configuration-not-found", "auth/app-not-authorized"].includes(code)) return "Owner sign-in setup is incomplete. Ask your site developer to check the Firebase settings.";
  return "Could not sign in. Check the owner email and password, then try again.";
}
