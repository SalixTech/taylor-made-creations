"use client";
import {useLayoutEffect,useState} from 'react';
/** Match the public page's CSS viewport, not the space left beside the inspector.
 * This is preview-only state. It never changes saved content or coordinates. */
export function readPreviewViewportWidth(root:Pick<HTMLElement,'clientWidth'>):number|null {
  const width=root.clientWidth;
  return Number.isFinite(width)&&width>0?width:null;
}
export function usePreviewViewportWidth():number|null {
  const [width,setWidth]=useState<number|null>(null);
  useLayoutEffect(()=>{
    const root=document.documentElement;
    const measure=()=>setWidth(previous=>{const next=readPreviewViewportWidth(root);return next??previous;});
    // Layout measurement must precede paint; it is not a persisted draft edit.
    measure();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(root);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  return width;
}
