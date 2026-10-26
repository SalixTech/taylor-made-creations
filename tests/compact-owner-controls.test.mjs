import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness, content, nodes } from './owner-ui-harness.mjs';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';

const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const modules = Object.fromEntries(await Promise.all(['OwnerButton', 'OwnerPortal', 'OwnerVisualBuilder', 'OwnerTemplateManagers'].map(async name => {
  const output = await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/owner/${name}.module.css`), { from: `${name}.module.css` });
  const classes = {}; output.root.walkRules(':export', rule => rule.walkDecls(decl => classes[decl.prop] = decl.value));
  return [name, { css: output.css, classes }];
})));
const buttonClasses = modules.OwnerButton.classes, builderClasses = modules.OwnerVisualBuilder.classes;
const globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');
const sheets = [globals, modes, ...Object.values(modules).map(module => module.css)];
function themedHarness() {
  const h = harness();
  for (const [name, module] of Object.entries(modules)) h.overrides[`./${name}.module.css`] = { __esModule: true, default: module.classes };
  return h;
}
function builderFixture() {
  const h = themedHarness(); h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  let manage = 0, add = 0;
  const props = { content: value, page: value.pages[0], browsing: false, liveShopVisibility: false, canUpdateLiveShop: false, onUpdateLiveShop() {}, onBrowsingChange() {}, onPageChange() {}, onManagePages() { manage++; }, onAddPage() { add++; }, onPrices() {}, onRemove() {}, onEdit() {} };
  const render = () => h.render(Builder, props), actions = () => nodes(h.find(n => n.props.className === builderClasses.actionbar)).filter(n => n.type === 'button');
  const button = label => actions().find(n => content(n) === label);
  render(); return { h, props, render, actions, button, get manage() { return manage; }, get add() { return add; } };
}

test('all five builder toolbar actions are shared native buttons with selected, toggle, focus-return and upload-lock behavior', () => {
  const t = builderFixture(); assert.equal(t.actions().length, 5);
  for (const action of t.actions()) {
    assert.equal(action.props.type, 'button'); assert.equal(action.props['data-owner-button'], true);
    assert.ok(action.props.className.includes(buttonClasses.button)); assert.ok(action.props.className.includes(buttonClasses.compact));
  }
  assert.ok(t.button('Design').props.className.includes(buttonClasses.primary));
  assert.ok(t.button('Header & footer').props.className.includes(buttonClasses.secondary));
  let focused = 0; const trigger = { focus() { focused++; } };
  for (const label of ['Design', 'Header & footer', 'Page settings']) {
    assert.equal(t.button(label).props['aria-pressed'], false);
    t.button(label).props.onClick({ currentTarget: trigger }); t.render();
    assert.equal(t.button(label).props['aria-pressed'], true); assert.equal(t.button(label).props['aria-expanded'], true);
    const panel = t.h.find(n => n.type === 'aside'); assert.equal(t.button(label).props['aria-controls'], panel.props.id);
    panel.props.onKeyDown({ key: 'Escape', preventDefault() {} }); t.render();
    assert.equal(t.button(label).props['aria-pressed'], false); assert.equal(t.h.find(n => n.type === 'aside'), undefined);
  }
  assert.equal(focused, 3);
  t.button('Manage pages').props.onClick(); t.button('＋ New page').props.onClick(); assert.equal(t.manage, 1); assert.equal(t.add, 1);
  t.props.uploadBusy = true; t.render();
  for (const action of t.actions()) { assert.equal(action.props.disabled, true); action.props.onClick({ currentTarget: trigger }); }
  t.render(); assert.equal(t.h.find(n => n.type === 'aside'), undefined); assert.equal(t.manage, 1); assert.equal(t.add, 1); t.h.unmount();
});

test('compiled toolbar buttons keep rounded borders, non-glowing fills, primary/selected distinction and visible focus in both themes', () => {
  for (const order of [sheets, [...sheets].reverse()]) for (const theme of ['light', 'dark']) for (const width of [375, 768, 1440]) {
    const html = element('html'), body = element('body', {}, html), portal = element('div', { class: modules.OwnerPortal.classes.portal, 'data-owner-portal': '', 'data-color-mode': theme }, body);
    const builder = element('section', { class: builderClasses.builder }, portal), actionbar = element('div', { class: builderClasses.actionbar }, builder), group = element('div', {}, actionbar);
    const css = cascade(order, width), fills = [];
    for (const variant of ['primary', 'secondary']) {
      const button = element('button', { class: `${buttonClasses.button} ${buttonClasses[variant]} ${buttonClasses.compact}`, 'data-owner-button': '', 'aria-pressed': 'false' }, group);
      const idle = css(button); fills.push(idle['background-color']);
      assert.equal(idle['border-radius'], '10px'); assert.equal(idle['min-height'], width <= 550 ? '42px' : '36px');
      assert.equal(idle['text-decoration'], 'none'); assert.equal(idle['box-shadow'] ?? 'none', 'none'); assert.ok(contrast(idle.color, idle['background-color']) >= 4.5);
      button.states.add('hover'); assert.equal(css(button)['text-decoration'], 'none'); button.states.delete('hover');
      button.attrs['aria-pressed'] = 'true'; const selected = css(button); assert.notEqual(selected['background-color'], idle['background-color']); assert.match(selected['box-shadow'], /^inset/);
      button.states.add('focus-visible'); assert.match(css(button).outline, /^3px solid/); assert.equal(css(button)['outline-offset'], '3px'); assert.ok(contrast(css(button)['outline-color'], theme === 'dark' ? '#241f25' : '#fff') >= 3);
      button.attrs.disabled = ''; assert.equal(css(button).opacity, '1'); assert.equal(css(button)['box-shadow'], 'none');
    }
    assert.notEqual(fills[0], fills[1]); assert.equal(css(group).gap, '8px'); assert.equal(css(group)['flex-wrap'], 'wrap');
  }
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function listingFixture({ isDraft = false, failure = false } = {}) {
  const h = themedHarness(), defaults = h.load('src/owner/defaults.ts');
  let raw = defaults.createInitialOwnerWorkspace();
  raw.draft.premades = [{ id: 'selected', name: 'Selected listing', image: '/images/heads.webp', alt: 'Character', description: 'Private edit', price: null, visible: !isDraft, isDraft, tags: ['Fox'], soldChannel: 'tmc' }];
  raw.localPublished = { content: structuredClone(raw.draft), publishedAt: '2026-10-25T12:00:00.000Z' };
  let value = structuredClone(raw.draft), release, transactions = 0, callbacks = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const store = h.load('src/owner/storage.ts').createOwnerStore({ read: async () => structuredClone(raw), update: async transform => { transactions++; await gate; if (failure) throw new Error('Offline'); raw = structuredClone(transform(raw)); return structuredClone(raw); } });
  const Manager = h.load('src/owner/OwnerTemplateManagers.tsx').PremadesManager;
  const props = { liveShopVisibility: true, liveShopKnown: true, canUpdateLiveShop: true, canPublishPremade: true, canSavePremadeDraft: true,
    onEdit(change) { value = structuredClone(value); change(value); }, onRemove() {}, onPublishPremade() { throw Error('Draft save must never publish'); }, onUpdateLiveShop() { throw Error('Draft save must never toggle shop'); },
    async onSavePremadeDraft(item) { callbacks++; try { const saved = await store.savePremadeDraft(item, raw.revision); value = saved.draft; return true; } catch { return false; } },
  };
  const render = () => h.render(Manager, { ...props, content: value });
  const card = () => h.find(n => n.type?.name === 'Card' && n.props.title === value.premades[0].name);
  const headerButtons = () => nodes(card().props.action).filter(n => n.type === 'button');
  const saves = () => [headerButtons().find(n => /^(Save as Draft|Saving draft…)$/.test(content(n))), nodes(card()).find(n => n.type === 'button' && /^(Save as Draft|Saving draft…)$/.test(content(n)))];
  render(); headerButtons().find(n => content(n) === 'Edit listing').props.onClick(); render();
  return { h, props, render, card, saves, release, get raw() { return raw; }, get value() { return value; }, get callbacks() { return callbacks; }, get transactions() { return transactions; } };
}

test('header and original bottom Save as Draft use the identical callback and one private transaction from either starting position', async () => {
  for (const isDraft of [false, true]) for (const start of [0, 1]) {
    const t = listingFixture({ isDraft }), publicBefore = structuredClone(t.raw.localPublished);
    const save = t.saves(); assert.ok(save.every(Boolean)); assert.equal(save[0].props.onClick, save[1].props.onClick);
    assert.equal(save[0].props.disabled, false); assert.equal(save[1].props.disabled, false);
    save[start].props.onClick(); save[1 - start].props.onClick(); save[start].props.onClick();
    assert.equal(t.callbacks, 1); assert.equal(t.transactions, 1); t.render();
    for (const button of t.saves()) { assert.equal(button.props.disabled, true); assert.equal(button.props['aria-busy'], true); assert.equal(content(button), 'Saving draft…'); button.props.onClick(); }
    assert.equal(t.transactions, 1); t.release(); await flush(); t.render();
    assert.equal(t.raw.revision, 1); assert.equal(t.raw.draft.premades[0].isDraft, true); assert.equal(t.raw.draft.premades[0].visible, false);
    assert.deepEqual(t.raw.localPublished, publicBefore); assert.equal(t.h.find(n => n.type?.name === 'Field' && n.props.label === 'Listing name'), undefined); t.h.unmount();
  }
});

test('both Save as Draft positions retain edits after failure and share authorization/tag validation locks', async () => {
  const t = listingFixture({ failure: true }); t.saves()[0].props.onClick(); t.saves()[1].props.onClick(); t.release(); await flush(); t.render();
  assert.equal(t.callbacks, 1); assert.equal(t.raw.revision, 0); assert.equal(t.value.premades[0].description, 'Private edit');
  for (const button of t.saves()) { assert.equal(button.props.disabled, false); assert.equal(button.props['aria-busy'], false); }
  t.props.canSavePremadeDraft = false; t.render(); for (const button of t.saves()) { assert.equal(button.props.disabled, true); button.props.onClick(); } assert.equal(t.callbacks, 1);
  t.props.canSavePremadeDraft = true; t.props.onEdit(draft => { draft.premades[0].tags = Array.from({ length: 11 }, (_, i) => `Tag ${i}`); }); t.render();
  for (const button of t.saves()) { assert.equal(button.props.disabled, true); button.props.onClick(); } assert.equal(t.callbacks, 1); t.h.unmount();
});

test('compiled listing header lets titles, badges and adjacent actions wrap without shrinking controls into the badges', () => {
  const styles = modules.OwnerTemplateManagers.classes;
  for (const width of [375, 768, 1440]) {
    const wrapper = element('div', { class: styles.listingCard }), section = element('section', {}, wrapper), heading = element('div', {}, section), title = element('div', {}, heading), actions = element('div', { class: styles.listingActions }, heading), badges = element('div', { class: styles.listingBadges }, actions), controls = element('div', { class: styles.listingControls }, actions);
    const css = cascade(sheets, width); assert.equal(css(heading)['flex-wrap'], 'wrap'); assert.equal(css(title)['overflow-wrap'], 'anywhere');
    for (const node of [actions, badges, controls]) { assert.equal(css(node)['min-width'], '0'); assert.equal(css(node)['flex-wrap'], 'wrap'); assert.equal(css(node)['justify-content'], width <= 650 ? 'flex-start' : 'flex-end'); }
    assert.equal(css(controls).gap, '10px');
  }
});
