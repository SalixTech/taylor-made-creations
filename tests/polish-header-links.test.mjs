import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness } from './owner-ui-harness.mjs';

function setup() {
  const h = harness(); let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  h.overrides.react = React; h.overrides['react/jsx-runtime'] = jsxRuntime;
  h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  h.overrides['next/image'] = { __esModule: true, default: incoming => { const props = { ...incoming }; delete props.unoptimized; delete props.fill; return React.createElement('img', props); } };
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  h.overrides['./PublicSiteContext'] = { usePublicOwnerContent: () => value, usePublicSiteState: () => ({ status: 'published' }) };
  const { PublicHeader } = h.load('src/components/PublicChrome.tsx');
  const { SiteContentFrame } = h.load('src/components/SiteContent.tsx');
  const { getHeaderNavigation } = h.load('src/owner/header-navigation.ts');
  const render = mode => mode === 'header' ? renderToStaticMarkup(React.createElement(PublicHeader)) : renderToStaticMarkup(React.createElement(SiteContentFrame, { content: value, page: value.pages[0], mode })).match(/<header\b[\s\S]*?<\/header>/)[0];
  return { h, getHeaderNavigation, render, get value() { return value; }, set value(next) { value = next; } };
}
const modes = ['header', 'public', 'private-preview', 'editor'];
const board = 'https://trello.com/b/mjEvvCqI/';

test('polish: TOS and Trello render once in the top navigation across public and unsaved/private previews', () => {
  const t = setup(), original = structuredClone(t.value);
  for (const mode of modes) {
    const html = t.render(mode), terms = mode === 'header' || mode === 'public' ? '/terms' : '/taylor/preview/terms';
    assert.equal(html.split(`href="${terms}"`).length - 1, 1, `${mode} TOS exactly once`);
    assert.match(html, />TOS<\/a>/);
    assert.equal(html.split(`href="${board}"`).length - 1, 1, `${mode} Trello exactly once`);
    assert.ok(html.includes(`href="${board}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.deepEqual(t.value, original, 'rendering cannot mutate saved menu placement');
});

test('polish: TOS follows the editable canonical slug and is never duplicated into More', () => {
  const t = setup(), terms = t.value.pages.find(page => page.builtinKey === 'terms');
  terms.slug = 'studio-agreement'; terms.navLabel = 'Studio TOS';
  t.value.site.moreEnabled = true;
  for (const navPlacement of ['main', 'more', 'unlisted']) {
    terms.navPlacement = navPlacement;
    const navigation = t.getHeaderNavigation(t.value);
    assert.equal(navigation.main.filter(link => link.pageId === terms.id).length, 1);
    assert.equal(navigation.more.filter(link => link.pageId === terms.id).length, 0);
    for (const mode of modes) {
      const html = t.render(mode), path = mode === 'header' || mode === 'public' ? '/studio-agreement' : '/taylor/preview/studio-agreement';
      assert.ok(html.includes(`href="${path}"`)); assert.match(html, />Studio TOS<\/a>/); assert.doesNotMatch(html, /href="(?:\/taylor\/preview)?\/terms"/);
      assert.equal(html.split(`href="${path}"`).length - 1, 1);
    }
  }
});

test('polish: hidden or trashed Terms is not resurrected, while Trello remains available', () => {
  const t = setup(), terms = t.value.pages.find(page => page.builtinKey === 'terms');
  for (const change of [{ availability: 'hidden', trashedAt: null }, { availability: 'public', trashedAt: '2026-10-26T00:00:00.000Z' }]) {
    Object.assign(terms, change);
    for (const mode of modes) {
      const html = t.render(mode); assert.doesNotMatch(html, /href="(?:\/taylor\/preview)?\/terms"/); assert.ok(html.includes(`href="${board}"`));
    }
  }
});

test('polish: required top links leave ordinary unlisted, hidden and More page semantics unchanged', () => {
  const t = setup(); t.value.site.moreEnabled = true;
  const [home, prices, gallery] = t.value.pages; home.navPlacement = 'main'; prices.navPlacement = 'more'; gallery.navPlacement = 'unlisted';
  let navigation = t.getHeaderNavigation(t.value);
  assert.ok(navigation.main.some(link => link.pageId === home.id)); assert.ok(navigation.more.some(link => link.pageId === prices.id));
  assert.ok(![...navigation.main, ...navigation.more].some(link => link.pageId === gallery.id));
  prices.availability = 'hidden'; navigation = t.getHeaderNavigation(t.value); assert.ok(!navigation.more.some(link => link.pageId === prices.id));
  prices.availability = 'public'; t.value.site.moreEnabled = false; assert.deepEqual(t.getHeaderNavigation(t.value).more, []);
});

test('polish: baseline public header also includes safe TOS and Trello links', () => {
  const t = setup(); t.value = null; const html = t.render('header');
  assert.match(html, /href="\/terms"[^>]*>TOS<\/a>/); assert.ok(html.includes(`href="${board}" target="_blank" rel="noopener noreferrer"`));
});
