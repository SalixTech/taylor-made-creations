"use client";

import { useState, type ReactNode } from "react";
import { OwnerSelect, Field } from "./OwnerFields";
import buttons from "./OwnerButton.module.css";
import styles from "./OwnerLayoutLayers.module.css";

export type LayoutLayerRow = { id: string; label: string; parentId: string | null; movable: boolean; container: boolean };
type Props = {
  scopeLabel: "Page content" | "Header & footer";
  rows: readonly LayoutLayerRow[];
  selectedId: string | null;
  disabled?: boolean;
  canMove: (id: string, parentId: string | null) => boolean;
  onRename?: (id:string,label:string)=>void;
  onSelect: (id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
};

/** Friendly names only: persisted instance identities stay an implementation detail. */
export function OwnerLayoutLayers({ scopeLabel, rows, selectedId, disabled = false, canMove, onSelect, onMove, onRename }: Props) {
  const [destinationChoice, setDestinationChoice] = useState<{selectedId:string|null;scope:string;value:string}|null>(null);
  const destination=destinationChoice?.selectedId===selectedId&&destinationChoice.scope===scopeLabel?destinationChoice.value:"";
  const selected = rows.find(row => row.id === selectedId);
  const [nameDraft,setNameDraft]=useState<{id:string;original:string;value:string}|null>(null);
  const name=selected&&nameDraft?.id===selected.id&&nameDraft.original===selected.label?nameDraft.value:selected?.label??"";
  const candidates = selected?.movable ? rows.filter(row => row.container && row.id !== selected.id && canMove(selected.id, row.id)) : [];
  const parent = selected?.parentId ? rows.find(row => row.id === selected.parentId) : null;
  const renderRows = (parentId: string | null, ancestors = new Set<string>()): ReactNode => rows.filter(row => row.parentId === parentId).map(row => {
    if (ancestors.has(row.id)) return null;
    return <li key={row.id}><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={row.id === selectedId} disabled={disabled} onClick={() => { if (!disabled) onSelect(row.id); }}>{row.label}</button>{rows.some(child => child.parentId === row.id) && <ul>{renderRows(row.id, new Set([...ancestors, row.id]))}</ul>}</li>;
  });
  return <details className={styles.layers}><summary>Layers · {scopeLabel}</summary>
    <p>Choose a piece to see which box it belongs to.</p>
    <ul className={styles.tree} aria-label={`${scopeLabel} layers`}>{renderRows(null)}</ul>
    {selected && <div className={styles.actions}>
      {onRename&&<><Field label="Content box name" value={name} onChange={value=>{if(!disabled)setNameDraft({id:selected.id,original:selected.label,value});}} /><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled||!name.trim()||name.trim().length>120||name.trim()===selected.label} onClick={()=>{if(!disabled&&name.trim()&&name.trim().length<=120)onRename(selected.id,name.trim());}}>Rename box</button></>}
      <p><strong>{selected.label}</strong> · Inside {parent?.label ?? scopeLabel}</p>
      {selected.movable ? <>
        <fieldset disabled={disabled} className={styles.destination}><OwnerSelect label="Move into box" placeholder="Choose a box…" value={candidates.some(row => row.id === destination) ? destination : ""} options={candidates.map(row => ({ value: row.id, label: row.label }))} onChange={value => { if (!disabled) setDestinationChoice({selectedId,scope:scopeLabel,value}); }} /></fieldset>
        <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled || !destination || !candidates.some(row => row.id === destination)} onClick={() => { if (!disabled && selected && candidates.some(row => row.id === destination) && canMove(selected.id, destination)) onMove(selected.id, destination); }}>Move into box</button>
        <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled || selected.parentId === null || !canMove(selected.id, null)} onClick={() => { if (!disabled && canMove(selected.id, null)) onMove(selected.id, null); }}>Move to canvas</button>
      </> : <span>This functional piece stays together with its containing card.</span>}
      <small>Moving into a box keeps the piece where it is. Undo brings it back.</small>
    </div>}
  </details>;
}
