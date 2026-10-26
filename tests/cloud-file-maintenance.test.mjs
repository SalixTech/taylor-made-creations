import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appRequire } from './scout-source-loader.mjs';
import * as core from '../firebase/functions/cleanup-core.mjs';
const ts=appRequire('typescript'),ID='11111111-1111-4111-8111-111111111111';
const now=new Date().toISOString(),old=new Date(Date.now()-40*86400000).toISOString();
const file=(patch={})=>({schemaVersion:1,revision:1,kind:'file',name:'Art.psd',parentId:'root',contentType:'application/octet-stream',bytes:3,width:0,height:0,status:'ready',trashedAt:old,createdAt:old,updatedAt:now,...patch});
function fixture(){
 const documents=new Map(),objects=new Map(),deletes=[];let uid=core.OWNER_UID;
 const snap=path=>({id:path.split('/').pop(),exists:documents.has(path),data:()=>structuredClone(documents.get(path))});
 const collection=path=>({path,collection:true,orderBy(){return this},limit(){return this},startAfter(cursor){return{...this,cursor}},async get(){return{docs:[...documents.keys()].filter(p=>p.startsWith(path+'/')&&(!this.cursor||p.split('/').pop()>this.cursor)).map(snap),get empty(){return this.docs.length===0},get size(){return this.docs.length}}}});
 const db={doc:path=>({path,get:async()=>snap(path),set:async(data,opts)=>documents.set(path,{...(opts?.merge?documents.get(path):{}),...data})}),collection,
 runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>ref.collection?ref.get():snap(ref.path),update:(ref,data)=>writes.push(()=>documents.set(ref.path,{...documents.get(ref.path),...data})),delete:ref=>writes.push(()=>documents.delete(ref.path))});for(const write of writes)write();return result;}};
 const bucket={file:path=>({getMetadata:async()=>{if(!objects.has(path))throw Object.assign(new Error('missing'),{code:404});return[objects.get(path)]},delete:async options=>{deletes.push({path,options});objects.delete(path);}})};
 const modules={'firebase-admin/app':{initializeApp:()=>{}},'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async()=>({uid})})},'firebase-admin/firestore':{FieldPath:{documentId:()=>''},getFirestore:()=>db},'firebase-admin/storage':{getStorage:()=>({bucket:()=>bucket})},'firebase-functions/v2/https':{onRequest:(_options,handler)=>handler},'firebase-functions/v2/scheduler':{onSchedule:(_options,handler)=>handler},'./cleanup-core.mjs':core};
 const output=ts.transpileModule(readFileSync(new URL('../firebase/functions/index.mjs',import.meta.url),'utf8'),{fileName:'maintenance.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',output)(name=>modules[name],mod,mod.exports);
 async function request(method='GET',body){let status=200,payload;const response={set(){return this},status(n){status=n;return this},json(value){payload=value;return this}};await mod.exports.tmcFileMaintenance({method,body,get:()=> 'Bearer fixture'},response);return{status,payload};}
 return{documents,objects,deletes,request,setUid:value=>{uid=value},scheduler:mod.exports.tmcDailyTrashCleanup};
}
async function inProject(run){const old=process.env.GCLOUD_PROJECT;process.env.GCLOUD_PROJECT='taylor-made-creations';try{await run()}finally{if(old===undefined)delete process.env.GCLOUD_PROJECT;else process.env.GCLOUD_PROJECT=old}}
const body={action:'delete',confirmation:'permanently-delete',files:[{id:ID,revision:1}]};
test('cleanupendpoint refusesnonowner andrequires explicitdeleteconfirmation',()=>inProject(async()=>{
 const f=fixture();f.setUid('other');assert.equal((await f.request()).status,403);f.setUid(core.OWNER_UID);assert.equal((await f.request('POST',{action:'delete'})).status,400);assert.equal(f.deletes.length,0);
}));
test('cleanuphealth is nothealthyafter latestfailedscheduledrun',()=>inProject(async()=>{
 const f=fixture();f.documents.set('ownerFileMaintenance/current',{lastRunAt:now,failed:1});assert.equal((await f.request()).payload.automaticCleanupEnabled,false);
 f.documents.set('ownerFileMaintenance/current',{lastRunAt:now,failed:0});assert.equal((await f.request()).payload.automaticCleanupEnabled,true);
}));
test('published andprivatelysavedasset referencespreventpermanentdeletion',()=>inProject(async()=>{
 for(const scope of ['public','workspace','named']){
  const f=fixture();f.documents.set(`ownerFiles/${ID}`,file());
  if(scope==='public'){f.documents.set('site/published',{revision:1});f.documents.set('site/publishedAssets',{revision:1,ids:[ID]});}
  if(scope==='workspace')f.documents.set('ownerWorkspace/current',{schemaVersion:1,revision:1,payload:JSON.stringify({draft:{src:`/api/cloud-files/${ID}?kind=file`}})});
  if(scope==='named'){f.documents.set('ownerDraftIndex/current',{schemaVersion:1,revision:1,drafts:{holiday:1}});f.documents.set('ownerDrafts/holiday',{schemaVersion:1,revision:1,payload:JSON.stringify({content:{src:`/api/cloud-media/${ID}`}})});}
  const result=await f.request('POST',body);assert.deepEqual(result.payload.blockedIds,[ID]);assert.equal(f.deletes.length,0);assert.equal(f.documents.get(`ownerFiles/${ID}`).status,'ready');
 }
}));
test('unusedtrashedobject deletesmatchinggeneration andmetadata, never arbitrarypath',()=>inProject(async()=>{
 const f=fixture(),path=`files/${ID}.bin`;f.documents.set(`ownerFiles/${ID}`,file());f.objects.set(path,{metadata:{fileId:ID},size:'3',contentType:'application/octet-stream',generation:'123'});
 const result=await f.request('POST',body);assert.deepEqual(result.payload.deletedIds,[ID]);assert.deepEqual(f.deletes,[{path,options:{ifGenerationMatch:'123',ignoreNotFound:true}}]);assert.equal(f.documents.has(`ownerFiles/${ID}`),false);
}));
test('mismatchedobject staysreservedandretryable whileuploadingrecordneverpurges',()=>inProject(async()=>{
 const f=fixture();f.documents.set(`ownerFiles/${ID}`,file());f.objects.set(`files/${ID}.bin`,{metadata:{fileId:ID},size:'4',contentType:'application/octet-stream',generation:'123'});
 assert.deepEqual((await f.request('POST',body)).payload.failedIds,[ID]);assert.equal(f.documents.get(`ownerFiles/${ID}`).status,'deleting');assert.equal(f.deletes.length,0);
 const g=fixture();g.documents.set(`ownerFiles/${ID}`,file({status:'uploading'}));assert.deepEqual((await g.request('POST',body)).payload.blockedIds,[ID]);assert.equal(g.documents.get(`ownerFiles/${ID}`).status,'uploading');
}));
test('scheduledrun purgeseligibleunusedfiles and writesreal successfulheartbeat',()=>inProject(async()=>{
 const f=fixture();f.documents.set(`ownerFiles/${ID}`,file());await f.scheduler();assert.equal(f.documents.has(`ownerFiles/${ID}`),false);assert.equal(f.documents.get('ownerFileMaintenance/current').failed,0);assert.equal(typeof f.documents.get('ownerFileMaintenance/current').lastRunAt,'string');
}));
