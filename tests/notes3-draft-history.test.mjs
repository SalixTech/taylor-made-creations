// Source-hook integration, no live cloud/browser. Undo must never be a publish.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const load=sourceLoader(),{OwnerDraftHistory,usesNativeUndo}=load('src/owner/draft-history.ts');
const seed=()=>load('src/owner/defaults.ts').createDefaultOwnerContent();
const changed=(value,name)=>{const next=structuredClone(value);next.site.name=name;return next;};
test('typing is one undo entry until pause, target change, or explicit boundary; native inputs own their keys',()=>{
 const history=new OwnerDraftHistory(),initial=seed(),field={},other={};history.reset(initial);
 for(let i=0;i<20;i++)history.record(changed(history.value,`Typing ${i}`),field,i*50);
 assert.deepEqual(history.depth,{undo:1,redo:0});assert.equal(history.undo().site.name,initial.site.name);assert.equal(history.redo().site.name,'Typing 19');
 history.record(changed(history.value,'Paused'),field,3000);history.record(changed(history.value,'Other'),other,3001);assert.deepEqual(history.depth,{undo:3,redo:0});history.endGroup();history.record(changed(history.value,'Separate'),other,3002);assert.equal(history.depth.undo,4);
 assert.equal(usesNativeUndo({closest:query=>query.includes('textarea')?{}:null}),true);assert.equal(usesNativeUndo({closest:()=>null}),false);
});
test('long continuous gestures coalesce; no-op/canceled edits do not record; branch clears redo; snapshots are isolated and bounded',()=>{
 const initial=seed(),h=new OwnerDraftHistory(3,3000000),gesture={};h.reset(initial);assert.equal(h.record(structuredClone(initial)),false);
 for(let i=0;i<15;i++)h.record(changed(h.value,`Drag ${i}`),gesture,i*3000,true);
 assert.equal(h.depth.undo,1);const undone=h.undo();assert.equal(undone.site.name,initial.site.name);undone.site.name='edited returned snapshot';assert.equal(h.redo().site.name,'Drag 14');
 for(let i=0;i<10;i++)h.record(changed(h.value,`Click ${i}`));assert.equal(h.depth.undo,3);h.undo();assert.ok(h.canRedo);h.record(changed(h.value,'new branch'));assert.equal(h.canRedo,false);h.reset(initial);assert.deepEqual(h.depth,{undo:0,redo:0});
 const tiny=new OwnerDraftHistory(60,1);tiny.reset(initial);tiny.record(changed(initial,'too large'));assert.equal(tiny.canUndo,false);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function portalFixture(t){
 const h=harness(),saves=[],publications=[],values=new Map(),timers=new Map();let tid=0;
 h.window.location.href='/taylor/pages';h.window.location.origin='https://tmc.test';
 const storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};h.window.localStorage=storage;
 const schedule=(fn,ms=0)=>{timers.set(++tid,{fn,ms});return tid;};h.globals.setTimeout=h.window.setTimeout=schedule;h.globals.clearTimeout=h.window.clearTimeout=id=>timers.delete(id);h.window.setInterval=()=>0;h.window.clearInterval=()=>{};
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 let saved=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
 const props={mode:'cloud',userEmail:'owner@example.test',initialSection:'pages',recoveryIdentity:{projectId:'taylor-made-creations',ownerUid:'a4ARjp0z8ZOByKlC2AfGzmMRj843',assertCurrent(){}},onSignOut:async()=>{},store:{load:async()=>structuredClone(saved),subscribe:()=>()=>{},async saveDraft(value,revision){saves.push({value:structuredClone(value),revision});saved={...saved,draft:structuredClone(value),revision:revision+1};return structuredClone(saved);},async publishLive(){publications.push(1);throw Error('Forbidden live action in history fixture');}}};
 const C=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(C,props),builder=()=>h.find(n=>n.type?.name==='OwnerVisualBuilder');
 const settle=async()=>{await tick();render();await tick();render();};render();await settle();t.after(()=>h.unmount());
 const edit=name=>{builder().props.onEdit(value=>{value.site.name=name;});render();};
 const key=(options={})=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'z',ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,isComposing:false,...Object.fromEntries(Object.entries(options).filter(([key])=>key!=='target'))});if(options.target)Object.defineProperty(event,'target',{value:options.target});h.window.dispatchEvent(event);render();return event;};
 const checkpoint=()=>{for(const[id,timer]of [...timers])if(timer.ms===650){timers.delete(id);timer.fn();}render();return [...values].filter(([k])=>k.includes('recovery')).map(([,v])=>{try{return JSON.parse(v)}catch{return null}}).filter(Boolean);};
 return{h,builder,render,settle,edit,key,checkpoint,saves,publications,get saved(){return saved;}};
}
test('real Portal local edits undo/redo with Ctrl/Cmd, update recovery/current preview, and never invoke cloud writes',async t=>{
 const f=await portalFixture(t),original=f.builder().props.content.site.name;
 f.edit('FIRST');f.edit('SECOND');assert.equal(f.builder().props.canUndo,true);assert.equal(f.key().defaultPrevented,true);assert.equal(f.builder().props.content.site.name,'FIRST');
 f.key({ctrlKey:false,metaKey:true,shiftKey:true});assert.equal(f.builder().props.content.site.name,'SECOND');
 f.builder().props.onUndo();f.render();await f.settle();const checkpoints=f.checkpoint();assert.ok(checkpoints.some(record=>record.content?.site.name==='FIRST'));
 f.builder().props.onUndo();f.render();assert.equal(f.builder().props.content.site.name,original);assert.equal(f.builder().props.canUndo,false);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});
