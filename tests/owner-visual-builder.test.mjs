import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';

function setup(key = 'home', configure) {
  const h = harness();configure?.(h);
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload', OwnerUploadProvider: 'OwnerUploadProvider' };
  h.overrides['./PremadePhotoEditor'] = { PremadePhotoEditor: function PremadePhotoEditor() {} };
  let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  const edits = [], removes = [];
  let updates = 0, navigation = null;
  const props = { browsing: false, onBrowsingChange(value) { props.browsing = value; }, content: value, page: value.pages.find(p => p.builtinKey === key), onEdit(change) { const next = structuredClone(value); change(next); value = next; props.content = value; props.page = value.pages.find(p => p.id === props.page.id); edits.push(value); }, onPageChange(page) { navigation = page; }, onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove(...args) { removes.push(args); }, liveShopVisibility: false, canUpdateLiveShop: true, onUpdateLiveShop() { updates++; } };
  function render() { const result = h.render(Builder, props); for (const dom of h.refs.values()) dom.scrollIntoView = () => {}; return result; }
  const button = label => h.find(n => n.type === 'button' && content(n).trim() === label);
  const field = label => h.find(n => typeof n.type === 'function' && n.type.name === 'Field' && n.props.label === label);
  function select(key) { const canvas = h.find(n => n.props?.onClickCapture); const dom = canvas.props.ref.current; dom.dataset = { ownerEdit: key }; dom.closest = selector => selector === "[data-owner-edit]" ? dom : null; let prevented = false; canvas.props.onClickCapture({ target: dom, preventDefault() { prevented = true; }, stopPropagation() {} }); render(); return prevented; }
  render();
  return { h, props, render, button, field, select, edits, removes, get value() { return value; }, get updates() { return updates; }, get navigation() { return navigation; } };
}

test('the actual site is the builder and click-to-edit changes its supplied content', () => {
  const t = setup();
  let frame = t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame');
  assert.equal(frame.props.content, t.value); assert.equal(frame.props.editable, true);
  assert.equal(t.field('Main heading'), undefined, 'No separate editing form is shown by default');
  assert.equal(t.select('home-copy'), true);
  t.field('Main heading').props.onChange('A NEW WELCOME'); t.render();
  frame = t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame');
  assert.equal(frame.props.content.home.title, 'A NEW WELCOME');
  t.button('Done').props.onClick(); t.render();
  assert.equal(t.field('Main heading'), undefined);
  t.button('Exit edit mode').props.onClick(); t.render();
  frame = t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame');
  assert.equal(frame.props.editable, false, 'Visitor preview suppresses editor-only hidden content and hooks');
});

test('new gallery photo is inserted first and opens its editor immediately', () => {
  const t = setup('gallery'); const originalFirst = t.value.gallery[0].id;
  t.button('＋ Add a photo').props.onClick(); t.render();
  assert.equal(t.value.gallery[0].name, 'New photo'); assert.equal(t.value.gallery[1].id, originalFirst);
  assert.equal(t.field('Photo name').props.value, 'New photo');
  const imagePicker = t.h.find(n => typeof n.type === 'function' && n.type.name === 'ImagePicker');
  assert.equal(imagePicker.key, t.value.gallery[0].id);
});

test('photo upload completion uses stable identity even after photos reorder', () => {
  const t = setup('gallery'); const id = t.value.gallery[0].id;
  t.select(`gallery:${id}`);
  const picker = t.h.find(n => typeof n.type === 'function' && n.type.name === 'ImagePicker');
  t.props.onEdit(draft => { draft.gallery.reverse(); });
  picker.props.onSource('https://example.test/upload.webp'); t.render();
  assert.equal(t.value.gallery.find(p => p.id === id).src, 'https://example.test/upload.webp');
  assert.notEqual(t.value.gallery[0].id, id);
  assert.notEqual(t.value.gallery[0].src, 'https://example.test/upload.webp');
});

test('shop-off premades stay editable and changing toggle never publishes by itself', () => {
  const t = setup('premades');
  t.props.onEdit(draft => { draft.site.showPremades = false; }); t.render();
  t.button('＋ Add a premade').props.onClick(); t.render();
  assert.equal(t.field('Listing name').props.value, 'New premade');
  assert.equal(t.value.premades[0].visible, false);
  assert.equal(t.updates, 0);
  t.button('Done').props.onClick(); t.render(); t.select('shop');
  const toggle = t.h.find(n => typeof n.type === 'function' && n.type.name === 'Toggle' && n.props.label === 'Show the premade shop');
  toggle.props.onChange(true); t.render(); assert.equal(t.updates, 0);
  t.button('Update live').props.onClick(); assert.equal(t.updates, 1);
});

