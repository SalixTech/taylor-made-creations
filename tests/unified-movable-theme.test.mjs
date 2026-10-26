import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './owner-ui-harness.mjs';
function fixture(entries=[]) {
  const h=harness(), values=new Map(entries);h.window.innerWidth=400;h.window.innerHeight=700;
  h.window.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const theme=h.load('src/components/ColorMode.tsx'); const render=()=>h.render(theme.ColorModeToggle,{scope:'owner'});
  const fire=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);h.window.dispatchEvent(e);return e;};
  const button=()=>h.find(n=>n.props?.['data-theme-toggle']!==undefined);
  const down=(x=340,y=640,id=1)=>button().props.onPointerDown({button:0,pointerId:id,clientX:x,clientY:y,currentTarget:{getBoundingClientRect:()=>({left:330,top:630})}});
  render();render();return {h,values,theme,render,fire,down,button};
}
test('legacy scoped choices survive until explicit shared choice; storage and blocked storage are shared',()=>{
  const t=fixture([['tmc-owner-color-mode','light'],['tmc-public-color-mode','dark']]);
  assert.equal(t.theme.readColorMode('owner'),'light');assert.equal(t.theme.readColorMode('public'),'dark');
  t.theme.setColorMode('owner','light');assert.equal(t.values.get('tmc-color-mode'),'light');assert.equal(t.theme.readColorMode('public'),'light');
  t.values.set('tmc-color-mode','dark');t.fire('storage',{key:'tmc-color-mode'});t.render();assert.equal(t.button().props['aria-pressed'],true);
  t.h.window.localStorage={getItem(){throw Error();},setItem(){throw Error();}};
  t.theme.setColorMode('public','light');assert.equal(t.theme.readColorMode('owner'),'light');t.h.unmount();
});
test('click toggles, touch/pointer drag moves without toggling and persists globally',()=>{
 const t=fixture();assert.equal(t.h.all(n=>n.type==='circle').length,0);t.down();t.fire('pointermove',{pointerId:1,clientX:342,clientY:642});t.fire('pointerup',{pointerId:1});
 t.button().props.onClick();t.render();assert.equal(t.button().props['aria-pressed'],false);assert.equal(t.h.all(n=>n.type==='circle').length,1);assert.equal(t.values.has('tmc-theme-toggle-position'),false);
 t.down();t.fire('pointermove',{pointerId:2,clientX:0,clientY:0});t.render();assert.equal(t.button().props.style,undefined);
 t.fire('pointermove',{pointerId:1,clientX:100,clientY:100});t.render();assert.equal(t.button().props['data-dragging'],true);
 t.fire('pointerup',{pointerId:1});t.button().props.onClick();t.render();assert.equal(t.button().props['aria-pressed'],false);
 assert.deepEqual(JSON.parse(t.values.get('tmc-theme-toggle-position')),{x:90,y:90});
 assert.deepEqual(t.button().props.style,{left:90,top:90,right:'auto',bottom:'auto'});
 t.values.set('tmc-theme-toggle-position','{"x":20,"y":30}');t.fire('storage',{key:'tmc-theme-toggle-position'});t.render();assert.equal(t.button().props.style.left,20);assert.equal(t.button().props.style.top,30);t.h.unmount();
});
test('cancel, Escape, blur, resizing and keyboard reposition/reset preserve accessible bounds',()=>{
 const t=fixture([['tmc-theme-toggle-position','{"x":330,"y":630}']]);
 for(const type of ['pointercancel','keydown','blur']) {
 t.down();t.fire('pointermove',{pointerId:1,clientX:10,clientY:10});t.fire(type,{pointerId:1,key:'Escape'});t.render();
 assert.equal(t.button().props.style.left,330);assert.equal(JSON.parse(t.values.get('tmc-theme-toggle-position')).x,330);
 }
 t.h.window.innerWidth=100;t.h.window.innerHeight=100;t.fire('resize');t.render();assert.equal(t.button().props.style.left,56);assert.equal(t.button().props.style.top,56);
 const key=key=>t.button().props.onKeyDown({altKey:true,key,preventDefault(){},currentTarget:{getBoundingClientRect:()=>({left:56,top:56})}});
 key('ArrowLeft');t.render();assert.equal(t.button().props.style.left,46);key('Home');t.render();assert.equal(t.button().props.style,undefined);assert.equal(t.values.get('tmc-theme-toggle-position'),'null');
 t.h.unmount();
});
test('invalid positions and tiny viewports fail safely; styles share one circle in either theme context',async()=>{
 const h=harness(),p=h.load('src/components/theme-toggle-position.ts');
 for(const raw of ['bad','{"x":"2","y":3}','{"x":1e999,"y":3}','null'])assert.equal(p.parseTogglePosition(raw),null);
 assert.deepEqual(p.clampTogglePosition({x:99,y:-1},20,20),{x:0,y:0});
 const {cascade,element}=await import('./helpers/css-cascade.mjs');
 const css=fs.readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8');
 for(const mode of ['light','dark']) {
 const computed=[];
 for(const scope of ['owner','public']){
 const root=element('div',scope==='owner'?{'data-owner-portal':'','data-color-mode':mode}:{'data-theme-scope':'public','data-color-mode':mode});
 const button=element('button',{class:'color-mode-toggle','data-theme-toggle':'','data-theme-mode':mode},root);
 const s=cascade([css],375)(button);computed.push(s);assert.equal(s.width,'44px');assert.equal(s['touch-action'],'none');assert.equal(s.transform,'none');
 }
 for(const prop of ['background','color','border-color','width','height','border-radius'])assert.equal(computed[0][prop],computed[1][prop],prop);
 }h.unmount();
});
test('moved theme button offers a separate reset action that restores default without changing mode',()=>{
 const t=fixture();const reset=()=>t.h.find(n=>n.props?.['data-theme-reset']!==undefined);
 assert.equal(reset(),undefined);const themeBefore=t.theme.readColorMode('owner');
 t.down();t.fire('pointermove',{pointerId:1,clientX:100,clientY:100});t.fire('pointerup',{pointerId:1});t.render();
 assert.ok(reset());assert.equal(reset().props['aria-label'],'Reset theme button position');
 let stopped=0,prevented=0;reset().props.onPointerDown({stopPropagation(){stopped++;}});
 reset().props.onClick({preventDefault(){prevented++;},stopPropagation(){stopped++;}});t.render();
 assert.equal(stopped,2);assert.equal(prevented,1);assert.equal(reset(),undefined);assert.equal(t.button().props.style,undefined);
 assert.equal(t.theme.readColorMode('owner'),themeBefore);assert.equal(t.values.get('tmc-theme-toggle-position'),'null');
 assert.ok(t.h.focusLog.some(label=>label.includes('dark mode')));
 // Reset syncs every instance/scope via the existing shared browser preference.
 t.h.render(t.theme.ColorModeToggle,{scope:'public'});assert.equal(reset(),undefined);assert.equal(t.values.has('tmc-color-mode'),false);
 t.h.unmount();
});
test('reset remains on screen at edges and external reset removes it without changing theme',()=>{
 const t=fixture([['tmc-theme-toggle-position','{"x":9999,"y":0}'],['tmc-color-mode','light']]);
 const reset=()=>t.h.find(n=>n.props?.['data-theme-reset']!==undefined);
 assert.deepEqual(reset().props.style,{left:372,top:0});
 t.values.set('tmc-theme-toggle-position','null');t.fire('storage',{key:'tmc-theme-toggle-position'});t.render();
 assert.equal(reset(),undefined);assert.equal(t.theme.readColorMode('public'),'light');t.h.unmount();
});
test('positions at the default anchor hide reset and dropping back normalizes the stored position',()=>{
 const saved=fixture([['tmc-theme-toggle-position','{"x":338,"y":638}']]);
 assert.equal(saved.button().props.style,undefined);assert.equal(saved.h.find(n=>n.props?.['data-theme-reset']!==undefined),undefined);saved.h.unmount();
 const t=fixture();t.down();t.fire('pointermove',{pointerId:1,clientX:348,clientY:648});t.fire('pointerup',{pointerId:1});t.render();
 assert.equal(t.values.get('tmc-theme-toggle-position'),'null');assert.equal(t.h.find(n=>n.props?.['data-theme-reset']!==undefined),undefined);t.h.unmount();
});
test('reset styles match across owner/public dark mode and safe-area anchor determines default',async()=>{
 const {cascade,element}=await import('./helpers/css-cascade.mjs');
 const css=fs.readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8');
 const computed=['owner','public'].map(scope=>{const root=element('div',scope==='owner'?{'data-owner-portal':'','data-color-mode':'dark'}:{'data-theme-scope':'public','data-color-mode':'dark'});const reset=element('button',{class:'color-mode-reset','data-theme-reset':'','data-owner-button':'','data-theme-mode':'dark'},root);return cascade([css],375)(reset);});
 for(const prop of ['background','background-color','color','border-color','width','height','border-radius'])assert.equal(computed[0][prop],computed[1][prop],prop);
 assert.equal(computed[0].width,'28px');
 const t=fixture([['tmc-theme-toggle-position','{"x":330,"y":620}']]);
 const anchor=t.h.find(n=>n.props?.className==='color-mode-default-anchor');anchor.props.ref.current.getBoundingClientRect=()=>({left:330,top:620,width:44,height:44});t.fire('resize');t.render();assert.equal(t.button().props.style,undefined);assert.equal(t.h.find(n=>n.props?.['data-theme-reset']!==undefined),undefined);t.h.unmount();
});
