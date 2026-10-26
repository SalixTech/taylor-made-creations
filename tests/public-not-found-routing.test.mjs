import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness } from './owner-ui-harness.mjs';
import { model, defaults } from './owner-test-modules.mjs';

const product = (id, extra = {}) => ({ id, name: `PRODUCT_${id}`, image: '/images/heads.webp', alt: 'Character', description: `DETAILS_${id}`, price: 621, visible: true, ...extra });
function shop() {
  const content = defaults.createDefaultOwnerContent();
  content.site.showPremades = true;
  content.premades = [product('listed'), product('hidden', { visible: false }), product('draft', { isDraft: true })];
  return content;
}
const publication = (content = shop(), revision = 1, accessRevision = 1) => ({ status: 'published', snapshot: model.createPublishedOwnerSnapshot(content, revision), accessRevision });

// Actual React markup, with Next links/images and publication I/O mocked locally.
// This is a component and route test, not a claim of real browser navigation.
function fixture(initialState = publication()) {
  const h = harness(); let state = initialState;
  h.overrides.react = React; h.overrides['react/jsx-runtime'] = jsxRuntime;
  h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  h.overrides['next/image'] = { __esModule: true, default: incoming => { const props = { ...incoming }; delete props.unoptimized; delete props.fill; delete props.priority; return React.createElement('img', props); } };
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  h.overrides['./Cart'] = { useCart: () => ({ item: null, enabled: true, add() {}, open() {} }) };
  const context = { usePublicSiteState: () => state, usePublicServerState: () => state, usePublicOwnerContent: () => state.status === 'published' ? model.publicContentToOwnerContent(state.snapshot.content) : null };
  h.overrides['./PublicSiteContext'] = context; h.overrides['@/components/PublicSiteContext'] = context;
  h.overrides['./published-site'] = { getPublishedSite: async () => state };
  const { PublishedPage } = h.load('src/components/PublishedPage.tsx');
  const NotFound = h.load('src/app/not-found.tsx').default;
  const { PublishedRoute } = h.load('src/server/PublishedRoute.tsx');
  return {
    h, state: () => state, setState: value => { state = value; }, route: slug => PublishedRoute({ slug, fallback: 'NEVER_PRIVATE_OR_BASELINE' }),
    client: (slug, serverState = initialState) => renderToStaticMarkup(React.createElement(PublishedPage, { slug, serverState })),
    notFound: () => renderToStaticMarkup(React.createElement(NotFound)),
  };
}

test('server notFound and client missing-route fallback render the identical cute recovery card', async () => {
  const f = fixture();
  for (const slug of [['premades', 'missing'], ['premades', 'hidden'], ['premades', 'draft'], ['unknown-page']]) {
    await assert.rejects(f.route(slug), /MOCK_NOT_FOUND_404/);
    const html = f.client(slug);
    assert.equal(html, f.notFound());
    assert.match(html, /Lost on the con floor\?/);
    assert.match(html, /page-shell empty-state public-not-found/);
    assert.doesNotMatch(html, /This page is not available|DETAILS_hidden|DETAILS_draft/);
  }
});

test('valid products render real details on both route entry and client render, including renamed unlisted shops', async () => {
  let content = shop();
  content = model.renamePage(content, 'builtin-premades', { slug: 'our-shop' });
  content.pages.find(page => page.builtinKey === 'premades').navPlacement = 'unlisted';
  const f = fixture(publication(content));
  const element = await f.route(['our-shop', 'listed']);
  assert.equal(element.props.serverState.status, 'published');
  const html = f.client(element.props.slug, element.props.serverState);
  assert.match(html, /PRODUCT_listed/); assert.match(html, /DETAILS_listed/);
  assert.doesNotMatch(html, /Lost on the con floor/);
  await assert.rejects(f.route(['premades', 'listed']), /MOCK_NOT_FOUND_404/);
  assert.equal(f.client(['premades', 'listed']), f.notFound());
});

test('hidden, switched-off and removed storefronts remain missing on both entry paths', async () => {
  for (const change of [c => { c.site.showPremades = false; return c; }, c => { c.pages.find(p => p.builtinKey === 'premades').availability = 'hidden'; return c; }, c => model.trashPage(c, 'builtin-premades')]) {
    const content = change(shop()); const f = fixture(publication(content));
    await assert.rejects(f.route(['premades', 'listed']), /MOCK_NOT_FOUND_404/);
    assert.equal(f.client(['premades', 'listed']), f.notFound());
    assert.doesNotMatch(f.client(['premades', 'listed']), /DETAILS_listed/);
  }
});

