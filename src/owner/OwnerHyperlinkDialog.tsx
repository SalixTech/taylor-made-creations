"use client";
import {useState} from 'react';
import {Dialog,Field} from './OwnerFields';
import {WebsiteAssetPicker} from './WebsiteAssetPicker';
import buttons from './OwnerButton.module.css';
import {isSafeLink} from './model';
/** A destination editor never inserts text or navigates the editor canvas. */
export function OwnerHyperlinkDialog({href,disabled,onApply,onClose,canRemove=true,removeLabel="Remove link",targetId="hyperlink",allowDocument=true,revision}:{revision?:object;targetId?:string;allowDocument?:boolean;canRemove?:boolean;removeLabel?:string;href:string;disabled:boolean;onApply:(href:string|null)=>boolean;onClose:()=>void}){
 const [destination,setDestination]=useState(href),[error,setError]=useState('');
 function apply(value:string|null){
  if(disabled)return;
  const normalized=value===null?null:value.trim();
  if(normalized!==null&&!isSafeLink(normalized)){setError('Use a safe site path, HTTPS address, email link or section anchor.');return;}
  if(!onApply(normalized))setError('The selected item or draft changed. Close these controls and select it again; nothing was changed.');
 }
 return <Dialog title="Hyperlink destination" dismissDisabled={disabled} onClose={onClose} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled} onClick={onClose}>Cancel</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled||!href||!canRemove} onClick={()=>apply(null)}>{removeLabel}</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={disabled} onClick={()=>apply(destination)}>Apply link</button></>}>
  <p>This edits the selected item’s destination. If it is already inside a link, that existing destination is updated.</p>
  <fieldset disabled={disabled}><Field label="Link destination" value={destination} onChange={setDestination} hint="https://example.com, /contact, mailto:name@example.com or #section"/></fieldset>
  {allowDocument&&!disabled&&<WebsiteAssetPicker key={targetId} targetId={targetId} revision={revision} kind="document" value={destination} onSelect={value=>{setDestination(value);setError("");}}/>}
  {error&&<p role="alert">{error}</p>}
 </Dialog>;
}
