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
const output = await postcss([local(), scope({ generateScopedName: key => `ClientHub_${key}` })]).process(read('src/client-hub/ClientHub.module.css'), { from: 'src/client-hub/ClientHub.module.css' });
const classes = {};
output.root.walkRules(':export', rule => rule.walkDecls(decl => { classes[decl.prop] = decl.value; }));
const globals = read('src/app/globals.css');
const modes = read('src/app/color-modes.css');
// Animation keyframe selectors are not element selectors; this static evaluator
// intentionally tests layout/color rules, not animation timing.
const compiled = output.root.clone(); compiled.walkAtRules('keyframes', rule => rule.remove());
const moduleCss = compiled.toString();
const cssOrders = [[globals, modes, moduleCss], [moduleCss, globals, modes]];

function fixture(mode) {
  const root = element('html');
  const body = element('body', {}, root);
  const theme = element('div', { 'data-theme-scope': 'public', 'data-color-mode': mode }, body);
  const published = element('div', { class: 'selected-design', 'data-site-theme': 'true', 'data-site-render-mode': 'public' }, theme);
  const hub = element('div', { class: classes.hub, 'data-client-hub': '' }, published);
  const layout = element('div', { class: classes.loginLayout }, hub);
  const welcome = element('section', { class: classes.welcome }, layout);
  const welcomeCopy = element('div', { class: classes.welcomeCopy }, welcome);
  const eyebrow = element('p', { class: classes.eyebrow }, welcomeCopy);
  const heading = element('h1', {}, welcomeCopy);
  const introduction = element('p', {}, welcomeCopy);
  const card = element('section', { class: classes.loginCard }, layout);
  const title = element('h2', {}, card);
  const form = element('form', { class: classes.loginForm }, card);
  const label = element('label', { class: classes.codeLabel }, form);
  const control = element('div', { class: classes.codeControl }, form);
  const input = element('input', { type: 'password' }, control);
  const show = element('button', { class: classes.revealCode }, control);
  const primary = element('button', { class: classes.primary }, form);
  const detail = element('article', { class: classes.projectDetail }, hub);
  const status = element('span', { class: classes.status, 'data-status': 'in-progress' }, detail);
  const choice = element('button', { class: classes.projectChoice, 'aria-pressed': 'true' }, hub);
  const name = element('span', { class: classes.projectName }, choice);
  const state = element('span', { class: classes.projectStatus, 'data-status': 'in-progress' }, choice);
  const secondary = element('button', { class: classes.secondary }, hub);
  const identity = element('section', { class: classes.identity }, hub);
  const id = element('input', { class: classes.clientId }, identity);
  return { root, hub, layout, welcome, eyebrow, heading, introduction, card, title, form, label, input, show, primary, detail, status, choice, name, state, secondary, identity, id };
}

// Compiled selector/cascade regression coverage, not a claim of browser pixel QA.
test('Client Hub welcome artwork panel remains burgundy with readable white text in light/dark and both CSS orders', () => {
  for (const mode of ['light', 'dark']) for (const sheets of cssOrders) {
    const t = fixture(mode), computed = cascade(sheets), surface = computed(t.welcome)['background-color'];
    assert.equal(surface, '#7f0011'); assert.equal(computed(t.heading).color, '#fff');
    for (const field of ['heading', 'eyebrow', 'introduction']) assert.ok(contrast(computed(t[field]).color, surface) >= 4.5, `${mode}: ${field}`);
  }
});

test('code label, full-width input, show control and primary action remain legible in both themes and CSS orders', () => {
  for (const mode of ['light', 'dark']) for (const sheets of cssOrders) {
    const t = fixture(mode), computed = cascade(sheets), surface = computed(t.layout)['background-color'];
    assert.ok(contrast(computed(t.label).color, surface) >= 4.5, `${mode}: code label`);
    assert.ok(contrast(computed(t.title).color, surface) >= 4.5, `${mode}: card title`);
    assert.equal(computed(t.input).width, '100%'); assert.equal(computed(t.input).height, '50px'); assert.equal(computed(t.input)['min-width'], '0');
    for (const field of ['input', 'show', 'primary']) assert.ok(contrast(computed(t[field]).color, computed(t[field])['background-color']) >= 4.5, `${mode}: ${field}`);
    assert.equal(computed(t.primary)['border-radius'], '12px'); assert.equal(computed(t.primary)['min-height'], '48px');
  }
});

test('private dashboard status, selected commission, ID and secondary actions are readable in both themes', () => {
  for (const mode of ['light', 'dark']) for (const sheets of cssOrders) {
    const t = fixture(mode), computed = cascade(sheets);
    for (const field of ['status', 'id', 'secondary']) assert.ok(contrast(computed(t[field]).color, computed(t[field])['background-color']) >= 4.5, `${mode}: ${field}`);
    assert.ok(contrast(computed(t.name).color, computed(t.choice)['background-color']) >= 4.5, `${mode}: name`); assert.ok(contrast(computed(t.state).color, computed(t.state)['background-color']) >= 4.5, `${mode}: state`);
    assert.match(computed(t.choice)['box-shadow'], /inset 3px/, 'selected commission has more than a color-only marker');
  }
});

test('small screens use one-column login and project layout; controls do not force minimum-width overflow', () => {
  const t = fixture('light'), computed = cascade(cssOrders[0], 375);
  const projects = element('div', { class: classes.projectLayout }, t.hub);
  const list = element('ul', { class: classes.projectList }, projects);
  const copy = element('div', { class: classes.copyControl }, t.identity);
  assert.equal(computed(t.layout)['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(computed(projects)['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(computed(list)['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(computed(copy)['min-width'], '0'); assert.equal(computed(copy)['flex-wrap'], 'wrap');
  assert.equal(computed(t.hub)['overflow-wrap'], 'anywhere');
});
