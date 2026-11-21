import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,content} from './owner-ui-harness.mjs';
function fixture(t){
 const h=harness(),C=h.load('src/owner/OwnerTemplateManagers.tsx').PremadesManager;let draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),edits=0,saves=0,publishes=0,fail=false;
 const props={content:draft,creationBlocked:false,liveShopVisibility:false,liveShopKnown:true,canUpdateLiveShop:true,onRetryLiveShop(){},onUpdateLiveShop(){},onRemove(){},onEdit(fn){if(fail)throw Error('not ready');edits++;draft=structuredClone(draft);fn(draft);props.content=draft;},onSavePremadeDraft:async()=>{saves++;return true;},onPublishPremade(){publishes++;},canSavePremadeDraft:true,canPublishPremade:true};
 const render=()=>h.render(C,props),dialog=()=>h.find(n=>n.type?.name==='Dialog'),button=label=>[...nodes(h.tree),...nodes(dialog()?.props.actions)].find(n=>n.type==='button'&&content(n)===label),field=label=>h.find(n=>n.type?.name==='Field'&&n.props.label===label);
 t.after(()=>h.unmount());render();return{h,props,render,dialog,button,field,get draft(){return draft},get edits(){return edits},get saves(){return saves},get publishes(){return publishes},set fail(v){fail=v}};
}
test('Add Premade stages all fields; Cancel/X and late photo callbacks cannot insert or save a listing',t=>{
 const f=fixture(t),before=structuredClone(f.draft);f.button('Add Premade').props.onClick();f.render();assert.equal(f.dialog().props.title,'Add Premade');assert.deepEqual(f.draft,before);assert.equal(f.edits,0);
 f.field('Listing name').props.onChange('Staged fox');f.field('Price (USD)').props.onChange('12.50');f.render();const oldSave=f.button('Add private draft').props.onClick,oldPhoto=f.h.find(n=>n.type?.name==='PremadePhotoEditor').props.onChange;
 f.button('Cancel').props.onClick();f.render();oldSave();oldPhoto({image:'/images/heads.webp'});f.render();assert.deepEqual(f.draft,before);assert.equal(f.saves+f.publishes,0);
 f.button('Add Premade').props.onClick();f.render();assert.equal(f.field('Listing name').props.value,'');oldSave();f.render();assert.equal(f.edits,0);f.dialog().props.onClose();f.render();assert.deepEqual(f.draft,before);
});
test('explicit completion inserts once, stays private, and stale staged callbacks cannot modify the completed card',t=>{
 const f=fixture(t),before=structuredClone(f.draft);f.button('Add Premade').props.onClick();f.render();f.field('Listing name').props.onChange('  New Fox  ');f.field('Price (USD)').props.onChange('32.25');f.render();const photo=f.h.find(n=>n.type?.name==='PremadePhotoEditor').props.onChange;
 photo({image:'/images/heads.webp',alt:'Fox front'});f.render();const save=f.button('Add private draft').props.onClick;save();save();f.render();assert.equal(f.edits,1);assert.equal(f.draft.premades.length,before.premades.length+1);assert.equal(f.draft.premades[0].name,'New Fox');assert.equal(f.draft.premades[0].price,32.25);assert.equal(f.draft.premades[0].isDraft,true);assert.equal(f.draft.premades[0].visible,false);assert.equal(f.saves+f.publishes,0);
 photo({image:'/images/partials.webp'});f.render();assert.equal(f.draft.premades[0].image,'/images/heads.webp');assert.deepEqual(f.draft.premades.slice(1),before.premades);
});
test('validation, current upload lock and insertion error retain the staged item without writing',t=>{
 const f=fixture(t);f.button('Add Premade').props.onClick();f.render();assert.equal(f.button('Add private draft').props.disabled,true);f.field('Listing name').props.onChange('Fox');f.field('Price (USD)').props.onChange('-1');f.render();f.button('Add private draft').props.onClick();f.render();assert.equal(f.edits,0);assert.ok(f.h.find(n=>n.props.role==='alert'));
 f.field('Price (USD)').props.onChange('25');f.render();f.props.creationBlocked=true;f.render();f.button('Finish current upload or action…').props.onClick();assert.equal(f.edits,0);
 f.props.creationBlocked=false;f.fail=true;f.render();f.button('Add private draft').props.onClick();f.render();assert.ok(f.dialog());assert.equal(f.field('Listing name').props.value,'Fox');assert.match(content(f.h.tree),/not added/);f.fail=false;f.button('Add private draft').props.onClick();f.render();assert.equal(f.edits,1);
});

test('leaving the manager abandons an unaccepted premade and stale completion cannot write later',t=>{
 const f=fixture(t),before=structuredClone(f.draft);f.button('Add Premade').props.onClick();f.render();f.field('Listing name').props.onChange('Never inserted');f.render();const save=f.button('Add private draft').props.onClick,photo=f.h.find(n=>n.type?.name==='PremadePhotoEditor').props.onChange;f.h.unmount();photo({image:'/images/heads.webp'});save();assert.deepEqual(f.draft,before);assert.equal(f.edits+f.saves+f.publishes,0);
});
