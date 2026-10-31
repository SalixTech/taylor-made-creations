"use client";
import { useState } from "react";
import { newOwnerId, isSafeButtonArtwork, type OwnerContent } from "./model";
import { BUTTON_PRESETS, parseButtonImport, type ButtonAppearance } from "./button-import";
import { ButtonPresentation, buttonPresentationProps } from "@/components/ButtonPresentation";
import { Field, OwnerSelect } from "./OwnerFields";
import { WebsiteAssetPicker } from "./WebsiteAssetPicker";
import ui from "./OwnerPortal.module.css";
import styles from "./ButtonDesignEditor.module.css";
export function ButtonDesignEditor({content,onEdit,value,onSelect,appearance,onAppearance,targetId="button",label="Button"}:{content:OwnerContent;onEdit:(change:(draft:OwnerContent)=>void)=>void;value?:string;onSelect:(id:string|undefined)=>void;appearance?:ButtonAppearance;onAppearance?:(value:ButtonAppearance|undefined)=>void;targetId?:string;label?:string}) {
 const [name,setName]=useState(""),[message,setMessage]=useState(""),[html,setHtml]=useState('<button class="custom-button">Button</button>'),[css,setCss]=useState('.custom-button { background-color: #800014; color: #ffffff; border-radius: 12px; }'),[preview,setPreview]=useState<ButtonAppearance|null>(null),[error,setError]=useState("");
 const design=content.buttonDesigns?.find(item=>item.id===value);
 const source=appearance??design??{preset:"solid" as const};
 const current:ButtonAppearance={preset:source.preset,...(source.artwork?{artwork:{...source.artwork}}:{}),...(source.imported?{imported:{...source.imported}}:{}),...(source.hover?{hover:{...source.hover}}:{}),...(source.focus?{focus:{...source.focus}}:{})};
 function change(next:ButtonAppearance|undefined){if(!onAppearance)return;onAppearance(next);setMessage("Applied to this draft button.");}
 return <section className={styles.editor} aria-label="Button appearance">
  <OwnerSelect label="Style" value={current.preset} options={BUTTON_PRESETS.map(preset=>({value:preset,label:preset[0].toUpperCase()+preset.slice(1)}))} onChange={preset=>{if(BUTTON_PRESETS.includes(preset as ButtonAppearance["preset"]))change({...current,preset:preset as ButtonAppearance["preset"],imported:undefined,hover:undefined,focus:undefined});}}/>
  <WebsiteAssetPicker key={targetId} targetId={targetId} kind="button" value={current.artwork?.src??""} onSelect={src=>{if(isSafeButtonArtwork(src))change({...current,artwork:{src}});}}/>
  {current.artwork&&<button type="button" className={ui.secondary} onClick={()=>{const next={...current};delete next.artwork;change(next);}}>Remove artwork</button>}
  {appearance&&<button type="button" className={ui.secondary} onClick={()=>change(undefined)}>Reset local style</button>}
  <details><summary>Reusable designs</summary><OwnerSelect label="Use saved design" value={value??""} placeholder="Choose a design" options={[{value:"",label:"Original style"},...(content.buttonDesigns??[]).map(item=>({value:item.id,label:item.name}))]} onChange={id=>{if(id&&!content.buttonDesigns?.some(item=>item.id===id))return;onSelect(id||undefined);setMessage("Selected for this draft button.");}}/>
   <Field label="Save reusable as" value={name} onChange={setName}/><button type="button" className={ui.secondary} disabled={!name.trim()||name.trim().length>100} onClick={()=>{if(!name.trim()||name.trim().length>100)return;const id=newOwnerId("button"),snapshot=structuredClone(current),savedName=name.trim();onEdit(draft=>{draft.buttonDesigns??=[];draft.buttonDesigns.push({...snapshot,id,name:savedName});});setName("");setMessage(`Saved “${savedName}” in reusable designs. This button is unchanged.`);}}>Save reusable design</button>
   {design&&<p className={ui.help}>Local changes affect only this button. Saved “{design.name}” stays unchanged.</p>}
  </details>
  <details><summary>Import button HTML / CSS</summary><p className={ui.help}>One button with text-only spans. Base, hover and focus-visible rules support colors, simple gradients, borders, pixel spacing, type, shadows and short color/shadow transitions. Positioning, SVG, pseudo-elements, animations, URLs and other unsupported code are rejected.</p><Field label="Button HTML" multiline value={html} onChange={value=>{setHtml(value);setPreview(null);}}/><Field label="Button CSS" multiline value={css} onChange={value=>{setCss(value);setPreview(null);}}/><button type="button" className={ui.secondary} onClick={()=>{try{const parsed=parseButtonImport(html,css);setPreview({preset:"solid",imported:parsed.style,...(parsed.hover?{hover:parsed.hover}:{}),...(parsed.focus?{focus:parsed.focus}:{})});setError("");}catch(cause){setPreview(null);setError(cause instanceof Error?cause.message:"This button could not be imported.");}}}>Preview import</button>
   {error&&<p role="alert" className={ui.error}>{error}</p>}{preview&&<div className={styles.preview}><span {...buttonPresentationProps(preview)}><ButtonPresentation appearance={preview}>{label}</ButtonPresentation></span><button type="button" className={ui.secondary} onClick={()=>{change(preview);setPreview(null);}}>Apply to this button</button><small>Your button text and destination stay unchanged.</small></div>}
  </details>{message&&<p role="status" className={styles.status}>{message}</p>}
 </section>;
}
