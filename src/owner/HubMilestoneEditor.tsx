"use client";

import { useState, type ReactNode } from "react";
import { type HubMilestone } from "@/client-hub/model";
import { OwnerSelect } from "./OwnerFields";
import { Dialog } from "./OwnerDialog";
import styles from "./HubMilestoneEditor.module.css";
import buttons from "./OwnerButton.module.css";

const lifecycle = ["completed", "shipped", "delivered"];
const options = [{ value: "queued", label: "Not Started" }, { value: "in-progress", label: "In Progress" }, { value: "on-hold", label: "On hold" }, { value: "delayed", label: "Delayed" }];
const secondary = `${buttons.button} ${buttons.secondary}`;

/** Display categories never redefine the completion/shipping/delivery lifecycle. */
export function HubMilestoneEditor({ value, onChange: emitChange, disabled = false, savedIds = [], actions }: { value: HubMilestone[]; onChange: (value: HubMilestone[]) => void; disabled?: boolean; savedIds?: readonly string[]; actions?: ReactNode }) {
  const onChange = (nodes: HubMilestone[]) => emitChange(nodes.map(node => ({ ...node, hidden: false })));
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null), [stageName, setStageName] = useState(""), [stageError, setStageError] = useState("");
  const customStages = [...new Set(value.flatMap(node => node.stageLabel ? [node.stageLabel] : []))];
  const changeStage = (id: string, selection: string) => {
    if (disabled) return;
    onChange(value.map(node => {
      if (node.id !== id) return node;
      if (selection.startsWith("custom:")) return { ...node, ...(lifecycle.includes(node.status) ? { status: "in-progress" as const } : {}), stageLabel: selection.slice(7) };
      const next = { ...node, status: selection as HubMilestone["status"] };
      delete next.stageLabel;
      return next;
    }));
  };
  function remove(id: string) {
    if (disabled || value.length <= 3) return;
    if (savedIds.includes(id)) setRemoveId(id);
    else onChange(value.filter(node => node.id !== id));
  }
  return <fieldset disabled={disabled} className={styles.editor}>
    <p className={styles.hint}>Keep at least three steps, named your way. Editing or removing steps never changes the commission status or file expiry.</p>
    <div className={styles.rows}>{value.map((node, index) => {
      const anchor = lifecycle.includes(node.status);
      return <div className={styles.row} data-lifecycle-anchor={anchor || undefined} key={node.id}>
        <label className={styles.name}><span>Node {index + 1}</span><input aria-label={`Node ${index + 1} name`} maxLength={60} required disabled={disabled} value={node.label} onChange={event => onChange(value.map(item => item.id === node.id ? { ...item, label: event.target.value } : item))} /></label>
        <div className={styles.stage}><OwnerSelect label="Stage" value={node.stageLabel ? `custom:${node.stageLabel}` : node.status} options={[...options, ...lifecycle.map(status => ({ value: status, label: status[0].toUpperCase() + status.slice(1) })), ...customStages.map(label => ({ value: `custom:${label}`, label })), { value: "__create__", label: "+ Add a custom stage" }]} onChange={selection => changeStage(node.id, selection)} inlineCreate={{
          active: creating === node.id, name: stageName, label: "New progress stage", maxLength: 60, busy: disabled, error: stageError,
          onStart: () => { setCreating(node.id); setStageName(""); setStageError(""); },
          onCancel: () => { setCreating(null); setStageName(""); setStageError(""); }, onNameChange: setStageName,
          onSubmit: async () => {
            const name = stageName.trim();
            if (disabled) return false;
            if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) { setStageError("Use a stage name of up to 60 characters."); return false; }
            if ([...options.map(option => option.label), "Completed", "Shipped", "Delivered"].some(label => label.toLowerCase() === name.toLowerCase())) { setStageError("That is already a standard stage. Choose it from the list."); return false; }
            const existing = customStages.find(label => label.toLowerCase() === name.toLowerCase());
            changeStage(node.id, `custom:${existing ?? name}`); setCreating(null); setStageName(""); setStageError(""); return true;
          },
        }} /></div>
        <button type="button" data-owner-button className={`${secondary} ${styles.remove}`} disabled={disabled || value.length <= 3} title={value.length <= 3 ? "Keep at least three milestones" : undefined} aria-label={`Remove ${node.label || "node"}`} onClick={() => remove(node.id)}>Remove</button>
      </div>;
    })}</div>
    <div className={styles.actions}><button type="button" data-owner-button className={`${secondary} ${styles.add}`} disabled={disabled} onClick={() => onChange([...value, { id: crypto.randomUUID(), label: "New milestone", status: "in-progress" }])}>Add milestone</button>{actions}</div>
    {removeId && <Dialog title="Remove this milestone?" onClose={() => setRemoveId(null)} actions={<><button type="button" data-owner-button className={secondary} onClick={() => setRemoveId(null)}>Keep milestone</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.danger}`} onClick={() => { if (!disabled && value.length > 3) onChange(value.filter(node => node.id !== removeId)); setRemoveId(null); }}>Remove milestone</button></>}><p>Remove <strong>{value.find(node => node.id === removeId)?.label || "this saved milestone"}</strong> from this list? The change takes effect when you save.</p></Dialog>}
  </fieldset>;
}
