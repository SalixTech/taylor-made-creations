import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const C='TMC-0011223344556677',D='TMC-8899AABBCCDDEEFF',P='11111111-1111-4111-8111-111111111111',Q='22222222-2222-4222-8222-222222222222',ISO='2026-10-29T00:00:00.000Z';
const client=id=>({clientId:id,displayName:id,status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO});
const project=(id=P,clientId=C)=>({projectId:id,clientId,title:id,summary:'',status:'in-progress',progress:1,progressSource:'manual',trackingUrl:null,requestId:null,version:1,createdAt:ISO,updatedAt:ISO});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const active=new Set();afterEach(()=>{for(const h of active)h.unmount();active.clear();});
function browser(h,href='/taylor/client-hub') {h.window.location.href=href;Object.defineProperties(h.window.location,{pathname:{get(){return new URL(this.href,'https://local.test').pathname;}},search:{get(){return new URL(this.href,'https://local.test').search;}}});return h.window;}
function setup(options={}){
 const h=harness();active.add(h);browser(h,options.href);const calls=[],live=[];let valid=true;
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({assertCurrent(){if(!valid)throw Error('revoked');},auth:{onAuthStateChanged(){return()=>{};}}})};
 h.overrides['./client-hub-client']={clientHubErrorMessage:e=>e.message,subscribeClients(){return()=>{};},subscribeClientDetail(id,onData){live.push({id,onData});return()=>{};},
 listClients:async()=>options.list?options.list():[client(C),client(D)],getClientDetail:async id=>{calls.push(id);return options.detail?options.detail(id):{client:client(id),projects:[project(id===C?P:Q,id)],email:''};}};
 const Component=h.load('src/owner/OwnerClientHub.tsx').OwnerClientHub,props={},render=()=>h.render(Component,props);
 const workspace=()=>h.find(n=>n.type?.name==='HubWorkspaceWindow');
 render();return {h,props,render,calls,live,workspace,async settle(){await tick();render();await tick();render();},open(id){h.find(n=>n.type==='button'&&n.props.className==='clientRow'&&content(n).includes(id)).props.onClick();render();}};
}
test('parser accepts only stable IDs and allowlisted owner tabs, never codes/content or duplicate params',()=>{
 const h=harness();active.add(h);const api=h.load('src/owner/owner-hub-location.ts');
 assert.deepEqual(api.readOwnerHubLocation(`/taylor/client-hub?client=${C}&commission=${P}&tab=chat`),{clientId:C,projectId:P,tab:'chat'});
 for(const href of [`/client-hub?client=${C}`,`/taylor/client-hub?client=A47-TES-621-RV`,`/taylor/client-hub?client=${C}&client=${D}`,`/taylor/client-hub?client=${C}&commission=../private`])assert.equal(api.readOwnerHubLocation(href),null);
 assert.equal(api.readOwnerHubLocation(`/taylor/client-hub?client=${C}&commission=${P}&tab=secret`).tab,'overview');
 assert.equal(api.ownerHubHref({clientId:C,projectId:P,tab:'chat'}),`/taylor/client-hub?client=${C}&commission=${P}&tab=chat`);
});
test('refresh restores verified client, exact commission and tab and focuses workspace',async()=>{
 const t=setup({href:`/taylor/client-hub?client=${C}&commission=${Q}&tab=photos`,detail:async()=>({client:client(C),projects:[project(),project(Q)],email:''})});assert.equal(t.calls.length,0);await t.settle();
 assert.deepEqual(t.calls,[C]);assert.equal(t.workspace().props.project.projectId,Q);assert.equal(t.workspace().props.navigation.tab,'photos');assert.ok(t.workspace().props.openVersion>0);
});
test('unknown/deleted client never triggers detail read; invalid project falls back to verified visible project',async()=>{
 const unknown=setup({href:`/taylor/client-hub?client=TMC-FFFFFFFFFFFFFFFF&commission=${P}&tab=chat`});await unknown.settle();assert.equal(unknown.calls.length,0);assert.equal(unknown.workspace(),undefined);assert.equal(unknown.h.window.location.search,'');
 const bad=setup({href:`/taylor/client-hub?client=${C}&commission=${Q}&tab=chat`});await bad.settle();assert.equal(bad.workspace().props.project.projectId,P);assert.equal(bad.workspace().props.navigation.tab,'overview');assert.match(bad.h.window.location.search,new RegExp(P));
});
test('URL cannot bypass inaccessible detail or failed authenticated directory',async()=>{
 const denied=setup({href:`/taylor/client-hub?client=${C}&commission=${P}&tab=chat`,detail:async()=>{throw Error('permission denied');}});await denied.settle();assert.equal(denied.workspace(),undefined);assert.match(content(denied.h.tree),/permission denied/);
 const list=setup({href:`/taylor/client-hub?client=${C}`,list:async()=>{throw Error('auth failed');}});await list.settle();assert.equal(list.calls.length,0);assert.equal(list.workspace(),undefined);
});
test('new client selection wins over slow initial deep link and tab writes replace one history entry',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const t=setup({href:`/taylor/client-hub?client=${C}&commission=${P}&tab=chat`,detail:id=>id===C?pending:Promise.resolve({client:client(D),projects:[project(Q,D)],email:''})});
 await t.settle();t.open(D);await t.settle();resolve({client:client(C),projects:[project()],email:''});await t.settle();assert.equal(t.workspace().props.project.clientId,D);assert.match(t.h.window.location.search,new RegExp(D));
 const length=t.h.window.history.length;t.workspace().props.onTabChange('support');t.render();assert.equal(t.h.window.history.length,length);assert.match(t.h.window.location.search,/tab=support/);
});
test('authoritative project removal repairs URL and does not restore a deleted tab selection',async()=>{
 const t=setup({href:`/taylor/client-hub?client=${C}&commission=${Q}&tab=studio`,detail:async()=>({client:client(C),projects:[project(),project(Q)],email:''})});await t.settle();t.live.at(-1).onData({client:client(C),projects:[project()],email:''});t.render();t.render();assert.equal(t.workspace().props.project.projectId,P);assert.equal(t.workspace().props.navigation.tab,'overview');assert.match(t.h.window.location.search,new RegExp(P));
});
test('history controller preserves Hub selection during guarded Back rollback and clean Back/Forward',async()=>{
 const h=harness();active.add(h);const w=browser(h,'/taylor/overview'),nav=h.load('src/owner/owner-navigation.ts'),location=h.load('src/owner/owner-hub-location.ts');let destination={section:'overview'},blocked=false,interrupts=0,restores=0;
 w.addEventListener(location.OWNER_HUB_LOCATION_RESTORE,()=>restores++);
 const control=nav.createOwnerNavigation(w,{blocked:()=>blocked,dirty:()=>false,current:()=>destination,arrive:d=>destination=d,confirm(){},interrupted(){interrupts++;}});
 control.arrive({section:'clients'});location.replaceOwnerHubLocation({clientId:C,projectId:P,tab:'chat'},w);blocked=true;w.history.back();await tick();await tick();assert.equal(destination.section,'clients');assert.match(w.location.search,/tab=chat/);assert.equal(interrupts,1);
 blocked=false;control.arrive({section:'inventory'});w.history.back();await tick();assert.equal(destination.section,'clients');assert.match(w.location.search,/tab=chat/);assert.equal(restores,1);w.history.forward();await tick();assert.equal(destination.section,'inventory');control.dispose();
});

