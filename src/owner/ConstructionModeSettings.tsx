"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OwnerStore } from "./storage";
import type { SiteAccess } from "./site-access";
import { Card, Dialog, Toggle } from "./OwnerFields";
import { notifyPublicSitePublished } from "@/components/PublicSiteContext";
import ui from "./OwnerPortal.module.css";
import buttons from "./OwnerButton.module.css";
import styles from "./ConstructionModeSettings.module.css";

type Props = { store: OwnerStore; disabled: boolean; beginUpdate: () => boolean; endUpdate: () => void };
/** This setting is deliberately separate from the editable draft and Publish live. */
export function ConstructionModeSettings({ store, disabled, beginUpdate, endUpdate }: Props) {
  const [live, setLive] = useState<SiteAccess | null>(null);
  const [selected, setSelected] = useState(true);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ constructionMode: boolean; revision: number } | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const reading = useRef<number | null>(null);
  const writing = useRef(false);
  const latest = useRef<SiteAccess | null>(null);
  const available = !!store.readLiveSiteAccess && !!store.updateConstructionMode;

  const check = useCallback(async () => {
    if (!store.readLiveSiteAccess || reading.current !== null || writing.current) return;
    const sequence = ++request.current;
    reading.current = sequence;
    setChecking(true);
    try {
      const next = await store.readLiveSiteAccess();
      if (!mounted.current || sequence !== request.current) return;
      const previous = latest.current;
      if (previous && next.revision < previous.revision) throw new Error("Construction Mode returned an older setting. Check again before updating it.");
      latest.current = next; setLive(next); setError(null);
      // A focus check never silently discards a staged choice.
      setSelected(value => previous === null || value === previous.constructionMode ? next.constructionMode : value);
    } catch (cause) {
      if (mounted.current && sequence === request.current) {
        setLive(null);
        setError(cause instanceof Error ? cause.message : "Construction Mode could not be checked. No setting was changed.");
      }
    } finally {
      if (reading.current === sequence) reading.current = null;
      if (mounted.current && sequence === request.current) setChecking(false);
    }
  }, [store]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const generation = request;
    // Start after the effect is installed, so Strict Mode's discarded mount
    // cannot leave an abandoned in-flight check or synchronously set state.
    void Promise.resolve().then(() => { if (active) void check(); });
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; mounted.current = false; ++generation.current; reading.current = null; window.removeEventListener("focus", onFocus); };
  }, [check]);

  async function update() {
    const change = confirmation;
    if (!change || !store.updateConstructionMode || writing.current || disabled || !beginUpdate()) return;
    writing.current = true; ++request.current;
    setChecking(false); setSaving(true); setError(null); setNotice(null); setConfirmation(null);
    try {
      const saved = await store.updateConstructionMode(change.constructionMode, change.revision);
      if (!mounted.current) return;
      latest.current = saved; setLive(saved); setSelected(saved.constructionMode);
      setNotice(saved.constructionMode
        ? "Construction Mode is on. Visitors will see the construction page. Your draft and published content are unchanged."
        : "Construction Mode is off. Visitors can access the already-published website. Your private draft was not published.");
      notifyPublicSitePublished();
    } catch (cause) {
      if (mounted.current) {
        // An uncertain acknowledgement must be read back, never blindly replayed.
        setLive(null);
        setError(cause instanceof Error ? cause.message : "The update was not confirmed. Check the live setting again before retrying.");
      }
    } finally {
      writing.current = false;
      endUpdate();
      if (mounted.current) setSaving(false);
    }
  }

  const blocked = disabled || saving || checking || !live || !available;
  return <Card title="Construction Mode">
    <div className={styles.content}>
      <p className={ui.help}>Live Construction Mode: <strong>{!available ? "Not connected" : checking ? "Checking…" : live ? live.constructionMode ? "On" : "Off" : "Could not check"}</strong>.</p>
      <div className={styles.controls}>
        <fieldset disabled={blocked} className={styles.setting}>
          <Toggle label="Construction Mode" checked={selected} onChange={value => { if (!blocked) { setSelected(value); setNotice(null); } }} hint="On shows the construction page. Off opens the published website. Use Update live to apply." />
        </fieldset>
        <div className={styles.actions}>
          <button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={blocked || selected === live?.constructionMode} aria-busy={saving} onClick={() => {
            if (!blocked && live && selected !== live.constructionMode) setConfirmation({ constructionMode: selected, revision: live.revision });
          }}>{saving ? "Updating live…" : "Update live"}</button>
          {available && <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={disabled || checking || saving} onClick={() => { void check(); }}>Check again</button>}
        </div>
      </div>
      <p className={ui.help}>Update live changes only this setting. It does not save or publish your draft.</p>
      {!available && <p className={ui.help}>Live Construction Mode controls are not connected in this workspace.</p>}
      {error && <p className={ui.error} role="alert">{error}</p>}
      {notice && <p className={ui.help} role="status">{notice}</p>}
      <p className={ui.help}>Visible visitor tabs check about every 30 seconds or on focus. Downloads, public image links and cached copies cannot be recalled.</p>
    </div>
    {confirmation && <Dialog title={confirmation.constructionMode ? "Turn Construction Mode on?" : "Open the published website to visitors?"} onClose={() => setConfirmation(null)} actions={<>
      <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={() => setConfirmation(null)}>Cancel</button>
      <button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={disabled || saving} onClick={() => { void update(); }}>Update live</button>
    </>}><p>{confirmation.constructionMode
      ? "Visitors will see the construction page instead of your published website. This does not delete your publication or erase previously downloaded content and public assets. Your private drafts stay unchanged."
      : "Turning Construction Mode off allows anyone to read your already-published pages. A valid published website must exist first. This does not publish any private draft edits. Open the public website now?"}</p></Dialog>}
  </Card>;
}
