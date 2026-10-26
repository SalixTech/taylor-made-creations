"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore/lite";
import { OWNER_CLOUD_DOCUMENT } from "./firebase-store";
import { responseObject, serviceReadError, taylorOwnerSession } from "./taylor-services-client";
import styles from "./TaylorServices.module.css";

type Check = { label: string; detail: string; tone: "good" | "waiting" | "unknown" };
type Checks = { auth: Check; database: Check; email: Check; files: Check };
const unchecked: Checks = {
  files: { label: "Not checked", detail: "Upload storage has not been checked yet.", tone: "unknown" },
  auth: { label: "Not checked", detail: "Your owner session has not been checked here yet.", tone: "unknown" },
  database: { label: "Not checked", detail: "A fresh cloud read has not completed yet.", tone: "unknown" },
  email: { label: "Not checked", detail: "Email configuration has not been checked yet.", tone: "unknown" },
};

export function TaylorServices({ compact = false }: { compact?: boolean }) {
  const [checks, setChecks] = useState<Checks>(unchecked);
  const [busy, setBusy] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const active = useRef(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const session = await taylorOwnerSession();
      const [server, database] = await Promise.allSettled([
        fetch("/api/taylor/services", { headers: { "Authorization": `Bearer ${session.token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) }).then(responseObject),
        getDoc(doc(session.db, OWNER_CLOUD_DOCUMENT)),
      ]);
      session.assertCurrent();
      if (!active.current) return;
      const next: Checks = {
        files: { label: "Could not check", detail: "Upload storage configuration could not be checked.", tone: "unknown" },
        auth: { label: "Could not verify", detail: server.status === "rejected" ? serviceReadError(server.reason, "Owner verification") : "The server did not confirm this session.", tone: "unknown" },
        database: database.status === "fulfilled"
          ? { label: "Read confirmed", detail: database.value.exists() ? "A fresh read of your private Firestore workspace succeeded." : "Firestore accepted a fresh owner read. No saved workspace document exists yet.", tone: "good" }
          : { label: "Not connected", detail: serviceReadError(database.reason, "Cloud workspace"), tone: "unknown" },
        email: { label: "Could not check", detail: "Email setup could not be verified. No test email was sent.", tone: "unknown" },
      };
      if (server.status === "fulfilled" && server.value.auth === "verified") {
        next.files = server.value.files === "development-disk"
          ? { label: "Local uploads configured", detail: "Photos save in a private folder on the computer running this development site. A successful upload verifies writing. The dedicated home drive and Google Drive backup are not connected yet.", tone: "waiting" }
          : { label: "Storage setup needed", detail: "Development-only uploads are unavailable here. Protected home storage and Google Drive backup still need connecting before deployed uploads can work.", tone: "waiting" };
        next.auth = { label: "Session verified", detail: "The server verified the signature, project, expiry, and owner of your Firebase ID token.", tone: "good" };
        const email = server.value.email;
        if (email && typeof email === "object" && "configured" in email && typeof email.configured === "boolean") next.email = email.configured
          ? { label: "Configured · unverified", detail: "Sender settings are present. Provider availability and inbox delivery have not been verified. This check sends no email.", tone: "waiting" }
          : { label: "Setup needed", detail: "The help recipient is confirmed. Salix still needs to connect the sender and email provider. No email was sent.", tone: "waiting" };
      }
      setChecks(next); setCheckedAt(new Date().toISOString());
    } catch (error) {
      if (active.current) { const detail = serviceReadError(error, "Services"); setChecks({ files: { label: "Not checked", detail: "A current owner session is needed to check upload storage.", tone: "unknown" }, auth: { label: "Could not verify", detail, tone: "unknown" }, database: { label: "Not checked", detail: "A current owner session is needed for a private cloud read.", tone: "unknown" }, email: { label: "Not checked", detail: "Email configuration could not be checked. No email was sent.", tone: "unknown" } }); setCheckedAt(new Date().toISOString()); }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }, []);
  useEffect(() => { active.current = true; void Promise.resolve().then(refresh); return () => { active.current = false; }; }, [refresh]);
  const rows = [
    { name: "Owner sign-in", ...checks.auth }, { name: "Cloud workspace", ...checks.database },
    { name: "File storage", ...checks.files },
    { name: "Help email", ...checks.email },
  ];
  return <section className={styles.card} aria-labelledby={compact ? "service-quick-view-heading" : "service-check-heading"}>
    <div className={styles.heading}><div><h2 id={compact ? "service-quick-view-heading" : "service-check-heading"}>{compact ? "Service quick view" : "Service checks"}</h2><p>What this workspace can confirm right now.</p></div><button className={styles.secondary} type="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check again"}</button></div>
    <div className={compact ? styles.compactGrid : styles.serviceList} aria-busy={busy}>
      {rows.map(row => <div className={styles.service} key={row.name}><div><h3>{row.name}</h3><span className={`${styles.badge} ${styles[row.tone]}`}>{busy ? "Checking…" : row.label}</span></div><p>{row.detail}</p></div>)}
    </div>
    <p className={styles.footnote} role="status">{busy ? "Checking your current session and reading your cloud workspace…" : checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. These are workspace checks, not a provider-wide outage monitor.` : "No checks have completed yet."}</p>
  </section>;
}
