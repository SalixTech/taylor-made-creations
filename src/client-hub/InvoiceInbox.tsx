"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Dialog} from '@/owner/OwnerDialog';
import {RefreshIcon} from '@/components/RefreshIcon';
import {WorkspaceLoading} from '@/components/WorkspaceLoading';
import {acknowledgeHubInvoiceAlert,captureHubInvoiceAlerts,listHubInvoices,readHubInvoice,subscribeHubInvoiceAlerts} from './invoice-client';
import {invoiceMoney,type HubInvoice,type HubInvoiceAlert} from './invoice-model';
import styles from './InvoiceInbox.module.css';
import {invoicePaymentDateLabel} from './invoice-payment-dates';
import {OwnerSelect} from '@/owner/OwnerFields';
import buttons from '@/owner/OwnerButton.module.css';
const authorityFailure=(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&['unauthenticated','permission-denied','functions/unauthenticated','functions/permission-denied','auth/user-token-expired','session-expired'].includes(String(error.code));
const label=(item:HubInvoiceAlert)=>item.kind==='invoice-due'?'Installment reminder':item.kind==='invoice-sent'?'Invoice ready':item.kind==='payment-full'?'Full payment received':'Partial payment received';
export type InvoiceSupportTarget={clientId:string;projectId:string;invoiceId:string;isCurrent:()=>boolean};
export type InvoiceSupportNavigation=(target:InvoiceSupportTarget,onAccepted:()=>void,onRejected:(message:string)=>void)=>void;
export const invoiceStatusLabel=(status:string)=>status==='partially-paid'||status==='partial'?'Partial Paid':status==='unpaid'?'Unpaid':status.replaceAll('_',' ').replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase());
export const verifiedDepositCovered=(invoice:HubInvoice)=>!!invoice.depositPolicy&&!invoice.paymentReview&&invoice.paidCents!==null&&invoice.paidCents>=invoice.depositPolicy.requiredCents&&invoice.depositStatus?.status==='satisfied';
/** A read-only overlay: commission drafts remain mounted and no navigation event is emitted. */
export function useInvoiceInbox(owner:boolean,accountKey:string,onContactSupport?:InvoiceSupportNavigation,watchAlerts=true){
 const key=`${owner?'owner':'client'}:${accountKey}`;
 const [state,setState]=useState<{key:string;alerts:HubInvoiceAlert[];more:boolean;error:string}|null>(null);
 const [view,setView]=useState<{key:string;open:boolean;invoices:HubInvoice[];more:boolean;invoice:HubInvoice|null;loading:boolean;error:string}|null>(null);
 const [supportError,setSupportError]=useState(""),[supportLoading,setSupportLoading]=useState(false);
 const [commissionFilter,setCommissionFilter]=useState<{key:string;id:string}>({key,id:""});
 const [action,setAction]=useState<{key:string;busy:boolean;error:string}|null>(null);
 const supportNavigation=useRef(onContactSupport);useLayoutEffect(()=>{supportNavigation.current=onContactSupport;},[onContactSupport]);
 const scope=useRef<{key:string;active:boolean;valid:boolean;revoke?:()=>void}>({key,active:false,valid:false});
 const batch=useRef<object|null>(null);
 const requestPending=useRef(false),supportTicket=useRef<object|null>(null),latestInvoice=useRef<HubInvoice|null>(null);
 const[refreshError,setRefreshError]=useState<{key:string;message:string}|null>(null);
 const [requestedDetail,setRequestedDetail]=useState<{key:string;id:string}|null>(null);
 const requestedInvoice=useRef<{id:string;projectId?:string}|null>(null);
 const request=useRef<AbortController|null>(null),writes=useRef(new Map<string,AbortController>());
 useEffect(()=>{
  const current:{key:string;active:boolean;valid:boolean;revoke?:()=>void}={key,active:true,valid:true};scope.current=current;
  let stop=()=>{};
  current.revoke=()=>{
   if(scope.current!==current||!current.active)return;current.valid=false;stop();request.current?.abort();writes.current.forEach(c=>c.abort());writes.current.clear();
   setState({key,alerts:[],more:false,error:'Invoice updates could not be verified. Sign in again or refresh the Hub.'});setView(null);setAction(null);setRefreshError(null);
  };
  if(watchAlerts)stop=subscribeHubInvoiceAlerts(owner,(alerts,more)=>{if(scope.current===current&&current.active&&current.valid)setState({key,alerts,more,error:''});},()=>current.revoke?.());
  const pending=writes.current;
  return()=>{current.active=false;current.valid=false;stop();request.current?.abort();pending.forEach(c=>c.abort());pending.clear();};
 },[key,owner,watchAlerts]);
 const current=()=>scope.current.key===key&&scope.current.active&&scope.current.valid;
 async function acknowledge(item:HubInvoiceAlert,dismissed:boolean){
  if(!current()||writes.current.has(item.alertId))return;const captured=scope.current,controller=new AbortController();writes.current.set(item.alertId,controller);setAction(previous=>({key,busy:true,error:batch.current===captured&&previous?.key===key?previous.error:''}));
  try{const saved=await acknowledgeHubInvoiceAlert(owner,item,dismissed,controller.signal);if(scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted)return;
   setState(previous=>previous?.key!==key?previous:{...previous,alerts:previous.alerts.map(row=>row.alertId===saved.alertId&&row.version<=saved.version?saved:row)});
  }catch(error){if(authorityFailure(error)&&scope.current===captured&&captured.active){captured.revoke?.();return;}if(scope.current===captured&&captured.active&&captured.valid&&!controller.signal.aborted)setAction({key,busy:true,error:'The invoice alert action was not confirmed. Try again; the invoice and payment are unchanged.'});}
  finally{if(writes.current.get(item.alertId)===controller)writes.current.delete(item.alertId);if(scope.current===captured&&captured.active)setAction(previous=>({key,busy:writes.current.size>0,error:previous?.key===key?previous.error:''}));}
 }
 async function openInvoice(id?:string,alert?:HubInvoiceAlert,expectedProjectId?:string){
  if(!current()||!owner&&!id)return;requestedInvoice.current=id?{id,projectId:expectedProjectId}:null;setRequestedDetail(id?{key,id}:null);supportTicket.current=null;writes.current.get("support-read")?.abort();writes.current.delete("support-read");setSupportError("");setSupportLoading(false);request.current?.abort();const controller=new AbortController();request.current=controller;requestPending.current=true;setRefreshError(null);const captured=scope.current;
  setView(previous=>({key,open:true,invoices:previous?.key===key?previous.invoices:[],more:previous?.key===key?previous.more:false,invoice:null,loading:true,error:''}));
  try{const result=id?await readHubInvoice(owner,id,controller.signal):await listHubInvoices(owner,controller.signal);if(scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted||request.current!==controller)return;
   if('invoices' in result)setView({key,open:true,invoices:result.invoices,more:result.hasMore,invoice:null,loading:false,error:''});
   else{if(!owner&&(!result.projectId||expectedProjectId&&result.projectId!==expectedProjectId))throw new Error('Invoice commission unavailable');if(!owner&&requestedInvoice.current?.id===result.invoiceId)requestedInvoice.current.projectId=result.projectId;setView(previous=>({key,open:true,invoices:previous?.key===key?previous.invoices:[],more:previous?.key===key?previous.more:false,invoice:result,loading:false,error:''}));if(alert&&!alert.read)void acknowledge(alert,false);}
  }catch(error){if(authorityFailure(error)&&scope.current===captured&&captured.active){captured.revoke?.();return;}if(scope.current===captured&&captured.active&&captured.valid&&!controller.signal.aborted)setView({key,open:true,invoices:[],more:false,invoice:null,loading:false,error:owner?'Invoices could not be verified. Refresh the list to try again.':'This commission invoice could not be verified. Refresh to try again, or ask Taylor to confirm its commission link.'});}
  finally{if(request.current===controller)requestPending.current=false;}
 }
 function close(){setRequestedDetail(null);requestedInvoice.current=null;supportTicket.current=null;writes.current.get("support-read")?.abort();writes.current.delete("support-read");setSupportError("");setSupportLoading(false);request.current?.abort();request.current=null;requestPending.current=false;setView(null);setRefreshError(null);}
 const checking=state?.key!==key;
 const alerts=state?.key===key?state.alerts:[],visible=alerts.filter(item=>!item.dismissed),unread=visible.filter(item=>!item.read).length;
 const selected=view?.key===key&&view.open?view:null,invoice=selected?.invoice,actionBusy=action?.key===key&&action.busy;
 useLayoutEffect(()=>{latestInvoice.current=invoice??null;},[invoice]);
 const openKey=selected?key:null,detailId=invoice?.invoiceId??(requestedDetail?.key===key?requestedDetail.id:null);
 useEffect(()=>{
  if(!openKey)return;
  const captured=scope.current;let alive=true,ownRequest:AbortController|null=null;
  async function refresh(){
   if(!owner&&!detailId)return;
   if(!alive||!captured.active||!captured.valid||scope.current!==captured||document.visibilityState==='hidden'||requestPending.current)return;
   const controller=new AbortController();ownRequest=controller;request.current=controller;requestPending.current=true;
   try{const result=detailId?await readHubInvoice(owner,detailId,controller.signal):await listHubInvoices(owner,controller.signal);
    if(!alive||scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted||request.current!==controller)return;
    if(!owner&&!('invoices' in result)&&(!result.projectId||requestedInvoice.current?.projectId&&result.projectId!==requestedInvoice.current.projectId))throw Object.assign(new Error('Invoice commission changed'),{code:'invoice-scope-unavailable'});
    if(!owner&&!('invoices' in result)&&requestedInvoice.current?.id===result.invoiceId)requestedInvoice.current.projectId=result.projectId;
    setView(previous=>{if(previous?.key!==key||!previous.open||(previous.invoice?.invoiceId??requestedInvoice.current?.id??null)!==detailId)return previous;
     if('invoices' in result)return{...previous,invoices:result.invoices.map(row=>{const old=previous.invoices.find(item=>item.invoiceId===row.invoiceId);return old&&old.version>row.version?old:row;}),more:result.hasMore};
     return{...previous,error:'',invoice:previous.invoice&&previous.invoice.version>result.version?previous.invoice:result};});
    setRefreshError(null);
   }catch(error){if(!alive||scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted||request.current!==controller)return;if(authorityFailure(error)){captured.revoke?.();return;}
    const code=error&&typeof error==='object'&&'code' in error?String(error.code).split('/').at(-1):'';
    if(code==='not-found'||code==='invoice-scope-unavailable'){setView(previous=>previous?.key===key?{...previous,invoice:null,invoices:[],error:owner?'This invoice is no longer available. Refresh the list to check your current invoices.':'This commission invoice is no longer available. Ask Taylor to confirm its commission link.'}:previous);}
    else setRefreshError({key,message:'Automatic refresh could not be verified. The information below is from the last successful check and may be out of date.'});
   }finally{if(request.current===controller)requestPending.current=false;}
  }
  const visible=()=>{if(document.visibilityState!=='hidden')void refresh();};const timer=window.setInterval(()=>void refresh(),15000);document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
  return()=>{alive=false;ownRequest?.abort();if(ownRequest&&request.current===ownRequest)requestPending.current=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);};
 },[openKey,detailId,key,owner]);
 async function contactSupport(invoice:HubInvoice){
  if(owner||!onContactSupport||!invoice.projectId||!current()||writes.current.has("support-read"))return;
  const captured=scope.current,ticket={},controller=new AbortController();supportTicket.current=ticket;writes.current.set("support-read",controller);setSupportError("");setSupportLoading(true);
  const isCurrent=()=>scope.current===captured&&captured.active&&captured.valid&&supportTicket.current===ticket&&latestInvoice.current?.invoiceId===invoice.invoiceId&&latestInvoice.current?.clientId===invoice.clientId&&latestInvoice.current?.projectId===invoice.projectId;
  try{const verified=await readHubInvoice(owner,invoice.invoiceId,controller.signal);if(!isCurrent()||controller.signal.aborted)return;
   if(verified.clientId!==invoice.clientId||verified.projectId!==invoice.projectId){setSupportError("This invoice’s commission link changed. Refresh the invoice before contacting Taylor; no commission was opened.");return;}
   if(!supportNavigation.current){setSupportError("Open this commission’s Requests tab to contact Taylor.");return;}
   supportNavigation.current({clientId:verified.clientId,projectId:verified.projectId!,invoiceId:verified.invoiceId,isCurrent},()=>{if(isCurrent())close();},message=>{if(isCurrent())setSupportError(message);});
  }catch(error){if(authorityFailure(error)&&scope.current===captured){captured.revoke?.();return;}if(isCurrent()&&!controller.signal.aborted)setSupportError("The invoice’s commission could not be verified. Refresh and try again; your workspace is unchanged.");}
  finally{if(writes.current.get("support-read")===controller)writes.current.delete("support-read");if(scope.current===captured&&captured.active)setSupportLoading(false);}
 }
 const entry=owner?<button type="button" className={styles.entry} onClick={()=>void openInvoice()} aria-label="Open invoices">Invoices</button>:null;
 const alertSection=<section className={styles.alerts} aria-label="Invoice notifications"><h3>Invoices & payments</h3>{owner&&<button type="button" className={styles.textAction} onClick={()=>void openInvoice()}>View saved invoices</button>}{state?.key===key&&state.error&&<div role="alert" className={styles.dismissibleError}><span>{state.error}</span><button type="button" aria-label="Dismiss invoice connection error" onClick={()=>setState(previous=>previous?.key===key?{...previous,error:''}:previous)}>×</button></div>}{action?.key===key&&action.error&&<div role="alert" className={styles.dismissibleError}><span>{action.error}</span><button type="button" aria-label="Dismiss invoice alert error" onClick={()=>setAction(previous=>previous?.key===key?{...previous,error:''}:previous)}>×</button></div>}{checking?<p role="status">Checking invoice alerts…</p>:visible.length?<ul>{visible.map(item=><li key={item.alertId}><button type="button" className={styles.openAlert} onClick={()=>void openInvoice(item.invoiceId,item)}><strong>{label(item)}</strong><span>{item.kind==='invoice-due'?`Remaining when reminder was created: ${invoiceMoney(item.amountCents)}`:invoiceMoney(item.amountCents)} · Sandbox</span>{item.kind==='invoice-due'&&<small>Original due date: {item.dueDate} · {item.reminderTimeZone}</small>}<small>{item.read?'Read':'Unread'} · {new Date(item.createdAt).toLocaleString()}</small></button><button type="button" disabled={actionBusy} aria-label={`Dismiss ${label(item).toLowerCase()}`} onClick={()=>void acknowledge(item,true)}>×</button></li>)}</ul>:!state?.error&&<p>No invoice alerts.</p>}{state?.key===key&&state.more&&<p>Showing up to 100 alerts. {owner?'Open Invoices to check saved invoices.':'Open the relevant commission to view its invoice.'}</p>}</section>;
 const dialog=selected&&<div className={styles.dialogScope}><Dialog title={invoice?`Invoice ${invoice.invoiceNumber}`:owner?'Your invoices':'Commission invoice'} onClose={close} headingActions={(invoice||detailId||owner)?<button type="button" data-owner-button className={`${buttons.button} ${buttons.quiet} ${buttons.icon}`} aria-label="Refresh invoice" title="Refresh invoice" disabled={selected.loading} onClick={()=>void openInvoice(invoice?.invoiceId??detailId??undefined,undefined,invoice?.projectId??requestedInvoice.current?.projectId)}><RefreshIcon/></button>:undefined} actions={<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} onClick={close}>Close</button>}><div className={styles.inbox}><p className={styles.sandbox}>PayPal Sandbox · Test invoices only</p>{refreshError?.key===key&&<p role="status">{refreshError.message}</p>}{selected.loading?<div className={styles.loading} role="status"><WorkspaceLoading title="Loading your invoice" description="Checking the latest verified payment information…" /></div>:selected.error?<div role="alert" className={styles.dismissibleError}><span>{selected.error}</span><button type="button" aria-label="Dismiss invoice read error" onClick={()=>setView(previous=>previous?.key===key?{...previous,error:''}:previous)}>×</button></div>:invoice?<>
  <div className={styles.detailHeading}><div className={styles.commission}><small>Commission</small><h3>{invoice.projectTitle||"Unassigned legacy invoice"}</h3><span>{invoice.invoiceNumber}</span></div><div className={styles.headingStatus}><span className={styles.statusBadge} data-invoice-status={invoice.status} aria-label={`Invoice status: ${invoice.status}`}>{invoiceStatusLabel(invoice.status)}</span>{!invoice.paymentReview&&invoice.paidCents===0&&invoice.balanceCents!==null&&invoice.balanceCents>0&&<span className={styles.statusBadge} data-invoice-status="unpaid">Unpaid</span>}</div></div><div className={styles.amounts}><div>Total<strong>{invoiceMoney(invoice.totalCents)}</strong></div><div>Paid<strong>{invoiceMoney(invoice.paidCents)}</strong></div><div>Balance<strong>{invoiceMoney(invoice.balanceCents)}</strong></div></div>
  {invoice.paymentReview&&<p role="status">Payment verification needs review. Check your existing payment status in PayPal before making another payment. No unverified payment is counted.</p>}
  {invoice.depositPolicy&&!verifiedDepositCovered(invoice)&&<section className={styles.deposit}><strong>{invoice.depositPolicy.overridden?'Taylor-approved deposit':`Required initial deposit · ${invoice.depositPolicy.defaultPercent}%`}</strong><span>{invoiceMoney(invoice.depositPolicy.requiredCents)}</span><p>{invoice.depositStatus?.status==='satisfied'?'Deposit covered by verified payments':invoice.depositStatus?.status==='due'?`Deposit remaining: ${invoiceMoney(invoice.depositStatus.remainingCents)}`:'Deposit payment verification pending'}. Verified payments are reviewed by Spade. PayPal does not automatically collect an initial deposit.</p></section>}
  <section className={styles.planDetails}><h3>{invoice.plan.kind==='scheduled'?'Installment schedule':invoice.plan.kind==='flexible'?'Flexible payments':'Full payment'}</h3>
  {invoice.plan.kind==='flexible'&&<p>Pay at your pace{invoice.plan.minimumCents?` · minimum payment ${invoiceMoney(invoice.plan.minimumCents)}`:''}. Payments are initiated by you in PayPal.</p>}
  {invoice.installmentProgress.length>0&&<p>{invoice.installmentProgress.some(row=>row.status==='unverified')?'Remaining installment count awaits verification':`${invoice.installmentProgress.filter(row=>row.status!=='paid').length} installments remaining`}</p>}{invoice.installmentProgress.length>0&&<ol className={styles.schedule}>{invoice.installmentProgress.map(row=><li key={`${row.dueDate}-${row.amountCents}`}><span>Due {row.dueDate}</span><strong>{invoiceMoney(row.amountCents)}</strong><span>{row.status==='unverified'?'Awaiting verification':<>{invoiceMoney(row.paidCents)} paid · <span className={styles.statusBadge} data-invoice-status={row.status}>{invoiceStatusLabel(row.status)}</span></>}</span>{!invoice.paymentReview&&row.paidCents!==null&&row.paidCents>0&&<div className={styles.paymentDates}>{row.payments?.length?row.payments.map((payment,index)=><small key={`${payment.paidOn}-${index}`}>{invoiceMoney(payment.amountCents)} paid on {invoicePaymentDateLabel(payment.paidOn)}</small>):<small>Payment date unavailable</small>}</div>}</li>)}</ol>}
  </section>{invoice.plan.kind!=='scheduled'&&!invoice.paymentReview&&invoice.paidCents!==null&&invoice.paidCents>0&&<section className={styles.paymentDates} aria-label="Verified payment dates"><h3>Payments received</h3>{invoice.paymentHistory?.length?invoice.paymentHistory.map((payment,index)=><p key={`${payment.paidOn}-${index}`}>{invoiceMoney(payment.amountCents)} paid on {invoicePaymentDateLabel(payment.paidOn)}</p>):<p>Payment date unavailable</p>}</section>}<p className={`${styles.note} ${styles.explanation}`}>This plan does not set up automatic charges or late fees. {invoice.plan.kind==='scheduled'&&<>Client Hub installment reminders appear on due dates only, with no daily overdue repeats or emails. </>}Verified payments reduce the balance; dismissing an alert never changes a payment.</p>
  {supportError&&<p role="alert">{supportError}</p>}<section className={styles.paymentHelp}><p>Payment updates can take up to 2 minutes to appear. If PayPal has confirmed your payment, do not pay again. If you still need help, contact Taylor.</p>{!owner&&(onContactSupport&&invoice.projectId?<button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${styles.supportButton}`} disabled={supportLoading} onClick={()=>void contactSupport(invoice)}>{supportLoading?"Checking commission…":"Contact Taylor"}</button>:<p className={styles.note}>{invoice.projectId?'Open this commission’s Requests tab and choose “I need help”.':'This legacy invoice is not linked to a commission. Ask Taylor to link it before opening commission support; no commission has been chosen for you.'}</p>)}</section>
  {invoice.sandboxPayUrl?<a className={styles.payLink} href={invoice.sandboxPayUrl} target="_blank" rel="noopener noreferrer">Open invoice in PayPal Sandbox ↗</a>:<p>No verified PayPal payment link is available.</p>}
  <small>Updated {new Date(invoice.updatedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"long"})}</small>
 </>:owner?<>{selected.invoices.length>0&&<OwnerSelect label="Commission" value={commissionFilter.key===key?commissionFilter.id:""} onChange={id=>setCommissionFilter({key,id})} placeholder="Choose a commission" options={Array.from(new Map(selected.invoices.map(item=>[item.projectId||"__unassigned",{value:item.projectId||"__unassigned",label:item.projectTitle||"Unassigned legacy invoices"}])).values())}/>}<p className={styles.note}>Choose one commission to view its invoices. Legacy invoices stay unassigned until Taylor links them.</p>{selected.invoices.length?<ul className={styles.invoiceList}>{selected.invoices.filter(item=>commissionFilter.key===key&&(item.projectId||"__unassigned")===commissionFilter.id).map(item=><li key={item.invoiceId}><button type="button" onClick={()=>void openInvoice(item.invoiceId)}><strong>Invoice {item.invoiceNumber}</strong><span>{invoiceMoney(item.totalCents)} · <span className={styles.statusBadge} data-invoice-status={item.status}>{invoiceStatusLabel(item.status)}</span></span><small>Balance {invoiceMoney(item.balanceCents)}</small></button></li>)}</ul>:<p>No verified sent invoices yet.</p>}{selected.more&&<p>Showing up to 100 invoices. Ask Taylor about an older invoice if it is not listed.</p>}</>:null}
 {owner&&invoice&&<button type="button" className={owner&&invoice?undefined:styles.refreshButton} aria-label={owner&&invoice?undefined:"Refresh invoice"} title={owner&&invoice?undefined:"Refresh invoice"} disabled={selected.loading} onClick={()=>void openInvoice(owner?undefined:requestedInvoice.current?.id,undefined,requestedInvoice.current?.projectId)}>{owner&&invoice?'Back to invoice list':<RefreshIcon/>}</button>}</div></Dialog></div>;
 async function markAllRead(dismissed=false,prepared?:HubInvoiceAlert[]){
  if(!current()||batch.current===scope.current)return;const captured=scope.current,controller=new AbortController();batch.current=captured;writes.current.set("batch",controller);setAction({key,busy:true,error:''});
  try{
   const items=prepared??(dismissed?await captureHubInvoiceAlerts(owner,controller.signal):visible.filter(row=>!row.read).map(row=>({...row})));
   for(let start=0;start<items.length;start+=4){if(scope.current!==captured||!captured.active||!captured.valid||controller.signal.aborted)return;await Promise.all(items.slice(start,start+4).map(item=>acknowledge(item,dismissed)));}
  }catch(error){if(authorityFailure(error)&&scope.current===captured){captured.revoke?.();return;}if(scope.current===captured&&captured.active&&captured.valid&&!controller.signal.aborted)setAction({key,busy:true,error:'Not all invoice alerts could be cleared. Try again; invoices and payments are unchanged.'});}
  finally{if(batch.current===captured)batch.current=null;if(writes.current.get("batch")===controller)writes.current.delete("batch");if(scope.current===captured&&captured.active)setAction(previous=>({key,busy:writes.current.size>0,error:previous?.key===key?previous.error:''}));}
 }

 return{entry,alertSection,dialog,unread,checking,busy:!!actionBusy,markAllRead,clearAll:()=>markAllRead(true),clearCaptured:(items:HubInvoiceAlert[])=>markAllRead(true,items),visibleCount:visible.length,openInvoice};
}
/** Standalone entry used by the same authenticated Hub presentation. */
export function InvoiceInbox({owner,accountKey,showAlerts=false,onContactSupport}:{owner:boolean;accountKey:string;showAlerts?:boolean;onContactSupport?:InvoiceSupportNavigation}){const inbox=useInvoiceInbox(owner,accountKey,onContactSupport);return<>{inbox.entry}{showAlerts&&inbox.alertSection}{inbox.dialog}</>;}
