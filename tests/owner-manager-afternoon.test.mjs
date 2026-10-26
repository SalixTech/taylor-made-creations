import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function modelFixture() { const h = harness(); return { h, make: h.load('src/owner/defaults.ts').createDefaultOwnerContent, model: h.load('src/owner/model.ts') }; }

test('settings card merge copies only known fields and leaves unrelated invalid edits out', () => {
  const { h, make, model } = modelFixture(), apply = h.load('src/owner/settings-cards.ts').applySettingsCard;
  const base = make(), edited = make(); edited.home.title = 'UNSAVED HOME'; edited.prices.parts[0].price = -99;
  edited.site.name = 'New business'; edited.site.commissionStatus = 'Open!'; edited.site.statusNote = 'Taking requests'; edited.site.additionalPartsQuantities = true;
  edited.commissionForm = { sectionTitles: { contact: 'Your details' } }; edited.site.socialLinks = [{ id: 'social-1', label: 'Art', value: 'Taylor', url: 'https://example.com/taylor' }];
  for (const card of ['business', 'availability', 'commission-form', 'contacts']) {
    const result = apply(base, edited, card); assert.equal(result.home.title, base.home.title); assert.deepEqual(result.prices, base.prices); assert.equal(model.validateOwnerContent(result).valid, true);
    if (card !== 'business') assert.equal(result.site.name, base.site.name);
    if (card !== 'availability') assert.equal(result.site.statusNote, base.site.statusNote);
    if (card !== 'contacts') assert.equal(result.site.socialLinks, undefined);
    if (card !== 'commission-form') assert.equal(result.commissionForm, undefined);
  }
  const result = apply(base, edited, 'contacts'); result.site.socialLinks[0].label = 'Mutated'; assert.equal(edited.site.socialLinks[0].label, 'Art');
  assert.throws(() => apply(base, edited, 'unknown')); h.unmount();
});

test('social links preserve legacy contacts until explicitly edited, then follow exact owner order', () => {
  const { h, make, model } = modelFixture(), get = h.load('src/owner/social-links.ts').getOwnerSocialLinks, draft = make();
  assert.deepEqual(get(draft).map(link => link.id), ['telegram', 'discord', 'tiktok', 'twitch', 'email']); assert.equal(draft.site.socialLinks, undefined);
  draft.site.socialLinks = [{ id: 'one', label: 'Portfolio', value: 'View my work', url: 'https://example.com' }, { id: 'two', label: 'Discord', value: 'CustomName' }];
  assert.equal(model.validateOwnerContent(draft).valid, true);
  const result = model.createPublicContentSnapshot(draft); assert.deepEqual(result.site.socialLinks, draft.site.socialLinks); result.site.socialLinks[0].label = 'Other'; assert.equal(draft.site.socialLinks[0].label, 'Portfolio');
  draft.site.socialLinks = []; assert.deepEqual(get(draft), []); assert.deepEqual(model.createPublicContentSnapshot(draft).site.socialLinks, []); h.unmount();
});

test('contact schema rejects active URLs, credentials, duplicates, invalid fields and oversized lists', () => {
  const { h, make, model } = modelFixture();
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://user:password@example.com', '//example.com', 'mailto:a@example.com?bcc=x@example.com']) {
    const draft = make(); draft.site.socialLinks = [{ id: 'one', label: 'Test', value: 'Test', url }]; assert.equal(model.validateOwnerContent(draft).valid, false, url);
  }
  for (const mutate of [links => links.push({ ...links[0] }), links => { links[0].html = '<script>'; }, links => { links[0].label = ''; }, links => { links.push(...Array.from({ length: 50 }, (_, i) => ({ id: `x-${i}`, label: 'Test', value: 'x' }))); }]) {
    const draft = make(); draft.site.socialLinks = [{ id: 'one', label: 'Test', value: 'Test' }]; mutate(draft.site.socialLinks); assert.equal(model.validateOwnerContent(draft).valid, false);
  }
  h.unmount();
});

test('gallery reordering retains every photo and manual numbers, and reset requires confirmation', () => {
  const { h, make } = modelFixture(), Manager = h.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
  let draft = make(), confirmation; draft.gallery[0].displayNumber = '007'; const original = structuredClone(draft.gallery);
  const props = { onEdit(change) { change(draft); }, onRemove(title, description, action) { confirmation = action; } };
  const render = () => h.render(Manager, { ...props, content: draft }); render();
  const list = h.find(n => n.type?.name === 'OwnerPriceReorderList'); assert.equal(list.props.layout, 'grid');
  list.props.onReorder(original[0].id, original[2].id, true); render(); assert.deepEqual(draft.gallery.map(x => x.id), [original[1].id, original[2].id, original[0].id, ...original.slice(3).map(x => x.id)]);
  assert.equal(draft.gallery.find(x => x.id === original[0].id).displayNumber, '007'); assert.equal(draft.gallery.length, original.length);
  h.find(n => n.type === 'button' && content(n) === 'Use automatic numbers').props.onClick(); assert.equal(draft.gallery.find(x => x.id === original[0].id).displayNumber, '007'); confirmation(); assert.ok(draft.gallery.every(x => x.displayNumber === undefined)); h.unmount();
});

