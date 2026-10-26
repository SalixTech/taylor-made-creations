import { test } from 'node:test';
import assert from 'node:assert/strict';
import { model as m, defaults as d, preview as p } from './owner-test-modules.mjs';
import { harness, nodes } from './owner-ui-harness.mjs';
import { readFileSync } from 'node:fs';

const fresh = () => d.createDefaultOwnerContent();
const published = value => m.createPublishedOwnerSnapshot(value, 1, '2026-10-25T12:00:00.000Z');
const item = (overrides = {}) => ({ id: 'selected', name: 'Selected premade', image: '/images/heads.webp', alt: 'Selected character', description: 'Selected description', price: 621, visible: true, ...overrides });

for (const key of Object.keys(m.BUILTIN_ROUTES).filter(key => key !== 'home')) test(`full notes: ${key} rename survives private/public normalization without keeping an old public URL`, () => {
  const before = fresh(), original = before.pages.find(page => page.builtinKey === key);
  before.site.showPremades = true;
  const value = m.renamePage(before, original.id, { slug: `renamed-${key}` });
  assert.equal(original.slug, m.BUILTIN_ROUTES[key], 'no input mutation');
  for (const content of [value, m.publicContentToOwnerContent(published(value).content)]) {
    assert.equal(p.getPreviewPage(content, [`renamed-${key}`]).builtinKey, key);
    assert.equal(p.getPreviewPage(content, [m.BUILTIN_ROUTES[key]]), undefined);
    assert.equal(m.pageHref(content.pages.find(page => page.builtinKey === key)), `/renamed-${key}`);
  }
  const restored = m.renamePage(value, original.id, { slug: m.BUILTIN_ROUTES[key] });
  assert.equal(p.getPreviewPage(restored, [m.BUILTIN_ROUTES[key]]).builtinKey, key);
});

test('full notes: home remains canonical and custom slugs reject routing collisions, private endpoints, traversal and duplicates', () => {
  const initial = fresh();
  assert.throws(() => m.renamePage(initial, 'builtin-home', { slug: 'new-home' }));
  assert.equal(p.getPreviewPage(initial, []).builtinKey, 'home');
  const value = m.createCustomPage(initial, { title: 'Useful page', slug: 'useful-page' });
  const custom = value.pages.at(-1);
  const renamed = m.renamePage(value, custom.id, { slug: 'updated-page' });
  assert.equal(p.getPreviewPage(renamed, ['updated-page']).id, custom.id);
  assert.equal(p.getPreviewPage(renamed, ['useful-page']), undefined);
  for (const slug of ['api', 'taylor', 'owner', 'checkout', 'terms', 'fonts', '../private', '%2e%2e', 'nested/path', 'spaces here', 'updated-page']) {
    assert.throws(() => m.createCustomPage(renamed, { title: 'No collision', slug }), slug);
  }
  assert.equal(p.getPreviewPage(renamed, ['updated-page', 'extra']), undefined);
});

test('full notes: More, unlisted, disabled and shop-off states remain separate across public projection', () => {
  let value = fresh(); value.site.showPremades = true;
  value = m.createCustomPage(value, { title: 'Unlisted only', slug: 'unlisted-only' });
  value = m.createCustomPage(value, { title: 'More page', slug: 'more-page' });
  value = m.createCustomPage(value, { title: 'Hidden private copy', slug: 'hidden-page' });
  Object.assign(value.pages.find(page => page.slug === 'unlisted-only'), { navPlacement: 'unlisted', availability: 'public' });
  Object.assign(value.pages.find(page => page.slug === 'more-page'), { navPlacement: 'more', availability: 'public' });
  Object.assign(value.pages.find(page => page.slug === 'hidden-page'), { navPlacement: 'main', availability: 'hidden', blocks: [{ id: 'secret', type: 'text', heading: 'PRIVATE_HIDDEN_HEADING', body: 'PRIVATE_HIDDEN_BODY' }] });
  for (const enabled of [false, true]) {
    value.site.moreEnabled = enabled;
    for (const content of [value, m.publicContentToOwnerContent(published(value).content)]) {
      assert.equal(m.getVisibleNavigation(content).some(page => ['unlisted-only', 'more-page', 'hidden-page'].includes(page.slug)), false);
      assert.deepEqual(m.getMoreNavigation(content).map(page => page.slug), enabled ? ['more-page'] : []);
      assert.equal(p.getPreviewPage(content, ['unlisted-only']).slug, 'unlisted-only');
      assert.equal(p.getPreviewPage(content, ['more-page']).slug, 'more-page');
      assert.equal(p.getPreviewPage(content, ['hidden-page']), undefined);
    }
  }
  assert.doesNotMatch(JSON.stringify(published(value)), /PRIVATE_HIDDEN/);
  value.site.showPremades = false;
  assert.equal(p.getPreviewPage(value, ['premades']), undefined);
  assert.equal(p.resolveSiteDestination(value, '/premades', 'public'), null);
});

