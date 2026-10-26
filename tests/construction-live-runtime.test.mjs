import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
import { harness } from './owner-ui-harness.mjs';
const load=sourceLoader(), reader=load('src/server/published-site.ts'), model=load('src/owner/model.ts'), defaults=load('src/owner/defaults.ts');
const projectId='demo-tmc-access-runtime';
const access=(constructionMode,revision=1)=>({fields:{schemaVersion:{integerValue:'1'},revision:{integerValue:String(revision)},constructionMode:{booleanValue:constructionMode}}});
const snapshot=model.createPublishedOwnerSnapshot(defaults.createDefaultOwnerContent(),4,'2026-10-25T18:00:00.000Z');
const publication={fields:{schemaVersion:{integerValue:'1'},revision:{integerValue:'4'},payload:{stringValue:JSON.stringify(snapshot)}}};
const published=(accessRevision=1)=>({status:'published',snapshot,accessRevision});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

for (const status of [400,401,403,404,429,500,503]) test(`access status ${status} stays locked and never requests publication`,async()=>{
  const paths=[];
  assert.deepEqual(await reader.readPublishedSite({projectId,fetcher:async url=>{paths.push(url);return Response.json({error:{status:'ERROR'}},{status});}}),{status:'locked'});
  assert.equal(paths.length,1);assert.ok(paths[0].endsWith('/site/access'));
});
test('invalid, oversized and unknown access fields fail closed without reading public or private content',async()=>{
  const values=[null,{},[],{fields:{}},access('false'),access(false,0),access(false,-1),access(false,1.5),access(false,Number.MAX_SAFE_INTEGER+1)];
  const extra=access(false);extra.fields.draft={stringValue:'PRIVATE_SENTINEL'};values.push(extra);
  const malformed=access(false);malformed.fields.constructionMode.stringValue='false';values.push(malformed);
  const wrongSchema=access(false);wrongSchema.fields.schemaVersion.integerValue='2';values.push(wrongSchema);
  for(const value of values){let calls=0;const state=await reader.readPublishedSite({projectId,fetcher:async()=>{calls++;return Response.json(value);}});assert.deepEqual(state,{status:'locked'});assert.equal(calls,1);}
  for(const body of ['not-json','x'.repeat(4097)]){let calls=0;assert.deepEqual(await reader.readPublishedSite({projectId,fetcher:async()=>{calls++;return new Response(body);}}),{status:'locked'});assert.equal(calls,1);}
});
test('access network failure is locked; ON exposes no publication snapshot and OFF is re-read for every request',async()=>{
  assert.deepEqual(await reader.readPublishedSite({projectId,fetcher:async()=>{throw Error('offline');}}),{status:'locked'});
  const paths=[];let mode=false,revision=2;
  const fetcher=async url=>{paths.push(url);return Response.json(url.endsWith('/access')?access(mode,revision):publication);};
  const first=await reader.readPublishedSite({projectId,fetcher});assert.equal(first.status,'published');assert.equal(first.accessRevision,2);
  mode=true;revision=3;
  const next=await reader.readPublishedSite({projectId,fetcher});assert.deepEqual(next,{status:'locked',accessRevision:3});assert.doesNotMatch(JSON.stringify(next),/payload|snapshot|content|PRIVATE_SENTINEL/);
  assert.deepEqual(paths.map(p=>p.split('/').pop()),['access','published','access']);
});

