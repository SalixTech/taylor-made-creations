import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
import {harness,content} from './owner-ui-harness.mjs';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',CLIENT='TMC-0123456789ABCDEF',OTHERCLIENT='TMC-ABCDEF0123456789',ISO='2026-10-30T00:00:00.000Z';
const invoice=(patch={})=>({invoiceId:ID,clientId:CLIENT,invoiceNumber:'GDT-S12345',currency:'USD',totalCents:10000,paidCents:2500,balanceCents:7500,plan:{kind:'flexible',minimumCents:1000},status:'partially-paid',paymentReview:false,installmentProgress:[],sandboxPayUrl:'https://www.sandbox.paypal.com/invoice/p/#AAAABBBBCCCCDDDD',version:3,updatedAt:ISO,published:true,...patch});
const alert=(patch={})=>({alertId:'a'.repeat(64),notificationId:'a'.repeat(64),clientId:CLIENT,recipientRole:'client',invoiceId:ID,kind:'invoice-sent',amountCents:10000,currency:'USD',createdAt:ISO,version:1,read:false,dismissed:false,...patch});
const model=sourceLoader()('src/client-hub/invoice-model.ts');
const tick=()=>new Promise(r=>setImmediate(r));const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const active=new Set();afterEach(()=>{for(const h of active)h.unmount();active.clear();});
test('invoice projection strips private fields and validates balanced totals, URLs, plans and progress',()=>{
 const value=model.decodeHubInvoice({...invoice(),recipientEmail:'private@example.test',transactions:[{secret:'hidden'}]});assert.doesNotMatch(JSON.stringify(value),/private@example|transactions|secret/);
 assert.equal(model.decodeHubInvoice(invoice({plan:undefined})).plan.kind,'full');
 const scheduled=invoice({plan:{kind:'scheduled',installments:[{dueDate:'2026-11-01',amountCents:5000},{dueDate:'2026-12-01',amountCents:5000}]},installmentProgress:[{dueDate:'2026-11-01',amountCents:5000,paidCents:2500,status:'partial'},{dueDate:'2026-12-01',amountCents:5000,paidCents:0,status:'unpaid'}]});assert.equal(model.decodeHubInvoice(scheduled).installmentProgress[0].paidCents,2500);
 for(const patch of [{published:false},{currency:'EUR'},{balanceCents:10000},{paidCents:10001},{paymentReview:true},{plan:null},{status:'paid'},{status:'sent'},{sandboxPayUrl:'https://www.paypal.com/invoice/p/TEST'},{sandboxPayUrl:'https://www.sandbox.paypal.com@attacker.test/invoice/p/TEST'},{sandboxPayUrl:'https://www.sandbox.paypal.com/invoice/p/TEST?email=secret'},{plan:{kind:'flexible',minimumCents:10001}},{plan:{kind:'scheduled',installments:[{dueDate:'2026-02-30',amountCents:5000},{dueDate:'2026-12-01',amountCents:5000}]}},{installmentProgress:[{dueDate:'2026-11-01',amountCents:5000,paidCents:2500,status:'paid'}]}])assert.throws(()=>model.decodeHubInvoice({...invoice(),...patch}));
 assert.throws(()=>model.decodeHubInvoice({...scheduled,installmentProgress:[{...scheduled.installmentProgress[0],paidCents:0,status:'unpaid'}, {...scheduled.installmentProgress[1],paidCents:2500,status:'partial'}]}));
});
test('invoice alerts remain separate role-specific facts, not project notification records',()=>{
 assert.equal(model.decodeHubInvoiceAlert(alert()).invoiceId,ID);assert.throws(()=>model.decodeHubInvoiceAlert(alert({recipientRole:'owner'})));assert.throws(()=>model.decodeHubInvoiceAlert(alert({kind:'payment-full'})));assert.throws(()=>model.decodeHubInvoiceAlert(alert({notificationId:'b'.repeat(64)})));assert.throws(()=>model.decodeHubInvoiceAlert(alert(),'b'.repeat(64)));
 assert.equal(model.decodeHubInvoiceAlert(alert({recipientRole:'owner',kind:'payment-partial',amountCents:2500})).amountCents,2500);
});
function transport(response,owner=false){const calls=[],streams=[],authChanges=[];let valid=true;const session={auth:{app:{name:'synthetic'}},db:{},functions:{},session:{clientId:CLIENT,authVersion:2},assertCurrent(){if(!valid)throw Error('revoked');}};
 const client=sourceLoader({'./client':{CLIENT_HUB_FUNCTIONS_REGION:'us-central1',async verifiedClientHubConnection(){return session;}},'@/owner/taylor-services-client':{async taylorOwnerSession(){return session;}},'firebase/functions':{getFunctions(){return{};},httpsCallable(_f,name){return async input=>{calls.push({name,input});return{data:typeof response==='function'?await response():response};};}},'firebase/auth':{onIdTokenChanged(_a,cb){authChanges.push(cb);return()=>{authChanges.stopped=true;};}},'firebase/firestore':{getFirestore(){return{};},collection(_db,path){return{path};},doc(_db,path,id){return{path,id};},where(...args){return args;},orderBy(...args){return{order:args};},limit(n){return{limit:n};},query(target,...filters){return{...target,filters};},onSnapshot(target,_opts,data,error){const row={target,data,error,stopped:false};streams.push(row);return()=>{row.stopped=true;};}}})('src/client-hub/invoice-client.ts');
 return{client,calls,streams,authChanges,owner,revoke(){valid=false;authChanges.forEach(cb=>cb());}};
}
test('real callable transport is claim scoped, allowlisted, current-session checked and receipt validated',async()=>{
 const t=transport({invoices:[invoice()],hasMore:false});await t.client.listHubInvoices(false);assert.deepEqual(t.calls,[{name:'tmcHubListInvoices',input:{}}]);
 await assert.rejects(transport({invoices:[invoice({clientId:OTHERCLIENT})],hasMore:false}).client.listHubInvoices(false));await assert.rejects(transport({invoice:invoice({invoiceId:OTHER})}).client.readHubInvoice(false,ID));
 const ack=transport({alert:alert({read:true,version:2})});await ack.client.acknowledgeHubInvoiceAlert(false,{...alert(),secret:'do not send'},false);assert.deepEqual(ack.calls[0].input,{alertId:'a'.repeat(64),expectedVersion:1,dismissed:false});
 const foreign=transport({});await assert.rejects(foreign.client.acknowledgeHubInvoiceAlert(false,alert({clientId:OTHERCLIENT}),true));assert.equal(foreign.calls.length,0);
 const wait=defer(),late=transport(()=>wait.promise);const pending=late.client.readHubInvoice(false,ID);await tick();late.revoke();wait.resolve({invoice:invoice()});await assert.rejects(pending,/revoked/);
});
test('client alerts use scoped callable and tear down on epoch/auth mismatch, rejecting late responses',async()=>{
 const t=transport({alerts:[alert()],hasMore:false}),data=[],errors=[];const stop=t.client.subscribeHubInvoiceAlerts(false,(...v)=>data.push(v),e=>errors.push(e));await tick();assert.equal(t.streams.length,1);assert.deepEqual(t.calls,[{name:'tmcHubListInvoiceAlerts',input:{supportedDueReminders:true}}]);assert.equal(data[0][0].length,1);
 const epoch=t.streams[0];epoch.data({metadata:{fromCache:false},exists:()=>true,data:()=>({clientId:CLIENT,displayName:'Client',status:'active',authVersion:3,createdAt:ISO,updatedAt:ISO})});assert.equal(errors.length,1);assert.ok(t.streams.every(s=>s.stopped));assert.deepEqual(data.at(-1),[[],false]);stop();
 const wait=defer(),late=transport(()=>wait.promise),received=[],denied=[];const end=late.client.subscribeHubInvoiceAlerts(false,v=>received.push(v),e=>denied.push(e));await tick();late.revoke();wait.resolve({alerts:[alert()],hasMore:false});await tick();assert.equal(denied.length,1);assert.ok(received.every(rows=>rows.length===0));end();
 const revoked=transport({}),events=[];revoked.client.subscribeHubInvoiceAlerts(true,()=>{},e=>events.push(e));await tick();revoked.revoke();assert.equal(events.length,1);assert.ok(revoked.streams.every(s=>s.stopped));
});

