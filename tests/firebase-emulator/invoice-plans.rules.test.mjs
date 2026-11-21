import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,query,where,getDocs} from 'firebase/firestore';
let env,client,other,owner,revoked;
const C='TMC-0000000000000001',D='TMC-0000000000000002',I='00000000-0000-4000-8000-000000000001';
before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Loopback only');
 env=await initializeTestEnvironment({projectId:'demo-tmc-invoice-plan-rules',firestore:{host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules',import.meta.url),'utf8')}});
 client=env.authenticatedContext(`hub:${C}`,{hubRole:'client',hubClientId:C,hubAuthVersion:1});other=env.authenticatedContext(`hub:${D}`,{hubRole:'client',hubClientId:D,hubAuthVersion:1});revoked=env.authenticatedContext(`hub:${C}`,{hubRole:'client',hubClientId:C,hubAuthVersion:2});owner=env.authenticatedContext('a4ARjp0z8ZOByKlC2AfGzmMRj843');
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,`hubClients/${C}`),{clientId:C,status:'active',authVersion:1});await setDoc(doc(db,`hubClients/${D}`),{clientId:D,status:'active',authVersion:1});await setDoc(doc(db,`hubInvoiceViews/${I}`),{invoiceId:I,clientId:C,published:true});await setDoc(doc(db,'hubInvoiceViews/draft'),{invoiceId:'draft',clientId:C,published:false});for(const role of ['owner','client'])await setDoc(doc(db,`hubInvoiceAlerts/${role}`),{clientId:C,recipientRole:role});});
});after(async()=>env?.cleanup());
test('client invoices own sent-only scope; private invoice and ledger remain inaccessible',async()=>{
 await assertSucceeds(getDoc(doc(client.firestore(),`hubInvoiceViews/${I}`)));await assertSucceeds(getDoc(doc(owner.firestore(),`hubInvoiceViews/${I}`)));
 for(const ctx of [other,revoked])await assertFails(getDoc(doc(ctx.firestore(),`hubInvoiceViews/${I}`)));
 for(const ctx of [client,owner])await assertFails(getDoc(doc(ctx.firestore(),'hubInvoiceViews/draft')));
 for(const path of [`paypalInvoices/${I}`,`paypalInvoicePaymentLedger/${I}`])await assertFails(getDoc(doc(client.firestore(),path)));
});
test('alert role isolation and epoch rules apply to direct reads and scoped subscriptions',async()=>{
 await assertFails(getDoc(doc(client.firestore(),'hubInvoiceAlerts/client')));await assertSucceeds(getDoc(doc(owner.firestore(),'hubInvoiceAlerts/owner')));
 await assertFails(getDoc(doc(client.firestore(),'hubInvoiceAlerts/owner')));await assertFails(getDoc(doc(owner.firestore(),'hubInvoiceAlerts/client')));
 await assertFails(getDoc(doc(other.firestore(),'hubInvoiceAlerts/client')));await assertFails(getDoc(doc(revoked.firestore(),'hubInvoiceAlerts/client')));
 await assertFails(getDocs(query(collection(client.firestore(),'hubInvoiceAlerts'),where('clientId','==',C),where('recipientRole','==','client'))));await assertFails(getDocs(collection(client.firestore(),'hubInvoiceAlerts')));
});
test('all invoice projections, alerts, ledgers are server-write only',async()=>{for(const ctx of [owner,client,other])await assertFails(getDoc(doc(ctx.firestore(),`paypalInvoiceCreateBarriers/${C}`)));for(const ctx of [owner,client,other])for(const path of [`hubInvoiceViews/${I}`,'hubInvoiceAlerts/client',`paypalInvoicePaymentLedger/${I}`,`paypalInvoiceCreateBarriers/${C}`])await assertFails(setDoc(doc(ctx.firestore(),path),{clientId:C,published:true,recipientRole:'client'}));});
test('anonymous and suspended same-client sessions cannot read sent views or invoice alerts',async()=>{
 const anonymous=env.unauthenticatedContext();
 for(const path of [`hubInvoiceViews/${I}`,'hubInvoiceAlerts/client'])await assertFails(getDoc(doc(anonymous.firestore(),path)));
 await assertSucceeds(getDocs(query(collection(owner.firestore(),'hubInvoiceAlerts'),where('recipientRole','==','owner'))));
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),`hubClients/${C}`),{clientId:C,status:'suspended',authVersion:1}));
 try{for(const path of [`hubInvoiceViews/${I}`,'hubInvoiceAlerts/client'])await assertFails(getDoc(doc(client.firestore(),path)));await assertFails(getDocs(query(collection(client.firestore(),'hubInvoiceAlerts'),where('clientId','==',C),where('recipientRole','==','client'))));}
 finally{await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),`hubClients/${C}`),{clientId:C,status:'active',authVersion:1}));}
});

test('linked invoice access fails closed after commission reassignment; catalogs never allow browser access',async()=>{
 const projectId='00000000-0000-4000-8000-000000000099',linked='00000000-0000-4000-8000-000000000098';
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),`hubProjects/${projectId}`),{projectId,clientId:C,title:'Private commission'});await setDoc(doc(ctx.firestore(),`hubInvoiceViews/${linked}`),{invoiceId:linked,projectId,clientId:C,published:true});});
 await assertSucceeds(getDoc(doc(client.firestore(),`hubInvoiceViews/${linked}`)));
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),`hubProjects/${projectId}`),{projectId,clientId:D,title:'Other private commission'}));
 for(const ctx of [client,other,owner]){await assertFails(getDoc(doc(ctx.firestore(),`hubInvoiceViews/${linked}`)));await assertFails(getDoc(doc(ctx.firestore(),'paypalInvoiceCatalog/current')));await assertFails(setDoc(doc(ctx.firestore(),'paypalInvoiceCatalog/current'),{version:1,items:[]}));}
});
test('invoice archive sidecars cannot be read or changed by any browser role',async()=>{for(const ctx of [owner,client,other,env.unauthenticatedContext()]){await assertFails(getDoc(doc(ctx.firestore(),`paypalInvoicePresentation/${I}`)));await assertFails(setDoc(doc(ctx.firestore(),`paypalInvoicePresentation/${I}`),{ownerArchived:true,version:1}));}});
test('business invoice deposit settings never allow direct browser reads or writes',async()=>{for(const ctx of [owner,client,other,env.unauthenticatedContext()]){await assertFails(getDoc(doc(ctx.firestore(),'paypalInvoiceSettings/current')));await assertFails(setDoc(doc(ctx.firestore(),'paypalInvoiceSettings/current'),{version:1,depositPercent:30}));}});
