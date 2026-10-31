"use client";
import {useEffect,useState} from "react";
/** Deterministic hydration; viewport updates only after mount. Preview choice is authoritative. */
export function useMobileSiteLayout(enabled:boolean,viewport?:"desktop"|"mobile") {
  const [narrow,setNarrow]=useState(false);
  useEffect(()=>{
    if(typeof window.matchMedia!=="function")return;
    const query=window.matchMedia("(max-width:650px)"),update=()=>setNarrow(query.matches);
    update();query.addEventListener?.("change",update);
    return()=>query.removeEventListener?.("change",update);
  },[]);
  return enabled && (viewport ? viewport==="mobile" : narrow);
}