test('new sections edit in context and removal requires the parent confirmation', () => {
  const t = setup();
  t.button('Add Item').props.onClick(); t.render();
  t.button('＋Heading').props.onClick(); t.render();
  const block = t.value.pages.find(p => p.builtinKey === 'home').blocks.at(-1);
  const editor = t.h.find(n => n.type?.name === 'OwnerCanvasBoxTools');
  assert.ok(editor.props.onDelete);
  let removed = false; editor.props.onDelete();
  assert.equal(removed, false); assert.equal(t.removes.length, 1);
  assert.match(t.removes[0][1], /contents stay where they are/);
  const editsBefore = t.edits.length;
  t.removes[0][2](); t.render();
  assert.equal(removed, false, 'Legacy subtree callback must not run for canvas removal');
  assert.equal(t.edits.length, editsBefore + 1);
  assert.equal(t.value.pages.find(p => p.builtinKey === 'home').canvasLayout.desktop[`block:${block.id}`].removed, true);
  assert.ok(t.value.pages.find(p => p.builtinKey === 'home').blocks.some(item => item.id === block.id), 'Presentation removal retains source content for Undo');
});

test('a pending upload prevents changing selection or inserting another record', () => {
  const t = setup('gallery'); const count = t.value.gallery.length;
  t.props.uploadBusy = true; t.render(); t.button('＋ Add a photo').props.onClick(); t.render();
  assert.equal(t.value.gallery.length, count);
  t.select(`gallery:${t.value.gallery[0].id}`); assert.equal(t.field('Photo name'), undefined);
  const pagePicker = t.h.find(n => typeof n.type === 'function' && n.type.name === 'OwnerSelect');
  pagePicker.props.onChange(t.value.pages.find(p => p.builtinKey === 'home').id);
  assert.equal(t.navigation, null);
  assert.match(content(t.h.tree), /finish or cancel/);
});

test('an unknown live shop is not presented as an unpublished site or an actionable update', () => {
  const t = setup('premades');
  t.props.liveShopKnown = false; t.props.liveShopVisibility = null; t.props.liveShopReadError = 'Could not check the live shop';
  let retries = 0; t.props.onRetryLiveShop = () => { retries++; }; t.render(); t.select('shop');
  assert.match(content(t.h.tree), /Could not check/);
  assert.doesNotMatch(content(t.h.tree), /Not published yet|Publish the website once/);
  assert.equal(t.button('Update live'), undefined);
  t.button('Check again').props.onClick(); assert.equal(retries, 1);
});

test('pending upload keeps editor mounted through Done, close, Escape, exit edit mode and page navigation', () => {
  const t = setup('gallery'), id = t.value.gallery[0].id; t.select(`gallery:${id}`); assert.ok(t.field('Photo name'));
  t.props.uploadBusy = true; t.render();
  const close = () => t.h.find(n => n.type === 'button' && n.props['aria-label'] === 'Close section editor');
  assert.equal(t.button('Done').props.disabled, true); assert.equal(close().props.disabled, true); assert.equal(t.button('Exit edit mode').props.disabled, true);
  for (const action of [() => t.button('Done').props.onClick(), () => close().props.onClick(), () => t.h.find(n => n.type === 'aside').props.onKeyDown({ key: 'Escape', preventDefault() {} }), () => t.button('Exit edit mode').props.onClick(), () => t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame').props.onNavigate(t.value.pages.find(p => p.builtinKey === 'home'))]) { action(); t.render(); assert.ok(t.field('Photo name')); assert.equal(t.navigation, null); const frame = t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame'); assert.equal(frame.props.editable, true); }
  t.props.uploadBusy = false; t.render(); t.button('Done').props.onClick(); t.render(); assert.equal(t.field('Photo name'), undefined); t.h.unmount();
});

