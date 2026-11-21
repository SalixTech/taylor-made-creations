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
  const allNodes = () => [...nodes(h.tree), ...h.all(node => node.type?.name === 'Card').flatMap(card => nodes(card.props.action)), ...h.all(node => node.type?.name === 'OwnerPriceReorderList').flatMap(list => list.props.items.flatMap(item => nodes(list.props.children(item, null))))];
  const component = (type, label) => allNodes().find(node => typeof node.type === 'function' && node.type.name === type && (label === undefined || node.props.label === label));
  const button = label => allNodes().find(node => node.type === 'button' && (content(node).trim() === label || node.props['aria-label'] === label || node.props.title === label));
  const cards = () => allNodes().filter(node => typeof node.type === 'function' && node.type.name === 'Card');
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
  t.button('Add existing photo').props.onClick(); t.render();
  const original = structuredClone(t.draft.gallery);
  assert.equal(t.component('Field', 'Photo name').props.value, 'New photo');
  t.component('Field', 'Gallery number (optional)').props.onChange('TMC 42'); t.render();
  assert.deepEqual(t.draft.gallery,original);
  nodes(t.component('Dialog').props.actions).find(n=>content(n)==='Save Photo').props.onClick();t.render();
  const added=t.draft.gallery[0],second=t.draft.gallery[1].id;
  assert.equal(added.displayNumber,'TMC 42');
  t.button(`Edit photo: ${added.name}`).props.onClick();t.render();
  const move = t.component('OwnerPriceReorderList', 'Gallery photos'); move.props.onStep(added.id, 1); t.render();
  assert.equal(t.draft.gallery[0].id, second); assert.equal(t.draft.gallery[1].displayNumber, 'TMC 42');
  t.component('ImagePicker').props.onAlt('A front-facing red fox'); t.render();
  assert.equal(t.draft.gallery[1].alt, 'A front-facing red fox', 'editing follows stable photo id after reorder');
  t.component('Toggle', 'Show this photo in the gallery').props.onChange(false); t.render();
  assert.equal(t.draft.gallery[1].visible, false); assert.equal(t.draft.gallery.length > 1, true);
  t.h.unmount();
});

test('gallery removal requires parent confirmation and keeps other items', () => {
  const t = fixture('PhotoGalleryManager'); const original = structuredClone(t.draft.gallery);
  t.button(`Remove photo: ${original[0].name || 'Untitled photo'}`).props.onClick();
  assert.deepEqual(t.draft.gallery, original); assert.match(t.confirmation.description, /original file is not deleted/);
  t.confirmation.remove(); t.render();
  assert.deepEqual(t.draft.gallery, original.slice(1)); t.h.unmount();
});

function shopProps(overrides = {}) { return { liveShopVisibility: false, liveShopKnown: true, liveShopReadError: null, onRetryLiveShop() {}, canUpdateLiveShop: true, onUpdateLiveShop() {}, ...overrides }; }

test('hidden shop keeps listings editable; draft switch never invokes shop-only live action', () => {
  let updates = 0;
  const t = fixture('PremadesManager', shopProps({ onUpdateLiveShop() { updates++; } }));
  t.draft.site.showPremades = false; t.render();
  const beforePrices = structuredClone(t.draft.prices);
  t.button('Add Premade').props.onClick(); t.render(); t.component('Field','Listing name').props.onChange('New premade'); t.render(); nodes(t.component('Dialog').props.actions).find(n=>content(n)==='Add private draft').props.onClick(); t.render();
  assert.equal(t.draft.premades[0].visible, false); assert.equal(t.component('PremadePhotoEditor').props.item.id, t.draft.premades[0].id);
  t.component('Field', 'Listing name').props.onChange('Fox premade');
  t.component('Field', 'Price (USD)').props.onChange('321.75'); t.render();
  assert.equal(t.draft.premades[0].price, 321.75); assert.equal(t.draft.premades[0].name, 'Fox premade');
  t.component('Toggle', 'Show the premade shop').props.onChange(true); t.render();
  assert.equal(updates, 0); assert.equal(t.button('Update live').props.disabled, false);
  t.button('Update live').props.onClick(); assert.equal(updates, 1);
  assert.deepEqual(t.draft.prices, beforePrices); assert.equal(t.component('OwnerVisualBuilder'), undefined);
  t.h.unmount();
});

