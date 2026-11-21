import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const doc=(id,value)=>({id,data:()=>({...value})});
const deleted={name:'Fox',status:'approved',version:2,trashedAt:'2026-10-29T00:00:00Z'};
function inbox(t){
 const h=harness(),calls=[],timers=[];let reads=0,read=async()=>[doc('fox',deleted)],write=async(req,trashed)=>({version:req.version+1,trashedAt:trashed?'2026-10-29T22:00:00Z':null});
 h.window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};h.window.clearTimeout=()=>{};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={collection:()=>({}),query:()=>({}),limit:()=>({}),orderBy:()=>({}),documentId:()=>'',startAfter:()=>({}),getDocs:async()=>({docs:await read(++reads)})};
 h.overrides['./commission-requests-client']={setCommissionRequestTrashed:async(...args)=>{calls.push(args);return write(...args);},readCommissionHistory:async()=>[]};
 const C=h.load('src/owner/CommissionRequests.tsx').CommissionRequests,render=()=>h.render(C),button=label=>h.find(n=>n.type==='button'&&(n.props['aria-label']===label||content(n)===label)),dialog=()=>h.find(n=>n.type?.name==='Dialog'),action=label=>nodes(dialog().props.actions).find(n=>n.type==='button'&&content(n)===label);
 t.after(()=>h.unmount());return{h,render,button,dialog,action,calls,timers,get reads(){return reads},set read(fn){read=fn},set write(fn){write=fn},async ready(){render();await tick();render();}};
}
test('page2 restore merges confirmed receipt immediately, preserves loaded pages, and stale first-page read cannot hide it',async t=>{
 const f=inbox(t);f.read=async n=>n===2?[doc('later', {...deleted,name:'Later'}),doc('active',{...deleted,name:'Active',trashedAt:null})]:Array.from({length:50},(_,i)=>doc('old'+i,{...deleted,name:'Old'+i}));
 await f.ready();f.button('Load more requests').props.onClick();await tick();f.render();f.button('Deleted commission requests (51)').props.onClick();f.render();
 f.button('Restore: Later').props.onClick();f.render();f.action('Restore request').props.onClick();await tick();f.render();
 assert.equal(f.reads,2,'no fallible refresh needed after valid receipt');assert.equal(f.calls.length,1);
 const cards=f.h.all(n=>n.type?.name==='IntakeHubAction');assert.deepEqual(cards.map(n=>n.props.request.name).sort(),['Active','Later']);assert.match(content(f.h.tree),/52 requests loaded/);
 const refresh=f.h.find(n=>n.props.label==='Refresh inbox');refresh.props.onClick();await tick();f.render();
 const restored=f.h.all(n=>n.type?.name==='IntakeHubAction').find(n=>n.props.request.name==='Later');assert.ok(restored);assert.equal(restored.props.request.version,3);assert.equal(restored.props.request.trashedAt,null);
});
test('restore duplicate click, cancel, pending feedback and denial retain exact recoverable action',async t=>{
 const f=inbox(t);await f.ready();f.button('Deleted commission requests (1)').props.onClick();f.render();f.button('Restore: Fox').props.onClick();f.render();f.dialog().props.onClose();f.render();assert.equal(f.calls.length,0);
 f.button('Restore: Fox').props.onClick();f.render();let reject;f.write=()=>new Promise((_,no)=>reject=no);const save=f.action('Restore request').props.onClick;save();save();f.render();assert.equal(f.calls.length,1);assert.equal(f.action('Saving…').props.disabled,true);
 reject(Error('owner session changed'));await tick();f.render();assert.ok(f.dialog());assert.equal(f.button('Back to commission requests (1)').props['aria-pressed'],true);assert.match(content(f.dialog()),/owner session changed/);
 const timer=f.timers.findLast(x=>x.ms===6000);timer.fn();f.render();assert.doesNotMatch(content(f.dialog()),/owner session changed/);assert.match(content(f.dialog()),/not confirmed/);assert.ok(f.action('Restore request'));
});
test('commission card has no per-card trash icon and Delete shortcut stages only the guarded confirmation',async t=>{
 const f=inbox(t);f.read=async()=>[doc('fox',{...deleted,trashedAt:null})];await f.ready();assert.equal(f.button('Move to Deleted: Fox'),undefined);
 const card=f.h.find(n=>n.type==='article');assert.equal(card.props.tabIndex,0);assert.equal(card.props['aria-keyshortcuts'],'Delete');
 const target={};card.props.onKeyDown({key:'Delete',target,currentTarget:target,preventDefault(){}});f.render();assert.ok(f.dialog());assert.equal(f.calls.length,0);
 f.dialog().props.onClose();f.render();assert.equal(f.dialog(),undefined);assert.equal(f.calls.length,0);
});
test('six second banner expiry preserves outcome state and newer messages survive an older timer',()=>{
 const h=harness(),timers=[];h.window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};h.window.clearTimeout=()=>{};
 const hook=h.load('src/owner/use-request-banner.ts').useRequestBanner;let state;const Probe=()=>{state=hook();return null;};const render=()=>h.render(Probe);
 render();state[1]('Uncertain');render();state[1]('New warning');render();timers[0].fn();render();assert.equal(state[2],'New warning');timers[1].fn();render();assert.equal(state[0],'New warning');assert.equal(state[2],null);assert.ok(timers.every(t=>t.ms===6000));h.unmount();
});
test('code-request drag and Delete shortcut only stage confirmation; restore returns active view and stale reads preserve acknowledgement',async t=>{
 const h=harness();delete h.overrides['./IntakeInbox'];const calls=[];let resets=0;
 const item={requestId:'00000000-0000-4000-8000-000000000001',name:'Fox',email:'test@example.test',message:'Help',status:'closed',resolution:'handled',version:2,createdAt:'2026-10-28T01:00:00Z',trashedAt:null};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={collection:()=>({}),limit:()=>({}),query:()=>({}),getDocs:async()=>({docs:[doc(item.requestId,item)]})};
 h.overrides['./client-hub-client']={listClients:async()=>[],resetClientLoginCode:async()=>{resets++;throw Error('No resets authorized');}};
 h.overrides['./intake-client']={callOwnerIntake:async(name,input)=>{calls.push(input);return{status:'closed',resolution:'handled',version:input.expectedVersion+1,trashedAt:input.action==='trash'?'2026-10-29T00:00:00Z':null};}};
 const C=h.load('src/owner/IntakeInbox.tsx').CodeRecoveryInbox,render=()=>h.render(C),button=label=>h.find(n=>n.type==='button'&&(n.props['aria-label']===label||content(n)===label))||nodes(h.find(n=>n.type?.name==='Dialog')?.props.actions).find(n=>n.type==='button'&&content(n)===label),card=()=>h.find(n=>n.props.className==='recoveryCard');
 t.after(()=>h.unmount());render();await tick();render();assert.equal(card().props.draggable,true);
 const dataTransfer={setData(){}};card().props.onDragStart({dataTransfer,preventDefault(){}});render();card().props.onDragEnd();render();assert.equal(calls.length,0);
 card().props.onKeyDown({key:'Delete',preventDefault(){}});render();assert.equal(h.find(n=>n.type?.name==='Dialog').props.title,'Move this request to Deleted?');button('Cancel').props.onClick();render();assert.equal(calls.length,0);if(h.find(n=>n.type?.name==='Dialog'))h.find(n=>n.type?.name==='Dialog').props.actions.props.onClick();render();
 card().props.onDragStart({dataTransfer,preventDefault(){}});render();button('Deleted code requests (0)').props.onDrop({preventDefault(){}});render();const confirm=button('Move to Deleted').props.onClick;confirm();confirm();await tick();render();assert.equal(calls.length,1);assert.equal(resets,0);assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined);button('Deleted code requests (1)').props.onClick();render();card().props.onClick();await tick();render();assert.ok(button('Restore request'));
 button('Restore request').props.onClick();await tick();render();assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined);assert.ok(card());assert.equal(calls[1].expectedVersion,3);
 h.find(n=>n.props.label==='Refresh client code requests').props.onClick();await tick();render();card().props.onKeyDown({key:'Delete',preventDefault(){}});render();button('Move to Deleted').props.onClick();await tick();render();assert.equal(calls[2].expectedVersion,4,'stale read cannot roll back restored version');assert.equal(resets,0);
});
test('older retry receipt cannot overwrite a newer saved restore read after uncertain first outcome',async t=>{
 const f=inbox(t);f.read=async n=>[doc('fox',{...deleted,version:n===1?1:3,trashedAt:null})];let attempts=0;
 f.write=async()=>{if(++attempts===1)throw Error('Response uncertain');return{version:2,trashedAt:'2026-10-29T22:00:00Z'};};
 await f.ready();const target={},card=f.h.find(n=>n.type==='article');card.props.onKeyDown({key:'Delete',target,currentTarget:target,preventDefault(){}});f.render();
 f.action('Move to Deleted').props.onClick();await tick();f.render();assert.ok(f.dialog());
 f.h.find(n=>n.props.label==='Refresh inbox').props.onClick();await tick();f.render();assert.equal(f.h.find(n=>n.type?.name==='IntakeHubAction').props.request.version,3);
 f.action('Move to Deleted').props.onClick();await tick();f.render();const current=f.h.find(n=>n.type?.name==='IntakeHubAction').props.request;
 assert.equal(current.version,3);assert.equal(current.trashedAt,null);assert.equal(f.dialog(),undefined);assert.match(content(f.h.tree),/newer saved update/);assert.equal(f.calls[0][2],f.calls[1][2]);
});
test('appended duplicate with a newer version replaces the loaded row, never the reverse',async t=>{
 const f=inbox(t);f.read=async n=>n===1?Array.from({length:50},(_,i)=>doc('r'+i,{...deleted,name:'Row'+i,version:1,trashedAt:null})):[doc('r0',{...deleted,name:'Newer row',version:5,trashedAt:null})];
 await f.ready();f.button('Load more requests').props.onClick();await tick();f.render();const row=f.h.all(n=>n.type?.name==='IntakeHubAction').find(n=>n.props.request.id==='r0');assert.equal(row.props.request.version,5);assert.equal(row.props.request.name,'Newer row');assert.equal(f.h.all(n=>n.type?.name==='IntakeHubAction').length,50);
});
test('code retry receipt is monotonic against a newer owner read and never resets access',async t=>{
 const h=harness();delete h.overrides['./IntakeInbox'];let reads=0,attempts=0;const calls=[];
 const item={requestId:'00000000-0000-4000-8000-000000000001',name:'Fox',email:'test@example.test',message:'Help',status:'closed',resolution:'handled',version:2,createdAt:'2026-10-28T01:00:00Z',trashedAt:null};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={collection:()=>({}),limit:()=>({}),query:()=>({}),getDocs:async()=>({docs:[doc(item.requestId,{...item,version:++reads===1?2:4})]})};
 h.overrides['./client-hub-client']={listClients:async()=>[],resetClientLoginCode:async()=>{throw Error('No reset allowed');}};
 h.overrides['./intake-client']={callOwnerIntake:async(name,input)=>{calls.push(input);if(++attempts===1)throw Error('Uncertain');return{status:'closed',resolution:'handled',version:input.expectedVersion+1,trashedAt:'2026-10-29T00:00:00Z'};}};
 const C=h.load('src/owner/IntakeInbox.tsx').CodeRecoveryInbox,render=()=>h.render(C),button=label=>h.find(n=>n.type==='button'&&(n.props['aria-label']===label||content(n)===label))||nodes(h.find(n=>n.type?.name==='Dialog')?.props.actions).find(n=>n.type==='button'&&content(n)===label);
 t.after(()=>h.unmount());render();await tick();render();h.find(n=>n.props.className==='recoveryCard').props.onKeyDown({key:'Delete',preventDefault(){}});render();button('Move to Deleted').props.onClick();await tick();render();
 h.find(n=>n.props.label==='Refresh client code requests').props.onClick();await tick();render();button('Move to Deleted').props.onClick();await tick();render();
 assert.match(content(h.tree),/newer saved update/);assert.ok(h.find(n=>n.props.className==='recoveryCard'));assert.equal(button('Restore request'),undefined);
 h.find(n=>n.props.className==='recoveryCard').props.onClick();await tick();render();button('Delete request').props.onClick();render();button('Move to Deleted').props.onClick();await tick();render();assert.equal(calls[2].expectedVersion,4);
});
