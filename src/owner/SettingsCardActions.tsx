"use client";
import { useRef, useState } from "react";
import type { SettingsCardId } from "./settings-cards";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerTemplateManagers.module.css";
export type SettingsCardSaveProps = {
  canSaveSettingsDraft?: boolean;
  canSaveSettingsLive?: boolean;
  onSaveSettingsCard?: (card: SettingsCardId, mode: "draft" | "live") => Promise<boolean>;
};
export function SettingsCardActions({ card, canSaveSettingsDraft = false, canSaveSettingsLive = false, onSaveSettingsCard }: SettingsCardSaveProps & { card: SettingsCardId }) {
  const locked = useRef(false);
  const [busy, setBusy] = useState<"draft" | "live" | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(mode: "draft" | "live") {
    if (locked.current || !onSaveSettingsCard || !(mode === "draft" ? canSaveSettingsDraft : canSaveSettingsLive)) return;
    locked.current = true; setBusy(mode); setMessage(""); setFailed(false);
    try {
      if (await onSaveSettingsCard(card, mode)) setMessage(mode === "draft" ? "This card is saved privately." : "This card is saved live.");
      else { setMessage("This card was not saved. Your edits are still here."); setFailed(true); }
    } catch { setMessage("Could not save this card. Your edits are still here. Please try again."); setFailed(true); }
    finally { locked.current = false; setBusy(null); }
  }
  return <div className={styles.settingsSave}>
    <div className={styles.settingsSaveButtons}><button type="button" className={ui.secondary} disabled={!canSaveSettingsDraft || !onSaveSettingsCard || busy !== null} onClick={() => void save("draft")}>{busy === "draft" ? "Saving draft…" : "Save Draft"}</button><button type="button" className={ui.primary} disabled={!canSaveSettingsLive || !onSaveSettingsCard || busy !== null} onClick={() => void save("live")}>{busy === "live" ? "Saving live…" : "Save Live"}</button></div>
    {message && <p className={failed ? ui.error : ui.help} role={failed ? "alert" : "status"}>{message}</p>}
  </div>;
}