test('premade photo manager receives unchanged cover/multiple photos and applies its complete patch by id', () => {
  const t = fixture('PremadesManager', shopProps());
  t.button('Add Premade').props.onClick(); t.render(); t.component('Field','Listing name').props.onChange('New premade'); t.render(); nodes(t.component('Dialog').props.actions).find(n=>content(n)==='Add private draft').props.onClick(); t.render();
  const id = t.draft.premades[0].id;
  const patch = { photos: [{ id: 'one', src: '/images/heads.webp', alt: 'Front' }, { id: 'two', src: '/images/partials.webp', alt: 'Back' }], coverPhotoId: 'two', image: '/images/partials.webp', alt: 'Back', imageFit: 'cover', imagePositionX: 30, imagePositionY: 65 };
  t.component('PremadePhotoEditor').props.onChange(patch); t.render();
  assert.equal(t.component('PremadePhotoEditor').props.item.id, id);
  for (const [key, value] of Object.entries(patch)) assert.deepEqual(t.draft.premades[0][key], value);
  t.component('Field', 'Price (USD)').props.onChange(''); t.render(); assert.equal(t.draft.premades[0].price, null);
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

test('contact settings retains commission controls and delegates ordered socials without a redundant workspace card', () => {
  let syncs = 0;
  const t = fixture('ContactSettingsManager', { userEmail: 'owner@example.test', onSync() { syncs++; } });
  const legacy = { telegram: t.draft.site.telegram, tiktok: t.draft.site.tiktok, twitch: t.draft.site.twitch };
  const social = t.component('OwnerSocialLinksEditor'); assert.ok(social);
  const child = harness(), Editor = child.load('src/owner/OwnerSocialLinksEditor.tsx').OwnerSocialLinksEditor;
  const renderEditor = () => { t.render(); child.render(Editor, t.component('OwnerSocialLinksEditor').props); };
  renderEditor();
  const list = child.find(node => node.type?.name === 'OwnerPriceReorderList'), telegram = list.props.items.find(item => item.id === 'telegram');
  const fields = nodes(list.props.children(telegram, null));
  fields.find(node => node.type?.name === 'Field' && node.props.label === 'Contact label').props.onChange('Message Taylor');
  fields.find(node => node.type?.name === 'Field' && node.props.label === 'Display text').props.onChange('@maker');
  fields.find(node => node.type?.name === 'Field' && node.props.label === 'Link address (optional)').props.onChange('https://t.me/maker');
  t.render(); t.component('OwnerSelect', 'Commission status').props.onChange('Closed'); t.render();
  const updated = t.draft.site.socialLinks.find(item => item.id === 'telegram');
  assert.equal(updated.label, 'Message Taylor'); assert.equal(updated.value, '@maker'); assert.equal(updated.url, 'https://t.me/maker');
  assert.deepEqual({ telegram: t.draft.site.telegram, tiktok: t.draft.site.tiktok, twitch: t.draft.site.twitch }, legacy, 'legacy fields are preserved rather than silently rewritten by the new flexible contact list');
  assert.equal(t.draft.site.commissionStatus, 'Closed');
  assert.equal(syncs, 0); assert.equal(t.button('Cloud Sync'), undefined);
  assert.doesNotMatch(content(t.h.tree), /owner@example.test|This workspace/); assert.ok(t.component('StudioPreferenceStatus')); assert.ok(t.component('GlobalUpdateCooldown'));
  assert.equal(t.component('OwnerVisualBuilder'), undefined); child.unmount(); t.h.unmount();
});

test('template managers reuse current upload and multi-photo tools rather than old single-photo controls', () => {
  const source = readFileSync(new URL('../src/owner/OwnerTemplateManagers.tsx', import.meta.url), 'utf8');
  assert.match(source, /draft\.gallery\.unshift/); assert.match(source, /<PhotoUpload multiple/); assert.match(source, /<PremadePhotoEditor/);
  assert.doesNotMatch(source, /OwnerVisualBuilder|publishLive|saveDraft|localStorage|fetch\(/);
});

test('Fox7 premade controls keep decimals editable while spinner steps whole dollars and private draft has one delete action',()=>{
 const t=fixture('PremadesManager',shopProps());t.button('Add Premade').props.onClick();t.render();t.component('Field','Listing name').props.onChange('New premade');t.render();nodes(t.component('Dialog').props.actions).find(n=>content(n)==='Add private draft').props.onClick();t.render();
 const price=t.component('Field','Price (USD)');assert.equal(price.props.step,1);price.props.onChange('32.25');t.render();assert.equal(t.draft.premades[0].price,32.25);
 assert.equal(t.button('Remove listing'),undefined);assert.ok(t.button('Delete draft'));t.h.unmount();
});


test('new existing-photo edits stay local until Save Photo; close, cancel and stale double-click cannot create a card',()=>{
 const t=fixture('PhotoGalleryManager',{onSavePhotos:()=>saves++});let saves=0;
 const baseline=structuredClone(t.draft);
 const action=label=>nodes(t.component('Dialog').props.actions).find(n=>content(n)===label);
 t.button('Add existing photo').props.onClick();t.render();
 t.component('Field','Photo name').props.onChange('Private staging');t.render();
 t.component('ImagePicker').props.onSource('/images/heads.webp');t.render();
 assert.deepEqual(t.draft,baseline);const staleSave=action('Save Photo').props.onClick;
 action('Cancel').props.onClick();action('Cancel').props.onClick();t.render();staleSave();t.render();
 assert.deepEqual(t.draft,baseline);assert.equal(saves,0);assert.equal(t.component('Dialog'),undefined);
 t.button('Add existing photo').props.onClick();t.render();assert.equal(t.component('Field','Photo name').props.value,'New photo');
 t.component('Dialog').props.onClose();t.render();assert.deepEqual(t.draft,baseline);
 t.button('Add existing photo').props.onClick();t.render();t.component('Field','Photo name').props.onChange('Saved staging');t.render();
 const save=action('Save Photo').props.onClick;save();save();t.render();
 assert.equal(t.draft.gallery.length,baseline.gallery.length+1);assert.equal(t.draft.gallery[0].name,'Saved staging');assert.equal(saves,1);assert.deepEqual(t.draft.gallery.slice(1),baseline.gallery);t.h.unmount();
});
test('leaving a manager with an unaccepted new photo cannot mutate its parent website draft',()=>{
 const t=fixture('PhotoGalleryManager'),baseline=structuredClone(t.draft);
 t.button('Add existing photo').props.onClick();t.render();t.component('Field','Photo name').props.onChange('Never accepted');t.render();t.h.unmount();
 assert.deepEqual(t.draft,baseline);
});
