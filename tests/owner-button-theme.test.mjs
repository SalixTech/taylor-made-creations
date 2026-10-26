import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function compile(name) {
  const output = await postcss([local(), scope({ generateScopedName: key => `${name}_${key}` })]).process(read(`src/owner/${name}.module.css`), { from: `${name}.module.css` });
  const classes = {}; output.root.walkRules(':export', rule => rule.walkDecls(decl => classes[decl.prop] = decl.value));
  return { css: output.css, classes };
}
const modules = Object.fromEntries(await Promise.all(['OwnerButton', 'OwnerPortal', 'AssetLibrary', 'PhotoManager', 'OwnerDialog'].map(async name => [name, await compile(name)])));
const button = modules.OwnerButton.classes, globals = read('src/app/globals.css'), modes = read('src/app/color-modes.css');
const sheets = [globals, modes, ...Object.values(modules).map(module => module.css)];
function fixture(mode = 'light', variant = 'secondary', modifier = '') {
  const html = element('html'), body = element('body', {}, html), site = element('div', { class: 'selected-design' }, body);
  const portal = element('div', { class: modules.OwnerPortal.classes.portal, 'data-owner-portal': '', 'data-color-mode': mode }, site);
  const control = element('button', { class: `${button.button} ${button[variant]} ${modifier && button[modifier]}`, 'data-owner-button': '' }, portal);
  const label = element('span', {}, control);
  return { html, site, portal, control, label };
}
function background(node, computed) {
  for (let current = node; current; current = current.parent) {
    const color = computed(current)['background-color'];
    if (color && color !== 'transparent') return color;
  }
  return '#fff';
}

// Real Next CSS-module selectors and actual stylesheet cascade, not browser QA.
test('shared owner actions retain variants, sizing and readable text in light/dark through either stylesheet order', () => {
  for (const css of [sheets, [modules.OwnerButton.css, ...sheets.slice(0, -5), ...Object.entries(modules).filter(([name]) => name !== 'OwnerButton').map(([, module]) => module.css)]]) {
    for (const mode of ['light', 'dark']) for (const variant of ['primary', 'secondary', 'danger', 'quiet']) {
      for (const state of ['idle', 'hover', 'active', 'focus-visible', 'selected', 'selected-hover', 'selected-active', 'disabled', 'disabled-hover', 'loading']) {
        const t = fixture(mode, variant), computed = cascade(css);
        if (state.includes('hover')) t.control.states.add('hover');
        if (state.includes('active')) t.control.states.add('active');
        if (state === 'focus-visible') t.control.states.add('focus-visible');
        if (state.includes('selected')) t.control.attrs['aria-pressed'] = 'true';
        if (state.includes('disabled') || state === 'loading') t.control.attrs.disabled = '';
        if (state === 'loading') t.control.attrs['aria-busy'] = 'true';
        const style = computed(t.control), fill = background(t.control, computed);
        assert.equal(style.appearance, 'none', `${mode}/${variant}/${state}`);
        assert.equal(style['min-height'], '42px'); assert.equal(style['border-radius'], '10px'); assert.equal(style['font-size'], '12px');
        assert.ok(contrast(style.color, fill) >= 4.5, `${mode}/${variant}/${state}: ${style.color} on ${fill}`);
        assert.equal(computed(t.label).color, style.color, 'nested label stays readable instead of inheriting legacy text colors');
        if (state === 'focus-visible') assert.ok(contrast(style['outline-color'], background(t.portal, computed)) >= 3);
        if (state.includes('disabled')) assert.equal(style.opacity, '1', 'disabled text remains readable');
        if (state === 'loading') assert.equal(style.cursor, 'progress');
        if (state === 'idle' && variant !== 'quiet') assert.ok(contrast(style['border-color'], background(t.portal, computed)) >= 3);
      }
    }
  }
});

