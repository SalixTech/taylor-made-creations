"use client";
import { useEffect, useRef, useState } from "react";
import { getPayPalInvoiceSettings, savePayPalInvoiceSettings, type InvoiceBusinessSettings as Settings } from "./paypal-client";
import ui from "./OwnerPortal.module.css";

/** Invoice policy is a private operational setting, never a website publication. */
export function InvoiceBusinessSettings({ onDirtyChange, onBusyChange }: { onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const [saved, setSaved] = useState<Settings | null>(null), [percent, setPercent] = useState("40"), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const active = useRef(true), pending = useRef(false), generation = useRef(0);
  const dirty = !!saved && percent !== String(saved.depositPercent);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(saving || uncertain); return () => onBusyChange?.(false); }, [saving, uncertain, onBusyChange]);
  useEffect(() => { active.current = true; const request = ++generation.current; pending.current = true;
    void getPayPalInvoiceSettings().then(value => { if (active.current && request === generation.current) { setSaved(value); setPercent(String(value.depositPercent)); } }).catch(cause => { if (active.current && request === generation.current) setError(cause instanceof Error ? cause.message : "Invoice settings could not be loaded."); }).finally(() => { if (request === generation.current) { pending.current = false; if (active.current) setLoading(false); } });
    return () => { active.current = false; };
  }, []);
  async function reload() {
    if (pending.current || (dirty && !window.confirm("Reload the saved deposit setting and discard your unsaved percentage?"))) return;
    pending.current = true; setLoading(true); setNotice("");
    try { const value = await getPayPalInvoiceSettings(); if (!active.current) return; setSaved(value); setPercent(String(value.depositPercent)); setUncertain(false); onBusyChange?.(false); setError(""); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Invoice settings could not be loaded. Your entered percentage is still here."); }
    finally { pending.current = false; if (active.current) setLoading(false); }
  }
  async function save() {
    const value = Number(percent);
    if (pending.current || !saved || uncertain || !dirty || !/^\d+$/.test(percent) || !Number.isInteger(value) || value < 1 || value > 100) return;
    if (!window.confirm(`Set the standard deposit to ${value}% for new payment-plan invoices? Existing invoices and payment plans will not change.`)) return;
    pending.current = true; setSaving(true); onBusyChange?.(true); setError(""); setNotice("");
    try { const next = await savePayPalInvoiceSettings({ expectedVersion: saved.version, depositPercent: value, confirmed: true }); if (!active.current) return; setSaved(next); setPercent(String(next.depositPercent)); setUncertain(false); onBusyChange?.(false); setNotice("Invoice setting saved. Existing invoices and payment plans are unchanged."); }
    catch (cause) { if (active.current) { setUncertain(true); setError(`${cause instanceof Error ? cause.message : "The save was not confirmed."} Reload the saved setting before trying again. Your entered percentage is still here.`); } }
    finally { pending.current = false; if (active.current) setSaving(false); }
  }
  const valid = /^\d+$/.test(percent) && Number(percent) >= 1 && Number(percent) <= 100;
  return <section aria-labelledby="invoice-business-settings-title"><h3 id="invoice-business-settings-title">Invoice deposit policy</h3><p className={ui.help}>Applies only to new payment-plan invoices. Existing invoices keep their agreed amounts and dates. An explicit override is still available for an individual new invoice.</p><label>Standard deposit (%)<input type="number" inputMode="numeric" min="1" max="100" step="1" value={percent} disabled={loading || saving || uncertain || !saved} onChange={event => { setPercent(event.target.value); setNotice(""); }} /></label><p className={ui.help}>This saves a private invoice setting—not your website draft or a live website publication. PayPal does not automatically charge or enforce the complete installment schedule.</p><div className={ui.inlineActions}><button type="button" className={ui.secondary} disabled={loading || saving} onClick={() => void reload()}>{loading ? "Loading invoice settings…" : "Reload saved setting"}</button><button type="button" className={ui.secondary} disabled={loading || saving || uncertain || !dirty || !valid} onClick={() => void save()}>{saving ? "Saving invoice setting…" : "Save invoice setting"}</button></div>{error && <div role="alert"><p>{error}</p><button type="button" className={ui.secondary} aria-label="Dismiss invoice settings error" onClick={() => setError("")}>×</button></div>}{notice && <p role="status">{notice}</p>}</section>;
}
