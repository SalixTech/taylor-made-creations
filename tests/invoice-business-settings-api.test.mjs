import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';
function client(reply){const calls=[];let current=true;const api=sourceLoader({'./taylor-services-client':{taylorOwnerSession:async()=>({auth:{app:{}},assertCurrent(){if(!current)throw Error('revoked');}})},'firebase/functions':{getFunctions:()=>({}),httpsCallable:(_,name)=>async input=>{calls.push({name,input});return{data:typeof reply==='function'?await reply():reply}}}})('src/owner/paypal-client.ts');return {module:api,calls,revoke(){current=false;}};}
test('settings get/save strictly validate owner policy snapshots and expected CAS response',async()=>{
 const get=client({version:0,depositPercent:40,updatedAt:null});assert.equal((await get.module.getPayPalInvoiceSettings()).depositPercent,40);assert.deepEqual(get.calls,[{name:'tmcPayPalGetInvoiceSettings',input:{}}]);
 const value={version:2,depositPercent:30,updatedAt:'2026-10-30T12:00:00.000Z'},save=client(value);assert.deepEqual(await save.module.savePayPalInvoiceSettings({expectedVersion:1,depositPercent:30,confirmed:true}),value);
 for(const invalid of [{...value,depositPercent:0},{...value,depositPercent:30.5},{...value,version:-1},{...value,updatedAt:null},{version:0,depositPercent:30,updatedAt:null}])assert.throws(()=>save.module.decodeInvoiceBusinessSettings(invalid));
 await assert.rejects(save.module.savePayPalInvoiceSettings({expectedVersion:0,depositPercent:30,confirmed:true}),/unconfirmed/);
 const before=save.calls.length;await assert.rejects(save.module.savePayPalInvoiceSettings({expectedVersion:1,depositPercent:101,confirmed:true}));assert.equal(save.calls.length,before);
});
test('settings response after auth revocation cannot update the UI',async()=>{
 let release;const response=new Promise(r=>release=r),f=client(()=>response);const pending=f.module.getPayPalInvoiceSettings();await new Promise(r=>setImmediate(r));f.revoke();release({version:0,depositPercent:40,updatedAt:null});await assert.rejects(pending,/revoked/);
});
test('preview transport sends policy version and refuses substitution, legacy40 remains decodable',async()=>{
 const projectId='00000000-0000-4000-8000-000000000099',items=[{name:'Synthetic',quantity:1,unitCents:101}],plan={kind:'flexible',minimumCents:31},policy={requiredCents:31,defaultPercent:30,settingsVersion:1,overridden:false,enforcement:'owner-review'},response={projectId,projectTitle:'Commission',to:'synthetic@example.test',clientName:'Synthetic',currency:'USD',items,subtotalCents:101,totalCents:101,previewHash:'a'.repeat(64),plan,depositPolicy:policy};
 const f=client(response),input={projectId,clientId:'TMC-0000000000000001',items,note:'',plan,expectedSettingsVersion:1};assert.deepEqual((await f.module.previewPayPalInvoice(input)).depositPolicy,policy);assert.equal(f.calls[0].input.expectedSettingsVersion,1);
 await assert.rejects(client({...response,depositPolicy:{...policy,settingsVersion:2}}).module.previewPayPalInvoice(input),/policy changed/);
 assert.equal(f.module.decodeInvoiceDeposit({requiredCents:41,defaultPercent:40,overridden:false,enforcement:'owner-review'},101).defaultPercent,40);
});
