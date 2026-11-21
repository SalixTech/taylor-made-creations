// Deterministic component/ref/ResizeObserver regression coverage, NOT browser layout QA.
// Unlike owner-ui-harness's default renderer, this attaches callback refs before effects.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,nodes,content} from './owner-ui-harness.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const geometry=sourceLoader()('src/owner/box-geometry.ts');
// The optional graph child slot is a sibling of the original contents frame.
const contentsFrame=node=>[node.props.children].flat(Infinity).find(child=>child?.props?.className?.split(' ').includes('contents'));
const box=()=>geometry.initialElementBox({width:400,height:200,parentWidth:800});
function renderer(h,makeNode) {
 const attached=new Map();
 return (C,props)=>{
  h.cursor=0;h.pending=[];h.tree=C(props);
  const live=new Set();
  for(const n of nodes(h.tree)) if(n.props.ref){const key=n.props['data-owner-geometry']?'frame':'contents';let dom=attached.get(key);if(!dom){dom=makeNode(key);attached.set(key,dom);}dom.__node=n;live.add(key);if(typeof n.props.ref==='function')n.props.ref(dom);else n.props.ref.current=dom;}
  for(const [key,dom] of attached) if(!live.has(key)){const ref=dom.__node.props.ref;if(typeof ref==='function')ref(null);else ref.current=null;attached.delete(key);}
  h.pending.forEach(fn=>fn());return h.tree;
 };
}
function observerFixture(h) {
 const observers=[];h.globals.ResizeObserver=class {constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}};
 return {observers,emit(target,width=target.clientWidth,height=target.offsetHeight){for(const o of observers)if(o.targets.has(target))o.callback([{target,contentRect:{width,height}}]);}};
}
function frameFixture({ancestorScale=1,width=400,naturalHeight=200}={}) {
 const h=harness(),ro=observerFixture(h),dimensions={width,naturalHeight,ancestorScale},trace=[];
 const frame={get clientWidth(){return dimensions.width;},get offsetWidth(){return dimensions.width;},getBoundingClientRect(){return{width:dimensions.width*dimensions.ancestorScale};}};
 const contents={get offsetHeight(){return dimensions.naturalHeight;},get clientWidth(){return 400;},get scrollHeight(){return dimensions.naturalHeight;}};
 const renderComponent=renderer(h,key=>key==='frame'?frame:contents),C=h.load('src/components/GeometryBox.tsx').GeometryBox,props={box:box(),children:'A heading',editable:true,target:'template-text:home.stripTitle'};
 const render=()=>{renderComponent(C,props);trace.push({ancestorScale:dimensions.ancestorScale,width:dimensions.width,frameHeight:h.tree.props.style?.height??h.tree.props.style?.minHeight,transform:h.tree.props.children?.props?.style?.transform});return h.tree;};
 render();render();return {h,props,ro,frame,contents,dimensions,trace,render};
}
test('frame measurement uses untransformed layout width: nested scale and CSS zoom cannot compound content scale',()=>{
 for(const ancestorScale of [0.9,1,2]){const t=frameFixture({ancestorScale});assert.equal(contentsFrame(t.h.tree).props.style?.transform,undefined);for(let i=0;i<12;i++){t.ro.emit(t.frame);t.render();}assert.equal(contentsFrame(t.h.tree).props.style?.transform,undefined);t.h.unmount();}
});
test('text uses a stable minimum height while browser reflow owns natural height',()=>{
 const t=frameFixture({naturalHeight:224});assert.equal(t.h.tree.props.style.height,undefined);assert.equal(t.h.tree.props.style.minHeight,200);assert.equal(t.h.tree.props.style.aspectRatio,undefined);
 for(let i=0;i<20;i++){t.ro.emit(t.contents,400,224);t.ro.emit(t.frame);t.render();assert.equal(t.h.tree.props.style.minHeight,200);assert.equal(contentsFrame(t.h.tree).props.style?.transform,undefined);}
 const css=readFileSync(new URL('../src/components/GeometryBox.module.css',import.meta.url),'utf8');assert.doesNotMatch(css,/container-type\s*:\s*inline-size/);assert.match(css,/overflow\s*:\s*visible/);assert.doesNotMatch(css,/overflow-x\s*:\s*clip/);t.h.unmount();
});
test('mobile resize and ratio toggles preserve the design baseline and converge without navigation',()=>{
 const t=frameFixture(),before=JSON.stringify(t.props.box);
 for(const width of [200,390,400,200,400]){t.dimensions.width=width;t.ro.emit(t.frame,width);t.render();assert.equal(t.h.tree.props.style.minHeight,width/2);assert.equal(contentsFrame(t.h.tree).props.style?.transform,undefined);for(let i=0;i<6;i++){t.props.box={...t.props.box,aspectLocked:!t.props.box.aspectLocked};t.render();t.ro.emit(t.frame,width);t.render();assert.equal(t.h.tree.props.style.minHeight,width/2);}}
 assert.equal(JSON.stringify(t.props.box),before);assert.equal(t.h.window.history.length,1);assert.equal(t.h.window.location.href,'');t.h.unmount();
});
test('zero/nonfinite observer measurements never enter rendered style or erase the last valid layout',()=>{
 const t=frameFixture();for(const invalid of [0,NaN,Infinity,-1]){t.dimensions.width=invalid;t.ro.emit(t.frame,invalid);t.render();assert.equal(contentsFrame(t.h.tree).props.style?.transform,undefined);assert.equal(t.h.tree.props.style.minHeight,200);}t.h.unmount();
});
function controlsFixture(value={},zoom=1){
 const h=harness(),ro=observerFixture(h),layout={width:400,height:200,parentWidth:800,zoom,ancestorX:1,ancestorY:1},changes=[],captures=new Set(),releases=[];
 h.window.getComputedStyle=node=>({display:node.inline?'inline':'block',paddingLeft:'0px',paddingRight:'0px'});
 const parent={clientWidth:800,offsetWidth:800,offsetHeight:400,getBoundingClientRect:()=>({left:10*layout.zoom,top:0,width:layout.parentWidth*layout.zoom*layout.ancestorX,height:400*layout.zoom*layout.ancestorY})};
 const target={dataset:{ownerEdit:'template-text:home.stripTitle'},offsetWidth:400,offsetHeight:200,parentElement:parent,getBoundingClientRect:()=>({left:10*layout.zoom,top:50*layout.zoom*layout.ancestorY,width:layout.width*layout.zoom*layout.ancestorX,height:layout.height*layout.zoom*layout.ancestorY})};
 const canvas={clientLeft:0,clientTop:0,offsetWidth:800,offsetHeight:1000,scrollTop:0,scrollLeft:0,querySelectorAll:()=>[target],getBoundingClientRect:()=>({left:0,top:0,width:800*layout.zoom,height:1000*layout.zoom})};
 const C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools,props={canvasRef:{current:canvas},target:target.dataset.ownerEdit,value,disabled:false,onChange(next){changes.push(next);props.value=next;}};
 const render=()=>h.render(C,props);render();render();
 const button={focus(){},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);releases.push(id);}};
 const event=extra=>({pointerId:1,button:0,isPrimary:true,clientX:0,clientY:0,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
 const move=()=>h.find(n=>n.props['aria-label']?.startsWith('Move content box.')),resize=()=>h.find(n=>n.props['aria-label']?.startsWith('Resize content box.')),ratio=()=>h.find(n=>n.type==='button'&&content(n).startsWith('Lock ratio:'));
 return {h,ro,layout,parent,target,props,changes,captures,releases,render,event,move,resize,ratio};
}
test('click-only Move never materializes a box or dirties the draft; click cannot bubble to canvas navigation',()=>{
 const t=controlsFixture();for(let i=0;i<10;i++){t.move().props.onPointerDown(t.event());t.move().props.onPointerUp(t.event());t.render();}assert.equal(t.changes.length,0);assert.equal(t.props.value.box,undefined);assert.equal(t.captures.size,0);
 let prevented=0,stopped=0;t.h.tree.props.onClick({preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(t.h.window.history.length,1);assert.equal(t.h.window.location.href,'');t.h.unmount();
});
test('unboxed ratio toggles do not change layout; first real drag uses a stable untransformed baseline at 90/100 percent zoom',()=>{
 for(const zoom of [0.9,1]){const t=controlsFixture({},zoom);for(let i=0;i<9;i++){t.ratio().props.onClick(t.event());t.render();}assert.equal(t.changes.length,0);assert.equal(t.ratio().props['aria-pressed'],false);t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({clientX:80*zoom,clientY:30*zoom}));t.render();t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,1);assert.equal(t.props.value.box.baseWidthPx,400);assert.equal(t.props.value.box.baseHeightPx,200);assert.equal(t.props.value.box.widthPercent,60);assert.equal(t.props.value.box.heightPx,230);assert.equal(t.props.value.box.aspectLocked,false);t.h.unmount();}
});
test('foreign and duplicate pointers cannot finish a gesture; actual drag commits once and repeated ratio toggles preserve its size',()=>{
 const t=controlsFixture({box:box()});t.resize().props.onPointerDown(t.event());t.resize().props.onPointerDown(t.event({pointerId:9}));t.resize().props.onPointerMove(t.event({clientX:80}));t.resize().props.onPointerUp(t.event({pointerId:9}));assert.equal(t.changes.length,0);t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,1);t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,1);t.render();const dimensions={...t.props.value.box};for(let i=0;i<10;i++){t.ratio().props.onClick(t.event());t.render();assert.deepEqual({...t.props.value.box,aspectLocked:dimensions.aspectLocked},dimensions);}assert.equal(t.captures.size,0);t.h.unmount();
});
test('escape/cancel/lost capture/blur/resize/disabled/selection change/unmount release capture and discard previews',()=>{
 for(const ending of ['Escape','cancel','lost','blur','resize','parent-resize','disabled','selection','unmount']){const t=controlsFixture();t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({clientX:80}));t.render();if(ending==='Escape')t.resize().props.onKeyDown(t.event({key:'Escape'}));else if(ending==='cancel')t.resize().props.onPointerCancel(t.event());else if(ending==='lost')t.resize().props.onLostPointerCapture(t.event());else if(ending==='disabled'){t.props.disabled=true;t.render();}else if(ending==='selection'){t.props.target='another';t.render();}else if(ending==='unmount')t.h.unmount();else if(ending==='parent-resize'){t.layout.parentWidth=390;t.parent.clientWidth=390;t.parent.offsetWidth=390;t.ro.emit(t.parent,390);}else t.h.window.dispatchEvent(new Event(ending));assert.equal(t.changes.length,0,ending);assert.equal(t.captures.size,0,ending);t.h.unmount();}
});
test('math rejects nonfinite edits and always emits schema-valid geometry',()=>{
 const original=box();for(const invalid of [NaN,Infinity,-Infinity]){assert.equal(geometry.validElementBox(geometry.initialElementBox({width:invalid,height:invalid,parentWidth:invalid,xPercent:invalid})),true);assert.deepEqual(geometry.moveElementBox(original,invalid,invalid),original);assert.deepEqual(geometry.resizeElementBox(original,invalid,invalid),original);}
});
if(process.env.TMC_GEOMETRY_TRACE){
 const t=frameFixture({ancestorScale:2,naturalHeight:224});for(const width of [400,400,200,200,400]){t.dimensions.width=width;t.ro.emit(t.frame);t.render();}console.log('GEOMETRY_DIMENSION_TRACE '+JSON.stringify(t.trace));t.h.unmount();
}
test('canvas overlays and independent X/Y pointer conversion survive nested unlocked scale and 90 percent CSS zoom',()=>{
 for(const zoom of [0.9,1])for(const [ancestorX,ancestorY] of [[2,2],[1,2],[2,0.5]]){
  const t=controlsFixture({box:{...box(),aspectLocked:false}},zoom);Object.assign(t.layout,{ancestorX,ancestorY});t.ro.emit(t.parent);t.render();
  const handle=t.resize().props.style;assert.equal(handle.left,10+400*ancestorX-14);assert.equal(handle.top,50*ancestorY+200*ancestorY-14);
  t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({clientX:80*zoom*ancestorX,clientY:30*zoom*ancestorY}));t.render();
  const ghost=t.h.find(n=>n.props.className==='boxGhost').props.style;const matrix=ghost.transform.slice(7,-1).split(',').map(Number);assert.ok(Math.abs(matrix[0]-ancestorX)<1e-8);assert.ok(Math.abs(matrix[3]-ancestorY)<1e-8);assert.ok(Math.abs(ghost.width-480)<1e-8);assert.ok(Math.abs(ghost.height-230)<1e-8);
  t.resize().props.onPointerUp(t.event());assert.equal(t.props.value.box.widthPercent,60);assert.equal(t.props.value.box.heightPx,230);assert.equal(t.props.value.box.baseWidthPx,400);assert.equal(t.props.value.box.baseHeightPx,200);t.h.unmount();
 }
});
test('Reset restores legacy flow without autosave; close/reopen preserves valid large saved geometry',()=>{
 const saved={...box(),widthPercent:100,heightPx:2000,baseWidthPx:2400,baseHeightPx:4000,referenceParentPx:4000,aspectLocked:false};assert.equal(geometry.validElementBox(saved),true);
 const t=controlsFixture({box:saved,textColor:'#123456'});assert.equal(t.changes.length,0);for(let i=0;i<4;i++){t.ratio().props.onClick(t.event());t.render();assert.deepEqual({...t.props.value.box,aspectLocked:false},saved);}
 const before=t.changes.length;t.move().props.onPointerDown(t.event());t.move().props.onPointerMove(t.event({clientY:20}));t.resize().props.onKeyDown(t.event({key:'Escape'}));t.h.unmount();assert.equal(t.changes.length,before);
 const reopened=controlsFixture(t.props.value);assert.deepEqual(reopened.props.value.box,saved);assert.equal(reopened.changes.length,0);
 reopened.h.find(n=>n.type==='button'&&content(n)==='Reset box').props.onClick();reopened.render();assert.deepEqual(reopened.props.value,{textColor:'#123456'});assert.equal(reopened.changes.length,1);reopened.move().props.onPointerDown(reopened.event());reopened.move().props.onPointerUp(reopened.event());assert.equal(reopened.changes.length,1);reopened.h.unmount();
 const f=frameFixture();f.props.box=undefined;f.render();assert.equal(f.h.tree.type,'Fragment');assert.equal(content(f.h.tree),'A heading');f.h.unmount();
});
test('invalid saved geometry renders original children; stale observer callbacks after reset/unmount are inert',()=>{
 const t=frameFixture(),observer=t.ro.observers[0],snapshot=()=>JSON.stringify(t.h.hooks);t.props.box={...box(),heightPx:Infinity};t.render();assert.equal(t.h.tree.type,'Fragment');const afterReset=snapshot();observer.callback([{target:t.frame,contentRect:{width:999,height:999}}]);assert.equal(snapshot(),afterReset);t.h.unmount();observer.callback([{target:t.frame,contentRect:{width:888,height:888}}]);assert.equal(snapshot(),afterReset);
});
test('lost capture on a different pointer, subpixel jitter and invalid pointer coordinates do not commit or cancel the active pointer',()=>{
 const t=controlsFixture();t.resize().props.onPointerDown(t.event());t.resize().props.onLostPointerCapture(t.event({pointerId:9}));assert.equal(t.captures.size,1);t.resize().props.onPointerMove(t.event({clientX:NaN,clientY:Infinity}));t.resize().props.onPointerMove(t.event({clientX:0.4,clientY:0.4}));t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,0);assert.equal(t.captures.size,0);t.h.unmount();
});
test('separate fractional frame/source observations settle instead of alternating with rounded client/offset dimensions',()=>{
 const t=frameFixture();t.dimensions.width=399.6;t.ro.emit(t.frame,399.6,200);t.ro.emit(t.contents,400,224.4);t.render();const settled=t.h.tree.props.style.minHeight;assert.ok(Math.abs(settled-199.8)<1e-8);
 for(let i=0;i<20;i++){t.ro.emit(t.frame,399.6,settled);t.render();assert.equal(t.h.tree.props.style.minHeight,settled);t.ro.emit(t.contents,400,224.4);t.render();assert.equal(t.h.tree.props.style.minHeight,settled);}
 t.h.unmount();
});
test('canceled previews cannot resurrect after selection away/back or disabling/re-enabling controls',()=>{
 for(const ending of ['selection','disabled']){const t=controlsFixture({box:box()});const originalTarget=t.props.target;t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({clientX:80}));t.render();assert.ok(t.h.find(n=>n.props.className==='boxGhost'));
  if(ending==='selection')t.props.target='other';else t.props.disabled=true;t.render();t.render();
  if(ending==='selection')t.props.target=originalTarget;else t.props.disabled=false;t.render();t.render();
  assert.equal(t.h.find(n=>n.props.className==='boxGhost'),undefined);assert.equal(t.captures.size,0);assert.equal(t.changes.length,0);t.h.unmount();
 }
});

