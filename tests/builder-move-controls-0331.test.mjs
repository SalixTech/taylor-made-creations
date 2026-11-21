// Component/ref/observer and deterministic 2-D transform fixtures, not pixel/browser QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './owner-ui-harness.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),g=load('src/owner/box-geometry.ts');
const near=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const seed=()=>({...g.initialElementBox({width:320,height:160,parentWidth:800,xPercent:15}),yPx:200,aspectLocked:false,rotationDeg:27});
const mul=g.multiplyAffine,pt=g.transformPoint,rot=g.rotationAffine;
const translation=(x,y)=>({a:1,b:0,c:0,d:1,e:x,f:y});
const scale=(x,y)=>({a:x,b:0,c:0,d:y,e:0,f:0});
const css=m=>`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
function about(matrix,x,y){return mul(translation(x,y),mul(matrix,translation(-x,-y)));}
function rect(matrix,w,h){const corners=[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>pt(matrix,{x,y}));const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);return{left:Math.min(...xs),top:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
function fixture({zoom=1,box=seed(),heightFactor=1,angle=31,placed=false,grouped=false}={}){
 const h=harness(),changes=[],captures=new Set(),observers=[],mutations=[],layout={zoom,angle,heightFactor},props={canvasRef:{current:null},target:'block:text',value:{box},selectBoxContents:grouped,disabled:false,onChange(value){changes.push(value);props.value=value;}};
 h.globals.ResizeObserver=class{constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}};
 h.globals.MutationObserver=class{constructor(callback){this.callback=callback;mutations.push(this);}observe(){}disconnect(){}};
 const canvas={offsetWidth:1200,offsetHeight:2000,clientWidth:1200,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,parentElement:null,computed:()=>({zoom:String(layout.zoom)}),world:()=>mul(translation(20,30),scale(layout.zoom,layout.zoom)),getBoundingClientRect(){return rect(this.world(),this.offsetWidth,this.offsetHeight);},querySelectorAll:()=>[node]};
 const outer={offsetWidth:1000,offsetHeight:1400,clientWidth:1000,parentElement:canvas,computed:()=>({transform:css(mul(rot(layout.angle),scale(1.4,.65)))}),world(){return mul(canvas.world(),mul(translation(80,140),about(mul(rot(layout.angle),scale(1.4,.65)),400,300)));},getBoundingClientRect(){return rect(this.world(),this.offsetWidth,this.offsetHeight);}};
 const parent={offsetWidth:800,offsetHeight:1000,clientWidth:800,parentElement:outer,computed:()=>({transform:css(mul(rot(-17),scale(.8,1.3)))}),world(){return mul(outer.world(),mul(translation(50,70),about(mul(rot(-17),scale(.8,1.3)),300,250)));},getBoundingClientRect(){return rect(this.world(),this.offsetWidth,this.offsetHeight);}};
 const node={dataset:{ownerEdit:props.target},parentElement:parent,get offsetWidth(){return props.value.box.widthPercent/100*parent.clientWidth;},get offsetHeight(){return props.value.box.heightPx*parent.clientWidth/props.value.box.referenceParentPx*layout.heightFactor;},computed:()=>({transform:css(rot(props.value.box.rotationDeg??0))}),world(){const b=props.value.box;return mul(parent.world(),mul(translation(b.xPercent/100*parent.clientWidth,100+b.yPx*parent.clientWidth/b.referenceParentPx),about(rot(b.rotationDeg??0),this.offsetWidth/2,this.offsetHeight/2)));},getBoundingClientRect(){return rect(this.world(),this.offsetWidth,this.offsetHeight);}};
 h.window.getComputedStyle=node=>({display:'block',paddingLeft:'0px',paddingRight:'0px',transform:'none',rotate:'none',scale:'none',translate:'none',perspective:'none',zoom:'1',...node.computed?.()});
 const commits=[],previews=[],placements=[],starts=[],cancels=[];
 node.querySelector=()=>({}); // Actual selected frame contains content; group movement is now explicit opt-in.
 props.onCanvasMoveStart=()=>starts.push(true);props.onCanvasMovePreview=p=>previews.push(p);props.onCanvasMoveCommit=(snapshot,p)=>commits.push({snapshot,point:p});props.onCanvasMoveCancel=()=>cancels.push(true);
 if(placed){props.placement={matrix:{a:1.2,b:.3,c:-.4,d:.8,e:120,f:-40},widthPx:210,heightPx:95,contentOffset:{xPx:17,yPx:-9},aspectLocked:false};props.resolvePlacementDestination=()=>parent;props.onPlacementChange=(p,b)=>placements.push({p,b});}
 props.canvasRef.current=canvas;
 const C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools,render=()=>h.render(C,props);render();render();
 const button={focus(){},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);}};
 const event=(p={x:0,y:0},extra={})=>({pointerId:1,button:0,isPrimary:true,clientX:p.x,clientY:p.y,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
 const handle=key=>key==='move'?h.find(n=>n.props['aria-label']?.startsWith('Move content box.')):key==='rotate'?h.find(n=>n.props['aria-label']?.startsWith('Rotate content box.')):h.find(n=>n.props['data-handle']===key);
 const localPoint=key=>({x:key.includes('w')?0:key.includes('e')?node.offsetWidth:node.offsetWidth/2,y:key.includes('n')?0:key.includes('s')?node.offsetHeight:node.offsetHeight/2});
 return{h,commits,previews,placements,starts,cancels,changes,captures,layout,props,canvas,parent,node,outer,render,event,handle,localPoint,observers,mutations};
}
const matrixNear=(actual,expected)=>{for(const key of ['a','b','c','d','e','f'])near(actual[key],expected[key],key);};
test('0331 real controls pointer move produces one screen affine commit under nested transformed parent; explicit group preserves content offset',()=>{
 for(const placed of [false,true])for(const zoom of [.75,1.4]){
  const original={...seed(),contentOffset:{xPx:17,yPx:-9}},f=fixture({box:original,placed,zoom,grouped:true});
  const before=placed?mul(f.parent.world(),f.props.placement.matrix):f.node.world(),delta={x:73,y:-41},start=pt(before,{x:30,y:20}),end={x:start.x+delta.x,y:start.y+delta.y};
  const move=f.handle('move');assert.ok(move);move.props.onPointerDown(f.event(start));move.props.onPointerMove(f.event(end));
  assert.equal(f.starts.length,1);assert.deepEqual(f.previews,[end]);assert.equal(f.commits.length,0);assert.equal(f.changes.length,0);assert.equal(f.placements.length,0);
  f.render();f.handle('move').props.onPointerUp(f.event(end));assert.equal(f.commits.length,1);assert.deepEqual(f.commits[0].point,end);
  matrixNear(f.commits[0].snapshot.screenMatrix,{...before,e:before.e+delta.x,f:before.f+delta.y});
  const expectedWidth=placed?210:f.node.offsetWidth,expectedHeight=placed?95:f.node.offsetHeight;near(f.commits[0].snapshot.widthPx,expectedWidth);near(f.commits[0].snapshot.heightPx,expectedHeight);
  assert.deepEqual(f.commits[0].snapshot.contentOffset,{xPx:17,yPx:-9});assert.equal(f.changes.length,0);assert.equal(f.placements.length,0);assert.equal(f.captures.size,0);
  move.props.onLostPointerCapture(f.event(end));assert.equal(f.commits.length,1);
 }
});
test('0331 pointer cancellation and foreign pointer release never commit or mutate box/placement',()=>{
 for(const placed of [false,true]){const f=fixture({placed}),move=f.handle('move');move.props.onPointerDown(f.event({x:20,y:30}));move.props.onPointerMove(f.event({x:90,y:70}));move.props.onPointerUp(f.event({x:90,y:70},{pointerId:2}));assert.equal(f.commits.length,0);move.props.onPointerCancel(f.event({x:90,y:70}));assert.equal(f.commits.length,0);assert.equal(f.changes.length,0);assert.equal(f.placements.length,0);assert.equal(f.cancels.length,1);assert.equal(f.captures.size,0);}
});
test('0331 keyboard group move keeps offset and does not start membership drag; controls have four narrow edges not a full intercept button',()=>{
 const f=fixture({box:{...seed(),contentOffset:{xPx:8,yPx:4}},grouped:true}),move=f.handle('move');
 move.props.onKeyDown({key:'ArrowRight',preventDefault(){},stopPropagation(){}});assert.equal(f.changes.length,1);assert.deepEqual(f.changes[0].box.contentOffset,{xPx:8,yPx:4});assert.equal(f.commits.length,0);assert.equal(f.starts.length,0);
 const edgeButtons=[];const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='button'&&/^Drag (top|right|bottom|left) border/.test(n.props['aria-label']??''))edgeButtons.push(n);for(const child of [n.props?.children].flat(Infinity))walk(child);};walk(f.h.tree);assert.equal(edgeButtons.length,4);
 assert.deepEqual(edgeButtons.map(button=>button.props['aria-label'].split(' ')[1]),['top','right','bottom','left']);for(const button of edgeButtons){assert.match(button.props.className,/boxMoveSurface boxMove(top|right|bottom|left)/);assert.equal(button.props.style,undefined,'Border dimensions belong to the narrow-edge stylesheet, not a full-frame inline surface.');}
});

test('0331 disabled and composing keyboard input never begins a move or changes saved geometry',()=>{
 const f=fixture();const move=f.handle('move');move.props.onKeyDown({key:'ArrowRight',nativeEvent:{isComposing:true},preventDefault(){},stopPropagation(){}});assert.equal(f.changes.length,0);
 f.props.disabled=true;f.render();const disabled=f.handle('move');disabled.props.onPointerDown(f.event({x:10,y:10}));disabled.props.onPointerMove(f.event({x:80,y:90}));disabled.props.onPointerUp(f.event({x:80,y:90}));disabled.props.onKeyDown({key:'ArrowDown',preventDefault(){},stopPropagation(){}});assert.equal(f.starts.length,0);assert.equal(f.commits.length,0);assert.equal(f.changes.length,0);
});
