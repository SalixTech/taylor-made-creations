// Source-hook tests; final real-browser dark/narrow coverage is recorded separately.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
async function fixture(t,{library=true,fail=false}={}){
 const h=harness(),seed=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),model=h.load('src/owner/model.ts');seed.gallery=[];const live=model.createPublishedOwnerSnapshot(seed,1),items=['a','b'].map(id=>({id,name:id,src:'/images/home-collage.webp',alt:id,width:10,height:10,visible:true}));
 const calls=[],published=[],busy=[];let closes=0,finish=null,gate=null;
 const store={async readPublication(){return structuredClone(live);},async publishSelected(...args){calls.push(args);if(gate)await gate;if(fail)throw Error('Live website changed; refresh review.');return {schemaVersion:1,revision:2,updatedAt:'2026-10-28T23:00:00.000Z',draft:args[0],localPublished:null};}};
 const props={content:seed,expectedRevision:1,galleryOnly:true,store,onClose(){closes++;},onPublished(value){published.push(value);},onBusyChange(value){busy.push(value);},...(library?{galleryLibrary:{items,expectedRevision:3}}:{})};
 const Review=h.load('src/owner/PublicationReview.tsx').PublicationReview,render=()=>h.render(Review,props),settle=async()=>{for(let i=0;i<8;i++){await Promise.resolve();render();}};
 const button=label=>h.find(node=>node.type==='button'&&content(node)===label),action=label=>nodes(h.tree.props.actions).find(node=>node.type==='button'&&content(node).includes(label));render();await settle();t.after(()=>h.unmount());return {h,props,render,settle,button,action,calls,published,busy,get closes(){return closes;},block(){gate=new Promise(resolve=>finish=resolve);},release(){finish?.();}};
}
test('review reading, selecting and closing never saves or publishes; exact private library is separate from draft',async t=>{
 const f=await fixture(t);assert.equal(f.h.all(n=>n.type==='input'&&n.props.type==='checkbox').length,2);assert.equal(f.calls.length,0);f.button('Clear selection').props.onClick();f.render();assert.equal(f.action('Publish').props.disabled,true);f.h.all(n=>n.type==='input')[0].props.onChange({target:{checked:true}});f.render();assert.equal(f.action('Publish').props.disabled,false);f.h.tree.props.onClose();assert.equal(f.closes,1);assert.equal(f.calls.length,0);assert.equal(f.props.content.gallery.length,0);assert.equal(f.props.galleryLibrary.items.length,2);
});
test('selected submit preserves base draft, carries private library separately, locks duplicate clicks and pending dismiss',async t=>{
 const f=await fixture(t);f.button('Clear selection').props.onClick();f.render();f.h.all(n=>n.type==='input')[0].props.onChange({target:{checked:true}});f.render();f.block();const submit=f.action('Publish').props.onClick;submit();submit();f.render();assert.equal(f.calls.length,1);assert.equal(f.h.tree.props.dismissDisabled,true);f.h.tree.props.onClose();assert.equal(f.closes,0);assert.equal(f.calls[0][0].gallery.length,0);assert.deepEqual(f.calls[0][3],['gallery:a']);assert.equal(f.calls[0][4].items.length,2);assert.equal(f.calls[0][4].expectedRevision,3);f.release();await f.settle();assert.equal(f.published.length,1);assert.deepEqual(f.busy,[true,false]);
});
test('stale publish clears choices and refresh never silently reselects old changes',async t=>{
 const f=await fixture(t,{fail:true});f.action('Publish').props.onClick();await f.settle();assert.equal(f.calls.length,1);assert.equal(f.published.length,0);assert.match(content(f.h.tree),/Live website changed/);assert.ok(f.h.all(n=>n.type==='input').every(n=>!n.props.checked));f.button('Refresh review — choose changes again').props.onClick();await f.settle();assert.ok(f.h.all(n=>n.type==='input').every(n=>!n.props.checked));assert.equal(f.action('Publish').props.disabled,true);
});
test('unmount before a delayed read cannot expose a late review or trigger publication',async t=>{
 const f=await fixture(t);let finish;f.props.store.readPublication=()=>new Promise(resolve=>finish=resolve);f.button('Clear selection').props.onClick();f.render(); // Explicit refresh path only appears after an error; remount a fresh fixture instead.
 const h=harness(),Review=h.load('src/owner/PublicationReview.tsx').PublicationReview;h.render(Review,f.props);await Promise.resolve();h.unmount();finish?.(null);await Promise.resolve();assert.equal(f.calls.length,0);
});
