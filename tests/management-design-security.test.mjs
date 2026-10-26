import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const load = sourceLoader(), model = load('src/owner/model.ts'), defaults = load('src/owner/defaults.ts'), design = load('src/owner/site-design.ts');
const make = () => defaults.createDefaultOwnerContent();
const accept = value => assert.deepEqual(model.validateOwnerContent(value), { valid: true, issues: [] });
const reject = (value, path) => { const result = model.validateOwnerContent(value); assert.equal(result.valid, false); assert.ok(result.issues.some(x => x.path.startsWith(path)), JSON.stringify(result.issues)); };
const mediaSource = '/api/media/12345678-1234-4234-8234-123456789abc';

test('optional design and template overrides preserve existing default data byte-for-byte', () => {
  const value = make(); assert.equal(value.design, undefined); assert.equal(value.contentOverrides, undefined); accept(value);
  assert.deepEqual(design.getSiteThemeStyle(value), {}); assert.equal(design.getSiteThemeAttributes(value)['data-site-theme'], undefined);
  assert.equal(model.publicContentToOwnerContent(model.createPublicContentSnapshot(value)).home.title, value.home.title);
});
for (const field of design.DESIGN_COLOR_FIELDS) test(`design color ${field.key} validates and emits only its safe CSS variable`, () => {
  const value = make(); value.design = { colors: { [field.key]: '#A1b2C3' } }; accept(value); const key = '--site-' + field.key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); assert.deepEqual(design.getSiteThemeStyle(value), { [key]: '#A1b2C3' });
  for (const attack of ['red', '#fff', '#123456; background:url(https://evil.example)', 'url(javascript:alert(1))', '</style><script>alert(1)</script>', null, 0]) { value.design.colors[field.key] = attack; reject(value, 'design.colors.'); assert.equal(Object.hasOwn(design.getSiteThemeStyle(value), key), false); }
});
for (const field of design.DESIGN_SELECT_FIELDS) test(`all ${field.key} choices roundtrip through public projection and invalid CSS strings fail closed`, () => {
  for (const option of field.options) { const value = make(); value.design = { [field.key]: option.value }; accept(value); const publicValue = model.createPublicContentSnapshot(value); assert.equal(publicValue.design[field.key], option.value); const copy = model.publicContentToOwnerContent(publicValue); assert.equal(copy.design[field.key], option.value); }
  for (const attack of ['url(https://evil.example/x)', '__proto__', 'constructor', 'inherit;display:none', '', {}, null, 123]) { const value = make(); value.design = { [field.key]: attack }; reject(value, `design.${field.key}`); assert.deepEqual(design.getSiteThemeStyle(value), {}); }
});
test('unknown arbitrary styles, script fields, collections, and non-plain objects cannot enter persisted design', () => {
  for (const [property, value] of [['design', { css: 'body{display:none}' }], ['design', { colors: { unknown: '#ffffff' } }], ['design', []], ['design', null], ['contentOverrides', { html: '<script>bad</script>' }], ['contentOverrides', { text: { arbitrary: 'secret' } }], ['contentOverrides', { images: { arbitrary: { src: mediaSource, alt: 'private' } } }], ['contentOverrides', { links: { arbitrary: { href: '/gallery', label: 'private' } } }], ['contentOverrides', []]]) { const content = make(); content[property] = value; reject(content, property); assert.throws(() => model.createPublicContentSnapshot(content)); }
  const content = make(); content.design = Object.create({ bodyFont: 'serif' }); reject(content, 'design');
});
test('every catalog text field is persisted independently and token interpolation does not reinterpret markup', () => {
  const value = make(); value.contentOverrides = { text: Object.fromEntries(design.TEXT_FIELDS.map(field => [field.key, `QA:${field.key} <img src=x onerror=alert(1)> {siteName}`])) }; accept(value); const publicValue = model.createPublicContentSnapshot(value); assert.deepEqual(publicValue.contentOverrides.text, value.contentOverrides.text);
  for (const field of design.TEXT_FIELDS) assert.equal(design.getTemplateText(value, field.key), `QA:${field.key} <img src=x onerror=alert(1)> ${value.site.name}`);
  value.contentOverrides.text[design.TEXT_FIELDS[0].key] = 'x'.repeat(2001); reject(value, 'contentOverrides.text.');
});
for (const field of design.IMAGE_FIELDS) test(`template image ${field.key} is bounded, exact-schema and supports authenticated media references`, () => {
  const value = make(); value.contentOverrides = { images: { [field.key]: { src: mediaSource, alt: 'QA alt' } } }; accept(value); assert.deepEqual(model.createPublicContentSnapshot(value).contentOverrides.images[field.key], { src: mediaSource, alt: 'QA alt' });
  for (const attack of ['javascript:alert(1)', '//evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=', '/api/taylor/media', 'http://example.test/x.png']) { value.contentOverrides.images[field.key].src = attack; reject(value, `contentOverrides.images.${field.key}.src`); }
  value.contentOverrides.images[field.key] = { src: mediaSource, alt: 'safe', onerror: 'alert(1)' }; reject(value, `contentOverrides.images.${field.key}.onerror`);
  value.contentOverrides.images[field.key] = { src: mediaSource, alt: 'x'.repeat(501) }; reject(value, `contentOverrides.images.${field.key}.alt`);
});
for (const field of design.LINK_FIELDS) test(`template link ${field.key} rejects executable or header-injected destinations`, () => {
  const value = make(); value.contentOverrides = { links: { [field.key]: { href: '/gallery', label: 'QA link' } } }; accept(value); assert.deepEqual(model.createPublicContentSnapshot(value).contentOverrides.links[field.key], { href: '/gallery', label: 'QA link' });
  for (const attack of ['javascript:alert(1)', 'data:text/html,<script>bad</script>', '//evil.example', '/\\evil.example', '/contact%0d%0ax:1', 'https://user:pass@evil.example', 'mailto:owner@example.test?bcc=thief@example.test', 'http://example.test']) { value.contentOverrides.links[field.key].href = attack; reject(value, `contentOverrides.links.${field.key}.href`); }
  value.contentOverrides.links[field.key] = { href: '/gallery', label: 'x'.repeat(151) }; reject(value, `contentOverrides.links.${field.key}.label`);
});
test('data-URI design images can remain private drafts but are rejected at public snapshot and decoder boundaries', () => {
  const value = make(); value.contentOverrides = { images: { 'site.logo': { src: 'data:image/png;base64,AAAA', alt: '' } } }; accept(value); assert.throws(() => model.createPublicContentSnapshot(value), /Browser-local photos/);
  const publicValue = model.createPublicContentSnapshot(make()); publicValue.contentOverrides = value.contentOverrides; assert.throws(() => model.assertPublicOwnerContent(publicValue), /never browser data images/);
});
test('trashed-page template overrides remain private while global design and active-page settings survive', () => {
  let value = make(); value.design = { colors: { accent: '#123456' }, headingFont: 'serif' }; value.contentOverrides = { text: { 'examples.intro': 'PRIVATE TRASH COPY', 'home.stripTitle': 'PUBLIC HOME COPY', 'site.footerTagline': 'PUBLIC FOOTER' }, images: { 'examples.heads': { src: mediaSource, alt: 'PRIVATE TRASH IMAGE' }, 'site.logo': { src: '/images/logo.png', alt: '' } }, links: { 'examples.pricesLink': { href: '/prices', label: 'PRIVATE TRASH LINK' }, 'home.pricesButton': { href: '/prices', label: 'PUBLIC PRICE LINK' } } };
  value = model.trashPage(value, value.pages.find(page => page.builtinKey === 'examples').id); const publicValue = model.createPublicContentSnapshot(value); assert.doesNotMatch(JSON.stringify(publicValue), /PRIVATE TRASH|12345678-1234-4234-8234-123456789abc/); assert.equal(value.contentOverrides.text['examples.intro'], 'PRIVATE TRASH COPY'); assert.deepEqual(publicValue.design, value.design); assert.equal(publicValue.contentOverrides.text['home.stripTitle'], 'PUBLIC HOME COPY');
});
test('projected design and overrides are independent copies and private envelope fields are rejected', () => {
  const value = make(); value.design = { colors: { accent: '#123456' } }; value.contentOverrides = { images: { 'site.logo': { src: mediaSource, alt: '' } }, links: { 'home.galleryButton': { href: '/gallery', label: 'Public label' } } }; const published = model.createPublicContentSnapshot(value); published.design.colors.accent = '#ffffff'; published.contentOverrides.images['site.logo'].src = '/images/logo.png'; published.contentOverrides.links['home.galleryButton'].label = 'Changed'; assert.equal(value.design.colors.accent, '#123456'); assert.equal(value.contentOverrides.images['site.logo'].src, mediaSource); assert.equal(value.contentOverrides.links['home.galleryButton'].label, 'Public label');
  for (const property of ['ownerEmail', 'privateDraft', 'credentials']) { const polluted = structuredClone(published); polluted[property] = 'PRIVATE'; assert.throws(() => model.assertPublicOwnerContent(polluted)); }
});

