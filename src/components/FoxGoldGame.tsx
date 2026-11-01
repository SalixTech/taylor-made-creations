"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {onIdTokenChanged} from 'firebase/auth';
import {rollAccountFoxGold,resolveFoxGoldSession} from '@/client-hub/fox-gold-client';
import {decodeFoxBank,nextFoxRollV2,foxOutcomeLine,foxRareLine,FOX_RARE_LINE,type FoxBank,type FoxRoll,type FoxAnonymousMemory,type FoxOpening} from './fox-gold-bank';
import styles from './LightSideFox.module.css';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Opening IDs come from the launcher, never from an effect or response retry. */
export function FoxGoldGame({mode,opening,encounter=0,anonymousMemory,children,onRareConfirmed}:{mode:'owner'|'client'|'anonymous';opening:FoxOpening;encounter?:number;anonymousMemory?:FoxAnonymousMemory;children?:ReactNode;onRareConfirmed?:()=>void}){
 const[bank,setBank]=useState<FoxBank|null>(null),[roll,setRoll]=useState<FoxRoll|null>(null),[error,setError]=useState(''),[rare,setRare]=useState(false);
 const generation=useRef(0),localAnonymous=useRef<{id:string;roll:FoxRoll}|null>(null);
 useEffect(()=>{const sequence=generation,epoch=++sequence.current,abort=new AbortController();let unsubscribe:(()=>void)|undefined;const current=()=>sequence.current===epoch&&!abort.signal.aborted;
  const revoke=()=>{if(!current())return;abort.abort();setBank(null);setRoll(null);setError('Your account session changed. Reopen the fox to continue.');};
  async function run(){if(!current())return;setBank(null);setRoll(null);setRare(false);setError('');try{
   if(!UUID.test(opening.id))throw Error('Opening could not be verified.');
   if(mode==='anonymous'){const openingId=opening.operation('anonymous',null);let result=anonymousMemory?.readRoll(openingId)??(localAnonymous.current?.id===openingId?localAnonymous.current.roll:null);if(!result){const saved=anonymousMemory?.read();result=nextFoxRollV2(saved?decodeFoxBank(JSON.stringify(saved)):{schemaVersion:1,balance:0,revision:0});localAnonymous.current={id:openingId,roll:result};anonymousMemory?.writeRoll(openingId,result);anonymousMemory?.write(result.bank);}if(current()){setBank(result.bank);setRoll(result);const isRare=result.gameVersion===2?result.event!=='ordinary':opening.rare();setRare(isRare);if(isRare)onRareConfirmed?.();}return;}
   const session=await resolveFoxGoldSession(mode==='owner',abort.signal);if(!current())return;session.assertCurrent();unsubscribe=onIdTokenChanged(session.auth,()=>{try{session.assertCurrent();}catch{revoke();}},revoke);
   const legacyKey=`tmc-fox-roll-v2:${session.scopeKey}`,newKey=`tmc-fox-roll-v3:${session.scopeKey}`;
   const legacy=window.sessionStorage.getItem(legacyKey);if(legacy!==null&&!UUID.test(legacy))throw Error('Pending roll could not be read.');
   const stored=window.sessionStorage.getItem(newKey);let pending:{operationId:string;gameVersion:2}|null=null;
   if(stored!==null){const parsed=JSON.parse(stored);if(!parsed||Object.keys(parsed).sort().join(',')!=='gameVersion,operationId'||parsed.gameVersion!==2||!UUID.test(parsed.operationId))throw Error('Pending roll could not be read.');pending=parsed;}
   // Older unknown operations keep their exact old game semantics. A new nonce
   // and its version are written atomically in one value, never upgraded in place.
   const key=legacy!==null?legacyKey:newKey,gameVersion=legacy!==null?1:2;
   const operationId=opening.operation(session.scopeKey,legacy??pending?.operationId??null);
   const receipt=gameVersion===1?operationId:JSON.stringify({operationId,gameVersion:2});
   if(legacy===null&&pending===null){window.sessionStorage.setItem(key,receipt);if(window.sessionStorage.getItem(key)!==receipt)throw Error('Pending roll could not be saved.');}
   const result=await rollAccountFoxGold(mode==='owner',operationId,abort.signal,session.scopeKey,gameVersion);session.assertCurrent();if(!current())return;
   let cleanupFailed=false;try{if(window.sessionStorage.getItem(key)!==receipt)throw Error('Pending roll changed.');window.sessionStorage.removeItem(key);if(window.sessionStorage.getItem(key)!==null)throw Error('Roll receipt could not be cleared.');}catch{cleanupFailed=true;}
   // The account receipt is authoritative even if this browser cannot clear its nonce.
   session.assertCurrent();if(!current())return;
   setBank(result.currentBank);setRoll(result);const isRare=result.gameVersion===2?result.event!=='ordinary':opening.rare();setRare(isRare);if(isRare)onRareConfirmed?.();
   if(cleanupFailed)setError('This roll was confirmed, but this browser could not finish saving its receipt. Reopening may show this result again.');
  }catch(cause){if(current()){const code=String((cause as {code?:unknown})?.code??'');setBank(null);setRoll(null);setError(/permission-denied|unauthenticated/.test(code)?'Your account session could not be verified. Reopen the fox to continue.':'The fox could not confirm this visit. Close and reopen to check the same roll.');}}}
  void Promise.resolve().then(run);return()=>{if(sequence.current===epoch)sequence.current++;abort.abort();unsubscribe?.();};
 },[mode,opening,anonymousMemory,onRareConfirmed]);
 return <div className={styles.game}><div className={styles.bank}>{bank?<strong>{roll?.event==='bubbles-wipe'?<><span aria-hidden="true" className={styles.redDots}>● ● ●</span><span className={styles.srOnly}>Gold: {bank.balance}</span></>:<>Gold: {bank.balance}</>}</strong>:!error?<span role="status">Checking your gold…</span>:null}</div>{error&&<p role="alert" className={styles.error}>{error}</p>}{roll&&<div key={roll.bank.revision} className={roll.event==='bubbles-wipe'?`${styles.reward} ${styles.wipe}`:styles.reward} data-fox-event={roll.event}><span className={styles.coins} aria-hidden="true"><i>●</i><i>●</i><i>●</i><i>●</i><i>●</i></span><strong role="status">{roll.delta>0?'+':''}{roll.delta} Gold</strong></div>}{children}{roll&&<p className={rare?styles.rareText:undefined}>{rare?(roll.gameVersion===2&&roll.event?foxRareLine(roll.event):FOX_RARE_LINE):foxOutcomeLine(roll,encounter)}</p>}</div>;
}
