import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const load=sourceLoader(), space=load('src/owner/canvas-space.ts'), model=load('src/owner/model.ts'), defaults=load('src/owner/defaults.ts');
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
test('canvas space draws up/down/left/right with exact positive dimensions and signed origin',()=>{
 for(const end of [{x:180,y:240},{x:20,y:240},{x:180,y:40},{x:20,y:40}]){
  const result=space.canvasSpacePlacementFromDrag({x:100,y:140},end,identity);
  assert.equal(result.widthPx,80);assert.equal(result.heightPx,100);
  assert.equal(result.matrix.e,Math.min(100,end.x));assert.equal(result.matrix.f,Math.min(140,end.y));assert.equal(result.aspectLocked,false);
 }
 const negative=space.canvasSpacePlacementFromDrag({x:10,y:10},{x:-190,y:-290},identity);
 assert.equal(negative.matrix.e,-190);assert.equal(negative.matrix.f,-290);assert.equal(negative.widthPx,200);assert.equal(negative.heightPx,300);
});
test('canvas drawing respects scaled/translated parent and rejects singular, zero, nonfinite gestures',()=>{
 const result=space.canvasSpacePlacementFromDrag({x:30,y:50},{x:230,y:350},{a:2,b:0,c:0,d:3,e:10,f:20});
 for(const [actual,expected] of [[result.matrix.e,10],[result.matrix.f,10],[result.widthPx,100],[result.heightPx,100]])assert.ok(Math.abs(actual-expected)<1e-9);
 for(const [start,end,matrix] of [[{x:0,y:0},{x:0,y:20},identity],[{x:0,y:0},{x:20,y:20},{a:0,b:0,c:0,d:0,e:0,f:0}],[{x:NaN,y:0},{x:20,y:20},identity],[{x:0,y:0},{x:Infinity,y:20},identity]])assert.equal(space.canvasSpacePlacementFromDrag(start,end,matrix),null);
});
test('canvas-space persists through strict draft/public schemas without exposing private fields',()=>{
 const content=defaults.createDefaultOwnerContent();const page=content.pages.find(p=>p.builtinKey==='home');
 page.blocks.push({id:'test-canvas-space',type:'canvas-space',widthPx:1800,heightPx:2400});
 assert.equal(model.validateOwnerContent(content).valid,true);
 const snapshot=model.createPublishedOwnerSnapshot(content,1,'2026-10-31T01:48:00.000Z');
 const saved=snapshot.content.pages.find(p=>p.id===page.id).blocks.find(b=>b.id==='test-canvas-space');
 assert.equal(saved.type,'canvas-space');assert.equal(saved.widthPx,1800);assert.equal(saved.heightPx,2400);
 for(const width of [0,-1,Infinity,NaN,'20']){const bad=structuredClone(content);bad.pages.find(p=>p.id===page.id).blocks.find(b=>b.id==='test-canvas-space').widthPx=width;assert.equal(model.validateOwnerContent(bad).valid,false);}
});
