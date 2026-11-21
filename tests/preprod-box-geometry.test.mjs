import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
import {harness,content} from './owner-ui-harness.mjs';
const load=sourceLoader(),geometry=load('src/owner/box-geometry.ts'),model=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts');
// The optional graph child slot is a sibling of the original contents frame.
const contentsFrame=node=>[node.props.children].flat(Infinity).find(child=>child?.props?.className?.split(' ').includes('contents'));
const box=()=>geometry.initialElementBox({width:400,height:200,parentWidth:800});
test('locked ratio resizes both axes, unlocked box permits independent dimensions, and signed movement can leave section bounds',()=>{
 const start=box();assert.equal(start.aspectLocked,true);const wide=geometry.resizeElementBox(start,75,200,'width');assert.equal(wide.widthPercent,75);assert.equal(wide.heightPx,300);
 const tall=geometry.resizeElementBox(start,50,400,'height');assert.equal(tall.widthPercent,100);assert.equal(tall.heightPx,400);
 const free=geometry.resizeElementBox({...start,aspectLocked:false},75,450);assert.equal(free.widthPercent,75);assert.equal(free.heightPx,450);
 assert.deepEqual(geometry.moveElementBox(start,1000,-50),{...start,xPercent:1000,yPx:-50});assert.equal(geometry.moveElementBox(start,5,999999).yPx,999999);
 assert.equal(geometry.validElementBox(wide),true);assert.equal(geometry.validElementBox(free),true);
});
test('geometry round trips draft/public model without accepting arbitrary or nonfinite CSS',()=>{
 const content=defaults.createDefaultOwnerContent();content.pages[0].blocks=[{id:'box',type:'text',heading:'Hello',body:'World',appearance:{box:box()}}];content.contentOverrides={styles:{'home.title':{box:box()}}};assert.equal(model.validateOwnerContent(content).valid,true);
 const published=model.createPublicContentSnapshot(content);assert.deepEqual(published.pages[0].blocks[0].appearance.box,box());assert.deepEqual(model.publicContentToOwnerContent(published).contentOverrides.styles['home.title'].box,box());published.pages[0].blocks[0].appearance.box.heightPx=555;assert.equal(content.pages[0].blocks[0].appearance.box.heightPx,200);
 for(const bad of [{...box(),widthPercent:0},{...box(),heightPx:Infinity},{...box(),widthPercent:NaN},{...box(),heightPx:0},{...box(),css:'position:fixed'},{...box(),aspectLocked:'true'},Object.create(box())]){assert.equal(geometry.validElementBox(bad),false);content.pages[0].blocks[0].appearance.box=bad;assert.equal(model.validateOwnerContent(content).valid,false);assert.throws(()=>model.createPublicContentSnapshot(content));}
});
test('frame reflows contents without glyph scaling and uses normal-flow responsive dimensions while preserving vertical content',()=>{
 const h=harness(),C=h.load('src/components/GeometryBox.tsx').GeometryBox;h.render(C,{box:box(),children:'Hello',editable:true,target:'block:box'});const frame=h.tree;assert.equal(frame.props['data-owner-edit'],'block:box');assert.equal(frame.props.style.width,'50%');assert.equal(frame.props.style.minHeight,200);assert.equal(frame.props.style.aspectRatio,undefined);assert.equal(contentsFrame(frame).props.style?.transform,undefined);assert.equal(contentsFrame(frame).props.style?.width,undefined);assert.equal(frame.props.style.position,undefined);h.unmount();
 const legacy=harness(),Legacy=legacy.load('src/components/GeometryBox.tsx').GeometryBox;legacy.render(Legacy,{children:'unchanged'});assert.equal(legacy.tree.type,'Fragment');assert.equal(content(legacy.tree),'unchanged');legacy.unmount();
});
test('typed inspector writes real bounded geometry and ratio changes are functional',()=>{
 const h=harness(),C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerBoxFields;let value={box:box()};const render=()=>h.render(C,{value,onChange:next=>value=next});render();const field=label=>h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label===label);field('Box width').props.onChange(75);assert.equal(value.box.heightPx,300);render();h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});render();field('Box height').props.onChange(500);assert.equal(value.box.widthPercent,75);assert.equal(value.box.heightPx,500);render();field('Horizontal box position').props.onChange(90);assert.equal(value.box.xPercent,90);h.unmount();
});
function canvasFixture(value={}) {
 const h=harness(),C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools;
 const node={dataset:{ownerEdit:'block:one'},getBoundingClientRect:()=>({left:10,top:50,width:400,height:200}),parentElement:{getBoundingClientRect:()=>({left:10,width:800})}};
 const canvas={scrollTop:0,scrollLeft:0,querySelectorAll:()=>[node],getBoundingClientRect:()=>({left:0,top:0,width:800})};
 const changes=[],props={canvasRef:{current:canvas},target:'block:one',value,disabled:false,onChange(next){changes.push(next);props.value=next;}};
 const render=()=>h.render(C,props);render();render();const button={focus(){},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}};
 const event=extra=>({pointerId:1,button:0,clientX:0,clientY:0,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
 return {h,props,changes,render,event,resize:()=>h.find(n=>n.props['data-handle']==='se'),move:()=>h.find(n=>n.props['aria-label']?.startsWith('Move content box.'))};
}
test('pointer box drag previews without dirtying draft and commits once; cancellation never mutates content',()=>{
 const t=canvasFixture({textColor:'#123456'});t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({clientX:200}));t.render();assert.equal(t.changes.length,0);assert.ok(t.h.find(n=>n.props.className==='boxGhost'));t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,1);assert.equal(t.props.value.box.widthPercent,75);assert.equal(t.props.value.box.heightPx,300);assert.equal(t.props.value.textColor,'#123456');t.h.unmount();
 for(const cancel of ['onPointerCancel','onLostPointerCapture','escape','blur','unmount']){const c=canvasFixture();c.resize().props.onPointerDown(c.event());c.resize().props.onPointerMove(c.event({clientX:50}));if(cancel==='escape')c.resize().props.onKeyDown(c.event({key:'Escape'}));else if(cancel==='unmount')c.h.unmount();else if(cancel==='blur')c.h.window.dispatchEvent(new Event('blur'));else c.resize().props[cancel](c.event());assert.equal(c.changes.length,0);c.h.unmount();}
});
test('box keyboard move/resize uses real geometry, ignores foreign pointers, and respects disabled state',()=>{
 const t=canvasFixture({box:box()});t.move().props.onKeyDown(t.event({key:'ArrowRight',shiftKey:true}));assert.equal(t.props.value.box.xPercent,10);t.render();t.resize().props.onKeyDown(t.event({key:'ArrowDown'}));assert.equal(t.props.value.box.heightPx,201);assert.ok(Math.abs(t.props.value.box.widthPercent-50.25)<1e-9);t.render();const before=t.changes.length;t.resize().props.onPointerDown(t.event());t.resize().props.onPointerMove(t.event({pointerId:9,clientX:100}));t.resize().props.onPointerUp(t.event());assert.equal(t.changes.length,before);assert.equal(t.props.value.box.heightPx,201);t.props.disabled=true;t.render();t.move().props.onKeyDown(t.event({key:'ArrowRight'}));assert.equal(t.changes.length,before);t.h.unmount();
});
test('scaled sections hide legacy reflow-only sizing controls instead of exposing no-op fields',()=>{
 const h=harness(),C=h.load('src/owner/OwnerBlocksEditor.tsx').OwnerBlocksEditor;const page=defaults.createDefaultOwnerContent().pages[0];page.blocks=[{id:'one',type:'text',heading:'Hello',body:'World',appearance:{box:box(),widthPercent:80,heightPercent:30}}];h.render(C,{page,onEdit(){},onRemove(){},hideAddPalette:true});assert.equal(h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label==='Section width'),undefined);assert.equal(h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label==='Minimum section height'),undefined);h.unmount();
});