test('native input/IME/Alt shortcuts are untouched; an acknowledged save is a boundary, not undoable external work',async t=>{
 const f=await portalFixture(t);f.edit('DRAFT');for(const options of [{target:{closest:()=>({})}},{isComposing:true},{altKey:true}]){const e=f.key(options);assert.equal(e.defaultPrevented,false);assert.equal(f.builder().props.content.site.name,'DRAFT');}
 f.builder().props.onSaveDraft();await f.settle();assert.equal(f.saves.length,1);assert.equal(f.builder().props.canUndo,false);f.key();assert.equal(f.builder().props.content.site.name,'DRAFT');f.edit('AFTER SAVE');f.key();assert.equal(f.builder().props.content.site.name,'DRAFT');assert.equal(f.saves.length,1);assert.equal(f.publications.length,0);
});
test('toolbar keeps requested Popout Preview / Save ordering without redundant Draft with separate accessible history controls',()=>{
 const h=harness(),C=h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder,value=seed();h.render(C,{content:value,page:value.pages[0],onEdit(){},onPageChange(){},onManagePages(){},onAddPage(){},onPrices(){},onRemove(){},liveShopVisibility:false,canUpdateLiveShop:false,onUpdateLiveShop(){},browsing:false,onBrowsingChange(){},onSaveDraft(){},onSave(){},onPopOut(){},onUndo(){},onRedo(){},canUndo:true,canRedo:false});
 const actions=h.find(n=>n.props.className==='builderSaveActions');assert.deepEqual(actions.props.children.filter(Boolean).map(content),['Popout Preview ↗','Save']);assert.equal(h.find(n=>n.type==='button'&&content(n)==='Undo').props['aria-keyshortcuts'],'Control+Z Meta+Z');assert.equal(h.find(n=>n.type==='button'&&content(n)==='Redo').props.disabled,true);h.unmount();
});

test('an open save/publish choice blocks global history until dismissed',async t=>{
 const f=await portalFixture(t);f.edit('KEEP REVIEWED DRAFT');f.builder().props.onSave();f.render();assert.equal(f.key().defaultPrevented,false);assert.equal(f.builder().props.content.site.name,'KEEP REVIEWED DRAFT');assert.equal(f.builder().props.canUndo,false);const dialog=f.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Save your changes');assert.ok(dialog);dialog.props.onClose();f.render();f.key();assert.equal(f.builder().props.content.site.name,f.saved.draft.site.name);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});

test('Portal groups repeated pointer edits, typing and box edits; reset/undo restore natural draft data',async t=>{
 const f=await portalFixture(t),initial=f.builder().props.content.site.name;
 const target=[...f.h.refs.values()][0];assert.ok(target);target.closest=()=>({});const down=new Event('pointerdown');Object.assign(down,{button:0});Object.defineProperty(down,'target',{value:target});f.h.window.dispatchEvent(down);
 for(let i=0;i<8;i++)f.edit(`Gesture ${i}`);f.h.window.dispatchEvent(new Event('pointerup'));f.key();assert.equal(f.builder().props.content.site.name,initial);f.key({shiftKey:true});assert.equal(f.builder().props.content.site.name,'Gesture 7');
 f.h.document.activeElement={closest:()=>({})};for(let i=0;i<8;i++)f.edit(`Typing ${i}`);f.h.document.activeElement=null;f.key();assert.equal(f.builder().props.content.site.name,'Gesture 7');
 const box={widthPercent:40,heightPx:100,xPercent:0,yPx:0,baseWidthPx:400,baseHeightPx:100,referenceParentPx:1000,aspectLocked:true,rotationDeg:7,flow:{xPercent:0,marginTopPx:0,marginRightPx:0,marginBottomPx:0,marginLeftPx:0}};
 f.builder().props.onEdit(value=>{value.contentOverrides={styles:{'home.stripTitle':{box}}};});f.render();f.key();assert.equal(f.builder().props.content.contentOverrides?.styles?.['home.stripTitle']?.box,undefined);f.key({shiftKey:true});assert.deepEqual(f.builder().props.content.contentOverrides.styles['home.stripTitle'].box,box);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);
});
test('Done/browse mode and reopening editor retain undo/redo until explicit save',async t=>{const f=await portalFixture(t),original=f.builder().props.content.site.name;f.builder().props.onBrowsingChange(false);f.render();f.edit('Before Done');f.builder().props.onBrowsingChange(true);f.render();{const d=f.h.find(n=>n.type?.name==='Dialog');assert.equal(d.props.title,'Leave edit mode?');nodes(d.props.actions).find(n=>n.type==='button'&&content(n)==='Exit edit mode').props.onClick();f.render();}assert.equal(f.builder().props.canUndo,true);f.key();assert.equal(f.builder().props.content.site.name,original);f.key({shiftKey:true});assert.equal(f.builder().props.content.site.name,'Before Done');f.builder().props.onBrowsingChange(false);f.render();assert.equal(f.builder().props.canUndo,true);assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);});
test('undo and redo feedback is compact status text, never a full-width success banner',async t=>{const f=await portalFixture(t);f.edit('Compact history');for(const redo of [false,true]){f.key({shiftKey:redo});const label=redo?'Redone':'Undone';const status=f.h.find(n=>n.props.role==='status'&&content(n)===label);assert.ok(status);assert.equal(status.type,'span');assert.equal(status.props.className,'historyFeedback');assert.equal(f.h.all(n=>n.props.className?.split(' ').includes('banner')&&content(n).includes(label)).length,0);}assert.equal(f.saves.length,0);assert.equal(f.publications.length,0);});
