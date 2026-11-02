"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {PhotoGalleryManager} from "./OwnerTemplateManagers";
import {PublicationReview} from "./PublicationReview";
import {Dialog} from "./OwnerDialog";
import type {OwnerContent,OwnerWorkspace} from "./model";
import type {OwnerStore} from "./storage";
import buttons from "./OwnerButton.module.css";

/** Gallery requests must never checkpoint unrelated unsaved Hub fields. */
export function gallerySaveCandidate(saved:OwnerContent,edited:OwnerContent):OwnerContent{
 const next=structuredClone(saved);next.gallery=structuredClone(edited.gallery);return next;
}
export function HubGalleryManager({content,workspace,store,disabled,onEdit,onRemove,onBegin,onEnd,onSaved}:{content:OwnerContent;workspace:OwnerWorkspace;store:OwnerStore;disabled:boolean;onEdit:(change:(draft:OwnerContent)=>void)=>void;onRemove:(title:string,description:string,onConfirm:()=>void)=>void;onBegin:()=>boolean;onEnd:()=>void;onSaved:(saved:OwnerWorkspace,published:boolean)=>void}){
 const [choice,setChoice]=useState(false),[review,setReview]=useState<{content:OwnerContent;revision:number;host:HTMLElement}|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const alive=useRef(true),locked=useRef(false),editorRef=useRef<HTMLFieldSetElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function finish(){locked.current=false;onEnd();}
 async function save(){
  if(locked.current||disabled||!onBegin())return;
  locked.current=true;setSaving(true);setError("");
  try{const saved=await store.saveDraft(gallerySaveCandidate(workspace.draft,content),workspace.revision);if(!alive.current)return;onSaved(saved,false);setChoice(false);}
  catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:"Gallery save was not confirmed. Your edits remain here.");}
  finally{if(alive.current){setSaving(false);finish();}}
 }
 function openReview(){
  if(locked.current||disabled||!store.publishSelected||!store.readPublication)return;
  const host=editorRef.current?.closest<HTMLElement>("[data-owner-portal]");
  if(!host||host.closest("fieldset[disabled]")){setError("The gallery review could not open safely. Close this dialog and reopen Photos.");return;}
  if(!onBegin())return;
  locked.current=true;setError("");setChoice(false);setReview({content:gallerySaveCandidate(workspace.draft,content),revision:workspace.revision,host});
 }
 const secondary=`${buttons.button} ${buttons.secondary}`,primary=`${buttons.button} ${buttons.primary}`;
 return <>
  <fieldset ref={editorRef} disabled={disabled||saving||!!review} style={{border:0,padding:0,margin:0,minWidth:0}} aria-label="Gallery photo management">
   <PhotoGalleryManager content={content} onEdit={change=>{if(!disabled&&!locked.current)onEdit(change);}} onRemove={onRemove} onSavePhotos={()=>{if(!disabled&&!locked.current){setError("");setChoice(true);}}}/>
  </fieldset>
  {choice&&<Dialog title="Save gallery photos" dismissDisabled={saving} onClose={()=>{if(!locked.current)setChoice(false);}} actions={<><button type="button" data-owner-button className={secondary} disabled={saving} onClick={()=>setChoice(false)}>Keep editing</button><button type="button" data-owner-button className={secondary} disabled={disabled||saving} onClick={()=>void save()}>Save gallery draft</button><button type="button" data-owner-button className={primary} disabled={disabled||saving||!store.publishSelected||!store.readPublication} onClick={openReview}>Review gallery changes…</button></>}><p>Save only these photos privately, or review the photo changes before publishing them to the main website. Other unsaved Hub edits and the separate gallery-number display setting are not included.</p>{error&&<p role="alert">{error}</p>}</Dialog>}
  {review&&createPortal(<PublicationReview galleryOnly content={review.content} expectedRevision={review.revision} store={store} onBusyChange={()=>{}} onClose={()=>{setReview(null);finish();}} onPublished={saved=>{if(!alive.current)return;onSaved(saved,true);setReview(null);finish();}}/>,review.host)}
 </>;
}
