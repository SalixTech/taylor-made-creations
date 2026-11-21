import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const OWNER='a4ARjp0z8ZOByKlC2AfGzmMRj843',OTHER='VhnIFsEQFqRtS8u98mP921wim4J3';
const operationId='11111111-1111-4111-8111-111111111111';
const request={workspace:'beta',promotionAction:'prepare',operationId,sourceRevision:7};
const receipt=(actorUid=OWNER)=>({promotion:{operationId,actorUid,status:'prepared',sourceRevision:7,mainRevision:4,mainPublishedRevision:2,pageCount:0,reviewDigest:'a'.repeat(64),expiresAt:'2026-11-02T00:00:00.000Z',assets:[]}});
// Same transpiled-source fixture as beta-workspace-isolation. Only Firebase I/O
// is synthetic: the actual store, scope helpers and strict receipt decoder run.
function fixture(workspace='beta',uid=OWNER){
 const key='NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE',previous=process.env[key];process.env[key]=workspace;
 const calls=[],refs=[];let writes=0,reads=0,reply=async()=>receipt(uid);
 const user={uid,getIdToken:async()=> 'fixture-token'},auth={currentUser:user,app:{}};
 try{
  const load=sourceLoader({'firebase/firestore/lite':{
   doc:(_db,...parts)=>{refs.push(parts.join('/'));return {path:parts.join('/')}},
   getDoc:async()=>{reads++;throw Error('Promotion must not read the local workspace')},
   runTransaction:async()=>{writes++;throw Error('Promotion must not write the local workspace')},
   setDoc:async()=>{writes++;throw Error('No direct write')},collection:()=>({}),getDocs:async()=>{reads++;throw Error('No direct read')},
  },'firebase/functions':{getFunctions:()=>({}),httpsCallable:(_f,name)=>async input=>{calls.push({name,input:structuredClone(input)});return {data:await reply(input)}}}});
  const store=load('src/owner/firebase-store.ts').createFirebaseOwnerStore({db:{},auth,ownerUid:OWNER});
  return {store,user,auth,calls,refs,reply:value=>{reply=value},state:()=>({reads,writes})};
 }finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
}
test('actual promotion adapter exists only in beta; main retains no promotion port',()=>{
 const main=fixture('main'),beta=fixture();assert.equal(main.store.websitePromotion,undefined);assert.equal(typeof beta.store.websitePromotion,'function');
 assert.deepEqual(main.refs,['ownerWorkspace/current']);assert.deepEqual(beta.refs,['websiteWorkspaces/beta/ownerWorkspace/current']);main.store.dispose();beta.store.dispose();
});
test('beta adapter preserves exact operation and scoped input across explicit retries without local writes or publication notifications',async()=>{
 const originalWindow=globalThis.window,originalChannel=globalThis.BroadcastChannel;let notifications=0,channels=0;
 globalThis.window={dispatchEvent(){notifications++}};globalThis.BroadcastChannel=class{constructor(){channels++}postMessage(){notifications++}close(){}};
 const f=fixture();
 try{
  const result=await f.store.websitePromotion(request);await f.store.websitePromotion(request);
  assert.deepEqual(result,receipt());assert.deepEqual(f.calls,[1,2].map(()=>({name:'tmcOwnerPublishContent',input:request})));
  assert.deepEqual(f.state(),{reads:0,writes:0});assert.equal(notifications,0);assert.equal(channels,0);
  await assert.rejects(f.store.websitePromotion({...request,workspace:'main'}),/saved beta workspace/);assert.equal(f.calls.length,2);
 }finally{f.store.dispose();if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;globalThis.BroadcastChannel=originalChannel;}
});
test('second owner receipts use actual actor while canonical studio configuration is unchanged',async()=>{
 const f=fixture('beta',OTHER);assert.equal((await f.store.websitePromotion(request)).promotion.actorUid,OTHER);assert.equal(f.calls[0].input.workspace,'beta');f.store.dispose();
});
test('late successful callable receipt rejected after logout, actor switch, same-UID replacement or disposal',async()=>{
 for(const change of [f=>{f.auth.currentUser=null},f=>{f.auth.currentUser={...f.user,uid:OTHER}},f=>{f.auth.currentUser={...f.user}},f=>f.store.dispose()]){
  const f=fixture();f.reply(async()=>{change(f);return receipt()});await assert.rejects(f.store.websitePromotion(request),/session ended|sign-in changed/);assert.equal(f.calls.length,1);assert.deepEqual(f.state(),{reads:0,writes:0});f.store.dispose();
 }
});
test('session lost while token resolves sends no promotion request',async()=>{
 const f=fixture();f.user.getIdToken=async()=>{f.auth.currentUser=null;return 'late'};
 await assert.rejects(f.store.websitePromotion(request),/session ended/);assert.equal(f.calls.length,0);f.store.dispose();
});
test('foreign actor, foreign operation and malformed publication receipts fail strict verification',async()=>{
 for(const response of [receipt(OTHER),{promotion:{...receipt().promotion,operationId:'22222222-2222-4222-8222-222222222222'}},{promotion:{...receipt().promotion,status:'committed'}},{...receipt(),workspace:{revision:999}},{cancelled:true,actorUid:OTHER,operationId},{cancelled:true,actorUid:OWNER,operationId:'22222222-2222-4222-8222-222222222222'}]){
  const f=fixture();f.reply(async()=>response);await assert.rejects(f.store.websitePromotion(request),/another operation|could not be verified/);assert.deepEqual(f.state(),{reads:0,writes:0});f.store.dispose();
 }
});
test('exact cancellation tombstone survives adapter decoding without a fabricated workspace',async()=>{
 const f=fixture(),response={cancelled:true,actorUid:OWNER,operationId};f.reply(async()=>response);
 assert.deepEqual(await f.store.websitePromotion({...request,promotionAction:'cancel'}),response);assert.deepEqual(f.state(),{reads:0,writes:0});f.store.dispose();
});
test('definitive and uncertain callable codes retain the exact error for durable-controller retry classification',async()=>{
 for(const code of ['invalid-argument','failed-precondition','aborted','permission-denied','unauthenticated','unavailable','not-found']){
  const f=fixture(),error=Object.assign(new Error('Synthetic callable outcome'),{code:'functions/'+code});f.reply(async()=>{throw error});
  await assert.rejects(f.store.websitePromotion(request),actual=>actual===error&&actual.code==='functions/'+code);assert.deepEqual(f.state(),{reads:0,writes:0});f.store.dispose();
 }
});
