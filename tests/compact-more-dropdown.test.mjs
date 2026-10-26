import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness, nodes } from './owner-ui-harness.mjs';
import { cascade, element, contrast } from './helpers/css-cascade.mjs';

test('More and custom selects render the same decorative SVG, not a text arrow or an extra keyboard stop', () => {
  const h = harness();
  h.overrides.react = React; h.overrides['react/jsx-runtime'] = jsxRuntime;
  h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  h.overrides['next/image'] = { __esModule: true, default: () => null };
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  h.overrides['./Cart'] = { useCart: () => ({ item: null, enabled: true, add() {}, open() {} }) };
  const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  value.site.moreEnabled = true; value.pages.find(p => p.builtinKey === 'contact').navPlacement = 'more';
  const Nav = h.load('src/components/Nav.tsx').Nav;
  const Frame = h.load('src/components/SiteContent.tsx').SiteContentFrame;
  const Select = h.load('src/components/SiteSelect.tsx').default;
  const nav = renderToStaticMarkup(React.createElement(Nav, { showPremades: true, moreEnabled: true, moreLinks: [{ href: '/contact', label: 'Contact' }] }));
  const frames = ['public', 'private-preview', 'editor'].map(mode => renderToStaticMarkup(React.createElement(Frame, { content: value, page: value.pages[0], mode })));
  const select = renderToStaticMarkup(React.createElement(Select, { id: 'shared-arrow', value: '', onChange() {}, options: [] }));
  for (const html of [nav, ...frames, select]) {
    assert.match(html, /<svg[^>]+viewBox="0 0 20 20"[^>]+width="18"[^>]+stroke-width="1.7"[^>]+aria-hidden="true"[^>]+focusable="false"><path d="m5 7.5 5 5 5-5"/);
    assert.doesNotMatch(html, /⌄|<svg[^>]+tabindex/);
  }
  for (const html of [nav, ...frames]) {
    assert.match(html, /<summary>More <svg class="nav-more-chevron"/);
    assert.doesNotMatch(html, /role="(?:listbox|option|menu|menuitem)"/, 'navigation stays links, not select options');
  }
});

test('public and preview More retain browser-owned repeat toggles and hide/reappear without editing navigation', () => {
  for (const mode of ['nav', 'public', 'private-preview', 'editor']) {
    const h = harness(); h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
    const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
    value.site.moreEnabled = true; value.pages.find(p => p.builtinKey === 'contact').navPlacement = 'more';
    const before = structuredClone(value);
    const Component = mode === 'nav' ? h.load('src/components/Nav.tsx').Nav : h.load('src/components/SiteContent.tsx').SiteContentFrame;
    const props = mode === 'nav' ? { showPremades: true, moreEnabled: true, moreLinks: [{ href: '/contact', label: 'Contact' }] } : { content: value, page: value.pages[0], mode };
    const render = () => h.render(Component, props);
    render(); const details = () => h.find(n => n.type === 'details');
    const summary = nodes(details()).find(n => n.type === 'summary');
    assert.equal(summary.props.onClick, undefined); assert.equal(summary.props.onKeyDown, undefined);
    for (const key of ['Enter', ' ']) {
      let prevented = false;
      details().props.onKeyDown({ key, preventDefault() { prevented = true; }, stopPropagation() {} });
      assert.equal(prevented, false, `${mode}: ${key} retains native summary activation`);
    }
    const dom = details().props.ref.current;
    for (const open of [true, false, true, false]) { dom.open = open; render(); assert.equal(dom.open, open); assert.equal(details().props.open, undefined); }
    if (mode === 'nav') props.moreEnabled = false; else value.site.moreEnabled = false;
    render(); assert.equal(details(), undefined);
    if (mode === 'nav') props.moreEnabled = true; else value.site.moreEnabled = true;
    render(); assert.ok(details()); assert.equal(details().props.ref.current.open, false);
    assert.deepEqual(value, before); h.unmount();
  }
});

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');
function fixture(mode, owner = false) {
  const body = element('body');
  const scope = element('div', { [owner ? 'data-owner-portal' : 'data-theme-scope']: owner ? '' : 'public', 'data-color-mode': mode }, body);
  const frame = element('div', { class: 'selected-design', 'data-site-theme': 'true', 'data-site-render-mode': owner ? 'editor' : 'public' }, scope);
  const header = element('header', { class: 'site-header' }, frame), nav = element('nav', {}, header);
  const details = element('details', { class: 'nav-more' }, nav), summary = element('summary', {}, details);
  const arrow = element('svg', { class: 'nav-more-chevron' }, summary), menu = element('div', { class: 'nav-more-menu' }, details), link = element('a', { href: '/contact' }, menu);
  return { details, summary, arrow, menu, link };
}

test('More rotates only while open and uses compact, theme-safe surfaces and visible keyboard focus', () => {
  for (const sheets of [[globals, modes], [modes, globals]]) for (const width of [375, 768, 1440]) for (const mode of ['light', 'dark']) for (const owner of [false, true]) {
    const t = fixture(mode, owner), css = cascade(sheets, width), dark = mode === 'dark' && !owner;
    assert.equal(css(t.arrow).width, '18px'); assert.equal(css(t.arrow).height, '18px');
    assert.equal(css(t.arrow)['flex-shrink'], '0'); assert.equal(css(t.arrow)['pointer-events'], 'none');
    assert.equal(css(t.arrow).transform, undefined); assert.equal(css(t.menu).display, 'none');
    t.details.attrs.open = ''; assert.equal(css(t.arrow).transform, 'rotate(180deg)'); assert.equal(css(t.menu).display, 'flex');
    assert.equal(css(t.menu)['border-radius'], '7px'); assert.equal(css(t.menu)['box-shadow'], '0 4px 12px #0002');
    assert.equal(css(t.menu)['background-color'], dark ? '#242426' : '#fff');
    assert.equal(css(t.link).color, dark ? '#f4edf0' : '#302c2c');
    assert.ok(contrast(css(t.link).color, css(t.menu)['background-color']) > 7);
    assert.equal(css(t.summary).color, dark ? '#f4edf0' : '#fff');
    assert.equal(css(t.link).border, '0'); assert.equal(css(t.link)['border-radius'], '3px');
    t.summary.states.add('focus-visible'); assert.equal(css(t.summary).outline, '2px solid currentColor');
    t.link.states.add('focus-visible'); assert.equal(css(t.link).outline, '2px solid currentColor'); assert.equal(css(t.link)['outline-offset'], '-2px');
    assert.equal(css(t.link)['background-color'], 'color-mix(in srgb,currentColor 10%,transparent)');
    t.link.states.clear(); t.link.attrs['aria-current'] = 'page';
    assert.equal(css(t.link)['font-weight'], '600'); assert.equal(css(t.link).color, dark ? '#f4edf0' : '#302c2c');
  }
  assert.match(globals, /@media\(prefers-reduced-motion:reduce\)\{\.selected-design \.nav-more-chevron\{transition:none\}\}/);
});

test('More summary uses saved header ink while its dropdown uses the saved surface palette', () => {
  const theme = '.selected-design[data-site-theme="true"]{--site-header-text:#123456;--site-surface:#eef2f6;--site-text:#17222d;--site-border:#aab8c6}';
  for (const owner of [false, true]) {
    const t = fixture('light', owner), css = cascade([globals, modes, theme]);
    assert.equal(css(t.summary).color, '#123456'); assert.equal(css(t.menu)['background-color'], '#eef2f6');
    assert.equal(css(t.link).color, '#17222d'); assert.equal(css(t.menu)['border-color'], '#aab8c6');
  }
});
