import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element } from './helpers/css-cascade.mjs';

const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compiled = (await postcss([local(), scope({ generateScopedName: name => `Hub_${name}` })])
  .process(read('src/owner/CloudFileHub.module.css'), { from: 'CloudFileHub.module.css' })).css;

// Source-level cascade coverage; existing UI tests cover expand/collapse and moves.
test('folder rows have a modest gap at every depth without changing row targets or file-card spacing', () => {
  const site = element('div', { class: 'selected-design' });
  const hub = element('section', { class: 'Hub_hub Hub_manager' }, site);
  const explorer = element('div', { class: 'Hub_explorer' }, hub);
  const rail = element('details', { class: 'Hub_folderSidebar', open: '' }, explorer);
  const nav = element('nav', { 'aria-label': 'File hierarchy' }, rail);
  const branch = parent => {
    const node = element('div', { class: 'Hub_folderBranch' }, parent);
    const row = element('div', { class: 'Hub_folderRow', 'data-drop-target': 'true' }, node);
    const expand = element('button', { class: 'Hub_folderExpand' }, row);
    const link = element('button', { class: 'Hub_folderLink' }, row);
    return { node, row, expand, link };
  };
  const root = branch(nav);
  const children = element('div', { class: 'Hub_folderChildren' }, root.node);
  const fonts = branch(children);
  const projects = branch(children);
  const nested = element('div', { class: 'Hub_folderChildren' }, projects.node);
  const firstNested = branch(nested);
  const secondNested = branch(nested);
  const collapsedSibling = branch(children);
  const filePane = element('div', { class: 'Hub_filePane' }, explorer);
  const list = element('ul', { class: 'Hub_list Hub_grid' }, filePane);
  const item = element('li', { class: 'Hub_item' }, list);
  const globals = read('src/app/globals.css');

  for (const sheets of [[globals, compiled], [compiled, globals]]) {
    for (const width of [375, 700, 820, 1050, 1440]) {
      const computed = cascade(sheets, width);
      for (const container of [children, nested]) {
        assert.equal(computed(container)['margin-top'], '6px');
        assert.equal(computed(container)['margin-left'], '12px');
        assert.equal(computed(container)['padding-left'], '3px');
      }
      for (const sibling of [projects, secondNested, collapsedSibling]) {
        assert.equal(computed(sibling.node)['margin-top'], '6px');
      }
      for (const first of [root, fonts, firstNested]) {
        assert.equal(computed(first.node)['margin-top'], undefined, 'no doubled gap on first child');
      }
      for (const entry of [root, fonts, projects, firstNested, secondNested, collapsedSibling]) {
        assert.equal(computed(entry.row).gap, '2px');
        assert.equal(computed(entry.row).padding, undefined);
        assert.equal(computed(entry.link).padding, '8px 4px');
        assert.equal(computed(entry.expand).height, '30px');
        assert.match(computed(entry.row).outline, /^2px dashed /);
      }
      assert.equal(computed(list).gap, '10px');
      assert.equal(computed(item).padding, '12px');
    }
  }
});
