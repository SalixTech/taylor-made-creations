"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { getOwnerFirebaseClient, ownerSignInError, OwnerSessionError, readOwnerFirebaseConfig, verifyOwnerSession, type OwnerFirebaseClient, type OwnerFirebaseConfigStatus } from "./firebase-client";
import { createFirebaseOwnerStore, type FirebaseOwnerStore } from "./firebase-store";
import type { OwnerStore } from "./storage";
import { OwnerBrandLogo } from "./OwnerBrandLogo";
import styles from "./FirebaseOwnerGate.module.css";
import { OwnerGateFrame } from "./OwnerGateFrame";

type GateState =
  | { status: "checking" | "signed-out" | "signing-out" }
  | { status: "setup"; config: Exclude<OwnerFirebaseConfigStatus, { status: "ready" }> }
  | { status: "denied" | "session-error"; message: string; canSignOut: boolean }
  | { status: "ready"; store: FirebaseOwnerStore; userEmail: string; sessionKey: number };
export type FirebaseOwnerSession = { store: OwnerStore; userEmail: string; signOut: () => Promise<void> };

function SessionContent({ children, ...session }: FirebaseOwnerSession & { children: (session: FirebaseOwnerSession) => ReactNode }) {
  return <>{children(session)}</>;
}

/** This UI is only a convenience gate. Deployed Firestore rules enforce access. */
export function FirebaseOwnerGate({ children }: { children: (session: FirebaseOwnerSession) => ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const clientRef = useRef<OwnerFirebaseClient | null>(null);
  const storeRef = useRef<FirebaseOwnerStore | null>(null);
  const generation = useRef(0);
  const signingOut = useRef(false);
  const mounted = useRef(false);
  const loginPending = useRef(false);

  const clearWorkspace = useCallback(() => { storeRef.current?.dispose(); storeRef.current = null; }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    // The deferred setup also ensures Strict Mode's first cleanup cannot race UI.
    void Promise.resolve().then(() => {
      if (!active) return;
      const config = readOwnerFirebaseConfig();
      if (config.status !== "ready") { setState({ status: "setup", config }); return; }
      try {
        const client = getOwnerFirebaseClient(config);
        clientRef.current = client;
        unsubscribe = onAuthStateChanged(client.auth, user => {
          const request = ++generation.current;
          clearWorkspace();
          if (!active) return;
          if (signingOut.current) { setState({ status: "signing-out" }); return; }
          if (!user) { setPassword(""); setState({ status: "signed-out" }); return; }
          setState({ status: "checking" });
          void verifyOwnerSession(client, user).then(() => {
            if (!active || request !== generation.current || signingOut.current) return;
            const store = createFirebaseOwnerStore(client);
            storeRef.current = store;
            setPassword("");
            setMessage(null);
            setState({ status: "ready", store, userEmail: user.email ?? "Owner account", sessionKey: request });
          }).catch(error => {
            if (!active || request !== generation.current || signingOut.current) return;
            clearWorkspace();
            setPassword("");
            setState(error instanceof OwnerSessionError && error.code === "denied"
              ? { status: "denied", message: error.message, canSignOut: true }
              : { status: "session-error", message: "We could not confirm your owner session. Your private workspace is locked. Check your connection, then sign out and sign in again.", canSignOut: true });
          });
        });
      } catch {
        setState({ status: "session-error", message: "Owner sign-in could not start safely. Reload this page. If it still does not work, ask your site developer to check the Firebase setup.", canSignOut: !!clientRef.current });
      }
    });
    return () => {
      active = false; mounted.current = false;
      unsubscribe?.(); clearWorkspace(); clientRef.current = null;
    };
  }, [clearWorkspace]);

  const signOut = useCallback(async (): Promise<void> => {
    if (signingOut.current) return;
    signingOut.current = true;
    ++generation.current;
    clearWorkspace();
    setPassword(""); setMessage(null);
    // Remove editor/preview (and all its state) before awaiting Firebase sign-out.
    setState({ status: "signing-out" });
    try {
      const client = clientRef.current;
      if (!client) throw new Error("Owner connection is unavailable.");
      await firebaseSignOut(client.auth);
      if (mounted.current) setState({ status: "signed-out" });
    } catch {
      if (mounted.current) setState({ status: "session-error", message: "Sign-out could not be confirmed. Your workspace has been locked on this page. Try signing out again before leaving a shared device.", canSignOut: true });
    } finally { signingOut.current = false; }
  }, [clearWorkspace]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clientRef.current;
    if (!client || loginPending.current || state.status !== "signed-out") return;
    loginPending.current = true; setBusy(true); setMessage(null);
    const enteredPassword = password;
    setPassword("");
    try { await signInWithEmailAndPassword(client.auth, email.trim(), enteredPassword); }
    catch (error) { if (mounted.current) setMessage(ownerSignInError(error)); }
    finally { loginPending.current = false; if (mounted.current) setBusy(false); }
  }

  if (state.status === "ready") return <SessionContent key={state.sessionKey} store={state.store} userEmail={state.userEmail} signOut={signOut}>{children}</SessionContent>;

  return <OwnerGateFrame><main className={styles.gate}>
    <section className={styles.card} aria-labelledby="owner-signin-title">
      <Link className={styles.brand} href="/" aria-label="Taylor Made Creations home"><OwnerBrandLogo decorative /></Link>
      <p className={styles.eyebrow}>TAYLOR’S SPACE</p>
      <h1 id="owner-signin-title">{state.status === "setup" ? "A little setup first." : state.status === "denied" ? "Owner access only." : "Welcome back, Spoodle."}</h1>
      {state.status === "checking" || state.status === "signing-out" ? <p role="status" aria-live="polite">{state.status === "signing-out" ? "Signing out and locking your workspace…" : "Checking your owner sign-in…"}</p>
        : state.status === "setup" ? <>
          <p>Owner sign-in is not connected in this build yet. Your existing browser drafts are untouched; no local or cloud workspace has been opened.</p>
          <details className={styles.details}><summary>Setup details for your site developer</summary><p>{state.config.status === "missing" ? "Missing settings:" : "Settings needing correction:"}</p><ul>{state.config.fields.map(field => <li key={field}><code>{field}</code></li>)}</ul><p>Add the Firebase web-app settings and owner UID to this deployment’s environment (or .env.local for local development), deploy the reviewed owner-only rules, then rebuild the app. Never put a password or service-account key in these settings.</p></details>
        </>
          : state.status === "denied" || state.status === "session-error" ? <>
            <p className={styles.alert} role="alert">{state.message}</p>
            {state.canSignOut ? <button className={styles.primary} type="button" onClick={() => { void signOut(); }}>Sign out</button> : <button className={styles.primary} type="button" onClick={() => window.location.reload()}>Reload page</button>}
          </>
            : <>
              <p>Sign in to edit your site and save a private cloud draft. Only your approved owner account can open this workspace.</p>
              <form onSubmit={signIn}>
                <label className={styles.field}>Owner email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
                <label className={styles.field}>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
                {message && <p className={styles.alert} role="alert">{message}</p>}
                <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to Taylor’s Space"}</button>
              </form>
              <p className={styles.hint}>Your sign-in stays in this browser tab’s session. Sign out when you’re finished on a shared device. There is no public account registration.</p>
            </>}
      <div className={styles.footer}><span>Your site. Your space.</span><Link href="/">Back to the website →</Link></div>
    </section>
  </main></OwnerGateFrame>;
}
