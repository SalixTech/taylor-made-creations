import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {harness} from './owner-ui-harness.mjs';
import {sourceLoader,root} from './scout-source-loader.mjs';
const overrides={
 'next/image':{__esModule:true,default:({unoptimized,priority,fill,...p})=>{void unoptimized;void priority;void fill;return React.createElement('img',p);}},
 'next/link':{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)},
 '@/owner/media-client':{useOwnerMediaSource:src=>({src}),useOwnerMediaSources:()=>({})},
 './SiteFontLoader':{SiteFontLoader:()=>null},
 '@/components/CommissionForm':{CommissionForm:()=>null},
};
function css(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())css(p);else if(/\.tsx?$/.test(p))for(const match of readFileSync(p,'utf8').matchAll(/from\s+["']([^"']+\.css)["']/g))overrides[match[1]]={__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};}}css(join(root,'src'));
const load=sourceLoader(overrides), defaults=load('src/owner/defaults.ts'),model=load('src/owner/model.ts'),registry=load('src/owner/canvas-target-registry.ts');
const {ContentPage}=load('src/components/SiteContent.tsx');
const render=(content,page,extra={})=>renderToStaticMarkup(React.createElement(ContentPage,{content,page,mode:'editor',editable:true,...extra}));
test('semantic registry rejects arbitrary selectors and prunes only missing or private identities',()=>{
 const c=defaults.createDefaultOwnerContent();
 for(const key of ['body','layout.gallery:x:onclick','layout.page:../x:shell','layout.block:a:b:body;position:fixed'])assert.equal(registry.isCanvasStyleKey(key),false,key);
 c.site.showPremades=true; c.premades=[{id:'test-premade',name:'Sample',image:c.home.image.src,alt:'Sample',description:'Description',price:100,visible:true}];
 const gallery=c.gallery.find(p=>p.visible),premade=c.premades[0];
 const keys=[`layout.gallery:${gallery.id}:caption`,...(premade?[`layout.premade:${premade.id}:price`]:[])];
 c.contentOverrides={...c.contentOverrides,styles:Object.fromEntries(keys.map(key=>[key,{textColor:'#123456'}]))};
 const published=model.createPublicContentSnapshot(c);
 for(const key of keys){assert.equal(registry.canvasStyleKeyIsPublic(key,published),true,key);assert.equal(published.contentOverrides.styles[key].textColor,'#123456');}
 assert.equal(registry.canvasStyleKeyIsPublic('layout.gallery:missing:caption',published),false);
});
test('each builtin render family exposes outer and inner semantic targets in actual React markup',()=>{
 const c=defaults.createDefaultOwnerContent();
 for(const [builtin,expected] of Object.entries({home:['template-link:home.pricesCard','template-link:home.careCard','canvas:layout.home.pricesCardTitle'],prices:['canvas:layout.prices.grid',`canvas:layout.price-group:${c.prices.groups[0].id}`,`canvas:layout.price-item:${c.prices.groups[0].items[0].id}:amount`],gallery:['canvas:layout.gallery.grid',`canvas:layout.gallery:${c.gallery[0].id}:photo`,`canvas:layout.gallery:${c.gallery[0].id}:caption`],commissions:['canvas:layout.commissions.status','canvas:layout.commissions.steps','canvas:layout.commissions.form'],contact:['canvas:layout.contact.details','canvas:layout.contact.form'],examples:['canvas:layout.examples.heads']})){
  const page=c.pages.find(p=>p.builtinKey===builtin);const html=render(c,page);for(const target of expected)assert.ok(html.includes(`data-owner-edit="${target}"`),`${builtin}: ${target}`);
 }
});
test('custom section nesting uses desktop membership and explicit independent mobile membership',()=>{
 const c=defaults.createDefaultOwnerContent(),page=c.pages.find(p=>p.builtinKey==='suitcare');
 page.blocks=[{id:'sectionA',type:'section',heading:'Section A'},{id:'sectionB',type:'section',heading:'Section B'},{id:'nested',type:'text',heading:'Nested heading',body:'Nested body',parentId:'sectionA',mobileParentId:'sectionB'}];
 c.design={...c.design,mobileLayoutEnabled:true};
 const desktop=render(c,page,{layoutViewport:'desktop'}),mobile=render(c,page,{layoutViewport:'mobile'});
 assert.match(desktop,/data-owner-section-id="sectionA"[^>]*><section[^]*Nested body[^]*data-owner-section-frame="sectionB"/);
 assert.match(mobile,/data-owner-section-id="sectionA"[^>]*><\/div>[^]*data-owner-section-id="sectionB"[^>]*><section[^]*Nested body/);
 assert.ok(desktop.includes(`canvas:layout.block:${page.id}:nested:body`));
 c.design.mobileLayoutEnabled=false;assert.equal(render(c,page,{layoutViewport:'mobile'}),desktop);
});
test('neutral placeholder defaults do not override explicitly styled builder text',()=>{
 const css=readFileSync(join(root,'src/app/color-modes.css'),'utf8');assert.ok(!css.includes('#b4a3ac'));assert.match(css,/input:not\(\[data-element-text-color="true"\]\)::placeholder/);assert.ok(css.includes('#b8b8bd'));
});

