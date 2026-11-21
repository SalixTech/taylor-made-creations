import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),p=load('src/owner/canvas-placement-geometry.ts'),g=load('src/owner/box-geometry.ts');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pointNear=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};
const seed=()=>({matrix:{a:1.3,b:.4,c:.7,d:-.9,e:-123.5,f:83.25},widthPx:200.5,heightPx:90.25});
const corners=x=>[[0,0],[x.widthPx,0],[0,x.heightPx],[x.widthPx,x.heightPx]].map(([x,y])=>({x,y}));
test('affine chart round trips nonsingular shear/reflection without quantizing',()=>{
 for(const matrix of [seed().matrix,{a:0,b:2,c:-3,d:.8,e:300,f:-100},{a:1,b:0,c:0,d:1,e:0,f:0}]){
 const original={...seed(),matrix},chart=p.placementControlChart(original),next=p.applyPlacementControl(chart,chart.box);
 for(const corner of corners(original))pointNear(g.transformPoint(next.matrix,corner),g.transformPoint(matrix,corner));
 near(next.widthPx,original.widthPx);near(next.heightPx,original.heightPx);
 }
});
test('all eight handles keep opposite anchor under arbitrary nonsingular shear',()=>{
 for(const handle of ['nw','n','ne','e','se','s','sw','w'])for(const locked of [false,true]){
 const original=seed(),chart=p.placementControlChart(original),box={...chart.box,aspectLocked:locked};
 const next=p.applyPlacementControl(chart,g.resizeElementBoxFromHandle(box,handle,17,-12,locked));
 const anchor=x=>({x:handle.includes('w')?x.widthPx:handle.includes('e')?0:x.widthPx/2,y:handle.includes('n')?x.heightPx:handle.includes('s')?0:x.heightPx/2});
 pointNear(g.transformPoint(original.matrix,anchor(original)),g.transformPoint(next.matrix,anchor(next)));
 if(locked)near(next.widthPx/next.heightPx,original.widthPx/original.heightPx);
 }
});
test('frame-only move preserves descendant screen point; group move carries contents',()=>{
 const original=seed(),chart=p.placementControlChart(original),offset={xPx:4,yPx:-9};chart.box.contentOffset=offset;
 for(const group of [false,true]){
 const nextBox=g.moveElementBoxFrame(chart.box,chart.box.xPercent+15,chart.box.yPx-22,group),next=p.applyPlacementControl(chart,nextBox),q={x:31,y:12};
 const before=g.transformPoint(original.matrix,{x:q.x+offset.xPx,y:q.y+offset.yPx});
 const after=g.transformPoint(next.matrix,{x:q.x+nextBox.contentOffset.xPx,y:q.y+nextBox.contentOffset.yPx});
 if(!group)pointNear(before,after);else assert.notDeepEqual(before,after);
 }
});
test('rotation preserves frame center and shear determinant, invalid edits fail atomically',()=>{
 const original=seed(),chart=p.placementControlChart(original),next=p.applyPlacementControl(chart,g.rotateElementBox(chart.box,73));
 pointNear(g.transformPoint(original.matrix,{x:original.widthPx/2,y:original.heightPx/2}),g.transformPoint(next.matrix,{x:next.widthPx/2,y:next.heightPx/2}));
 near(original.matrix.a*original.matrix.d-original.matrix.b*original.matrix.c,next.matrix.a*next.matrix.d-next.matrix.b*next.matrix.c);
 for(const v of [NaN,Infinity,-Infinity,0])assert.equal(p.placementControlChart({...original,widthPx:v}),null);
 assert.equal(p.placementControlChart({...original,matrix:{a:1,b:1,c:1,d:1,e:0,f:0}}),null);
 assert.equal(p.applyPlacementControl(chart,{...chart.box,referenceParentPx:1}),null);
 assert.equal(p.applyPlacementControl(chart,{...chart.box,heightPx:Infinity}),null);
});

test('placement owns metadata independently of a shared appearance box',()=>{
 const shared={...g.initialElementBox({width:200,height:90,parentWidth:600}),contentOffset:{xPx:99,yPx:88},aspectLocked:true};
 const placement={...seed(),aspectLocked:false,contentOffset:{xPx:3,yPx:7}};
 const reset=p.placementControlChart(seed(),shared);assert.equal(reset.box.contentOffset,undefined);
 const chart=p.placementControlChart(placement,shared);assert.equal(chart.box.aspectLocked,false);assert.deepEqual(chart.box.contentOffset,{xPx:3,yPx:7});
 const next=p.applyPlacementControl(chart,{...chart.box,aspectLocked:true,contentOffset:{xPx:5,yPx:8}});
 assert.deepEqual(next.contentOffset,{xPx:5,yPx:8});assert.equal(next.aspectLocked,true);assert.deepEqual(shared.contentOffset,{xPx:99,yPx:88});assert.deepEqual(placement.contentOffset,{xPx:3,yPx:7});
});

