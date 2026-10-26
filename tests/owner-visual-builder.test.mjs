import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';

function setup(key = 'home') {
  const h = harness();
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload', OwnerUploadProvider: 'OwnerUploadProvider' };
  h.overrides['./PremadePhotoEditor'] = { PremadePhotoEditor: function PremadePhotoEditor() {} };
  let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  const edits = [], removes = [];
  let updates = 0, navigation = null;
  const props = { content: value, page: value.pages.find(p => p.builtinKey === key), onEdit(change) { const next = structuredClone(value); change(next); value = next; props.content = value; props.page = value.pages.find(p => p.id === props.page.id); edits.push(value); }, onPageChange(page) { navigation = page; }, onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove(...args) { removes.push(args); }, liveShopVisibility: false, canUpdateLiveShop: true, onUpdateLiveShop() { updates++; } };
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
  t.button('Preview').props.onClick(); t.render();
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
  const toggle = t.h.find(n => typeof n.type === 'function' && n.type.name === 'Toggle');
  toggle.props.onChange(true); t.render(); assert.equal(t.updates, 0);
  t.button('Update live').props.onClick(); assert.equal(t.updates, 1);
});

test('new sections edit in context and removal requires the parent confirmation', () => {
  const t = setup();
  t.button('＋ Add a section').props.onClick(); t.render();
  t.button('＋Heading').props.onClick(); t.render();
  const block = t.value.pages.find(p => p.builtinKey === 'home').blocks.at(-1);
  const editor = t.h.find(n => typeof n.type === 'function' && n.type.name === 'OwnerBlocksEditor');
  assert.equal(editor.props.focusedBlockId, block.id); assert.equal(editor.props.hideAddPalette, true);
  let removed = false; editor.props.onRemove(block, () => { removed = true; });
  assert.equal(removed, false); assert.equal(t.removes.length, 1);
  t.removes[0][2](); assert.equal(removed, true);
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

test('pending upload keeps editor mounted through Done, close, Escape, Preview and page navigation', () => {
  const t = setup('gallery'), id = t.value.gallery[0].id; t.select(`gallery:${id}`); assert.ok(t.field('Photo name'));
  t.props.uploadBusy = true; t.render();
  const close = () => t.h.find(n => n.type === 'button' && n.props['aria-label'] === 'Close section editor');
  assert.equal(t.button('Done').props.disabled, true); assert.equal(close().props.disabled, true); assert.equal(t.button('Preview').props.disabled, true);
  for (const action of [() => t.button('Done').props.onClick(), () => close().props.onClick(), () => t.h.find(n => n.type === 'aside').props.onKeyDown({ key: 'Escape', preventDefault() {} }), () => t.button('Preview').props.onClick(), () => t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame').props.onNavigate(t.value.pages.find(p => p.builtinKey === 'home'))]) { action(); t.render(); assert.ok(t.field('Photo name')); assert.equal(t.navigation, null); const frame = t.h.find(n => typeof n.type === 'function' && n.type.name === 'SiteContentFrame'); assert.equal(frame.props.editable, true); }
  t.props.uploadBusy = false; t.render(); t.button('Done').props.onClick(); t.render(); assert.equal(t.field('Photo name'), undefined); t.h.unmount();
});
