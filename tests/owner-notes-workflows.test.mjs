import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((r,j) => { resolve=r; reject=j; }); return { promise, resolve, reject }; };
async function portalFixture() {
  const h=harness();
  h.overrides['./HelpButton']={HelpButton:()=>null}; h.overrides['./TaylorServices']={TaylorServices:()=>null}; h.overrides['./CommissionRequests']={CommissionRequests:()=>null};
  let notifications=0; h.overrides['@/components/PublicSiteContext']={notifyPublicSitePublished:()=>notifications++};
  const initial=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
  initial.draft.premades=[{id:'premade-a',name:'Fox',image:'/images/heads.webp',alt:'Fox',description:'One fox',price:5,visible:false},{id:'premade-b',name:'Wolf',image:'/images/heads.webp',alt:'Wolf',description:'One wolf',price:6,visible:false}];
  let saved=structuredClone(initial), privateSaves=0, publications=0, itemPublications=[], gallerySaves=[], gate=null;
  const store={saveGallery:async(items,revision)=>{gallerySaves.push({items:structuredClone(items),revision});return {schemaVersion:1,revision:revision+1,updatedAt:new Date().toISOString(),items:structuredClone(items)};},readGallery:async()=>{throw Error('Private Gallery must not be read by website editing');},readPublication:async()=>null,publishSelected:async(c,r,pr,selection)=>{assert.equal(pr,0);assert.ok(selection.length);publications++;saved={...saved,draft:structuredClone(c),revision:saved.revision+1};return structuredClone(saved);},load:async()=>structuredClone(saved),subscribe:()=>()=>{},readLiveShopVisibility:async()=>false,
    saveDraft:async(c)=>{privateSaves++; saved={...saved,draft:structuredClone(c),revision:saved.revision+1,updatedAt:new Date().toISOString()};return structuredClone(saved);},
    publishLive:async(c)=>{publications++;saved={...saved,draft:structuredClone(c),revision:saved.revision+1};return structuredClone(saved);},
    publishPremadeLive:async(item,revision)=>{itemPublications.push({item:structuredClone(item),revision}); if(gate)await gate.promise; saved={...saved,draft:{...saved.draft,premades:saved.draft.premades.map(p=>p.id===item.id?structuredClone(item):p)},revision:saved.revision+1};return structuredClone(saved);}
  };
  const Component=h.load('src/owner/OwnerPortal.tsx').default, render=()=>h.render(Component,{store,initialSection:'pages',mode:'cloud',userEmail:'test@example.test',onSignOut:async()=>{}});
  const button=label=>h.find(n=>(n.type==='button'||n.type==='a')&&content(n).trim()===label), component=name=>h.find(n=>typeof n.type==='function'&&n.type.name===name), dialog=()=>component('Dialog');
  render();await flush();render();
  return {h,render,button,component,dialog,store,initial,get gallerySaves(){return gallerySaves;},get saved(){return saved;},get privateSaves(){return privateSaves;},get publications(){return publications;},get itemPublications(){return itemPublications;},get notifications(){return notifications;},set gate(v){gate=v;}};
}

