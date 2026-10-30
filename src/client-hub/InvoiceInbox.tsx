"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog} from '@/owner/OwnerDialog';
import {acknowledgeHubInvoiceAlert,listHubInvoices,readHubInvoice,subscribeHubInvoiceAlerts} from './invoice-client';
import {invoiceMoney,type HubInvoice,type HubInvoiceAlert} from './invoice-model';
import styles from './InvoiceInbox.module.css';
import {OwnerSelect} from '@/owner/OwnerFields';
import buttons from '@/owner/OwnerButton.module.css';
const authorityFailure=(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&['unauthenticated','permission-denied','functions/unauthenticated','functions/permission-denied','auth/user-token-expired','session-expired'].includes(String(error.code));
const label=(item:HubInvoiceAlert)=>item.kind==='invoice-sent'?'Invoice ready':item.kind==='payment-full'?'Full payment verified':'Partial payment verified';
/** A read-only overlay: commission drafts remain mounted and no navigation event is emitted. */
export function useInvoiceInbox(owner:boolean,accountKey:string){
 const key=`${owner?'owner':'client'}:${accountKey}`;
 const [state,setState]=useState<{key:string;alerts:HubInvoiceAlert[];more:boolean;error:string}|null>(null);
 const [view,setView]=useState<{key:string;open:boolean;invoices:HubInvoice[];more:boolean;invoice:HubInvoice|null;loading:boolean;error:string}|null>(null);
 const [commissionFilter,setCommissionFilter]=useState<{key:string;id:string}>({key,id:""});
 const [action,setAction]=useState<{key:string;busy:boolean;error:string}|null>(null);
 const scope=useRef<{key:string;active:boolean;valid:boolean;revoke?:()=>void}>({key,active:false,valid:false});
 const batch=useRef<object|null>(null);
 const request=useRef<AbortController|null>(null),writes=useRef(new Map<string,AbortController>());
 useEffect(()=>{
  const current:{key:string;active:boolean;valid:boolean;revoke?:()=>void}={key,active:true,valid:true};scope.current=current;
  let stop=()=>{};
  current.revoke=()=>{
   if(scope.current!==current||!current.active)return;current.valid=false;stop();request.current?.abort();writes.current.forEach(c=>c.abort());writes.current.clear();
   setState({key,alerts:[],more:false,error:'Invoice updates could not be verified. Sign in again or refresh the Hub.'});setView(null);setAction(null);
  };
  stop=subscribeHubInvoiceAlerts(owner,(alerts,more)=>{if(scope.current===current&&current.active&&current.valid)setState({key,alerts,more,error:''});},()=>current.revoke?.());
  const pending=writes.current;
  return()=>{current.active=false;current.valid=false;stop();request.current?.abort();pending.forEach(c=>c.abort());pending.clear();};
 },[key,owner]);
 const current=()=>scope.current.key===key&&scope.current.active&&scope.current.valid;
 async function acknowledge(item:HubInvoiceAlert,dismissed:boolean){
  if(!current()||writes.current.has(item.alertId))return;const captured=scope.current,controller=new AbortController();writes.current.set(item.alertId,controller);setAction({key,busy:true,error:''});
  try{const saved=await acknowledgeHubInvoiceAlert(owner,item,dismissed,controller.signal);if(scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted)return;
   setState(previous=>previous?.key!==key?previous:{...previous,alerts:previous.alerts.map(row=>row.alertId===saved.alertId&&row.version<=saved.version?saved:row)});
  }catch(error){if(authorityFailure(error)&&scope.current===captured&&captured.active){captured.revoke?.();return;}if(scope.current===captured&&captured.active&&captured.valid&&!controller.signal.aborted)setAction({key,busy:true,error:'The invoice alert action was not confirmed. Try again; the invoice and payment are unchanged.'});}
  finally{if(writes.current.get(item.alertId)===controller)writes.current.delete(item.alertId);if(scope.current===captured&&captured.active)setAction(previous=>({key,busy:writes.current.size>0,error:previous?.key===key?previous.error:''}));}
 }
 async function openInvoice(id?:string,alert?:HubInvoiceAlert){
  if(!current())return;request.current?.abort();const controller=new AbortController();request.current=controller;const captured=scope.current;
  setView(previous=>({key,open:true,invoices:previous?.key===key?previous.invoices:[],more:previous?.key===key?previous.more:false,invoice:null,loading:true,error:''}));
  try{const result=id?await readHubInvoice(owner,id,controller.signal):await listHubInvoices(owner,controller.signal);if(scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted||request.current!==controller)return;
   if('invoices' in result)setView({key,open:true,invoices:result.invoices,more:result.hasMore,invoice:null,loading:false,error:''});
   else{setView(previous=>({key,open:true,invoices:previous?.key===key?previous.invoices:[],more:previous?.key===key?previous.more:false,invoice:result,loading:false,error:''}));if(alert&&!alert.read)void acknowledge(alert,false);}
  }catch(error){if(authorityFailure(error)&&scope.current===captured&&captured.active){captured.revoke?.();return;}if(scope.current===captured&&captured.active&&captured.valid&&!controller.signal.aborted)setView({key,open:true,invoices:[],more:false,invoice:null,loading:false,error:'Invoices could not be verified. Refresh the list to try again.'});}
 }
 function close(){request.current?.abort();request.current=null;setView(null);}
 const checking=state?.key!==key;
 const alerts=state?.key===key?state.alerts:[],visible=alerts.filter(item=>!item.dismissed),unread=visible.filter(item=>!item.read).length;
 const selected=view?.key===key&&view.open?view:null,invoice=selected?.invoice,actionBusy=action?.key===key&&action.busy;
 const entry=<button type="button" className={styles.entry} onClick={()=>void openInvoice()} aria-label="Open invoices">Invoices</button>;
 const alertSection=<section className={styles.alerts} aria-label="Invoice notifications"><h3>Invoices & payments</h3><button type="button" className={styles.entry} onClick={()=>void openInvoice()}>View saved invoices</button>{state?.key===key&&state.error&&<p role="alert">{state.error}</p>}{action?.key===key&&action.error&&<p role="alert">{action.error}</p>}{checking?<p role="status">Checking invoice alerts…</p>:visible.length?<ul>{visible.map(item=><li key={item.alertId}><button type="button" className={styles.openAlert} onClick={()=>void openInvoice(item.invoiceId,item)}><strong>{label(item)}</strong><span>{invoiceMoney(item.amountCents)} · Sandbox</span><small>{item.read?'Read':'Unread'} · {new Date(item.createdAt).toLocaleString()}</small></button><button type="button" disabled={actionBusy} aria-label={`Dismiss ${label(item).toLowerCase()}`} onClick={()=>void acknowledge(item,true)}>×</button></li>)}</ul>:!state?.error&&<p>No invoice alerts.</p>}{state?.key===key&&state.more&&<p>Showing up to 100 alerts. Open Invoices to check saved invoices.</p>}</section>;
 const dialog=selected&&<div className={styles.dialogScope}><Dialog title={invoice?`Invoice ${invoice.invoiceNumber}`:'Your invoices'} onClose={close} actions={<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={close}>Close invoices</button>}><div className={styles.inbox}><p className={styles.sandbox}>PayPal Sandbox · Test invoices only</p>{selected.loading?<p role="status">Checking verified invoices…</p>:selected.error?<p role="alert">{selected.error}</p>:invoice?<>
  <div className={styles.commission}><small>Commission</small><h3>{invoice.projectTitle||"Unassigned legacy invoice"}</h3><span>{invoice.invoiceNumber}</span></div><div className={styles.amounts}><div>Total<strong>{invoiceMoney(invoice.totalCents)}</strong></div><div>Verified paid<strong>{invoiceMoney(invoice.paidCents)}</strong></div><div>Balance<strong>{invoiceMoney(invoice.balanceCents)}</strong></div></div>
  <p>Status: {invoice.status.replaceAll('_',' ').toLowerCase()}</p>{invoice.paymentReview&&<p role="status">Payment verification needs review. Check your existing payment status in PayPal before making another payment. No unverified payment is counted.</p>}
  {invoice.depositPolicy&&<section className={styles.deposit}><strong>{invoice.depositPolicy.overridden?'Taylor-approved deposit':'Required initial deposit · 40%'}</strong><span>{invoiceMoney(invoice.depositPolicy.requiredCents)}</span><p>{invoice.depositStatus?.status==='satisfied'?'Deposit covered by verified payments':invoice.depositStatus?.status==='due'?`Deposit remaining: ${invoiceMoney(invoice.depositStatus.remainingCents)}`:'Deposit payment verification pending'}. Taylor reviews verified payments. PayPal does not automatically collect an initial deposit.</p></section>}
  <h3>{invoice.plan.kind==='scheduled'?'Installment schedule':invoice.plan.kind==='flexible'?'Flexible payments':'Full payment'}</h3>
  {invoice.plan.kind==='flexible'&&<p>Pay at your pace{invoice.plan.minimumCents?` · minimum payment ${invoiceMoney(invoice.plan.minimumCents)}`:''}. Payments are initiated by you in PayPal.</p>}
  {invoice.installmentProgress.length>0&&<p>{invoice.installmentProgress.some(row=>row.status==='unverified')?'Remaining installment count awaits verification':`${invoice.installmentProgress.filter(row=>row.status!=='paid').length} installments remaining`}</p>}{invoice.installmentProgress.length>0&&<ol className={styles.schedule}>{invoice.installmentProgress.map(row=><li key={`${row.dueDate}-${row.amountCents}`}><span>Due {row.dueDate}</span><strong>{invoiceMoney(row.amountCents)}</strong><span>{row.status==='unverified'?'Awaiting verification':`${invoiceMoney(row.paidCents)} paid · ${row.status}`}</span></li>)}</ol>}
  <p className={styles.note}>This plan does not set up automatic charges, reminders, or late fees. Verified payments reduce the balance; dismissing an alert never changes a payment.</p>
  {invoice.sandboxPayUrl?<a className={styles.payLink} href={invoice.sandboxPayUrl} target="_blank" rel="noopener noreferrer">Open invoice in PayPal Sandbox ↗</a>:<p>No verified PayPal payment link is available.</p>}
  <small>Updated {new Date(invoice.updatedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"long"})}</small>
 </>:<>{selected.invoices.length>0&&<OwnerSelect label="Commission" value={commissionFilter.key===key?commissionFilter.id:""} onChange={id=>setCommissionFilter({key,id})} placeholder="Choose a commission" options={Array.from(new Map(selected.invoices.map(item=>[item.projectId||"__unassigned",{value:item.projectId||"__unassigned",label:item.projectTitle||"Unassigned legacy invoices"}])).values())}/>}<p className={styles.note}>Choose one commission to view its invoices. Legacy invoices stay unassigned until Taylor links them.</p>{selected.invoices.length?<ul className={styles.invoiceList}>{selected.invoices.filter(item=>commissionFilter.key===key&&(item.projectId||"__unassigned")===commissionFilter.id).map(item=><li key={item.invoiceId}><button type="button" onClick={()=>void openInvoice(item.invoiceId)}><strong>Invoice {item.invoiceNumber}</strong><span>{invoiceMoney(item.totalCents)} · {item.status.replaceAll('_',' ').toLowerCase()}</span><small>Balance {invoiceMoney(item.balanceCents)}</small></button></li>)}</ul>:<p>No verified sent invoices yet.</p>}{selected.more&&<p>Showing up to 100 invoices. Ask Taylor about an older invoice if it is not listed.</p>}</>}
 <button type="button" disabled={selected.loading} onClick={()=>void openInvoice()}>{invoice?'Back to invoice list':'Refresh invoices'}</button></div></Dialog></div>;
 async function markAllRead(){
  if(!current()||batch.current===scope.current)return;const captured=scope.current;batch.current=captured;
  const items=visible.filter(row=>!row.read);
  try{for(let start=0;start<items.length;start+=4){if(scope.current!==captured||!captured.active||!captured.valid)return;await Promise.all(items.slice(start,start+4).map(item=>acknowledge(item,false)));}}
  finally{if(batch.current===captured)batch.current=null;}
 }
 return{entry,alertSection,dialog,unread,checking,busy:!!actionBusy,markAllRead};
}
/** Standalone entry used by the same authenticated Hub presentation. */
export function InvoiceInbox({owner,accountKey,showAlerts=false}:{owner:boolean;accountKey:string;showAlerts?:boolean}){const inbox=useInvoiceInbox(owner,accountKey);return<>{inbox.entry}{showAlerts&&inbox.alertSection}{inbox.dialog}</>;}
