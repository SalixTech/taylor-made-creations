import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness, content as textContent } from './owner-ui-harness.mjs';
import { cascade, element, contrast } from './helpers/css-cascade.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const h = harness();
h.overrides.react = React;
h.overrides['react/jsx-runtime'] = jsxRuntime;
h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
h.overrides['next/image'] = { __esModule: true, default: incoming => { const props = { ...incoming }; delete props.fill; delete props.unoptimized; return React.createElement('img', props); } };
h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
const defaults = h.load('src/owner/defaults.ts'), model = h.load('src/owner/model.ts'), design = h.load('src/owner/site-design.ts');
const { SiteContentFrame } = h.load('src/components/SiteContent.tsx');
const make = () => defaults.createDefaultOwnerContent();
const render = (value, key = 'home', mode = 'public') => renderToStaticMarkup(React.createElement(SiteContentFrame, { content: value, page: value.pages.find(page => page.builtinKey === key), mode, editable: mode === 'editor' }));
const copyForPublic = value => model.publicContentToOwnerContent(model.createPublicContentSnapshot(value));
const globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');

function editorSetup(file, props) {
  const ui = harness(); ui.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  let value = make();
  const Component = ui.load(`src/owner/${file}.tsx`)[file];
  const input = { ...props, content: value, onEdit(change) { value = structuredClone(value); change(value); input.content = value; } };
  const render = () => ui.render(Component, input); render();
  return { ui, input, render, get value() { return value; } };
}

test('legacy photo credits keep the dynamic site name without migrating old content', () => {
  const value = make(), before = structuredClone(value);
  assert.equal(value.contentOverrides, undefined);
  assert.equal(design.getTemplateText(value, 'home.photoCredit'), value.site.name.toUpperCase());
  assert.deepEqual(value, before);
  value.site.name = 'Another studio';
  assert.equal(design.getTemplateText(value, 'home.photoCredit'), 'ANOTHER STUDIO');
  assert.equal(copyForPublic(value).contentOverrides, undefined);
});

test('photo credit editing, hiding and reset use the existing template controls without changing the photo description', () => {
  const t = editorSetup('OwnerTemplateEditor', { target: 'template-text:home.photoCredit' });
  const original = structuredClone(t.value.home.image);
  const field = () => t.ui.find(n => ['Field','OwnerLinkedTextField'].includes(n.type?.name) && n.props.label === 'Main photo credit');
  const button = label => t.ui.find(n => n.type === 'button' && textContent(n) === label);
  assert.equal(field().props.value, '{siteNameUpper}');
  assert.match(field().props.hint, /Leave blank to hide/);
  field().props.onChange('Photo by Taylor'); t.render();
  assert.equal(design.getTemplateText(t.value, 'home.photoCredit'), 'Photo by Taylor');
  button('Hide text').props.onClick(); t.render();
  assert.equal(t.value.contentOverrides.text['home.photoCredit'], '');
  assert.equal(button('Hide text'), undefined);
  assert.equal(copyForPublic(t.value).contentOverrides.text['home.photoCredit'], '');
  assert.deepEqual(t.value.home.image, original);
  button('Reset to original text').props.onClick(); t.render();
  assert.equal(field().props.value, '{siteNameUpper}');
  assert.deepEqual(t.value.home.image, original);
});

test('main photo inspector always exposes the credit control so hidden text can be restored', () => {
  const t = editorSetup('OwnerVisualBuilder', { page: make().pages.find(page => page.builtinKey === 'home'), browsing: false, onBrowsingChange() {}, onPageChange() {}, onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove() {} });
  t.input.page = t.value.pages.find(page => page.builtinKey === 'home');
  t.input.onEdit(value => { value.contentOverrides = { text: { 'home.photoCredit': '' } }; });
  t.render();
  t.ui.find(n => n.type === 'button' && textContent(n) === 'Main photo').props.onClick(); t.render();
  assert.ok(t.ui.find(n => n.type?.name === 'OwnerTemplateEditor' && n.props.target === 'template-text:home.photoCredit'));
});

