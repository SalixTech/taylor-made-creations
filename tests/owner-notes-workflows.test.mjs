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
  let saved=structuredClone(initial), privateSaves=0, publications=0, itemPublications=[], gate=null;
  const store={load:async()=>structuredClone(saved),subscribe:()=>()=>{},readLiveShopVisibility:async()=>false,
    saveDraft:async(c)=>{privateSaves++; saved={...saved,draft:structuredClone(c),revision:saved.revision+1,updatedAt:new Date().toISOString()};return structuredClone(saved);},
    publishLive:async(c)=>{publications++;saved={...saved,draft:structuredClone(c),revision:saved.revision+1};return structuredClone(saved);},
    publishPremadeLive:async(item,revision)=>{itemPublications.push({item:structuredClone(item),revision}); if(gate)await gate.promise; saved={...saved,draft:{...saved.draft,premades:saved.draft.premades.map(p=>p.id===item.id?structuredClone(item):p)},revision:saved.revision+1};return structuredClone(saved);}
  };
  const Component=h.load('src/owner/OwnerPortal.tsx').default, render=()=>h.render(Component,{store,initialSection:'pages',mode:'cloud',userEmail:'test@example.test',onSignOut:async()=>{}});
  const button=label=>h.find(n=>(n.type==='button'||n.type==='a')&&content(n).trim()===label), component=name=>h.find(n=>typeof n.type==='function'&&n.type.name===name), dialog=()=>component('Dialog');
  render();await flush();render();
  return {h,render,button,component,dialog,store,initial,get saved(){return saved;},get privateSaves(){return privateSaves;},get publications(){return publications;},get itemPublications(){return itemPublications;},get notifications(){return notifications;},set gate(v){gate=v;}};
}

test('photo save opens existing chooser, both cards are real buttons and footer controls remain',async()=>{
  const t=await portalFixture();t.button('Photos').props.onClick();t.render();
  t.component('PhotoGalleryManager').props.onSavePhotos();t.render();
  assert.equal(t.dialog().props.title,'Save your changes');assert.equal(t.privateSaves,0);assert.equal(t.publications,0);
  const card=nodes(t.dialog()).find(n=>(n.type==='button'||n.type==='a')&&content(n).startsWith('Save draftSave privately'));
  assert.ok(card); assert.ok(nodes(t.dialog().props.actions).some(n=>(n.type==='button'||n.type==='a')&&content(n)==='Save draft'));
  await card.props.onClick();t.render();assert.equal(t.privateSaves,1);assert.equal(t.publications,0);assert.equal(t.dialog(),undefined);t.h.unmount();
});
test('publish card and footer share duplicate lock and only report acknowledged publication',async()=>{
  const t=await portalFixture();t.button('Save →').props.onClick();t.render();
  const card=nodes(t.dialog()).find(n=>(n.type==='button'||n.type==='a')&&content(n).startsWith('Publish liveSave and publish'));
  assert.ok(card);await card.props.onClick();t.render();assert.equal(t.publications,1);assert.equal(t.privateSaves,0);t.h.unmount();
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
test('owner and public color preferences are independent, persistent and fail safely without storage',()=>{
  const h=harness(), values=new Map();h.window.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const theme=h.load('src/components/ColorMode.tsx');assert.equal(theme.readColorMode('owner'),'dark');assert.equal(theme.readColorMode('public'),'light');
  theme.setColorMode('owner','light');assert.equal(theme.readColorMode('owner'),'light');assert.equal(theme.readColorMode('public'),'light');
  theme.setColorMode('public','dark');assert.equal(theme.readColorMode('owner'),'light');assert.equal(theme.readColorMode('public'),'dark');
  assert.equal(values.get('tmc-owner-color-mode'),'light');assert.equal(values.get('tmc-public-color-mode'),'dark');
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
  for(const [fg,bg] of [['#f5eff1','#241f24'],['#c6b8be','#241f24'],['#f5eff1','#30272e'],['#ffffff','#970d2a'],['#ffc0cc','#241f24'],['#f4edf0','#18151a']])assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg} must be AA readable`);
});

test('SSR theme toggles use deterministic owner-dark/public-light snapshots even with browser choices',async()=>{
  const {readFileSync}=await import('node:fs');const ts=(await import('typescript')).default;const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
  const source=readFileSync(new URL('../src/components/ColorMode.tsx',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('require','exports','window',code)(require,exports,{localStorage:{getItem:key=>key.includes('owner')?'light':'dark'}});
  const React=require('react'),{renderToString}=require('react-dom/server');
  const owner=renderToString(React.createElement(exports.ColorModeToggle,{scope:'owner'})),publicHtml=renderToString(React.createElement(exports.ColorModeToggle,{scope:'public'}));
  assert.match(owner,/aria-pressed="true"/);assert.match(owner,/>Dark</);assert.match(publicHtml,/aria-pressed="false"/);assert.match(publicHtml,/>Light</);
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
  expectImportant(heading,'color','#f4edf0');assert.match(heading.selector,/\[data-element-text-color\]/);assert.doesNotMatch(heading.selector,/data-element-appearance|data-element-font/);
  const surfaces=publicRules.find(rule=>rule.selector.includes(':is(.price-card,.form-preview,.status-panel,.empty-state,.notice,.page-shell)'));
  expectImportant(surfaces,'background-color','#241f24');assert.match(surfaces.selector,/\[data-element-background\]/);assert.doesNotMatch(surfaces.selector,/data-element-appearance|data-element-font/);
  expectImportant(publicRules.find(rule=>rule.selector.includes(' .page-shell:not(')),'background-color','#18151a');
  const buttonBackground=publicRules.find(rule=>rule.selector.includes('.button:not(.outline):not(:disabled)')&&declaration(rule,'background'));
  const buttonText=publicRules.find(rule=>rule.selector.includes('.button:not(.outline):not(:disabled)')&&declaration(rule,'color'));
  expectImportant(buttonBackground,'background','#970d2a');expectImportant(buttonText,'color','#fff');
  assert.match(buttonBackground.selector,/data-element-background/);assert.match(buttonText.selector,/data-element-text-color/);
  assert.doesNotMatch(buttonBackground.selector+buttonText.selector,/data-element-appearance|data-element-font/);
});

test('Help blue and dark icon text override generic owner dark/hover selectors in both modes',async()=>{
  const {readFileSync}=await import('node:fs');const postcss=(await import('postcss')).default;
  const css=postcss.parse(readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8')),rules=[];css.walkRules(rule=>rules.push(rule));
  const selector='[data-owner-portal][data-color-mode] button[class*="helpButton"][aria-describedby="taylor-help-description"]:is(:enabled,:disabled)';
  const button=rules.find(rule=>rule.selector===selector),span=rules.find(rule=>rule.selector===selector+' > span');assert.ok(button);assert.ok(span);
  const value=(rule,property)=>rule.nodes.find(node=>node.type==='decl'&&node.prop===property);
  for(const [property,expected] of [['background-color','#54a6eb'],['border-color','#54a6eb'],['color','#102a40']]){assert.equal(value(button,property)?.value,expected);assert.equal(value(button,property)?.important,true);}
  assert.equal(value(span,'color')?.value,'#102a40');assert.equal(value(span,'color')?.important,true);
  const hover=rules.find(rule=>rule.selector.includes('button:hover'));assert.ok(rules.indexOf(button)>rules.indexOf(hover),'Help exception follows generic hover rules');
  const source=readFileSync(new URL('../src/owner/HelpButton.tsx',import.meta.url),'utf8');assert.match(source,/className=\{styles.helpButton\}/);assert.match(source,/aria-describedby="taylor-help-description"/);
});