test('gallery decorator default identity retains original public output and each hook is distinct',()=>{
 const {FursuitGallery}=load('src/components/FursuitGallery.tsx'); const photos=defaults.createDefaultOwnerContent().gallery.slice(0,1);
 const plain=renderToStaticMarkup(React.createElement(FursuitGallery,{photos})); const calls=[];
 const decorated=renderToStaticMarkup(React.createElement(FursuitGallery,{photos,decorate:(photo,part,node)=>{calls.push([photo.id,part]);return node;}}));
 assert.equal(decorated,plain);assert.deepEqual(calls.map(c=>c[1]),['photo','caption','card']);
});
test('mobile preview choice is authoritative and unsupported matchMedia safely defaults desktop',()=>{
 const c=defaults.createDefaultOwnerContent();c.design={...c.design,mobileLayoutEnabled:true};
 const h=harness(),Component=h.load('src/components/SiteContent.tsx').ContentPage;const props={content:c,page:c.pages[0]};
 h.render(Component,props);assert.equal(h.tree.props.value.mobileLayout,false);h.render(Component,{...props,layoutViewport:'mobile'});assert.equal(h.tree.props.value.mobileLayout,true);h.unmount();
 const m=harness();let listener; m.window.matchMedia=()=>({matches:true,addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>{}});const Mobile=m.load('src/components/SiteContent.tsx').ContentPage;
 m.render(Mobile,props);m.render(Mobile,props);assert.equal(m.tree.props.value.mobileLayout,true);assert.equal(typeof listener,'function');
 m.render(Mobile,{...props,layoutViewport:'desktop'});assert.equal(m.tree.props.value.mobileLayout,false);m.unmount();
});
test('actual published chrome applies the same saved geometry and keeps locked/error boundaries',()=>{
 const c=defaults.createDefaultOwnerContent(),geometry=load('src/owner/box-geometry.ts');
 const box=geometry.initialElementBox({width:300,height:100,parentWidth:900});
 c.contentOverrides={styles:{'layout.site.header':{box},'layout.site.navigation':{textColor:'#123456'},'layout.navigation:trello-board':{box},'layout.site.footer':{box}}};
 let status='published';
 const chrome=sourceLoader({...overrides,'next/navigation':{usePathname:()=>'/prices'},'./PublicSiteContext':{usePublicOwnerContent:()=>c,usePublicSiteState:()=>({status})}});
 const {PublicHeader,PublicFooter}=chrome('src/components/PublicChrome.tsx');
 const header=renderToStaticMarkup(React.createElement(PublicHeader)),footer=renderToStaticMarkup(React.createElement(PublicFooter));
 assert.ok(header.includes('data-owner-layout="reflow"'));assert.ok(header.includes('--element-text-color:#123456'));assert.ok(header.includes('href="https://trello.com/b/mjEvvCqI/"'));assert.ok(footer.includes('data-owner-layout="reflow"'));
 status='locked';assert.equal(renderToStaticMarkup(React.createElement(PublicHeader)),'');assert.equal(renderToStaticMarkup(React.createElement(PublicFooter)),'');
 status='error';assert.match(renderToStaticMarkup(React.createElement(PublicHeader)),/temporarily unavailable/);assert.equal(renderToStaticMarkup(React.createElement(PublicFooter)),'');
});
test('public frame and chrome use independent mobile design and appearance snapshots',()=>{
 const c=defaults.createDefaultOwnerContent();c.design={mobileLayoutEnabled:true,bodyFontSize:30,mobileDesign:{bodyFontSize:14}};
 c.contentOverrides={styles:{'layout.site.header':{textColor:'#ff0000',mobile:{textColor:'#00ff00'}}}};
 const mobile=sourceLoader({...overrides,'next/navigation':{usePathname:()=>'/prices'},'@/owner/use-mobile-site-layout':{useMobileSiteLayout:()=>true},'./PublicSiteContext':{usePublicOwnerContent:()=>c,usePublicSiteState:()=>({status:'published'})},'./ColorMode':{useColorMode:()=> 'light',ColorModeToggle:()=>null},'./PublicAccountThemeSync':{PublicAccountThemeSync:()=>null}});
 const frame=renderToStaticMarkup(React.createElement(mobile('src/components/PublicSiteFrame.tsx').PublicSiteFrame,null,'Child'));
 assert.ok(frame.includes('14px'));assert.ok(!frame.includes('30px'));
 const header=renderToStaticMarkup(React.createElement(mobile('src/components/PublicChrome.tsx').PublicHeader));assert.ok(header.includes('#00ff00'));assert.ok(!header.includes('#ff0000'));
});
test('boxed layout uses one dimension frame without multiplying legacy child percentages',()=>{
 const {LayoutAppearance}=load('src/components/LayoutAppearance.tsx');const geometry=load('src/owner/box-geometry.ts');
 const appearance={widthPercent:50,heightPercent:120,box:geometry.initialElementBox({width:300,height:100,parentWidth:900})};
 const html=renderToStaticMarkup(React.createElement(LayoutAppearance,{appearance},React.createElement('h2',{style:{width:'50%',minHeight:'120vh'}},'Reflow title')));
 assert.ok(html.includes('data-owner-layout="reflow"'));assert.ok(!html.includes('width:50%'));assert.ok(!html.includes('120vh'));assert.equal(appearance.widthPercent,50,'stored legacy state retained for reset');
});
