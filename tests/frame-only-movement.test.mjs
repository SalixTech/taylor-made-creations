import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';import {harness} from './owner-ui-harness.mjs';
const load=sourceLoader(),g=load('src/owner/box-geometry.ts');const seed=()=>g.initialElementBox({width:400,height:200,parentWidth:800});
test('parent frame-only movement keeps contents world-fixed through rotation and responsive scaling',()=>{
 for(const angle of [0,27,90,180,-43])for(const scale of [.39,1,2]){
  const start={...seed(),rotationDeg:angle,contentOffset:{xPx:30,yPx:-12}},next=g.moveElementBoxFrame(start,-35,147);
  const world=(box)=>{const p=g.transformPoint(g.rotationAffine(angle),{x:(box.contentOffset?.xPx??0)+22,y:(box.contentOffset?.yPx??0)+9});return{x:(box.xPercent/100*800+p.x)*scale,y:(box.yPx+p.y)*scale};};
  const a=world(start),b=world(next);assert.ok(Math.abs(a.x-b.x)<1e-8);assert.ok(Math.abs(a.y-b.y)<1e-8);assert.equal(g.validElementBox(next),true);
  const grouped=g.moveElementBoxFrame(start,-35,147,true);assert.deepEqual(grouped.contentOffset,start.contentOffset);assert.notDeepEqual(world(grouped),world(start));
 }
});
test('offset is strict finite data, survives public and independent mobile roundtrip without aliasing',()=>{
 const m=load('src/owner/model.ts'),a=load('src/owner/appearance.ts'),draft=load('src/owner/defaults.ts').createDefaultOwnerContent();const box=g.moveElementBoxFrame(seed(),12,34);
 draft.contentOverrides={styles:{'home.title':{box,mobile:{box:g.moveElementBoxFrame(seed(),-42,55)}}}};assert.equal(m.validateOwnerContent(draft).valid,true);const pub=m.createPublicContentSnapshot(draft);assert.deepEqual(pub.contentOverrides.styles['home.title'].box,box);pub.contentOverrides.styles['home.title'].box.contentOffset.xPx=99;assert.notEqual(box.contentOffset.xPx,99);assert.notDeepEqual(a.resolveElementAppearance(draft.contentOverrides.styles['home.title'],true).box.contentOffset,box.contentOffset);
 for(const contentOffset of [{xPx:NaN,yPx:0},{xPx:0,yPx:Infinity},{xPx:0},{xPx:0,yPx:0,css:'bad'},'raw',null])assert.equal(g.validElementBox({...seed(),contentOffset}),false);
 const invalidStart=seed();assert.equal(g.moveElementBoxFrame(invalidStart,Infinity,0),invalidStart);
});
test('real GeometryBox renderer compensates immediate children without moving native parent decoration',()=>{
 const h=harness(),C=h.load('src/components/GeometryBox.tsx').GeometryBox,box=g.moveElementBoxFrame(seed(),25,40);h.render(C,{box,appearance:{backgroundColor:'#abcdef'},children:'Contents'});assert.equal(h.tree.props.style.left,'25%');assert.equal(h.tree.props.children.props.style['--box-content-offset-x'],'-200px');assert.equal(h.tree.props.children.props.style['--box-content-offset-y'],'-40px');assert.equal(h.tree.props.children.props.style.transform,undefined);assert.match(h.tree.props.children.props.className,/compensatedContents/);h.unmount();
});
test('real parent pointer/keyboard controls preserve frame-only option and group movement and cancellation never commits',()=>{
 for(const grouped of [false,true]){
 const h=harness(),C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerCanvasBoxTools,child={dataset:{ownerEdit:'core-text:home.title'}};
 const parent={getBoundingClientRect:()=>({left:0,top:0,width:800,height:700})},node={dataset:{ownerEdit:'canvas:layout.home.commissionStrip'},parentElement:parent,querySelector:()=>child,getBoundingClientRect:()=>({left:0,top:50,width:400,height:200})};
 const canvas={scrollTop:0,scrollLeft:0,querySelectorAll:()=>[node],getBoundingClientRect:()=>({left:0,top:0,width:800,height:900})};const changes=[],props={canvasRef:{current:canvas},target:'canvas:layout.home.commissionStrip',value:{box:seed()},disabled:false,selectBoxContents:false,onSelectBoxContents:v=>{props.selectBoxContents=v;},onChange:next=>{changes.push(next);}};
 const render=()=>h.render(C,props);render();render();const group=()=>h.find(n=>n.type==='button'&&n.props.children==='Move frame only');assert.ok(group());assert.equal(group().props['aria-pressed'],true);if(grouped){group().props.onClick();render();assert.equal(group().props['aria-pressed'],false);}
 const move=()=>h.find(n=>n.props['aria-label']?.startsWith('Move content box.')),button={focus(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};const event=extra=>({pointerId:1,button:0,clientX:0,clientY:0,currentTarget:button,preventDefault(){},stopPropagation(){},...extra});
 move().props.onPointerDown(event());move().props.onPointerMove(event({clientX:80,clientY:20}));assert.equal(changes.length,0);move().props.onPointerUp(event());assert.equal(changes.length,1);assert.equal(changes[0].box.xPercent,10);assert.equal(changes[0].box.yPx,20);assert.deepEqual(changes[0].box.contentOffset,grouped?undefined:{xPx:-80,yPx:-20});
 move().props.onKeyDown(event({key:'ArrowRight'}));assert.equal(changes.length,2);assert.deepEqual(changes[1].box.contentOffset,grouped?undefined:{xPx:-8,yPx:0});
 move().props.onPointerDown(event());move().props.onPointerMove(event({clientX:90}));move().props.onKeyDown(event({key:'Escape'}));assert.equal(changes.length,2);h.unmount();
 }
});
test('typed parent position fields share frame-only and selected-contents semantics',()=>{
 for(const grouped of [false,true]){
 const h=harness(),C=h.load('src/owner/OwnerCanvasBoxTools.tsx').OwnerBoxFields,node={dataset:{ownerEdit:'canvas:layout.home.commissionStrip'},querySelector:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:400,height:200}),parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}},canvas={scrollTop:0,scrollLeft:0,querySelectorAll:()=>[node],getBoundingClientRect:()=>({left:0,top:0,width:800,height:800})};let next;
 const props={canvasRef:{current:canvas},target:'canvas:layout.home.commissionStrip',value:{box:seed()},selectBoxContents:grouped,onChange:v=>next=v};h.render(C,props);h.render(C,props);h.find(n=>n.type?.name==='OwnerNumberInput'&&n.props.label==='Horizontal box position').props.onChange(20);assert.equal(next.box.xPercent,20);assert.deepEqual(next.box.contentOffset,grouped?undefined:{xPx:-160,yPx:0});h.unmount();
 }
});
test('native decorated parent markup keeps its own background border and padding; only children receive compensation',async()=>{
 const React=await import('react'),jsx=await import('react/jsx-runtime'),{renderToStaticMarkup}=await import('react-dom/server'),{readFileSync}=await import('node:fs');const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsx;const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 const html=renderToStaticMarkup(React.createElement(C,{box:g.moveElementBoxFrame(seed(),25,40)},React.createElement('section',{className:'native-card',style:{background:'#123456',border:'2px solid #abcdef',padding:24}},React.createElement('h2',null,'Title'),React.createElement('p',null,'Body'))));
 assert.match(html,/<section class="native-card" style="background:#123456;border:2px solid #abcdef;padding:24px"><h2>Title<\/h2><p>Body<\/p><\/section>/);assert.match(html,/--box-content-offset-x:-200px/);assert.doesNotMatch(html,/transform:translate/);
 const css=readFileSync(new URL('../src/components/GeometryBox.module.css',import.meta.url),'utf8');assert.match(css,/\.compensatedContents > :first-child > :not\(\[data-owner-compensated-text\]\):not\(\[data-owner-compensated-inline\]\) \{ translate:var\(--box-content-offset-x,0px\) var\(--box-content-offset-y,0px\); \}/);assert.doesNotMatch(css,/background-color:transparent!important/);
});
test('finite pixel translation compensation preserves editable affine geometry; unsupported translation stays fenced',()=>{
 const h=harness(),a=h.load('src/owner/box-affine.ts');const node={offsetWidth:100,offsetHeight:50,parentElement:null,getBoundingClientRect:()=>({left:47,top:-23,width:100,height:50})};let translate='-200px 40px';h.window.getComputedStyle=()=>({display:'block',width:'100px',height:'50px',boxSizing:'border-box',transform:'none',translate,zoom:'1'});
 assert.deepEqual(a.elementToScreen(node),{a:1,b:0,c:0,d:1,e:47,f:-23});for(translate of ['10% 0px','1px 2px 3px','calc(1px + 2px)','Infinitypx 0px','1e999px 0px'])assert.equal(a.elementToScreen(node),null);h.unmount();
});
test('mixed direct text is compensated without changing parent semantics; nested offsets remain separate',async()=>{
 const React=await import('react'),jsx=await import('react/jsx-runtime'),{renderToStaticMarkup}=await import('react-dom/server');const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsx;const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 const inner=React.createElement(C,{box:g.moveElementBoxFrame({...seed(),rotationDeg:30},0,10)},React.createElement('article',null,React.createElement('p',null,'Nested')));
 const html=renderToStaticMarkup(React.createElement(C,{box:g.moveElementBoxFrame(seed(),25,40)},React.createElement('section',{className:'parent'},'Direct text ',React.createElement('b',null,'Bold'),inner)));
 assert.match(html,/<section class="parent"><span data-owner-compensated-text="true" style="position:relative;left:var\(--box-content-offset-x,0px\);top:var\(--box-content-offset-y,0px\)">Direct text <\/span><b>Bold<\/b>/);
 assert.match(html,/--box-content-offset-x:-200px;--box-content-offset-y:-40px/);assert.match(html,/--box-content-offset-y:-8\.660254/);assert.match(html,/transform:rotate\(30deg\)/);
});
test('computed inline compensation preserves existing elements, flex/grid participation and original relative offsets',()=>{
 const h=harness();class Element{}h.globals.HTMLElement=Element;const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 const make=(display,position='static')=>{const attrs=new Map(),styles=new Map();return Object.assign(new Element(),{display,position,attrs,hasAttribute:k=>attrs.has(k),getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),style:{getPropertyValue:k=>styles.get(k)??'',setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}});};
 const inline=make('inline','relative'),flex=make('inline-flex'),grid=make('grid');inline.style.setProperty('--box-inline-left','old');const direct=[inline,flex,grid];h.window.getComputedStyle=node=>({display:node.display,position:node.position,left:'7px',top:'-3px',right:'auto',bottom:'auto'});
 const props={box:g.moveElementBoxFrame(seed(),25,40),children:'First'};h.render(C,props);h.tree.props.children.props.ref({firstElementChild:{children:direct}});h.render(C,{...props,children:'Second'});
 assert.equal(inline.getAttribute('data-owner-compensated-inline'),'true');assert.equal(inline.style.getPropertyValue('--box-inline-left'),'7px');assert.equal(inline.style.getPropertyValue('--box-inline-top'),'-3px');assert.equal(flex.getAttribute('data-owner-compensated-inline'),null);assert.equal(grid.getAttribute('data-owner-compensated-inline'),null);assert.deepEqual(direct,[inline,flex,grid]);h.unmount();assert.equal(inline.getAttribute('data-owner-compensated-inline'),null);assert.equal(inline.style.getPropertyValue('--box-inline-left'),'old');
});
