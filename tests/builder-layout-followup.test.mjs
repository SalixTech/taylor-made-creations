import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';

const load = sourceLoader();
const {createDefaultOwnerContent} = load('src/owner/defaults.ts');
const {assignCanvasParent, resolveCanvasLayout} = load('src/owner/canvas-layout.ts');
const {initializeMobileLayout, reflowPageForMobile, reorderNavigationPages} = load('src/owner/builder-interactions.ts');
const {assertOwnerContent} = load('src/owner/model.ts');

test('responsive reflow targets one mobile page and preserves authored membership and desktop placement', () => {
  const draft = createDefaultOwnerContent();
  const page = draft.pages.find(item => item.builtinKey === 'prices');
  const other = draft.pages.find(item => item.builtinKey === 'suitcare');
  const placement = {matrix:{a:1,b:0,c:0,d:1,e:20,f:70},widthPx:340,heightPx:70};
  for (const item of [page, other]) {
    item.blocks.push({id:`frame-${item.builtinKey}`,type:'section',heading:''});
    const root = `block:frame-${item.builtinKey}`;
    assert.ok(assignCanvasParent(draft,item,root,null,false,placement));
    assert.ok(assignCanvasParent(draft,item,'page-title',root,false,placement));
  }
  reflowPageForMobile(draft,page.id);
  assert.equal(draft.design.mobileLayoutEnabled,true);
  assert.deepEqual(resolveCanvasLayout(draft,page)['page-title']?.placement,placement);
  const mobile = resolveCanvasLayout(draft,page,true)['page-title'];
  assert.equal(mobile.placement,undefined);
  assert.equal(mobile.parentId,'block:frame-prices');
  assert.deepEqual(resolveCanvasLayout(draft,other,true)['page-title'].placement,placement);
  assertOwnerContent(draft);
});

test('navigation drag reorders materialized header slots in both layouts', () => {
  const draft = createDefaultOwnerContent();
  const [home, gallery] = ['home', 'gallery'].map(key => draft.pages.find(page => page.builtinKey === key));
  const homeId = `canvas:layout.navigation:${home.id}`;
  const galleryId = `canvas:layout.navigation:${gallery.id}`;
  initializeMobileLayout(draft);
  for (const menu of [draft.chromeLayout.desktop, draft.chromeLayout.mobile]) assert.ok(menu[homeId].order < menu[galleryId].order);
  assert.equal(reorderNavigationPages(draft, gallery.id, home.id), true);
  assert.ok(gallery.order < home.order);
  for (const menu of [draft.chromeLayout.desktop, draft.chromeLayout.mobile]) {
    assert.ok(menu[galleryId].order < menu[homeId].order);
    assert.equal(menu[galleryId].parentId, 'canvas:layout.site.navigation');
  }
  assertOwnerContent(draft);
});
