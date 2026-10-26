import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness, content, nodes } from './owner-ui-harness.mjs';
import { cascade, element } from './helpers/css-cascade.mjs';

function builderSetup(pageKey = 'contact') {
  const h = harness();
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  const props = { content: value, page: value.pages.find(p => p.builtinKey === pageKey), browsing: false, liveShopVisibility: false, canUpdateLiveShop: false, onUpdateLiveShop() {}, onBrowsingChange(value) { props.browsing = value; }, onPageChange() {}, onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove() {}, onEdit(change) { value = structuredClone(value); change(value); props.content = value; props.page = value.pages.find(p => p.id === props.page.id); } };
  const render = () => h.render(Builder, props);
  const panel = () => h.find(n => n.type === 'aside');
  const opener = label => h.find(n => n.type === 'button' && n.props['aria-expanded'] !== undefined && content(n).trim() === label);
  const tab = label => nodes(h.find(n => n.props.className === 'panelNav')).find(n => n.type === 'button' && content(n).trim() === label);
  const field = label => h.find(n => n.type?.name === 'Field' && n.props.label === label);
  render(); return { h, props, render, panel, opener, tab, field, get value() { return value; } };
}

test('all external inspector openers toggle closed, expose expanded state, return focus and reopen without edits', () => {
  for (const [page, labels] of [['contact', ['Page content', 'Design', 'Header & footer', 'Page settings', 'Contact details', 'Commission status', '＋ Add a section']], ['home', ['Welcome text', 'Main photo']], ['premades', ['Shop: on ⌄']]]) {
    const t = builderSetup(page);
    for (const label of labels) {
      const before = structuredClone(t.value); let focused = 0;
      const trigger = { focus(options) { assert.equal(options.preventScroll, true); focused++; } };
      assert.equal(t.opener(label).props['aria-expanded'], false, label);
      t.opener(label).props.onClick({ currentTarget: trigger }); t.render();
      assert.equal(t.opener(label).props['aria-expanded'], true, label);
      assert.equal(t.opener(label).props['aria-controls'], t.panel().props.id);
      t.opener(label).props.onClick({ currentTarget: trigger }); t.render();
      assert.equal(t.panel(), undefined, label); assert.equal(t.opener(label).props['aria-expanded'], false); assert.equal(focused, 1);
      t.opener(label).props.onClick({ currentTarget: trigger }); t.render(); assert.ok(t.panel(), label);
      t.h.find(n => n.props['aria-label'] === 'Close section editor').props.onClick(); t.render();
      assert.deepEqual(t.value, before); assert.equal(focused, 2);
    }
    t.h.unmount();
  }
});

test('internal tabs switch without self-closing and preserve external focus target plus unsaved edits', () => {
  const t = builderSetup(); let focused = 0; const trigger = { focus() { focused++; } };
  t.opener('Page content').props.onClick({ currentTarget: trigger }); t.render();
  t.field('Page title').props.onChange('My unsaved contact page'); t.render();
  t.tab('Page content').props.onClick(); t.render(); assert.ok(t.panel());
  t.tab('Design').props.onClick(); t.render(); assert.equal(t.panel().props['aria-label'], 'Website design');
  t.tab('Design').props.onClick(); t.render(); assert.ok(t.panel());
  t.tab('Header & footer').props.onClick(); t.render();
  t.panel().props.onKeyDown({ key: 'Escape', preventDefault() {} }); t.render(); assert.equal(t.panel(), undefined); assert.equal(focused, 1);
  t.opener('Page content').props.onClick({ currentTarget: trigger }); t.render();
  assert.equal(t.field('Page title').props.value, 'My unsaved contact page');
  assert.equal(t.value.pages.find(p => p.builtinKey === 'contact').title, 'My unsaved contact page');
});

test('every external opener respects upload lock and changing the panel closes an open More menu', () => {
  const t = builderSetup(); const menu = { open: true };
  const canvas = t.h.find(n => n.props.onClickCapture).props.ref.current;
  canvas.querySelectorAll = selector => selector === '.nav-more[open]' ? [menu] : [];
  t.opener('Page content').props.onClick(); t.render(); assert.equal(menu.open, false);
  t.props.uploadBusy = true; t.render();
  for (const label of ['Page content', 'Header & footer', 'Design', 'Contact details', 'Commission status', '＋ Add a section']) {
    assert.equal(t.opener(label).props.disabled, true); t.opener(label).props.onClick(); t.render(); assert.equal(t.panel().props['aria-label'], 'Page content');
  }
  const topbar = t.h.find(n => n.type?.name === 'OwnerHeaderEditor'); topbar.props.onOpenChange(true); t.render(); assert.ok(t.panel()); assert.equal(t.h.find(n => n.type?.name === 'OwnerHeaderEditor').props.open, false);
  t.props.uploadBusy = false; t.render(); menu.open = true;
  t.h.find(n => n.type?.name === 'OwnerHeaderEditor').props.onOpenChange(true); t.render(); assert.equal(menu.open, false); assert.equal(t.panel(), undefined);
});

