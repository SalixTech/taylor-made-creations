"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { usePublicOwnerContent } from "@/components/PublicSiteContext";
import { getTemplateImage } from "@/owner/site-design";
import { SpadeMark } from "./SpadeMark";
import { ClientDashboard, type ClientDashboardProps } from "./ClientDashboard";
import { SignInCodeFields } from "./SignInCodeFields";
import { clientHubErrorMessage, isClientHubSessionError, loadClientDashboard, signInClient, signOutClient, subscribeClientSession, subscribeClientDashboard } from "./client";
import type { ClientHubClient, ClientHubProject, ClientHubSession } from "./model";
import { CLIENT_HUB_CONTACT_HREF, sameClientSession } from "./presentation";
import styles from "./ClientHub.module.css";
import codeStyles from "./SignInCodeFields.module.css";

type GateState =
  | { status: "checking" | "signed-out" | "signing-out" }
  | { status: "ready"; client: ClientHubClient; projects: ClientHubProject[]; sessionKey: string }
  | { status: "error"; message: string; retry: "connection" | "dashboard" | "signout"; expired?: boolean };

function DashboardContent({ render, ...props }: ClientDashboardProps & { render: (props: ClientDashboardProps) => ReactNode }) { return <>{render(props)}</>; }

/** Client-only convenience gate. Firebase claims and deployed rules enforce every read. */
export function ClientHub({ renderDashboard }: { renderDashboard?: (props: ClientDashboardProps) => ReactNode } = {}) {
  const content = usePublicOwnerContent();
  const [state, setState] = useState<GateState>({ status: "checking" });
  const [liveSession, setLiveSession] = useState<ClientHubSession | null>(null);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const mounted = useRef(false);
  const generation = useRef(0);
  const dashboardRevision = useRef(0);
  const currentSession = useRef<ClientHubSession | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loginPending = useRef(false);
  const signingOut = useRef(false);
  const logoutRequested = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const lastFocusRefresh = useRef(0);
  const focusCodeOnReturn = useRef(false);

  const invalidate = useCallback(() => {
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const refreshDashboard = useCallback(async (session: ClientHubSession, background = false) => {
    invalidate();
    const request = generation.current, revision = dashboardRevision.current;
    const pending = new AbortController();
    controller.current = pending;
    if (!background) setState({ status: "checking" });
    try {
      const dashboard = await loadClientDashboard(session, pending.signal);
      if (!mounted.current || pending.signal.aborted || request !== generation.current || revision !== dashboardRevision.current || signingOut.current || !sameClientSession(currentSession.current, session)) return;
      setState({ status: "ready", ...dashboard, sessionKey: `${session.uid}:${session.authVersion}` });
    } catch (error) {
      if (!mounted.current || pending.signal.aborted || request !== generation.current || revision !== dashboardRevision.current || signingOut.current) return;
      setState({ status: "error", message: clientHubErrorMessage(error), retry: "dashboard", expired: isClientHubSessionError(error) });
    } finally { if (controller.current === pending) controller.current = null; }
  }, [invalidate]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let subscriptionError = false;
    let unsubscribe: (() => void) | undefined;
    // Deferral keeps Strict Mode's discarded setup from opening a second subscription.
    void Promise.resolve().then(() => {
      if (!active) return;
      currentSession.current = null;
      setState({ status: "checking" });
      try {
        unsubscribe = subscribeClientSession(session => {
          if (!active || signingOut.current || session && logoutRequested.current) return;
          if (!session && subscriptionError) return;
          if (session && sameClientSession(currentSession.current, session)) return;
          subscriptionError = false;
          currentSession.current = session; dashboardRevision.current = 0; setLiveSession(session);
          setCode(""); setShowCode(false); setLoginError("");
          if (!session) { invalidate(); setState({ status: "signed-out" }); return; }
          void refreshDashboard(session);
        }, error => {
          if (!active || signingOut.current) return;
          subscriptionError = true;
          invalidate(); currentSession.current = null; setLiveSession(null);
          setCode(""); setShowCode(false);
          setState({ status: "error", message: clientHubErrorMessage(error), retry: "connection", expired: isClientHubSessionError(error) });
        });
      } catch (error) {
        subscriptionError = true;
        invalidate(); currentSession.current = null; setLiveSession(null);
        setState({ status: "error", message: clientHubErrorMessage(error), retry: "connection" });
      }
    });
    const onFocus = () => {
      const session = currentSession.current;
      if (!active || !session || signingOut.current || document.visibilityState === "hidden" || Date.now() - lastFocusRefresh.current < 1000) return;
      lastFocusRefresh.current = Date.now();
      // Re-verify on return without unmounting an in-progress chat or support draft.
      void refreshDashboard(session, true);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false; mounted.current = false;
      unsubscribe?.(); invalidate(); currentSession.current = null; setLiveSession(null);
      window.removeEventListener("focus", onFocus);
    };
  }, [connectionAttempt, invalidate, refreshDashboard]);

  useEffect(() => {
    if (!liveSession) return;
    let active = true;
    const unsubscribe = subscribeClientDashboard(liveSession, dashboard => {
      if (!active || !mounted.current || signingOut.current || !sameClientSession(currentSession.current, liveSession)) return;
      if (dashboard.client.status !== "active") { void signOutClient(); invalidate(); currentSession.current = null; setLiveSession(null); setState({ status: "signed-out" }); return; }
      ++dashboardRevision.current;
      setState({ status: "ready", ...dashboard, sessionKey: `${liveSession.uid}:${liveSession.authVersion}` });
    }, error => {
      if (!active || signingOut.current) return;
      invalidate(); currentSession.current = null; setLiveSession(null);
      setState({ status: "error", message: clientHubErrorMessage(error), retry: "connection", expired: isClientHubSessionError(error) });
    });
    return () => { active = false; unsubscribe(); };
  }, [liveSession, invalidate]);

  useEffect(() => {
    if (state.status === "signed-out" && focusCodeOnReturn.current) {
      focusCodeOnReturn.current = false;
      codeInput.current?.focus();
    }
  }, [state.status]);

  useEffect(() => {
    if (loginError && !busy && state.status === "signed-out") codeInput.current?.focus();
  }, [loginError, busy, state.status]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginPending.current || state.status !== "signed-out") return;
    const entered = code.trim();
    if (!entered) { setLoginError("Enter the sign-in code Taylor shared with you."); codeInput.current?.focus(); return; }
    loginPending.current = true;
    logoutRequested.current = false;
    setBusy(true); setLoginError(""); setCode(""); setShowCode(false);
    try {
      // Only the auth observer can unlock the view. Never put this secret in a URL or storage.
      await signInClient(entered);
    } catch (error) {
      if (mounted.current) { setLoginError(clientHubErrorMessage(error)); codeInput.current?.focus(); }
    } finally {
      loginPending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    logoutRequested.current = true;
    focusCodeOnReturn.current = true;
    invalidate(); currentSession.current = null; setLiveSession(null);
    setCode(""); setShowCode(false); setLoginError("");
    // Remove all client data before awaiting the network/browser session change.
    setState({ status: "signing-out" });
    try {
      await signOutClient();
      if (mounted.current) setState({ status: "signed-out" });
    } catch {
      if (mounted.current) setState({ status: "error", retry: "signout", message: "Sign-out could not be confirmed. Your hub is locked on this page. Try signing out again before leaving a shared device." });
    } finally { signingOut.current = false; }
  }

  function retry() {
    if (state.status !== "error") return;
    if (state.retry === "signout") { void signOut(); return; }
    if (state.retry === "dashboard" && currentSession.current) { void refreshDashboard(currentSession.current); return; }
    setState({ status: "checking" });
    setConnectionAttempt(attempt => attempt + 1);
  }

  return <div className={styles.hub} data-client-hub data-theme-scope="public" data-color-mode="dark" data-gate={state.status === "ready" ? "dashboard" : "login"}>
    {state.status === "ready" ? (renderDashboard ? <DashboardContent key={state.sessionKey} render={renderDashboard} client={state.client} projects={state.projects} onRefresh={() => { if (currentSession.current) void refreshDashboard(currentSession.current, true); }} onSignOut={() => { void signOut(); }} /> : <ClientDashboard key={state.sessionKey} client={state.client} projects={state.projects} onRefresh={() => { if (currentSession.current) void refreshDashboard(currentSession.current, true); }} onSignOut={() => { void signOut(); }} />) : <div className={styles.loginLayout}>
      <section className={styles.welcome} aria-labelledby="client-welcome-title">
        <div className={styles.brand}><Brand name={content?.site.name ?? "Taylor Made Creations"} logo={getTemplateImage(content, "site.logo")} /></div>
        <div className={styles.welcomeCopy}><p className={styles.eyebrow}>YOUR CHARACTER. YOUR HUB.</p><h1 id="client-welcome-title">Dreams brought<br />to life.</h1><p>Your private space for commission details and updates</p></div>
        <div className={styles.welcomeFooter}><SpadeMark /><span>Made for your character</span></div>
      </section>
      <section className={styles.loginCard} aria-labelledby="client-signin-title">
        <p className={styles.eyebrow}>CLIENT HUB</p><h2 id="client-signin-title">{state.status === "error" ? "Let’s get you connected." : "Welcome back."}</h2>
        {state.status === "checking" || state.status === "signing-out" ? <div className={styles.loading} role="status" aria-live="polite"><span className={styles.loadingDot} aria-hidden="true" /><p>{state.status === "signing-out" ? "Signing out and locking your hub…" : "Checking your client sign-in…"}</p></div> : state.status === "error" ? <>
          <p className={styles.alert} role="alert">{state.message}</p>
          <div className={styles.recoveryActions}>{state.expired ? <button className={styles.primary} type="button" onClick={() => { void signOut(); }}>Sign out to enter a new code</button> : <button className={styles.primary} type="button" onClick={retry}>{state.retry === "signout" ? "Try signing out again" : "Try again"}</button>}{state.retry === "dashboard" && !state.expired && <button className={styles.secondary} type="button" onClick={() => { void signOut(); }}>Sign out</button>}</div>
          <p className={styles.hint}>Your private commission details are still hidden. <a href={CLIENT_HUB_CONTACT_HREF}>Contact Taylor</a> if you need a hand.</p>
        </> : <>
          <p className={styles.loginIntro}>Enter your client code that was shared with you. No email or password needed.</p>
          <form className={styles.loginForm} onKeyDown={event => { if (event.key === "Enter" && (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.keyCode === 229)) event.preventDefault(); }} onSubmit={signIn} aria-busy={busy}>
            <label id="client-code-label" className={styles.codeLabel} htmlFor="client-signin-code">Client sign-in code</label>
            <div className={codeStyles.control}><SignInCodeFields inputRef={codeInput} value={code} onChange={value => { setCode(value); if (loginError) setLoginError(""); }} show={showCode} disabled={busy} invalid={!!loginError} describedBy={`client-code-help${loginError ? " client-code-error" : ""}`} /><button className={codeStyles.reveal} type="button" aria-label={showCode ? "Hide sign-in code" : "Show sign-in code"} aria-pressed={showCode} disabled={busy} onClick={() => setShowCode(value => !value)}>{showCode ? "Hide" : "Show"}</button></div>
            <p className={styles.hint} id="client-code-help">Use your client code</p>
            {loginError && <p id="client-code-error" className={styles.alert} role="alert">{loginError} <Link href="/client-hub/request-code">If you need assistance click here</Link></p>}
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Signing in…" : "Enter the studio"}<span aria-hidden="true">→</span></button>
          </form>
          <p className={styles.signInHelp}>Missing your code? <Link href="/client-hub/request-code">Request a new one here.</Link></p>
          <p className={styles.sessionHint}>Your sign-in stays in this browser tab. Sign out when you’re finished on a shared device. Do not share your code with anyone.</p>
        </>}
      </section>
    </div>}
  </div>;
}

export default ClientHub;
