import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './owner-ui-harness.mjs';

test('404 card centers the box, not only its text, without losing responsive gutters', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const rule = css.match(/\.selected-design \.page-shell\.public-not-found\{([^}]+)\}/)?.[1];
  assert.ok(rule, '404-specific rule overrides shared empty-state and page-shell styles');
  assert.match(rule, /width:calc\(100% - 44px\)/);
  assert.match(rule, /margin:24px auto/);
  assert.match(rule, /padding-block:calc\(clamp\(35px,6vw,60px\) \* var\(--site-spacing,1\)\)/);
  assert.match(rule, /justify-content:center/);
  assert.match(rule, /align-items:center/);
  assert.doesNotMatch(rule, /height:(?!55vh)[^;]*px|position:(?:fixed|absolute)/);
});

test('404 keeps home recovery and follows the current published gallery path', () => {
  const h = harness();
  let content = null, state = { status: 'baseline' };
  h.overrides['@/components/PublicSiteContext'] = {
    usePublicOwnerContent: () => content,
    usePublicSiteState: () => state,
  };
  const NotFound = h.load('src/app/not-found.tsx').default;
  const links = () => h.all(node => node.type === 'Link').map(node => node.props.href);
  h.render(NotFound);
  assert.equal(h.tree.props.className, 'page-shell empty-state public-not-found');
  assert.deepEqual(links(), ['/', '/gallery']);
  content = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const { createPublishedOwnerSnapshot } = h.load('src/owner/model.ts');
  const gallery = content.pages.find(page => page.builtinKey === 'gallery');
  gallery.slug = 'our-gallery';
  state = { status: 'published', snapshot: createPublishedOwnerSnapshot(content, 1) };
  h.render(NotFound);
  assert.deepEqual(links(), ['/', '/our-gallery']);
  gallery.availability = 'hidden';
  state = { status: 'published', snapshot: createPublishedOwnerSnapshot(content, 2) };
  h.render(NotFound);
  assert.deepEqual(links(), ['/']);
  content = null;
  state = { status: 'error', message: 'Could not verify publication' };
  h.render(NotFound);
  assert.equal(h.tree.type.name, 'PublicUnavailable');
  assert.deepEqual(links(), []);
});
