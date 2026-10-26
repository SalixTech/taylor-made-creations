import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, nodes, content } from './owner-ui-harness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const item = changes => ({ id: 'selected', name: 'Selected', image: '/images/heads.webp', alt: 'Character', description: '', price: null, visible: true, soldChannel: 'tmc', ...changes });
function managerFixture(items = []) {
  const h = harness(), Manager = h.load('src/owner/OwnerTemplateManagers.tsx').PremadesManager;
  let draft = h.load('src/owner/defaults.ts').createDefaultOwnerContent(); draft.premades = items;
  let gate = null, saveResult = true, saves = [];
  const props = { content: draft, liveShopVisibility: true, liveShopKnown: true, canUpdateLiveShop: true, canPublishPremade: true, canSavePremadeDraft: true,
    onEdit(change) { draft = structuredClone(draft); change(draft); }, onRemove() {}, onUpdateLiveShop() {}, onRetryLiveShop() {}, onPublishPremade() {},
    async onSavePremadeDraft(selected) { saves.push(structuredClone(selected)); if (gate) await gate.promise; if (saveResult) draft.premades = draft.premades.map(entry => entry.id === selected.id ? { ...selected, isDraft: true, visible: false } : entry); return saveResult; },
  };
  const render = () => { h.render(Manager, { ...props, content: draft }); for (const node of h.refs.values()) node.scrollIntoView = () => {}; };
  const button = label => h.find(n => n.type === 'button' && content(n) === label);
  const field = label => h.find(n => typeof n.type === 'function' && n.type.name === 'Field' && n.props.label === label);
  const cards = () => h.all(n => typeof n.type === 'function' && n.type.name === 'Card');
  const edit = id => { const card = cards().find(n => n.props.title === draft.premades.find(i => i.id === id).name); nodes(card.props.action).find(n => n.type === 'button' && content(n) === 'Edit listing').props.onClick(); render(); };
  const details = () => h.find(n => n.type === 'details');
  render(); return { h, props, render, button, field, edit, cards, details, saves, get draft() { return draft; }, set gate(v) { gate = v; }, set saveResult(v) { saveResult = v; } };
}

test('tag text keeps trailing commas while typing, stores normalized individual tags, and blocks eleven without dropping them', () => {
  const t = managerFixture([item({ badge: 'Legacy' })]); t.edit('selected');
  const label = 'Extra listing badges (optional)';
  assert.equal(t.field(label).props.value, 'Legacy');
  t.field(label).props.onChange('Ready, '); t.render(); assert.equal(t.field(label).props.value, 'Ready, '); assert.deepEqual(t.draft.premades[0].tags, ['Ready']); assert.equal('badge' in t.draft.premades[0], false);
  t.field(label).props.onChange(' Ready, Fox , READY, , '); t.render(); assert.deepEqual(t.draft.premades[0].tags, ['Ready', 'Fox']);
  t.field(label).props.onChange(Array.from({ length: 11 }, (_, i) => `tag${i}`).join(',')); t.render();
  assert.equal(t.draft.premades[0].tags.length, 11); assert.equal(t.button('Save as Draft').props.disabled, true); assert.equal(t.button('Publish to store').props.disabled, true);
  assert.match(content(t.h.tree), /No tags have been discarded/);
  t.field(label).props.onChange(''); t.render(); assert.deepEqual(t.draft.premades[0].tags, []); assert.equal(t.button('Save as Draft').props.disabled, false); t.h.unmount();
});

test('draft cards start out of the way, add opens editor, acknowledged save collapses it, and renamed draft reopens by id', async () => {
  const t = managerFixture([item({ isDraft: true, visible: false })]); assert.equal(t.details().props.open, false);
  t.button('＋ Add a premade').props.onClick(); t.render(); assert.equal(t.details().props.open, true);
  const id = t.draft.premades[0].id; assert.equal(t.draft.premades[0].isDraft, true);
  t.field('Listing name').props.onChange('Fox draft'); t.render();
  assert.equal(t.h.find(n => typeof n.type === 'function' && n.props.label === 'Show this listing'), undefined);
  t.button('Save as Draft').props.onClick(); await flush(); t.render();
  assert.equal(t.saves.length, 1); assert.equal(t.saves[0].id, id); assert.equal(t.details().props.open, false); assert.equal(t.field('Listing name'), undefined);
  t.details().props.onToggle({ currentTarget: { open: true } }); t.render(); t.edit(id);
  assert.equal(t.field('Listing name').props.value, 'Fox draft'); assert.match(content(t.h.tree), /even when you publish the whole website/); t.h.unmount();
});

