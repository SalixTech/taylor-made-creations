"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendPublicIntake } from "./client";
import styles from "./Intake.module.css";
export function CodeRecovery() {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState(false);
  const active = useRef(true), pending = useRef(false), operation = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError("");
    const values = { name: name.trim(), email: email.trim(), message: message.trim(), website }, fingerprint = JSON.stringify(values);
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    try { await sendPublicIntake("tmcHubRequestCode", { ...values, operationId: operation.current.id }); if (active.current) { setSent(true); setName(""); setEmail(""); setMessage(""); } }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Your request could not be confirmed. Please try again."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className={styles.page} aria-label="Request a client code"><section className={styles.card}><Link className={styles.backLink} href="/client-hub">← Back to the studio</Link><span className="tmc-spade-mark" aria-hidden="true" /><header className={styles.heading}><h1>Need a helping paw?</h1><p>Request a new client code.</p></header>{sent ? <div role="status"><h2>Request saved</h2><p>Taylor will review your request and verify your details before arranging access. No code is displayed or automatically emailed here.</p></div> : <form className={styles.form} onSubmit={event => void submit(event)}><fieldset disabled={busy}><label>Your name<input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label><label>Contact email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Information that helps identify your commission<textarea maxLength={2000} rows={4} value={message} onChange={event => setMessage(event.target.value)} /></label><label className={styles.honeypot} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label><p>Do not include your old code or any passwords. Commission ownership must be verified before resetting access.</p><button className="button" type="submit">{busy ? "Saving request…" : "Request a new code"}</button></fieldset>{error && <p role="alert">{error}</p>}</form>}</section></section>;
}
