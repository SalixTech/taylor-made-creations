import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { harness } from './owner-ui-harness.mjs';

// CSS contract and source-hook coverage; these are not browser pixel tests.
const css = postcss.parse(readFileSync(new URL('../src/app/color-modes.css', import.meta.url), 'utf8'));
const rules = [];
css.walkRules(rule => rules.push(rule));
const declaration = (rule, property) => rule.nodes.find(node => node.type === 'decl' && node.prop === property);

test('WebKit scrollbars keep the same collapsed size in every interaction state', () => {
  const track = rules.find(rule => rule.selector === '::-webkit-scrollbar');
  assert.equal(declaration(track, 'width')?.value, '6px');
  assert.equal(declaration(track, 'height')?.value, '6px');
  assert.equal(declaration(rules.find(rule => rule.selector === '::-webkit-scrollbar-thumb'), 'border')?.value, '0');
  const interactionRules = rules.filter(rule => /scrollbar/.test(rule.selector) && /hover|active|focus|data-scroll-active/.test(rule.selector));
  assert.ok(interactionRules.length > 0);
  for (const rule of interactionRules) {
    for (const node of rule.nodes.filter(node => node.type === 'decl')) {
      assert.equal(node.prop, 'background-color', `${rule.selector} must change color only`);
    }
  }
  for (const rule of rules.filter(rule => /::-webkit-scrollbar(?:\s|,|$|:hover|:active)/.test(rule.selector))) {
    for (const property of ['width', 'height']) {
      const value = declaration(rule, property)?.value;
      if (value) assert.equal(value, '6px', `${rule.selector} ${property}`);
    }
  }
});

test('standard thin styles cannot override fixed WebKit sizing in owner and public scroll areas', () => {
  let support;
  css.walkAtRules('supports', rule => { if (rule.params === 'selector(::-webkit-scrollbar)') support = rule; });
  assert.ok(support);
  const override = support.nodes.find(node => node.type === 'rule');
  for (const selector of ['html', 'body', '[data-owner-portal] *', '[data-theme-scope="public"] *']) assert.ok(override.selectors.includes(selector));
  for (const property of ['scrollbar-width', 'scrollbar-color']) {
    assert.equal(declaration(override, property)?.value, 'auto');
    assert.equal(declaration(override, property)?.important, true);
  }
  const fallback = rules.find(rule => declaration(rule, 'scrollbar-width')?.value === 'thin');
  assert.ok(fallback);
  assert.equal(fallback.parent.type, 'root');
  assert.equal(declaration(fallback, 'scrollbar-color')?.value, 'transparent transparent');
});

test('reduced motion and forced colors never enlarge the scrollbar or hide its scroll range', () => {
  for (const preference of ['(prefers-reduced-motion:reduce)', '(forced-colors:active)']) {
    const matched = [];
    css.walkAtRules('media', rule => { if (rule.params === preference) matched.push(rule); });
    assert.ok(matched.length > 0);
    for (const rule of matched) rule.walkDecls(decl => {
      assert.notEqual(decl.prop, 'scrollbar-width');
      assert.ok(!['width', 'height', 'overflow', 'overflow-x', 'overflow-y'].includes(decl.prop));
    });
  }
  css.walkDecls('scrollbar-width', decl => assert.notEqual(decl.value, 'none'));
  assert.ok(rules.some(rule => rule.selector.includes('html[data-scroll-active="true"]::-webkit-scrollbar-thumb')));
});

test('scroll, drag, wheel, keyboard and idle only toggle visibility without altering scrolling', () => {
  const h = harness(), listeners = new Map(), timers = new Map();
  let timerId = 0;
  h.document.documentElement = { dataset: { colorMode: 'dark' } };
  h.document.addEventListener = (type, fn) => listeners.set(type, fn);
  h.document.removeEventListener = (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); };
  h.globals.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  h.globals.clearTimeout = id => timers.delete(id);
  const { ColorModeRuntime } = h.load('src/components/ColorMode.tsx');
  h.render(ColorModeRuntime);
  assert.equal(h.tree, null);
  assert.deepEqual([...listeners.keys()].sort(), ['keydown', 'pointerdown', 'scroll', 'wheel']);
  for (const type of ['scroll', 'wheel', 'pointerdown', 'keydown', 'scroll']) {
    listeners.get(type)({ key: 'PageDown' });
    assert.equal(h.document.documentElement.dataset.scrollActive, 'true');
    assert.equal(timers.size, 1);
    assert.equal(h.document.body.style.overflow, 'auto');
    assert.equal(h.window.scrollY, 20);
    const [id, idle] = [...timers][0]; timers.delete(id); idle();
    assert.deepEqual(h.document.documentElement.dataset, { colorMode: 'dark' });
  }
  listeners.get('keydown')({ key: 'a' });
  assert.equal(timers.size, 0);
  listeners.get('scroll')({});
  h.unmount();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  assert.deepEqual(h.document.documentElement.dataset, { colorMode: 'dark' });
});
