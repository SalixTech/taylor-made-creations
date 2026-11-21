// Real Admin Firestore transactions, isolated demo emulator only; no live services.
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {createHubService} from '../../firebase/functions/hub-core.mjs';
import {OWNER_UID} from '../../firebase/functions/cleanup-core.mjs';
const requireAdmin=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app');
const {getFirestore}=requireAdmin('firebase-admin/firestore');
const PROJECT='demo-tmc-hub-rules',A='TMC-0123456789ABCDEF',B='TMC-FEDCBA9876543210',ISO='2026-10-28T00:00:00.000Z';
const OWNER={auth:{uid:OWNER_UID}};
let env,app,db,service;
const pid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const client=id=>({clientId:id,displayName:'Test client',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO});
const project=(n,clientId=A,extra={})=>({projectId:pid(n),clientId,title:`Existing ${n}`,summary:'Preserve',status:'in-progress',progress:30,progressSource:'manual',trackingUrl:null,requestId:null,version:1,createdAt:ISO,updatedAt:ISO,...extra});
async function seedProjects(values){await Promise.all(values.map(value=>db.doc(`hubProjects/${value.projectId}`).set(value)));}
async function projects(clientId=A){return (await db.collection('hubProjects').where('clientId','==',clientId).get()).docs.map(d=>d.data());}
const create=(title,clientId=A)=>service.createProject({operationId:randomUUID(),clientId,title,summary:''},OWNER);
before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Requires Firestore demo emulator at127.0.0.1:18080');
 env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:18080}});
 app=initializeApp({projectId:PROJECT},'fox9-autoarchive-integration');db=getFirestore(app);
 service=createHubService({db,auth:{createCustomToken(){throw Error('No authentication side effect expected');}},now:()=>Date.parse('2026-10-28T12:00:00.000Z')});
});
beforeEach(async()=>{await env.clearFirestore();await Promise.all([A,B].map(id=>db.doc(`hubClients/${id}`).set(client(id))));});
after(async()=>{await env?.cleanup();if(app)await deleteApp(app);});
for(const initial of [0,1])test(`concurrent creates from ${initial} existing cards serialize through per-client sequence`,async()=>{
 if(initial)await seedProjects([project(1)]);
 const results=await Promise.all([create('One'),create('Two'),create('Three')]);
 const saved=await projects();assert.equal(saved.length,initial+3);assert.equal(saved.filter(p=>p.ownerArchived!==true).length,2);assert.equal(saved.filter(p=>p.ownerArchived===true).length,initial+1);
 assert.equal(new Set(results.map(r=>r.project.projectId)).size,3);
 assert.deepEqual((await db.doc(`hubProjectCreateState/${A}`).get()).data(),{clientId:A,sequence:3});
 if(initial)assert.equal((await db.doc(`hubProjects/${pid(1)}`).get()).data().ownerArchived,true);
 assert.equal((await db.doc(`hubClients/${A}`).get()).data().status,'active');
});
test('new create archives exactly one deterministic oldest card and isolates other client',async()=>{
 const retained=project(2,A,{status:'completed',completedAt:ISO,attachmentsExpireAt:'2028-04-28T00:00:00.000Z'});
 await seedProjects([project(1),retained,project(3),project(4),project(10,B),project(11,B)]);
 await create('New');
 const saved=await projects(),archived=saved.filter(p=>p.ownerArchived===true);
 assert.equal(archived.length,1);assert.equal(archived[0].projectId,pid(1));assert.equal(archived[0].version,2);assert.equal(archived[0].status,'in-progress');
 assert.equal(saved.filter(p=>p.ownerArchived!==true).length,4);
 assert.deepEqual((await db.doc(`hubProjects/${pid(2)}`).get()).data(),retained);
 assert.equal((await projects(B)).filter(p=>p.ownerArchived===true).length,0);
 assert.equal((await db.doc(`hubProjectCreateState/${B}`).get()).exists,false);
});
test('explicit restore may exceed two without archiving another; subsequent create moves exactly one',async()=>{
 await seedProjects([project(1,A,{ownerArchived:true}),project(2),project(3)]);
 await service.setProjectArchived({projectId:pid(1),expectedVersion:1,archived:false},OWNER);
 let saved=await projects();assert.equal(saved.filter(p=>p.ownerArchived!==true).length,3);assert.equal(saved.filter(p=>p.ownerArchived===true).length,0);
 await create('After restore');saved=await projects();assert.equal(saved.length,4);assert.equal(saved.filter(p=>p.ownerArchived===true).length,1);assert.equal(saved.filter(p=>p.ownerArchived!==true).length,3);assert.equal(saved.find(p=>p.projectId===pid(1)).ownerArchived,true);
});
