import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';

// Current source with synthetic hooks and stores; no real login or network writes.
const flush = () => new Promise(resolve => setImmediate(resolve));
async function portalFixture() {
  const h = harness();
  h.overrides['./HelpButton'] = { HelpButton: () => null };
  h.overrides['./TaylorServices'] = { TaylorServices: () => null };
  h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
  const defaults = h.load('src/owner/defaults.ts');
  const saved = defaults.createInitialOwnerWorkspace();
  let loads = 0, writes = 0;
  const store = {
    load: async () => { loads++; return structuredClone(saved); },
    subscribe: () => () => {},
    saveDraft: async () => { writes++; throw Error('Viewing must not save'); },
    publishLive: async () => { writes++; throw Error('Viewing must not publish'); },
    publishLocal: async () => { writes++; throw Error('Viewing must not snapshot'); },
  };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  const props = { store, initialSection: 'pages', mode: 'cloud', userEmail: 'owner@example.test', onSignOut: async () => {} };
  const render = () => h.render(Portal, props);
  const builder = () => h.find(node => node.type?.name === 'OwnerVisualBuilder');
  const button = label => h.find(node => (node.type === 'button' || node.type === 'a') && content(node).trim() === label);
  render(); await flush(); render();
  return { h, props, render, builder, button, saved, get loads() { return loads; }, get writes() { return writes; } };
}

function builderFixture(browsing = true) {
  const h = harness();
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload', OwnerUploadProvider: 'OwnerUploadProvider' };
  h.overrides['./PremadePhotoEditor'] = { PremadePhotoEditor: () => null };
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  let draft = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const edits = [], modeChanges = [], navigation = [];
  const props = {
    browsing, onBrowsingChange(value) { modeChanges.push(value); props.browsing = value; },
    content: draft, page: draft.pages[0],
    onEdit(change) { draft = structuredClone(draft); change(draft); props.content = draft; props.page = draft.pages.find(page => page.id === props.page.id); edits.push(draft); },
    onPageChange(page) { navigation.push(page.id); props.page = page; },
    onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove() {},
    liveShopVisibility: false, canUpdateLiveShop: false, onUpdateLiveShop() {},
  };
  const render = () => h.render(Builder, props);
  const button = label => h.find(node => (node.type === 'button' || node.type === 'a') && content(node).trim() === label);
  const frame = () => h.find(node => node.type?.name === 'SiteContentFrame');
  const field = label => h.find(node => node.type?.name === 'Field' && node.props.label === label);
  render();
  return { h, props, render, button, frame, field, edits, modeChanges, navigation, get draft() { return draft; } };
}

test('explicit builder entry starts in private read-only website view and links to the protected saved preview', async () => {
  const t = await portalFixture();
  assert.equal(t.builder().props.browsing, true);
  assert.equal(typeof t.builder().props.onBrowsingChange, 'function');
  assert.equal(t.loads, 1); assert.equal(t.writes, 0);
  const savedSite = t.h.find(node => node.type === 'a' && /View saved site/.test(content(node)));
  assert.ok(savedSite); assert.equal(savedSite.props.href, '/taylor/preview');
  assert.equal(t.h.find(node => node.type?.name === 'Dialog'), undefined);
  t.h.unmount();
});

test('workspace view/edit preference survives keyed page navigation instead of snapping back into editing', async () => {
  const t = await portalFixture();
  const original = t.builder(), gallery = original.props.content.pages.find(page => page.builtinKey === 'gallery');
  original.props.onPageChange(gallery); t.render();
  assert.equal(t.builder().props.page.id, gallery.id);
  assert.notEqual(t.builder().key, original.key, 'page changes still reset page-specific selection');
  assert.equal(t.builder().props.browsing, true, 'read-only mode belongs to workspace, not keyed page');
  t.builder().props.onBrowsingChange(false); t.render();
  t.builder().props.onPageChange(t.builder().props.content.pages.find(page => page.builtinKey === 'terms')); t.render();
  assert.equal(t.builder().props.browsing, false, 'explicit editing remains selected until exited');
  t.builder().props.onBrowsingChange(true); t.render();
  t.builder().props.onPageChange(t.builder().props.content.pages[0]); t.render();
  assert.equal(t.builder().props.browsing, true); assert.equal(t.writes, 0);
  t.h.unmount();
});

test('repeated exit and re-entry preserve unsaved changes without saving, publishing, or opening a discard prompt', async () => {
  const t = await portalFixture();
  t.builder().props.onBrowsingChange(false); t.render();
  t.builder().props.onEdit(draft => { draft.home.title = 'KEEP UNSAVED PRIVATE WORK'; }); t.render();
  const edited = structuredClone(t.builder().props.content);
  for (const browsing of [true, true, false, false, true]) {
    t.builder().props.onBrowsingChange(browsing); t.render();
    assert.equal(t.builder().props.browsing, browsing);
    assert.deepEqual(t.builder().props.content, edited);
    assert.equal(t.h.find(node => node.type?.name === 'Dialog'), undefined);
  }
  assert.match(content(t.h.tree), /unsaved changes/);
  assert.notEqual(t.saved.draft.home.title, edited.home.title); assert.equal(t.writes, 0); assert.equal(t.loads, 1);
  t.h.unmount();
});

test('management tabs stay standalone and returning to Website builder keeps the chosen view mode', async () => {
  const t = await portalFixture();
  for (const label of ['Photos', 'Premades', 'Home page', 'Prices & options']) {
    t.button(label).props.onClick(); t.render();
    assert.equal(t.builder(), undefined, label);
  }
  t.button('Website builder').props.onClick(); t.render();
  assert.equal(t.builder().props.browsing, true); assert.equal(t.writes, 0);
  t.h.unmount();
});

