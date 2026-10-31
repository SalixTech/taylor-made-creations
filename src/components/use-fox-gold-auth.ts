"use client";
import {useEffect,useState} from 'react';
import {onIdTokenChanged,type Auth,type User} from 'firebase/auth';
import {getOwnerFirebaseClient,readOwnerFirebaseConfig} from '@/owner/firebase-client';
import {getClientThemeAuth,subscribeClientSession} from '@/client-hub/client';
import {resolveFoxGoldSession} from '@/client-hub/fox-gold-client';
export type FoxGoldAuthState={status:'loading'}|{status:'error';error:string}|{status:'ready';mode:'owner'|'client';uid:string;scopeKey:string}|{status:'ready';mode:'anonymous';uid?:undefined;scopeKey?:undefined};
/** Cosmetic entry resolver only. Gold calls separately authorize the captured account.
 * Never infer anonymous status from storage, a missing callback, or an auth error. */
export function watchFoxGoldAuth(receive:(state:FoxGoldAuthState)=>void):()=>void{
 let active=true,sequence=0,controller:AbortController|null=null,stopClient:(()=>void)|undefined;
 const stops:(()=>void)[]=[],broken=new Set<'owner'|'client'>();
 const users:{owner:User|null|undefined;client:User|null|undefined}={owner:undefined,client:undefined};
 let auths:{owner:Auth;client:Auth}|undefined,currentAssertion:(()=>void)|undefined;
 const emit=(state:FoxGoldAuthState)=>{if(active)receive(state);};
 const invalidate=()=>{++sequence;controller?.abort();controller=null;stopClient?.();stopClient=undefined;currentAssertion=undefined;};
 function fail(message='Your signed-in gold account could not be verified. Check your account session and reopen the fox.'){invalidate();emit({status:'error',error:message});}
 function resolve(){
  invalidate();emit({status:'loading'});
  if(!auths)return;
  if(broken.size){emit({status:'error',error:'Account sign-in status could not be checked. Reopen the fox after checking your connection.'});return;}
  if(users.owner===undefined||users.client===undefined)return;
  if(users.owner&&users.client){emit({status:'error',error:'Both Taylor and a client are signed in. Open the fox from the account’s own workspace, or choose a browser session with only one account signed in.'});return;}
  if(!users.owner&&!users.client){emit({status:'ready',mode:'anonymous'});return;}
  const mode=users.owner?'owner':'client',user=users[mode]!,request=sequence,abort=new AbortController();controller=abort;
  const valid=()=>active&&!abort.signal.aborted&&sequence===request&&auths?.[mode].currentUser===user&&users[mode]===user;
  let verification=0;
  const verify=async()=>{const revision=++verification;try{const session=await resolveFoxGoldSession(mode==='owner',abort.signal);if(!valid()||revision!==verification)return;session.assertCurrent();if(session.uid!==user.uid||session.auth!==auths?.[mode]||typeof session.scopeKey!=='string'||!session.scopeKey)throw Error('Account changed');currentAssertion=session.assertCurrent;emit({status:'ready',mode,uid:session.uid,scopeKey:session.scopeKey});}catch{if(valid()&&revision===verification)fail();}};
  if(mode==='owner')void verify();
  else{
   // The canonical client subscription waits for the authoritative active record
   // and invalidates immediately on epoch reset/suspension, not only token expiry.
   const stop=subscribeClientSession(session=>{if(!valid())return;if(!session){fail();return;}void verify();},()=>{if(valid())fail();});
   if(valid())stopClient=stop;else stop();
  }
 }
 const check=()=>{if(!active||!currentAssertion)return;try{currentAssertion();}catch{fail();}};
 const lock=(event:Event)=>{const detail=(event as CustomEvent).detail;if((detail?.role==='owner'||detail?.role==='client')&&detail.uid===users[detail.role as 'owner'|'client']?.uid)fail();};
 const visible=()=>{if(document.visibilityState!=='hidden')check();};
 emit({status:'loading'});
 try{
  const config=readOwnerFirebaseConfig();if(config.status!=='ready')throw Error('Owner account configuration unavailable');
  auths={owner:getOwnerFirebaseClient(config).auth,client:getClientThemeAuth()};
  for(const role of ['owner','client'] as const){const auth=auths[role];stops.push(onIdTokenChanged(auth,user=>{if(!active||user!==auth.currentUser)return;broken.delete(role);users[role]=user;resolve();},()=>{if(!active)return;broken.add(role);resolve();}));}
  window.addEventListener('focus',check);window.addEventListener('storage',check);window.addEventListener('tmc-hub-session-lock',lock);document.addEventListener('visibilitychange',visible);
 }catch{fail('Account sign-in status is unavailable. The fox will not switch a signed-in account to anonymous play.');}
 return()=>{active=false;invalidate();stops.forEach(stop=>stop());window.removeEventListener('focus',check);window.removeEventListener('storage',check);window.removeEventListener('tmc-hub-session-lock',lock);document.removeEventListener('visibilitychange',visible);};
}
export function useFoxGoldAuth():FoxGoldAuthState{
 const [state,setState]=useState<FoxGoldAuthState>({status:'loading'});
 useEffect(()=>watchFoxGoldAuth(setState),[]);
 return state;
}
