import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';

test('full notes: nested modal locks restore original body/html style and scroll exactly once in either close order', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const h = harness(); const scrolled = [];
    h.document.body.style = { overflow: 'scroll', position: 'relative', top: '2px', width: '92%', paddingRight: '7px' };
    h.document.documentElement = { style: { overflow: 'auto' }, clientWidth: 980 };
    h.window.scrollY = 375; h.window.innerWidth = 1000; h.window.getComputedStyle = () => ({ paddingRight: '7px' }); h.window.scrollTo = value => scrolled.push(value);
    const { lockPageScroll } = h.load('src/components/modal-scroll-lock.ts');
    const original = structuredClone(h.document.body.style), release = [lockPageScroll(), lockPageScroll()];
    assert.equal(h.document.body.style.position, 'fixed'); assert.equal(h.document.body.style.top, '-375px'); assert.equal(h.document.body.style.paddingRight, '27px'); assert.equal(h.document.documentElement.style.overflow, 'hidden');
    release[order[0]](); release[order[0]]();
    assert.equal(h.document.body.style.overflow, 'hidden'); assert.equal(scrolled.length, 0);
    release[order[1]](); release[order[1]]();
    assert.deepEqual(h.document.body.style, original); assert.equal(h.document.documentElement.style.overflow, 'auto'); assert.deepEqual(scrolled, [{ top: 375, behavior: 'instant' }]);
    lockPageScroll()(); assert.equal(scrolled.length, 2, 'later opening is not stranded by a previous repeated close');
  }
});
test('full notes: Manage pages/long filename dialog retains complete title, accessible label and restores body on unmount', () => {
  const h = harness(), name = `Remove “${'3975824412683967_3932986053162556831_n'.repeat(10)}”?`, before = structuredClone(h.document.body.style);
  let closed = 0;
  const { Dialog } = h.load('src/owner/OwnerDialog.tsx');
  h.render(Dialog, { title: name, children: 'Long filename stays readable.', actions: 'Cancel Save', onClose: () => closed++ });
  assert.equal(h.document.body.style.overflow, 'hidden');
  const title = h.find(node => node.type === 'h2'); assert.equal(content(title), name); assert.equal(h.tree.props['aria-labelledby'], title.props.id);
  let prevented = 0; h.tree.props.onCancel({ preventDefault() { prevented++; } }); assert.equal(closed, 1); assert.equal(prevented, 1);
  h.unmount(); assert.equal(h.document.body.style.overflow, before.overflow); assert.equal(h.document.body.style.position, before.position); assert.equal(h.document.body.style.top, before.top);
  const css = readFileSync(new URL('../src/owner/OwnerDialog.module.css', import.meta.url), 'utf8');
  assert.match(css, /max-width:calc\(100vw - 24px\)/); assert.match(css, /h2[^}]*min-width:0[^}]*overflow-wrap:anywhere/); assert.match(css, /overflow-x:hidden/); assert.match(css, /min-height:0[^}]*overflow-y:auto/);
});
test('full notes: public theme defaults light and Taylor theme defaults dark with independent persistent choices', () => {
  const h = harness(), values = new Map(); h.window.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const theme = h.load('src/components/ColorMode.tsx');
  assert.equal(theme.readColorMode('owner'), 'dark'); assert.equal(theme.readColorMode('public'), 'light');
  theme.setColorMode('owner', 'light'); assert.equal(theme.readColorMode('owner'), 'light'); assert.equal(theme.readColorMode('public'), 'light');
  theme.setColorMode('public', 'dark'); assert.equal(theme.readColorMode('owner'), 'light'); assert.equal(theme.readColorMode('public'), 'dark');
  assert.deepEqual([...values], [['tmc-owner-color-mode', 'light'], ['tmc-public-color-mode', 'dark']]);
  h.render(theme.ColorModeToggle, { scope: 'public' }); assert.equal(h.tree.props['aria-pressed'], true); h.tree.props.onClick(); h.render(theme.ColorModeToggle, { scope: 'public' }); assert.equal(h.tree.props['aria-pressed'], false);
  h.unmount();
});
test('full notes: dark-mode switches still work for this visit if browser storage is disabled', () => {
  const h = harness(); h.window.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const theme = h.load('src/components/ColorMode.tsx'); theme.setColorMode('owner', 'light'); theme.setColorMode('public', 'dark');
  assert.equal(theme.readColorMode('owner'), 'light'); assert.equal(theme.readColorMode('public'), 'dark');
});
