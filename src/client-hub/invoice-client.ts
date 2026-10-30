"use client";
import {collection,doc,getFirestore,limit,onSnapshot,orderBy,query,where} from 'firebase/firestore';
import {onIdTokenChanged} from 'firebase/auth';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {taylorOwnerSession} from '@/owner/taylor-services-client';
import {CLIENT_HUB_FUNCTIONS_REGION,verifiedClientHubConnection} from './client';
import {clientHubObject,ClientHubDataError,decodeClientHubClient} from './model';
import {decodeHubInvoice,decodeHubInvoiceAlert,invoiceId,type HubInvoiceAlert} from './invoice-model';
async function connection(owner:boolean,signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(!owner){const session=await verifiedClientHubConnection(signal);return{...session,clientId:session.session.clientId,authVersion:session.session.authVersion};}
 const session=await taylorOwnerSession();return{...session,db:getFirestore(session.auth.app),functions:getFunctions(session.auth.app,CLIENT_HUB_FUNCTIONS_REGION),clientId:undefined,authVersion:undefined,assertCurrent(){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');session.assertCurrent();}};
}
function assertScope(clientId:string,expected?:string){if(expected&&clientId!==expected)throw new ClientHubDataError('This invoice belongs to a different account.');}
async function call(owner:boolean,name:string,input:unknown,signal?:AbortSignal){const session=await connection(owner,signal);session.assertCurrent();const response=await httpsCallable(session.functions,name)(input);session.assertCurrent();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');return{raw:clientHubObject(response.data),clientId:session.clientId};}
export async function listHubInvoices(owner:boolean,signal?:AbortSignal){const{raw,clientId}=await call(owner,'tmcHubListInvoices',{},signal);if(!Array.isArray(raw.invoices)||raw.invoices.length>100||typeof raw.hasMore!=='boolean')throw new ClientHubDataError('The invoice list could not be verified.');const invoices=raw.invoices.map(value=>{const item=decodeHubInvoice(value);assertScope(item.clientId,clientId);return item;});if(new Set(invoices.map(row=>row.invoiceId)).size!==invoices.length)throw new ClientHubDataError('The invoice list contains duplicate records.');return{invoices,hasMore:raw.hasMore};}
export async function readHubInvoice(owner:boolean,id:string,signal?:AbortSignal){invoiceId(id);const{raw,clientId}=await call(owner,'tmcHubReadInvoice',{invoiceId:id},signal);const invoice=decodeHubInvoice(raw.invoice);assertScope(invoice.clientId,clientId);if(invoice.invoiceId!==id)throw new ClientHubDataError('The invoice response did not match.');return invoice;}
export async function acknowledgeHubInvoiceAlert(owner:boolean,value:HubInvoiceAlert,dismissed:boolean,signal?:AbortSignal){const item=decodeHubInvoiceAlert(value);if(item.recipientRole!==(owner?'owner':'client')||typeof dismissed!=='boolean')throw new ClientHubDataError('Choose your own invoice alert.');const session=await connection(owner,signal);assertScope(item.clientId,session.clientId);session.assertCurrent();const response=await httpsCallable(session.functions,'tmcHubAcknowledgeInvoiceAlert')({alertId:item.alertId,expectedVersion:item.version,dismissed});session.assertCurrent();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const result=decodeHubInvoiceAlert(clientHubObject(response.data).alert,item.alertId);if(result.clientId!==item.clientId||result.invoiceId!==item.invoiceId||result.recipientRole!==item.recipientRole||result.kind!==item.kind||result.amountCents!==item.amountCents||result.version<item.version||!result.read||dismissed&&!result.dismissed)throw new ClientHubDataError('The invoice alert action could not be confirmed.');return result;}
/** Read-only dedicated projection stream; never mixes invoice events into project notifications. */
export function subscribeHubInvoiceAlerts(owner:boolean,onData:(items:HubInvoiceAlert[],hasMore:boolean)=>void,onError:(error:unknown)=>void){
 let active=true;const controller=new AbortController(),stops:(()=>void)[]=[];
 const stop=()=>{active=false;controller.abort();stops.splice(0).forEach(fn=>fn());};
 const fail=(error:unknown)=>{if(!active)return;onData([],false);stop();onError(error);};
 void connection(owner,controller.signal).then(session=>{
  if(!active)return;session.assertCurrent();const role=owner?'owner':'client';
  if(owner){
  stops.push(onSnapshot(query(collection(session.db,'hubInvoiceAlerts'),where('recipientRole','==',role),...(session.clientId?[where('clientId','==',session.clientId)]:[]),where('dismissed','==',false),orderBy('createdAt','desc'),limit(101)),{includeMetadataChanges:true},snapshot=>{
   if(!active||snapshot.metadata.fromCache)return;
   try{session.assertCurrent();const items=snapshot.docs.map(row=>{const item=decodeHubInvoiceAlert(row.data(),row.id);assertScope(item.clientId,session.clientId);if(item.recipientRole!==role)throw new ClientHubDataError('The invoice alert scope changed.');return item;}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));onData(items.slice(0,100),items.length>100);}catch(error){fail(error);}
  },fail));
  }else{
   let inFlight=false;let generation=0;
   const poll=async()=>{if(!active||inFlight||typeof document!=="undefined"&&document.visibilityState==="hidden")return;inFlight=true;const current=++generation;
    try{session.assertCurrent();const response=await httpsCallable(session.functions,'tmcHubListInvoiceAlerts')({});session.assertCurrent();if(!active||current!==generation)return;
     const raw=clientHubObject(response.data);if(!Array.isArray(raw.alerts)||raw.alerts.length>100||typeof raw.hasMore!=="boolean")throw Error('Invoice alerts could not be verified.');
     const items=raw.alerts.map(value=>{const item=decodeHubInvoiceAlert(value);assertScope(item.clientId,session.clientId);if(item.recipientRole!=="client")throw Error('Invoice alert scope changed.');return item;});onData(items,raw.hasMore);
    }catch(error){if(active&&current===generation)fail(error);}finally{inFlight=false;}
   };
   const timer=setInterval(()=>{void poll();},20000);const visible=()=>{void poll();};
   if(typeof document!=="undefined")document.addEventListener('visibilitychange',visible);
   stops.push(()=>{generation++;clearInterval(timer);if(typeof document!=="undefined")document.removeEventListener('visibilitychange',visible);});void poll();
  }
  if(session.clientId)stops.push(onSnapshot(doc(session.db,'hubClients',session.clientId),{includeMetadataChanges:true},snapshot=>{if(!active||snapshot.metadata.fromCache)return;try{session.assertCurrent();if(!snapshot.exists())throw Error('Client access ended.');const client=decodeClientHubClient(snapshot.data(),session.clientId);if(client.status!=='active'||client.authVersion!==session.authVersion)throw Error('Client access changed.');}catch(error){fail(error);}},fail));
  stops.push(onIdTokenChanged(session.auth,()=>{if(!active)return;try{session.assertCurrent();}catch(error){fail(error);}},fail));
 }).catch(fail);return stop;
}