test('settings buttons lock repeated saves and retain failure feedback without claiming success', async () => {
  const h = harness(), Actions = h.load('src/owner/SettingsCardActions.tsx').SettingsCardActions; let resolve, calls = 0;
  const props = { card: 'business', canSaveSettingsDraft: true, canSaveSettingsLive: true, onSaveSettingsCard: async (card, mode) => { calls++; assert.equal(card, 'business'); assert.equal(mode, 'draft'); return new Promise(r => { resolve = r; }); } };
  h.render(Actions, props); const click = h.find(n => n.type === 'button' && content(n) === 'Save Draft').props.onClick; click(); click(); assert.equal(calls, 1); resolve(false); await flush(); h.render(Actions, props);
  assert.match(content(h.tree), /not saved/); assert.doesNotMatch(content(h.tree), /saved privately/); h.unmount();
});

test('draft listing deletion requires confirmation and acknowledgement; errors keep the card', async () => {
  const { h, make } = modelFixture(), Manager = h.load('src/owner/OwnerTemplateManagers.tsx').PremadesManager; const draft = make();
  draft.premades = [{ id: 'draft-one', name: 'Keep me', image: '/images/heads.webp', alt: 'Head', description: '', price: null, visible: false, isDraft: true }];
  let calls = 0, resolve;
  const props = { content: draft, liveShopKnown: true, liveShopVisibility: false, onEdit() {}, onRemove() {}, onRetryLiveShop() {}, onUpdateLiveShop() {}, canDeletePremadeDraft: true, onDeletePremadeDraft: async id => { calls++; assert.equal(id, 'draft-one'); return new Promise(r => { resolve = r; }); } };
  const render = () => h.render(Manager, props); render();
  const card = h.find(n => n.type?.name === 'Card' && n.props.title === 'Keep me');
  assert.ok(!nodes(card.props.action).some(n => n.type === 'button' && content(n) === 'Delete draft'), 'delete is no longer in the heading');
  const footer = nodes(card).find(n => n.type === 'div' && n.props.className === 'listingFooter');
  const deleteButton = nodes(footer).find(n => n.type === 'button' && content(n) === 'Delete draft');
  assert.equal(deleteButton.props.className, 'danger');
  deleteButton.props.onClick(); render(); assert.equal(calls, 0);
  let dialog = h.find(n => n.type?.name === 'Dialog'); dialog.props.onClose(); render(); assert.equal(calls, 0);
  nodes(card).find(n => n.type === 'button' && content(n) === 'Delete draft').props.onClick(); render(); dialog = h.find(n => n.type?.name === 'Dialog');
  const click = nodes(dialog.props.actions).find(n => n.type === 'button' && content(n) === 'Delete draft').props.onClick; click(); click(); assert.equal(calls, 1); resolve(false); await flush(); render();
  assert.equal(draft.premades.length, 1); assert.match(content(h.find(n => n.type?.name === 'Dialog')), /not deleted/); h.unmount();
});

test('searchable price chooser deduplicates names and refuses already-added selections', () => {
  const { h, make } = modelFixture(), mod = h.load('src/owner/PriceItemChooser.tsx'), draft = make();
  draft.prices.parts = [{ id: 'one', name: 'Spare paws', price: 20 }, { id: 'two', name: ' spare   PAWS ', price: 30 }];
  const suggestions = mod.priceSuggestions(draft); assert.equal(suggestions.filter(x => mod.priceNameKey(x.name) === 'spare paws').length, 1);
  let selected = []; const props = { content: draft, existingNames: ['Spare Paws'], label: 'Add a part', onChoose: item => selected.push(item) };
  h.render(mod.PriceItemChooser, props); h.find(n => n.type === 'button' && content(n).includes('Add a part')).props.onClick(); h.render(mod.PriceItemChooser, props);
  const button = h.find(n => n.type === 'button' && content(n).includes('Spare paws')); assert.equal(button.props.disabled, true); button.props.onClick(); assert.equal(selected.length, 0); h.unmount();
});
