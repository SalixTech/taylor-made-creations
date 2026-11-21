import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),model=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts'),{draftFromPublication}=load('src/owner/discard-draft.ts');
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(t){
 const h=harness();h.window.location.href='/taylor/pages';h.window.location.origin='https://tmc.test';
 h.globals.setTimeout=h.window.setTimeout=()=>1;h.globals.clearTimeout=h.window.clearTimeout=()=>{};h.window.setInterval=()=>1;h.window.clearInterval=()=>{};
 const recovery={flush:()=>true,stop(){},cloud:{enabled:false,stop(){},checkpointSaved:async()=>{},acknowledgePublication(){}},candidates:[],unavailable:[]};h.overrides['./use-draft-recovery']={useDraftRecovery:()=>recovery};
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const saved=defaults.createInitialOwnerWorkspace();let authorized=true,reads=0,writes=0,read=async()=>model.createPublishedOwnerSnapshot({...saved.draft,site:{...saved.draft.site,name:'CURRENT PUBLIC'}},2);
 const props={mode:'cloud',userEmail:'owner@example.test',initialSection:'pages',recoveryIdentity:{projectId:'taylor-made-creations',ownerUid:'owner',assertCurrent(){if(!authorized)throw Error('Session revoked');}},onSignOut:async()=>{},store:{load:async()=>structuredClone(saved),subscribe:()=>()=>{},readPublication:async()=>{reads++;return read();},saveDraft:async()=>{writes++;throw Error('No implicit save');},publishLive:async()=>{writes++;throw Error('No publication');}}};
 const C=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(C,props),builder=()=>h.find(n=>n.type?.name==='OwnerVisualBuilder');
 const settle=async()=>{await tick();render();await tick();render();};render();await settle();t.after(()=>h.unmount());
 const edit=name=>{builder().props.onEdit(d=>{d.site.name=name;d.design={...d.design,mobileLayoutEnabled:true,mobileDesign:{}};});render();};
 const dialog=()=>h.find(n=>n.props?.title==='Discard website edits?');
 const open=()=>{builder().props.onRequestDiscard();render();};
 const choose=async label=>{const b=nodes(dialog().props.actions).find(n=>n.type==='button'&&content(n)===label);assert.ok(b);b.props.onClick();await settle();};
 return {h,saved,builder,render,settle,edit,open,dialog,choose,setRead:f=>{read=f;},revoke:()=>{authorized=false;},get reads(){return reads;},get writes(){return writes;}};
}
test('public reset expands strict public source and retains absent required builtins only as empty trash',()=>{
 const saved=defaults.createDefaultOwnerContent(),live=structuredClone(saved),removed=live.pages.find(p=>p.builtinKey==='gallery');removed.trashedAt='2026-10-01T00:00:00.000Z';
 const publication=model.createPublishedOwnerSnapshot(live,1),next=draftFromPublication(saved,publication,'2026-10-30T00:00:00.000Z');
 assert.equal(model.validateOwnerContent(next).valid,true);const hidden=next.pages.find(p=>p.builtinKey==='gallery');assert.ok(hidden.trashedAt);assert.equal(hidden.showInNav,false);assert.deepEqual(hidden.blocks,[]);assert.equal(model.createPublicContentSnapshot(next).pages.some(p=>p.builtinKey==='gallery'),false);
 assert.throws(()=>draftFromPublication(saved,{...publication,content:{...publication.content,unsafe:'bad'}}));
});
test('saved draft discard is local and one Undo restores exact unsaved mobile/private content',async t=>{
 const f=await fixture(t);f.edit('UNSAVED');const previous=structuredClone(f.builder().props.content);f.open();await f.choose('Discard to saved draft');assert.deepEqual(f.builder().props.content,f.saved.draft);assert.equal(f.writes,0);assert.equal(f.reads,0);assert.equal(f.builder().props.canUndo,true);f.builder().props.onUndo();f.render();assert.deepEqual(f.builder().props.content,previous);
});
test('published reset reads current source, stages locally and keeps one complete Undo snapshot',async t=>{
 const f=await fixture(t);f.edit('PRIVATE WORK');const previous=structuredClone(f.builder().props.content);f.open();await f.choose('Reset to published site');assert.equal(f.reads,1);assert.equal(f.builder().props.content.site.name,'CURRENT PUBLIC');assert.equal(f.writes,0);f.builder().props.onUndo();f.render();assert.deepEqual(f.builder().props.content,previous);
});
test('stale choice cannot discard a newer edit and upload blocks both entry and captured action',async t=>{
 const f=await fixture(t);f.edit('FIRST');f.open();f.edit('NEWER');await f.choose('Discard to saved draft');assert.equal(f.builder().props.content.site.name,'NEWER');assert.ok(f.dialog());
 const keep=nodes(f.dialog().props.actions).find(n=>content(n)==='Keep editing');keep.props.onClick();f.render();f.h.find(n=>n.type?.name==='OwnerUploadProvider').props.onBusyChange(true);f.open();assert.equal(f.dialog(),undefined);assert.equal(f.writes,0);
});
test('failed, absent or revoked published reads preserve edits and remain explicit errors',async t=>{
 for(const scenario of ['fail','absent','revoke']){
  const f=await fixture(t);f.edit('KEEP');f.setRead(async()=>{if(scenario==='fail')throw Error('Read failed');if(scenario==='revoke')f.revoke();return scenario==='absent'?null:model.createPublishedOwnerSnapshot(f.saved.draft,3);});f.open();await f.choose('Reset to published site');assert.equal(f.builder().props.content.site.name,'KEEP');assert.ok(f.dialog());assert.ok(nodes(f.dialog()).some(n=>n.props?.role==='alert'));assert.equal(f.writes,0);
 }
});
test('pending published read blocks edits and cannot install after unmount',async t=>{
 const f=await fixture(t);f.edit('KEEP');let finish;f.setRead(()=>new Promise(resolve=>{finish=resolve;}));f.open();const b=nodes(f.dialog().props.actions).find(n=>content(n)==='Reset to published site');b.props.onClick();f.render();f.edit('BLOCKED');assert.equal(f.builder().props.content.site.name,'KEEP');f.h.unmount();finish(model.createPublishedOwnerSnapshot(f.saved.draft,4));await tick();assert.equal(f.writes,0);
});