test('same-section history pop while Hub work is dirty rolls back without replacing selection or draft',async()=>{
 const h=harness();active.add(h);const w=browser(h,'/taylor/client-hub'),nav=h.load('src/owner/owner-navigation.ts'),location=h.load('src/owner/owner-hub-location.ts');let destination={section:'clients'},blocked=false,restores=0;const draft={message:'kept foreground'};
 w.addEventListener(location.OWNER_HUB_LOCATION_RESTORE,()=>restores++);
 const control=nav.createOwnerNavigation(w,{blocked:()=>blocked,dirty:()=>false,current:()=>destination,arrive:d=>destination=d,confirm(){throw Error('Hub blocked guard should not use website draft confirmation');},interrupted(){}});
 location.replaceOwnerHubLocation({clientId:C,projectId:P,tab:'photos'},w);control.arrive({section:'clients'});location.replaceOwnerHubLocation({clientId:D,projectId:Q,tab:'chat'},w);
 blocked=true;w.history.back();await tick();await tick();assert.match(w.location.search,new RegExp(D));assert.match(w.location.search,/tab=chat/);assert.equal(restores,0);assert.equal(draft.message,'kept foreground');
 blocked=false;w.history.back();await tick();assert.match(w.location.search,new RegExp(C));assert.equal(restores,1);control.dispose();
});
test('a late accepted history event refuses to discard newly dirty work and repairs the visible selection URL',async()=>{
 const t=setup({href:`/taylor/client-hub?client=${C}&commission=${P}&tab=chat`});await t.settle();t.workspace().props.onDirtyChange(true);t.render();
 const api=t.h.load('src/owner/owner-hub-location.ts');t.h.window.history.replaceState(t.h.window.history.state,'',`/taylor/client-hub?client=${D}&commission=${Q}&tab=photos`);t.h.window.dispatchEvent(new Event(api.OWNER_HUB_LOCATION_RESTORE));await t.settle();
 assert.equal(t.workspace().props.project.clientId,C);assert.match(t.h.window.location.search,new RegExp(C));assert.equal(t.calls.length,1);
});

test('newer authenticated live detail wins over a slow initial detail response during restoration',async()=>{
 let resolve;const gate=new Promise(r=>resolve=r);const t=setup({href:`/taylor/client-hub?client=${C}&commission=${Q}&tab=chat`,detail:()=>gate});await t.settle();
 t.live.at(-1).onData({client:client(C),projects:[project(),project(Q)],email:''});t.render();resolve({client:client(C),projects:[project()],email:''});await t.settle();
 assert.equal(t.workspace().props.project.projectId,Q);assert.equal(t.workspace().props.navigation.tab,'chat');assert.match(t.h.window.location.search,new RegExp(Q));
});
