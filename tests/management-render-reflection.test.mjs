import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { harness } from './owner-ui-harness.mjs';

// Actual React SSR from exact components. Next navigation/image and authenticated
// blob acquisition are inert fixtures; these are not browser/CSS-layout assertions.
const h = harness(), mediaCalls = []; let mediaResult = null, publicContent = null;
h.overrides.react = React; h.overrides['react/jsx-runtime'] = jsxRuntime;
h.overrides['next/link'] = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
h.overrides['next/image'] = { __esModule: true, default: incoming => { const props = { ...incoming }; delete props.fill; delete props.unoptimized; delete props.priority; return React.createElement('img', props); } };
h.overrides['@/owner/media-client'] = { useOwnerMediaSource(src, enabled = true) { mediaCalls.push({ src, enabled }); return mediaResult ?? { src: enabled && src.startsWith('/api/media/') ? 'blob:authorized-qa' : src, error: null }; } };
h.overrides['./PublicSiteContext'] = { usePublicOwnerContent: () => publicContent, usePublicSiteState: () => ({ status: publicContent ? 'published' : 'baseline' }) };
const site = h.load('src/components/SiteContent.tsx'), defaults = h.load('src/owner/defaults.ts'), model = h.load('src/owner/model.ts'), design = h.load('src/owner/site-design.ts');
const chrome = h.load('src/components/PublicChrome.tsx');
const make = () => defaults.createDefaultOwnerContent();
const render = (value, key = 'home', mode = 'public', editable = false) => renderToStaticMarkup(React.createElement(site.SiteContentFrame, { content: value, page: value.pages.find(p => p.builtinKey === key) ?? value.pages.find(p => p.id === key), mode, editable }));
function fixtureFor(field) {
  const value = make(); value.design = { homeIntro: 'full', headerTagline: 'visible' }; value.site.commissionStatus = 'Open!'; value.site.showPremades = true;
  value.site.telegram = 'qa_telegram'; value.site.discord = 'qa_discord'; value.site.tiktok = 'qa_tiktok'; value.site.twitch = 'qa_twitch'; value.site.email = 'qa@example.test';
  let page = field.group === 'site' ? 'home' : field.group;
  if (field.key.startsWith('gallery.empty')) value.gallery = [];
  if (field.group === 'premades') value.premades = [];
  if (field.key.startsWith('site.empty')) { const custom = model.createCustomPage(value, { title: 'Empty QA page', slug: 'empty-qa' }); Object.assign(value, custom); page = value.pages.at(-1).id; }
  return { value, page };
}
for (const field of design.TEXT_FIELDS) test(`actual public renderer reflects editable text ${field.key}`, () => {
  const { value, page } = fixtureFor(field), marker = 'QA_TEXT_' + field.key.replaceAll('.', '_'); value.contentOverrides = { text: { [field.key]: marker } }; assert.ok(render(value, page).includes(marker), `${field.key} was saved but was not rendered`);
});
for (const field of design.LINK_FIELDS) test(`actual public renderer reflects label and destination ${field.key}`, () => {
  const { value, page } = fixtureFor(field), label = 'QA_LINK_' + field.key.replaceAll('.', '_'), href = `https://example.test/${field.key}`; value.contentOverrides = { links: { [field.key]: { label, href } } }; const html = render(value, page); assert.ok(html.includes(label), `${field.key} label missing`); assert.ok(html.includes(`href="${href}"`), `${field.key} destination missing`); assert.match(html, /rel="noopener noreferrer"/);
});
for (const field of design.IMAGE_FIELDS) test(`actual public/private rendering resolves template image ${field.key} through the correct authorization mode`, () => {
  const { value, page } = fixtureFor(field), src = '/api/media/12345678-1234-4234-8234-123456789abc', alt = 'QA_IMAGE_' + field.key.replaceAll('.', '_'); value.contentOverrides = { images: { [field.key]: { src, alt } } };
  for (const mode of ['public', 'private-preview', 'editor']) { mediaCalls.length = 0; const html = render(value, page, mode); assert.ok(html.includes(`alt="${alt}"`)); assert.ok(html.includes(`src="${mode === 'public' ? src : 'blob:authorized-qa'}"`)); assert.ok(mediaCalls.some(call => call.src === src && call.enabled === (mode !== 'public'))); assert.doesNotMatch(html, /data-owner-edit=/); }
});
test('script-shaped template copy, labels and photo descriptions are React-escaped rather than executable markup', () => {
  const value = make(); const marker = '<script>alert("QA")</script><img src=x onerror="alert(1)">'; value.contentOverrides = { text: { 'home.stripTitle': marker }, links: { 'home.commissionsButton': { href: '/commissions', label: marker } }, images: { 'site.logo': { src: '/images/logo.png', alt: marker } } }; const html = render(value); assert.doesNotMatch(html, /<script>|<img src=x| onerror="/); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img src=x'));
});
test('private template media denied/loading results never emit its unauthenticated URL or fallback image', () => {
  const value = make(), src = '/api/media/12345678-1234-4234-8234-123456789abc'; value.contentOverrides = { images: { 'site.logo': { src, alt: 'Private logo' }, 'examples.heads': { src, alt: 'Private example' } } };
  try { for (const result of [{ src: null, error: null }, { src: null, error: 'Permission denied' }]) { mediaResult = result; const html = render(value, 'examples', 'private-preview'); assert.ok(!html.includes(`src="${src}"`)); assert.ok(!html.includes('src="/images/logo.png"')); assert.ok(!html.includes('src="/images/heads.webp"')); assert.match(html, /Brand logo unavailable|Private logo/); } } finally { mediaResult = null; }
});
test('public header/footer use the same published logo, copy and destinations without owner authentication', () => {
  publicContent = make(); const src = '/api/media/12345678-1234-4234-8234-123456789abc'; publicContent.contentOverrides = { images: { 'site.logo': { src, alt: 'Published logo' } }, text: { 'site.headerTagline': 'PUBLISHED HEADER', 'site.footerTagline': 'PUBLISHED FOOTER' }, links: { 'site.footerContact': { label: 'CUSTOM CONTACT', href: 'https://example.test/contact' } } };
  mediaCalls.length = 0; const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(chrome.PublicHeader), React.createElement(chrome.PublicFooter))); assert.match(html, /PUBLISHED HEADER/); assert.match(html, /PUBLISHED FOOTER/); assert.match(html, /CUSTOM CONTACT/); assert.ok(html.includes(`src="${src}"`)); assert.deepEqual(mediaCalls.filter(c => c.src === src).map(c => c.enabled), [false, false]); publicContent = null;
});
test('every theme CSS variable emitted by all design options is referenced by shipped stylesheet', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  for (const field of design.DESIGN_COLOR_FIELDS) for (const key of Object.keys(design.getSiteThemeStyle({ design: { colors: { [field.key]: '#123456' } } }))) assert.ok(css.includes(`var(${key}`), `${field.key} emits unused CSS variable ${key}`);
  for (const field of design.DESIGN_SELECT_FIELDS) for (const option of field.options) { const value = { design: { [field.key]: option.value } }; for (const key of Object.keys(design.getSiteThemeStyle(value))) assert.ok(css.includes(`var(${key}`), `${field.key} emits unused CSS variable ${key}`); const attrs = design.getSiteThemeAttributes(value); for (const [key, val] of Object.entries(attrs)) if (val !== undefined) { if (key === 'data-site-home-intro' && val === 'title-only') { assert.match(css, /\.selected-design \.home-intro[^}]+display:none/); continue; } assert.ok(css.includes(`[${key}="${val}"]`), `${field.key} emits unmatched CSS selector ${key}=${val}`); } }
});

