import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';

// Real OwnerPortal + recovery/navigation/preview hook source, synthetic React
// hooks and browser events, mock cloud store only. Not browser or pixel QA.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity={projectId:'taylor-made-creations',ownerUid:'a4ARjp0z8ZOByKlC2AfGzmMRj843'};
function memoryStorage(){
 const values=new Map();return {values,failWrites:false,get length(){return values.size;},key(index){return [...values.keys()][index]??null;},getItem(key){return values.get(key)??null;},setItem(key,value){if(this.failWrites)throw Error('Browser quota exceeded');values.set(key,String(value));},removeItem(key){values.delete(key);}};
}
async function fixture(t,options={}){
 const h=harness(),storage=options.storage??memoryStorage(),timers=new Map(),intervals=new Map();let timerId=0,current=options.current!==false,authChecks=0;
 const schedule=(fn,ms=0)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},cancel=id=>timers.delete(id);
 h.globals.setTimeout=schedule;h.globals.clearTimeout=cancel;h.window.setTimeout=schedule;h.window.clearTimeout=cancel;
 h.window.setInterval=(fn,ms)=>{const id=++timerId;intervals.set(id,{fn,ms});return id;};h.window.clearInterval=id=>intervals.delete(id);
 h.window.localStorage=storage;h.window.location.href=`/taylor/${options.section??'settings'}`;h.window.location.origin='https://tmc.test';
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 let saved=options.saved?structuredClone(options.saved):h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();saved.revision=options.revision??saved.revision;
 const saves=[],publications=[];let loads=0,signouts=0,saveGate=null;
 const store={async load(){loads++;return structuredClone(saved);},subscribe:()=>()=>{},async saveDraft(draft,revision){saves.push({draft:structuredClone(draft),revision});if(saveGate)await saveGate;saved={...saved,draft:structuredClone(draft),revision:saved.revision+1,updatedAt:new Date().toISOString()};return structuredClone(saved);},async publishLive(draft,revision){publications.push({draft,revision});throw Error('No live publication is authorized in this fixture.');}};
 const recoveryIdentity={...identity,assertCurrent(){authChecks++;if(!current)throw Error('Owner identity changed');}};
 const props={store,recoveryIdentity,mode:'cloud',userEmail:'owner@example.test',initialSection:options.section??'settings',async onSignOut(){signouts++;current=false;}};
 const Portal=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(Portal,props);
 const manager=()=>h.find(n=>n.type?.name==='ContactSettingsManager'),builder=()=>h.find(n=>n.type?.name==='OwnerVisualBuilder');
 const dialog=title=>h.find(n=>n.type?.name==='Dialog'&&n.props.title===title);
 const button=label=>h.find(n=>n.type==='button'&&(label.startsWith('Recovery')?n.props['aria-label']===`Workspace help and draft recovery${label.match(/\((\d+)\)/)?`, ${label.match(/\((\d+)\)/)[1]} recovery copies`:''}`:content(n).trim()===label));
 const action=(title,label)=>nodes(dialog(title)?.props.actions).find(n=>n.type==='button'&&content(n).trim()===label);
 const click=slug=>{const link=h.find(n=>n.type==='a'&&n.props.href===`/taylor/${slug}`&&n.props.onClick);assert.ok(link,slug);link.props.onClick({button:0,preventDefault(){}});render();};
 const edit=value=>{(manager()??builder()).props.onEdit(draft=>{draft.site.name=value;});render();};
 const runTimers=ms=>{for(const [id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}render();};
 const settle=async()=>{await tick();render();await tick();render();};
 const travel=async delta=>{h.window.history.go(delta);await settle();};
 const core=h.load('src/owner/draft-recovery.ts'),records=()=>core.listRecovery(storage,identity);
 t.after(()=>h.unmount());render();await settle();
 return {h,storage,timers,intervals,render,settle,manager,builder,dialog,button,action,click,edit,runTimers,travel,props,core,records,saves,publications,get saved(){return saved;},get loads(){return loads;},get signouts(){return signouts;},get authChecks(){return authChecks;},revoke(){current=false;},setSaveGate(value){saveGate=value;}};
}