test('actual DOM capture preserves screen corners across scaled rotated destination and rejects hidden frame',async()=>{
 const {harness}=await import('./owner-ui-harness.mjs'),h=harness(),helper=h.load('src/owner/canvas-placement-geometry.ts');
 const rect=(m,w,h)=>{const pts=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>g.transformPoint(m,{x,y}));return {left:Math.min(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),width:Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),height:Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))};};
 const node=(m,w,h)=>({parentElement:null,offsetWidth:w,offsetHeight:h,world:m,getBoundingClientRect:()=>rect(m,w,h)});
 h.window.getComputedStyle=n=>({display:'block',transform:`matrix(${n.world.a},${n.world.b},${n.world.c},${n.world.d},0,0)`,width:`${n.offsetWidth}px`,height:`${n.offsetHeight}px`,boxSizing:'border-box'});
 const source=node(seed().matrix,200.5,90.25),destination=node({a:.7,b:.4,c:-.3,d:1.2,e:500,f:-60},700,500);
 const metadata={...g.initialElementBox({width:100.25,height:45.125,parentWidth:100.25}),contentOffset:{xPx:7,yPx:-3}};
 const captured=helper.measureCanvasPlacement(source,destination,metadata);assert.ok(captured);assert.deepEqual(captured.contentOffset,{xPx:14,yPx:-6});
 const world=g.multiplyAffine(destination.world,captured.matrix);
 for(const corner of corners(captured))pointNear(g.transformPoint(world,corner),g.transformPoint(source.world,corner));
 const snapshot=helper.captureCanvasFrame(source,metadata);
 source.offsetWidth=0;assert.equal(helper.measureCanvasPlacement(source,destination),null);
 const later=helper.placeCapturedCanvasFrame(snapshot,destination);assert.deepEqual(later,captured);
 later.contentOffset.xPx=999;assert.equal(snapshot.contentOffset.xPx,14);
 // Forced slot insertion/removal may reflow both source and destination. The
 // old numeric screen snapshot, not a new source DOM read, is authoritative.
 destination.world.e+=137;destination.world.f-=91;
 destination.getBoundingClientRect=()=>rect(destination.world,700,500);
 source.getBoundingClientRect=()=>{throw new Error('removed source must not be reread');};
 const shifted=helper.placeCapturedCanvasFrame(snapshot,destination);assert.ok(shifted);
 const shiftedWorld=g.multiplyAffine(destination.world,shifted.matrix);
 for(const corner of corners(shifted))pointNear(g.transformPoint(shiftedWorld,corner),g.transformPoint(snapshot.screenMatrix,corner));
 destination.isConnected=false;assert.equal(helper.placeCapturedCanvasFrame(snapshot,destination),null);destination.isConnected=true;
 destination.world={a:1,b:1,c:1,d:1,e:0,f:0};assert.equal(helper.placeCapturedCanvasFrame(snapshot,destination),null);

 assert.equal(helper.placeCapturedCanvasFrame({...snapshot,screenMatrix:{...snapshot.screenMatrix,a:Infinity}},destination),null);
});

test('actual canvas controls commit placement only and stale destination cancels safely',async()=>{
 const {harness}=await import('./owner-ui-harness.mjs'),h=harness(),writes=[],legacy=[];
 const canvas={parentElement:null,offsetWidth:1000,offsetHeight:800,clientWidth:1000,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})};
 let left=0;
 const destination={parentElement:canvas,offsetWidth:600,offsetHeight:400,clientWidth:600,getBoundingClientRect:()=>({left,top:0,width:600,height:400})};
 const node={parentElement:destination,offsetWidth:200,offsetHeight:90,dataset:{ownerEdit:'block:x'},querySelector:()=>null,getBoundingClientRect:()=>({left:10,top:20,width:200,height:90})};
 canvas.querySelectorAll=()=>[node];h.window.getComputedStyle=()=>({display:'block',transform:'none',zoom:'1'});
 const props={canvasRef:{current:canvas},target:'block:x',value:undefined,disabled:false,placement:{matrix:{a:1,b:0,c:.3,d:1,e:10,f:20},widthPx:200,heightPx:90},resolvePlacementDestination:()=>destination,onPlacementChange:(p)=>writes.push(p),onChange:v=>legacy.push(v)};
 const C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools;h.render(C,props);h.render(C,props);
 const button=h.find(n=>n.props['aria-label']?.startsWith('Move content box.'));assert.ok(button);
 const event={key:'ArrowRight',preventDefault(){},stopPropagation(){}};
 button.props.onKeyDown(event);assert.equal(writes.length,1);assert.equal(legacy.length,0);assert.notDeepEqual(writes[0].matrix,props.placement.matrix);
 left=30;button.props.onKeyDown(event);assert.equal(writes.length,1);assert.equal(legacy.length,0);
 left=0;destination.isConnected=false;button.props.onKeyDown(event);assert.equal(writes.length,1);assert.equal(legacy.length,0);
});
