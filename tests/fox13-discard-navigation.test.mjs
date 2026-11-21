import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
async function fixture(){
 const h=harness();h.overrides["./HelpButton"]={HelpButton:()=>null};h.overrides["./TaylorServices"]={TaylorServices:()=>null};h.overrides["./CommissionRequests"]={CommissionRequests:()=>null};h.overrides['./OwnerClientHub']={OwnerClientHub:function OwnerClientHub(){return null;}};
 const saved=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();let writes=0;
 const store={load:async()=>structuredClone(saved),subscribe:()=>()=>{},readLiveShopVisibility:async()=>false,saveDraft:async()=>{writes++;return saved;}};
 const C=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(C,{store,mode:'cloud',initialSection:'clients',userEmail:'owner@test.invalid',onSignOut:async()=>{}});
 render();await flush();render();return {h,render,get writes(){return writes;},hub:()=>h.find(n=>n.type?.name==='OwnerClientHub'),dialog:()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Stay here for a moment'),nav:()=>h.find(n=>n.type==='a'&&content(n)==='Inventory')};
}
test('TH9 offers local Discard before Back and invokes only the registered safe local callback',async()=>{
 const t=await fixture();try {let discards=0;t.hub().props.onDirtyChange(true);t.hub().props.onDiscardReady(()=>discards++);t.render();t.nav().props.onClick();t.render();
 const actions=nodes(t.dialog().props.actions).filter(n=>n.type==='button');assert.deepEqual(actions.map(content),['Discard unsaved work','Back to my work']);assert.equal(actions[0].props.disabled,false);actions[0].props.onClick();t.render();assert.equal(discards,1);assert.equal(t.writes,0);assert.equal(t.dialog(),undefined);
 }finally{t.h.unmount();}
});
test('TH9 cannot discard unsupported or currently pending work',async()=>{
 const t=await fixture();try{t.hub().props.onDirtyChange(true);t.nav().props.onClick();t.render();let action=nodes(t.dialog().props.actions).find(n=>content(n)==='Discard unsaved work');assert.equal(action.props.disabled,true);assert.match(content(t.dialog()),/Pending or unconfirmed/);
 let discards=0;t.hub().props.onDiscardReady(()=>discards++);t.hub().props.onBusyChange(true);t.render();action=nodes(t.dialog().props.actions).find(n=>content(n)==='Discard unsaved work');action.props.onClick();assert.equal(discards,0);assert.equal(t.writes,0);
 }finally{t.h.unmount();}
});
