"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import Image from "next/image";
import { Dialog } from "@/owner/OwnerDialog";
import type {FoxOpening} from "./fox-gold-bank";
import {FoxGoldGame} from "./FoxGoldGame";
import styles from "./LightSideFox.module.css";
export function LightSideFox({encounter=0,opening,onClose,renderGame}:{encounter?:number;opening:FoxOpening;onClose:()=>void;renderGame?:(image:ReactNode,onRareConfirmed:()=>void)=>ReactNode}) {
 const [hold,setHold]=useState<{id:string;until:number;ended:boolean}|null>(null);
 const until=useRef(0);
 const rareConfirmed=useCallback(()=>{const expires=Date.now()+3000;setHold(previous=>previous?.id===opening.id?previous:{id:opening.id,until:expires,ended:false});},[opening.id]);
 const closeLocked=hold!==null&&!hold.ended;
 useLayoutEffect(()=>{until.current=hold&&!hold.ended?hold.until:0;},[hold]);
 useEffect(()=>{if(!hold||hold.ended)return;const id=hold.id,timer=setTimeout(()=>setHold(previous=>previous?.id===id?{...previous,ended:true}:previous),Math.max(0,hold.until-Date.now()));return()=>clearTimeout(timer);},[hold]);
 const requestClose=()=>{if(Date.now()<until.current)return;onClose();};
 const image=<Image src="/images/light-side-fox.jpg" alt="A little fox with a foamy hat and a dab of foam on its cheek" width={2040} height={2048} className={styles.fox} />;
 return <div className={styles.encounter}><Dialog title="You have encountered a fox" onClose={requestClose} dismissDisabled={closeLocked} actions={null}><div className={styles.content}>{renderGame?renderGame(image,rareConfirmed):<FoxGoldGame onRareConfirmed={rareConfirmed} mode="owner" opening={opening} encounter={encounter}>{image}</FoxGoldGame>}</div></Dialog></div>;
}
