"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloudFileDialog } from "./AssetLibrary";
import { CLOUD_BUTTONS_FOLDER_ID, CLOUD_DOCUMENTS_FOLDER_ID } from "./cloud-files-model";
import { isSafeButtonArtwork, isWebsiteDocumentHref } from "./model";
import buttons from "./OwnerButton.module.css";
/** Only the website-document picker can create document assets; private PDFs remain separate. */
export function WebsiteAssetPicker({kind,value,onSelect,targetId,revision,disabled=false}:{disabled?:boolean;revision?:object;targetId:string;kind:"button"|"document";value:string;onSelect:(src:string)=>void}) {
  const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const identity = useRef({kind,value,targetId,revision});
  const blocked=useRef(disabled);useLayoutEffect(()=>{blocked.current=disabled;},[disabled]);
  const generation=useRef(0);
  const [opened,setOpened] = useState<(typeof identity.current & {generation:number;onSelect:(src:string)=>void})|null>(null);
  const close=()=>{generation.current++;setOpened(null);};
  useLayoutEffect(() => {
    const previous=identity.current;identity.current={kind,value,targetId,revision};
    if(previous.kind!==kind||previous.value!==value||previous.targetId!==targetId||previous.revision!==revision){generation.current++;setOpened(null);}
  },[kind,value,targetId,revision]);
  const current = opened && opened.kind===kind && opened.value===value && opened.targetId===targetId && opened.revision===revision;
  return <div><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-haspopup="dialog" disabled={disabled} onClick={()=>{if(blocked.current)return;setOpened({kind,value,targetId,revision,onSelect,generation:++generation.current});}}>{kind==="button" ? value ? "Change artwork…" : "Choose artwork…" : value && isWebsiteDocumentHref(value) ? "Change PDF…" : "Choose PDF…"}</button>{current && <CloudFileDialog key={`${opened.targetId}:${opened.kind}`} selected={opened.value} pickerKind={kind==="button"?"photo":"document"} initialFolder={kind==="button"?CLOUD_BUTTONS_FOLDER_ID:CLOUD_DOCUMENTS_FOLDER_ID} onClose={close} onSelect={src=>{
    if(!active.current||blocked.current||generation.current!==opened.generation)return;const latest=identity.current;
    if(latest.kind!==opened.kind||latest.value!==opened.value||latest.targetId!==opened.targetId||latest.revision!==opened.revision)return;
    if(kind==="button"?!isSafeButtonArtwork(src):!isWebsiteDocumentHref(src))return;
    generation.current++;opened.onSelect(src);setOpened(null);
  }}/>}</div>;
}
