import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPayPalService} from '../firebase/functions/paypal-core.mjs';
import {OWNER_UID} from '../firebase/functions/cleanup-core.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const {decodePayPalInvoice}=sourceLoader({'./taylor-services-client':{}})('src/owner/paypal-client.ts');
const plan={kind:'scheduled',installments:[{dueDate:'2026-10-30',amountCents:200},{dueDate:'2026-11-06',amountCents:300}]};
const base={invoiceId:'00000000-0000-4000-8000-000000000001',clientId:'TMC-0000000000000001',clientName:'Synthetic',recipientEmail:'synthetic@example.test',providerInvoiceId:'INV2-AAAA-BBBB-CCCC-DDDD',items:[{name:'Custom line',quantity:1,unitCents:500}],note:'',currency:'USD',subtotalCents:500,totalCents:500,status:'draft',version:2,createdAt:'2026-10-30T17:00:00.000Z',updatedAt:'2026-10-30T17:00:00.000Z',mode:'sandbox',plan};
async function project(row){
 const query={kind:'invoice-query'},db={collection:name=>{assert.equal(name,'paypalInvoices');return{orderBy:()=>({limit:()=>query})};},doc:path=>{assert.ok([`paypalInvoicePresentation/${row.invoiceId}`,`paypalInvoicePaymentLedger/${row.invoiceId}`].includes(path), "Projection reads only explicit presentation and verified-payment evidence");return{path};},runTransaction:async action=>action({get:async target=>target===query?{docs:[{id:row.invoiceId,data:()=>row}]}:{exists:false,data:()=>undefined},set(){assert.fail('Projection must not write');}})};
 return(await createPayPalService({db,provider:{}}).listInvoices({}, {auth:{uid:OWNER_UID}})).invoices[0];
}
test('actual backend draft projection passes strict frontend decoder without fabricating payment',async()=>{
 for(const extra of [{},{installmentProgress:[]},{installmentProgress:[],paymentReview:true,paidCents:200,balanceCents:300}]){
  const row={...base,...extra},before=structuredClone(row),decoded=decodePayPalInvoice(await project(row));
  assert.equal(decoded.status,'draft');assert.equal(decoded.paidCents,null);assert.equal(decoded.balanceCents,null);
  assert.deepEqual(decoded.installmentProgress,plan.installments.map(item=>({...item,paidCents:null,status:'unverified',payments:null})));assert.deepEqual(row,before);
 }
});
test('strict frontend still rejects malformed scheduled progress, balances and changed installment sums',()=>{
 for(const patch of [{installmentProgress:[]},{installmentProgress:[{...plan.installments[0],paidCents:null,status:'unverified'}]},{paidCents:200,balanceCents:301},{plan:{kind:'scheduled',installments:plan.installments.map(row=>({...row,amountCents:100}))}}])assert.throws(()=>decodePayPalInvoice({...base,...patch}));
});
