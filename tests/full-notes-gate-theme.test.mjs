import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './owner-ui-harness.mjs';
test('Taylor login setup and error frames default dark without changing auth persistence',t=>{
 const h=harness();t.after(()=>h.unmount());const writes=[];
 h.window.localStorage={getItem:()=>null,setItem:(key,value)=>writes.push([key,value])};
 const {OwnerGateFrame}=h.load('src/owner/OwnerGateFrame.tsx');
 h.render(OwnerGateFrame,{children:'authentication UI'});
 assert.equal(h.tree.props['data-color-mode'],'dark');assert.equal(h.tree.props['data-owner-portal'],true);
 const toggle=h.find(n=>typeof n.type==='function'&&n.type.name==='ColorModeToggle');assert.equal(toggle.props.scope,'owner');assert.deepEqual(writes,[]);
});
test('Taylor login honors an explicit owner light choice independently of public mode',t=>{
 const h=harness();t.after(()=>h.unmount());h.window.localStorage={getItem:key=>key==='tmc-owner-color-mode'?'light':'dark'};
 const {OwnerGateFrame}=h.load('src/owner/OwnerGateFrame.tsx');h.render(OwnerGateFrame,{children:'authentication UI'});assert.equal(h.tree.props['data-color-mode'],'light');
});