function ui(options={}){const h=harness();active.add(h);const subscriptions=[],calls=[];h.overrides['./invoice-client']={subscribeHubInvoiceAlerts(owner,data,error){const s={owner,data,error,stopped:false};subscriptions.push(s);return()=>{s.stopped=true;};},async listHubInvoices(owner,signal){calls.push({kind:'list',owner,signal});return options.list?options.list():{invoices:[invoice()],hasMore:false};},async readHubInvoice(owner,id,signal){calls.push({kind:'read',owner,id,signal});return options.read?options.read(id):invoice({invoiceId:id,projectId:OTHER,projectTitle:'Commission'});},async acknowledgeHubInvoiceAlert(owner,item,dismissed,signal){calls.push({kind:'ack',owner,item,dismissed,signal});return options.ack?options.ack(item,dismissed):{...item,read:true,dismissed,version:item.version+1};}};
 const useInbox=h.load('src/client-hub/InvoiceInbox.tsx').useInvoiceInbox;let inbox;const Component=props=>{inbox=useInbox(props.owner,props.accountKey);return{type:'Fragment',props:{children:[inbox.entry,inbox.alertSection,inbox.dialog]}};},props={owner:options.owner??false,accountKey:CLIENT,showAlerts:true},render=()=>h.render(Component,props),button=text=>h.find(n=>n.type==='button'&&(content(n)===text||n.props['aria-label']===text)),dialog=()=>h.find(n=>n.type?.name==='Dialog');render();return{h,props,render,button,dialog,calls,subscriptions,open:()=>inbox.openInvoice(ID),async ready(){await tick();render();},async click(text){button(text).props.onClick();await tick();render();}};
}
test('invoices remain accessible after dismissal; verified detail shows money, plan and sandbox only',async()=>{
 const t=ui({owner:true});t.subscriptions[0].data([alert({recipientRole:'owner',kind:'payment-partial'})],false);t.render();await t.click('Dismiss partial payment received');assert.doesNotMatch(content(t.h.tree),/Invoice ready/);await t.click('Open invoices');assert.ok(t.dialog());assert.equal(t.h.find(n=>n.type==='button'&&content(n).startsWith('Invoice GDT-S')),undefined);t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Commission').props.onChange('__unassigned');t.render();const row=t.h.find(n=>n.type==='button'&&content(n).startsWith('Invoice GDT-S'));row.props.onClick();await t.ready();assert.match(content(t.h.tree),/\$100.00/);assert.match(content(t.h.tree),/\$25.00/);assert.match(content(t.h.tree),/\$75.00/);assert.match(content(t.h.tree),/automatic charges/);assert.equal(t.h.find(n=>n.type==='a').props.href,invoice().sandboxPayUrl);assert.equal(t.h.find(n=>n.type==='a').props.rel,'noopener noreferrer');assert.doesNotMatch(content(t.h.tree),/@|transaction|recipientEmail/);
});
test('failed acknowledgement retains fact and duplicate clicks cannot create competing writes',async()=>{
 const wait=defer(),t=ui({ack:()=>wait.promise});t.subscriptions[0].data([alert()],false);t.render();const click=t.button('Dismiss invoice ready').props.onClick;click();click();t.render();assert.equal(t.calls.filter(c=>c.kind==='ack').length,1);wait.reject(Error('offline'));await t.ready();assert.match(content(t.h.tree),/Invoice ready/);assert.match(content(t.h.tree),/not confirmed/);assert.equal(t.button('Dismiss invoice ready').props.disabled,false);
});
test('scope change, explicit revocation and close abort pending reads without restoring old invoice content',async()=>{
 const wait=defer(),t=ui({read:()=>wait.promise});void t.open();t.render();t.props.accountKey=OTHERCLIENT;t.render();assert.equal(t.dialog(),undefined);assert.equal(t.subscriptions[0].stopped,true);assert.equal(t.calls[0].signal.aborted,true);wait.resolve(invoice({projectId:OTHER}));await t.ready();assert.equal(t.dialog(),undefined);
 const pending=defer(),u=ui({read:()=>pending.promise});void u.open();u.render();u.subscriptions[0].error(Error('epoch revoked'));u.render();pending.resolve(invoice({projectId:OTHER}));await u.ready();assert.equal(u.dialog(),undefined);assert.match(content(u.h.tree),/could not be verified/);
});
test('repeated invoice navigation aborts superseded detail; closing never writes acknowledgement alone',async()=>{
 const wait=defer(),t=ui({read:id=>id===ID?wait.promise:invoice({invoiceId:OTHER,projectId:OTHER})});t.subscriptions[0].data([alert(),alert({alertId:'b'.repeat(64),notificationId:'b'.repeat(64),invoiceId:OTHER})],false);t.render();const opens=()=>t.h.all(n=>n.type==='button'&&content(n).startsWith('Invoice ready'));opens()[0].props.onClick();t.render();opens()[1].props.onClick();await t.ready();assert.equal(t.calls.find(c=>c.kind==='read'&&c.id===ID).signal.aborted,true);wait.resolve(invoice());await t.ready();assert.equal(t.calls.filter(c=>c.kind==='ack').length,1);assert.equal(t.calls.find(c=>c.kind==='ack').item.invoiceId,OTHER);t.dialog().props.onClose();t.render();assert.equal(t.dialog(),undefined);
});
test('real bell adds invoice unread count without routing invoice IDs through commission navigation',async()=>{
 const h=harness();active.add(h);let invoiceFeed;const routed=[],acks=[];
 h.overrides['./workspace-client']={subscribeHubNotifications(_owner,data){queueMicrotask(()=>data([]));return()=>{};}};
 h.overrides['./notification-client']={async loadHubNotificationLabels(){return{};},async changeHubNotifications(){return[];}};
 h.overrides['@/owner/owner-intake-notifications']={watchOwnerIntakeNotifications(){return()=>{};},async markOwnerIntakeNotificationRead(){}};
 h.overrides['./invoice-client']={subscribeHubInvoiceAlerts(_owner,data){invoiceFeed=data;return()=>{};},async listHubInvoices(){return{invoices:[invoice()],hasMore:false};},async readHubInvoice(){return invoice({projectId:OTHER,projectTitle:'Commission'});},async acknowledgeHubInvoiceAlert(_owner,item,dismissed){acks.push(item);return{...item,read:true,dismissed,version:2};}};
 const Bell=h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell,props={owner:false,accountKey:CLIENT,onNavigate:item=>routed.push(item)},render=()=>h.render(Bell,props);render();await tick();invoiceFeed([alert()],false);render();
 const bell=h.find(n=>n.type==='button'&&n.props.title==='Notifications');assert.equal(bell.props['aria-label'],'Notifications, 1 unread updates');assert.equal(h.find(n=>n.props['aria-label']==='Open invoices'),undefined);bell.props.onClick();render();assert.ok(h.find(n=>n.props['aria-label']==='Invoice notifications'));assert.equal(h.find(n=>n.type==='button'&&content(n)==='View saved invoices'),undefined); // Clients open exact commission invoices, never an account-wide list.
 h.find(n=>n.type==='button'&&content(n).startsWith('Invoice ready')).props.onClick();await tick();render();assert.equal(routed.length,0);assert.equal(acks.length,1);assert.ok(h.find(n=>n.type?.name==='Dialog'));assert.equal(h.find(n=>n.type==='button'&&n.props.title==='Notifications').props['aria-label'],'Notifications');
});
test('owner payment alerts and scheduled progress stay separate from invoices sent to clients',async()=>{
 const scheduled=invoice({plan:{kind:'scheduled',installments:[{dueDate:'2026-11-01',amountCents:5000},{dueDate:'2026-12-01',amountCents:5000}]},installmentProgress:[{dueDate:'2026-11-01',amountCents:5000,paidCents:2500,status:'partial'},{dueDate:'2026-12-01',amountCents:5000,paidCents:0,status:'unpaid'}]});
 const t=ui({read:()=>scheduled});t.props.owner=true;t.render();const feed=t.subscriptions.at(-1);feed.data([alert({recipientRole:'owner',kind:'payment-partial',amountCents:2500}),alert({alertId:'b'.repeat(64),notificationId:'b'.repeat(64),recipientRole:'owner',kind:'payment-full',amountCents:7500})],false);t.render();assert.match(content(t.h.tree),/Partial payment received/);assert.match(content(t.h.tree),/Full payment received/);t.h.find(n=>n.type==='button'&&content(n).startsWith('Partial payment received')).props.onClick();await t.ready();assert.match(content(t.h.tree),/Due 2026-11-01/);assert.match(content(t.h.tree),/\$25.00 paid · Partial Paid/);assert.match(content(t.h.tree),/\$0.00 paid · Unpaid/);assert.equal(t.calls.find(c=>c.kind==='read').owner,true);
});
test('review view never turns missing verified balance into zero or encourages duplicate payment',async()=>{
 const reviewed=invoice({projectId:OTHER,projectTitle:'Commission',paymentReview:true,paidCents:null,balanceCents:null,status:'review',sandboxPayUrl:null});const t=ui({read:()=>reviewed});t.subscriptions[0].data([alert()],false);t.render();t.h.find(n=>n.type==='button'&&content(n).startsWith('Invoice ready')).props.onClick();await t.ready();assert.match(content(t.h.tree),/Awaiting verification/);assert.match(content(t.h.tree),/Check your existing payment status/);assert.doesNotMatch(content(t.h.tree),/\$0.00|Pay remaining/);assert.equal(t.h.find(n=>n.type==='a'),undefined);
});
test('alert callable fails closed on cross-client or wrong-recipient records',async()=>{
 for(const row of [alert({clientId:OTHERCLIENT}),alert({recipientRole:'owner',kind:'payment-full'})]){const t=transport({alerts:[row],hasMore:false}),data=[],errors=[];const stop=t.client.subscribeHubInvoiceAlerts(false,v=>data.push(v),e=>errors.push(e));await tick();assert.ok(data.every(rows=>rows.length===0));assert.equal(errors.length,1);assert.ok(t.streams.every(s=>s.stopped));stop();}
});
test('explicit invoice read or acknowledgement authority denial clears projection immediately, not on a later listener',async()=>{
 for(const mode of ['read','ack'])for(const code of ['functions/permission-denied','functions/unauthenticated']){const options={[mode]:async()=>{throw Object.assign(Error('denied'),{code});}},t=ui(options);t.subscriptions[0].data([alert()],false);t.render();if(mode==='ack')await t.click('Dismiss invoice ready');else{t.h.find(n=>n.type==='button'&&content(n).startsWith('Invoice ready')).props.onClick();await t.ready();}assert.equal(t.dialog(),undefined);assert.doesNotMatch(content(t.h.tree),/Invoice ready/);assert.match(content(t.h.tree),/could not be verified/);assert.equal(t.subscriptions[0].stopped,true);}
});
test('newest undismissed invoice alerts are ordered before bounding, so historical alerts cannot hide new activity',async()=>{
 const t=transport({}),received=[];const stop=t.client.subscribeHubInvoiceAlerts(true,(rows,more)=>received.push({rows,more}),()=>{});await tick();const target=t.streams[0].target;
 assert.ok(target.filters.some(f=>Array.isArray(f)&&f[0]==='dismissed'&&f[2]===false));assert.ok(target.filters.some(f=>f.order?.[0]==='createdAt'&&f.order[1]==='desc'));
 const rows=Array.from({length:150},(_,i)=>alert({recipientRole:'owner',kind:'payment-full',alertId:i.toString(16).padStart(64,'0'),notificationId:i.toString(16).padStart(64,'0'),createdAt:new Date(Date.parse(ISO)+i*1000).toISOString()}));
 // Synthetic server applies the actual requested query order before its limit.
 const ordered=rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,target.filters.find(f=>f.limit).limit);
 t.streams[0].data({metadata:{fromCache:false},docs:ordered.map(row=>({id:row.alertId,data:()=>row}))});assert.equal(received[0].rows.length,100);assert.equal(received[0].more,true);assert.equal(received[0].rows[0].createdAt,new Date(Date.parse(ISO)+149000).toISOString());stop();
});
test('invoice alerts show checking until the dedicated stream confirms empty',()=>{const t=ui();assert.match(content(t.h.tree),/Checking invoice alerts/);assert.doesNotMatch(content(t.h.tree),/No invoice alerts/);t.subscriptions[0].data([],false);t.render();assert.match(content(t.h.tree),/No invoice alerts/);assert.doesNotMatch(content(t.h.tree),/Checking invoice alerts/);});
test('mark all invoice alerts is duplicate-locked and bounded to four requests at a time',async()=>{
 const h=harness();active.add(h);let feed,api;const pending=[],calls=[];
 h.overrides['./invoice-client']={subscribeHubInvoiceAlerts(_owner,data){feed=data;return()=>{};},async acknowledgeHubInvoiceAlert(_owner,item,dismissed){calls.push(item);const wait=defer();pending.push({wait,item,dismissed});return wait.promise;}};
 const{useInvoiceInbox}=h.load('src/client-hub/InvoiceInbox.tsx');function Probe(){api=useInvoiceInbox(false,CLIENT);return null;}const render=()=>h.render(Probe,{});render();feed(Array.from({length:9},(_,i)=>alert({alertId:i.toString(16).padStart(64,'0'),notificationId:i.toString(16).padStart(64,'0')})),false);render();const work=api.markAllRead();void api.markAllRead();assert.equal(calls.length,4);
 for(const p of pending.slice(0,4))p.wait.resolve({...p.item,read:true,version:2});await tick();assert.equal(calls.length,8);
 for(const p of pending.slice(4,8))p.wait.resolve({...p.item,read:true,version:2});await tick();assert.equal(calls.length,9);pending[8].wait.resolve({...pending[8].item,read:true,version:2});await work;render();assert.equal(api.unread,0);
});

