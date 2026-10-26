import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness } from './owner-ui-harness.mjs';
import { model, defaults } from './owner-test-modules.mjs';

const fresh = () => defaults.createDefaultOwnerContent();
const stateFor = content => ({ status: 'published', snapshot: model.createPublishedOwnerSnapshot(content, 1) });
function routing(state) {
  const h = harness(); h.overrides['./published-site'] = { getPublishedSite: async () => state };
  const { PublishedRoute } = h.load('src/server/PublishedRoute.tsx');
  return { h, route: PublishedRoute };
}
for (const builtin of Object.keys(model.BUILTIN_ROUTES).filter(key => key !== 'home')) test(`full notes: server route gates current ${builtin} slug and rejects stale path rather than baseline resurrection`, async () => {
  let content = fresh(); content.site.showPremades = true;
  content = model.renamePage(content, `builtin-${builtin}`, { slug: `new-${builtin}` });
  const { route } = routing(stateFor(content));
  const current = await route({ slug: [`new-${builtin}`], fallback: 'NEVER_BASELINE' });
  assert.deepEqual(current.props.slug, [`new-${builtin}`]); assert.equal(current.props.fallback, undefined);
  await assert.rejects(route({ slug: [model.BUILTIN_ROUTES[builtin]], fallback: 'NEVER_BASELINE' }), /MOCK_NOT_FOUND_404/);
});
test('full notes: disabled/unlisted pages and renamed product/request paths are enforced at server boundary', async () => {
  let content = fresh(); content.site.showPremades = true;
  content = model.renamePage(content, 'builtin-premades', { slug: 'shop' }); content = model.renamePage(content, 'builtin-commissions', { slug: 'made-for-you' });
  content.premades = [{ id: 'listed', name: 'Available', image: '/images/heads.webp', alt: 'Character', description: 'Details', price: 621, visible: true }, { id: 'hidden', name: 'Private', image: '/images/heads.webp', alt: 'Character', description: 'Private details', price: 621, visible: false }];
  content.pages.find(page => page.builtinKey === 'premades').navPlacement = 'unlisted';
  let r = routing(stateFor(content));
  for (const slug of [['shop'], ['shop', 'listed'], ['made-for-you', 'request']]) assert.ok(await r.route({ slug }));
  for (const slug of [['premades'], ['premades', 'listed'], ['shop', 'hidden'], ['shop', 'absent'], ['commissions', 'request'], ['shop', 'listed', 'extra'], ['api', 'private']]) await assert.rejects(r.route({ slug }), /MOCK_NOT_FOUND_404/);
  content.pages.find(page => page.builtinKey === 'commissions').availability = 'hidden'; content.site.showPremades = false; r = routing(stateFor(content));
  for (const slug of [['shop'], ['shop', 'listed'], ['made-for-you'], ['made-for-you', 'request']]) await assert.rejects(r.route({ slug, fallback: 'NEVER_FALL_BACK' }), /MOCK_NOT_FOUND_404/);
});
test('full notes: unavailable public read shows error, not an old default or private draft', async () => {
  const { route } = routing({ status: 'error', message: 'No publication can be verified' });
  const result = await route({ slug: ['gallery'], fallback: 'DO_NOT_SHOW' });
  assert.equal(result.props.serverState.status, 'error'); assert.equal(result.props.fallback, undefined);
});