test('full notes: individual publication changes only the selected public listing and keeps every other live field byte-for-byte', () => {
  const live = fresh(); live.site.showPremades = true;
  live.premades = [item({ id: 'old', name: 'Keep live listing' }), item({ description: 'Original selected description' })];
  const before = published(live), original = structuredClone(before), selected = item({ soldChannel: 'third-party', externalUrl: 'https://example.test/listing', venue: '', badge: 'Available elsewhere' });
  const after = m.createPublishedPremadeSnapshot(before, selected, 2, '2026-10-25T13:00:00.000Z');
  assert.deepEqual(before, original);
  assert.deepEqual(after.content.premades[0], before.content.premades[0]);
  assert.equal(after.content.premades[1].description, selected.description);
  const other = snapshot => { const content = structuredClone(snapshot.content); delete content.premades; return content; };
  assert.deepEqual(other(after), other(before));
  selected.description = 'Changed after publication';
  assert.notEqual(after.content.premades[1].description, selected.description);
  const appended = m.createPublishedPremadeSnapshot(after, item({ id: 'new' }), 3);
  assert.equal(appended.content.premades.length, 3);
  assert.deepEqual(appended.content.premades.slice(0, 2), after.content.premades);
  for (const bad of [item({ visible: false }), item({ image: 'data:image/png;base64,AAAA' }), item({ soldChannel: 'third-party', externalUrl: 'javascript:alert(1)' }), item({ soldChannel: 'third-party', externalUrl: 'http://example.test' }), item({ price: -1 })]) assert.throws(() => m.createPublishedPremadeSnapshot(before, bad, 2));
});

test('full notes: public font projection includes only fonts actually used on public content', () => {
  const value = fresh();
  value.fonts = [
    { id: 'used', name: 'Licensed used font', src: '/api/fonts/12345678-1234-4234-8234-123456789abc', format: 'woff2' },
    { id: 'unused', name: 'PRIVATE_UNUSED_FONT', src: '/api/fonts/22345678-1234-4234-8234-123456789abc', format: 'woff' },
    { id: 'hidden', name: 'PRIVATE_HIDDEN_FONT', src: '/api/fonts/32345678-1234-4234-8234-123456789abc', format: 'ttf' },
  ];
  value.design = { bodyFontId: 'used', bodyFontSize: 17, headingFontSize: 53 };
  const hidden = value.pages.find(page => page.builtinKey === 'terms');
  hidden.availability = 'hidden'; hidden.titleAppearance = { fontId: 'hidden' };
  const publicValue = published(value);
  assert.deepEqual(publicValue.content.fonts.map(font => font.id), ['used']);
  assert.doesNotMatch(JSON.stringify(publicValue), /PRIVATE_UNUSED_FONT|PRIVATE_HIDDEN_FONT/);
  for (const change of [font => font.src = 'https://example.test/untrusted.woff2', font => font.src = 'data:font/woff2;base64,AAAA', font => font.format = 'html']) { const bad = structuredClone(value); change(bad.fonts[0]); assert.equal(m.validateOwnerContent(bad).valid, false); }
});

test('full notes: odd gallery layout preserves all cards, order and lightbox entries for every count', () => {
  const h = harness(); h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  const { FursuitGallery } = h.load('src/components/FursuitGallery.tsx');
  for (const count of [0, 1, 2, 3, 5, 7, 8, 101]) {
    const photos = Array.from({ length: count }, (_, index) => ({ id: `photo-${index}`, name: `Newest-to-oldest ${index}`, src: `/images/test-${index}.webp`, alt: `Image ${index}`, width: 500, height: 500 }));
    const saved = structuredClone(photos);
    h.hooks = []; h.render(FursuitGallery, { photos });
    const figures = h.all(node => node.type === 'figure');
    assert.equal(figures.length, count);
    assert.deepEqual(figures.map(node => nodes(node).find(child => child.type === 'figcaption').props.children[0].props.children), photos.map(photo => photo.name));
    if (count) {
      const open = h.all(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog').at(-1);
      open.props.onClick({ currentTarget: { focus() {} } }); h.render(FursuitGallery, { photos });
      const title = h.find(node => node.props.id === 'fursuit-photo-title');
      assert.equal(title.props.children, photos.at(-1).name, 'oldest still accessible in lightbox');
    }
    h.unmount(); assert.deepEqual(photos, saved);
  }
  const css = readFileSync(new URL('../src/components/FursuitGallery.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.odd[^}]*\.card:first-child[^}]*grid-column:1\s*\/\s*-1[^}]*justify-self:center/);
  assert.doesNotMatch(css, /(?:last-child|nth-child)[^}]*display:\s*none/);
});
