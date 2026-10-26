import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('dedicated commission builder bookmarks and saves only form settings, retaining unrelated unsaved edits',async()=>{
 const h=harness();h.window.location.href='/taylor/commission-form';
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const {createInitialOwnerWorkspace}=h.load('src/owner/defaults.ts');let saved=createInitialOwnerWorkspace(),draftCalls=0,liveCalls=0,wholeSaves=0;
 const base=h.load('src/owner/storage.ts').createOwnerStore({read:async()=>structuredClone(saved),update:async fn=>{saved=fn(saved);return structuredClone(saved);}});
 const store={...base,saveDraft:async()=>{wholeSaves++;throw Error('Whole save not intended');},saveSettingsCard:async(...args)=>{draftCalls++;return base.saveSettingsCard(...args);},publishSettingsCardLive:async(...args)=>{liveCalls++;return base.saveSettingsCard(...args);},subscribe:()=>()=>{}};
 const Portal=h.load('src/owner/OwnerPortal.tsx').default;const props={store,mode:'cloud',userEmail:'owner@example.test',onSignOut:async()=>{}};
 const render=()=>h.render(Portal,props);const editor=()=>h.find(n=>n.type?.name==='CommissionFormEditor');render();await flush();render();assert.ok(editor());
 editor().props.onEdit(value=>{value.home.title='UNSAVED HOME';value.site.additionalPartsQuantities=true;});render();await editor().props.onSaveDraft();render();
 assert.equal(draftCalls,1);assert.equal(wholeSaves,0);assert.equal(saved.draft.site.additionalPartsQuantities,true);assert.notEqual(saved.draft.home.title,'UNSAVED HOME');assert.equal(editor().props.content.home.title,'UNSAVED HOME');
 editor().props.onEdit(value=>{value.site.additionalPartsQuantities=false;});render();await editor().props.onPublishLive();render();assert.equal(liveCalls,1);assert.equal(wholeSaves,0);assert.equal(saved.draft.site.additionalPartsQuantities,false);assert.equal(editor().props.content.home.title,'UNSAVED HOME');
 h.unmount();
});
