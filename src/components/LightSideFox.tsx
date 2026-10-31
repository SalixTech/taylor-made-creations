"use client";
import type {ReactNode} from "react";
import Image from "next/image";
import { Dialog } from "@/owner/OwnerDialog";
import type {FoxOpening} from "./fox-gold-bank";
import {FoxGoldGame} from "./FoxGoldGame";
import styles from "./LightSideFox.module.css";
export function LightSideFox({encounter=0,opening,onClose,renderGame}:{encounter?:number;opening:FoxOpening;onClose:()=>void;renderGame?:(image:ReactNode)=>ReactNode}) {
 const image=<Image src="/images/light-side-fox.jpg" alt="A little fox with a foamy hat and a dab of foam on its cheek" width={2040} height={2048} className={styles.fox} />;
 return <div className={styles.encounter}><Dialog title="You have encountered a fox" onClose={onClose} actions={null}><div className={styles.content}>{renderGame?renderGame(image):<FoxGoldGame mode="owner" opening={opening} encounter={encounter}>{image}</FoxGoldGame>}</div></Dialog></div>;
}
