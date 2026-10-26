import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';

const load=sourceLoader(),server=load('src/server/published-site.ts'),model=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts');
const projectId='demo-tmc-space-qa';
const published=()=>model.createPublishedOwnerSnapshot(defaults.createDefaultOwnerContent(),4,'2026-10-25T18:00:00.000Z');
const rest=(snapshot=published())=>({name:'projects/demo-tmc-space-qa/databases/(default)/documents/site/published',fields:{schemaVersion:{integerValue:'1'},revision:{integerValue:String(snapshot.revision)},payload:{stringValue:JSON.stringify(snapshot)}}});
const access = { fields: { schemaVersion: { integerValue: '1' }, revision: { integerValue: '1' }, constructionMode: { booleanValue: false } } };
const open = fetcher => (url, init) => url.endsWith('/access') ? Promise.resolve(Response.json(access)) : fetcher(url, init);
test('public runtime fetches only exact access then public documents without owner credentials', async () => {
  const calls=[];
  const state=await server.readPublishedSite({projectId,fetcher:async(url,init)=>{
    calls.push(url); assert.equal(init.method,'GET'); assert.equal(init.cache,'no-store'); assert.equal(init.credentials,'omit'); assert.deepEqual(init.headers,{Accept:'application/json'});
    return Response.json(url.endsWith('/access') ? access : rest());
  }});
  assert.deepEqual(calls, ['access','published'].map(path=>`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/site/${path}`));
  assert.equal(state.status,'published'); assert.equal(state.accessRevision,1); assert.deepEqual(state.snapshot,published());
});
test('unconfigured site is locked and never initiates a request',async()=>{let calls=0;const state=await server.readPublishedSite({projectId:'',fetcher:async()=>{calls++;throw Error('No');}});assert.deepEqual(state,{status:'locked'});assert.equal(calls,0);});
test('missing publication, project and database never permit bundled baseline',async()=>{for(const message of ['Document projects/demo/databases/(default)/documents/site/published not found.','Project not found.','Database (default) does not exist.','Not found']){const state=await server.readPublishedSite({projectId,fetcher:open(async()=>Response.json({error:{status:'NOT_FOUND',message}},{status:404}))});assert.equal(state.status,'error');}});
for(const status of [400,401,403,429,500,503])test(`public status ${status} produces unavailable, never baseline`,async()=>{const state=await server.readPublishedSite({projectId,fetcher:open(async()=>Response.json({error:{status:'ERROR'}},{status}))});assert.equal(state.status,'error');assert.equal(Object.hasOwn(state,'snapshot'),false);});
test('publication timeout and malformed successful responses fail closed',async()=>{for(const fetcher of [async()=>{throw Error('timeout');},async()=>new Response('not JSON'),async()=>Response.json({fields:{}}),async()=>Response.json({...rest(),fields:{...rest().fields,draft:{stringValue:'private'}}})]){const state=await server.readPublishedSite({projectId,fetcher:open(fetcher)});assert.equal(state.status,'error');}});
test('REST decoder validates wrapper, matching revision, unsafe blocks and private payloads',()=>{for(const mutate of [r=>r.fields.revision.integerValue='5',r=>r.fields.revision.integerValue='04',r=>r.fields.revision.integerValue='9007199254740992',r=>r.fields.payload.bytesValue='no',r=>r.fields.payload.stringValue=JSON.stringify(defaults.createInitialOwnerWorkspace()),r=>{const p=published();p.content.pages[0].blocks=[{id:'evil',type:'link',label:'Go',href:'javascript:alert(1)'}];r.fields.payload.stringValue=JSON.stringify(p);}]){const r=rest();mutate(r);assert.throws(()=>server.decodePublishedRestDocument(r));}});
test('removed public page stays absent and error does not introduce baseline pages',async()=>{let content=defaults.createDefaultOwnerContent();content=model.trashPage(content,content.pages.find(p=>p.builtinKey==='terms').id);const p=model.createPublishedOwnerSnapshot(content,7);const state=await server.readPublishedSite({projectId,fetcher:open(async()=>Response.json(rest(p)))});assert.equal(state.status,'published');assert.equal(state.snapshot.content.pages.some(p=>p.builtinKey==='terms'),false);});
test('invalid project names are rejected locally without network request',async()=>{for(const projectId of ['https://evil.example','../secret','valid-project?key=secret','UPPER','a']){let called=false;const state=await server.readPublishedSite({projectId,fetcher:async()=>{called=true;throw Error('bad');}});assert.equal(state.status,'locked');assert.equal(called,false);}});
