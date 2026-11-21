import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const {boxAlignmentGuides}=sourceLoader()('src/owner/box-alignment.ts');
test('advisory alignment identifies edges and centers within screen-pixel tolerance without mutating geometry',()=>{
 const selected={left:100,top:80,width:80,height:40},original=structuredClone(selected);
 const guides=boxAlignmentGuides(selected,[{left:20,top:200,width:240,height:30}]);assert.equal(guides.find(g=>g.axis==='x').position,140);assert.deepEqual(selected,original);
 assert.deepEqual(boxAlignmentGuides(selected,[{left:500,top:500,width:40,height:40}]),[]);
 assert.equal(boxAlignmentGuides(selected,[{left:104,top:200,width:20,height:20}]).find(g=>g.axis==='x').position,104);
 assert.deepEqual(boxAlignmentGuides(selected,[{left:106,top:200,width:10,height:20}]),[]);
});
test('invalid hidden and overflowing alignment targets never produce nonfinite guides',()=>{
 const selected={left:0,top:0,width:100,height:100};for(const value of [NaN,Infinity,-Infinity])assert.deepEqual(boxAlignmentGuides({...selected,left:value},[selected]),[]);
 assert.deepEqual(boxAlignmentGuides(selected,[{...selected,width:0},{...selected,height:-1}]),[]);
 for(const guide of boxAlignmentGuides(selected,[{left:Number.MAX_VALUE,top:0,width:Number.MAX_VALUE,height:10}]))assert.ok([guide.position,guide.start,guide.end].every(Number.isFinite));
});
test('real canvas move shows transient guides, never snaps the draft, and clears on Escape/scroll',async()=>{
 const {harness}=await import('./owner-ui-harness.mjs');
 for(const cancel of ['escape','scroll']){
  const h=harness(),C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools;
  const parent={getBoundingClientRect:()=>({left:0,top:0,width:800,height:700})};
  const node={dataset:{ownerEdit:'block:one'},parentElement:parent,getBoundingClientRect:()=>({left:0,top:50,width:400,height:200})};
  const other={dataset:{ownerEdit:'block:two'},parentElement:parent,getBoundingClientRect:()=>({left:103,top:400,width:100,height:100})};
  const canvas={scrollTop:0,scrollLeft:0,querySelectorAll:()=>[node,other],getBoundingClientRect:()=>({left:0,top:0,width:800,height:900})};
  const changes=[],props={canvasRef:{current:canvas},target:'block:one',disabled:false,onChange:next=>changes.push(next)};
  const render=()=>h.render(C,props);render();render();const move=()=>h.find(n=>n.props['aria-label']?.startsWith('Move content box.'));
  const button={focus(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
  const event=extra=>({pointerId:1,button:0,clientX:0,clientY:0,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
  move().props.onPointerDown(event());move().props.onPointerMove(event({clientX:100}));render();assert.ok(h.find(n=>n.props['data-owner-alignment-guide']==='x'));assert.equal(changes.length,0);
  if(cancel==='escape')move().props.onKeyDown(event({key:'Escape'}));else h.window.dispatchEvent(new Event('scroll'));render();assert.equal(h.find(n=>n.props['data-owner-alignment-guide']),undefined);assert.equal(changes.length,0);h.unmount();
 }
});

test('nearby boxes offer multiple solid edge guides while distant aligned references remain dotted',()=>{
 const selected={left:100,top:100,width:100,height:30};
 const near={left:100,top:150,width:100,height:30};
 const far={left:100,top:600,width:100,height:30};
 const guides=boxAlignmentGuides(selected,[far,near]);
 const xs=guides.filter(g=>g.axis==='x');assert.equal(xs.length,3);assert.deepEqual(xs.map(g=>g.position),[100,150,200]);assert.ok(xs.every(g=>g.proximity==='near'));
 assert.ok(boxAlignmentGuides(selected,[far]).filter(g=>g.axis==='x').every(g=>g.proximity==='far'));
 assert.deepEqual(selected,{left:100,top:100,width:100,height:30});
});
