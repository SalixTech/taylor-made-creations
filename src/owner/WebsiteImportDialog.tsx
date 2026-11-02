"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog} from './OwnerDialog';
import type {WebsiteImportReview} from './website-transfer-client';
import type {OwnerContent} from './model';
import buttons from './OwnerButton.module.css';

type Props={scope?:'design'|'gallery';onClose:()=>void;onStage:(content:OwnerContent|null)=>void;acquireLock:()=>()=>void};
export function WebsiteImportDialog({onClose,onStage,acquireLock,scope='design'}:Props){
 const gallery=scope==='gallery';
 const[review,setReview]=useState<WebsiteImportReview|null>(null),[busy,setBusy]=useState(false),[copying,setCopying]=useState(false),[error,setError]=useState('');
 const mounted=useRef(false),request=useRef(0),abort=useRef<AbortController|null>(null),running=useRef(false);
 useEffect(()=>{const requests=request,controller=abort;mounted.current=true;return()=>{mounted.current=false;requests.current++;controller.current?.abort();};},[]);
 async function run(copy:boolean){if(running.current)return;running.current=true;const id=++request.current,controller=new AbortController();abort.current=controller;setBusy(true);setCopying(copy);setError('');let release:(()=>void)|undefined;
  try{if(copy){if(!review)throw Error('Review the main design first.');release=acquireLock();const next=await review.complete(controller.signal);if(!mounted.current||id!==request.current)return;release();release=undefined;onStage(next);onClose();}
   else{const {reviewMainWebsiteImport}=await import('./website-transfer-client');const result=await reviewMainWebsiteImport(controller.signal,scope);if(mounted.current&&id===request.current)setReview(result);}
  }catch(cause){if(mounted.current&&id===request.current)setError(cause instanceof Error?cause.message:'The design copy could not be confirmed. Your draft has not been replaced.');}
  finally{release?.();if(mounted.current&&id===request.current){running.current=false;setBusy(false);setCopying(false);}}
 }
 return <Dialog title={gallery?"Refresh gallery from Live":"Copy the main design into beta"} dismissDisabled={copying} onClose={()=>{if(copying)return;abort.current?.abort();onClose();}} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={copying} onClick={onClose}>Cancel</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={busy} onClick={()=>void run(!!review)}>{busy?copying?'Copying website assets…':'Reviewing main design…':review?(gallery?(review.noPublication?'Keep Builder gallery and prepare publishing':'Refresh gallery and prepare publishing'):'Copy into this beta draft'):(gallery?'Review Live gallery':'Review main published design')}</button></>}>
  {gallery?<><p>Before preparing this publication, refresh the gallery photos, their order and numbering from the current Live website. Only the gallery and its number visibility setting will be replaced; your other unsaved design edits stay intact.</p><p>Review first, then continue to copy the photos into private Beta storage, save your draft and prepare the existing publication review. This does not publish. The final review still requires your confirmation.</p></>:<><p>This copies the main website’s published design and its website images, fonts and PDFs into private beta storage. It does not copy clients, invoices or private files, and it never changes the main website.</p>
  <p>Your current beta edits will be replaced in the editor, with Undo available. Save draft keeps the copy; Publish to beta updates the protected beta preview only.</p></>}
  {review?.noPublication&&<p><strong>No Live gallery exists yet.</strong> Continue keeps your current Builder gallery and numbering unchanged. No photos will be imported. Your draft is then saved for the normal final publication review.</p>}
  {review&&!review.noPublication&&<p>{gallery?'Gallery photos':`${review.pageCount} pages`} · {review.assetCount} website assets · {(review.totalBytes/1024/1024).toFixed(1)} MiB. Main publication revision {review.revision}.</p>}
  <p>Each copied website asset must be 12 MiB or smaller. If any asset cannot be copied, the draft is not replaced; nothing is silently left out.</p>
  {error&&<div role="alert"><button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet}`} aria-label="Dismiss import error" onClick={()=>setError('')}>×</button>{error}</div>}
 </Dialog>;
}