test('only published template-image allowlist references grant anonymous media access; text/link matches and trashed overrides do not', () => {
  const media = load('src/server/dev-media.ts');
  for (const field of design.IMAGE_FIELDS) { let value = make(); value.contentOverrides = { images: { [field.key]: { src: mediaSource, alt: 'Allowed reference' } } }; assert.equal(media.publicContentReferencesMedia(model.createPublicContentSnapshot(value), mediaSource), true, field.key); if (field.group !== 'site') { value = model.trashPage(value, value.pages.find(p => p.builtinKey === field.group).id); assert.equal(media.publicContentReferencesMedia(model.createPublicContentSnapshot(value), mediaSource), false); } }
  const value = make(); value.contentOverrides = { text: { 'site.footerTagline': mediaSource }, links: { 'site.footerContact': { href: mediaSource, label: 'Text reference only' } }, images: { 'site.logo': { src: '/images/logo.png', alt: mediaSource } } }; assert.equal(media.publicContentReferencesMedia(model.createPublicContentSnapshot(value), mediaSource), false);
});

test('actual image route grants anonymous template images only while exact snapshot is published, with no private fallback', async () => {
  const media = load('src/server/dev-media.ts'), auth = load('src/server/taylor-auth.ts');
  for (const field of design.IMAGE_FIELDS) {
    const value = make(); value.contentOverrides = { images: { [field.key]: { src: mediaSource, alt: 'Template upload' } } };
    let state = { status: 'published', snapshot: model.createPublishedOwnerSnapshot(value, 1) }, reads = 0, checks = 0;
    const route = sourceLoader({ '@/server/dev-media': { ...media, requireDevelopmentMedia() {}, async readDevelopmentMedia() { reads++; return Buffer.from('fixture-webp'); } }, '@/server/taylor-auth': { ...auth, async verifyTaylorOwner() { throw new auth.TaylorApiError(403, 'Wrong owner'); } }, '@/server/published-site': { async readPublishedSite() { checks++; return state; } } })('src/app/api/media/[id]/route.ts');
    const id = mediaSource.split('/').at(-1), context = { params: Promise.resolve({ id }) };
    let response = await route.GET(new Request('http://localhost' + mediaSource), context); assert.equal(response.status, 200, field.key); assert.equal(reads, 1); assert.equal(checks, 1); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    response = await route.GET(new Request('http://localhost' + mediaSource, { headers: { authorization: 'Bearer wrong-owner' } }), context); assert.equal(response.status, 403); assert.equal(checks, 1, 'bad authorization never falls back to public access'); assert.equal(reads, 1);
    for (const next of [{ status: 'baseline', reason: 'not-published' }, { status: 'error', message: 'Permission denied' }, { status: 'published', snapshot: model.createPublishedOwnerSnapshot(make(), 2) }]) { state = next; response = await route.GET(new Request('http://localhost' + mediaSource), context); assert.equal(response.status, 404); assert.equal(reads, 1); }
  }
});
