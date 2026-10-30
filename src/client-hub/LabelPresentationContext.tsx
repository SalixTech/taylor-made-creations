"use client";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ClientHubProject } from "./model";
import { assignedLabelDefinition, emptyLabelPresentation, LABEL_BUILTINS, type LabelPresentation, type SaveLabelPresentationInput } from "./label-presentation";
import { getOwnerLabelPresentation, getClientLabelPresentation, saveOwnerLabelPresentation, watchLabelPresentationSession } from "./label-presentation-client";
import { CLIENT_PROJECT_STATUS_LABELS } from "./presentation";

export const LabelPresentationContext = createContext<LabelPresentation | null>(null);
export function useLabelPresentation() { return useContext(LabelPresentationContext); }
export function labelColorStyle(color: string | null): CSSProperties | undefined {
 if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
 const values = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=.2126*values[0]+.7152*values[1]+.0722*values[2];
 const ink=luminance>.179?"#000000":"#ffffff";
 return { "--tag-bg":color,"--tag-ink":ink,background:color,color:ink,borderColor:color } as CSSProperties;
}
export function useLabelPresentationController(owner: boolean, project?: ClientHubProject) {
 const [presentation,setPresentation]=useState<LabelPresentation|null>(null),[loadedScope,setLoadedScope]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [refreshToken,setRefreshToken]=useState(0),[retry,setRetry]=useState(false);
 const invalidateSession=useRef<()=>void>(()=>{});
 const session=useRef<Awaited<ReturnType<typeof watchLabelPresentationSession>>|null>(null), generation=useRef(0), pending=useRef(false), attempt=useRef<SaveLabelPresentationInput|null>(null);
 const projectRef=useRef(project);
 useEffect(()=>{projectRef.current=project;},[project]);
 const projectId=owner?"":project?.projectId??"", clientId=owner?"":project?.clientId??"", assignments=owner?"":JSON.stringify(project?.informationTags??[]);
 const renderScope=owner?"owner":`${clientId}:${projectId}:${assignments}`;
 useEffect(()=>{
  const epoch=++generation.current;let active=true,reading=false;let watcher:Awaited<ReturnType<typeof watchLabelPresentationSession>>|null=null;
  session.current=null;attempt.current=null;pending.current=false;
  queueMicrotask(()=>{if(active&&generation.current===epoch){setPresentation(null);setLoading(true);setError("");setBusy(false);setRetry(false);}});
  const current=()=>active&&generation.current===epoch;
  const invalidate=()=>{if(!current())return;active=false;session.current=null;attempt.current=null;pending.current=false;setPresentation(null);setLoading(false);setBusy(false);setRetry(false);setError("Sign in again to load label styling.");};
  invalidateSession.current=invalidate;
  async function read(){if(!current()||!watcher||reading||pending.current||attempt.current)return;reading=true;try{watcher.assertCurrent();const next=owner?await getOwnerLabelPresentation():await getClientLabelPresentation(projectRef.current!);watcher.assertCurrent();if(current()){setPresentation(previous=>!previous||next.revision>=previous.revision?next:previous);setLoadedScope(renderScope);setError("");}}catch(cause){if(current()){if(/permission-denied|unauthenticated|session-expired/.test(String((cause as {code?:unknown})?.code??"")))invalidate();else setError(cause instanceof Error?cause.message:"Labels could not be loaded.");}}finally{reading=false;if(current())setLoading(false);}}
  if(!owner&&!projectId){queueMicrotask(()=>{if(current())setLoading(false);});return()=>{active=false;};}
  void watchLabelPresentationSession(owner,projectRef.current,invalidate).then(value=>{if(!current()){value.close();return;}watcher=value;session.current=value;void read();}).catch(cause=>{if(current()){setLoading(false);setError(cause instanceof Error?cause.message:"Labels could not be loaded.");}});
  const refresh=()=>{if(document.visibilityState!=="hidden")void read();};
  const timer=window.setInterval(refresh,30000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{active=false;watcher?.close();if(session.current===watcher)session.current=null;window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[owner,projectId,clientId,assignments,refreshToken,renderScope]);
 async function commit(input:SaveLabelPresentationInput){
  if(!owner||pending.current||!session.current)return false;const epoch=generation.current,scope=session.current;pending.current=true;setBusy(true);setError("");
  try{scope.assertCurrent();const saved=await saveOwnerLabelPresentation(input);scope.assertCurrent();if(epoch!==generation.current||session.current!==scope)return false;setPresentation(previous=>!previous||saved.revision>=previous.revision?saved:previous);attempt.current=null;setRetry(false);return true;}
  catch(cause){if(epoch===generation.current&&session.current===scope){const code=String((cause as {code?:unknown})?.code??"");if(/permission-denied|unauthenticated|session-expired/.test(code)){invalidateSession.current();return false;}const definitive=/aborted|invalid-argument|failed-precondition/.test(code);if(definitive)attempt.current=null;setRetry(!definitive);setError(cause instanceof Error?cause.message:"Label save was not confirmed. Retry the same change.");}return false;}
  finally{if(epoch===generation.current&&session.current===scope){pending.current=false;setBusy(false);}}
 }
 return {presentation:loadedScope===renderScope?presentation:null,loading,busy,error,retry,refresh(){if(!pending.current&&!attempt.current)setRefreshToken(v=>v+1);},async save(value:Pick<LabelPresentation,"entries"|"order">,expectedRevision:number,legacy:Pick<SaveLabelPresentationInput,"legacyProjectId"|"adoptLegacyKeys">={}){if(!presentation||attempt.current||!session.current||loadedScope!==renderScope)return false;const input={...legacy,operationId:crypto.randomUUID(),expectedRevision,entries:structuredClone(value.entries),order:[...value.order]};attempt.current=input;return commit(input);},retrySave(){return attempt.current?commit(attempt.current):Promise.resolve(false);}};
}
export function ScopedLabelPresentation({owner,project,children}:{owner:boolean;project?:ClientHubProject;children:ReactNode}) {const state=useLabelPresentationController(owner,project);return <LabelPresentationContext.Provider value={state.presentation}>{children}</LabelPresentationContext.Provider>;}
export function PresentedStatus({status,className,style}:{status:ClientHubProject["status"];className?:string;style?:CSSProperties}) {
 const definition=assignedLabelDefinition(useLabelPresentation(),"status");if(definition.hidden)return null;
 return <span className={className} data-status={status} data-label-presentation={definition.color?"custom":undefined} style={{...style,...labelColorStyle(definition.color)}} title={`Commission status: ${CLIENT_PROJECT_STATUS_LABELS[status]}`}>{definition.name===LABEL_BUILTINS.status?CLIENT_PROJECT_STATUS_LABELS[status]:definition.name}</span>;
}
export const defaultLabelPresentation=emptyLabelPresentation;
