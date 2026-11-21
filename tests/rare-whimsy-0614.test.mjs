import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './owner-ui-harness.mjs';
import {whimsyAccountFixture} from './whimsy-account-fixture.mjs';

test('rare owner identity is independently one in200 and existing setting still owns it',()=>{
 const f=whimsyAccountFixture();
 for(const [draw,rare] of [[0,true],[.004999,true],[.005,false],[.999,false],[NaN,false],[-1,false]]){
  const values=[.5,.5,draw];const result=f.api.chooseOwnerWhimsyIdentity(()=>values.shift());
  assert.equal(result.identity==="Salix's Friend",rare);assert.equal(result.space,'Spoodle’s Space');
 }
 assert.deepEqual(f.writes,[]);f.h.unmount();
});
test('Bubbles locks all close requests for3seconds after reveal, never autocloses or extends on replay',()=>{
 const h=harness();
 const oldNow=Date.now,oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 let now=1000,closed=0,reveal,scheduled;
 Date.now=()=>now;globalThis.setTimeout=(fn,ms)=>{assert.ok(ms>=0&&ms<=3000);scheduled=fn;return 1;};globalThis.clearTimeout=()=>{};
 try{
  const Fox=h.load('src/components/LightSideFox.tsx').LightSideFox;
  const props={opening:{id:'opening-1'},onClose:()=>closed++,renderGame:(_image,callback)=>{reveal=callback;return null;}};
  const render=()=>h.render(Fox,props),dialog=()=>h.find(n=>n.type?.name==='Dialog');
  render();assert.equal(dialog().props.dismissDisabled,false);
  reveal();render();assert.equal(dialog().props.dismissDisabled,true);dialog().props.onClose();assert.equal(closed,0);
  now=2000;const effectIndex=h.hooks.findIndex(value=>typeof value?.cleanup==='function');assert.ok(effectIndex>=0);h.hooks[effectIndex].cleanup();h.hooks[effectIndex]=undefined;scheduled=undefined;render();assert.equal(typeof scheduled,'function','effect reactivation rearms remaining hold');
  now=3999;reveal();dialog().props.onClose();assert.equal(closed,0);
  now=4000;scheduled();render();assert.equal(dialog().props.dismissDisabled,false);assert.equal(closed,0,'minimum stay is not auto-close');
  dialog().props.onClose();assert.equal(closed,1);
 }finally{h.unmount();Date.now=oldNow;globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
});