test('edited and hidden photo credit roundtrips identically across editor, preview and public markup', () => {
  for (const credit of ['A personal photo credit', '', '   ']) {
    const value = make(); value.contentOverrides = { text: { 'home.photoCredit': credit } };
    const published = copyForPublic(value);
    for (const mode of ['editor', 'private-preview', 'public']) {
      const html = render(mode === 'public' ? published : value, 'home', mode);
      assert.ok(html.includes(`alt="${value.home.image.alt}"`));
      assert.ok(html.includes(value.home.caption));
      assert.equal(html.includes('class="image-caption-credit"'), !!credit.trim());
      if (credit.trim()) assert.ok(html.includes(credit));
      assert.equal(html.includes('data-owner-edit="template-text:home.photoCredit"'), mode === 'editor' && !!credit.trim());
    }
  }
});

test('clearing both home captions removes the empty caption row, not the image or accessible alt text', () => {
  const value = make(); value.home.caption = ''; value.contentOverrides = { text: { 'home.photoCredit': '' } };
  const html = render(copyForPublic(value));
  assert.doesNotMatch(html, /class="image-caption"|class="image-caption-credit"/);
  assert.ok(html.includes(`alt="${value.home.image.alt}"`));
  assert.ok(html.includes('src="/images/home-collage.webp"'));
});