test('the top-bar disclosure toggles and Escape restores its button, but upload lock blocks dismissal', () => {
  const h = harness(); h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const Component = h.load('src/owner/OwnerHeaderEditor.tsx').OwnerHeaderEditor;
  const props = { content: h.load('src/owner/defaults.ts').createDefaultOwnerContent(), open: false, onEdit() {}, onOpenChange(open) { props.open = open; } };
  const render = () => h.render(Component, props), button = () => h.find(n => n.props['aria-expanded'] !== undefined);
  render(); button().props.onClick(); render(); assert.equal(button().props['aria-expanded'], true); assert.equal(button().props['aria-controls'], h.find(n => n.type === 'fieldset').props.id);
  button().props.onClick(); render(); assert.equal(button().props['aria-expanded'], false);
  button().props.onClick(); render(); props.disabled = true; render(); button().props.onClick(); assert.equal(props.open, true);
  const escape = { key: 'Escape', preventDefault() {}, stopPropagation() {} }; h.tree.props.onKeyDown(escape); assert.equal(props.open, true);
  props.disabled = false; render(); const trigger = button().props.ref.current; h.tree.props.onKeyDown(escape); render(); assert.equal(props.open, false); assert.equal(h.document.activeElement, trigger);
});

function disclosureSetup(mode) {
  const h = harness(), listeners = new Map(); h.document.addEventListener = (name, callback) => listeners.set(name, callback); h.document.removeEventListener = (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); };
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent(); value.site.moreEnabled = true; value.pages.find(p => p.builtinKey === 'contact').navPlacement = 'more';
  const Component = mode === 'nav' ? h.load('src/components/Nav.tsx').Nav : h.load('src/components/SiteContent.tsx').SiteContentFrame;
  const props = mode === 'nav' ? { showPremades: true, moreEnabled: true, moreLinks: [{ href: '/contact', label: 'Contact' }] } : { content: value, page: value.pages[0], mode, editable: mode === 'editor' };
  const render = () => h.render(Component, props); render(); const details = () => h.find(n => n.type === 'details'); const dom = details().props.ref.current;
  dom.removeAttribute = name => { assert.equal(name, 'open'); dom.open = false; };
  return { h, props, render, details, dom, listeners, value };
}

test('public, private-preview and editor More retain native disclosure and close on outside pointer, focus, navigation and Escape', () => {
  for (const mode of ['nav', 'public', 'private-preview', 'editor']) {
    const t = disclosureSetup(mode); let focused = 0, stopped = 0;
    assert.equal(t.details().props.open, undefined, 'browser owns native disclosure toggle');
    assert.ok(nodes(t.details()).some(n => n.type === 'summary' && content(n).startsWith('More')));
    t.dom.open = true; t.listeners.get('pointerdown')({ target: t.dom }); assert.equal(t.dom.open, true);
    t.listeners.get('pointerdown')({ target: {} }); assert.equal(t.dom.open, false);
    t.dom.open = true; t.listeners.get('focusin')({ target: {} }); assert.equal(t.dom.open, false);
    t.dom.open = true; t.dom.querySelector = () => ({ focus() { focused++; } });
    t.details().props.onKeyDown({ key: 'Escape', currentTarget: t.dom, preventDefault() {}, stopPropagation() { stopped++; } }); assert.equal(t.dom.open, false); assert.equal(focused, 1); assert.equal(stopped, 1);
    t.dom.open = true;
    if (mode === 'nav') t.h.pathname = '/contact'; else t.props.page = t.value.pages.find(p => p.builtinKey === 'contact');
    t.render(); assert.equal(t.dom.open, false);
    t.h.unmount(); assert.equal(t.listeners.size, 0);
  }
});

const require = createRequire(import.meta.url), read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const local = require('next/dist/compiled/postcss-modules-local-by-default'), scope = require('next/dist/compiled/postcss-modules-scope');
const compiled = await postcss([local(), scope({ generateScopedName: name => `Builder_${name}` })]).process(read('src/owner/OwnerVisualBuilder.module.css'), { from: 'OwnerVisualBuilder.module.css' });
const globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');
function chromeFixture(mode, scaled) {
  const body = element('body'), owner = element('div', { 'data-owner-portal': '', 'data-color-mode': mode }, body), stage = element('div', { class: 'Builder_stage' }, owner);
  const canvas = element('div', { class: 'Builder_canvas' }, stage), panel = element('aside', { class: 'Builder_panel' }, stage);
  const frame = element('div', { class: 'selected-design', 'data-site-render-mode': 'editor', ...(scaled ? { 'data-site-text-size': 'true' } : {}) }, canvas);
  const header = element('header', { class: 'site-header' }, frame), nav = element('nav', {}, header), link = element('a', { href: '/' }, nav), details = element('details', { class: 'nav-more', open: '' }, nav), summary = element('summary', {}, details), menu = element('div', { class: 'nav-more-menu' }, details);
  return { canvas, panel, nav, link, details, summary, menu };
}

