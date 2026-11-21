// Deterministic source, hook/ref and transform tests. Not a browser/pixel claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const load = sourceLoader(), g = load('src/owner/box-geometry.ts'), targets = load('src/owner/box-targets.ts');
const seed = () => ({...g.initialElementBox({width:400,height:200,parentWidth:800}),aspectLocked:false,rotationDeg:23});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function measuredFixture(component = 'OwnerCanvasBoxTools', value = {}) {
  const h=harness(), changes=[], observers=[];
  h.globals.ResizeObserver=class { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} };
  const parent={clientWidth:801,offsetWidth:801,offsetHeight:300,parentElement:null,css:{display:'block',width:'800.875px',height:'300px'},getBoundingClientRect:()=>({left:20,top:0,width:800.875,height:300})};
  const first={dataset:{ownerEdit:'template-text:home.stripTitle'},offsetWidth:581,offsetHeight:47,parentElement:parent,css:{display:'inline'},getBoundingClientRect:()=>({left:20,top:100,width:581.425,height:46.875})};
  const second={...first,dataset:{ownerEdit:'template-text:home.stripTitle'},getBoundingClientRect:()=>({left:20,top:240,width:581.425,height:46.875})};
  const canvas={clientWidth:1000,offsetWidth:1000,offsetHeight:1000,scrollLeft:0,scrollTop:0,parentElement:null,css:{display:'block',width:'1000px',height:'1000px'},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000}),querySelectorAll:()=>[first,second]};
  h.window.getComputedStyle=node=>({boxSizing:'border-box',transform:'none',zoom:'1',paddingLeft:'0px',paddingRight:'0px',...node.css});
  const C=h.load('src/owner/OwnerCanvasBoxTools.tsx')[component],props={canvasRef:{current:canvas},target:first.dataset.ownerEdit,occurrence:0,value,disabled:false,onChange(next){changes.push(next);props.value=next;}};
  const render=()=>h.render(C,props);render();render();
  return {h,props,changes,render,canvas,parent,first,second,observers};
}
test('SS17 fractional inline Commission heading has eight handles and tilt without inventing a local transform',()=>{
  const t=measuredFixture();assert.equal(t.h.all(n=>n.props['data-handle']).length,8);assert.ok(t.h.find(n=>n.props['aria-label']?.startsWith('Rotate content box')));assert.equal(t.changes.length,0);
  const first=t.h.find(n=>n.props['data-handle']==='nw').props.style.top;t.props.occurrence=1;t.render();t.render();near(t.h.find(n=>n.props['data-handle']==='nw').props.style.top-first,140);assert.equal(t.changes.length,0);t.h.unmount();
});
test('SS17 manual size/tilt is available before any drag; opening/reopening/units/unchanged field never creates geometry',()=>{
  const t=measuredFixture('OwnerBoxFields');assert.ok(t.h.find(n=>n.props.label==='Design width'));const units=()=>t.h.find(n=>n.props.label==='Size units');
  for(let i=0;i<20;i++){units().props.onChange(i%2?'px':'in');t.render();}assert.equal(t.changes.length,0);
  t.h.find(n=>n.props.label==='Box rotation').props.onChange(0);assert.equal(t.changes.length,0);
  t.h.find(n=>n.props.label==='Box rotation').props.onChange(-17.5);assert.equal(t.changes.length,1);assert.equal(t.props.value.box.rotationDeg,-17.5);assert.equal(g.validElementBox(t.props.value.box),true);t.h.unmount();
  const reopened=measuredFixture('OwnerBoxFields',t.props.value);assert.equal(reopened.changes.length,0);assert.deepEqual(reopened.props.value,t.props.value);reopened.h.unmount();
});
test('manual CSS PX×PX and IN×IN preserve canonical precision, aspect ratio, strict ranges and legacy schema',()=>{
  const box={...seed(),widthPercent:39.1234567890123,xPercent:12.987654321,heightPx:233.123456789};const before=JSON.stringify(box);
  for(let i=0;i<100;i++){const size=g.elementBoxDimensions(box,i%2?'px':'in');assert.equal(g.resizeElementBoxInUnits(box,size.width,size.height,i%2?'px':'in'),box);}assert.equal(JSON.stringify(box),before);
  const inSize=g.elementBoxDimensions(seed(),'in');near(inSize.width,400/96);near(inSize.height,200/96);
  const changed=g.resizeElementBoxInUnits(seed(),5,3,'in');assert.equal(changed.widthPercent,60);assert.equal(changed.heightPx,288);assert.equal(changed.rotationDeg,23);
  const locked=g.resizeElementBoxInUnits({...seed(),aspectLocked:true},5,3,'in','width');assert.equal(locked.heightPx,240);
  for(const bad of [NaN,Infinity,-Infinity,0,-1,'20'])assert.equal(g.resizeElementBoxInUnits(box,bad,1,'in'),box);
  assert.equal(g.resizeElementBoxInUnits(box,1,1,'cm'),box);assert.equal(g.validElementBox(g.resizeElementBoxInUnits(seed(),1e9,1e9,'px')),true);
  assert.equal(Object.keys(changed).some(key=>/unit|inch/i.test(key)),false);
});
test('manual fields use the original design size at mobile width; unit changes and disabled callbacks do not write',()=>{
  const t=measuredFixture('OwnerBoxFields',{box:seed(),textColor:'#123456'});const field=label=>t.h.find(n=>n.props.label===label);
  t.parent.clientWidth=390;t.render();assert.equal(field('Design width').props.value,400);assert.equal(field('Design height').props.value,200);
  field('Size units').props.onChange('in');t.render();near(field('Design width').props.value,4.1667);assert.equal(t.changes.length,0);
  field('Design width').props.onChange(5);t.render();assert.equal(t.props.value.box.widthPercent,60);assert.equal(t.props.value.box.heightPx,200);assert.equal(t.props.value.textColor,'#123456');
  t.props.disabled=true;t.render();const count=t.changes.length;field('Box rotation').props.onChange(45);field('Design height').props.onChange(2);assert.equal(t.changes.length,count);t.h.unmount();
});
function numberFixture() {
  const h=harness(),C=h.load('src/owner/OwnerDesignInputs.tsx').OwnerNumberInput,changes=[],props={label:'Design width',value:400,min:40,max:800,commitMode:'blur',onChange(value){changes.push(value);props.value=value;}};
  const render=()=>h.render(C,props),input=()=>h.find(n=>n.type==='input');render();const event=(value,extra={})=>({target:{value,validity:{}},currentTarget:{value,validity:{}},nativeEvent:{},preventDefault(){},stopPropagation(){},...extra});return{h,props,changes,render,input,event};
}
test('geometry number input keeps partial/IME typing local, commits Enter/blur once, cancels Escape, rejects nonfinite values',()=>{
  const t=numberFixture();t.input().props.onFocus();t.render();t.input().props.onChange(t.event('480'));t.render();assert.equal(t.changes.length,0);t.input().props.onKeyDown(t.event('480',{key:'Enter'}));t.render();assert.deepEqual(t.changes,[480]);t.input().props.onBlur(t.event('480'));assert.equal(t.changes.length,1);
  t.input().props.onFocus();t.render();t.input().props.onChange(t.event('550'));t.render();let stopped=0;t.input().props.onKeyDown(t.event('550',{key:'Escape',stopPropagation(){stopped++;}}));t.render();t.input().props.onBlur(t.event('550'));assert.equal(stopped,1);assert.deepEqual(t.changes,[480]);
  t.input().props.onFocus();t.input().props.onCompositionStart();t.input().props.onChange(t.event('600',{nativeEvent:{isComposing:true}}));t.render();t.input().props.onKeyDown(t.event('600',{key:'Enter',nativeEvent:{isComposing:true}}));assert.equal(t.changes.length,1);t.input().props.onCompositionEnd(t.event('600'));t.render();t.input().props.onBlur(t.event('600'));t.render();assert.deepEqual(t.changes,[480,600]);
  for(const invalid of ['1e309','NaN','Infinity','-1','900','-']){t.input().props.onFocus();t.input().props.onChange(t.event(invalid));t.render();t.input().props.onBlur(t.event(invalid));t.render();}assert.deepEqual(t.changes,[480,600]);t.h.unmount();
});
test('registry covers all twelve rendered section types including Canvas Space and functional commission status and rejects arbitrary DOM/non-rendered semantic fields',()=>{
  const h=harness(),defaults=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),create=h.load('src/owner/OwnerBlocksEditor.tsx').createBlock,page=defaults.pages[0];page.blocks=targets.BOX_BLOCK_TYPES.map(type=>({...create(type),appearance:{box:seed()}}));
  assert.equal(page.blocks.length,12);assert.ok(page.blocks.some(block=>block.type==='commission-status'));for(const block of page.blocks)assert.equal(targets.supportsBoxTarget(`block:${block.id}`,page),true);
  const C=h.load('src/components/SiteContent.tsx').ContentBlocks;h.currentContext={mode:'editor',editable:true};h.render(C,{blocks:page.blocks,content:defaults});assert.equal(h.all(n=>n.type?.name==='GeometryBox').length,12);h.unmount();
  for(const target of ['site','status','contact','prices','gallery:one','premade:one','template-image:site.logo','template-text:contact.namePlaceholder','template-text:constructor','core-text:site.brand','block:unknown'])assert.equal(targets.supportsBoxTarget(target,page),false,target);
  for(const target of ['page-title','home-image','template-text:home.stripTitle','template-link:home.pricesCard','template-image:examples.heads','core-text:home.title'])assert.equal(targets.supportsBoxTarget(target,page),true,target);
});
function builderFixture() {
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload',OwnerUploadProvider:'OwnerUploadProvider'};const value=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),C=h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder,calls=[];
  const props={content:value,page:value.pages[0],browsing:false,onBrowsingChange(){},onEdit(){calls.push('edit')},onPageChange(){},onManagePages(){},onAddPage(){},onPrices(){},onRemove(){},liveShopVisibility:false,canUpdateLiveShop:false,onUpdateLiveShop(){calls.push('live')},onSaveDraft(){calls.push('draft')},onSave(){calls.push('save')},onPopOut(){calls.push('popout')},draftSaveStatus:'Recovery copy saved in this browser. Cloud draft not yet saved.'};
  const render=()=>h.render(C,props),button=label=>h.find(n=>n.type==='button'&&content(n)===label);render();return {h,props,calls,render,button};
}
test('single toolbar Save delegates existing save choices and preview callback; no independent publish or selection save',()=>{
  const t=builderFixture();assert.match(content(t.h.tree),/Recovery copy saved in this browser/);assert.equal(t.button('Save as Draft'),undefined);t.button('Save').props.onClick();t.button('Popout Preview ↗').props.onClick();assert.deepEqual(t.calls,['save','popout']);
  t.props.saveBusy=true;t.render();t.button('Save').props.onClick();assert.equal(t.button('Save as Draft'),undefined);assert.equal(t.calls.length,2);
  t.props.uploadBusy=true;t.render();t.button('Popout Preview ↗').props.onClick();assert.equal(t.calls.length,2);t.h.unmount();
  const source=readFileSync(new URL('../src/owner/OwnerVisualBuilder.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/publishOwner|saveOwner|localStorage|BroadcastChannel|window\.open/);
});
test('compact visual grips keep existing pointer target size and fields reuse the favorite custom dropdown',()=>{
  const css=readFileSync(new URL('../src/owner/OwnerVisualBuilder.module.css',import.meta.url),'utf8');assert.match(css,/\.boxTools \.boxHandle,\.boxTools \.boxRotateHandle \{ width:28px; height:28px/);assert.match(css,/\.boxHandle::before \{ content:""; width:12px; height:12px/);
  const source=readFileSync(new URL('../src/owner/OwnerCanvasBoxTools.tsx',import.meta.url),'utf8');assert.match(source,/<OwnerSelect label="Size units"/);assert.doesNotMatch(source,/<select[ >]/);
});
function affinePhotoFixture() {
 const h=harness(),changes=[],captures=new Set(),observers=[],mutations=[],layout={angle:29,zoom:.9};
 const identity=g.identityAffine(),translate=(x,y)=>({...identity,e:x,f:y}),scale=(x,y)=>({...identity,a:x,d:y}),mul=g.multiplyAffine,point=g.transformPoint;
 const rect=(matrix,width,height)=>{const points=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>point(matrix,{x,y}));return{left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};};
 const css=m=>`matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
 const canvas={parentElement:null,clientWidth:1000,offsetWidth:1000,offsetHeight:1000,scrollLeft:0,scrollTop:0,css:()=>({zoom:String(layout.zoom)}),world:()=>mul(translate(15,25),scale(layout.zoom,layout.zoom)),getBoundingClientRect(){return rect(this.world(),1000,1000)},querySelectorAll:()=>[node]};
 const parent={parentElement:canvas,clientWidth:800,offsetWidth:800,offsetHeight:600,css:()=>({transform:css(mul(g.rotationAffine(layout.angle),scale(1.3,.6)))}),world(){return mul(canvas.world(),mul(translate(40,60),mul(g.rotationAffine(layout.angle),scale(1.3,.6))))},getBoundingClientRect(){return rect(this.world(),800,600)}};
 const image={style:{cssText:'original-image'}},frame={parentElement:parent,offsetWidth:400,offsetHeight:200,style:{cssText:'original-frame'},querySelector:()=>image,css:()=>({}),world(){return mul(parent.world(),translate(20,70))},getBoundingClientRect(){return rect(this.world(),400,200)}};
 const node={dataset:{ownerEdit:'home-image'},querySelector:()=>frame};
 h.window.getComputedStyle=node=>({display:'block',transform:'none',zoom:'1',...node.css?.()});h.globals.ResizeObserver=class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){}};h.globals.MutationObserver=class{constructor(callback){this.callback=callback;mutations.push(this)}observe(){}disconnect(){}};
 const C=h.load('src/owner/OwnerCanvasImageTools.tsx').OwnerCanvasImageTools,props={canvasRef:{current:canvas},target:'home-image',value:{imageAspectLocked:false},disabled:false,onChange(next){changes.push(next);props.value=next}},render=()=>h.render(C,props);render();render();
 const button={focus(){},setPointerCapture(id){captures.add(id)},hasPointerCapture(id){return captures.has(id)},releasePointerCapture(id){captures.delete(id)}},event=(point={x:0,y:0},extra={})=>({pointerId:1,button:0,isPrimary:true,clientX:point.x,clientY:point.y,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
 const corner=()=>h.find(n=>n.props['data-corner']==='se');return{h,changes,captures,layout,props,render,parent,canvas,frame,image,event,corner,mutations,observers};
}
test('photo framing inside nested rotated/nonuniform/zoomed whole boxes uses inverse-affine pointer deltas, not screen rectangles',()=>{
 const t=affinePhotoFixture(),start=g.transformPoint(t.parent.world(),{x:420,y:270}),end=g.transformPoint(t.parent.world(),{x:460,y:300});
 const actual=g.transformPoint(g.inverseAffine(t.canvas.world()),start);near(t.corner().props.style.left+12,actual.x);near(t.corner().props.style.top+12,actual.y);
 t.corner().props.onPointerDown(t.event(start));t.corner().props.onPointerMove(t.event(end));assert.equal(t.changes.length,0);near(Number.parseFloat(t.frame.style.width),60);assert.ok(t.frame.style.width.endsWith('%'));near(Number.parseFloat(t.frame.style.height),230);assert.ok(t.frame.style.height.endsWith('px'));
 t.observers.forEach(observer=>observer.callback([]));t.corner().props.onPointerUp(t.event(end));assert.equal(t.changes.length,1);near(t.props.value.imageWidthPercent,60);near(t.props.value.imageHeightPx,230);assert.equal(t.captures.size,0);assert.equal(t.frame.style.cssText,'original-frame');t.h.unmount();
});
test('photo no-op, foreign pointer, IME, scroll/transform cancellation, disable and reopen never leak a gesture or dirty draft',()=>{
 for(const ending of ['click','jitter','foreign','Escape','scroll','mutation','disabled','unmount']){
  const t=affinePhotoFixture(),start=g.transformPoint(t.parent.world(),{x:420,y:270}),end=g.transformPoint(t.parent.world(),{x:440,y:290});t.corner().props.onPointerDown(t.event(start));
  if(ending==='click')t.corner().props.onPointerUp(t.event(start));
  else if(ending==='jitter'){t.corner().props.onPointerMove(t.event({x:start.x+.2,y:start.y+.2}));t.corner().props.onPointerUp(t.event(start));}
  else {t.corner().props.onPointerMove(t.event(end));if(ending==='foreign'){t.corner().props.onPointerCancel(t.event(end,{pointerId:99}));assert.equal(t.captures.size,1);t.corner().props.onLostPointerCapture(t.event(end));}else if(ending==='Escape')t.corner().props.onKeyDown(t.event(end,{key:'Escape'}));else if(ending==='mutation'){t.layout.angle=40;t.mutations[0].callback()}else if(ending==='disabled'){t.props.disabled=true;t.render()}else if(ending==='unmount')t.h.unmount();else t.h.window.dispatchEvent(new Event(ending));}
  assert.equal(t.changes.length,0,ending);assert.equal(t.captures.size,0,ending);assert.equal(t.frame.style.cssText,'original-frame');t.h.unmount();
 }
 const t=affinePhotoFixture();t.corner().props.onKeyDown(t.event(undefined,{key:'ArrowRight',nativeEvent:{isComposing:true}}));assert.equal(t.changes.length,0);t.h.unmount();
});
test('initial ratio preference stays local and can be shared by canvas/manual fields before the first committed edit',()=>{
 const t=measuredFixture('OwnerBoxFields');let preference=true;t.props.initialAspectLocked=preference;t.props.onInitialAspectLockChange=next=>{preference=next;t.props.initialAspectLocked=next;};t.render();
 t.h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});t.render();assert.equal(preference,false);assert.equal(t.changes.length,0);
 const before=t.h.find(n=>n.props.label==='Design height').props.value;t.h.find(n=>n.props.label==='Design width').props.onChange(600);assert.equal(t.props.value.box.aspectLocked,false);assert.equal(t.props.value.box.heightPx,before);t.h.unmount();
 const canvas=measuredFixture();canvas.props.initialAspectLocked=false;canvas.props.onInitialAspectLockChange=value=>{canvas.props.initialAspectLocked=value;};canvas.render();const ratio=()=>canvas.h.find(n=>n.type==='button'&&content(n).startsWith('Lock ratio:'));assert.equal(ratio().props['aria-pressed'],false);ratio().props.onClick();canvas.render();assert.equal(ratio().props['aria-pressed'],true);assert.equal(canvas.changes.length,0);canvas.h.unmount();
});
test('content rerender removes stale unboxed measurements and rebinds photo refs after image replacement',()=>{
 const fields=measuredFixture('OwnerBoxFields');assert.ok(fields.h.find(n=>n.props.label==='Design width'));fields.canvas.querySelectorAll=()=>[];fields.props.renderVersion={};fields.render();fields.render();assert.equal(fields.h.find(n=>n.props.label==='Design width'),undefined);assert.equal(fields.changes.length,0);fields.h.unmount();
 const t=affinePhotoFixture(),replacement={...t.frame,style:{cssText:'replacement-frame'},querySelector:()=>({style:{cssText:'replacement-image'}})};t.canvas.querySelectorAll=()=>[{dataset:{ownerEdit:'home-image'},querySelector:()=>replacement}];t.props.renderVersion={};t.render();t.render();const start=g.transformPoint(t.parent.world(),{x:420,y:270}),end=g.transformPoint(t.parent.world(),{x:440,y:290});t.corner().props.onPointerDown(t.event(start));t.corner().props.onPointerMove(t.event(end));assert.equal(t.frame.style.width,undefined);assert.ok(replacement.style.width);t.corner().props.onPointerCancel(t.event(end));assert.equal(replacement.style.cssText,'replacement-frame');assert.equal(t.changes.length,0);t.h.unmount();
});

test('Escape originating on box controls is delegated instead of closing the inspector before cancellation',()=>{
 const t=builderFixture();t.button('Design').props.onClick({});t.render();
 const canvas=t.h.find(n=>n.props.onClickCapture&&n.props.onKeyDownCapture),target=canvas.props.ref.current;
 target.closest=selector=>selector==='[data-owner-canvas-controls]'?target:null;
 let prevented=0,stopped=0;
 canvas.props.onKeyDownCapture({target,key:'Escape',nativeEvent:{},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 t.render();assert.equal(prevented,0);assert.equal(stopped,0);assert.ok(t.h.find(n=>n.props.className==='panelHeader'));t.h.unmount();
});
