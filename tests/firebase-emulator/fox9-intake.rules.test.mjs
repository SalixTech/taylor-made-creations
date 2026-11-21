// Isolated demo-project Firestore emulator tests; never connects to live Firebase.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
const PROJECT = 'demo-tmc-hub-rules', OWNER = 'a4ARjp0z8ZOByKlC2AfGzmMRj843';
const ID = '11111111-1111-4111-8111-111111111111';
const ISO = '2026-10-28T00:00:00.000Z';
let env, owner, outsider, client, anon;
const ref = (context, path) => doc(context.firestore(), path);
const seed = (path, value) => env.withSecurityRulesDisabled(context => setDoc(ref(context, path), value));
before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18080') throw new Error('Fox9 rules checks require the local demo emulator.');
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules', import.meta.url),'utf8') } });
  owner=env.authenticatedContext(OWNER); outsider=env.authenticatedContext('stranger'); anon=env.unauthenticatedContext();
  client=env.authenticatedContext('hub:TMC-0123456789ABCDEF',{hubRole:'client',hubClientId:'TMC-0123456789ABCDEF',hubAuthVersion:1});
});
beforeEach(async () => { await env.clearFirestore(); });
after(async()=> { await env?.cleanup(); });
const alertPath = `ownerIntakeNotifications/commission-${ID}`;
const alertValue = { notificationId:`commission-${ID}`,kind:'commission-request',requestId:ID,createdAt:ISO,readAt:null };
test('intake alerts permit owner reads and timestamp acknowledgement only',async()=>{
  await seed(alertPath,alertValue);
  await assertSucceeds(getDoc(ref(owner,alertPath)));
  assert.equal((await assertSucceeds(getDocs(collection(owner.firestore(),'ownerIntakeNotifications')))).size,1);
  await assertSucceeds(updateDoc(ref(owner,alertPath),{readAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(owner,alertPath),{kind:'code-request',readAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(owner,alertPath),{requestId:'different',readAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(owner,alertPath),{readAt:null}));
  await assertFails(updateDoc(ref(owner,alertPath),{readAt:ISO}));
  await assertFails(deleteDoc(ref(owner,alertPath)));
  await assertFails(setDoc(ref(owner,`${alertPath}-forged`),alertValue));
});
test('anonymous, unrelated and hub-client identities cannot access intake alerts',async()=>{
  await seed(alertPath,alertValue);
  for(const context of [anon,outsider,client]) {
    await assertFails(getDoc(ref(context,alertPath)));
    await assertFails(getDocs(collection(context.firestore(),'ownerIntakeNotifications')));
    await assertFails(updateDoc(ref(context,alertPath),{readAt:serverTimestamp()}));
    await assertFails(setDoc(ref(context,`${alertPath}-forged`),alertValue));
    await assertFails(deleteDoc(ref(context,alertPath)));
  }
});
function decide(status,beforeStatus='received',version=1) {
  const db=owner.firestore(),batch=writeBatch(db);
  batch.update(doc(db,`commissionRequests/${ID}`),{status,version,updatedAt:serverTimestamp(),updatedBy:OWNER});
  batch.set(doc(db,`commissionRequests/${ID}/history/${version}`),{fromStatus:beforeStatus,toStatus:status,version,actorUid:OWNER,createdAt:serverTimestamp()});
  return batch.commit();
}
test('normal private approve and waitlist transitions retain atomic history',async()=>{
  await seed(`commissionRequests/${ID}`,{status:'received',version:0,description:'Keep text'});
  await assertSucceeds(decide('approved'));
  await assertSucceeds(decide('waitlisted','approved',2));
  const saved=(await getDoc(ref(owner,`commissionRequests/${ID}`))).data();
  assert.equal(saved.description,'Keep text'); assert.equal(saved.version,2);
});
test('direct denial is rejected even with otherwise valid owner history batch',async()=>{
  await seed(`commissionRequests/${ID}`,{status:'received',version:0,description:'Keep text'});
  await assertFails(decide('denied'));
  assert.equal((await getDoc(ref(owner,`commissionRequests/${ID}`))).data().status,'received');
  assert.equal((await getDoc(ref(owner,`commissionRequests/${ID}/history/1`))).exists(),false);
});
test('legacy requests support safe normal decisions but cannot bypass denial callable',async()=>{
  await seed(`commissionRequests/${ID}`,{description:'Legacy text'});
  await assertFails(decide('denied'));
  await assertSucceeds(decide('approved'));
});
test('purge lock rejects direct decisions, link edits and forged audit regardless of purge state',async()=>{
  for(const status of ['pending','failed','complete']) {
    await env.clearFirestore();
    await seed(`commissionRequests/${ID}`,{status:'denied',version:1,description:'Keep text',referencePurge:{status}});
    await assertFails(decide('approved','denied',2));
    await assertFails(decide('waitlisted','denied',2));
    await assertFails(updateDoc(ref(owner,`commissionRequests/${ID}`),{hubLink:{clientId:'TMC-0123456789ABCDEF',projectId:ID}}));
    await assertFails(updateDoc(ref(owner,`commissionRequests/${ID}`),{referencePurge:null}));
    assert.equal((await getDoc(ref(owner,`commissionRequests/${ID}`))).data().description,'Keep text');
  }
});

test('per-client project creation sequence remains server-only for owner and client',async()=>{
  const path='hubProjectCreateState/TMC-0123456789ABCDEF';
  await seed(path,{clientId:'TMC-0123456789ABCDEF',sequence:3});
  for(const context of [owner,client,outsider,anon]){
    await assertFails(getDoc(ref(context,path)));
    await assertFails(getDocs(collection(context.firestore(),'hubProjectCreateState')));
    await assertFails(updateDoc(ref(context,path),{sequence:4}));
    await assertFails(setDoc(ref(context,`${path}-forged`),{sequence:0}));
    await assertFails(deleteDoc(ref(context,path)));
  }
});
