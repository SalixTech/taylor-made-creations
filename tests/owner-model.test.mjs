import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {model as m,defaults as d} from './owner-test-modules.mjs';

test('baseline preserves every current price, gallery and terms/care content',()=>{
  const content=d.createDefaultOwnerContent();
  assert.deepEqual(m.validateOwnerContent(content),{valid:true,issues:[]});
  assert.equal(content.site.commissionStatus,'Opening Soon!');
  assert.equal(content.home.title,'Welcome to your new Fursuit');
  assert.equal(content.prices.groups[0].items[0].price,1100);
  assert.deepEqual(content.prices.parts.map(x=>x.price),[250,325,80,175,275,150,800,1000]);
  assert.deepEqual(content.prices.extras.map(x=>x.price),[5,50,10,40,50,75,20,80,250]);
  assert.equal(content.gallery.length,12);
  assert.equal(content.gallery[0].name,'Cisco');
  const terms=JSON.parse(readFileSync(new URL('../src/data/terms-of-service.json',import.meta.url),'utf8'));
  const care=JSON.parse(readFileSync(new URL('../src/data/care-instructions.json',import.meta.url),'utf8'));
  assert.deepEqual(content.pages.find(x=>x.builtinKey==='terms').blocks.map(x=>x.body),[...terms.sections.map(x=>x.items.join('\n\n')),terms.agreement]);
  const carePage=content.pages.find(x=>x.builtinKey==='suitcare');
  assert.deepEqual(carePage.blocks.filter(x=>/^care-\d+$/.test(x.id)).map(x=>x.body),care.sections.map(x=>x.paragraphs.join('\n\n')));
  assert.equal(carePage.blocks[0].href,'/downloads/taylor-made-creations-care.pdf');
  assert.deepEqual(carePage.blocks.filter(x=>x.type==='link'&&x.id!=='care-download').map(x=>x.href),care.recommendedItems.map(x=>x.href));
});
test('defaults are independent deep copies',()=>{
  const a=d.createDefaultOwnerContent(),b=d.createDefaultOwnerContent();
  a.prices.groups[0].items[0].price=1;
  a.pages.find(x=>x.builtinKey==='terms').blocks[0].body='Changed';
  assert.equal(b.prices.groups[0].items[0].price,1100);
  assert.notEqual(b.pages.find(x=>x.builtinKey==='terms').blocks[0].body,'Changed');
});
test('all commission states are accepted, other states fail',()=>{
  const content=d.createDefaultOwnerContent();
  for(const status of m.COMMISSION_STATUSES){content.site.commissionStatus=status;assert.equal(m.validateOwnerContent(content).valid,true);}
  content.site.commissionStatus='Maybe';assert.equal(m.validateOwnerContent(content).valid,false);
});
test('custom pages create, rename, reorder, soft trash and restore without data loss',()=>{
  const original=d.createDefaultOwnerContent();
  let next=m.createCustomPage(original,{title:'About Taylor',slug:'about-taylor'});
  const id=next.pages.at(-1).id;
  next=m.renamePage(next,id,{title:'About the maker',navLabel:'About',slug:'about'});
  next.pages.at(-1).blocks=[{id:'text-1',type:'text',heading:'Hello',body:'Original content'}];
  next=m.movePage(next,id,'up');
  assert.equal(next.pages.at(-2).id,id);
  next=m.trashPage(next,id,'2026-10-25T12:00:00.000Z');
  assert.equal(m.getVisibleNavigation(next).some(x=>x.id===id),false);
  assert.throws(()=>m.createCustomPage(next,{title:'Duplicate',slug:'about'}),m.OwnerValidationError);
  next=m.restorePage(next,id);
  assert.equal(next.pages.find(x=>x.id===id).blocks[0].body,'Original content');
  assert.equal(m.getVisibleNavigation(next).some(x=>x.id===id),true);
  assert.equal(original.pages.length,10);
});
test('home is mandatory; terms/care trash remains reversible and cannot be hard deleted',()=>{
  const content=d.createDefaultOwnerContent();
  assert.throws(()=>m.trashPage(content,'builtin-home'),m.OwnerValidationError);
  assert.throws(()=>m.renamePage(content,'builtin-home',{slug:'welcome'}),m.OwnerValidationError);
  for(const key of ['terms','suitcare']){
    const trashed=m.trashPage(content,`builtin-${key}`);
    assert.ok(trashed.pages.find(x=>x.builtinKey===key).trashedAt);
    assert.deepEqual(m.restorePage(trashed,`builtin-${key}`),content);
    assert.equal(m.validateOwnerContent({...content,pages:content.pages.filter(x=>x.builtinKey!==key)}).valid,false);
  }
});
test('page reordering skips separately displayed trash entries',()=>{
  let content=d.createDefaultOwnerContent();content=m.trashPage(content,'builtin-prices');
  content=m.movePage(content,'builtin-gallery','up');
  assert.equal(content.pages.filter(x=>!x.trashedAt)[0].id,'builtin-gallery');
  assert.equal(content.pages.find(x=>x.id==='builtin-prices').order,1);
});
test('sparse list entries are rejected instead of silently skipped',()=>{
  const content=d.createDefaultOwnerContent();delete content.gallery[0];assert.equal(m.validateOwnerContent(content).valid,false);
});
test('reserved paths, nested paths, encoding and duplicate page addresses fail',()=>{
  for(const slug of ['owner','admin','api','_next','prices','gallery','care','tos','login','checkout','images','commissions/request','../evil','Foo','two--hyphens','%6fwner','', 'a'.repeat(65)])assert.notEqual(m.validatePageSlug(slug),null,slug);
  assert.equal(m.validatePageSlug('about-taylor-2'),null);
  assert.equal(m.slugifyTitle('Àbout Taylor & friends!'),'about-taylor-friends');
  const content=d.createDefaultOwnerContent();content.pages[1].slug='';assert.equal(m.validateOwnerContent(content).valid,false);
});
test('prices reject negative/nonfinite/over-precise values and accept cents',()=>{
  const content=d.createDefaultOwnerContent();
  for(const price of [-1,NaN,Infinity,1.001,1000001,'10']){content.prices.groups[0].items[0].price=price;assert.equal(m.validateOwnerContent(content).valid,false,String(price));}
  for(const price of [0,1.01,123.45,1000000]){content.prices.groups[0].items[0].price=price;assert.equal(m.validateOwnerContent(content).valid,true,String(price));}
});
test('untrusted links, SVG uploads, HTML blocks and duplicate IDs are rejected',()=>{
  for(const link of ['javascript:alert(1)','data:text/html,<script>','//evil.test','/\\evil.test','https://user:pass@example.com','http://example.com','https:example.com','https://good.com\n.evil.com','mailto:hello@example.com?subject=injected','mailto:hello%0d%0a@example.com'])assert.equal(m.isSafeLink(link),false,link);
  for(const link of ['/contact','https://example.com/path','mailto:hello@example.com','#care'])assert.equal(m.isSafeLink(link),true,link);
  for(const image of ['data:image/svg+xml;base64,PHN2Zz4=','blob:whatever','/api/private','file:///etc/passwd','/images/../private.png'])assert.equal(m.isSafeImageSource(image),false,image);
  assert.equal(m.isSafeImageSource('data:image/png;base64,aGVsbG8='),true);
  const content=d.createDefaultOwnerContent();
  content.pages[0].blocks=[{id:'html-1',type:'html',html:'<script>alert(1)</script>'}];assert.equal(m.validateOwnerContent(content).valid,false);
  content.pages[0].blocks=[];content.prices.groups[0].items[0].html='<b>hi</b>';assert.equal(m.validateOwnerContent(content).valid,false);
  delete content.prices.groups[0].items[0].html;content.gallery[1].id=content.gallery[0].id;assert.equal(m.validateOwnerContent(content).valid,false);
});
test('prototype-bearing input is not accepted as a content object',()=>{
  const content=d.createDefaultOwnerContent();Object.setPrototypeOf(content.site,{unexpected:'inherited'});
  assert.equal(m.validateOwnerContent(content).valid,false);
});
test('public projection omits trash, hidden listings and browser bookkeeping',()=>{
  let content=d.createDefaultOwnerContent();
  content=m.createCustomPage(content,{title:'Private draft',slug:'private-draft',showInNav:false});
  const custom=content.pages.at(-1); custom.blocks=[{id:'private',type:'text',heading:'',body:'TRASH-SECRET'}];
  content=m.trashPage(content,custom.id);content.gallery[0].visible=false;
  content.premades=[{id:'premade-1',name:'Hidden',image:'/images/home-collage.webp',alt:'Hidden',price:20,description:'HIDDEN-SECRET',visible:false}];
  const snapshot=m.createPublicContentSnapshot(content);
  assert.equal(snapshot.pages.some(x=>x.id===custom.id),false);
  assert.equal(snapshot.gallery.length,11);assert.equal(snapshot.premades.length,0);
  assert.equal(JSON.stringify(snapshot).includes('TRASH-SECRET'),false);
  assert.equal(JSON.stringify(snapshot).includes('HIDDEN-SECRET'),false);
  assert.equal('trashedAt' in snapshot.pages[0],false);
  assert.equal('draft' in snapshot,false);
});
test('public projection refuses browser data images and oversized text docs',()=>{
  const content=d.createDefaultOwnerContent();content.home.image.src='data:image/png;base64,aGVsbG8=';
  assert.throws(()=>m.createPublicContentSnapshot(content),/Upload this photo/);
  content.home.image.src='/images/home-collage.webp';
  content.pages[0].blocks=Array.from({length:40},(_,i)=>({id:`text-${i}`,type:'text',heading:'',body:'a'.repeat(20000)}));
  assert.equal(m.validateOwnerContent(content).valid,true);
  assert.throws(()=>m.createPublicContentSnapshot(content),/too large/);
});
test('hidden navigation stays directly addressable; hide-premades suppresses nav',()=>{
  const content=d.createDefaultOwnerContent();content.site.showPremades=false;
  assert.equal(m.getVisibleNavigation(content).some(x=>x.builtinKey==='premades'),false);
  assert.equal(content.pages.find(x=>x.builtinKey==='terms').trashedAt,null);
  assert.equal(m.pageHref(content.pages[0]),'/');
});