test('valid browser checkpoint permits internal navigation and Back/Forward without cloud save or publish',async t=>{
 const f=await fixture(t,{revision:3});f.edit('LOCAL CHECKPOINT');await f.settle();assert.equal(f.records().length,0);assert.ok([...f.timers.values()].some(timer=>timer.ms===650));
 f.click('photos');assert.equal(f.h.window.location.href,'/taylor/photos');assert.equal(f.dialog('Save before moving on?'),undefined);assert.equal(f.records().length,1);assert.equal(f.records()[0].record.content.site.name,'LOCAL CHECKPOINT');assert.equal(f.records()[0].record.cloudRevision,3);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
 for(let i=0;i<3;i++){await f.travel(-1);assert.equal(f.h.window.location.href,'/taylor/settings');assert.equal(f.manager().props.content.site.name,'LOCAL CHECKPOINT');await f.travel(1);assert.equal(f.h.window.location.href,'/taylor/photos');}
 assert.equal(f.loads,1);assert.equal(f.h.window.history.length,2);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('reload shows recovery choice without auto-restoring; old revision restore requires explicit confirmation and no writes',async t=>{
 const first=await fixture(t,{revision:2});const cloud=structuredClone(first.saved);first.edit('RECOVER ME');await first.settle();first.runTimers(650);const retained=first.records()[0];assert.ok(retained);first.h.unmount();
 const f=await fixture(t,{storage:first.storage,saved:cloud,revision:7});assert.equal(f.manager().props.content.site.name,cloud.draft.site.name);assert.equal(f.dialog('Workspace help & draft recovery'),undefined);assert.ok(f.button('Recovery (1)'));assert.equal(f.saves.length,0);
 f.button('Recovery (1)').props.onClick();f.render();assert.match(content(f.dialog('Workspace help & draft recovery')),/differs from the currently open cloud draft/);f.button('Restore').props.onClick();f.render();const review=f.dialog('Restore this local recovery?');assert.match(content(review),/different cloud revision/);assert.match(content(review),/current cloud revision remains the optimistic save basis/);assert.equal(f.manager().props.content.site.name,cloud.draft.site.name);
 f.action('Restore this local recovery?','Restore locally').props.onClick();f.render();assert.equal(f.manager().props.content.site.name,'RECOVER ME');assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);assert.equal(f.storage.getItem(retained.key),retained.raw);
 f.button('Save').props.onClick();f.render();f.action('Save your changes','Save draft').props.onClick();await f.settle();assert.equal(f.saves.length,1);assert.equal(f.saves[0].revision,7,'restoring must not rewind the cloud write basis');assert.equal(f.publications.length,0);
});

test('quota failure keeps latest edits and the navigation guard; cancel/X/Back do not duplicate history',async t=>{
 const f=await fixture(t);f.click('photos');f.click('settings');f.edit('QUOTA UNSAVED');await f.settle();f.storage.failWrites=true;f.click('photos');
 assert.ok(f.dialog('Save before moving on?'));assert.equal(f.h.window.location.href,'/taylor/settings');assert.match(content(f.h.tree),/Browser quota exceeded/);const historyLength=f.h.window.history.length;
 for(let i=0;i<3;i++){f.dialog('Save before moving on?').props.onClose();f.render();await f.travel(-1);assert.ok(f.dialog('Save before moving on?'));assert.equal(f.h.window.location.href,'/taylor/settings');f.action('Save before moving on?','Keep editing').props.onClick();f.render();assert.equal(f.manager().props.content.site.name,'QUOTA UNSAVED');assert.equal(f.h.window.history.length,historyLength);f.click('photos');}
 assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);assert.equal(f.records().length,0);
});

