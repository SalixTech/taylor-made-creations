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
test('Taylor login preserves legacy owner choice until an explicit shared preference is chosen',t=>{
 const h=harness();t.after(()=>h.unmount());
 const values=new Map([['tmc-owner-color-mode','light'],['tmc-public-color-mode','dark']]);
 h.window.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const {OwnerGateFrame}=h.load('src/owner/OwnerGateFrame.tsx');
 const theme=h.load('src/components/ColorMode.tsx');
 h.render(OwnerGateFrame,{children:'authentication UI'});assert.equal(h.tree.props['data-color-mode'],'light');
 assert.equal(theme.readColorMode('public'),'dark');
 theme.setColorMode('public','dark');
 h.render(OwnerGateFrame,{children:'authentication UI'});assert.equal(h.tree.props['data-color-mode'],'dark');
 assert.equal(theme.readColorMode('owner'),'dark');assert.equal(values.get('tmc-color-mode'),'dark');
 theme.setColorMode('owner','light');
 h.render(OwnerGateFrame,{children:'authentication UI'});assert.equal(h.tree.props['data-color-mode'],'light');
 assert.equal(theme.readColorMode('public'),'light');
});