test('client alert transport follows fully-paid empty pages to older outstanding alerts',async()=>{
 let page=0;const cursor='b'.repeat(64),t=transport(()=>++page===1?{alerts:[],hasMore:true,nextCursor:cursor}:{alerts:[alert()],hasMore:false}),received=[],errors=[];
 const stop=t.client.subscribeHubInvoiceAlerts(false,(rows,more)=>received.push({rows,more}),e=>errors.push(e));await tick();await tick();stop();
 assert.equal(errors.length,0);assert.deepEqual(t.calls.map(c=>c.input),[{supportedDueReminders:true}, {supportedDueReminders:true,cursor}]);assert.equal(received.length,1);assert.equal(received[0].rows.length,1);assert.equal(received[0].more,false);
});
test('late paginated alert response after auth change cannot repopulate another client session',async()=>{
 const wait=defer();let page=0;const t=transport(()=>++page===1?{alerts:[],hasMore:true,nextCursor:'b'.repeat(64)}:wait.promise),received=[],errors=[];
 const stop=t.client.subscribeHubInvoiceAlerts(false,rows=>received.push(rows),e=>errors.push(e));await tick();t.revoke();wait.resolve({alerts:[alert()],hasMore:false});await tick();stop();assert.equal(errors.length,1);assert.ok(received.every(rows=>rows.length===0));assert.equal(t.calls.length,2);
});
test('repeated alert cursor fails closed rather than polling forever or showing partial data',async()=>{
 const t=transport({alerts:[],hasMore:true,nextCursor:'b'.repeat(64)}),received=[],errors=[];const stop=t.client.subscribeHubInvoiceAlerts(false,rows=>received.push(rows),e=>errors.push(e));await tick();await tick();stop();assert.equal(t.calls.length,2);assert.equal(errors.length,1);assert.ok(received.every(rows=>rows.length===0));
});
test('Clear All capture uses one complete snapshot beyond 100 and performs no dismissals',async()=>{
 const cutoff='2026-10-30T21:00:00.000Z',rows=Array.from({length:105},(_,n)=>alert({alertId:n.toString(16).padStart(64,'0'),notificationId:n.toString(16).padStart(64,'0')}));const t=transport({alerts:rows,hasMore:false,captureBefore:cutoff});
 const captured=await t.client.captureHubInvoiceAlerts(false);assert.equal(captured.length,105);assert.deepEqual(t.calls,[{name:'tmcHubListInvoiceAlerts',input:{capture:true,supportedDueReminders:true}}]);
});
test('Clear All capture rejects truncated snapshots and auth changes before any write',async()=>{
 const cutoff='2026-10-30T21:00:00.000Z';await assert.rejects(transport({alerts:[alert()],hasMore:true,nextCursor:'e'.repeat(64),captureBefore:cutoff}).client.captureHubInvoiceAlerts(false));
 const wait=defer(),late=transport(()=>wait.promise),capturing=late.client.captureHubInvoiceAlerts(false);await tick();late.revoke();wait.resolve({alerts:[alert()],hasMore:false,captureBefore:cutoff});await assert.rejects(capturing,/revoked/);assert.equal(late.calls.length,1);
});
test('exact project transport enumerates old outstanding invoices without including another commission',async()=>{
 const projectId=OTHER,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,rows=Array.from({length:105},(_,n)=>invoice({invoiceId:id(n),projectId,projectTitle:'Exact commission'}));let page=0;const t=transport(()=>++page===1?{invoices:rows.slice(0,100),hasMore:true,nextCursor:id(99)}:{invoices:rows.slice(100),hasMore:false});
 const result=await t.client.listHubProjectInvoices(false,projectId);assert.equal(result.invoices.length,105);assert.equal(result.hasMore,false);assert.deepEqual(t.calls.map(c=>c.input),[{projectId},{projectId,cursor:id(99)}]);
 await assert.rejects(transport({invoices:[invoice({projectId:ID,projectTitle:'Wrong commission'})],hasMore:false}).client.listHubProjectInvoices(false,projectId));
});
test('project invoice pagination rejects a late response after client authority ends',async()=>{
 const wait=defer(),t=transport(()=>wait.promise),pending=t.client.listHubProjectInvoices(false,OTHER);await tick();t.revoke();wait.resolve({invoices:[invoice({projectId:OTHER,projectTitle:'Commission'})],hasMore:false});await assert.rejects(pending,/revoked/);
});
test('due reminder schema is client-only and validates date/timezone and snapshot cents',()=>{
 const due=alert({kind:'invoice-due',dueDate:'2026-11-06',installmentIndex:1,reminderTimeZone:'America/New_York',amountCents:300});assert.equal(model.decodeHubInvoiceAlert(due).kind,'invoice-due');
 for(const patch of [{recipientRole:'owner'},{dueDate:'2026-02-30'},{installmentIndex:24},{amountCents:0},{reminderTimeZone:'UTC'}])assert.throws(()=>model.decodeHubInvoiceAlert({...due,...patch}));
});