test('shared missing-page links follow the effective publication and never link hidden or removed galleries', () => {
  let content = shop(); content = model.renamePage(content, 'builtin-gallery', { slug: 'our-gallery' });
  const f = fixture(publication(content));
  assert.match(f.client(['unknown']), /href="\/our-gallery"/);
  assert.equal(f.client(['unknown']), f.notFound());
  content.pages.find(p => p.builtinKey === 'gallery').availability = 'hidden'; f.setState(publication(content, 2));
  assert.doesNotMatch(f.client(['unknown']), /Find the Fursuit Gallery|href="\/gallery"|href="\/our-gallery"/);
  assert.match(f.client(['unknown']), /href="\/"/);
  content = model.trashPage(content, 'builtin-gallery'); f.setState(publication(content, 3));
  assert.doesNotMatch(f.client(['unknown']), /Find the Fursuit Gallery/);
});

test('client publication updates can hide and restore a product without a sticky missing-page fallback', async () => {
  const content = shop(), initial = publication(content), f = fixture(initial);
  assert.match(f.client(['premades', 'listed']), /DETAILS_listed/);
  content.premades.find(p => p.id === 'listed').visible = false; f.setState(publication(content, 2));
  assert.equal(f.client(['premades', 'listed'], initial), f.notFound());
  await assert.rejects(f.route(['premades', 'listed']), /MOCK_NOT_FOUND_404/);
  content.premades.find(p => p.id === 'listed').visible = true; f.setState(publication(content, 3));
  assert.match(f.client(['premades', 'listed'], initial), /DETAILS_listed/);
  assert.equal((await f.route(['premades', 'listed'])).props.serverState.snapshot.revision, 3);
});

test('construction lock and unavailable publication never become a cute 404 or reveal product details', async () => {
  for (const state of [{ status: 'locked', accessRevision: 2 }, { status: 'error', accessRevision: 2, message: 'Publication cannot be verified' }]) {
    const f = fixture(state), element = await f.route(['premades', 'listed']);
    assert.equal(element.props.serverState.status, state.status);
    assert.equal(element.props.fallback, undefined);
    const html = f.client(['premades', 'listed']);
    assert.equal(html, f.notFound());
    assert.doesNotMatch(html, /404|Lost on the con floor|DETAILS_listed/);
    assert.match(html, state.status === 'error' ? /temporarily unavailable|Reload website/ : /construction/i);
  }
});

test('unavailable recovery reloads the current URL, not a baseline or owner route', () => {
  const h = harness(); let reloads = 0;
  h.window.location.reload = () => { reloads++; };
  h.render(h.load('src/components/PublicUnavailable.tsx').PublicUnavailable, { message: 'Unavailable' });
  h.find(node => node.type === 'button').props.onClick();
  assert.equal(reloads, 1);
  assert.equal(h.window.location.href, '');
});

test('a newer valid navigation snapshot renders immediately without a false missing-page frame and cannot outrank a newer access lock', () => {
  const h = harness(), { usePublicServerState } = h.load('src/components/PublicSiteContext.tsx');
  const oldContent = shop(); oldContent.premades = [];
  const oldState = publication(oldContent), newState = publication(shop(), 2);
  const accepted = [];
  h.currentContext = { state: oldState, acceptServerState: state => accepted.push(state) };
  const Component = ({ incoming }) => ({ type: 'output', props: { state: usePublicServerState(incoming) } });
  assert.equal(h.render(Component, { incoming: newState }).props.state, newState);
  assert.deepEqual(accepted, [newState]);
  h.currentContext.state = { status: 'locked', accessRevision: 3 };
  assert.equal(h.render(Component, { incoming: newState }).props.state.status, 'locked');
  h.currentContext.state = publication(oldContent, 1, 3);
  assert.equal(h.render(Component, { incoming: newState }).props.state, h.currentContext.state);
  h.currentContext.state = publication(shop(), 3, 3);
  assert.equal(h.render(Component, { incoming: newState }).props.state.snapshot.revision, 3);
  h.unmount();
});