function renderer(content) {
  const h = harness(), publicState = stateFor(content);
  h.overrides.react = React; h.overrides['react/jsx-runtime'] = jsxRuntime;
  h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  h.overrides['next/image'] = { __esModule: true, default: incoming => { const props = { ...incoming }; delete props.unoptimized; delete props.fill; delete props.priority; return React.createElement('img', props); } };
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  h.overrides['./Cart'] = { useCart: () => ({ item: null, enabled: true, add() {}, open() {} }) };
  h.overrides['./PublicSiteContext'] = { usePublicOwnerContent: () => content, usePublicSiteState: () => publicState, usePublicServerState: state => state };
  const site = h.load('src/components/SiteContent.tsx'), page = h.load('src/components/PublishedPage.tsx'), chrome = h.load('src/components/PublicChrome.tsx');
  return { h, render: (key, mode = 'public', editable = false) => renderToStaticMarkup(React.createElement(site.SiteContentFrame, { content, page: content.pages.find(page => page.builtinKey === key || page.id === key), mode, editable })), published: slug => renderToStaticMarkup(React.createElement(page.PublishedPage, { slug, serverState: publicState })), header: () => renderToStaticMarkup(React.createElement(chrome.PublicHeader)), footer: () => renderToStaticMarkup(React.createElement(chrome.PublicFooter)) };
}
test('full notes: actual React Home renderer cannot accidentally show Terms content and default links follow renamed builtins', () => {
  let content = fresh();
  for (const key of ['terms', 'gallery', 'commissions', 'suitcare', 'prices']) content = model.renamePage(content, `builtin-${key}`, { slug: `new-${key}` });
  content.pages.find(page => page.builtinKey === 'terms').blocks = [{ id: 'terms-qa', type: 'text', heading: 'TERMS_QA_HEADING', body: 'TERMS_QA_EXCLUSIVE_BODY' }];
  const r = renderer(content), home = r.render('home');
  assert.match(home, /Welcome to your new Fursuit/); assert.doesNotMatch(home, /TERMS_QA_EXCLUSIVE_BODY|TERMS_QA_HEADING/);
  assert.match(r.render('terms'), /TERMS_QA_EXCLUSIVE_BODY/);
  for (const key of ['commissions', 'suitcare', 'prices']) assert.ok(home.includes(`href="/new-${key}"`), `home default link ${key}`);
  assert.match(r.footer(), /href="\/new-terms"/);
});
test('full notes: actual React public navigation separates main/More and omits unlisted/disabled pages', () => {
  let content = fresh(); content.site.moreEnabled = true;
  content = model.createCustomPage(content, { title: 'More QA page', slug: 'more-qa' }); content.pages.at(-1).navPlacement = 'more';
  content = model.createCustomPage(content, { title: 'Unlisted QA page', slug: 'unlisted-qa' }); content.pages.at(-1).navPlacement = 'unlisted';
  content = model.createCustomPage(content, { title: 'Disabled QA page', slug: 'disabled-qa' }); content.pages.at(-1).availability = 'hidden';
  let html = renderer(content).header();
  assert.match(html, /<details[^>]+nav-more/); assert.match(html, /href="\/more-qa"/); assert.doesNotMatch(html, /href="\/(?:unlisted|disabled)-qa"/);
  content.site.moreEnabled = false; html = renderer(content).header(); assert.doesNotMatch(html, /href="\/more-qa"|<details/);
});
test('full notes: actual React products show channel tags, honest payment limits and catalog-specific purchasing information', () => {
  const content = fresh(); content.site.showPremades = true;
  content.premades = [{ id: 'tmc', name: 'TMC item', image: '/images/heads.webp', alt: 'Character', description: 'Details', price: 621, visible: true, soldChannel: 'tmc', badge: 'Custom visible tag' }, { id: 'third', name: 'External item', image: '/images/heads.webp', alt: 'Character', description: 'Details', price: 650, visible: true, soldChannel: 'third-party', externalUrl: 'https://example.test/listing' }, { id: 'con', name: 'Con item', image: '/images/heads.webp', alt: 'Character', description: 'Details', price: 700, visible: true, soldChannel: 'con', venue: 'QA Convention booth 5' }];
  let r = renderer(content), html = r.published(['premades', 'tmc']);
  assert.match(html, /Sold on TMC/); assert.match(html, /Custom visible tag/); assert.match(html, /Add to cart/); assert.match(html, /checkout are not connected/); assert.doesNotMatch(html, /type="(?:submit|password)"|Payment successful|Order confirmed/);
  html = r.published(['premades', 'third']); assert.match(html, /Sold on third party/); assert.match(html, /href="https:\/\/example.test\/listing"[^>]+rel="noopener noreferrer"/); assert.doesNotMatch(html, /Add to cart/);
  html = r.published(['premades', 'con']); assert.match(html, /Sold at con/); assert.match(html, /QA Convention booth 5/); assert.match(html, /do not necessarily reflect current availability/); assert.doesNotMatch(html, /Add to cart/);
  content.site.catalogMode = true; r = renderer(content); html = r.published(['premades', 'tmc']); assert.match(html, /Where to purchase/); assert.match(html, /Catalog mode is on/); assert.doesNotMatch(html, /Add to cart/);
});
test('full notes: numeric sizes, independent heading/body alignment and percentage sizing reach actual rendered section markup', () => {
  const content = fresh(); content.pages[0].blocks = [{ id: 'sized', type: 'text', heading: 'Heading stays right', body: 'Body stays left', appearance: { fontSize: 31.5, headingAlign: 'right', bodyAlign: 'left', widthPercent: 62.5, heightPercent: 25, textColor: '#A81234' } }];
  const html = renderer(content).render('home');
  for (const token of ['--element-font-size:31.5px', '--element-heading-align:right', '--element-body-align:left', 'width:62.5%', 'min-height:25vh', '--element-text-color:#A81234']) assert.ok(html.includes(token), token);
});
