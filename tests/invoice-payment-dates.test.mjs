import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),dates=load('src/client-hub/invoice-payment-dates.ts'),model=load('src/client-hub/invoice-model.ts'),owner=load('src/owner/paypal-client.ts');
const id='00000000-0000-4000-8000-000000000001',clientId='TMC-0000000000000001';
const plan={kind:'scheduled',installments:[{dueDate:'2026-12-01',amountCents:200},{dueDate:'2027-01-01',amountCents:300}]};
const base={invoiceId:id,clientId,invoiceNumber:'GDT-test',currency:'USD',totalCents:500,paidCents:250,balanceCents:250,plan,status:'partially-paid',paymentReview:false,installmentProgress:[{...plan.installments[0],paidCents:200,status:'paid'},{...plan.installments[1],paidCents:50,status:'partial'}],sandboxPayUrl:null,version:1,updatedAt:'2026-12-02T00:00:00.000Z',published:true,paymentHistory:[{amountCents:150,paidOn:'2026-10-29'},{amountCents:100,paidOn:'2026-10-30T12:00:00.000Z'}]};
test('Hub and owner DTOs derive identical per-installment payment dates, never trust raw date labels',()=>{
 const hub=model.decodeHubInvoice(base),invoice=owner.decodePayPalInvoice({...base,mode:'sandbox',clientName:'Client',recipientEmail:'client@example.test',note:'',items:[]});
 assert.deepEqual(hub.installmentProgress,invoice.installmentProgress);assert.deepEqual(hub.installmentProgress[0].payments,[{amountCents:150,paidOn:'2026-10-29'},{amountCents:50,paidOn:'2026-10-30T12:00:00.000Z'}]);assert.deepEqual(hub.installmentProgress[1].payments,[{amountCents:50,paidOn:'2026-10-30T12:00:00.000Z'}]);
 const forged=model.decodeHubInvoice({...base,paymentHistory:undefined,installmentProgress:base.installmentProgress.map(r=>({...r,payments:[{amountCents:999,paidOn:base.updatedAt}]}))});assert.equal(forged.paymentHistory,null);assert.ok(forged.installmentProgress.every(r=>r.payments===null));
});
test('dates require complete matching verified payment history and safe calendars; dates hide during review',()=>{
 for(const history of [[{amountCents:250,paidOn:'2026-02-30'}],[{amountCents:250,paidOn:'2026-10-30T24:00:00Z'}],[{amountCents:249,paidOn:'2026-10-30'}],[{amountCents:250,paidOn:'10/30/2026'}],[{amountCents:250,paidOn:'2026-10-30',privateId:'not allowed'}]])assert.throws(()=>model.decodeHubInvoice({...base,paymentHistory:history}));
 const review=model.decodeHubInvoice({...base,paymentReview:true,status:'review',paidCents:null,balanceCents:null,installmentProgress:plan.installments.map(row=>({...row,paidCents:null,status:'unverified'}))});assert.equal(review.paymentHistory,null);assert.ok(review.installmentProgress.every(r=>r.payments===null));
});
test('date-only precision never becomes prior local calendar day or invented payment time',()=>{
 assert.equal(dates.invoicePaymentDateLabel('2026-10-30'),'Oct 30, 2026');assert.equal(dates.invoicePaymentDateLabel('not-a-date'),'Payment date unavailable');assert.equal(dates.canonicalInvoicePaymentDate('2026-10-30T09:00:00-04:00'),'2026-10-30T13:00:00.000Z');
});