test('new structured blocks preserve old defaults and round-trip through public projection',()=>{
  const content=d.createDefaultOwnerContent();
  const blocks=[
    {id:'heading',type:'heading',text:'About the maker',level:2},
    {id:'list',type:'list',style:'numbered',items:['First','Second']},
    {id:'divider',type:'divider'},
    {id:'spacer',type:'spacer',size:'medium'},
    {id:'faq',type:'faq',items:[{id:'question-1',question:'How does it work?',answer:'Start with a reference.'}]},
    {id:'feature',type:'feature',heading:'Featured work',body:'A closer look.',src:'/images/home-collage.webp',alt:'Handmade fursuit work',imageSide:'right'},
  ];
  content.pages[0].blocks=blocks;
  content.gallery[0].displayNumber='007';
  content.premades=[{id:'premade',name:'Example',image:'/images/home-collage.webp',alt:'Example',price:12.34,description:'Description',visible:true,imageFit:'contain',imagePositionX:25,imagePositionY:75}];
  content.site.showPremades=true;
  m.assertOwnerContent(content);
  const snapshot=m.createPublishedOwnerSnapshot(content,4,'2026-10-25T12:00:00.000Z');
  m.assertPublishedOwnerSnapshot(snapshot);
  assert.deepEqual(snapshot.content.pages[0].blocks,blocks);
  assert.equal(snapshot.content.gallery[0].displayNumber,'007');
  assert.equal(snapshot.content.premades[0].imageFit,'contain');
  assert.equal(snapshot.content.premades[0].imagePositionX,25);
  const normalized=m.publicContentToOwnerContent(snapshot.content);
  assert.deepEqual(normalized,content);
  normalized.pages[0].blocks[1].items[0]='changed';
  assert.equal(snapshot.content.pages[0].blocks[1].items[0],'First');
});
test('structured block constraints and optional image/number fields fail closed',()=>{
  for(const block of [
    {id:'b',type:'heading',text:'Heading',level:1},
    {id:'b',type:'heading',text:'',level:2},
    {id:'b',type:'list',style:'html',items:['Item']},
    {id:'b',type:'list',style:'bullet',items:['']},
    {id:'b',type:'divider',html:'<script>alert(1)</script>'},
    {id:'b',type:'spacer',size:'huge'},
    {id:'b',type:'faq',items:[{id:'q',question:'Question',answer:'Answer'},{id:'q',question:'Other',answer:'Answer'}]},
    {id:'b',type:'feature',heading:'',body:'',src:'javascript:alert(1)',alt:'Image',imageSide:'left'},
    {id:'b',type:'feature',heading:'',body:'',src:'/images/home-collage.webp',alt:'Image',imageSide:'top'},
  ]) { const content=d.createDefaultOwnerContent();content.pages[0].blocks=[block];assert.equal(m.validateOwnerContent(content).valid,false,block.type); }
  for(const value of [null,3,'a'.repeat(25)]) { const content=d.createDefaultOwnerContent();content.gallery[0].displayNumber=value;assert.equal(m.validateOwnerContent(content).valid,false); }
  for(const value of ['', '07', '12-A']) { const content=d.createDefaultOwnerContent();content.gallery[0].displayNumber=value;assert.equal(m.validateOwnerContent(content).valid,true); }
  const content=d.createDefaultOwnerContent();
  content.premades=[{id:'p',name:'Example',image:'/images/home-collage.webp',alt:'Example',price:null,description:'',visible:true,imagePositionX:-1}];
  assert.equal(m.validateOwnerContent(content).valid,false);
  content.premades[0].imagePositionX=101;assert.equal(m.validateOwnerContent(content).valid,false);
  content.premades[0].imagePositionX=NaN;assert.equal(m.validateOwnerContent(content).valid,false);
  content.premades[0].imagePositionX=50;content.premades[0].imageFit='stretch';assert.equal(m.validateOwnerContent(content).valid,false);
  assert.notEqual(m.validatePageSlug('taylor'),null);
});
test('published snapshots omit deleted built-ins without restoring defaults',()=>{
  const content=m.trashPage(d.createDefaultOwnerContent(),'builtin-terms');
  const snapshot=m.createPublishedOwnerSnapshot(content,2,'2026-10-25T12:00:00.000Z');
  assert.equal(snapshot.content.pages.some(page=>page.builtinKey==='terms'),false);
  m.assertPublishedOwnerSnapshot(snapshot);
  const normalized=m.publicContentToOwnerContent(snapshot.content);
  assert.equal(normalized.pages.some(page=>page.builtinKey==='terms'),false);
  assert.equal(m.validateOwnerContent(normalized).valid,false,'draft invariants still require trashed builtins to be retained');
  snapshot.content.pages=snapshot.content.pages.filter(page=>page.builtinKey!=='home');
  assert.throws(()=>m.assertPublishedOwnerSnapshot(snapshot),m.OwnerValidationError);
});
test('public validation rejects private fields, unsafe images, invalid money and snapshot metadata',()=>{
  const baseline=m.createPublishedOwnerSnapshot(d.createDefaultOwnerContent(),1,'2026-10-25T12:00:00.000Z');
  const mutations=[
    snapshot=>{snapshot.content.pages[0].trashedAt=null;},
    snapshot=>{snapshot.content.gallery[0].visible=true;},
    snapshot=>{snapshot.content.localPublished={};},
    snapshot=>{snapshot.content.home.image.src='data:image/png;base64,aGVsbG8=';},
    snapshot=>{snapshot.content.prices.parts[0].price=1.001;},
    snapshot=>{snapshot.revision=0;},
    snapshot=>{snapshot.publishedAt='not-a-date';},
    snapshot=>{snapshot.extra='private';},
    snapshot=>{snapshot.content.pages[0].blocks=[{id:'script',type:'html',html:'<b>hidden</b>'}];},
  ];
  for(const mutate of mutations){const snapshot=structuredClone(baseline);mutate(snapshot);assert.throws(()=>m.assertPublishedOwnerSnapshot(snapshot),m.OwnerValidationError);}
});