test('compiled cascade aligns More with navigation at every width and text scale in both themes and stylesheet orders', () => {
  for (const sheets of [[globals, modes, compiled.css], [compiled.css, globals, modes]]) for (const width of [375, 768, 1440]) for (const mode of ['light', 'dark']) for (const scaled of [false, true]) {
    const t = chromeFixture(mode, scaled), css = cascade(sheets, width), link = css(t.link), summary = css(t.summary);
    assert.equal(summary['font-size'], link['font-size'], `${mode}/${width}/${scaled}`);
    assert.equal(summary.padding, link.padding); assert.equal(summary['border-bottom'], link['border-bottom']); assert.equal(css(t.nav)['align-items'], 'center');
    assert.equal(summary['line-height'], 'inherit'); assert.equal(summary.display, 'flex');
  }
});

test('compiled dropdown stays anchored under More, explicitly hides when closed and cannot escape the canvas above inspector', () => {
  const t = chromeFixture('dark', true), css = cascade([globals, modes, compiled.css]);
  assert.equal(css(t.details).position, 'relative'); assert.equal(css(t.menu).position, 'absolute'); assert.equal(css(t.menu).right, '0'); assert.equal(css(t.menu).top, 'calc(100% + 8px)'); assert.equal(css(t.menu)['text-align'], 'left');
  assert.equal(css(t.canvas).isolation, 'isolate'); assert.equal(css(t.canvas).position, 'relative'); assert.equal(css(t.panel).position, 'fixed'); assert.ok(+css(t.menu)['z-index'] < +css(t.panel)['z-index']);
  assert.equal(css(t.menu).display, 'flex'); delete t.details.attrs.open; assert.equal(css(t.menu).display, 'none');
});

test('canvas editor targets toggle on keyboard and click, while distinct top-bar items switch instead of closing', () => {
  const t = builderSetup();
  const canvas = () => t.h.find(n => n.props.onClickCapture);
  const base = canvas().props.ref.current;
  const target = Object.assign(Object.create(Object.getPrototypeOf(base)), { dataset: { ownerEdit: 'contact' }, focus() {}, closest(selector) { return selector === '[data-owner-edit]' ? this : null; } });
  base.contains = node => node === target;
  const event = extra => ({ target, preventDefault() {}, stopPropagation() {}, ...extra });
  canvas().props.onKeyDownCapture(event({ key: 'Enter' })); t.render(); assert.equal(t.panel().props['aria-label'], 'Contact details');
  canvas().props.onKeyDownCapture(event({ key: ' ' })); t.render(); assert.equal(t.panel(), undefined);
  canvas().props.onClickCapture(event({})); t.render(); assert.equal(t.panel().props['aria-label'], 'Contact details');
  canvas().props.onClickCapture(event({})); t.render(); assert.equal(t.panel(), undefined);
  target.dataset = { ownerNavPage: 'builtin-contact' }; target.closest = selector => selector === '[data-owner-nav-page]' ? target : null;
  const header = () => t.h.find(n => n.type?.name === 'OwnerHeaderEditor');
  canvas().props.onClickCapture(event({})); t.render(); assert.equal(header().props.open, true);
  target.dataset.ownerNavPage = 'builtin-home'; canvas().props.onClickCapture(event({})); t.render(); assert.equal(header().props.open, true, 'a distinct item keeps top-bar editor open');
  canvas().props.onClickCapture(event({})); t.render(); assert.equal(header().props.open, false);
});

test('More menu link activation closes in editor and public navigation without changing link destinations', () => {
  for (const mode of ['nav', 'public', 'private-preview', 'editor']) {
    const t = disclosureSetup(mode); t.dom.open = true;
    if (mode === 'nav') {
      const link = nodes(t.details()).find(n => n.props.href === '/contact'); link.props.onClick(); assert.equal(link.props.href, '/contact');
    } else {
      const target = Object.assign(Object.create(Object.getPrototypeOf(t.dom)), { closest: selector => selector === 'a' ? {} : null });
      t.details().props.onClick({ target, currentTarget: t.dom });
      const link = nodes(t.details()).find(n => n.props.navPageId === 'builtin-contact'); assert.equal(link.props.href, '/contact');
    }
    assert.equal(t.dom.open, false, mode); t.h.unmount();
  }
});
