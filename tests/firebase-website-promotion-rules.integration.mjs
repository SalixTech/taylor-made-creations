// Real local Firestore Rules evaluation; never initializes a production project.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {STUDIO_OWNER_UIDS} from '../firebase/functions/studio-owner-identity.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Exact loopback Firestore emulator required; no live test permitted');
const rules=readFileSync(new URL('../firebase/firestore.rules',import.meta.url),'utf8');
const operation='11111111-1111-4111-8111-111111111111',asset='22222222-2222-4222-8222-222222222222';
const paths=[`websitePromotionOperations/${operation}`,`websitePromotionOperations/${operation}/assets/${asset}`,`websitePromotionSnapshots/${operation}`];
let env;
before(async()=>{
 console.log('Firestore rules SHA256:',createHash('sha256').update(rules).digest('hex'));
 env=await initializeTestEnvironment({projectId:'demo-tmc-promotion-rules',firestore:{host:'127.0.0.1',port:18080,rules}});
 await env.withSecurityRulesDisabled(async context=>{for(const path of paths){const ref=doc(context.firestore(),path);await assertSucceeds(setDoc(ref,{schemaVersion:1,status:'ready',privateReceipt:'admin-seeded-sentinel'}));assert.equal((await getDoc(ref)).data().privateReceipt,'admin-seeded-sentinel');}});
});
after(async()=>{await env?.cleanup();});
const actors=[...STUDIO_OWNER_UIDS.map((uid,index)=>({name:`studio owner ${index+1}`,uid})),{name:'random authenticated user',uid:'random-user'},{name:'authenticated client',uid:'hub:TMC-0123456789ABCDEF',claims:{hubRole:'client',hubClientId:'TMC-0123456789ABCDEF',hubAuthVersion:1}},{name:'anonymous',uid:null}];
for(const actor of actors)test(`${actor.name} cannot directly read, list, create, change or delete promotion operations, asset receipts or snapshots`,async()=>{
 const context=actor.uid===null?env.unauthenticatedContext():env.authenticatedContext(actor.uid,actor.claims),db=context.firestore();
 for(const path of paths){
  const ref=doc(db,path);await assertFails(getDoc(ref));await assertFails(setDoc(ref,{schemaVersion:1,status:'committed'}));await assertFails(updateDoc(ref,{status:'cancelled'}));await assertFails(deleteDoc(ref));
  const parent=path.slice(0,path.lastIndexOf('/'));await assertFails(getDocs(collection(db,parent)));await assertFails(setDoc(doc(db,`${parent}/new-forbidden`),{schemaVersion:1,status:'prepared'}));
 }
 // Denied operations must leave the original admin records exactly unchanged.
 await env.withSecurityRulesDisabled(async admin=>{for(const path of paths)assert.deepEqual((await getDoc(doc(admin.firestore(),path))).data(),{schemaVersion:1,status:'ready',privateReceipt:'admin-seeded-sentinel'});});
});