test('nonhome builtins have editable collision-safe slugs and exactly one canonical home', () => {
  let content = d.createDefaultOwnerContent();
  for (const page of content.pages.filter(page => page.builtinKey !== 'home')) {
    content = m.renamePage(content, page.id, { slug: `my-${page.builtinKey}` });
    assert.equal(content.pages.find(entry => entry.id === page.id).slug, `my-${page.builtinKey}`);
  }
  assert.throws(() => m.renamePage(content, 'builtin-prices', { slug: 'api' }), m.OwnerValidationError);
  assert.throws(() => m.renamePage(content, 'builtin-prices', { slug: 'my-gallery' }), m.OwnerValidationError);
  content = m.renamePage(content, 'builtin-prices', { slug: 'prices' });
  assert.equal(content.pages.find(page => page.builtinKey === 'prices').slug, 'prices');
  const root = content.pages.find(page => page.builtinKey === 'home');
  assert.equal(root.slug, '');
  root.availability = 'hidden'; assert.equal(m.validateOwnerContent(content).valid, false);
  root.availability = 'public'; root.slug = 'welcome'; assert.equal(m.validateOwnerContent(content).valid, false);
});

test('explicit main More unlisted and hidden states remain separate without migrating old drafts', () => {
  const content = d.createDefaultOwnerContent(), before = JSON.stringify(content);
  assert.ok(m.getVisibleNavigation(content).some(page => page.builtinKey === 'gallery'));
  assert.deepEqual(m.getMoreNavigation(content), []); assert.equal(JSON.stringify(content), before);
  const page = content.pages.find(page => page.builtinKey === 'gallery');
  page.navPlacement = 'more'; content.site.moreEnabled = true;
  assert.ok(m.getMoreNavigation(content).some(entry => entry.id === page.id));
  assert.ok(!m.getVisibleNavigation(content).some(entry => entry.id === page.id));
  assert.equal(m.isPageAvailable(content, page), true);
  content.site.moreEnabled = false; assert.deepEqual(m.getMoreNavigation(content), []);
  page.navPlacement = 'unlisted'; assert.equal(m.isPageAvailable(content, page), true);
  page.availability = 'hidden'; assert.equal(m.isPageAvailable(content, page), false);
  assert.ok(!m.createPublicContentSnapshot(content).pages.some(entry => entry.id === page.id));
  page.navPlacement = 'invented'; assert.equal(m.validateOwnerContent(content).valid, false);
});