test('photo save uses the full website save choice and draft save never publishes',async()=>{
 const t=await portalFixture();t.button('Photos').props.onClick();t.render();
 t.component('PhotoGalleryManager').props.onSavePhotos();t.render();
 assert.equal(t.dialog().props.title,'Save your changes');assert.equal(t.privateSaves,0);assert.equal(t.publications,0);
 const actions=nodes(t.dialog().props.actions).filter(n=>n.type==='button');assert.deepEqual(actions.map(content),['Keep editing','Save draft','Publish live']);
 await actions.find(n=>content(n)==='Save draft').props.onClick();t.render();assert.equal(t.privateSaves,1);assert.equal(t.publications,0);assert.equal(t.gallerySaves.length,0);assert.equal(t.dialog(),undefined);t.h.unmount();
});
test('full publish requires the explicit save-dialog action and never preliminarily saves',async()=>{
 const t=await portalFixture();t.button('Save').props.onClick();t.render();assert.equal(t.publications,0);assert.equal(t.privateSaves,0);
 nodes(t.dialog().props.actions).find(n=>n.type==='button'&&content(n)==='Publish live').props.onClick();await flush();t.render();assert.equal(t.publications,1);assert.equal(t.privateSaves,0);assert.equal(t.component('PublicationReview'),undefined);t.h.unmount();
});
test('publishing a selected premade preserves unrelated unsaved edits and updates only its baseline',async()=>{
  const t=await portalFixture();t.button('Premades').props.onClick();t.render();
  let manager=t.component('PremadesManager');manager.props.onEdit(d=>{d.home.title='UNSAVED HOME';d.premades[0].name='New fox';d.premades[1].name='PRIVATE WOLF';d.site.catalogMode=true;});t.render();
  manager=t.component('PremadesManager');manager.props.onPublishPremade(manager.props.content.premades[0]);t.render();
  assert.equal(t.itemPublications.length,0);const confirmation=nodes(t.dialog().props.actions).find(n=>(n.type==='button'||n.type==='a')&&content(n)==='Publish to store');
  const gate=deferred();t.gate=gate;confirmation.props.onClick();confirmation.props.onClick();t.render();assert.equal(t.itemPublications.length,1);assert.equal(t.notifications,0);
  gate.resolve();await flush();t.render();manager=t.component('PremadesManager');
  assert.equal(manager.props.content.home.title,'UNSAVED HOME');assert.equal(manager.props.content.premades[1].name,'PRIVATE WOLF');assert.equal(manager.props.content.site.catalogMode,true);
  assert.equal(manager.props.content.premades[0].visible,true);assert.equal(t.saved.draft.home.title,t.initial.draft.home.title);assert.equal(t.saved.draft.premades[1].name,'Wolf');assert.equal(t.saved.draft.site.catalogMode,undefined);
  assert.equal(t.notifications,1);assert.equal(t.publications,0);assert.equal(t.privateSaves,0);assert.match(content(t.h.tree),/unsaved changes/);assert.match(content(t.h.tree),/live shop is still hidden/);t.h.unmount();
});
test('Home template preview cannot inherit stale TOS builder selection',()=>{
  const h=harness(),pages=h.load('src/owner/defaults.ts').createDefaultOwnerContent().pages;
  const resolve=h.load('src/owner/owner-workflows.ts').resolveWorkspacePage;
  const tos=pages.find(p=>p.builtinKey==='terms');assert.equal(resolve(pages,'pages',tos.id).id,tos.id);
  assert.equal(resolve(pages,'home',tos.id,'home').builtinKey,'home');assert.equal(resolve(pages,'photos',tos.id,'gallery').builtinKey,'gallery');
  assert.equal(resolve(pages,'pages','missing').builtinKey,'home');h.unmount();
});
test('owner and public color preferences are independently persistent and fail safely without storage',()=>{
  const h=harness(), values=new Map();h.window.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const theme=h.load('src/components/ColorMode.tsx');assert.equal(theme.readColorMode('owner'),'dark');assert.equal(theme.readColorMode('public'),'light');
  theme.setColorMode('owner','light');assert.equal(theme.readColorMode('owner'),'light');assert.equal(theme.readColorMode('public'),'light');
  theme.setColorMode('public','dark');assert.equal(theme.readColorMode('owner'),'light');assert.equal(theme.readColorMode('public'),'dark');
  assert.deepEqual(JSON.parse(values.get('tmc-display-areas-v1')),{owner:'light',public:'dark'});
  h.window.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};theme.setColorMode('owner','light');assert.equal(theme.readColorMode('owner'),'light');
  assert.equal(theme.defaultColorMode('owner'),'dark');assert.equal(theme.defaultColorMode('public'),'light');h.unmount();
});