test('selected box border shares the validated pointer lifecycle and commits only once',()=>{
 const t=controlsFixture(),surface=()=>t.h.find(n=>n.props.className?.split(' ').includes('boxMoveSurface'));
 surface().props.onPointerDown(t.event());surface().props.onPointerMove(t.event({clientX:40,clientY:25}));t.render();
 assert.equal(t.changes.length,0);assert.ok(t.h.find(n=>n.props.className==='boxGhost'));
 surface().props.onPointerUp(t.event());surface().props.onPointerUp(t.event());
 assert.equal(t.changes.length,1);assert.equal(t.props.value.box.xPercent,5);assert.equal(t.props.value.box.yPx,25);assert.equal(geometry.validElementBox(t.props.value.box),true);
 t.render();surface().props.onPointerDown(t.event());surface().props.onPointerMove(t.event({clientY:70}));surface().props.onKeyDown(t.event({key:'Escape'}));surface().props.onPointerUp(t.event());assert.equal(t.changes.length,1);assert.equal(t.captures.size,0);t.h.unmount();
});
test('a full-width box may intentionally move beyond its section',()=>{
 const t=controlsFixture({box:{...box(),widthPercent:100}}),surface=()=>t.h.find(n=>n.props.className?.split(' ').includes('boxMoveSurface'));
 surface().props.onPointerDown(t.event());surface().props.onPointerMove(t.event({clientX:80}));surface().props.onPointerUp(t.event());t.render();
 assert.equal(t.changes.length,1);assert.equal(t.props.value.box.xPercent,10);assert.equal(t.props.value.box.widthPercent,100);t.h.unmount();
});
test('canvas capture lets transform controls own Escape before inspector dismissal',()=>{
 const source=readFileSync(new URL('../src/owner/OwnerVisualBuilder.tsx',import.meta.url),'utf8'),capture=source.slice(source.indexOf('  function capture('),source.indexOf('  function canvasBlock('));
 assert.ok(capture.indexOf('if (event.target.closest("[data-owner-canvas-controls]")) return;') < capture.indexOf('event.key === "Escape" && selected'));
});