function fixture({initialState={status:'locked'},pathname='/',reply=()=>Response.json({status:'locked'},{status:503}),hidden=false}={}){
  const h=harness();h.pathname=pathname;h.document.visibilityState=hidden?'hidden':'visible';
  let now=0,id=0;const timers=new Map(),calls=[],channels=[];
  h.globals.Date=class extends Date{static now(){return now;}};
  h.globals.setTimeout=(fn,delay)=>{const key=++id;timers.set(key,{fn,due:now+delay});return key;};
  h.globals.clearTimeout=key=>timers.delete(key);
  h.globals.BroadcastChannel=class{constructor(){channels.push(this);}close(){this.closed=true;}};
  h.globals.fetch=(url,init)=>{calls.push({url,init});return Promise.resolve().then(()=>reply(calls.length));};
  const runtimeModule=h.load('src/components/PublicSiteContext.tsx'),props={initialState,children:null};
  const render=()=>h.render(runtimeModule.PublicSiteProvider,props);
  const advance=async ms=>{const target=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.due<=target).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;now=next[1].due;timers.delete(next[0]);next[1].fn();await flush();render();}now=target;await flush();render();};
  render();return {h,runtimeModule,props,calls,channels,timers,render,advance,state:()=>h.tree.props.value.state,focus:()=>h.window.dispatchEvent(new Event('focus'))};
}
test('locked tabs reopen and close with bounded polling; reopening accepts unchanged publication with a new access revision',async()=>{
  let response=published(1);const f=fixture({reply:()=>Response.json(response,{status:response.status==='locked'?503:200})});
  await flush();f.render();assert.equal(f.state().status,'published');assert.equal(f.calls.length,1);
  response={status:'locked',accessRevision:2};await f.advance(30000);assert.deepEqual(f.state(),response);assert.equal(f.calls.length,2);
  response=published(3);await f.advance(30000);assert.deepEqual(f.state(),response);assert.equal(f.calls.length,3);
  f.h.unmount();assert.equal(f.timers.size,0);assert.ok(f.channels.every(c=>c.closed));
});
test('hidden tabs do not poll, focus refreshes once visible, owner and preview routes never request publication',async()=>{
  const f=fixture({hidden:true});await f.advance(90000);assert.equal(f.calls.length,0);f.focus();assert.equal(f.calls.length,0);
  f.h.document.visibilityState='visible';f.focus();await flush();f.render();assert.equal(f.calls.length,1);f.h.unmount();
  for(const pathname of ['/taylor','/taylor/preview/gallery','/owner','/owner/settings']){const f=fixture({pathname});await f.advance(90000);f.focus();assert.equal(f.calls.length,0,pathname);f.h.unmount();}
});
test('focus/event storms and in-flight requests cannot create overlapping or unbounded fetches',async()=>{
  const pending=deferred();const f=fixture({reply:()=>pending.promise});
  for(let i=0;i<20;i++){f.focus();f.h.window.dispatchEvent(new Event('tmc:published'));f.channels[0].onmessage();}await flush();assert.equal(f.calls.length,1);
  await f.advance(4000);f.focus();assert.equal(f.calls.length,1);
  pending.resolve(Response.json(published()));await flush();f.render();f.focus();await flush();assert.equal(f.calls.length,2);
  for(let i=0;i<20;i++)f.focus();assert.equal(f.calls.length,2);f.h.unmount();
});
test('request timeout locks old content, aborts, and permits a later retry without accepting an ignored-abort response',async()=>{
  const pending=deferred();const f=fixture({initialState:published(1),reply:count=>count===1?pending.promise:Response.json({status:'locked',accessRevision:3},{status:503})});
  await f.advance(8000);assert.deepEqual(f.state(),{status:'locked',accessRevision:1});assert.equal(f.calls[0].init.signal.aborted,true);
  f.focus();await flush();f.render();assert.equal(f.calls.length,2);assert.deepEqual(f.state(),{status:'locked',accessRevision:3});
  pending.resolve(Response.json(published(2)));await flush();f.render();assert.deepEqual(f.state(),{status:'locked',accessRevision:3});f.h.unmount();
});
test('unmount and navigation abort pending reads; newer access decisions reject stale publication and lock responses',async()=>{
  const pending=deferred();const f=fixture({reply:()=>pending.promise});
  f.h.tree.props.value.acceptServerState({status:'locked',accessRevision:5});f.render();
  pending.resolve(Response.json(published(4)));await flush();f.render();assert.deepEqual(f.state(),{status:'locked',accessRevision:5});
  f.h.tree.props.value.acceptServerState(published(6));f.render();f.h.tree.props.value.acceptServerState({status:'locked',accessRevision:5});f.render();assert.equal(f.state().status,'published');
  const pendingAgain=deferred(),g=fixture({reply:()=>pendingAgain.promise});await flush();g.h.pathname='/taylor';g.render();assert.equal(g.calls[0].init.signal.aborted,true);pendingAgain.resolve(Response.json(published()));await flush();g.render();assert.deepEqual(g.state(),{status:'locked'});g.h.unmount();f.h.unmount();
});
test('failed and malformed checks hide cached publication, and malformed locked bodies never leak extra fields',async()=>{
  for(const reply of [()=>{throw Error('offline');},()=>Response.json(published(0)),()=>Response.json({...published(),snapshot:{private:'NO'}}),()=>Response.json({status:'baseline',reason:'unconfigured'}),()=>Response.json(published(),{status:500})]){
    const f=fixture({initialState:published(1),reply});await flush();f.render();assert.equal(f.state().status,'locked');assert.equal(f.state().snapshot,undefined);f.h.unmount();
  }
  const f=fixture({reply:()=>Response.json({status:'locked',accessRevision:4,private:'NO',snapshot})});await flush();f.render();assert.deepEqual(f.state(),{status:'locked',accessRevision:4});f.h.unmount();
});
test('unchanged locked server props do not pin reopened tabs; fresh newer navigation locks immediately',()=>{
  const h=harness(),runtimeModule=h.load('src/components/PublicSiteContext.tsx'),initial={status:'locked',accessRevision:1};
  let state=initial;const accepted=[];h.currentContext={state,acceptServerState:value=>accepted.push(value)};
  const Component=({incoming})=>({type:'output',props:{value:runtimeModule.usePublicServerState(incoming)}});
  assert.equal(h.render(Component,{incoming:initial}).props.value.status,'locked');
  h.currentContext={...h.currentContext,state:published(2)};assert.equal(h.render(Component,{incoming:initial}).props.value.status,'published');
  const newer={status:'locked',accessRevision:3};assert.deepEqual(h.render(Component,{incoming:newer}).props.value,newer);
  assert.deepEqual(accepted,[initial,newer]);h.unmount();
});

test('unknown failures preserve the access high-water mark and old RSC content cannot reopen them',async()=>{
  const f=fixture({initialState:published(6),reply:()=>{throw Error('network');}});await flush();f.render();assert.deepEqual(f.state(),{status:'locked',accessRevision:6});
  f.h.tree.props.value.acceptServerState(published(5));f.render();assert.deepEqual(f.state(),{status:'locked',accessRevision:6});
  const h=harness(),runtimeModule=h.load('src/components/PublicSiteContext.tsx');h.currentContext={state:f.state(),acceptServerState(){}};
  const Component=()=>({type:'output',props:{value:runtimeModule.usePublicServerState(published(5))}});assert.equal(h.render(Component).props.value.status,'locked');h.unmount();f.h.unmount();
});