test('bounded numeric appearance and private unreferenced fonts are safely projected', () => {
  const content = d.createDefaultOwnerContent();
  const id = '11111111-1111-4111-8111-111111111111', unused = '22222222-2222-4222-8222-222222222222';
  content.fonts = [{ id, name: 'Uploaded', src: `/api/fonts/${id}`, format: 'woff2' }, { id: unused, name: 'Unused draft', src: `/api/fonts/${unused}`, format: 'otf' }];
  content.design = { bodyFontSize: 18.5, headingFontSize: 48, bodyFontId: id };
  content.pages[0].blocks = [{ id: 'styled', type: 'text', heading: 'Heading', body: 'Body', appearance: { fontSize: 23.5, headingAlign: 'left', bodyAlign: 'right', widthPercent: 72.5, heightPercent: 120, fontId: id } }];
  m.assertOwnerContent(content);
  const snapshot = m.createPublicContentSnapshot(content);
  assert.deepEqual(snapshot.fonts, [content.fonts[0]]);
  assert.deepEqual(snapshot.design, content.design);
  assert.deepEqual(snapshot.pages[0].blocks, content.pages[0].blocks);
  m.assertPublicOwnerContent(snapshot);
  for (const bad of [{ fontSize: 0 }, { fontSize: 145 }, { fontSize: '18px' }, { widthPercent: 101 }, { heightPercent: Infinity }, { headingAlign: 'justify' }, { fontId: 'missing' }, { style: 'position:fixed' }]) {
    content.pages[0].blocks[0].appearance = bad;
    assert.equal(m.validateOwnerContent(content).valid, false, JSON.stringify(bad));
  }
  content.pages[0].blocks[0].appearance = {};
  content.fonts[0].src = 'https://attacker.test/font.woff2'; assert.equal(m.validateOwnerContent(content).valid, false);
});