test('theme CSS isolates owner previews and checks dark text/control contrast',async()=>{
  const {readFileSync}=await import('node:fs');
  const css=readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8');
  assert.match(css,/\[data-owner-portal\]\[data-color-mode="dark"\]/);
  assert.match(css,/:not\(:where\(\[data-site-render-mode\],\[data-site-render-mode\] \*\)\)/);
  assert.match(css,/\[data-theme-scope="public"\]\[data-color-mode="dark"\]/);
  assert.match(css,/:not\(:where\(\[data-element-text-color\],\[data-element-text-color\] \*\)\)/);
  assert.match(css,/scrollbar-color:transparent transparent/);assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/scrollbar-width:none|overflow\s*:\s*hidden/);
  const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(s=>parseInt(s,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const [fg,bg] of [['#f5eff1','#2c2c2d'],['#c6b8be','#2c2c2d'],['#f5eff1','#30272e'],['#ffffff','#7f0011'],['#ffc0cc','#2c2c2d'],['#d0d0d0','#2c2c2d']])assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg} must be AA readable`);
});

test('SSR theme toggles use deterministic owner-dark/public-light snapshots even with browser choices',async()=>{
  const {readFileSync}=await import('node:fs');const {sourceLoader,appRequire:require}=await import('./scout-source-loader.mjs');
  const source=readFileSync(new URL('../src/components/ColorMode.tsx',import.meta.url),'utf8');
  const exports=sourceLoader()('src/components/ColorMode.tsx');
  const React=require('react'),{renderToString}=require('react-dom/server');
  const owner=renderToString(React.createElement(exports.ColorModeToggle,{scope:'owner'})),publicHtml=renderToString(React.createElement(exports.ColorModeToggle,{scope:'public'}));
  assert.match(owner,/aria-pressed="true"/);assert.match(owner,/title="Use light mode"/);assert.match(owner,/<svg/);assert.doesNotMatch(owner,/>Dark</);assert.match(publicHtml,/aria-pressed="false"/);assert.match(publicHtml,/title="Use dark mode"/);assert.match(publicHtml,/<svg/);assert.doesNotMatch(publicHtml,/>Light</);
  assert.doesNotMatch(source,/matchMedia|\.site\s*=|\.design\s*=|saveDraft|publishLive/);
});

test('page manager menu toggle updates explicit navigation placement, not only legacy flag',async()=>{
  const t=await portalFixture();let builder=t.component('OwnerVisualBuilder');const target=builder.props.content.pages.find(p=>p.builtinKey==='gallery');
  builder.props.onEdit(d=>{const page=d.pages.find(p=>p.id===target.id);page.navPlacement='more';page.showInNav=false;});t.render();builder=t.component('OwnerVisualBuilder');builder.props.onManagePages();t.render();
  const row=()=>nodes(t.dialog()).find(n=>n.key===target.id&&n.type==='div');
  assert.match(content(row()),/More dropdown · off/);nodes(row()).find(n=>(n.type==='button'||n.type==='a')&&content(n)==='Hide from menu').props.onClick();t.render();
  let page=t.component('OwnerVisualBuilder').props.content.pages.find(p=>p.id===target.id);assert.equal(page.navPlacement,'unlisted');assert.equal(page.showInNav,false);
  nodes(row()).find(n=>(n.type==='button'||n.type==='a')&&content(n)==='Show in menu').props.onClick();t.render();page=t.component('OwnerVisualBuilder').props.content.pages.find(p=>p.id===target.id);assert.equal(page.navPlacement,'main');assert.equal(page.showInNav,true);t.h.unmount();
});

test('actual public dark selectors override baseline home heading, white cards, and pink/white buttons',async()=>{
  const {readFileSync}=await import('node:fs');const postcss=(await import('postcss')).default;
  const css=postcss.parse(readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8'));
  const baseline=postcss.parse(readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8'));
  const rules=[];css.walkRules(rule=>rules.push(rule));const publicRules=rules.filter(rule=>rule.selector.startsWith('[data-theme-scope="public"][data-color-mode="dark"]'));
  const declaration=(rule,prop)=>rule.nodes.find(node=>node.type==='decl'&&node.prop===prop);
  const expectImportant=(rule,prop,value)=>{assert.ok(rule,`missing actual ${prop} rule`);const decl=declaration(rule,prop);assert.equal(decl?.value,value);assert.equal(decl?.important,true);};
  let hardcodedHome=false,hardcodedWhiteSurface=false;baseline.walkRules(rule=>{if(rule.selector.includes('.home-intro h1')&&declaration(rule,'color')?.value==='#111')hardcodedHome=true;if(rule.selector.includes('.empty-state')&&declaration(rule,'background')?.value==='#fff')hardcodedWhiteSurface=true;});
  assert.equal(hardcodedHome,true);assert.equal(hardcodedWhiteSurface,true);
  const heading=publicRules.find(rule=>rule.selector.includes(':is(.home-intro h1,.status-panel h2)'));
  expectImportant(heading,'color','#d0d0d0');assert.match(heading.selector,/\[data-element-text-color\]/);assert.doesNotMatch(heading.selector,/data-element-appearance|data-element-font/);
  const surfaces=publicRules.find(rule=>rule.selector.includes(':is(.price-card,.form-preview,.status-panel,.empty-state,.notice,.page-shell)'));
  expectImportant(surfaces,'background-color','#2c2c2d');assert.match(surfaces.selector,/\[data-element-background\]/);assert.doesNotMatch(surfaces.selector,/data-element-appearance|data-element-font/);
  expectImportant(publicRules.find(rule=>rule.selector.includes(' .page-shell:not(')),'background-color','#2c2c2d');
  const buttonBackground=publicRules.find(rule=>rule.selector.includes('.button:not(.outline):not(:disabled)')&&declaration(rule,'background'));
  const buttonText=publicRules.find(rule=>rule.selector.includes('.button:not(.outline):not(:disabled)')&&declaration(rule,'color'));
  expectImportant(buttonBackground,'background','#7f0011');expectImportant(buttonText,'color','#fff');
  assert.match(buttonBackground.selector,/data-element-background/);assert.match(buttonText.selector,/data-element-text-color/);
  assert.doesNotMatch(buttonBackground.selector+buttonText.selector,/data-element-appearance|data-element-font/);
});

test('Help neutral surface and light icon text override generic owner dark/hover selectors in both modes',async()=>{
  const {readFileSync}=await import('node:fs');const postcss=(await import('postcss')).default;
  const css=postcss.parse(readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8')),rules=[];css.walkRules(rule=>rules.push(rule));
  const selector='[data-owner-portal][data-color-mode] button[class*="helpButton"][aria-describedby="taylor-help-description"]:is(:enabled,:disabled)';
  const button=rules.find(rule=>rule.selector===selector),span=rules.find(rule=>rule.selector===selector+' > span');assert.ok(button);assert.ok(span);
  const value=(rule,property)=>rule.nodes.find(node=>node.type==='decl'&&node.prop===property);
  for(const [property,expected] of [['background-color','#2c2c2d'],['border-color','#85858c'],['color','#d0d0d0']]){assert.equal(value(button,property)?.value,expected);assert.equal(value(button,property)?.important,true);}
  assert.equal(value(span,'color')?.value,'#d0d0d0');assert.equal(value(span,'color')?.important,true);
  const hover=rules.find(rule=>rule.selector.includes('button:hover'));assert.ok(rules.indexOf(button)>rules.indexOf(hover),'Help exception follows generic hover rules');
  const source=readFileSync(new URL('../src/owner/HelpButton.tsx',import.meta.url),'utf8');assert.match(source,/className=\{styles.helpButton\}/);assert.match(source,/aria-describedby="taylor-help-description"/);
});

// Fox11: the private Gallery experiment is retired, not merged or deleted.
const galleryPhoto = id => ({id,name:id,src:'/images/heads.webp',alt:id,visible:true,width:100,height:100});
const dialogAction = (t,label) => nodes(t.dialog().props.actions).find(n=>n.type==='button'&&content(n)===label);
function editUnrelatedHome(t){const edit=t.component('OwnerVisualBuilder').props.onEdit;t.button('Photos').props.onClick();t.render();edit(d=>{d.home.title='UNSAVED HOME';});t.render();}
function savePhotosChoice(t){t.component('PhotoGalleryManager').props.onSavePhotos();t.render();}
test('Photos edits the current website draft with no private library controls or writes',async()=>{
 const t=await portalFixture();editUnrelatedHome(t);
 assert.equal(t.button('Gallery library'),undefined);assert.equal(t.button('Website draft'),undefined);
 t.component('PhotoGalleryManager').props.onEdit(d=>{d.gallery=[galleryPhoto('draft-photo')];});t.render();savePhotosChoice(t);
 await dialogAction(t,'Save draft').props.onClick();t.render();
 assert.equal(t.privateSaves,1);assert.equal(t.gallerySaves.length,0);assert.equal(t.publications,0);assert.equal(t.saved.draft.gallery[0].id,'draft-photo');assert.equal(t.saved.draft.home.title,'UNSAVED HOME');t.h.unmount();
});
test('gallery save choice cancellation preserves all unsaved website edits without writes',async()=>{
 const t=await portalFixture();editUnrelatedHome(t);
 t.component('PhotoGalleryManager').props.onEdit(d=>{d.gallery=[galleryPhoto('keep-me')];});t.render();savePhotosChoice(t);
 dialogAction(t,'Keep editing').props.onClick();t.render();
 assert.equal(t.component('PhotoGalleryManager').props.content.gallery[0].id,'keep-me');assert.equal(t.component('PhotoGalleryManager').props.content.home.title,'UNSAVED HOME');assert.equal(t.privateSaves,0);assert.equal(t.publications,0);assert.equal(t.gallerySaves.length,0);t.h.unmount();
});
test('full publish includes all current website edits, never privately saved Gallery items',async()=>{
 const t=await portalFixture();editUnrelatedHome(t);
 t.store.readGallery=async()=>({schemaVersion:1,revision:5,updatedAt:new Date().toISOString(),items:[galleryPhoto('PRIVATE-DO-NOT-PUBLISH')]});
 t.store.publishSelected=async()=>{throw Error('Selective publish is retired');};
 t.component('PhotoGalleryManager').props.onEdit(d=>{d.gallery=[galleryPhoto('website-photo')];});t.render();savePhotosChoice(t);
 dialogAction(t,'Publish live').props.onClick();await flush();t.render();
 assert.equal(t.publications,1);assert.equal(t.privateSaves,0);assert.equal(t.gallerySaves.length,0);assert.deepEqual(t.saved.draft.gallery.map(p=>p.id),['website-photo']);assert.equal(t.saved.draft.home.title,'UNSAVED HOME');t.h.unmount();
});
test('0331 page manager removes thumbnail placeholders and separates Add Page from the bordered list without changing trash guards',async()=>{const t=await portalFixture();t.component('OwnerVisualBuilder').props.onManagePages();t.render();const panel=nodes(t.dialog()).find(n=>n.props.className==='pageManagement');assert.ok(panel);assert.equal(nodes(panel).some(n=>n.props.className==='pageIcon'),false);const bar=nodes(panel).find(n=>String(n.props.className).includes('pageManagementActions'));assert.equal(nodes(bar).filter(n=>n.type==='button'&&content(n)==='Add Page').length,1);const cards=nodes(panel).filter(n=>n.type?.name==='Card');assert.equal(cards.length,1);assert.equal(nodes(cards[0]).some(n=>n.type==='button'&&content(n)==='Add Page'),false);const rows=nodes(cards[0]).filter(n=>n.props.className==='pageRow');assert.equal(rows.length,10);const home=rows.find(n=>content(n).includes('Home'));assert.equal(nodes(home).some(n=>n.props['aria-label']?.startsWith('Move page to Trash')),false);for(const row of rows.filter(n=>n!==home)){const trash=nodes(row).find(n=>n.props['aria-label']?.startsWith('Move page to Trash'));assert.ok(trash);assert.ok(nodes(trash).some(n=>n.type?.name==='TrashIcon'));}t.h.unmount();});