test('failed per-card save keeps details/inputs and repeat clicks share a single in-flight request', async () => {
  const t = managerFixture([item({ isDraft: true })]); t.details().props.onToggle({ currentTarget: { open: true } }); t.render(); t.edit('selected');
  t.field('Listing name').props.onChange('Keep my edits'); t.render(); t.saveResult = false; const gate = deferred(); t.gate = gate;
  const click = t.button('Save as Draft').props.onClick; click(); click(); assert.equal(t.saves.length, 1);
  gate.resolve(); await flush(); t.render(); assert.equal(t.field('Listing name').props.value, 'Keep my edits'); assert.equal(t.details().props.open, true);
  t.gate = null; t.saveResult = true; t.button('Save as Draft').props.onClick(); await flush(); t.render(); assert.equal(t.saves.length, 2); assert.equal(t.details().props.open, false); t.h.unmount();
});

test('public tags render separate spans plus Sold Here; unchanged legacy badge remains a single span', () => {
  const h = harness(), Tags = h.load('src/components/PremadeProduct.tsx').PremadeTags;
  const tags = ['Ready', 'Fox', 'Handmade', ...Array.from({ length: 7 }, (_, i) => `Tag ${i}`)];
  h.render(Tags, { item: item({ tags, badge: 'Obsolete' }) });
  assert.deepEqual(h.all(n => n.type === 'span').map(content), ['Sold Here', ...tags]);
  h.render(Tags, { item: item({ badge: 'Ready, steady' }) }); assert.deepEqual(h.all(n => n.type === 'span').map(content), ['Sold Here', 'Ready, steady']); h.unmount();
});

test('saved listing drafts are excluded from product resolution and cart even with a stale visible flag', () => {
  const h = harness(), store = h.load('src/components/storefront-model.ts'), draft = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  draft.site.showPremades = true; draft.site.catalogMode = false; draft.premades = [item({ price: 100, isDraft: true })];
  assert.equal(store.canAddPublishedPremade(draft, 'selected'), false);
  assert.equal(store.getPublicPremade(draft, ['premades', 'selected']), undefined); h.unmount();
});

function portalFixture() {
  const h = harness(); h.overrides['./HelpButton'] = { HelpButton() {} }; h.overrides['./TaylorServices'] = { TaylorServices: () => null }; h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
  const defaults = h.load('src/owner/defaults.ts'), storage = h.load('src/owner/storage.ts');
  let raw = defaults.createInitialOwnerWorkspace(), gate = null, failure = null, saves = 0, publishes = 0;
  raw.draft.premades = [item(), item({ id: 'other', name: 'Other' })];
  const base = storage.createOwnerStore({ read: async () => structuredClone(raw), update: async transform => { if (gate) await gate.promise; if (failure) throw new Error(failure); raw = structuredClone(transform(raw)); return structuredClone(raw); } });
  const store = { ...base, async savePremadeDraft(...args) { saves++; return base.savePremadeDraft(...args); }, async readLiveShopVisibility() { return true; }, async publishPremadeLive(selected, revision) { publishes++; const content = structuredClone(raw.draft); content.premades = content.premades.map(i => i.id === selected.id ? selected : i); return base.saveDraft(content, revision); } };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default, props = { store, initialSection: 'premades', mode: 'cloud', userEmail: 'qa@example.test', onSignOut: async () => {} };
  const render = () => h.render(Portal, props), manager = () => h.find(n => typeof n.type === 'function' && n.type.name === 'PremadesManager');
  return { h, render, manager, get raw() { return raw; }, get saves() { return saves; }, get publishes() { return publishes; }, set gate(v) { gate = v; }, set failure(v) { failure = v; }, remote() { raw.revision++; raw.updatedAt = '2026-10-26T03:00:00.000Z'; raw.draft.home.title = 'OTHER DEVICE'; } };
}
async function openPortal() { const t = portalFixture(); t.render(); await flush(); t.render(); return t; }

