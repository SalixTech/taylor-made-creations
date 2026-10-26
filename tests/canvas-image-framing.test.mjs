import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
const pure = harness();
const { resizeImageFrame, moveImageCrop } = pure.load('src/owner/image-interactions.ts');
test('corner resizing bounds freeform and preserves locked ratio at bounds', () => {
  const g={width:400,height:200,parentWidth:800};
  assert.deepEqual(resizeImageFrame(g,50,90,'se',false),{imageWidthPercent:62.5,imageHeightPx:290});
  assert.deepEqual(resizeImageFrame(g,50,10,'se',true),{imageWidthPercent:62.5,imageHeightPx:250});
  assert.deepEqual(resizeImageFrame(g,-50,-10,'nw',true),{imageWidthPercent:62.5,imageHeightPx:250});
  const max=resizeImageFrame(g,10000,10000,'se',true); assert.equal(max.imageWidthPercent,100);assert.equal(max.imageHeightPx,400);
  const min=resizeImageFrame(g,-10000,-10000,'se',true);assert.equal(min.imageHeightPx,20);assert.equal(min.imageWidthPercent,5);
  assert.deepEqual(moveImageCrop({},10000,-10000,g),{imageFit:'cover',imagePositionX:0,imagePositionY:100});
});
function setup(value={}) {
  const h=harness(), {OwnerCanvasImageTools}=h.load('src/owner/OwnerCanvasImageTools.tsx');
  let rect={left:10,top:60,width:400,height:200};
  const image={style:{cssText:'original-image'}}, frame={style:{cssText:'original-frame'},querySelector:()=>image,getBoundingClientRect:()=>rect,parentElement:{getBoundingClientRect:()=>({width:800})}};
  const canvas={scrollTop:0,scrollLeft:0,querySelectorAll:()=>[{dataset:{ownerEdit:'home-image'},querySelector:()=>frame}],getBoundingClientRect:()=>({left:0,top:0,width:800})};
  const changes=[], props={canvasRef:{current:canvas},target:'home-image',value,disabled:false,onChange(v){changes.push(v);props.value=v;}};
  const render=()=>h.render(OwnerCanvasImageTools,props); render();render();
  const button={focus(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
  const event=(extra={})=>({pointerId:1,button:0,clientX:0,clientY:0,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
  const corner=()=>h.find(n=>n.props?.['data-corner']==='se');
  return {h,props,changes,frame,image,render,corner,event,setRect(value){rect=value;}};
}
test('actual pointer handlers preview locally, commit once, and undo without touching image sources',()=>{
  const t=setup({textColor:'#123456'});t.corner().props.onPointerDown(t.event());t.corner().props.onPointerMove(t.event({clientX:50,clientY:0}));
  assert.equal(t.changes.length,0);assert.equal(t.frame.style.width,'62.5%');assert.equal(t.frame.style.height,'250px');
  t.corner().props.onPointerUp(t.event());assert.equal(t.changes.length,1);assert.deepEqual(t.props.value,{textColor:'#123456',imageWidthPercent:62.5,imageHeightPx:250});assert.equal(t.frame.style.cssText,'original-frame');
  t.render();t.h.find(n=>n.type==='button'&&content(n)==='Undo framing').props.onClick();assert.deepEqual(t.props.value,{textColor:'#123456'});t.h.unmount();
});
test('pointercancel, lost capture, Escape and unmount restore exact prior style and never commit',()=>{
  for(const cancel of ['onPointerCancel','onLostPointerCapture','escape','unmount']) {
    const t=setup();t.corner().props.onPointerDown(t.event());t.corner().props.onPointerMove(t.event({clientX:-60,clientY:30}));
    if(cancel==='escape') t.corner().props.onKeyDown(t.event({key:'Escape'})); else if(cancel==='unmount') t.h.unmount(); else t.corner().props[cancel](t.event());
    assert.equal(t.changes.length,0);assert.equal(t.frame.style.cssText,'original-frame');assert.equal(t.image.style.cssText,'original-image');t.h.unmount();
  }
});
test('freeform toggle, foreign pointers, crop drag and keyboard controls',()=>{
  const t=setup({imageAspectLocked:false});t.corner().props.onPointerDown(t.event());t.corner().props.onPointerMove(t.event({pointerId:9,clientX:50}));assert.equal(t.frame.style.width,undefined);
  t.corner().props.onPointerMove(t.event({clientX:50,clientY:30}));t.corner().props.onPointerUp(t.event());assert.equal(t.props.value.imageHeightPx,230);
  t.render();t.h.find(n=>n.type==='button'&&content(n)==='Crop position').props.onClick();t.render();const crop=t.h.find(n=>n.props?.className==='cropHandle');crop.props.onPointerDown(t.event());crop.props.onPointerMove(t.event({clientX:40,clientY:20}));crop.props.onPointerUp(t.event());assert.equal(t.props.value.imageFit,'cover');assert.equal(t.props.value.imagePositionX,40);assert.equal(t.props.value.imagePositionY,40);
  t.render();t.corner().props.onKeyDown(t.event({key:'ArrowRight'}));assert.equal(t.props.value.imageWidthPercent,50.24999999999999);t.h.unmount();
});
test('ratio preference and crop persist through validation and public rendering tokens',()=>{
  const {createDefaultOwnerContent}=pure.load('src/owner/defaults.ts'), model=pure.load('src/owner/model.ts');
  const draft=createDefaultOwnerContent(), original=draft.home.image.src;
  const appearance={imageAspectLocked:false,imageWidthPercent:62.5,imageHeightPx:250,imagePositionX:25,imagePositionY:60,imageFit:'cover'};
  draft.contentOverrides={styles:{'home.image':appearance}};assert.equal(model.validateOwnerContent(draft).valid,true);
  const output=model.createPublicContentSnapshot(JSON.parse(JSON.stringify(draft)));assert.deepEqual(output.contentOverrides.styles['home.image'],appearance);assert.equal(output.home.image.src,original);
  const {getImageFrameStyle,getImageAppearanceStyle}=pure.load('src/owner/appearance.ts');assert.equal(getImageFrameStyle(appearance).width,'62.5%');assert.equal(getImageAppearanceStyle(appearance).objectPosition,'25% 60%');
  draft.contentOverrides.styles['home.image'].imageAspectLocked='false';assert.equal(model.validateOwnerContent(draft).valid,false);
});
test('canvas hover never replaces configured header background',()=>{
  const css=fs.readFileSync(new URL('../src/owner/OwnerVisualBuilder.module.css',import.meta.url),'utf8');assert.match(css,/outline-color:#80001480;/);assert.doesNotMatch(css,/background-color:#80001403/);
});
test('builder wires selected hero and template image framing to the same draft, never uploads',()=>{
  const h=harness(); h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload',OwnerUploadProvider:'OwnerUploadProvider'};
  const {OwnerVisualBuilder}=h.load('src/owner/OwnerVisualBuilder.tsx');let value=h.load('src/owner/defaults.ts').createDefaultOwnerContent();const original=value.home.image.src;
  const props={content:value,page:value.pages[0],browsing:false,onBrowsingChange(v){props.browsing=v;},onEdit(change){value=structuredClone(value);change(value);props.content=value;props.page=value.pages[0];},onPageChange(){},onManagePages(){},onAddPage(){},onPrices(){},onRemove(){},liveShopVisibility:false,canUpdateLiveShop:false,onUpdateLiveShop(){}};
  const render=()=>h.render(OwnerVisualBuilder,props);render();
  h.find(n=>n.type==='button'&&content(n)==='Main photo').props.onClick({});render();
  const tools=h.find(n=>typeof n.type==='function'&&n.type.name==='OwnerCanvasImageTools');assert.equal(tools.props.target,'home-image');tools.props.onChange({imageWidthPercent:70,imageHeightPx:300,imageAspectLocked:false});render();
  assert.deepEqual(value.contentOverrides.styles['home.image'],{imageWidthPercent:70,imageHeightPx:300,imageAspectLocked:false});assert.equal(value.home.image.src,original);
  h.find(n=>n.type==='button'&&content(n)==='Exit edit mode').props.onClick();render();assert.equal(h.find(n=>typeof n.type==='function'&&n.type.name==='OwnerCanvasImageTools'),undefined);h.unmount();
});
