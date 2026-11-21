import {test,after,before,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,collection,getDocs,runTransaction} from 'firebase/firestore';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Loopback emulator required');
let env;const path='site/constructionWhimsy',ownerUid='a4ARjp0z8ZOByKlC2AfGzmMRj843';
const value=(revision=1,enabled=false)=>({schemaVersion:1,revision,enabled});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-tmc-whimsy-rules',firestore:{host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules',import.meta.url),'utf8')}});});
beforeEach(()=>env.clearFirestore());after(async()=>{await env?.cleanup();});
const owner=()=>env.authenticatedContext(ownerUid).firestore();
test('tiny construction flag alone publicly readable, no anonymous/client writes/list/delete',async()=>{
 await assertSucceeds(setDoc(doc(owner(),path),value()));
 for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('hub:TMC-0000000000000001',{hubRole:'client',hubClientId:'TMC-0000000000000001',hubAuthVersion:1}).firestore()]){
  assert.deepEqual((await assertSucceeds(getDoc(doc(db,path)))).data(),value());
  await assertFails(setDoc(doc(db,path),value(2,true)));await assertFails(deleteDoc(doc(db,path)));await assertFails(getDocs(collection(db,'site')));
 }
 await assertFails(deleteDoc(doc(owner(),path)));await assertFails(getDocs(collection(owner(),'site')));
});
test('strict flag schema/revision prevents accidental gate data publication or non-CAS edits',async()=>{
 const db=owner();for(const bad of [{...value(),secret:'private'},{...value(),enabled:'yes'},value(0),value(2),{schemaVersion:2,revision:1,enabled:true}])await assertFails(setDoc(doc(db,path),bad));
 await assertSucceeds(setDoc(doc(db,path),value()));await assertFails(setDoc(doc(db,path),value()));await assertFails(setDoc(doc(db,path),value(3,true)));await assertSucceeds(setDoc(doc(db,path),value(2,true)));
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),path),{...value(3),secret:'must not leak'}));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
});
test('real owner transactions with captured revision yield one CAS winner; site gate untouched',async()=>{
 const db=owner();await setDoc(doc(db,path),value());
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'site/access'),{sentinel:'unchanged'}));
 const save=enabled=>runTransaction(db,async tx=>{const ref=doc(db,path),current=(await tx.get(ref)).data();if(current.revision!==1)throw Error('stale revision');const next=value(current.revision+1,enabled);tx.set(ref,next);return next;});
 const results=await Promise.allSettled([save(true),save(false)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected').reason;assert.ok(failure.message==='stale revision'||failure.code==='permission-denied',String(failure));
 assert.equal((await getDoc(doc(db,path))).data().revision,2);
 await env.withSecurityRulesDisabled(async context=>assert.deepEqual((await getDoc(doc(context.firestore(),'site/access'))).data(),{sentinel:'unchanged'}));
});