test('structured prices open in a roomy dialog using the same draft without navigation; preview retains actual layout viewport',()=>{
 const t=setup('prices');let exits=0;t.props.onPrices=()=>{exits++;};t.select('prices');assert.equal(t.h.find(n=>n.type?.name==='OwnerPricesManager'),undefined);t.button('Edit prices & options here').props.onClick();t.render();assert.equal(t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Prices & options').props.wide,true);const manager=t.h.find(n=>n.type?.name==='OwnerPricesManager');assert.ok(manager);manager.props.onEdit(draft=>{draft.prices.intro='Inline shared edit';});t.render();assert.equal(t.value.prices.intro,'Inline shared edit');assert.equal(exits,0);assert.equal(t.navigation,null);assert.equal(t.h.find(n=>n.type?.name==='SiteContentFrame').props.layoutViewport,'desktop');t.h.unmount();
});
test('independent mobile toggle snapshots appearances and preserves overrides when disabled',()=>{
 const t=setup();t.props.onEdit(draft=>{draft.pages[0].titleAppearance={textColor:'#123456'};});t.render();const toggle=()=>t.h.find(n=>n.type?.name==='Toggle'&&n.props.label==='Independent mobile layout');toggle().props.onChange(true);t.render();assert.equal(t.value.design.mobileLayoutEnabled,true);assert.equal(t.value.pages[0].titleAppearance.mobile.textColor,'#123456');toggle().props.onChange(false);t.render();assert.equal(t.value.design.mobileLayoutEnabled,false);assert.equal(t.value.pages[0].titleAppearance.mobile.textColor,'#123456');t.h.unmount();
});
test('palette adds independent content only by explicit click and foreign drops cannot attach it',()=>{
 const t=setup();t.props.onEdit(d=>{d.pages.find(p=>p.id===t.props.page.id).blocks=[{id:'container',type:'section',heading:'Container'}];});t.render();t.button('Add Item').props.onClick();t.render();const palette=t.button('＋Heading');assert.equal(palette.props.draggable,false);assert.equal(palette.props.onDragStart,undefined);const canvas=t.h.find(n=>n.props?.onDrop&&n.props?.onClickCapture),dom=canvas.props.ref.current;canvas.props.onDrop({target:dom,preventDefault(){},stopPropagation(){},dataTransfer:{getData(){return 'block:container';}}});assert.equal(t.props.page.blocks.length,1);palette.props.onClick();t.render();assert.equal(t.props.page.blocks.length,2);assert.equal(t.h.load('src/owner/canvas-layout.ts').resolveCanvasLayout(t.props.content,t.props.page)['block:'+t.props.page.blocks[1].id].parentId,null);t.h.unmount();
});
test('pending upload blocks layout switch and independent layout toggle without unmounting editor',()=>{const t=setup('gallery');t.select(`gallery:${t.value.gallery[0].id}`);t.props.uploadBusy=true;t.render();t.h.find(n=>n.props['aria-label']==='Mobile view').props.onClick();t.h.find(n=>n.type?.name==='Toggle'&&n.props.label==='Independent mobile layout').props.onChange(true);t.render();assert.equal(t.h.find(n=>n.type?.name==='SiteContentFrame').props.layoutViewport,'desktop');assert.notEqual(t.value.design?.mobileLayoutEnabled,true);assert.ok(t.field('Photo name'));t.h.unmount();});
test('actual mobile text toolbar saves mobile-only character styles while legacy appearance and shared text remain intact',()=>{const t=setup();t.props.onEdit(d=>{d.contentOverrides??={};d.contentOverrides.styles??={};d.contentOverrides.styles['home.title']={textColor:'#123456'};});t.render();t.h.find(n=>n.type?.name==='Toggle'&&n.props.label==='Independent mobile layout').props.onChange(true);t.render();t.h.find(n=>n.props['aria-label']==='Mobile view').props.onClick();t.render();t.select('core-text:home.title');assert.equal(t.h.find(n=>n.type?.name==='OwnerElementAppearance'),undefined);assert.ok(t.h.find(n=>n.type?.name==='OwnerCanvasTextEditor'));let editor=t.h.find(n=>n.type?.name==='OwnerCanvasTextEditor');assert.equal(editor.props.onCommit(t.value.home.title,'Shared copy'),true);t.render();editor=t.h.find(n=>n.type?.name==='OwnerCanvasTextEditor');editor.props.onSelection({start:0,end:1,value:'Shared copy'});t.render();const toolbar=t.h.find(n=>n.type?.name==='OwnerTextFormattingBar');assert.equal(toolbar.props.selected,true);toolbar.props.onStyle({color:'#abcdef'});t.render();assert.equal(t.value.contentOverrides.styles['home.title'].textColor,'#123456');assert.equal(t.value.contentOverrides.styles['home.title'].mobile.textColor,'#123456');assert.deepEqual(t.value.contentOverrides.inlineStyles['core:home.title'].spans,[]);assert.deepEqual(t.value.contentOverrides.inlineStyles['core:home.title'].mobile,[{start:0,end:1,style:{color:'#abcdef'}}]);assert.equal(t.value.home.title,'Shared copy');const frame=t.h.find(n=>n.type?.name==='SiteContentFrame');assert.equal(frame.props.layoutViewport,'mobile');assert.equal(frame.props.content.home.title,'Shared copy');t.h.unmount();});

test('foreign drop after window blur cannot create a native palette drag or write',()=>{const t=setup();t.button('Add Item').props.onClick();t.render();const canvas=t.h.find(n=>n.props?.onDrop&&n.props?.onClickCapture),dom=canvas.props.ref.current,target=Object.assign(new dom.constructor(),{dataset:{ownerSectionId:'__root'},closest(selector){return selector==='[data-owner-section-id]'?this:null;}});dom.contains=n=>n===target;const event={target,preventDefault(){},stopPropagation(){},dataTransfer:{setData(){},getData(){return 'forged';}}};const before=t.props.page.blocks.length;assert.equal(t.button('＋Heading').props.onDragStart,undefined);t.h.window.dispatchEvent(new Event('blur'));canvas.props.onDrop(event);assert.equal(t.props.page.blocks.length,before);t.h.unmount();});

test('hidden document foreign drop cannot create a native palette drag or write',()=>{const hidden=new Set();const t=setup('home',h=>{h.document.addEventListener=(type,fn)=>{if(type==='visibilitychange')hidden.add(fn);};h.document.removeEventListener=(type,fn)=>{if(type==='visibilitychange')hidden.delete(fn);};});t.button('Add Item').props.onClick();t.render();const canvas=t.h.find(n=>n.props?.onDrop&&n.props?.onClickCapture),dom=canvas.props.ref.current,target=Object.assign(new dom.constructor(),{dataset:{ownerSectionId:'__root'},closest(selector){return selector==='[data-owner-section-id]'?this:null;}});dom.contains=n=>n===target;const event={target,preventDefault(){},stopPropagation(){},dataTransfer:{setData(){}}};const before=t.props.page.blocks.length;assert.equal(t.button('＋Heading').props.onDragStart,undefined);t.h.document.visibilityState='hidden';for(const listener of hidden)listener();canvas.props.onDrop(event);assert.equal(t.props.page.blocks.length,before);t.h.unmount();});

test('workspace click selects safe leaf text into one native editor and exact shared text callback retains appearance',()=>{const t=setup();t.props.workspaceMode=true;t.props.onEdit(d=>{d.contentOverrides={styles:{'home.title':{textColor:'#112233',mobile:{textColor:'#445566'}}}};});t.render();t.select('core-text:home.title');let editor=t.h.find(n=>n.type?.name==='OwnerCanvasTextEditor');assert.ok(editor);assert.equal(t.h.all(n=>n.type==='aside').length,1);const original=t.value.home.title,before=structuredClone(t.value.contentOverrides);assert.equal(editor.props.onCommit(original,'New safe text'),true);t.render();assert.equal(t.value.home.title,'New safe text');assert.deepEqual(t.value.contentOverrides,before);assert.equal(editor.props.onCommit(original,'stale loss'),false);assert.equal(t.value.home.title,'New safe text');t.h.unmount();assert.equal(editor.props.onCommit('New safe text','unmounted loss'),false);});

test('inline callback refuses a stale selected target even when both synthetic targets have no layout frame',()=>{const t=setup();t.props.workspaceMode=true;t.render();t.select('core-text:home.title');const old=t.h.find(n=>n.type?.name==='OwnerCanvasTextEditor'),before=t.value.home.title;t.select('core-text:home.description');assert.equal(old.props.onCommit(before,'wrong target write'),false);assert.equal(t.value.home.title,before);t.h.unmount();});
