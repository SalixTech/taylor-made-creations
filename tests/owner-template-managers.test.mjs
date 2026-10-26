import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, nodes, content } from './owner-ui-harness.mjs';

function fixture(name, extra = {}) {
  const h = harness();
  const defaults = h.load('src/owner/defaults.ts');
  const Manager = h.load('src/owner/OwnerTemplateManagers.tsx')[name];
  let draft = defaults.createDefaultOwnerContent();
  let confirmation = null;
  const props = { content: draft, onEdit(change) { draft = structuredClone(draft); change(draft); }, onRemove(title, description, remove) { confirmation = { title, description, remove }; }, ...extra };
  function render() {
    h.render(Manager, { ...props, content: draft });
    for (const node of h.refs.values()) node.scrollIntoView = () => {};
  }
  const component = (type, label) => h.find(node => typeof node.type === 'function' && node.type.name === type && (label === undefined || node.props.label === label));
  const button = label => h.find(node => node.type === 'button' && content(node).trim() === label);
  const cards = () => h.all(node => typeof node.type === 'function' && node.type.name === 'Card');
  const cardAction = (card, label) => nodes(card.props.action).find(node => node.type === 'button' && content(node).trim() === label);
  render();
  return { h, props, render, component, button, cards, cardAction, get draft() { return draft; }, set draft(value) { draft = value; }, get confirmation() { return confirmation; } };
}

test('gallery uses template cards, preserves untouched data, and uploads new photos at top with saved dimensions', () => {
  const t = fixture('PhotoGalleryManager');
  const before = structuredClone(t.draft), firstId = before.gallery[0].id;
  const upload = t.component('PhotoUpload');
  assert.equal(upload.props.multiple, true);
  upload.props.onUploaded([{ name: 'Latest character', media: { src: '/api/media/00000000-0000-4000-8000-000000000001', width: 1200, height: 1600 } }]); t.render();
  assert.equal(t.draft.gallery[0].name, 'Latest character'); assert.equal(t.draft.gallery[0].visible, true);
  assert.equal(t.draft.gallery[0].width, 1200); assert.equal(t.draft.gallery[0].height, 1600);
  assert.equal(t.draft.gallery[1].id, firstId);
  assert.deepEqual(t.draft.prices, before.prices); assert.deepEqual(t.draft.premades, before.premades); assert.deepEqual(t.draft.pages, before.pages);
  assert.equal(t.component('OwnerVisualBuilder'), undefined); assert.equal(t.component('SiteContentFrame'), undefined);
  assert.equal(t.h.tree.props['data-template-manager'], 'photos');
  t.h.unmount();
});

test('gallery add existing opens familiar fields; display number stays independent of ordering', () => {
  const t = fixture('PhotoGalleryManager');
  t.button('＋ Add an existing photo').props.onClick(); t.render();
  const added = t.draft.gallery[0], second = t.draft.gallery[1].id;
  assert.equal(t.component('Field', 'Photo name').props.value, 'New photo');
  t.component('Field', 'Gallery number (optional)').props.onChange('TMC 42'); t.render();
  assert.equal(t.draft.gallery[0].displayNumber, 'TMC 42'); assert.equal(t.draft.gallery[0].id, added.id);
  const move = t.component('MoveButtons'); move.props.onMove(1); t.render();
  assert.equal(t.draft.gallery[0].id, second); assert.equal(t.draft.gallery[1].displayNumber, 'TMC 42');
  t.component('ImagePicker').props.onAlt('A front-facing red fox'); t.render();
  assert.equal(t.draft.gallery[1].alt, 'A front-facing red fox', 'editing follows stable photo id after reorder');
  t.component('Toggle', 'Show this photo in the gallery').props.onChange(false); t.render();
  assert.equal(t.draft.gallery[1].visible, false); assert.equal(t.draft.gallery.length > 1, true);
  t.h.unmount();
});

test('gallery removal requires parent confirmation and keeps other items', () => {
  const t = fixture('PhotoGalleryManager'); const original = structuredClone(t.draft.gallery);
  t.button('Remove').props.onClick();
  assert.deepEqual(t.draft.gallery, original); assert.match(t.confirmation.description, /does not delete the original image file/);
  t.confirmation.remove(); t.render();
  assert.deepEqual(t.draft.gallery, original.slice(1)); t.h.unmount();
});

function shopProps(overrides = {}) { return { liveShopVisibility: false, liveShopKnown: true, liveShopReadError: null, onRetryLiveShop() {}, canUpdateLiveShop: true, onUpdateLiveShop() {}, ...overrides }; }

