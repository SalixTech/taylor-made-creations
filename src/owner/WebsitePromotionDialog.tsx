"use client";
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {Dialog} from "./OwnerDialog";
import {SiteContentFrame} from "@/components/SiteContent";
import {publicContentToOwnerContent} from "./model";
import {createWebsitePromotionController,type WebsitePromotionController,type WebsitePromotionState,type WebsitePromotionRequest} from "./website-promotion-client";
import type {RecoverySession} from "./draft-recovery";
import buttons from "./OwnerButton.module.css";
import styles from "./WebsitePromotionDialog.module.css";

type Action=()=>void|Promise<void>;
export interface WebsitePromotionReviewProps {
 state:WebsitePromotionState;
 onPrepare:Action;
 onStage:Action;
 onCommit:(confirmation:{reviewDigest:string;confirmLive:true})=>void|Promise<void>;
 onResolve:Action;
 onRetry:Action;
 onCancel:Action;
 onClose:()=>void;
}
const terminal=new Set(["committed","cancelled","locked"]);
/** Review only server-derived public projection, retaining beta IDs for private media. */
export function WebsitePromotionReview(props:WebsitePromotionReviewProps){
 const {state}=props,latest=useRef(props);useLayoutEffect(()=>{latest.current=props;},[props]);
 const mounted=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const running=useRef(false),[localBusy,setLocalBusy]=useState(false),[localError,setLocalError]=useState("");
 const [pageId,setPageId]=useState("");
 const preview=useMemo(()=>{if(!state.reviewContent||state.phase==="locked")return null;try{return publicContentToOwnerContent(state.reviewContent);}catch{return null;}},[state.reviewContent,state.phase]);
 const pages=preview?.pages.filter(page=>page.availability!=="hidden"&&!page.trashedAt&&page.builtinKey!=="client-hub")??[];
 const page=pages.find(item=>item.id===pageId)??pages[0];
 const locked=state.phase==="locked",unknown=state.phase==="unknown",busy=state.busy||localBusy;
 const dismissBlocked=busy||unknown||state.phase==="confirming"||state.phase==="resolving";
 const ready=state.phase==="ready"&&!!preview&&!!page&&!!state.promotion;
 async function run(action:Action,allowed:(current:WebsitePromotionState)=>boolean){
  if(!mounted.current||running.current||latest.current.state.busy||!allowed(latest.current.state))return;
  running.current=true;setLocalBusy(true);setLocalError("");
  try{await action();}catch(cause){if(mounted.current)setLocalError(cause instanceof Error?cause.message:"This action could not be confirmed. Check the same operation before continuing.");}
  finally{running.current=false;if(mounted.current)setLocalBusy(false);}
 }
 function close(){const now=latest.current.state;if(!mounted.current||running.current||now.busy||["unknown","confirming","resolving"].includes(now.phase))return;if(now.promotion&&!terminal.has(now.phase)){void run(latest.current.onCancel,current=>!!current.promotion&&!terminal.has(current.phase));return;}latest.current.onClose();}
 const button=(label:string,action:()=>void,disabled=false,primary=false)=><button type="button" data-owner-button className={`${buttons.button} ${primary?buttons.primary:buttons.secondary}`} disabled={disabled} onClick={action}>{label}</button>;
 return <Dialog title="Review website for live publishing" wide maximizable dismissDisabled={dismissBlocked} dismissOnBackdrop={false} onClose={close} actions={<>
  {button(terminal.has(state.phase)?"Close":state.promotion?"Cancel preparation":"Cancel",close,dismissBlocked)}
  {state.phase==="idle"&&button("Prepare live preview",()=>void run(latest.current.onPrepare,current=>current.phase==="idle"),busy,true)}
  {state.phase==="prepared"&&state.promotion&&!busy&&button("Continue preparing preview",()=>void run(latest.current.onStage,current=>!!current.promotion&&current.phase==="prepared"),false,true)}
  {ready&&button("Publish reviewed website to live",()=>{const current=latest.current.state;if(current.phase!=="ready"||!current.promotion||current.reviewContent!==state.reviewContent)return;void run(()=>latest.current.onCommit({reviewDigest:current.promotion!.reviewDigest,confirmLive:true}),now=>now.phase==="ready"&&now.promotion?.reviewDigest===current.promotion?.reviewDigest);},busy,true)}
  {unknown&&button("Check publish result",()=>void run(latest.current.onResolve,current=>current.phase==="unknown"),busy,true)}
  {unknown&&state.canRetry&&button("Retry same operation",()=>void run(latest.current.onRetry,current=>current.phase==="unknown"&&current.canRetry),busy)}
  {unknown&&state.canCancel===true&&button("Cancel pending preparation",()=>void run(latest.current.onCancel,current=>current.phase==="unknown"&&current.canCancel===true),busy)}
 </>}>
  <p>This reviews the <strong>saved beta draft</strong>, not unsaved editor changes. Preparing copies does not publish anything.</p>
  <p>Publishing replaces only the main website’s public content and website assets. The main private draft, clients, payments, integrations and Construction Mode are not changed. The previous live website is kept in recovery.</p>
  <div className={styles.status} role="status" aria-live="polite">{state.phase==="committed"?"Published to live!":state.phase==="cancelled"?"Preparation cancelled. Nothing was published.":state.phase==="locked"?"Your owner session changed. This review is locked.":state.phase==="stale"?"This review is out of date. Close it and review the current saved versions.":unknown?"The result is not yet confirmed. Check this same operation; do not start another publish.":state.phase==="confirming"?"Publishing the reviewed website…":state.phase==="resolving"?"Checking the same operation…":state.phase==="cancelling"?"Cancelling preparation…":state.phase==="staging"?"Preparing website assets…":state.phase==="preparing"?"Reviewing the saved beta draft…":ready?"Website assets are ready. Review below, then explicitly publish to live.":"Ready to review."}</div>
  {(state.error||localError)&&<p className={styles.error} role="alert">{state.error||localError}</p>}
  {!locked&&state.promotion&&<dl className={styles.summary}><div><dt>Saved beta revision</dt><dd>{state.promotion.sourceRevision}</dd></div><div><dt>Main workspace revision</dt><dd>{state.promotion.mainRevision}</dd></div><div><dt>Current live revision</dt><dd>{state.promotion.mainPublishedRevision}</dd></div><div><dt>Website pages</dt><dd>{state.promotion.pageCount}</dd></div><div><dt>Website assets</dt><dd>{state.promotion.assets.length}</dd></div></dl>}
  {!locked&&state.reviewContent&&!preview&&<p role="alert">The reviewed website could not be displayed safely. Live publishing is unavailable.</p>}
  {!locked&&preview&&page&&<section aria-label="Read-only website review"><label className={styles.pagePicker}>Preview page<select value={page.id} onChange={event=>setPageId(event.target.value)}>{pages.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p className={styles.hint}>Read-only preview. Use the page picker to inspect each page; website links and forms are inactive here.</p><div className={styles.preview} inert><SiteContentFrame content={preview} page={page} mode="private-preview" editable={false}/></div></section>}
 </Dialog>;
}

export interface WebsitePromotionDialogProps {
 request:(input:WebsitePromotionRequest)=>Promise<unknown>;
 session:RecoverySession;
 revisedSource:number;
 assertSourceCurrent:(revision:number)=>void;
 onClose:()=>void;
 onPublished:()=>void;
}
/** Parent has already explicitly chosen Live review and holds its draft-write lock. */
export function WebsitePromotionDialog(props:WebsitePromotionDialogProps){
 const latest=useRef(props);useLayoutEffect(()=>{latest.current=props;},[props]);
 const {ownerUid,projectId,assertCurrent}=props.session;
 const controller=useRef<WebsitePromotionController|null>(null),announced=useRef(new Set<string>()),closing=useRef(false),alive=useRef(false);
 const[state,setState]=useState<WebsitePromotionState>({phase:"preparing",busy:true,canRetry:false});
 useEffect(()=>{
  let active=true;alive.current=true;let client:WebsitePromotionController;
  try{
   assertCurrent();
   client=createWebsitePromotionController({actorUid:ownerUid,projectId,request:props.request,assertCurrent,assertSourceCurrent:revision=>latest.current.assertSourceCurrent(revision),onChange:next=>{
    if(!active)return;setState(next);
    if(next.phase==="committed"&&next.promotion&&!announced.current.has(next.promotion.operationId)){
     try{assertCurrent();announced.current.add(next.promotion.operationId);latest.current.onPublished();}catch{/* Current-session controller owns the locked/error state. */}
    }
   }});controller.current=client;
   const start=async()=>{const result=client.hasPending()?await client.resolve():await client.prepare(props.revisedSource);if(active&&result.phase==="prepared")await client.stage();};
   void start();
  }catch(cause){void Promise.resolve().then(()=>{if(active)setState({phase:"locked",busy:false,canRetry:false,error:cause instanceof Error?cause.message:"The owner session or saved operation could not be verified."});});}
  return()=>{active=false;alive.current=false;client?.dispose();if(controller.current===client)controller.current=null;};
 },[props.request,ownerUid,projectId,assertCurrent,props.revisedSource]);
 async function prepare(){const current=controller.current;if(!current)return;const result=await current.prepare(latest.current.revisedSource);if(result.phase==="prepared")await current.stage();}
 async function resolve(retry=false){const current=controller.current;if(!current)return;const result=retry?await current.retry():await current.resolve();if(result.phase==="prepared")await current.stage();}
 async function close(){if(closing.current||!alive.current)return;const current=controller.current;const now=current?.getState();if(now&&(now.busy||["unknown","confirming","resolving"].includes(now.phase)))return;closing.current=true;try{if(current&&now&&["committed","cancelled"].includes(now.phase)){setState({...now,busy:true});await current.acknowledge();}if(alive.current)latest.current.onClose();}catch(cause){if(alive.current&&now)setState({...now,busy:false,error:cause instanceof Error?cause.message:"The saved receipt could not be cleared. Try closing again."});}finally{closing.current=false;}}
 return <WebsitePromotionReview state={state} onPrepare={prepare} onStage={async()=>{await controller.current?.stage();}} onCommit={async confirmation=>{await controller.current?.commit(confirmation);}} onResolve={()=>resolve()} onRetry={()=>resolve(true)} onCancel={async()=>{await controller.current?.cancel();}} onClose={close}/>;
}