test('primary/danger are distinct from neutral actions, compact/icon sizes and selected states share theme tokens', () => {
  for (const mode of ['light', 'dark']) {
    const computed = cascade(sheets), colors = ['primary', 'secondary', 'danger'].map(variant => computed(fixture(mode, variant).control)['background-color']);
    assert.equal(new Set(colors).size, 3);
    const compact = fixture(mode, 'secondary', 'compact'), icon = fixture(mode, 'quiet', 'icon');
    assert.equal(computed(compact.control)['min-height'], '36px'); assert.equal(cascade(sheets, 375)(compact.control)['min-height'], '42px'); assert.equal(computed(icon.control).width, '42px');
    const t = fixture(mode); const idle = computed(t.control); t.control.attrs['aria-pressed'] = 'true'; const selected = computed(t.control);
    assert.notEqual(selected['background-color'], idle['background-color']); assert.notEqual(selected['border-color'], idle['border-color']); assert.match(selected['box-shadow'], /inset/);
  }
  assert.doesNotMatch(read('src/owner/OwnerButton.module.css'), /#[\da-f]{3,8}\b/i, 'shared control module has no duplicated palette literals');
});

test('shared action rules never recolor editable/public canvas buttons and Help keeps its unique blue', () => {
  for (const mode of ['light', 'dark']) for (const state of ['idle', 'hover', 'active', 'focus-visible', 'disabled']) {
    const t = fixture(mode), canvas = element('div', { 'data-site-render-mode': 'preview' }, t.portal);
    const previewButton = element('button', { class: 'savedBrand', 'data-owner-button': '', 'aria-pressed': 'true' }, canvas);
    const publicButton = element('button', { class: 'savedBrand', 'data-owner-button': '', 'aria-pressed': 'true' }, t.site);
    const help = element('button', { class: 'HelpButton_helpButton', 'aria-describedby': 'taylor-help-description' }, t.portal);
    const css = [...sheets, '.savedBrand { background-color:#126e70; color:#fff; border-color:#126e70; }'], computed = cascade(css);
    if (state === 'disabled') { previewButton.attrs.disabled = ''; publicButton.attrs.disabled = ''; help.attrs.disabled = ''; }
    else for (const node of [previewButton, publicButton, help]) node.states.add(state);
    const before = [computed(previewButton), computed(publicButton)];
    for (const node of [previewButton, publicButton]) node.attrs.class += ` ${button.button} ${button.primary}`;
    for (const [index, node] of [previewButton, publicButton].entries()) for (const property of ['background-color', 'color', 'border-color', 'min-height']) assert.equal(computed(node)[property], before[index][property], `${mode}/${state}/${property}`);
    assert.equal(computed(help)['background-color'], '#54a6eb'); assert.ok(contrast(computed(help).color, '#54a6eb') >= 4.5);
  }
});

const photo = { id: '11111111-1111-4111-8111-111111111111', src: '/api/media/private', name: 'Sample photo', width: 300, height: 200, bytes: 1024, trashedAt: null };
function themedHarness() {
  const h = harness();
  for (const [name, module] of Object.entries(modules)) h.overrides[`./${name}.module.css`] = { __esModule: true, default: module.classes };
  return h;
}
function assertThemed(controls) {
  assert.ok(controls.length);
  for (const node of controls) {
    assert.equal(node.props['data-owner-button'], true, content(node));
    assert.ok(node.props.className.split(/\s+/).includes(button.button), content(node));
    assert.equal(node.props.type, 'button');
    assert.doesNotMatch(node.props.className, /undefined/);
  }
}
test('File Hub native controls, photo chooser and confirmation actions use actual compiled shared classes', () => {
  const h = themedHarness(), library = { assets: [photo], loading: false, error: '', available: true, refresh() {}, add() {} };
  h.overrides['./asset-library-client'] = { usePrivateAssetLibrary: () => library };
  h.overrides['./temporary-photo-client'] = { isStagedPhoto: () => true };
  const Library = h.load('src/owner/AssetLibrary.tsx').LegacyAssetLibrary, render = () => h.render(Library, { manager: true, onSelect() {} }); render();
  assertThemed(h.all(node => node.type === 'button'));
  h.find(node => node.props['aria-label'] === 'Delete photo: Sample photo').props.onClick(); render();
  assertThemed(nodes(h.find(node => node.type?.name === 'Dialog').props.actions).filter(node => node.type === 'button'));
  h.unmount();
});
test('cloud File Hub uses the shared compiled button controls even when access is unavailable', () => {
  const h = themedHarness(), Hub = h.load('src/owner/CloudFileHub.tsx').CloudFileHub;
  h.render(Hub, { manager: true }); assertThemed(h.all(node => node.type === 'button')); h.unmount();
});
test('photo/font upload and photo viewer actions read the same compiled theme', () => {
  for (const file of ['PhotoUpload', 'FontUpload', 'TemporaryPhotoView']) {
    const h = themedHarness(); h.overrides['./media-client'] = { useOwnerMediaSource: () => ({ src: '', error: null }) };
    const Component = h.load(`src/owner/${file}.tsx`)[file]; h.render(Component, { photo, onClose() {}, onUploaded() {} });
    assertThemed(h.tree.type?.name === 'Dialog' ? nodes(h.tree.props.actions).filter(node => node.type === 'button') : h.all(node => node.type === 'button'));
    h.unmount();
  }
});
test('minimal dialog keeps a labeled count and shared close control; an error restores its visible body', () => {
  const h = themedHarness(), Dialog = h.load('src/owner/OwnerDialog.tsx').Dialog;
  h.render(Dialog, { title: 'Permanently remove 1 entry?', onClose() {}, children: '', actions: 'Cancel Confirm' });
  assert.equal(h.tree.props['data-compact'], true);
  const title = h.find(node => node.type === 'h2'); assert.equal(content(title), 'Permanently remove 1 entry?'); assert.equal(h.tree.props['aria-labelledby'], title.props.id);
  assertThemed(h.all(node => node.type === 'button'));
  h.render(Dialog, { title: 'Permanently remove 1 entry?', onClose() {}, children: { type: 'p', props: { role: 'alert', children: 'Connection interrupted. Try again.' } }, actions: 'Cancel Confirm' });
  assert.equal(h.tree.props['data-compact'], false); assert.ok(h.find(node => node.props.role === 'alert')); h.unmount();
});
