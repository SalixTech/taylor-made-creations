"use client";
/* eslint-disable @next/next/no-img-element -- Local, validated raster preview; revoked on dismissal. */
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/owner/OwnerDialog";
import styles from "./ClientHub.module.css";
export function avatarCropBounds(width:number,height:number,zoom:number,x:number,y:number) {
  if (![width,height,zoom,x,y].every(Number.isFinite) || width <= 0 || height <= 0) throw Error("Invalid crop position.");
  const size=Math.min(width,height)/Math.max(1,Math.min(3,zoom));
  return {size,left:(width-size)*Math.max(0,Math.min(100,x))/100,top:(height-size)*Math.max(0,Math.min(100,y))/100};
}
export function avatarRasterDimensions(bytes:Uint8Array,type:string) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
  let width=0,height=0;
  if(type==="image/png"&&bytes.length>=24&&text(12,16)==="IHDR"){width=view.getUint32(16);height=view.getUint32(20);}
  if(type==="image/jpeg")for(let at=2;at+3<bytes.length;){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(at+2>bytes.length)break;const length=view.getUint16(at);if(length<2||at+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){height=view.getUint16(at+3);width=view.getUint16(at+5);break;}at+=length;}
  if(type==="image/webp"&&bytes.length>=25){const chunk=text(12,16);if(chunk==="VP8X"&&bytes.length>=30){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}else if(chunk==="VP8 "&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}else if(chunk==="VP8L"&&bytes[20]===0x2f){width=1+bytes[21]+((bytes[22]&0x3f)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10);}}
  if(!width||!height||width>2048||height>2048)throw Error("Choose an image no larger than 2048 × 2048 pixels.");return {width,height};
}
export function avatarDragPosition(width:number,height:number,zoom:number,x:number,y:number,dx:number,dy:number,viewport:number){
  if(![dx,dy,viewport].every(Number.isFinite)||viewport<=0)throw Error("Invalid crop gesture.");const box=avatarCropBounds(width,height,zoom,x,y),clamp=(v:number)=>Math.max(0,Math.min(100,v));
  return{x:width>box.size?clamp(x-dx*box.size/viewport/(width-box.size)*100):50,y:height>box.size?clamp(y-dy*box.size/viewport/(height-box.size)*100):50};
}
export async function decodeAvatarCrop(file:File) {
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size<1||file.size>2*1024*1024)throw Error("Choose a JPG, PNG or WebP up to 2 MiB.");
  const bytes=new Uint8Array(await file.arrayBuffer()),text=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  const valid=file.type==="image/png"?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):file.type==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:text(0,4)==="RIFF"&&text(8,12)==="WEBP";
  if(!valid)throw Error("This file is not a supported raster image.");
  avatarRasterDimensions(bytes,file.type);
  const bitmap=await createImageBitmap(file);
  if(!Number.isFinite(bitmap.width)||!Number.isFinite(bitmap.height)||!bitmap.width||!bitmap.height||bitmap.width>2048||bitmap.height>2048){bitmap.close();throw Error("Choose an image no larger than 2048 × 2048 pixels.");}
  return bitmap;
}
export function AvatarCrop({file,onCancel,onApply}:{file:File;onCancel:()=>void;onApply:(file:File)=>void|Promise<void>}) {
  const [image,setImage]=useState<{url:string;width:number;height:number;file:File}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[zoom,setZoom]=useState(1),[x,setX]=useState(50),[y,setY]=useState(50),[prepared,setPrepared]=useState(false),[saving,setSaving]=useState(false);
  const bitmap=useRef<ImageBitmap|null>(null),alive=useRef(false),pending=useRef(false),generation=useRef(0),preparedFile=useRef<File|null>(null),savingRef=useRef(false),cropArea=useRef<HTMLDivElement|null>(null),drag=useRef<{id:number;cx:number;cy:number;x:number;y:number;width:number}|null>(null);
  useEffect(()=>{alive.current=true;pending.current=false;savingRef.current=false;preparedFile.current=null;drag.current=null;const token=++generation.current;let active=true,url="";queueMicrotask(()=>{if(active&&generation.current===token){setBusy(false);setError("");setPrepared(false);setSaving(false);setX(50);setY(50);setZoom(1);}});void decodeAvatarCrop(file).then(value=>{if(!active){value.close();return;}bitmap.current=value;url=URL.createObjectURL(file);setImage({url,width:value.width,height:value.height,file});}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"The image could not be opened.");});return()=>{active=false;alive.current=false;generation.current=token+1;bitmap.current?.close();bitmap.current=null;if(url)URL.revokeObjectURL(url);};},[file]);
  async function apply(){
    if(pending.current||!bitmap.current)return;pending.current=true;const token=generation.current;setBusy(true);setError("");
    try{
      if(!preparedFile.current){
        const source=bitmap.current,box=avatarCropBounds(source.width,source.height,zoom,x,y),canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
        const ctx=canvas.getContext("2d");if(!ctx)throw Error("Your browser could not prepare this crop.");ctx.drawImage(source,box.left,box.top,box.size,box.size,0,0,256,256);
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error("The crop could not be prepared.")),"image/png"));
        if(blob.size<1||blob.size>2*1024*1024||blob.type!=="image/png")throw Error("This cropped image is not a valid profile picture.");
        if(!alive.current||generation.current!==token)return;
        preparedFile.current=new File([blob],"profile-crop.png",{type:"image/png"});setPrepared(true);
      }
      if(alive.current&&generation.current===token){savingRef.current=true;setSaving(true);await onApply(preparedFile.current);}
    }catch(cause){if(alive.current&&generation.current===token)setError(cause instanceof Error?cause.message:"The picture could not be saved.");}
    finally{if(generation.current===token){pending.current=false;savingRef.current=false;if(alive.current){setBusy(false);setSaving(false);}}}
  }
  function cancel(){if(savingRef.current)return;alive.current=false;++generation.current;onCancel();}
  const currentImage=image?.file===file?image:null;
  const box=currentImage?avatarCropBounds(currentImage.width,currentImage.height,zoom,x,y):null;
  useEffect(()=>{
    if(!currentImage||busy||prepared)return;
    const wheel=(event:WheelEvent)=>{
      if(pending.current||savingRef.current||event.ctrlKey||event.metaKey||!Number.isFinite(event.deltaY)||!event.deltaY||!cropArea.current?.contains(event.target as Node))return;
      event.preventDefault();drag.current=null;
      const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?200:1);
      const step=Math.sign(pixels)*Math.min(.25,Math.abs(pixels)*.002);
      setZoom(value=>Math.max(1,Math.min(3,value-step)));
    };
    window.addEventListener("wheel",wheel,{passive:false});
    return()=>window.removeEventListener("wheel",wheel);
  },[currentImage,busy,prepared]);
  function moveImage(dx:number,dy:number,width:number,fromX=x,fromY=y){if(!currentImage||!box||!Number.isFinite(width)||width<=0)return;const next=avatarDragPosition(currentImage.width,currentImage.height,zoom,fromX,fromY,dx,dy,width);setX(next.x);setY(next.y);}
  return <div className={styles.avatarCropDialog}><Dialog title="Crop profile picture" dismissDisabled={saving} onClose={cancel} actions={<><button type="button" className={`${styles.secondary} ${styles.cropCancel}`} disabled={saving} onClick={cancel}>{prepared?"Close":"Cancel"}</button><button type="button" className={styles.primary} disabled={!currentImage||busy} onClick={()=>void apply()}>{busy?<><span className={styles.mutationSpinner} aria-hidden="true" />{saving?"Saving…":"Preparing…"}</>:prepared?"Retry Save":"Save"}</button></>}><p>Drag the picture inside the circle, or use arrow keys. Scroll over the picture to zoom. Save updates your private profile picture.</p>{error&&<p role="alert" className={styles.alert}>{error}</p>}{prepared&&!busy&&error&&<p>The server may already have saved this picture. Retry Save checks the same upload. Closing keeps that retry available in Edit Profile; it does not undo a save.</p>}{!currentImage&&!error&&<p role="status"><span className={styles.mutationSpinner} aria-hidden="true" /> Opening picture…</p>}{currentImage&&box&&<div className={styles.avatarCrop}><div ref={cropArea} className={styles.avatarCropPreview} role="group" tabIndex={prepared||busy?-1:0} aria-label="Position profile picture. Drag or use arrow keys; Home centers." aria-disabled={prepared||busy} onPointerDown={e=>{if(busy||prepared||pending.current||e.button!==0)return;e.preventDefault();drag.current={id:e.pointerId,cx:e.clientX,cy:e.clientY,x,y,width:e.currentTarget.getBoundingClientRect().width};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const start=drag.current;if(!start||start.id!==e.pointerId||pending.current||prepared)return;moveImage(e.clientX-start.cx,e.clientY-start.cy,start.width,start.x,start.y);}} onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={e=>{const start=drag.current;if(start?.id===e.pointerId){setX(start.x);setY(start.y);drag.current=null;}}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={e=>{if(busy||prepared||pending.current)return;if(e.key==="Home"){e.preventDefault();setX(50);setY(50);}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const step=e.shiftKey?20:5;moveImage(e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0,e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0,e.currentTarget.getBoundingClientRect().width);}}}><img draggable={false} alt="Your profile crop preview" src={currentImage.url} style={{width:`${currentImage.width/box.size*100}%`,height:`${currentImage.height/box.size*100}%`,left:`${-box.left/box.size*100}%`,top:`${-box.top/box.size*100}%`}} /></div><label>Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} disabled={busy||prepared} onChange={e=>setZoom(Number(e.target.value))}/></label></div>}</Dialog></div>;
}
