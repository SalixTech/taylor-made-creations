"use client";
import { useState } from "react";
import { useStudioSettings, saveStudioSettings } from "./use-studio-settings";
import buttons from "./OwnerButton.module.css";
import styles from "./OwnerClientHub.module.css";
export function LabelCatalogEditor({ onAdded }: { onAdded:(tag:string)=>void }) {
 const preferences=useStudioSettings(),[name,setName]=useState(""),[error,setError]=useState("");
 const catalog=preferences.settings?.customLabelCatalog??[];
 async function add(){const text=name.trim();if(!text||text.length>60||/[\x00-\x1f\x7f]/.test(text)){setError("Use a label of 1–60 characters.");return;}const tag=`custom:${text}`;const saved=await saveStudioSettings({customLabelCatalog:[...new Set([...catalog,tag])]});if(saved){setName("");setError("");onAdded(tag);}}
 return <section className={styles.labelCatalog} aria-label="Saved custom labels"><h3>Saved labels</h3><p className={styles.hint}>Available for every commission. Deleting a saved label only removes it from future choices; existing cards and history keep it.</p><div className={styles.customLabelRow}><input aria-label="New saved label" maxLength={60} value={name} disabled={preferences.busy} onChange={event=>{setName(event.target.value);setError("");}} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();if(!preferences.busy)void add();}}}/><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={preferences.busy||!preferences.settings||!name.trim()} onClick={()=>void add()}>Add label</button></div>{error&&<p role="alert">{error}</p>}<ul>{catalog.map(tag=><li key={tag}><span>{tag.slice(7)}</span><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={preferences.busy} aria-label={`Delete saved label ${tag.slice(7)}`} onClick={()=>void saveStudioSettings({customLabelCatalog:catalog.filter(value=>value!==tag)})}>Delete</button></li>)}</ul></section>;
}
