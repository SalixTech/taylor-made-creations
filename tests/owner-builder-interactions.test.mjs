import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './owner-ui-harness.mjs';

const helpers = harness().load('src/owner/builder-interactions.ts');
test('hex entry accepts short/long hex but cannot inject styles', () => {
  for (const [raw, expected] of [['#A0b','#aa00bb'], ['800014','#800014'], [' #AbCdEf ','#abcdef']]) assert.equal(helpers.normalizeHexColor(raw), expected);
  for (const raw of ['', '#12345', '#12345678', 'red', 'url(x)', '#123456;display:none']) assert.equal(helpers.normalizeHexColor(raw), null);
});
test('numbers and resize math are finite and bounded', () => {
  for (const raw of ['7','145','Infinity','NaN','8px','']) assert.equal(helpers.boundedNumber(raw,8,144), undefined);
  assert.equal(helpers.boundedNumber('18.5',8,144),18.5);
  assert.equal(helpers.resizePercent(50,100,1000,10,100),60);
  assert.equal(helpers.resizePercent(50,5000,1000,10,100),100);
  assert.equal(helpers.resizePercent(50,-5000,1000,10,100),10);
  assert.equal(helpers.resizePercent(50,100,0,10,100),50);
});
test('drag reorder uses stable IDs, preserves item data and rejects foreign identities', () => {
  const list = ['a','b','c','d'].map(id=>({id, body:id})); const a=list[0];
  assert.equal(helpers.reorderById(list,'a','c',true),true); assert.deepEqual(list.map(x=>x.id),['b','c','a','d']); assert.equal(list[2],a);
  assert.equal(helpers.reorderById(list,'d','b'),true); assert.deepEqual(list.map(x=>x.id),['d','b','c','a']);
  const before=structuredClone(list);
  for (const pair of [['a','a'],['external','a'],['a','external']]) assert.equal(helpers.reorderById(list,...pair),false);
  assert.deepEqual(list,before);
});
test('typed font sizes keep incomplete input local and clear to inherit', () => {
  const h=harness(), {OwnerNumberInput}=h.load('src/owner/OwnerDesignInputs.tsx'); const calls=[];
  const props={label:'Font size',value:24,min:8,max:144,onChange(value){calls.push(value); props.value=value;}};
  const render=()=>h.render(OwnerNumberInput,props), input=()=>h.find(n=>n.type==='input'); render();
  input().props.onFocus(); input().props.onChange({target:{value:'1'}}); render(); assert.equal(input().props.value,'1'); assert.equal(calls.length,0); assert.equal(input().props['aria-invalid'],true);
  input().props.onChange({target:{value:'18'}}); render(); assert.equal(props.value,18);
  input().props.onChange({target:{value:'999'}}); render(); input().props.onBlur(); render(); assert.equal(input().props.value,18);
  input().props.onChange({target:{value:'',validity:{badInput:true}}}); assert.equal(props.value,18);
  input().props.onChange({target:{value:''}}); assert.equal(props.value,undefined);
});
test('hex typing never commits malformed intermediate colors', () => {
  const h=harness(), {OwnerHexInput}=h.load('src/owner/OwnerDesignInputs.tsx'); const calls=[];
  const props={label:'Accent',value:'#800014',onChange(value){calls.push(value); props.value=value;}};
  const render=()=>h.render(OwnerHexInput,props), input=()=>h.find(n=>n.type==='input'); render();
  input().props.onChange({target:{value:'#1'}}); render(); assert.equal(calls.length,0); assert.equal(input().props['aria-invalid'],true);
  input().props.onChange({target:{value:'#ABC'}}); render(); assert.equal(props.value,'#aabbcc');
  input().props.onChange({target:{value:'nothex'}}); render(); input().props.onBlur(); render(); assert.equal(input().props.value,'#AABBCC');
});
function navigationSetup(){
  const h=harness(); let pendingHold; h.globals.setTimeout=fn=>{pendingHold=fn;return 1;};h.globals.clearTimeout=()=>{pendingHold=null;}; h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};
  h.overrides['./navigation-drag']={...h.load('src/owner/navigation-drag.ts'),createNavigationDragGhost(){return {move(){},remove(){}};}};
  const {OwnerHeaderEditor}=h.load('src/owner/OwnerHeaderEditor.tsx'); let value=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const props={content:value,open:true,onOpenChange(){},onEdit(change){value=structuredClone(value);change(value);props.content=value;}};
  const render=()=>h.render(OwnerHeaderEditor,props); render(); return {h,props,render,hold(){const fn=pendingHold;pendingHold=null;fn?.();},get value(){return value;}};
}
test('inline navigation edits labels and enables More only in the draft',()=>{
  const t=navigationSetup(); const first=t.value.pages[0];
  t.h.find(n=>n.type==='input'&&n.props.id===`owner-nav-${first.id}`).props.onChange({target:{value:'Welcome'}});t.render(); assert.equal(t.value.pages[0].navLabel,'Welcome');
  t.h.find(n=>n.type?.name==='Toggle'&&n.props.label==='Enable the More dropdown').props.onChange(true);assert.equal(t.value.site.moreEnabled,true);
  t.props.disabled=true;t.render();t.h.find(n=>n.type==='input').props.onChange({target:{value:'Blocked'}});assert.equal(t.value.pages[0].navLabel,'Welcome');
});
test('navigation keyboard move resolves current order using a stable page identity',()=>{
  const t=navigationSetup(); const first=t.value.pages[0].id;
  const move=t.h.find(n=>n.type?.name==='MoveButtons'&&n.props.index===0).props.onMove;
  t.props.onEdit(draft=>{const pages=draft.pages.filter(p=>!p.trashedAt);pages.reverse().forEach((page,index)=>{page.order=index;});});
  move(-1); const order=t.value.pages.filter(p=>!p.trashedAt).sort((a,b)=>a.order-b.order); assert.equal(order.at(-2).id,first);
});
test('navigation drag rejects foreign/native drops and accepts only its own active pointer and local target',()=>{
  const t=navigationSetup(); const original=t.value.pages.map(p=>[p.id,p.order]);
  const rows=t.h.all(n=>n.props['data-nav-card']);
  assert.ok(rows.every(row=>!row.props.onDrop), 'external native drops cannot commit menu changes');
  const cards=rows.map(row=>({dataset:{navCard:row.props['data-nav-card']},getBoundingClientRect:()=>({left:0,top:0,width:200,height:300}),closest(){return this;},focus(){},setPointerCapture(){},hasPointerCapture(){return false;}}));
  const list=t.h.find(n=>n.props.className==='navRows').props.ref.current;
  list.contains=node=>cards.includes(node);list.querySelectorAll=()=>cards;
  const foreign={dataset:{navCard:cards[2].dataset.navCard},getBoundingClientRect:cards[2].getBoundingClientRect,closest(){return this;}};
  let target=cards[2];t.h.document.elementFromPoint=()=>target;
  const event=(pointerId=1)=>({button:0,pointerId,clientX:10,clientY:10,currentTarget:cards[0],target:{closest:()=>null},preventDefault(){},stopPropagation(){},dataTransfer:{getData(){return cards[0].dataset.navCard;}}});
  rows[0].props.onPointerMove({...event(),clientX:30});rows[0].props.onPointerUp(event());
  assert.deepEqual(t.value.pages.map(p=>[p.id,p.order]),original,'no local start rejects forged pointer/drop payload');
  rows[0].props.onPointerDown(event());t.hold();rows[0].props.onPointerMove(event(2));rows[0].props.onPointerUp(event(2));
  assert.deepEqual(t.value.pages.map(p=>[p.id,p.order]),original,'foreign pointer cannot commit');
  target=foreign;rows[0].props.onPointerMove({...event(),clientX:30});rows[0].props.onPointerUp(event());
  assert.deepEqual(t.value.pages.map(p=>[p.id,p.order]),original,'matching page ID outside editor cannot commit');
  target=cards[2];rows[0].props.onPointerDown(event());t.hold();rows[0].props.onPointerMove({...event(),clientX:30});rows[0].props.onPointerUp(event());
  const order=t.value.pages.filter(p=>!p.trashedAt).sort((a,b)=>a.order-b.order);
  assert.equal(order[1].id,original[0][0]);t.h.unmount();
});
test('menu placement keeps hidden and unlisted meanings separate and home accessible',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};const {OwnerPageNavigation}=h.load('src/owner/OwnerHeaderEditor.tsx');
  let page={id:'x',showInNav:true};const props={page,onEdit(change){page={...page};change(page);props.page=page;}};const render=()=>h.render(OwnerPageNavigation,props);render();
  h.find(n=>n.type?.name==='OwnerSelect').props.onChange('unlisted');render();assert.equal(page.navPlacement,'unlisted');assert.equal(page.showInNav,false);assert.equal(page.availability,undefined);
  h.find(n=>n.type?.name==='Toggle').props.onChange(false);render();assert.equal(page.availability,'hidden');
  h.find(n=>n.type?.name==='OwnerSelect').props.onChange('invalid');assert.equal(page.navPlacement,'unlisted');
  props.page={...page,builtinKey:'home'};render();assert.equal(h.find(n=>n.type?.name==='Toggle'),undefined);
});
test('combined heading/body sections expose independent alignment and typed resize fields',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};const {OwnerBlocksEditor}=h.load('src/owner/OwnerBlocksEditor.tsx');
  let page={id:'p',kind:'custom',blocks:[{id:'b',type:'text',heading:'Hello',body:'World'}]};const props={page,onEdit(change){page=structuredClone(page);change(page);props.page=page;},onRemove(){}};
  h.render(OwnerBlocksEditor,props);const panel=h.find(n=>n.type?.name==='OwnerAppearancePanel');assert.equal(panel.props.separateAlignment,true);
  for(const [label,value,key] of [['Section width',42,'widthPercent'],['Minimum section height',80,'heightPercent']]){h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label===label).props.onChange(value);assert.equal(page.blocks[0].appearance[key],value);}
});
test('editing tooltip is nonwrapping even on narrow links',()=>{
  const css=fs.readFileSync(new URL('../src/owner/OwnerVisualBuilder.module.css',import.meta.url),'utf8');
  assert.match(css,/\[data-owner-edit\]::after\s*\{[^}]*width:max-content;[^}]*white-space:nowrap;/);
});
function builderSetup(key='home') {
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};h.overrides['./PremadePhotoEditor']={PremadePhotoEditor:'PremadePhotoEditor'};
  const {OwnerVisualBuilder}=h.load('src/owner/OwnerVisualBuilder.tsx');let value=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const props={browsing:false,onBrowsingChange(value){props.browsing=value;},content:value,page:value.pages.find(p=>p.builtinKey===key),onEdit(change){value=structuredClone(value);change(value);props.content=value;props.page=value.pages.find(p=>p.id===props.page.id);},onPageChange(){},onManagePages(){},onAddPage(){},onPrices(){},onRemove(){},liveShopVisibility:false,canUpdateLiveShop:false,onUpdateLiveShop(){}};
  const render=()=>h.render(OwnerVisualBuilder,props);render();
  const canvas=()=>h.find(n=>n.props.onDragStartCapture);const nodes=[];
  function node(dataset){const dom=Object.assign(Object.create(Object.getPrototypeOf(canvas().props.ref.current)),{dataset,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),closest(selector){if(selector==='[data-owner-nav-page]')return this.dataset.ownerNavPage?this:null;if(selector==="[data-owner-edit^='block:']")return this.dataset.ownerEdit?.startsWith('block:')?this:null;return null;}});nodes.push(dom);const base=canvas().props.ref.current;base.contains=item=>nodes.includes(item);base.querySelectorAll=()=>nodes;return dom;}
  const event=(target,x=0,y=0)=>({target,clientX:x,clientY:y,dataTransfer:{setData(){}},preventDefault(){},stopPropagation(){}});
  return {h,props,render,canvas,node,event,get value(){return value;}};
}
test('canvas section drag reorders blocks but does not accept foreign or cross-page drops',()=>{
  const t=builderSetup();t.props.onEdit(draft=>{draft.pages[0].blocks=['a','b','c'].map(id=>({id,type:'text',heading:'',body:id}));});t.render();
  const a=t.node({ownerEdit:'block:a'}),c=t.node({ownerEdit:'block:c'});
  t.canvas().props.onDrop(t.event(c,0,90));assert.deepEqual(t.value.pages[0].blocks.map(b=>b.id),['a','b','c']);
  t.canvas().props.onDragStartCapture(t.event(a));t.canvas().props.onDrop(t.event(c,0,90));assert.deepEqual(t.value.pages[0].blocks.map(b=>b.id),['b','c','a']);
  t.render();t.canvas().props.onDragStartCapture(t.event(a));t.props.page=t.value.pages.find(p=>p.builtinKey==='terms');t.render();t.canvas().props.onDrop(t.event(c,0,90));assert.deepEqual(t.value.pages[0].blocks.map(b=>b.id),['b','c','a']);
});
test('actual top-bar links support drag reorder and upload lock prevents it',()=>{
  const t=builderSetup();const original=t.value.pages.filter(p=>!p.trashedAt).sort((a,b)=>a.order-b.order);const first=t.node({ownerNavPage:original[0].id}),third=t.node({ownerNavPage:original[2].id});
  t.canvas().props.onDragStartCapture(t.event(first));t.canvas().props.onDrop(t.event(third,90,0));t.render();assert.equal(t.value.pages.filter(p=>!p.trashedAt).sort((a,b)=>a.order-b.order)[2].id,original[0].id);
  const before=structuredClone(t.value.pages);t.props.uploadBusy=true;t.render();t.canvas().props.onDragStartCapture(t.event(first));t.canvas().props.onDrop(t.event(third));assert.deepEqual(t.value.pages,before);
});
test('page settings offer built-in slug edits but keep the root address fixed',()=>{
  for(const key of ['terms','home']){const t=builderSetup(key);t.h.find(n=>n.type==='button'&&n.props.children==='Page settings').props.onClick();t.render();const field=t.h.find(n=>n.type?.name==='Field'&&n.props.label==='Page address');if(key==='home')assert.equal(field,undefined);else{assert.ok(field);field.props.onChange('studio-terms');assert.equal(t.value.pages.find(p=>p.builtinKey==='terms').slug,'studio-terms');}}
});
function resizeSetup(){
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};h.window.innerHeight=800;
  const {OwnerCanvasSectionTools}=h.load('src/owner/OwnerCanvasSectionTools.tsx');let page={id:'p',blocks:[{id:'b',type:'text',heading:'H',body:'B',appearance:{widthPercent:50,heightPercent:25}}]};
  const node={dataset:{ownerEdit:'block:b'},getBoundingClientRect:()=>({left:10,top:50,width:500,height:200}),parentElement:{getBoundingClientRect:()=>({width:1000})}};
  const props={canvasRef:{current:{querySelectorAll:()=>[node],getBoundingClientRect:()=>({left:0,top:0,width:1000})}},page,block:page.blocks[0],disabled:false,onAnnouncement(){},onEdit(change){page=structuredClone(page);change(page);props.page=page;props.block=page.blocks[0];}};
  const render=()=>h.render(OwnerCanvasSectionTools,props);render();render();const button=()=>h.find(n=>n.props.onPointerDown);const captured=new Set();const target={setPointerCapture(id){captured.add(id)},hasPointerCapture(id){return captured.has(id)},releasePointerCapture(id){captured.delete(id)}};const event=(x=0,y=0)=>({button:0,pointerId:1,clientX:x,clientY:y,currentTarget:target,preventDefault(){},stopPropagation(){}});
  return {h,props,render,button,event,captured,get page(){return page;}};
}
test('section resize handles use parent width/viewport height and never crop content',()=>{
  const t=resizeSetup();t.button().props.onPointerDown(t.event());t.button().props.onPointerMove(t.event(200,400));t.render();assert.equal(t.page.blocks[0].appearance.widthPercent,70);assert.equal(t.page.blocks[0].appearance.heightPercent,75);t.button().props.onPointerUp(t.event());assert.equal(t.captured.size,0);
  const appearance=harness().load('src/owner/appearance.ts').getElementAppearanceStyle(t.page.blocks[0].appearance);assert.equal(appearance.width,'70%');assert.equal(appearance.minHeight,'75vh');assert.equal(appearance.height,undefined);
});
test('interrupted resize restores exact original dimensions and arrow keys remain usable',()=>{
  const t=resizeSetup();t.button().props.onPointerDown(t.event());t.button().props.onPointerMove(t.event(200,400));t.render();t.button().props.onPointerCancel(t.event());t.render();assert.deepEqual(t.page.blocks[0].appearance,{widthPercent:50,heightPercent:25});
  t.button().props.onKeyDown({key:'ArrowRight',shiftKey:false,preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.page.blocks[0].appearance.widthPercent,51);
  t.button().props.onKeyDown({key:'ArrowDown',shiftKey:true,preventDefault(){},stopPropagation(){}});assert.equal(t.page.blocks[0].appearance.heightPercent,35);
});
test('numeric appearance and independent alignments retain legacy defaults until explicitly changed',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};const {OwnerAppearancePanel}=h.load('src/owner/OwnerAppearancePanel.tsx');let value={textSize:'large',align:'center'};
  const props={kind:'section',separateAlignment:true,value,onEdit(change){value=structuredClone(value);change(value);props.value=value;},onReset(){}};const render=()=>h.render(OwnerAppearancePanel,props);render();
  assert.equal(h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Text size for this element'),undefined);
  const size=()=>h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label==='Font size');size().props.onChange(32);render();assert.equal(value.fontSize,32);assert.equal(value.textSize,'large');size().props.onChange(undefined);render();assert.equal(value.fontSize,undefined);assert.equal(value.textSize,'large');
  h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Heading alignment').props.onChange('right');h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Text alignment').props.onChange('left');assert.equal(value.headingAlign,'right');assert.equal(value.bodyAlign,'left');assert.equal(value.align,'center');
});
test('global numeric font inputs replace categorical controls without discarding saved legacy sizes',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};const {OwnerDesignPanel}=h.load('src/owner/OwnerDesignPanel.tsx');let value=h.load('src/owner/defaults.ts').createDefaultOwnerContent();value.design={textSize:'large',headingSize:'small'};
  const props={content:value,onEdit(change){value=structuredClone(value);change(value);props.content=value;},onReset(){}};const render=()=>h.render(OwnerDesignPanel,props);render();
  for(const [label,key] of [['Body font size','bodyFontSize'],['Heading font size','headingFontSize']]){h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label===label).props.onChange(29);render();assert.equal(value.design[key],29);}
  assert.equal(h.find(n=>n.type?.name==='OwnerSelect'&&['Text size','Heading size'].includes(n.props.label)),undefined);assert.equal(value.design.textSize,'large');assert.equal(value.design.headingSize,'small');
});
test('uploaded font selectors use only known draft library IDs',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload'};const {OwnerAppearancePanel}=h.load('src/owner/OwnerAppearancePanel.tsx');const font={id:'11111111-2222-3333-4444-555555555555',name:'Studio font',src:'/api/fonts/11111111-2222-3333-4444-555555555555',format:'woff2'};let value={};
  const props={value,fonts:[font],onEdit(change){value=structuredClone(value);change(value);props.value=value;},onReset(){}};const render=()=>h.render(OwnerAppearancePanel,props);render();const select=()=>h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Uploaded font for this element');
  select().props.onChange(font.id);render();assert.equal(value.fontId,font.id);select().props.onChange('unknown-font');assert.equal(value.fontId,font.id);select().props.onChange('');assert.equal(value.fontId,undefined);
});
test('More summary remains a working disclosure in edit mode instead of opening Header settings',()=>{
  const t=builderSetup();const summary=t.node({ownerEdit:'site'});summary.closest=selector=>selector==='.nav-more > summary'?summary:null;let prevented=0;
  for(const key of [undefined,'Enter',' ']){const event={target:summary,preventDefault(){prevented++;},stopPropagation(){},...(key?{key}:{detail:1})};(key?t.canvas().props.onKeyDownCapture:t.canvas().props.onClickCapture)(event);t.render();assert.equal(t.h.find(n=>n.type==='aside'&&n.props['aria-label']==='Header & footer'),undefined);}
  assert.equal(prevented,0,'native details activation is not swallowed');
});
test('native canvas drag uses whole-section ghost, stable placeholder and cancels without a draft write',()=>{
  const t=builderSetup();t.props.onEdit(draft=>{draft.pages[0].blocks=['a','b','c'].map(id=>({id,type:'text',heading:'',body:id}));});t.render();const a=t.node({ownerEdit:'block:a'});let ghost;
  const event=t.event(a,10,25);event.dataTransfer.setDragImage=(node,x,y)=>{ghost={node,x,y};};t.canvas().props.onDragStartCapture(event);assert.equal(ghost.node,a);assert.equal(a.dataset.ownerDragging,'true');assert.deepEqual(t.value.pages[0].blocks.map(b=>b.id),['a','b','c']);
  t.canvas().props.onDragEnd();assert.equal(a.dataset.ownerDragging,undefined);assert.deepEqual(t.value.pages[0].blocks.map(b=>b.id),['a','b','c']);let blocked=0;t.canvas().props.onClickCapture({target:a,detail:1,preventDefault(){blocked++;},stopPropagation(){}});assert.equal(blocked,1);
});
