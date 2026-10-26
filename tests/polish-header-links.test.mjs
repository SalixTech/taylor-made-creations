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

test('enabled empty legacy More renders an eligible default identically in public and preview without changing saved content', () => {
  const t = setup(); t.value.site.moreEnabled = true;
  const before = structuredClone(t.value), nav = t.getHeaderNavigation(t.value);
  assert.equal(nav.more.length, 1); assert.equal(nav.more[0].pageId, 'builtin-contact');
  assert.ok(!nav.main.some(link => link.pageId === nav.more[0].pageId));
  for (const mode of modes) {
    const html = t.render(mode); assert.match(html, /<summary>More /);
    const menu = html.match(/class="nav-more-menu"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(menu?.includes('Contact'), mode);
  }
  assert.deepEqual(t.value, before);
  t.value.site.moreEnabled = false;
  assert.equal(t.getHeaderNavigation(t.value).more.length, 0);
  assert.ok(t.getHeaderNavigation(t.value).main.some(link => link.pageId === 'builtin-contact'));
});

test('automatic More never exposes unavailable or unlisted pages and follows later assignments', () => {
  const t = setup(); t.value.site.moreEnabled = true;
  for (const page of t.value.pages) { if (!['home', 'terms', 'prices'].includes(page.builtinKey)) page.navPlacement = 'unlisted'; }
  let nav = t.getHeaderNavigation(t.value);
  assert.deepEqual(nav.more.map(link => link.pageId), ['builtin-prices']);
  t.value.pages.find(page => page.builtinKey === 'prices').availability = 'hidden';
  assert.equal(t.getHeaderNavigation(t.value).more.length, 0, 'Home and TOS never become fallbacks');
  for (const mode of modes) assert.doesNotMatch(t.render(mode), /<summary>More /);
  const gallery = t.value.pages.find(page => page.builtinKey === 'gallery'); gallery.navPlacement = 'more';
  assert.deepEqual(t.getHeaderNavigation(t.value).more.map(link => link.pageId), [gallery.id]);
  gallery.trashedAt = '2026-10-26T00:00:00Z'; assert.equal(t.getHeaderNavigation(t.value).more.length, 0);
  gallery.trashedAt = null; gallery.availability = 'hidden'; assert.equal(t.getHeaderNavigation(t.value).more.length, 0);
});

test('automatic More survives public content projection and reload with the same grouping', () => {
  const t = setup(); t.value.site.moreEnabled = true;
  const model = t.h.load('src/owner/model.ts');
  const expected = t.getHeaderNavigation(t.value);
  const published = model.createPublicContentSnapshot(t.value);
  assert.deepEqual(t.getHeaderNavigation(published), expected);
  assert.deepEqual(t.getHeaderNavigation(JSON.parse(JSON.stringify(published))), expected);
  assert.equal(model.getPageNavPlacement(published.pages.find(page => page.id === 'builtin-contact')), 'main', 'derived display does not silently rewrite saved placement');
});