test('every finite template and core appearance control reflects in the actual public element markup', () => {
  const missing = [];
  for (const field of design.STYLE_FIELDS) {
    const { value, page } = fixtureFor(field); const appearance = field.kind === 'image' ? { imageFit: 'contain', imagePositionX: 23, imagePositionY: 77, backgroundColor: '#fedcba' } : { textColor: '#123456', backgroundColor: '#fedcba', font: 'serif', textSize: 'large', align: 'right' };
    value.contentOverrides = { styles: { [field.key]: appearance } }; const html = render(value, page);
    if (field.kind === 'image') { for (const token of ['object-fit:contain', 'object-position:23% 77%']) if (!html.includes(token)) missing.push(`${field.key}: ${token}`); }
    else { for (const token of ['--element-text-color:#123456', '--element-background:#fedcba', '--element-font:', '--element-text-scale:1.2', 'text-align:right']) if (!html.includes(token)) missing.push(`${field.key}: ${token}`); }
  }
  assert.deepEqual(missing, []);
});
test('all custom block kinds and custom-page headings reflect bounded appearance in actual markup', () => {
  const blockKinds = [
    { id: 'text', type: 'text', heading: 'Text', body: 'Body' }, { id: 'heading', type: 'heading', text: 'Heading', level: 2 }, { id: 'link', type: 'link', href: '/gallery', label: 'Gallery' }, { id: 'image', type: 'image', src: '/images/heads.webp', alt: 'Image', caption: 'Caption' }, { id: 'list', type: 'list', items: ['First'], style: 'bullet' }, { id: 'faq', type: 'faq', items: [{ id: 'one', question: 'Question?', answer: 'Answer' }] }, { id: 'divider', type: 'divider' }, { id: 'spacer', type: 'spacer', size: 'medium' }, { id: 'feature', type: 'feature', src: '/images/heads.webp', alt: 'Feature', heading: 'Heading', body: 'Body', imageSide: 'right' },
  ];
  for (const block of blockKinds) { const value = make(); value.pages[0].blocks = [{ ...block, appearance: { textColor: '#123456', backgroundColor: '#fedcba', font: 'serif', textSize: 'large', align: 'right', imageFit: 'contain', imagePositionX: 23, imagePositionY: 77 } }]; const html = render(value); for (const token of ['--element-text-color:#123456', '--element-background:#fedcba', '--element-font:', '--element-text-scale:1.2', 'text-align:right']) assert.ok(html.includes(token), `${block.type} missing ${token}`); if (['image', 'feature'].includes(block.type)) assert.ok(html.includes('object-position:23% 77%'), block.type); }
  const value = model.createCustomPage(make(), { title: 'Custom heading', slug: 'custom-heading' }); value.pages.at(-1).titleAppearance = { textColor: '#123456', align: 'right' }; const html = render(value, value.pages.at(-1).id); assert.match(html, /--element-text-color:#123456/); assert.match(html, /text-align:right/);
});

test('per-element CSS tokens have scoped consumers and placeholder appearances do not remain markup-only', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  for (const key of Object.keys(design.getElementAppearanceStyle({ textColor: '#123456', backgroundColor: '#fedcba', font: 'serif', textSize: 'large' }))) assert.ok(css.includes(`var(${key}`), `${key} has no CSS consumer`);
  assert.match(css, /data-element-text-color="true"[^}]*::placeholder|::placeholder[^}]*--element-text-color/);
  assert.match(css, /(?:input|textarea)[^}]*data-element-text-size="true"|data-element-text-size="true"[^}]*:is\(input,textarea\)/);
});


test('custom contact labels, order, links and text-only entries render on the public site', () => {
  const value = make(); value.site.socialLinks = [{ id: 'custom-first', label: 'My portfolio', value: 'Browse art', url: 'https://example.test/art' }, { id: 'custom-second', label: 'At conventions', value: 'Find the red Folf' }, { id: 'custom-email', label: 'Email Taylor', value: 'Send a message', url: 'mailto:taylor@example.test' }];
  const html = render(value, 'contact'); assert.ok(html.indexOf('My portfolio') < html.indexOf('At conventions')); assert.match(html, /href="https:\/\/example.test\/art"/); assert.match(html, /href="mailto:taylor@example.test"/); assert.match(html, /Find the red Folf/); assert.doesNotMatch(html, /gd_taylor/);
  value.site.socialLinks = []; assert.match(render(value, 'contact'), /No contact methods are currently available/);
});