test('hidden shop keeps listings editable; draft switch never invokes shop-only live action', () => {
  let updates = 0;
  const t = fixture('PremadesManager', shopProps({ onUpdateLiveShop() { updates++; } }));
  t.draft.site.showPremades = false; t.render();
  const beforePrices = structuredClone(t.draft.prices);
  t.button('＋ Add a premade').props.onClick(); t.render();
  assert.equal(t.draft.premades[0].visible, false); assert.equal(t.component('PremadePhotoEditor').props.item.id, t.draft.premades[0].id);
  t.component('Field', 'Listing name').props.onChange('Fox premade');
  t.component('Field', 'Price (USD, optional)').props.onChange('321.75'); t.render();
  assert.equal(t.draft.premades[0].price, 321.75); assert.equal(t.draft.premades[0].name, 'Fox premade');
  t.component('Toggle', 'Show the premade shop').props.onChange(true); t.render();
  assert.equal(updates, 0); assert.equal(t.button('Update live').props.disabled, false);
  t.button('Update live').props.onClick(); assert.equal(updates, 1);
  assert.deepEqual(t.draft.prices, beforePrices); assert.equal(t.component('OwnerVisualBuilder'), undefined);
  t.h.unmount();
});

test('premade photo manager receives unchanged cover/multiple photos and applies its complete patch by id', () => {
  const t = fixture('PremadesManager', shopProps());
  t.button('＋ Add a premade').props.onClick(); t.render();
  const id = t.draft.premades[0].id;
  const patch = { photos: [{ id: 'one', src: '/images/heads.webp', alt: 'Front' }, { id: 'two', src: '/images/partials.webp', alt: 'Back' }], coverPhotoId: 'two', image: '/images/partials.webp', alt: 'Back', imageFit: 'cover', imagePositionX: 30, imagePositionY: 65 };
  t.component('PremadePhotoEditor').props.onChange(patch); t.render();
  assert.equal(t.component('PremadePhotoEditor').props.item.id, id);
  for (const [key, value] of Object.entries(patch)) assert.deepEqual(t.draft.premades[0][key], value);
  t.component('Field', 'Price (USD, optional)').props.onChange(''); t.render(); assert.equal(t.draft.premades[0].price, null);
  t.h.unmount();
});

test('shop-only Update live unavailable before first publish or when live visibility is unknown', () => {
  let updates = 0, retries = 0;
  const t = fixture('PremadesManager', shopProps({ liveShopVisibility: null, onUpdateLiveShop() { updates++; }, onRetryLiveShop() { retries++; } }));
  assert.equal(t.button('Update live').props.disabled, true);
  t.button('Update live').props.onClick(); assert.equal(updates, 0);
  t.props.liveShopKnown = false; t.props.liveShopReadError = 'Could not check the live shop.'; t.render();
  assert.equal(t.button('Update live'), undefined); assert.match(content(t.h.tree), /Could not check the live shop/);
  t.button('Check again').props.onClick(); assert.equal(retries, 1); assert.equal(updates, 0); t.h.unmount();
});

test('home manager changes template copy/photo without exposing canvas or section palette', () => {
  const t = fixture('HomePageManager'); const pages = structuredClone(t.draft.pages);
  t.component('Field', 'Main heading').props.onChange('Welcome, makers');
  t.component('Field', 'Caption beneath the main photo').props.onChange('My newest work');
  t.component('ImagePicker').props.onSource('/images/heads.webp'); t.render();
  assert.equal(t.draft.home.title, 'Welcome, makers'); assert.equal(t.draft.home.caption, 'My newest work'); assert.equal(t.draft.home.image.src, '/images/heads.webp');
  assert.deepEqual(t.draft.pages, pages); assert.equal(t.component('OwnerVisualBuilder'), undefined); assert.equal(t.component('OwnerBlocksEditor'), undefined);
  assert.match(content(t.h.tree), /separate Website builder tab/); t.h.unmount();
});

test('contact settings retains commission controls, cleans social handles and only requests Cloud Sync', () => {
  let syncs = 0;
  const t = fixture('ContactSettingsManager', { userEmail: 'owner@example.test', onSync() { syncs++; } });
  t.component('Field', 'Telegram username').props.onChange('@maker');
  t.component('Field', 'TikTok username').props.onChange('@taylor');
  t.component('Field', 'Twitch username').props.onChange('@streamer');
  t.component('OwnerSelect', 'Commission status').props.onChange('Closed'); t.render();
  assert.equal(t.draft.site.telegram, 'maker'); assert.equal(t.draft.site.tiktok, 'taylor'); assert.equal(t.draft.site.twitch, 'streamer'); assert.equal(t.draft.site.commissionStatus, 'Closed');
  assert.equal(syncs, 0); t.button('Cloud Sync').props.onClick(); assert.equal(syncs, 1);
  assert.match(content(t.h.tree), /owner@example.test/); assert.match(content(t.h.tree), /never silently replaces unsaved work/);
  assert.equal(t.component('OwnerVisualBuilder'), undefined); t.h.unmount();
});

test('template managers reuse current upload and multi-photo tools rather than old single-photo controls', () => {
  const source = readFileSync(new URL('../src/owner/OwnerTemplateManagers.tsx', import.meta.url), 'utf8');
  assert.match(source, /draft\.gallery\.unshift/); assert.match(source, /<PhotoUpload multiple/); assert.match(source, /<PremadePhotoEditor/);
  assert.doesNotMatch(source, /OwnerVisualBuilder|publishLive|saveDraft|localStorage|fetch\(/);
});