test('normal website view has navigation and sizing but no editor targets, mutation controls, or editing panels', () => {
  const t = builderFixture();
  assert.equal(t.frame().props.editable, false);
  assert.equal(t.button('View website').props['aria-pressed'], true);
  assert.ok(t.button('Edit website'));
  assert.ok(t.h.find(node => node.type?.name === 'OwnerSelect' && node.props.label === 'Viewing page'));
  assert.ok(t.h.find(node => node.props['aria-label'] === 'Desktop view'));
  assert.ok(t.h.find(node => node.props['aria-label'] === 'Mobile view'));
  for (const label of ['Design', 'Header & footer', 'Page settings', 'Manage pages', '＋ New page', 'Page content', '＋ Add a section']) assert.equal(t.button(label), undefined, label);
  assert.equal(t.h.find(node => node.type?.name === 'OwnerHeaderEditor'), undefined);
  assert.equal(t.h.find(node => node.type === 'aside'), undefined);
  const canvas = t.h.find(node => node.props.onClickCapture), dom = canvas.props.ref.current;
  dom.dataset = { ownerEdit: 'home-copy' }; dom.closest = () => dom;
  canvas.props.onClickCapture({ target: dom, preventDefault() { throw Error('View must not intercept as edit'); }, stopPropagation() { throw Error('View must not intercept as edit'); } });
  assert.equal(t.edits.length, 0); assert.deepEqual(t.modeChanges, []);
  t.frame().props.onNavigate(t.draft.pages.find(page => page.builtinKey === 'gallery')); t.render();
  assert.equal(t.props.browsing, true); assert.equal(t.frame().props.editable, false); assert.equal(t.navigation.length, 1);
  t.h.unmount();
});

test('Edit website and Exit edit mode are explicit, close editing tools, and keep the unsaved canvas intact', () => {
  const t = builderFixture();
  t.button('Edit website').props.onClick(); t.render();
  assert.equal(t.frame().props.editable, true);
  t.button('Welcome text').props.onClick(); t.render();
  t.field('Main heading').props.onChange('PRIVATE EDIT STAYS'); t.render();
  assert.ok(t.h.find(node => node.type === 'aside'));
  t.button('Exit edit mode').props.onClick(); t.render();
  assert.equal(t.props.browsing, true); assert.equal(t.frame().props.editable, false);
  assert.equal(t.h.find(node => node.type === 'aside'), undefined);
  assert.equal(t.h.find(node => node.type?.name === 'OwnerHeaderEditor'), undefined);
  assert.equal(t.frame().props.content.home.title, 'PRIVATE EDIT STAYS');
  t.button('Edit website').props.onClick(); t.render();
  assert.equal(t.h.find(node => node.type === 'aside'), undefined, 'old editor selection does not reopen');
  assert.equal(t.frame().props.content.home.title, 'PRIVATE EDIT STAYS'); assert.equal(t.edits.length, 1);
  assert.deepEqual(t.modeChanges, [false, true, false]);
  t.h.unmount();
});

test('upload locks both entry to and exit from edit mode without losing the current page', () => {
  for (const browsing of [true, false]) {
    const t = builderFixture(browsing); t.props.uploadBusy = true; t.render();
    const target = t.button(browsing ? 'Edit website' : 'Exit edit mode');
    assert.equal(target.props.disabled, true); target.props.onClick(); t.render();
    assert.equal(t.props.browsing, browsing); assert.deepEqual(t.modeChanges, []);
    assert.equal(t.frame().props.page.id, t.draft.pages[0].id);
    t.h.unmount();
  }
});


test('closing the full preview returns to the same view or edit mode and preserves unsaved content', async () => {
  for (const browsing of [true, false]) {
    const t = await portalFixture();
    t.builder().props.onBrowsingChange(false); t.render();
    t.builder().props.onEdit(draft => { draft.home.title = 'KEEP THROUGH MODAL'; }); t.render();
    t.builder().props.onBrowsingChange(browsing); t.render();
    for (const closeWithButton of [false, true]) {
      t.button('Preview').props.onClick(); t.render();
      const dialog = t.h.find(node => node.type?.name === 'Dialog');
      assert.equal(dialog.props.title, 'Your draft preview');
      if (closeWithButton) nodes(dialog.props.actions).find(node => (node.type === 'button' || node.type === 'a') && content(node) === 'Back to workspace').props.onClick();
      else dialog.props.onClose();
      t.render();
      assert.equal(t.h.find(node => node.type?.name === 'Dialog'), undefined);
      assert.equal(t.builder().props.browsing, browsing);
      assert.equal(t.builder().props.content.home.title, 'KEEP THROUGH MODAL');
    }
    assert.equal(t.writes, 0); assert.equal(t.loads, 1); t.h.unmount();
  }
});

test('workspace-level upload lock rejects a stale mode-toggle callback before the next render', async () => {
  const t = await portalFixture(), changeMode = t.builder().props.onBrowsingChange;
  const provider = t.h.find(node => node.type?.name === 'OwnerUploadProvider');
  provider.props.onBusyChange(true);
  changeMode(false); t.render();
  assert.equal(t.builder().props.browsing, true);
  provider.props.onBusyChange(false);
  t.builder().props.onBrowsingChange(false); t.render();
  assert.equal(t.builder().props.browsing, false); assert.equal(t.writes, 0);
  t.h.unmount();
});
