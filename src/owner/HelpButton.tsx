"use client";

import { useOutcomeNotice } from "./use-outcome-notice";

import { useEffect, useRef, useState } from "react";
import { responseObject, serviceReadError, taylorOwnerSession } from "./taylor-services-client";
import styles from "./TaylorServices.module.css";

export type HelpFeedback = { kind: "error" | "success"; message: string };
export function HelpButton({ onFeedback }: { onFeedback?: (feedback: HelpFeedback) => void } = {}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage, messageView] = useOutcomeNotice(failed ? "error" : "success");
  const [acceptedAt, setAcceptedAt] = useState("");
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function askForHelp() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(null); setFailed(false);
    try {
      const session = await taylorOwnerSession();
      if (!mounted.current) return;
      // Keep this ID after an ambiguous network failure: retrying must not resend.
      requestId.current ??= crypto.randomUUID();
      session.assertCurrent();
      const response = await fetch("/api/taylor/help", {
        method: "POST", headers: { "Authorization": `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current }), cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
      const result = await responseObject(response);
      session.assertCurrent();
      if (result.status !== "accepted") throw new Error("The email service did not confirm this request. Please try again.");
      requestId.current = null;
      if (mounted.current) { const message = "Your help email was accepted for sending. Inbox delivery is not yet confirmed."; setMessage(message); setAcceptedAt(new Date().toISOString()); onFeedback?.({ kind: "success", message }); }
    } catch (error) {
      if (mounted.current) { const message = serviceReadError(error, "Help email"); setFailed(true); setMessage(message, true); onFeedback?.({ kind: "error", message }); }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }

  return <div className={styles.help}>
    <button type="button" className={styles.helpButton} onClick={() => void askForHelp()} disabled={busy} aria-describedby="taylor-help-description">
      <span aria-hidden="true">?</span>{busy ? "Asking Salix…" : "Ask Salix For Help"}
    </button>
    <span id="taylor-help-description" className={styles.visuallyHidden}>Sends one email with the subject Taylor Needs Help. No files or customer details are included.</span>
    {!onFeedback && messageView(failed ? styles.error : styles.notice)}
    {!message && acceptedAt && <small>Last help request accepted at {new Date(acceptedAt).toLocaleString()}. Inbox delivery is not confirmed.</small>}
  </div>;
}