test('photo credit stays plain bounded text, with strict unknown-key rejection and HTML escaping', () => {
  const value = make(); value.contentOverrides = { text: { 'home.photoCredit': '<script>alert(1)</script>' } };
  assert.equal(model.validateOwnerContent(value).valid, true);
  assert.match(render(value), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(render(value), /<script>/);
  value.contentOverrides.text['home.photoCredit'] = 'x'.repeat(2001);
  assert.equal(model.validateOwnerContent(value).valid, false);
  value.contentOverrides.text = { 'home.photoCredit': '', 'home.arbitrary': 'Not allowed' };
  assert.equal(model.validateOwnerContent(value).valid, false);
});

test('price color is optional and safe, roundtrips with custom accents, and does not mutate existing designs', () => {
  const value = make(); value.design = { colors: { accent: '#215a70', text: '#243438' }, spacing: 'relaxed' };
  const before = structuredClone(value);
  assert.deepEqual(design.getSiteThemeStyle(value), { '--site-accent': '#215a70', '--site-text': '#243438', '--site-spacing': 1.3 });
  assert.deepEqual(copyForPublic(value).design, before.design);
  value.design.colors.priceText = '#302c2c';
  assert.equal(model.validateOwnerContent(value).valid, true);
  assert.deepEqual(copyForPublic(value).design, value.design);
  assert.equal(design.getSiteThemeStyle(value)['--site-price-text'], '#302c2c');
  assert.equal(design.getSiteThemeStyle(value)['--site-accent'], '#215a70');
  for (const invalid of ['red', '#abc', '', 'url(javascript:alert(1))', null, 17]) {
    value.design.colors.priceText = invalid;
    assert.equal(model.validateOwnerContent(value).valid, false);
    assert.equal(design.getSiteThemeStyle(value)['--site-price-text'], undefined);
  }
});

test('Price text picker reflects its inherited accent and can reset without changing buttons or main text', () => {
  const t = editorSetup('OwnerDesignPanel', { onReset() {} });
  t.input.onEdit(value => { value.design = { colors: { accent: '#215a70', text: '#243438' } }; }); t.render();
  const picker = () => t.ui.find(n => n.type === 'input' && n.props['aria-label'] === 'Price text');
  assert.equal(picker().props.value, '#215a70');
  picker().props.onChange({ target: { value: '#302c2c' } }); t.render();
  assert.deepEqual(t.value.design.colors, { accent: '#215a70', text: '#243438', priceText: '#302c2c' });
  t.ui.find(n => n.props['aria-label'] === 'Reset price text').props.onClick(); t.render();
  assert.deepEqual(t.value.design.colors, { accent: '#215a70', text: '#243438' });
  assert.equal(picker().props.value, '#215a70');
});

test('custom prices use the same theme token in editor, private preview and public rendering', () => {
  const value = make(); value.design = { colors: { accent: '#215a70', priceText: '#302c2c' } };
  for (const mode of ['editor', 'private-preview', 'public']) {
    const html = render(mode === 'public' ? copyForPublic(value) : value, 'prices', mode);
    assert.match(html, /--site-price-text:#302c2c/);
    assert.match(html, /--site-accent:#215a70/);
  }
});

function priceFixture(colors = {}) {
  const root = element('div', { class: 'selected-design', 'data-site-theme': 'true' });
  const card = element('section', { class: 'price-card' }, root);
  const item = element('div', { class: 'price-item' }, card);
  const amount = element('strong', {}, item), startingAt = element('small', {}, amount);
  const link = element('a', { class: 'text-link', href: '/examples' }, card);
  const list = element('dl', { class: 'price-list' }, root), extra = element('dd', {}, list);
  const tokens = `.selected-design{${Object.entries(colors).map(([key, value]) => `--site-${key}:${value}`).join(';')}}`;
  return { root, amount, startingAt, link, extra, computed: cascade([globals, tokens]) };
}

test('price amount CSS separates category, part and extra prices from accents while preserving legacy fallback', () => {
  for (const price of [undefined, '#302c2c']) {
    const t = priceFixture({ accent: '#215a70', ...(price ? { 'price-text': price } : {}) });
    assert.equal(t.computed(t.amount).color, price ?? '#215a70');
    assert.equal(t.computed(t.extra).color, price ?? '#215a70');
    assert.equal(t.computed(t.link).color, '#215a70');
    assert.equal(t.computed(t.startingAt).color, '#706a67');
  }
});

test('price grid retains three desktop columns with larger gutters and a breathable wrapping mobile stack', () => {
  for (const width of [1280, 900, 820, 390, 320]) {
    const root = element('div', { class: 'selected-design' });
    const grid = element('div', { class: 'price-grid' }, root), card = element('section', { class: 'price-card' }, grid);
    const row = element('div', { class: 'price-item' }, card), copy = element('div', {}, row);
    const computed = cascade([globals], width);
    assert.equal(computed(grid)['grid-template-columns'], width > 820 ? 'repeat(3,minmax(0,1fr))' : '1fr');
    assert.equal(computed(grid).gap, width > 820 ? '44px' : '40px');
    assert.equal(computed(card)['min-width'], '0');
    assert.equal(computed(row)['flex-wrap'], 'wrap');
    assert.equal(computed(copy)['overflow-wrap'], 'anywhere');
  }
});

test('a remaining left caption is not accidentally hidden or styled as the credit when the credit is removed', () => {
  const row = element('div', { class: 'image-caption' }), left = element('span', {}, row);
  const computed = cascade([globals], 390);
  assert.notEqual(computed(left).display, 'none');
  assert.equal(computed(left)['letter-spacing'], undefined);
  assert.equal(computed(row)['flex-wrap'], 'wrap');
});

test('the existing-photo panel compiles with owner theme tokens and stays readable in dark and light modes', async () => {
  const require = createRequire(import.meta.url);
  const local = require('next/dist/compiled/postcss-modules-local-by-default');
  const scope = require('next/dist/compiled/postcss-modules-scope');
  const compiled = await postcss([local(), scope({ generateScopedName: key => `PhotoManager_${key}` })]).process(read('src/owner/PhotoManager.module.css'), { from: 'PhotoManager.module.css' });
  for (const mode of ['dark', 'light']) {
    const root = element('div', { 'data-owner-portal': '', 'data-color-mode': mode });
    const panel = element('details', { class: 'PhotoManager_addExisting', open: '' }, root);
    const summary = element('summary', {}, panel), label = element('label', {}, panel), input = element('input', {}, label);
    const computed = cascade([globals, compiled.css, modes]);
    const background = computed(panel)['background-color'];
    assert.equal(background, mode === 'dark' ? '#242426' : '#fff');
    assert.ok(contrast(computed(summary).color, background) >= 4.5);
    assert.ok(contrast(computed(label).color, background) >= 4.5);
    assert.ok(contrast(computed(input).color, computed(input)['background-color']) >= 4.5);
  }
});
