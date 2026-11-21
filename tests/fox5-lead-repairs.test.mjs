import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const fixtures = new Set();
afterEach(() => { for (const h of fixtures) h.unmount(); fixtures.clear(); });
const make = () => { const h = harness(); fixtures.add(h); return h; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const client = {clientId:'TMC-0123456789ABCDEF',displayName:'Test Client',nickname:'',status:'active',authVersion:1,createdAt:'2026-10-27T20:00:00.000Z',updatedAt:'2026-10-27T20:00:00.000Z'};
function profile(options={}) {
 const h=make(), calls=[];
 h.overrides['./client']={...h.overrides['./client'],clientHubErrorMessage:e=>e.message,updateHubNickname:async(c,n)=>({client:{...c,nickname:n,updatedAt:'2026-10-27T21:00:00.000Z'}}),saveHubAvatar:async(...args)=>{calls.push(args);return options.save ? options.save(...args):{client:{...args[0],avatarVersion:1,updatedAt:'2026-10-27T22:00:00.000Z'}};}};
 const C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard, props={client,projects:[],onRefresh(){},onSignOut(){}};
 const render=()=>h.render(C,props), button=name=>h.find(n=>n.type==='button'&&(content(n)===name||n.props['aria-label']===name));
 render();button('Edit Profile').props.onClick();render();
 const select=file=>{h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});render();const crop=h.find(n=>n.type?.name==='AvatarCrop');if(crop){void crop.props.onApply(file).catch(()=>{});render();}};
 const submit=index=>{h.all(n=>n.type==='form')[index].props.onSubmit({preventDefault(){}});render();};
 return {h,render,button,select,submit,calls};
}
test('avatar validation replaces previous success and closing clears local feedback instead of leaking it to dashboard',async()=>{
 const t=profile();t.submit(0);await tick();t.render();assert.match(content(t.h.tree),/Saved Successfully/);
 t.select({type:'image/jpeg',size:2*1024*1024+1});assert.doesNotMatch(content(t.h.tree),/Saved Successfully/);t.submit(1);
 assert.match(content(t.h.tree),/up to 2 MiB/);assert.doesNotMatch(content(t.h.tree),/Saved Successfully/);assert.equal(t.calls.length,0);
 t.button('Close display settings').props.onClick();t.render();assert.equal(t.h.all(n=>n.props.role==='alert').length,0);
 t.button('Edit Profile').props.onClick();t.render();assert.equal(t.h.all(n=>n.props.role==='alert').length,0);
});
test('2 MiB avatar shows button pending state without duplicate banner and serializes repeated saves; late acknowledgement stays inside closed settings',async()=>{
 const pending=deferred(),t=profile({save:()=>pending.promise});t.select({type:'image/png',size:2*1024*1024});t.submit(1);t.submit(1);
 assert.equal(t.calls.length,1);assert.ok(t.h.find(n=>n.type==='button'&&content(n)==='Saving…'));assert.doesNotMatch(content(t.h.tree),/Saving profile picture…/);assert.equal(t.h.all(n=>n.type==='form')[1].props['aria-busy'],true);
 t.button('Close settings').props.onClick();t.render();pending.resolve({client:{...client,avatarVersion:1,updatedAt:'2026-10-27T22:00:00.000Z'}});await tick();t.render();
 assert.doesNotMatch(content(t.h.tree),/Saved Successfully|Saving profile picture/);assert.equal(t.h.all(n=>n.props.role==='alert').length,0);
});
test('definitively invalid avatar can be replaced, uncertain upload retains same operation identity',async()=>{
 let mode='invalid';const t=profile({save:async()=>{throw Object.assign(Error(mode==='invalid'?'Resize to at most 2048 pixels.':'Network response lost'),{code:mode==='invalid'?'functions/invalid-argument':'functions/unavailable'});}});
 t.select({type:'image/png',size:800000});t.submit(1);await tick();t.render();assert.equal(t.h.find(n=>n.type==='input'&&n.props.type==='file').props.disabled,false);
 mode='uncertain';t.select({type:'image/png',size:400000});t.submit(1);await tick();t.render();assert.ok(t.button('Retry profile picture'));assert.equal(t.h.find(n=>n.type==='input'&&n.props.type==='file').props.disabled,true);
 const op=t.calls.at(-1)[2];t.submit(1);await tick();t.render();assert.equal(t.calls.at(-1)[2],op);
});
test('inventory modal explicitly focuses scanner input after showModal, not the first Close button',()=>{
 const h=make(),C=h.load('src/owner/OwnerDialog.tsx').Dialog,order=[];
 const target={current:{focus(){const modal=h.find(n=>n.type==='dialog').props.ref.current;assert.equal(modal.open,true);order.push('scanner');}}};
 h.render(C,{title:'Add Inventory',children:'Scanner field',actions:'Close',onClose(){},initialFocusRef:target});assert.deepEqual(order,['scanner']);
 h.render(C,{title:'Add Inventory',children:'Scanner field',actions:'Close',onClose(){},initialFocusRef:target});assert.deepEqual(order,['scanner'],'normal rerenders must not steal user focus');
});
test('both Find Barcode and Add Inventory wire the input ref to post-modal focus',async()=>{
 const h=make();h.overrides['./inventory-client']={readInventory:async()=>({items:[],categories:{schemaVersion:1,revision:0,categories:[]}})};
 const C=h.load('src/owner/OwnerInventory.tsx').OwnerInventory,render=()=>h.render(C,{});render();await tick();render();
 for(const label of ['Add Inventory','Find Barcode']){
  const trigger=h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label));assert.ok(trigger,label);trigger.props.onClick();render();
  const dialog=h.find(n=>n.type?.name==='Dialog'&&n.props.title===label),input=h.find(n=>n.type==='input'&&n.props.autoComplete==='off');assert.ok(dialog);assert.equal(dialog.props.initialFocusRef,input.props.ref);dialog.props.onClose();render();
 }
});