test('invalid partial fields retain navigation/beforeunload guards without replacing earlier valid checkpoint',async t=>{
 const f=await fixture(t);f.edit('LAST VALID');await f.settle();f.runTimers(650);const prior=f.records()[0];f.edit('');await f.settle();f.click('photos');assert.ok(f.dialog('Save before moving on?'));assert.equal(f.h.window.location.href,'/taylor/settings');assert.match(content(f.h.tree),/unfinished fields cannot be recovered/);assert.equal(f.storage.getItem(prior.key),prior.raw);assert.equal(f.manager().props.content.site.name,'');
 const event=new Event('beforeunload',{cancelable:true});f.h.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('sign-out cancels pending recovery and clears only this tab branch, not sibling or other identity bytes',async t=>{
 const f=await fixture(t);const sibling=new f.core.DraftRecoveryBranch(f.storage,identity,'sibling-branch-1234567890').checkpoint(f.saved.draft,0),otherKey=f.core.recoveryPrefix({...identity,ownerUid:'different-owner'})+'other-branch-1234567890';f.storage.setItem(otherKey,'OTHER OWNER BYTES');
 f.edit('FIRST OWN CHECKPOINT');await f.settle();f.runTimers(650);const own=f.records().find(record=>record.key!==sibling.key);assert.ok(own);f.edit('PENDING NEW EDIT');await f.settle();assert.ok([...f.timers.values()].some(timer=>timer.ms===650));
 f.button('Sign out').props.onClick();f.render();const signout=f.action('Save before signing out?','Sign out without saving').props.onClick;signout();signout();await f.settle();assert.equal(f.signouts,1);assert.equal(f.storage.getItem(own.key),null);assert.equal(f.storage.getItem(sibling.key),sibling.raw);assert.equal(f.storage.getItem(otherKey),'OTHER OWNER BYTES');assert.equal([...f.timers.values()].some(timer=>timer.ms===650),false);
 f.runTimers(650);assert.equal(f.storage.getItem(own.key),null);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('revoked current recovery identity blocks debounce and navigation without touching prior scoped records',async t=>{
 const f=await fixture(t);f.edit('VERIFIED CHECKPOINT');await f.settle();f.runTimers(650);const prior=f.records()[0];f.edit('DO NOT CHECKPOINT');await f.settle();f.revoke();f.runTimers(650);assert.equal(f.storage.getItem(prior.key),prior.raw);assert.match(content(f.h.tree),/Owner identity changed/);f.click('photos');assert.ok(f.dialog('Save before moving on?'));assert.equal(f.manager().props.content.site.name,'DO NOT CHECKPOINT');assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);assert.ok(f.authChecks>0);
});

test('initial failed recovery identity never creates a branch and cannot waive the unsaved guard',async t=>{
 const f=await fixture(t,{current:false});f.edit('LOCKED RECOVERY');await f.settle();f.click('photos');assert.ok(f.dialog('Save before moving on?'));assert.equal(f.records().length,0);assert.match(content(f.h.tree),/Browser recovery is unavailable/);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('builder Save delegates to chooser, Save as Draft delegates to store and duplicate clicks stay locked',async t=>{
 const f=await fixture(t,{section:'pages',revision:4});f.edit('BUILDER UNSAVED');await f.settle();f.builder().props.onSave();f.builder().props.onSave();f.render();assert.equal(f.h.all(n=>n.type?.name==='Dialog'&&n.props.title==='Save your changes').length,1);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
 f.dialog('Save your changes').props.onClose();f.render();assert.equal(f.builder().props.content.site.name,'BUILDER UNSAVED');f.button('Save').props.onClick();f.render();assert.ok(f.action('Save your changes','Save draft'));assert.ok(f.action('Save your changes','Publish live'));f.action('Save your changes','Keep editing').props.onClick();f.render();
 let finish;f.setSaveGate(new Promise(resolve=>finish=resolve));const save=f.builder().props.onSaveDraft;save();save();f.render();assert.equal(f.saves.length,1);assert.equal(f.saves[0].revision,4);assert.equal(f.saves[0].draft.site.name,'BUILDER UNSAVED');assert.equal(f.builder().props.saveBusy,true);assert.equal(f.publications.length,0);finish();await f.settle();assert.equal(f.builder().props.saveBusy,false);assert.equal(f.publications.length,0);
});

test('preview X and Back-to-workspace repeat without losing current draft or writing cloud state',async t=>{
 const f=await fixture(t,{section:'pages'});f.edit('PREVIEW UNSAVED');await f.settle();const history=f.h.window.history.length;
 for(let i=0;i<3;i++){f.button('Preview').props.onClick();f.render();let preview=f.dialog('Your draft preview');assert.ok(preview);preview.props.onClose();f.render();assert.equal(f.dialog('Your draft preview'),undefined);f.button('Preview').props.onClick();f.render();f.action('Your draft preview','Back to workspace').props.onClick();f.render();assert.equal(f.dialog('Your draft preview'),undefined);assert.equal(f.builder().props.content.site.name,'PREVIEW UNSAVED');}
 assert.equal(f.h.window.history.length,history);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('pop-out window X/reopen uses a fresh child, rejects the closed sender and retains parent edits',async t=>{
 const f=await fixture(t,{section:'pages'}),children=[];f.edit('POPOUT UNSAVED');await f.settle();f.h.window.open=()=>{const child={closed:false,messages:[],postMessage(message,origin){this.messages.push({message,origin});},close(){this.closed=true;}};children.push(child);return child;};
 const ready=child=>{const event=new Event('message');Object.assign(event,{source:child,origin:'https://tmc.test',data:{channel:'tmc-owner-live-preview-v1',kind:'ready'}});f.h.window.dispatchEvent(event);};
 f.builder().props.onPopOut();assert.equal(children.length,1);assert.equal(children[0].messages.length,0);ready(children[0]);assert.equal(children[0].messages[0].message.snapshot.content.site.name,'POPOUT UNSAVED');children[0].closed=true;f.builder().props.onPopOut();assert.equal(children.length,2);const oldCount=children[0].messages.length;ready(children[0]);assert.equal(children[0].messages.length,oldCount);assert.equal(children[1].messages.length,0);ready(children[1]);assert.equal(children[1].messages[0].message.kind,'snapshot');assert.notEqual(children[0].messages[0].message.nonce,children[1].messages[0].message.nonce);assert.equal(f.builder().props.content.site.name,'POPOUT UNSAVED');assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('restore confirmation rechecks current owner and never exposes another owner/project recovery',async t=>{
 const f=await fixture(t),draft=structuredClone(f.saved.draft);draft.site.name='REVIEWED PRIVATE COPY';
 const candidate=new f.core.DraftRecoveryBranch(f.storage,identity,'reviewed-branch-1234567890').checkpoint(draft,0);
 const unrelatedOwner={...identity,ownerUid:'unrelated-owner'},unrelatedProject={...identity,projectId:'unrelated-project'};
 const otherOwner=new f.core.DraftRecoveryBranch(f.storage,unrelatedOwner,'other-owner-branch-1234567890').checkpoint({...draft,site:{...draft.site,name:'OTHER OWNER SECRET'}},0);
 const otherProject=new f.core.DraftRecoveryBranch(f.storage,unrelatedProject,'other-project-branch-1234567890').checkpoint({...draft,site:{...draft.site,name:'OTHER PROJECT SECRET'}},0);
 f.button('Recovery').props.onClick();f.render();assert.equal(f.h.all(n=>n.type==='button'&&content(n)==='Restore').length,1);assert.doesNotMatch(content(f.h.tree),/OTHER OWNER SECRET|OTHER PROJECT SECRET/);
 f.button('Restore').props.onClick();f.render();assert.ok(f.dialog('Restore this local recovery?'));f.revoke();f.action('Restore this local recovery?','Restore locally').props.onClick();f.render();assert.equal(f.manager().props.content.site.name,f.saved.draft.site.name);assert.match(content(f.h.tree),/Owner identity changed/);
 assert.equal(f.storage.getItem(candidate.key),candidate.raw);assert.equal(f.storage.getItem(otherOwner.key),otherOwner.raw);assert.equal(f.storage.getItem(otherProject.key),otherProject.raw);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});
