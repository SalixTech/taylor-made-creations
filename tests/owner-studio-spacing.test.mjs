import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { harness, content } from './owner-ui-harness.mjs';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';

const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function compile(name) {
  const output = await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/owner/${name}.module.css`), { from: `${name}.module.css` });
  const classes = {}; output.root.walkRules(':export', rule => rule.walkDecls(decl => classes[decl.prop] = decl.value));
  return { css: output.css, classes };
}
const modules = Object.fromEntries(await Promise.all(['OwnerPortal', 'TaylorServices', 'OwnerClientHub', 'PayPalStudio'].map(async name => [name, await compile(name)])));
const base = [read('src/app/globals.css'), read('src/app/color-modes.css'), modules.OwnerPortal.css];
const flush = () => new Promise(resolve => setImmediate(resolve));
function root(mode) {
  const site = element('div', { class: 'selected-design' });
  return element('div', { class: modules.OwnerPortal.classes.portal, 'data-owner-portal': '', 'data-color-mode': mode }, site);
}

// The actual component hooks/props plus compiled stylesheet cascade, not browser geometry.
test('Studio connections attaches the semantic dark-theme selector to every real badge before and after checks', async t => {
  const h = harness(), calls = [];
  let configured = false, reject = false;
  h.overrides['./TaylorServices.module.css'] = { __esModule: true, default: modules.TaylorServices.classes };
  h.overrides['./taylor-services-client'] = { serviceReadError: error => error.message, taylorOwnerSession: async () => ({ auth: { app: {} }, assertCurrent() {} }) };
  h.overrides['firebase/functions'] = {
    getFunctions: () => ({}), httpsCallable: (_functions, name) => async () => {
      calls.push(name); if (reject) throw Error('Unavailable');
      return { data: name === 'tmcStudioIntegrationStatus' ? { email: { configured, delivery: 'not-verified' } } : name === 'tmcPayPalStatus' ? { mode: 'sandbox', invoicingReady: configured, liveEnabled: false } : { ready: configured } };
    },
  };
  const Studio = h.load('src/owner/StudioConnections.tsx').StudioConnections;
  const render = () => h.render(Studio);
  t.after(() => h.unmount());
  render(); assert.equal(calls.length, 0);
  for (const state of ['unchecked', 'setup-needed', 'configured-unverified', 'failed']) {
    if (state !== 'unchecked') {
      configured = state === 'configured-unverified'; reject = state === 'failed';
      h.find(node => node.type?.name === 'RefreshButton' && node.props.label === 'Refresh studio connections').props.onClick(); await flush(); render();
    }
    const badges = h.all(node => node.type === 'span' && node.props['data-service-status']);
    assert.equal(badges.length, 4);
    if (state === 'unchecked' || state === 'failed') assert.match(content(h.tree), /Not checked/);
    if (state === 'configured-unverified') assert.match(content(h.tree), /Configured · unverified/);
    for (const mode of ['light', 'dark']) for (const sheets of [[...base, modules.TaylorServices.css], [modules.TaylorServices.css, ...base]]) {
      const portal = root(mode), card = element('section', { class: modules.TaylorServices.classes.card }, portal), computed = cascade(sheets);
      for (const badge of badges) {
        const chip = element('span', { class: badge.props.className, 'data-service-status': badge.props['data-service-status'] }, card);
        const style = computed(chip);
        assert.ok(contrast(style.color, style['background-color']) >= 4.5, `${mode}/${state}: ${style.color} on ${style['background-color']}`);
      }
    }
  }
  assert.equal(calls.length, 9);
});

test('compact client directory keeps a real gap, readable identity text and comfortable hit targets at every width', () => {
  for (const mode of ['light', 'dark']) for (const width of [1440, 900, 375]) {
    const portal = root(mode), hub = element('div', { class: modules.OwnerClientHub.classes.root }, portal);
    const directory = element('section', { class: modules.OwnerClientHub.classes.directory }, hub);
    const list = element('ul', { class: modules.OwnerClientHub.classes.clientList }, directory);
    const row = element('button', { class: modules.OwnerClientHub.classes.clientRow }, element('li', {}, list));
    const computed = cascade([...base, modules.OwnerClientHub.css], width);
    assert.equal(computed(list).display, 'grid'); assert.equal(computed(list).gap, '7px'); assert.equal(computed(row)['min-height'], '69px'); assert.equal(computed(row).padding, '11px');
    assert.equal(computed(list)['align-content'], 'start'); assert.equal(computed(list)['overflow-y'], 'auto');
    assert.equal(computed(row).width, '100%'); const identity=element('span',{class:modules.OwnerClientHub.classes.clientName},row),name=element('strong',{},identity),id=element('code',{},identity); assert.equal(computed(name)['font-size'],'13px'); assert.equal(computed(id)['font-size'],'11px'); assert.equal(computed(id)['word-break'],'break-all');
  }
});

test('PayPal uses the whole workspace, compact item columns, wrapping spaced actions and naturally flowing history', () => {
  for (const mode of ['light', 'dark']) for (const width of [1440, 1024, 800, 375]) {
    const p = modules.PayPalStudio.classes, portal = root(mode);
    const studio = element('section', { class: `${modules.TaylorServices.classes.card} ${p.studio}` }, portal);
    const workspace = element('div', { class: p.workspace }, studio), composer = element('div', { class: p.composer }, workspace);
    const item = element('fieldset', { class: p.lineItem }, composer), fields = element('div', { class: p.itemFields }, item);
    const description = element('label', { class: p.description }, fields), input = element('input', {}, description);
    const actions = element('div', { class: p.actions }, composer), history = element('div', { class: p.history }, workspace);
    const checkbox = element('input', { type: 'checkbox' }, element('label', { class: p.confirmation }, studio));
    const computed = cascade([...base, modules.TaylorServices.css, modules.PayPalStudio.css], width);
    assert.equal(computed(workspace)['grid-template-columns'], 'minmax(0, 1fr)', 'empty history never reserves half the form width');
    assert.equal(computed(actions).display, 'flex'); assert.equal(computed(actions).gap, '10px'); assert.equal(computed(actions)['flex-wrap'], 'wrap');
    assert.equal(computed(input)['box-sizing'], 'border-box'); assert.equal(computed(input).margin, '0');
    assert.equal(computed(checkbox).width, '18px'); assert.equal(computed(history)['min-height'], undefined);
    if (width > 850) assert.match(computed(fields)['grid-template-columns'], /minmax\(0,1fr\).*72px,90px.*110px,145px/);
    else { assert.equal(computed(fields)['grid-template-columns'], 'minmax(0, 1fr) minmax(0, 1fr)'); assert.equal(computed(description)['grid-column'], '1 / -1'); }
  }
});
