import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {model as m,defaults as d,preview as p} from './owner-test-modules.mjs';
import {harness,content as text} from './owner-ui-harness.mjs';
import {cartTransition,emptyCart,admittedCartItem} from '../src/components/cart-model.ts';
const compile=(path,modules)=>{const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>modules[name],exports);return exports;};
const store=compile('../src/components/storefront-model.ts',{'../owner/model':m});
function fixture(){const c=d.createDefaultOwnerContent();c.premades=[{id:'live-product',name:'Live premade',image:'/images/logo.png',alt:'Premade',description:'Handmade',price:621,visible:true,soldChannel:'tmc'}];return c;}

test('published product routes require the current available shop slug and visible item',()=>{
 const c=fixture(),page=c.pages.find(p=>p.builtinKey==='premades');page.slug='ready-made';
 assert.equal(store.premadeHref(page,c.premades[0]),'/ready-made/live-product');
 assert.equal(store.getPublicPremade(c,['ready-made','live-product']).item.id,'live-product');
 assert.equal(store.getPublicPremade(c,['premades','live-product']),undefined);
 c.premades[0].visible=false;assert.equal(store.getPublicPremade(c,['ready-made','live-product']),undefined);
 c.premades[0].visible=true;page.availability='hidden';assert.equal(store.getPublicPremade(c,['ready-made','live-product']),undefined);
 page.availability='public';c.site.showPremades=false;assert.equal(store.getPublicPremade(c,['ready-made','live-product']),undefined);
});
test('main/more/unlisted groups and availability remain independent and preserve renamed slugs',()=>{
 const c=fixture();const gallery=c.pages.find(p=>p.builtinKey==='gallery'),prices=c.pages.find(p=>p.builtinKey==='prices'),terms=c.pages.find(p=>p.builtinKey==='terms');
 gallery.navPlacement='more';gallery.slug='characters';prices.navPlacement='unlisted';terms.navPlacement='more';terms.availability='hidden';
 assert.equal(m.getVisibleNavigation(c).some(p=>p.id===gallery.id||p.id===prices.id||p.id===terms.id),false);
 assert.deepEqual(m.getMoreNavigation(c),[]);c.site.moreEnabled=true;assert.deepEqual(m.getMoreNavigation(c).map(p=>p.slug),['characters']);
 assert.equal(p.getPreviewPage(c,['prices']).id,prices.id);assert.equal(p.getPreviewPage(c,['terms']),undefined);
});
test('renamed commission request routes never resurrect the former or hidden route',()=>{
 const c=fixture();const page=c.pages.find(p=>p.builtinKey==='commissions');page.slug='custom-orders';
 assert.equal(store.getPublicRequestPage(c,['commissions','request']),undefined);
 assert.equal(store.getPublicRequestPage(c,['custom-orders','request']).id,page.id);
 page.availability='hidden';assert.equal(store.getPublicRequestPage(c,['custom-orders','request']),undefined);
});
test('third-party destinations are HTTPS-only and cannot smuggle credentials or script URLs',()=>{
 const item={...fixture().premades[0],soldChannel:'third-party'};
 for(const externalUrl of ['javascript:alert(1)','http://example.com','//example.com','https://user:pass@example.com','https://example.com\\@evil.test','https://example.com/ bad'])assert.equal(store.thirdPartyListingUrl({...item,externalUrl}),null);
 assert.equal(store.thirdPartyListingUrl({...item,externalUrl:'https://example.com/listing/123'}),'https://example.com/listing/123');
});
test('production cart admits only canonical published TMC offers and rejects catalog/offline/changed-channel offers',()=>{
 const c=fixture(),item=c.premades[0];assert.equal(store.canAddPublishedPremade(c,item.id),true);
 const published={id:item.id,name:item.name,price:item.price,image:item.image},policy={publishedItems:[published]};
 const state=cartTransition(emptyCart,{type:'add',item:{...published,price:1,name:'Spoofed'}},policy);assert.equal(state.item,published);
 assert.deepEqual(cartTransition(emptyCart,{type:'add',item:{...published,id:'private-draft'}},policy),emptyCart);
 assert.equal(admittedCartItem(state.item,{...policy,catalogMode:true}),null);
 assert.deepEqual(cartTransition(state,{type:'add',item:published},{...policy,catalogMode:true}),emptyCart);
 for(const soldChannel of ['third-party','con']){item.soldChannel=soldChannel;assert.equal(store.canAddPublishedPremade(c,item.id),false);}
 item.soldChannel='tmc';c.site.catalogMode=true;assert.equal(store.canAddPublishedPremade(c,item.id),false);
});
test('catalog activation removes an open persisted cart and unlocks scrolling without offering checkout',()=>{
 const h=harness(),c=fixture();c.pages.find(p=>p.builtinKey==='premades').slug='ready-made';h.pathname='/ready-made/live-product';
 h.overrides['./PublicSiteContext']={usePublicOwnerContent:()=>c,usePublicSiteState:()=>({status:'published'})};
 const {CartProvider}=h.load('src/components/Cart.tsx');h.render(CartProvider);assert.equal(h.currentContext.enabled,true);
 h.currentContext.add(c.premades[0]);h.render(CartProvider);assert.equal(h.currentContext.item.id,'live-product');
 assert.equal(h.document.body.style.overflow,'hidden');assert.match(text(h.tree),/Checkout is not connected/);
 c.site.catalogMode=true;h.render(CartProvider);assert.equal(h.currentContext.enabled,false);assert.equal(h.currentContext.item,null);assert.equal(h.all(n=>n.type==='dialog').length,0);assert.equal(h.document.body.style.overflow,'auto');
 h.currentContext.add(c.premades[0]);h.render(CartProvider);assert.equal(h.currentContext.item,null);
});
test('odd/even gallery renders every photo in original order and only changes layout class',()=>{
 const h=harness(),{FursuitGallery}=h.load('src/components/FursuitGallery.tsx');
 const photos=Array.from({length:5},(_,i)=>({id:`photo-${i}`,name:`Photo ${i}`,src:`/images/fursuit-${i}.webp`,alt:`Photo ${i}`,width:100,height:100}));
 h.render(FursuitGallery,{photos});assert.match(h.find(n=>n.props.className?.includes('grid')).props.className,/odd/);assert.equal(h.all(n=>n.type==='figure').length,5);assert.deepEqual(h.all(n=>n.type==='figcaption').map(n=>text(n)),['Photo 005','Photo 104','Photo 203','Photo 302','Photo 401']);
 h.render(FursuitGallery,{photos:[{...photos[0],id:'new',name:'Newest'},...photos]});assert.equal(h.all(n=>n.type==='figure').length,6);assert.doesNotMatch(h.find(n=>n.props.className?.includes('grid')).props.className,/odd/);
 const css=readFileSync(new URL('../src/components/FursuitGallery.module.css',import.meta.url),'utf8');assert.match(css,/\.odd:not\(\.compact\) > \.card:first-child/);assert.match(css,/grid-column:auto; width:100%/);
});
test('FAQs stay open only during editable builder mode',()=>{
 const h=harness(),{ContentBlocks}=h.load('src/components/SiteContent.tsx'),c=fixture(),blocks=[{id:'faq1',type:'faq',items:[{id:'q1',question:'Question?',answer:'Answer.'}]}];
 for(const [mode,editable,expected] of [['editor',true,true],['editor',false,undefined],['private-preview',false,undefined],['public',false,undefined]]){h.currentContext={mode,editable};h.render(ContentBlocks,{content:c,blocks});assert.equal(h.find(n=>n.type==='details').props.open,expected);}
});
test('server routing returns 404 for disabled/hidden/stale-slug shops and absent products before rendering',async()=>{
 const h=harness();let c=fixture();let state={status:'published',snapshot:m.createPublishedOwnerSnapshot(c,1,'2026-10-25T12:00:00.000Z')};
 h.overrides['./published-site']={getPublishedSite:async()=>state};
 const {PublishedRoute}=h.load('src/server/PublishedRoute.tsx');
 assert.ok(await PublishedRoute({slug:['premades','live-product']}));
 await assert.rejects(()=>PublishedRoute({slug:['premades','missing']}),/MOCK_NOT_FOUND_404/);
 c.pages.find(p=>p.builtinKey==='premades').slug='ready-made';state={status:'published',snapshot:m.createPublishedOwnerSnapshot(c,2,'2026-10-25T12:01:00.000Z')};
 await assert.rejects(()=>PublishedRoute({slug:['premades'],fallback:'must not resurrect'}),/MOCK_NOT_FOUND_404/);
 assert.ok(await PublishedRoute({slug:['ready-made','live-product']}));
 c.site.showPremades=false;state={status:'published',snapshot:m.createPublishedOwnerSnapshot(c,3,'2026-10-25T12:02:00.000Z')};
 for(const slug of [['ready-made'],['ready-made','live-product']])await assert.rejects(()=>PublishedRoute({slug}),/MOCK_NOT_FOUND_404/);
 c=fixture();c.pages.find(p=>p.builtinKey==='commissions').slug='custom-orders';state={status:'published',snapshot:m.createPublishedOwnerSnapshot(c,4,'2026-10-25T12:03:00.000Z')};
 await assert.rejects(()=>PublishedRoute({slug:['commissions/request'],request:true,fallback:'must not resurrect'}),/MOCK_NOT_FOUND_404/);
 assert.ok(await PublishedRoute({slug:['custom-orders','request']}));
});
test('numeric fonts, independent alignment and section percentages render defensively without clipping',()=>{
 const h=harness(),a=h.load('src/owner/appearance.ts'),design=h.load('src/owner/site-design.ts');
 const style=a.getElementAppearanceStyle({fontSize:23.5,textSize:'small',headingAlign:'center',bodyAlign:'right',widthPercent:72.5,heightPercent:140,fontId:'font-test'});
 assert.equal(style['--element-font-size'],'23.5px');assert.equal(style['--element-heading-align'],'center');assert.equal(style['--element-body-align'],'right');assert.equal(style.width,'72.5%');assert.equal(style.minHeight,'140vh');assert.equal(style.height,undefined);assert.match(style['--element-font'],/TMCFont_font-test/);
 for(const fontSize of [NaN,Infinity,7,145])assert.equal(a.getElementAppearanceStyle({fontSize})['--element-font-size'],undefined);
 assert.deepEqual(a.getElementAppearanceStyle({fontId:'x";color:red',widthPercent:101,heightPercent:-1,headingAlign:'url(x)'}),{});
 const theme={design:{bodyFontSize:18,headingFontSize:40,textSize:'small',headingSize:'large',bodyFontId:'font-test'}};
 assert.equal(design.getSiteThemeStyle(theme)['--site-body-font-size'],'18px');assert.equal(design.getSiteThemeStyle(theme)['--site-heading-font-size'],'40px');assert.equal(design.getSiteThemeAttributes(theme)['data-site-text-size'],undefined);assert.equal(design.getSiteThemeAttributes(theme)['data-site-heading-size'],undefined);
});
test('default template links follow renamed builtin identities while explicit custom links remain exact',()=>{
 const h=harness(),design=h.load('src/owner/site-design.ts'),c=fixture();c.pages.find(p=>p.builtinKey==='gallery').slug='characters';
 assert.equal(design.getTemplateLink(c,'home.galleryButton').href,'/characters');
 c.contentOverrides={links:{'home.galleryButton':{label:'Custom destination',href:'/prices'}}};assert.equal(design.getTemplateLink(c,'home.galleryButton').href,'/prices');
});
