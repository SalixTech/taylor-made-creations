"use client";
import{useMemo,useRef,useState,type ReactNode}from'react';
import{FoxGoldGame}from'./FoxGoldGame';
import{LightSideFox}from'./LightSideFox';
import{useFoxGoldAuth}from'./use-fox-gold-auth';
import{createFoxOpening,type FoxOpening,type FoxBank,type FoxRoll,type FoxAnonymousMemory}from'./fox-gold-bank';
import styles from'./LightSideFox.module.css';
export function ConstructionFoxGame({anonymousMemory,opening,encounter,image,onRareConfirmed}:{anonymousMemory:FoxAnonymousMemory;opening:FoxOpening;encounter:number;image?:ReactNode;onRareConfirmed?:()=>void}){const auth=useFoxGoldAuth();return auth.status==='loading'?<><p role="status">Checking your gold session…</p>{image}</>:auth.status==='error'?<><p role="alert">Your gold session could not be verified. Please sign in again.</p>{image}</>:<FoxGoldGame onRareConfirmed={onRareConfirmed} key={auth.scopeKey??'anonymous'} mode={auth.mode} opening={opening} encounter={encounter} anonymousMemory={auth.mode==='anonymous'?anonymousMemory:undefined}>{image}</FoxGoldGame>;}

export function ConstructionGoldWhimsy(){
 const[open,setOpen]=useState(false),[encounter,setEncounter]=useState(0),[opening,setOpening]=useState<FoxOpening|null>(null);const openings=useRef(0),openingNow=useRef(false),bank=useRef<FoxBank|null>(null),receipt=useRef<{id:string;roll:FoxRoll}|null>(null);const anonymousMemory=useMemo(()=>({read:()=>bank.current,write:(value:FoxBank)=>{bank.current=value;},readRoll:(id:string)=>receipt.current?.id===id?receipt.current.roll:null,writeRoll:(id:string,roll:FoxRoll)=>{receipt.current={id,roll};}}),[]);
 return <div className={styles.launcher}><button type="button" className={styles.whimsyButton} aria-haspopup="dialog" onClick={()=>{if(openingNow.current)return;openingNow.current=true;setOpening(createFoxOpening(crypto.randomUUID()));setEncounter(openings.current++);setOpen(true);}}>A little whimsy</button>{open&&opening&&<LightSideFox opening={opening} encounter={encounter} onClose={()=>{openingNow.current=false;setOpen(false);}} renderGame={(image,onRareConfirmed)=><ConstructionFoxGame onRareConfirmed={onRareConfirmed} opening={opening} encounter={encounter} anonymousMemory={anonymousMemory} image={image}/>}/>}</div>;
}