test('portal card save preserves unrelated unsaved/invalid fields, other listing edits, dirty guard and current route', async () => {
  const t = await openPortal(); const before = structuredClone(t.raw.draft), route = t.h.window.location.href;
  t.manager().props.onEdit(draft => { draft.home.title = 'UNSAVED HOME'; draft.prices.parts[0].price = -3; draft.premades[1].name = 'UNSAVED OTHER'; draft.premades[0].name = 'Saved selected'; }); t.render();
  const ok = await t.manager().props.onSavePremadeDraft(t.manager().props.content.premades[0]); t.render();
  assert.equal(ok, true); assert.equal(t.raw.draft.premades[0].name, 'Saved selected'); assert.equal(t.raw.draft.premades[0].isDraft, true);
  assert.equal(t.raw.draft.home.title, before.home.title); assert.equal(t.raw.draft.premades[1].name, before.premades[1].name); assert.deepEqual(t.raw.draft.prices, before.prices);
  assert.equal(t.manager().props.content.home.title, 'UNSAVED HOME'); assert.equal(t.manager().props.content.premades[1].name, 'UNSAVED OTHER'); assert.equal(t.manager().props.content.prices.parts[0].price, -3);
  assert.match(content(t.h.tree), /unsaved changes/); assert.match(content(t.h.tree), /saved privately in Draft listings/); assert.equal(t.publishes, 0); assert.equal(t.h.window.location.href, route); t.h.unmount();
});

test('portal repeated clicks lock save before render and failure/concurrency preserve local edits without success', async () => {
  for (const mode of ['failure', 'concurrent']) {
    const t = await openPortal(); t.manager().props.onEdit(draft => { draft.premades[0].name = 'DO NOT LOSE'; }); t.render();
    const gate = deferred(); t.gate = gate; if (mode === 'failure') t.failure = 'Connection unavailable'; else t.remote();
    const callback = t.manager().props.onSavePremadeDraft, selected = t.manager().props.content.premades[0]; const first = callback(selected), second = callback(selected);
    assert.equal(t.saves, 1); gate.resolve(); assert.deepEqual(await Promise.all([first, second]), [false, false]); t.render();
    assert.equal(t.manager().props.content.premades[0].name, 'DO NOT LOSE'); assert.equal(t.raw.draft.premades[0].name, 'Selected'); assert.doesNotMatch(content(t.h.tree), /saved privately in Draft listings/); assert.equal(t.publishes, 0); t.h.unmount();
  }
});

test('only confirmed Publish to store clears draft state; opening or canceling its confirmation does not', async () => {
  const t = await openPortal(); await t.manager().props.onSavePremadeDraft(t.manager().props.content.premades[0]); t.render();
  t.manager().props.onPublishPremade(t.manager().props.content.premades[0]); t.render();
  let dialog = t.h.find(n => typeof n.type === 'function' && n.type.name === 'Dialog'); assert.ok(dialog); assert.equal(t.publishes, 0); assert.equal(t.raw.draft.premades[0].isDraft, true);
  dialog.props.onClose(); t.render(); assert.equal(t.raw.draft.premades[0].isDraft, true);
  t.manager().props.onPublishPremade(t.manager().props.content.premades[0]); t.render(); dialog = t.h.find(n => typeof n.type === 'function' && n.type.name === 'Dialog');
  nodes(dialog.props.actions).find(n => n.type === 'button' && content(n) === 'Publish to store').props.onClick(); await flush(); t.render();
  assert.equal(t.publishes, 1); assert.equal(t.raw.draft.premades[0].isDraft, undefined); assert.equal(t.raw.draft.premades[0].visible, true); t.h.unmount();
});


test('tag layout permits wrapping long tags in public and owner cards', () => {
  const owner = readFileSync(new URL('../src/owner/OwnerTemplateManagers.module.css', import.meta.url), 'utf8');
  const publicCss = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(owner, /\.manager \.listingTag\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(publicCss, /\.premade-tags>span\{[^}]*max-width:100%;overflow-wrap:anywhere/);
});

test('the expanded gallery card has its requested singular Save Photo action', () => {
  const h = harness(), Manager = h.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
  const draft = h.load('src/owner/defaults.ts').createDefaultOwnerContent(); let saves = 0;
  const props = { content: draft, onEdit(change) { change(draft); }, onRemove() {}, onSavePhotos() { saves++; } };
  const render = () => { h.render(Manager, props); for (const node of h.refs.values()) node.scrollIntoView = () => {}; };
  render(); h.find(n => n.type === 'button' && content(n) === 'Edit photo').props.onClick(); render();
  h.find(n => n.type === 'button' && content(n) === 'Save Photo').props.onClick(); assert.equal(saves, 1);
  assert.ok(h.find(n => n.type === 'button' && content(n) === 'Save photos')); h.unmount();
});
