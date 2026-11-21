import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader({}),space=load('src/owner/canvas-space.ts'),geo=load('src/owner/box-geometry.ts'),model=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts'),graph=load('src/owner/canvas-layout.ts');
const I={a:1,b:0,c:0,d:1,e:0,f:0};
test('Canvas Space drawing supports all four directions and negative coordinates',()=>{
 for(const x of [-1,1])for(const y of [-1,1]){const result=space.canvasSpacePlacementFromDrag({x:10,y:20},{x:10+x*200,y:20+y*90},I);assert.equal(result.widthPx,200);assert.equal(result.heightPx,90);assert.equal(result.matrix.e,x<0?-190:10);assert.equal(result.matrix.f,y<0?-70:20);}
});
test('draw maps through full rotated sheared reflected parent affine, not axis-aligned screen guesses',()=>{
 for(const parent of [{a:0,b:2,c:-3,d:0,e:99,f:-55},{a:-2,b:.5,c:1,d:3,e:-50,f:100}]){
 const start=geo.transformPoint(parent,{x:-20,y:30}),end=geo.transformPoint(parent,{x:180,y:120});const result=space.canvasSpacePlacementFromDrag(start,end,parent);
 assert.ok(Math.abs(result.widthPx-200)<1e-8);assert.ok(Math.abs(result.heightPx-90)<1e-8);assert.ok(Math.abs(result.matrix.e+20)<1e-8);assert.ok(Math.abs(result.matrix.f-30)<1e-8);
 }
});
test('degenerate/stale/unbounded numerical canvas drawings fail without model edits',()=>{
 for(const [start,end,map] of [[{x:0,y:0},{x:0,y:5},I],[{x:0,y:0},{x:5,y:0},I],[{x:NaN,y:0},{x:5,y:5},I],[{x:0,y:0},{x:Infinity,y:5},I],[{x:0,y:0},{x:5,y:5},{...I,a:0}],[{x:0,y:0},{x:5,y:5},{...I,e:Infinity}]])assert.equal(space.canvasSpacePlacementFromDrag(start,end,map),null);
 assert.equal(space.captureCanvasSpaceParent({isConnected:false}),null);
});
test('Canvas Space base dimensions and independent mobile placement survive strict save/public/reload',()=>{
 const content=defaults.createDefaultOwnerContent(),page=content.pages.find(p=>p.builtinKey==='prices');page.blocks.push({id:'drawn-space',type:'canvas-space',widthPx:320,heightPx:150});
 const desktop=space.canvasSpacePlacementFromDrag({x:0,y:0},{x:320,y:150},I),mobile=space.canvasSpacePlacementFromDrag({x:-20,y:40},{x:160,y:280},I);
 assert.equal(graph.assignCanvasParent(content,page,'block:drawn-space',null,false,desktop),true);assert.equal(graph.assignCanvasParent(content,page,'block:drawn-space',null,true,mobile),true);
 assert.equal(model.validateOwnerContent(content).valid,true);
 const publicContent=model.createPublicContentSnapshot(content);model.assertPublicOwnerContent(publicContent);
 const restored=model.publicContentToOwnerContent(JSON.parse(JSON.stringify(publicContent))),savedPage=restored.pages.find(p=>p.id===page.id);
 assert.deepEqual(savedPage.blocks.find(b=>b.id==='drawn-space'),page.blocks.find(b=>b.id==='drawn-space'));
 assert.deepEqual(graph.resolveCanvasLayout(restored,savedPage,false)['block:drawn-space'].placement,desktop);assert.deepEqual(graph.resolveCanvasLayout(restored,savedPage,true)['block:drawn-space'].placement,mobile);
 for(const invalid of [0,-1,NaN,Infinity]){const next=structuredClone(content);next.pages.find(p=>p.id===page.id).blocks.find(b=>b.id==='drawn-space').widthPx=invalid;assert.equal(model.validateOwnerContent(next).valid,false);}
});
