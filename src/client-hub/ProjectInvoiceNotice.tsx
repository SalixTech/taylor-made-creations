"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog} from '@/owner/OwnerDialog';
import {listHubProjectInvoices} from './invoice-client';
import {invoiceMoney,type HubInvoice} from './invoice-model';
import {useInvoiceInbox,type InvoiceSupportNavigation,invoiceStatusLabel} from './InvoiceInbox';
import styles from './InvoiceInbox.module.css';
export function ProjectInvoiceNotice({clientId,projectId,accountKey,onContactSupport,onFailure,historyVersion=0,showNotice=true}:{historyVersion?:number;showNotice?:boolean;clientId:string;projectId:string;accountKey:string;onContactSupport:InvoiceSupportNavigation;onFailure:(cause:unknown)=>void}){
 const scope=`${accountKey}:${clientId}:${projectId}`,inbox=useInvoiceInbox(false,scope,onContactSupport,false);
 const [refreshKey,setRefreshKey]=useState(0),[closedHistory,setClosedHistory]=useState(0);
 const [state,setState]=useState<{scope:string;invoices:HubInvoice[];more:boolean;error:string}|null>(null);
 const failure=useRef(onFailure);useEffect(()=>{failure.current=onFailure;},[onFailure]);
 useEffect(()=>{
  let active=true,pending=false;const controller=new AbortController();
  async function refresh(){if(!active||pending||document.visibilityState==='hidden')return;pending=true;
   try{const result=await listHubProjectInvoices(false,projectId,controller.signal);if(!active||controller.signal.aborted)return;setState({scope,invoices:result.invoices.filter(row=>row.clientId===clientId&&row.projectId===projectId),more:result.hasMore,error:''});}
   catch(cause){if(!active||controller.signal.aborted)return;setState({scope,invoices:[],more:false,error:'Invoice balances could not be verified. Refresh this commission’s invoices to try again.'});const code=cause&&typeof cause==='object'&&'code' in cause?String(cause.code):'';if(/unauthenticated|permission-denied|session-expired|user-token-expired/.test(code))failure.current(cause);}
   finally{pending=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),15000),visible=()=>{if(document.visibilityState!=='hidden')void refresh();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller.abort();window.clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[scope,clientId,projectId,refreshKey]);
 const current=state?.scope===scope?state:null;
 const paid=(row:HubInvoice)=>row.paymentReview===false&&row.status==='paid'&&row.balanceCents===0&&row.paidCents===row.totalCents;
 const unknown=(row:HubInvoice)=>row.paymentReview||row.paidCents===null||row.balanceCents===null;
 const history=current?.invoices.filter(paid)??[],outstanding=current?.invoices.filter(row=>!paid(row))??[];
 const historyOpen=historyVersion>0&&historyVersion!==closedHistory;
 const rowCard=(row:HubInvoice)=><div className={styles.overviewInvoice} key={row.invoiceId}><strong>Invoice {row.invoiceNumber}</strong><p><span className={styles.statusBadge} data-invoice-status={unknown(row)?'unverified':!row.paymentReview&&row.paidCents===0&&row.balanceCents!==null&&row.balanceCents>0?'unpaid':row.status}>{unknown(row)?'Awaiting verification':!row.paymentReview&&row.paidCents===0&&row.balanceCents!==null&&row.balanceCents>0?'Unpaid':invoiceStatusLabel(row.status)}</span><span>{unknown(row)||row.balanceCents===null?'Balance awaiting verification':`Balance ${invoiceMoney(row.balanceCents)}`}</span></p><button type="button" onClick={()=>{if(historyOpen)setClosedHistory(historyVersion);void inbox.openInvoice(row.invoiceId,undefined,projectId);}}>View invoice</button></div>;
 const stateMessage=!current?<p role="status">Checking invoice balances…</p>:current.error?<><p role="status">{current.error}</p><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>Refresh commission invoices</button></>:null;
 return <>{showNotice&&(stateMessage||outstanding.length>0)&&<section className={styles.overviewNotice} aria-label="Commission invoices">{stateMessage||<><h3>Invoices & payments</h3>{outstanding.map(rowCard)}<small>Payment updates can take up to 2 minutes. If PayPal confirmed your payment, do not pay again.</small></>}</section>}{historyOpen&&<div className={styles.dialogScope}><Dialog title="Paid invoice history" onClose={()=>setClosedHistory(historyVersion)} actions={<button type="button" onClick={()=>setClosedHistory(historyVersion)}>Close</button>}><div className={styles.inbox}><p>Paid invoices for this commission only. This history does not change payments or Taylor’s archive.</p>{stateMessage|| (history.length?history.map(rowCard):<p>No verified paid invoices for this commission yet.</p>)}</div></Dialog></div>}{inbox.dialog}</>;
}
