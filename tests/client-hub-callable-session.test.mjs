import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const OWNER='a4ARjp0z8ZOByKlC2AfGzmMRj843';
function fixture(){
 const tokenCalls=[];let hook,config={status:'ready',options:{projectId:'taylor-made-creations'},ownerUid:OWNER};
 const user={uid:OWNER,getIdToken:async force=>{tokenCalls.push(force);await hook?.();return 'fake-local-token';}},auth={currentUser:null};auth.currentUser=user;
 const api=sourceLoader({'@/owner/firebase-client':{readOwnerFirebaseConfig:()=>config,getOwnerFirebaseClient:()=>({auth})}})('src/client-hub/callable-owner-session.ts');
 return {api,user,auth,tokenCalls,config:next=>{config=next;},hook:next=>{hook=next;}};
}
test('owner hot-callable preflight requires exact configured owner but does not force two redundant network roundtrips',async()=>{
 const f=fixture(),session=await f.api.hubCallableOwnerSession();assert.equal(session.auth,f.auth);assert.deepEqual(f.tokenCalls,[false]);session.assertCurrent();f.auth.currentUser=null;assert.throws(session.assertCurrent,/session changed/);
});
test('owner callable helper never accepts another project/account or a late auth transition',async()=>{
 for(const change of [f=>f.config({status:'missing'}),f=>f.config({status:'ready',options:{projectId:'other-project'},ownerUid:OWNER}),f=>{f.auth.currentUser={...f.user,uid:'stranger'};},f=>f.hook(()=>{f.auth.currentUser=null;})]){const f=fixture();change(f);await assert.rejects(f.api.hubCallableOwnerSession());}
});
test('second studio owner retains actual actor and late actor change fails closed',async()=>{
 const f=fixture();f.user.uid='VhnIFsEQFqRtS8u98mP921wim4J3';const s=await f.api.hubCallableOwnerSession();s.assertCurrent();f.auth.currentUser={...f.user,uid:OWNER};assert.throws(s.assertCurrent,/session changed/);
 const g=fixture();g.user.uid='VhnIFsEQFqRtS8u98mP921wim4J3';g.hook(()=>{g.auth.currentUser={...g.user,uid:OWNER};});await assert.rejects(g.api.hubCallableOwnerSession(),/session changed/);
});
