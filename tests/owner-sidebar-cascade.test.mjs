import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';
const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compiled = await postcss([local(), scope({ generateScopedName: name => `OwnerPortal_${name}` })]).process(read('src/owner/OwnerPortal.module.css'), { from: 'OwnerPortal.module.css' });
const globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');
const css = [globals, modes, compiled.css];
const className = name => `OwnerPortal_${name}`;
function fixture(mode = 'light') {
  const html = element('html'), body = element('body', {}, html), frame = element('div', { class: 'selected-design' }, body);
  const portal = element('div', { class: className('portal'), 'data-owner-portal': '', 'data-color-mode': mode }, frame);
  const sidebar = element('aside', { class: className('sidebar') }, portal);
  const nav = element('nav', { class: className('sideNav') }, sidebar);
  const link = element('a', { href: '/taylor/pages' }, nav), label = element('span', {}, link);
  const bottom = element('div', { class: className('sidebarBottom') }, sidebar), utilities = element('div', { class: className('sidebarUtilities') }, bottom);
  const service = element('a', { class: className('serviceTab'), href: '/taylor/services' }, utilities), icon = element('svg', {}, service);
  const help = element('button', { class: 'HelpButton_helpButton', 'aria-describedby': 'taylor-help-description' }, utilities);
  const publicHeader = element('header', { class: 'site-header' }, frame), publicNav = element('nav', {}, publicHeader), publicLink = element('a', { href: '/gallery' }, publicNav);
  return { portal, sidebar, nav, link, label, service, icon, help, publicLink };
}
function surface(node, computed) {
  for (let current = node; current; current = current.parent) {
    const color = computed(current)['background-color'];
    if (color && color !== 'transparent') return color;
  }
  return '#fff';
}

// These assertions evaluate the compiled cascade, not literal selector strings.
// Browser/pixel verification remains separate and is not represented by this test.
test('light/dark navigation anchors stay readable through actual website and owner cascades in either stylesheet order', () => {
  for (const sheets of [css, [compiled.css, globals, modes]]) for (const mode of ['light', 'dark']) for (const state of ['idle', 'visited', 'hover', 'focus-visible', 'active', 'current', 'current-hover', 'current-focus']) {
    const t = fixture(mode), computed = cascade(sheets);
    if (state.includes('hover')) t.link.states.add('hover');
    if (state.includes('focus')) t.link.states.add('focus-visible');
    if (state.includes('current')) t.link.attrs['aria-current'] = 'page';
    if (['active', 'visited'].includes(state)) t.link.states.add(state);
    const style = computed(t.link), background = surface(t.link, computed);
    for (const node of [t.link, t.label]) assert.ok(contrast(computed(node).color, background) >= 4.5, `${mode}/${state} foreground ${computed(node).color} on ${background}`);
    assert.equal(style.display, 'flex'); assert.equal(style.width, '100%');
    if (state.includes('focus')) assert.ok(contrast(style['outline-color'], surface(t.sidebar, computed)) >= 3, `${mode} keyboard focus remains visible`);
    assert.equal(computed(t.publicLink).color, 'white', 'owner correction does not recolor public navigation');
    if (mode === 'light') assert.notEqual(style.color, 'white');
  }
});

test('service quick view keeps icon beside text instead of inheriting the saved-site space-between layout', () => {
  for (const width of [375, 768, 1440]) for (const mode of ['light', 'dark']) for (const state of ['idle', 'hover', 'focus-visible', 'current']) {
    const t = fixture(mode), computed = cascade(css, width);
    if (state === 'current') t.service.attrs['aria-current'] = 'page'; else t.service.states.add(state);
    const style = computed(t.service);
    assert.equal(style['justify-content'], 'flex-start'); assert.equal(style['align-items'], 'center');
    assert.equal(style['min-height'], '40px'); assert.equal(computed(t.icon)['flex'], '0 0 18px');
    assert.ok(contrast(style.color, surface(t.service, computed)) >= 4.5, `${mode}/${state}/${width}`);
  }
});

test('native hrefs, disabled visual state, Help blue and slim scroll rail remain independent', () => {
  for (const mode of ['light', 'dark']) {
    const t = fixture(mode), computed = cascade(css); t.link.attrs['aria-disabled'] = 'true';
    assert.equal(t.link.attrs.href, '/taylor/pages'); assert.equal(computed(t.link).opacity, '.5');
    for (const state of ['idle', 'hover', 'focus-visible']) {
      t.help.states = new Set([state]);
      assert.equal(computed(t.help)['background-color'], '#54a6eb');
      assert.ok(contrast(computed(t.help).color, '#54a6eb') >= 4.5);
    }
    assert.equal(computed(t.nav)['overflow-y'], 'auto'); assert.equal(computed(t.nav)['overflow-x'], 'hidden');
    assert.equal(computed(t.nav)['scrollbar-gutter'], 'stable');
  }
});

test('cascade evaluator detects the original white-on-white regression and specificity of functional pseudos', () => {
  const t = fixture('light');
  const original = cascade([globals, '.OwnerPortal_sideNav :is(button, a) { color: #797174; }']);
  assert.equal(original(t.link).color, 'white');
  const computed = cascade(['.selected-design nav a { color: white; } .OwnerPortal_portal .OwnerPortal_sideNav :is(button, a) { color: #675b5f; } :where(.OwnerPortal_portal .OwnerPortal_sideNav) a { color: red; }']);
  assert.equal(computed(t.link).color, '#675b5f');
});
