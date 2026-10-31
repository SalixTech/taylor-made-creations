"use client";
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {DEFAULT_REF_SHEET_CHAT_COLOR,TAYLOR_CHAT_COLOR,type ClientHubProject} from './model';
import {setHubRefSheetChatColor,readHubRefSheetChatColor} from './workspace-client';
import {clientHubErrorMessage} from './client';
import styles from './RefSheetChatColor.module.css';
export function chatColorForeground(color:string){
 const safe=/^#[0-9a-f]{6}$/i.test(color)?color:DEFAULT_REF_SHEET_CHAT_COLOR;
 const values=[1,3,5].map(i=>parseInt(safe.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=.2126*values[0]+.7152*values[1]+.0722*values[2];
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#FFFFFF';
}
export function chatColorStyle(color?:string):CSSProperties{const safe=color&&/^#[0-9a-f]{6}$/i.test(color)?color:DEFAULT_REF_SHEET_CHAT_COLOR;return {'--ref-chat-color':safe,'--ref-chat-ink':chatColorForeground(safe)} as CSSProperties;}
export function RefSheetChatColor({project,owner,disabled,onSaved,onDirtyChange,onBusyChange,onFailure}:{project:ClientHubProject;owner:boolean;disabled:boolean;onSaved:(project:ClientHubProject)=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void;onFailure:(cause:unknown)=>void}){
 const [draft,setDraft]=useState<{color:string;version:number}|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[hasImage,setHasImage]=useState(false);
 const localImages=useRef(new Set<string>()),details=useRef<HTMLDetailsElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null),alive=useRef(false),pending=useRef(false),generation=useRef(0),request=useRef<AbortController|null>(null);
 const current=useRef({project,owner,disabled});useEffect(()=>{current.current={project,owner,disabled};},[project,owner,disabled]);
 // This monotonic request generation is deliberately invalidated at cleanup, not a DOM ref.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{alive.current=true;const images=localImages.current;return()=>{alive.current=false;++generation.current;request.current?.abort();images.forEach(url=>URL.revokeObjectURL(url));images.clear();};},[]);
 useEffect(()=>{onDirtyChange(!!draft||uncertain);return()=>onDirtyChange(false);},[draft,uncertain,onDirtyChange]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 const value=draft?.color??project.refSheetChatColor??DEFAULT_REF_SHEET_CHAT_COLOR,conflict=!!draft&&draft.version!==project.version;
 function change(color:string){if(disabled||pending.current||uncertain)return;setDraft(previous=>({color,version:previous?.version??project.version}));setError('');}
 async function save(check=false){
  if(pending.current||disabled||(!check&&(!draft||conflict||uncertain)))return;
  if(!check&&!/^#[0-9a-f]{6}$/i.test(value)){setError('Enter a six-digit hex color, such as #DEDDD8.');return;}
  if(!check&&value.toUpperCase()===TAYLOR_CHAT_COLOR){setError("That color is reserved for Taylor’s messages. Choose any other six-digit hex color.");return;}
  const captured={project,owner},controller=new AbortController();request.current=controller;++generation.current;pending.current=true;setBusy(true);setError('');
  const valid=()=>alive.current&&!controller.signal.aborted&&!current.current.disabled&&current.current.owner===captured.owner&&current.current.project.projectId===captured.project.projectId&&current.current.project.clientId===captured.project.clientId;
  try{const saved=check?await readHubRefSheetChatColor(project,owner,controller.signal):await setHubRefSheetChatColor({...project,version:draft!.version},owner,value.toUpperCase(),controller.signal);if(!valid())return;onSaved(saved);setUncertain(false);setDraft(check&&draft&&draft.color.toUpperCase()!==(saved.refSheetChatColor??DEFAULT_REF_SHEET_CHAT_COLOR)?{color:draft.color,version:saved.version}:null);setError(check?'Saved color checked.':'Color saved for this commission.');if(!check&&details.current)details.current.open=false;}
  catch(cause){if(valid()){if(!check)setUncertain(true);setError(`${clientHubErrorMessage(cause)}${!check?' Check the saved color before making another change.':''}`);onFailure(cause);}}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 function selectImage(file?:File){
  if(!file||disabled||pending.current||uncertain)return;const seq=++generation.current;
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>10*1024*1024){setError('Choose a PNG, JPEG, WebP or GIF image up to 10 MB.');return;}
  let url="",image:HTMLImageElement;try{url=URL.createObjectURL(file);localImages.current.add(url);image=new Image();}catch{if(url){localImages.current.delete(url);URL.revokeObjectURL(url);}setError("This browser could not open the image. Enter a hex color instead.");return;}
  const release=()=>{if(localImages.current.delete(url))URL.revokeObjectURL(url);};
  image.onload=()=>{try{if(!alive.current||seq!==generation.current||current.current.disabled)return;const target=canvas.current;if(!target)return;const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));if(!Number.isFinite(scale)||!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32000000)throw new Error('Invalid image');target.width=Math.max(1,Math.round(image.naturalWidth*scale));target.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=target.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,target.width,target.height);ctx.drawImage(image,0,0,target.width,target.height);setHasImage(true);setError('Click the local image to sample a color.');}catch{setError('This image could not be opened. Try another image or enter a hex color.');}finally{release();}};
  image.onerror=()=>{release();if(alive.current&&seq===generation.current)setError('This image could not be opened.');};image.src=url;
 }
 return <details ref={details} className={styles.control}><summary>Ref Sheet Custom Chat Color</summary><p>Shared for this commission. Only the client’s message bubbles change, in both views.</p><div className={styles.fields}><label>Hex color<input aria-label="Ref Sheet Custom Chat Color hex" value={value} maxLength={7} disabled={disabled||busy||uncertain} onChange={event=>change(event.target.value)}/></label><label>Color picker<input type="color" aria-label="Choose chat color" value={/^#[0-9a-f]{6}$/i.test(value)?value:DEFAULT_REF_SHEET_CHAT_COLOR} disabled={disabled||busy||uncertain} onChange={event=>change(event.target.value.toUpperCase())}/></label><div className={styles.previewField}><span>Message preview</span><span className={styles.preview} style={chatColorStyle(value)}>This is a sample message.</span></div></div><label className={styles.imageLabel}>Sample from a local reference image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={disabled||busy||uncertain} onChange={event=>{void selectImage(event.target.files?.[0]);event.target.value='';}}/></label><small>The image stays in this browser tab. It is not uploaded or saved.</small><canvas ref={canvas} hidden={!hasImage} className={styles.image} aria-label="Local reference image color sampler" onClick={event=>{if(disabled||pending.current||uncertain)return;const target=event.currentTarget,rect=target.getBoundingClientRect(),ctx=target.getContext('2d');if(!ctx||!rect.width||!rect.height)return;const x=Math.min(target.width-1,Math.max(0,Math.floor((event.clientX-rect.left)*target.width/rect.width))),y=Math.min(target.height-1,Math.max(0,Math.floor((event.clientY-rect.top)*target.height/rect.height)));const data=ctx.getImageData(x,y,1,1).data;change('#'+Array.from(data.slice(0,3)).map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase());}}/>{conflict&&<p role="status">This commission changed elsewhere. Check the saved color before applying your staged choice.</p>}<div className={styles.actions}><button type="button" disabled={disabled||busy||!draft||conflict||uncertain} onClick={()=>void save()}>Save chat color</button>{(uncertain||conflict)&&<button type="button" disabled={disabled||busy} onClick={()=>void save(true)}>Check saved color</button>}{draft&&!uncertain&&<button type="button" disabled={disabled||busy} onClick={()=>{setDraft(null);setError('');}}>Use saved color</button>}</div>{error&&<p role="status">{error}</p>}</details>;
}
