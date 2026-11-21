import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const load=sourceLoader(), codec=load('src/owner/construction-whimsy.ts'), reader=load('src/server/published-site.ts');
const flag=(enabled,revision=1)=>({schemaVersion:1,revision,enabled});
const rest=raw=>({fields:Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,typeof value==='boolean'?{booleanValue:value}:{integerValue:String(value)}]))});
test('optional construction whimsy defaults off and rejects arbitrary fields/nonboolean/unsafe revisions',()=>{
 assert.deepEqual(codec.defaultConstructionWhimsy(),flag(false,0));
 assert.deepEqual(codec.decodeConstructionWhimsy(flag(true)),flag(true));
 assert.deepEqual(codec.decodeConstructionWhimsyRestDocument(rest(flag(false))),flag(false));
 for(const value of [null,{},flag('true'),flag(true,0),flag(true,1.5),flag(true,Infinity),{...flag(true),payload:'private'},flag(true,Number.MAX_SAFE_INTEGER+1)])assert.throws(()=>codec.decodeConstructionWhimsy(value));
});
test('locked public route reads only gate and tiny optional flag, never publication/draft/account',async()=>{
 const paths=[];
 const fetcher=async url=>{paths.push(url.split('/').pop());if(url.endsWith('/access'))return Response.json(rest({schemaVersion:1,revision:3,constructionMode:true}));if(url.endsWith('/constructionWhimsy'))return Response.json(rest(flag(true)));throw Error('private/publication fetch forbidden');};
 assert.deepEqual(await reader.readPublishedSite({projectId:'demo-tmc-whimsy',fetcher}),{status:'locked',accessRevision:3,constructionWhimsyEnabled:true});
 assert.deepEqual(paths,['access','constructionWhimsy']);
});
test('absent, denied, malformed and unavailable optional setting stay locked with game off',async()=>{
 for(const response of [()=>Response.json({}, {status:404}),()=>Response.json({}, {status:403}),()=>Response.json(rest({...flag(true),private:'secret'})),()=>new Response('x'.repeat(4097)),()=>{throw Error('offline');}]){
  const paths=[];const state=await reader.readPublishedSite({projectId:'demo-tmc-whimsy',fetcher:async url=>{paths.push(url.split('/').pop());return url.endsWith('/access')?Response.json(rest({schemaVersion:1,revision:2,constructionMode:true})):response();}});
  assert.deepEqual(state,{status:'locked',accessRevision:2});assert.deepEqual(paths,['access','constructionWhimsy']);
 }
});
test('owner opt-in CAS changes only tiny setting, stale revisions/expired sessions cannot write',async()=>{
 const docs=new Map(),writes=[];const user={uid:'a4ARjp0z8ZOByKlC2AfGzmMRj843',getIdToken:async()=> 'fixture'};const auth={currentUser:user};const snap=path=>({exists:()=>docs.has(path),data:()=>structuredClone(docs.get(path))});
 const db={};const lite={doc:(_,path)=>({path}),getDoc:async ref=>snap(ref.path),runTransaction:async(_,fn)=>fn({get:async ref=>snap(ref.path),set:(ref,value)=>{docs.set(ref.path,structuredClone(value));writes.push(ref.path);}})};
 const l=sourceLoader({'firebase/firestore/lite':lite,'firebase/auth':{},'firebase/functions':{getFunctions:()=>({}),httpsCallable:()=>()=>{throw Error('no callable expected');}}});
 const store=l('src/owner/firebase-store.ts').createFirebaseOwnerStore({db,auth,ownerUid:user.uid});
 assert.deepEqual(await store.readLiveConstructionWhimsy(),flag(false,0));assert.equal(docs.size,0);
 assert.deepEqual(await store.updateConstructionWhimsy(true,0),flag(true));assert.deepEqual(writes,['site/constructionWhimsy']);
 await assert.rejects(store.updateConstructionWhimsy(false,0),/changed on another device/);assert.equal(writes.length,1);
 assert.deepEqual(await store.updateConstructionWhimsy(false,1),flag(false,2));
 auth.currentUser=null;await assert.rejects(store.updateConstructionWhimsy(true,2));assert.equal(writes.length,2);
});
