// Actual source components, callback refs and observer lifecycle with a modeled
// CSS layout. No browser engine is available: these traces are NOT pixel QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,nodes,content} from './owner-ui-harness.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),g=load('src/owner/box-geometry.ts'),model=load('src/owner/model.ts');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} !== ${b}`);
function fixture({component='OwnerCanvasBoxTools',width=531.421875,height=37.328125,parentWidth=1171.25,x=0,display='inline',parentDisplay='block',zoom=1,angle=0}={}){
 const h=harness(),changes=[],probes=[],observers=[];
 h.globals.ResizeObserver=class{constructor(callback){this.callback=callback;this.targets=[];observers.push(this);}observe(node){this.targets.push(node);}disconnect(){this.targets=[];}};
 const matrix=g.multiplyAffine(g.rotationAffine(angle),{a:zoom,b:0,c:0,d:zoom,e:20,f:30});
 const rect=(x,y,w,hh)=>{const ps=[{x,y},{x:x+w,y},{x,y:y+hh},{x:x+w,y:y+hh}].map(p=>g.transformPoint(matrix,p));return{left:Math.min(...ps.map(p=>p.x)),top:Math.min(...ps.map(p=>p.y)),width:Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x)),height:Math.max(...ps.map(p=>p.y))-Math.min(...ps.map(p=>p.y))};};
 const css=(extra={})=>({display:'block',width:'auto',height:'auto',boxSizing:'border-box',transform:'none',zoom:'1',paddingLeft:'0px',paddingRight:'0px',marginTop:'0px',marginBottom:'0px',marginLeft:'0px',marginRight:'0px',...extra});
 const canvas={parentElement:null,offsetWidth:parentWidth,offsetHeight:1000,clientWidth:parentWidth,clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,css:css({width:`${parentWidth}px`,height:'1000px',transform:`matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},0,0)`}),getBoundingClientRect:()=>rect(0,0,parentWidth,1000),querySelectorAll:()=>[node]};
 const parent={parentElement:canvas,offsetWidth:Math.round(parentWidth),clientWidth:Math.round(parentWidth),offsetHeight:200,css:css({display:parentDisplay,width:`${parentWidth}px`,height:'200px'}),getBoundingClientRect:()=>rect(0,0,parentWidth,200),appendChild(probe){probe.parentElement=this;probes.push(probe);}};
 let reflow=false;
 const node={dataset:{ownerEdit:'template-text:home.stripTitle'},parentElement:parent,offsetWidth:Math.round(width),offsetHeight:Math.round(height),css:css({display,width:display==='inline'?'auto':`${width}px`,height:display==='inline'?'auto':`${height}px`}),getBoundingClientRect:()=>rect(x,60,width,height),getClientRects:()=>[rect(x,60,width,height)],cloneNode(){const clone={parentElement:null,style:{setProperty(name,value){this[name]=value;}},css:css({display,width:display==='inline'?'auto':`${width}px`,height:display==='inline'?'auto':`${height}px`}),removeAttribute(){},querySelectorAll:()=>[],getBoundingClientRect:()=>rect(0,0,width,reflow?height*2:height),getClientRects:()=>reflow?[rect(0,0,width,height),rect(0,height,width,height)]:[rect(0,0,width,height)]};return clone;}};
 h.document.createElement=()=>({style:{},setAttribute(){},appendChild(child){child.parentElement=this;this.child=child;},remove(){this.removed=true;},get css(){return css({width:this.style.width,height:this.style.minHeight});}});
 h.window.getComputedStyle=node=>node.css??css();
 const C=h.load('src/owner/OwnerCanvasBoxTools.tsx')[component],props={canvasRef:{current:canvas},target:node.dataset.ownerEdit,value:{},disabled:false,onChange(value){changes.push(value);props.value=value;}};
 const render=()=>h.render(C,props);render();render();const key=(kind,key)=>h.find(n=>kind==='rotate'?n.props['aria-label']?.startsWith('Rotate content box'):n.props['data-handle']===kind).props.onKeyDown({key,preventDefault(){},stopPropagation(){},nativeEvent:{}});
 return{h,props,changes,probes,node,parent,canvas,render,key,width,height,parentWidth,observers,setReflow:value=>reflow=value};
}
function renderFlow(box,{parentWidth=box.referenceParentPx,sourceHeight=box.baseHeightPx}={}){
 const h=harness(),observations=[];
 h.globals.ResizeObserver=class{constructor(fn){this.fn=fn;observations.push(this);}observe(){}disconnect(){}};
 const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 const dom={frame:{},contents:{}};
 h.window.getComputedStyle=node=>({display:'block',boxSizing:'border-box',width:`${node.width}px`,height:`${node.height}px`,transform:'none'});
 const props={box,inline:true,editable:true,target:'template-link:home.commissionsButton',children:'Text'};
 const render=()=>{h.cursor=0;h.pending=[];h.tree=C(props);for(const n of nodes(h.tree)){if(typeof n.props.ref!=='function')continue;const key=n.props['data-owner-geometry']?'frame':'contents',node=dom[key];node.width=key==='frame'?box.widthPercent/100*parentWidth:box.baseWidthPx+1/64;node.height=key==='frame'?n.props.style.minHeight:sourceHeight;node.clientWidth=Math.round(node.width);node.offsetWidth=Math.round(node.width);node.offsetHeight=Math.round(node.height);n.props.ref(node);}h.pending.forEach(fn=>fn());};render();render();
 return{h,dom,props,render,observations,slot:()=>h.tree,frame:()=>h.find(n=>n.props['data-owner-geometry']),source:()=>h.find(n=>n.props.className?.includes('contents'))};
}
test('SS23 natural fractional heading → first rotation preserves baseline, one line and dimensions, not integer offsetWidth',()=>{
 for(const zoom of [.9,1])for(const angle of [0,17,-31]){
  const t=fixture({zoom,angle});t.key('rotate','ArrowRight');assert.equal(t.changes.length,1);const box=t.props.value.box;near(box.baseWidthPx,t.width);near(box.baseHeightPx,t.height);assert.equal(box.rotationDeg,1);assert.ok(box.flow);assert.equal(t.probes.length,0);
  const r=renderFlow(box);near(r.dom.frame.width,t.width);near(r.frame().props.style.minHeight,t.height);assert.equal(r.source().props.style?.width,undefined);assert.equal(r.frame().props.style.left,'0%');assert.equal(r.frame().props.style.transform,'rotate(1deg)');assert.equal(r.source().props.style?.transform,undefined);
  if(process.env.TMC_GEOMETRY_TRACE)console.log('NOTES3_FIRST_ROTATION_TRACE',JSON.stringify({engine:'modeled CSS/source-hook, not browser',zoom,ancestorAngle:angle,naturalWidth:t.width,roundedOffset:t.node.offsetWidth,storedBaseline:box.baseWidthPx,sourceWidth:r.source().props.style?.width,frameWidth:r.dom.frame.width,rotation:box.rotationDeg}));
  r.h.unmount();t.h.unmount();
 }
});
test('SS24 first unlocked right CTA resize reserves its original flex slot and never double-counts preceding sibling',()=>{
 const t=fixture({width:196.25,height:46,parentWidth:1171.25,x:975,display:'inline-flex',parentDisplay:'flex'});t.props.initialAspectLocked=false;t.render();t.key('se','ArrowLeft');const box=t.props.value.box;assert.ok(box);assert.equal(box.aspectLocked,false);near(box.flow.xPercent,975/1171.25*100);assert.ok(box.widthPercent*box.referenceParentPx/100<t.width);
 const r=renderFlow(box),slot=r.slot().props.style;near(parseFloat(slot.width)/100*t.parentWidth,t.width);assert.equal(slot.marginLeft,0);assert.equal(r.frame().props.style.left,'0%');
 const leftNatural=600,gap=40,newRight=box.widthPercent/100*t.parentWidth;
 const flexLeft=(right,margin)=>{const shortage=Math.max(0,leftNatural+right+gap+margin-t.parentWidth);return leftNatural-shortage*leftNatural/(leftNatural+right);};
 near(flexLeft(t.width,parseFloat(slot.marginLeft)),leftNatural);const oldCollapsed=flexLeft(newRight,box.xPercent/100*t.parentWidth);assert.ok(oldCollapsed<300);
 if(process.env.TMC_GEOMETRY_TRACE)console.log('NOTES3_FIRST_RESIZE_TRACE',JSON.stringify({engine:'modeled CSS/source-hook, not browser',naturalRightX:975,oldDoubleCountedMargin:975,oldLeftShrunkTo:oldCollapsed,newSlotWidth:t.width,newFrameWidth:newRight,newMargin:slot.marginLeft,newLeftWidth:leftNatural}));
 const css=readFileSync(new URL('../src/components/GeometryBox.module.css',import.meta.url),'utf8');assert.match(css,/\.flowSlot\s*\{[^}]*flex:0 0 auto/);assert.match(css,/\.flowFrame\s*\{[^}]*max-width:none/);
 r.h.unmount();t.h.unmount();
});
test('inline reflow is allowed and 45-degree affine text remains editable',()=>{
 const t=fixture();t.setReflow(true);t.key('rotate','ArrowRight');t.render();assert.equal(t.changes.length,1);assert.equal(t.probes.length,0);t.h.unmount();
 const singular=fixture({angle:45});assert.ok(singular.h.find(n=>n.props['aria-label']?.startsWith('Rotate content box')));singular.key('rotate','ArrowRight');assert.equal(singular.changes.length,1);singular.h.unmount();
});
test('responsive source observer measurements converge; reopened/new boxes keep flow; reset remains natural; legacy boxes unchanged',()=>{
 const t=fixture();t.key('rotate','ArrowRight');const box=t.props.value.box;
 for(const parentWidth of [390,800,1171.25]){const r=renderFlow(box,{parentWidth});near(r.frame().props.style.minHeight,box.baseHeightPx*parentWidth/box.referenceParentPx);for(let i=0;i<10;i++){r.observations[0].fn([{target:r.dom.contents,contentRect:{width:box.baseWidthPx+1/64,height:box.baseHeightPx}}]);r.render();near(r.frame().props.style.minHeight,box.baseHeightPx*parentWidth/box.referenceParentPx);}r.props.box=undefined;r.render();assert.equal(r.h.tree.type,'Fragment');r.h.unmount();}
 const legacy={...box};delete legacy.flow;const h=harness(),C=h.load('src/components/GeometryBox.tsx').GeometryBox;h.render(C,{box:legacy,children:'Text'});assert.equal(h.tree.props.style.left,`${legacy.xPercent}%`);assert.equal(h.tree.props.children.props.style?.transform,undefined);h.unmount();t.h.unmount();
});
test('flow metadata is finite allowlisted data and round-trips public/draft schema without rewriting legacy boxes',()=>{
 const t=fixture();t.key('rotate','ArrowRight');const box=t.props.value.box,source=load('src/owner/defaults.ts').createDefaultOwnerContent();source.contentOverrides={styles:{'home.stripTitle':{box}}};assert.equal(model.validateOwnerContent(source).valid,true);const restored=model.publicContentToOwnerContent(JSON.parse(JSON.stringify(model.createPublicContentSnapshot(source))));assert.deepEqual(restored.contentOverrides.styles['home.stripTitle'].box,box);
 for(const flow of [null,{},'absolute',{...box.flow,style:'position:fixed'},{...box.flow,xPercent:Infinity},{...box.flow,marginTopPx:NaN}])assert.equal(g.validElementBox({...box,flow}),false);
 const old=g.initialElementBox({width:400,height:200,parentWidth:800});delete old.layout;assert.equal(Object.keys(old).length,8);assert.equal(g.validElementBox(old),true);assert.equal(g.validElementBox({...old,rotationDeg:12}),true);t.h.unmount();
});

test('typed tilt rejects live unsupported transforms too, including a saved box; read-only fields never mutate it',()=>{
 const t=fixture({component:'OwnerBoxFields'});t.props.value={box:g.initialElementBox({width:t.width,height:t.height,parentWidth:t.parentWidth})};t.parent.css.perspective='500px';t.render();t.render();t.h.find(n=>n.props.label==='Box rotation').props.onChange(17);t.render();assert.equal(t.changes.length,0);assert.match(content(t.h.tree),/Tilt is unavailable/);assert.equal(t.props.value.box.rotationDeg,undefined);t.h.unmount();
});

test('nondefault finite natural slot placement can be intentionally transformed',()=>{
 for(const extra of [{order:'1'},{alignSelf:'flex-end'},{cssFloat:'left'},{verticalAlign:'middle'},{writingMode:'vertical-rl'},{position:'relative',left:'12px'}]){
  const t=fixture();Object.assign(t.node.css,extra);t.observers[0].callback([]);t.render();assert.ok(t.h.find(n=>n.props['aria-label']?.startsWith('Rotate content box')));t.key('rotate','ArrowRight');assert.equal(t.changes.length,1);t.h.unmount();
 }
});
