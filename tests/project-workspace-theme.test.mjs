import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';
const require = createRequire(import.meta.url), local = require('next/dist/compiled/postcss-modules-local-by-default'), scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function compile(folder, name) { const result = await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/${folder}/${name}.module.css`), { from: `${name}.module.css` }); result.root.walkAtRules('keyframes', rule => rule.remove()); return result.root.toString(); }
const owner = await compile('owner', 'OwnerPortal'), hub = await compile('client-hub', 'ClientHub'), work = await compile('client-hub', 'ProjectWorkspace'), ownerHub = await compile('owner', 'OwnerClientHub');
const base = [read('src/app/globals.css'), read('src/app/color-modes.css'), owner, hub, ownerHub];
function fixture(mode, isOwner) {
  const page = element('div', { class: 'selected-design', ...(isOwner ? {} : { 'data-theme-scope': 'public', 'data-color-mode': mode }) });
  const boundary = isOwner ? element('div', { class: 'OwnerPortal_portal', 'data-owner-portal': '', 'data-color-mode': mode }, page) : element('div', { class: 'ClientHub_hub', 'data-client-hub': '' }, page);
  return { boundary, root: element('section', { class: 'ProjectWorkspace_workspace', ...(isOwner ? { 'data-owner-workspace': 'true' } : {}) }, boundary) };
}

test('shared workspace controls have readable contrast in both themes and inside both actual boundaries', () => {
  for (const mode of ['light', 'dark']) for (const isOwner of [true, false]) for (const sheets of [[...base, work], [work, ...base]]) {
    const { root } = fixture(mode, isOwner), compute = cascade(sheets);
    for (const className of ['ProjectWorkspace_button', 'ProjectWorkspace_button ProjectWorkspace_primary', 'ProjectWorkspace_tab']) {
      const button = element('button', { class: className, ...(className.endsWith('_tab') ? { role: 'tab', 'aria-selected': 'true' } : {}) }, root), css = compute(button);
      assert.ok(contrast(css.color, css['background-color']) >= 4.5, `${mode} ${isOwner ? 'owner' : 'client'} ${className}: ${css.color} on ${css['background-color']}`);
    }
    for (const tag of ['input', 'textarea', 'select']) { const target = element(tag, {}, root), css = compute(target); assert.ok(contrast(css.color, css['background-color']) >= 4.5, `${mode} ${isOwner ? 'owner' : 'client'} ${tag}`); }
  }
});

test('mobile workspace uses bounded photo columns, scrollable tabs and hidden inactive panels', () => {
  for (const sheets of [[...base, work], [work, ...base]]) {
    const { root } = fixture('light', false), panel = element('div', { class: 'ProjectWorkspace_panel', hidden: '' }, root), photos = element('div', { class: 'ProjectWorkspace_photoGrid' }, root), tabs = element('div', { class: 'ProjectWorkspace_tabs' }, root);
    for (const width of [375, 390, 420]) { const compute = cascade(sheets, width); assert.match(compute(photos)['grid-template-columns'], /repeat\(2/); assert.equal(compute(panel).display, 'none'); assert.equal(compute(tabs)['overflow-x'], 'auto'); }
    assert.match(cascade(sheets, 760)(photos)['grid-template-columns'], /repeat\(auto-fill,minmax\(150px,180px\)\)/);
  }
});

test('owner notification is a padded bordered dismissible surface instead of a full-width raw green text strip', () => {
  const { boundary } = fixture('dark', true), root = element('div', { class: 'OwnerClientHub_root' }, boundary), notice = element('div', { class: 'OwnerClientHub_notice', role: 'status' }, root), close = element('button', {}, notice);
  for (const sheets of [[...base, work], [work, ...base]]) { const compute = cascade(sheets); assert.equal(compute(notice)['border-radius'], '11px'); assert.notEqual(compute(notice).padding, '0'); assert.equal(compute(close)['min-width'], '34px'); assert.ok(contrast(compute(close).color, compute(close)['background-color']) >= 4.5); }
});
