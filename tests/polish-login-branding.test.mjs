import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { harness, content } from './owner-ui-harness.mjs';

const asset = '/images/tmc-wordmark.png';
test('owner and default header/footer use the exact supplied transparent PNG without remaking artwork', t => {
  const png = readFileSync(new URL('../public/images/tmc-wordmark.png', import.meta.url));
  assert.equal(createHash('sha256').update(png).digest('hex'), '9394dfc154f722e4b75ca01956c0a045538e63d4c8de0e77b935eab6eb281417');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1835); assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'RGBA PNG retains its transparency');
  const h = harness(); t.after(() => h.unmount());
  const { OwnerBrandLogo } = h.load('src/owner/OwnerBrandLogo.tsx');
  h.render(OwnerBrandLogo, { decorative: true });
  const ownerImage = h.find(n => n.type === 'Image');
  assert.equal(ownerImage.props.src, asset); assert.equal(ownerImage.props.alt, '');
  assert.equal(ownerImage.props.width, 1835); assert.equal(ownerImage.props.height, 512);
  const { Brand } = h.load('src/components/Brand.tsx');
  for (const footer of [false, true]) {
    h.render(Brand, { footer });
    const logoImage = h.find(n => n.type === 'Image');
    assert.equal(logoImage.props.src, asset);
    assert.equal(h.tree.props['aria-label'], 'Taylor Made Creations home');
    assert.equal(content(h.tree), '', 'wordmark does not repeat its business name in adjacent text');
    assert.equal(h.tree.props.className.includes('footer-brand'), footer);
  }
});

test('custom header/footer artwork keeps its public/private media boundary and editing controls', t => {
  const h = harness(); t.after(() => h.unmount());
  const { Brand } = h.load('src/components/Brand.tsx');
  const logo = { src: '/api/media/12345678-1234-4234-8234-123456789abc', alt: 'Custom studio mark' };
  for (const footer of [false, true]) for (const privateMedia of [false, true]) {
    h.render(Brand, { footer, logo, privateMedia, editable: true });
    const custom = h.find(n => typeof n.type === 'function' && n.type.name === 'BrandLogo');
    assert.equal(custom.props.src, logo.src); assert.equal(custom.props.alt, logo.alt);
    assert.equal(custom.props.privateMedia, privateMedia); assert.equal(custom.props.editable, true);
    assert.equal(h.find(n => n.type === 'Image' && n.props.src === asset), undefined);
  }
  h.render(Brand, { footer: true, name: 'Custom studio name' });
  assert.equal(content(h.tree), 'Custom studio name');
  assert.equal(h.find(n => n.type === 'Image' && n.props.src === asset), undefined);
});

test('header and public construction gate retain static, non-private wordmark branding', t => {
  const h = harness(); t.after(() => h.unmount());
  const { Brand } = h.load('src/components/Brand.tsx');
  h.render(Brand);
  const headerLogo = h.find(n => n.type === 'Image');
  assert.equal(headerLogo.props.src, asset);
  assert.equal(h.tree.props.className, 'brand wordmarkBrand');
  assert.equal(h.find(n => typeof n.type === 'function' && n.type.name === 'BrandLogo'), undefined);
  const { UnderConstruction } = h.load('src/components/UnderConstruction.tsx');
  h.render(UnderConstruction);
  const gateBrand = h.find(n => typeof n.type === 'function' && n.type.name === 'Brand');
  assert.equal(gateBrand.props.logo, undefined); assert.equal(gateBrand.props.privateMedia, undefined);
});

test('login wordmark, space label and footer are centered while fields stay left-aligned', () => {
  const css = readFileSync(new URL('../src/owner/FirebaseOwnerGate.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.brand \{[^}]*margin: 0 auto 36px/);
  assert.match(css, /\.eyebrow \{[^}]*text-align: center/);
  assert.match(css, /\.footer \{[^}]*align-items: center; text-align: center/);
  assert.doesNotMatch(css.match(/\.field \{([^}]+)\}/)?.[1] ?? '', /text-align: center/);
  for (const file of ['../src/owner/OwnerBrandLogo.module.css', '../src/components/Brand.module.css']) {
    const logoCss = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(logoCss, /background: #800014/);
    assert.match(logoCss, /width: 100%; height: auto; object-fit: contain/);
  }
});

test('shared wordmark keeps appearance/edit targets and scales within narrow header/footer containers', async t => {
  const h = harness(); t.after(() => h.unmount());
  const { Brand } = h.load('src/components/Brand.tsx');
  for (const footer of [false, true]) {
    h.render(Brand, { footer, editable: true, appearance: { textColor: '#112233' }, logoAppearance: { imageFit: 'cover', imagePositionX: 25, backgroundColor: '#123456' } });
    assert.equal(h.tree.props.style['--element-text-color'], '#112233');
    assert.equal(h.find(n => n.props['data-owner-edit'] === 'template-image:site.logo').props.style['--element-background'], '#123456');
    assert.deepEqual(h.find(n => n.type === 'Image').props.style, { objectFit: 'cover', objectPosition: '25% 50%' });
  }
  const { default: postcss } = await import('postcss');
  const rules = postcss.parse(readFileSync(new URL('../src/components/Brand.module.css', import.meta.url), 'utf8'));
  const brand = rules.nodes.find(node => node.selector === '.wordmarkBrand');
  const declaration = name => brand.nodes.find(node => node.prop === name)?.value;
  assert.equal(declaration('width'), '280px'); assert.equal(declaration('max-width'), '100%'); assert.equal(declaration('min-width'), '0');
});

test('public pages, saved preview, editor and construction share the wordmark and rights notice with automatic year', t => {
  const h = harness(); t.after(() => h.unmount());
  const draft = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  h.overrides['./PublicSiteContext'] = { usePublicOwnerContent: () => draft, usePublicSiteState: () => ({ status: 'published' }) };
  const { PublicHeader, PublicFooter } = h.load('src/components/PublicChrome.tsx');
  const { SiteContentFrame } = h.load('src/components/SiteContent.tsx');
  const { UnderConstruction } = h.load('src/components/UnderConstruction.tsx');
  const { Brand } = h.load('src/components/Brand.tsx');
  const checks = [[PublicHeader, {}, 1, false], [PublicFooter, {}, 1, true], [UnderConstruction, {}, 1, true]];
  for (const mode of ['public', 'private-preview', 'editor']) for (const page of draft.pages) checks.push([SiteContentFrame, { content: draft, page, mode }, 2, true]);
  for (const [Component, props, count, rights] of checks) {
    h.render(Component, props);
    const brands = h.all(n => n.type === Brand);
    assert.equal(brands.length, count);
    assert.equal(content(h.tree).includes('All rights reserved.'), rights);
    assert.equal(h.all(n => n.type?.name === 'CopyrightRange').length, rights ? 1 : 0, 'dynamic year component remains in every existing copyright location');
    for (const brand of brands) {
      h.render(Brand, brand.props);
      assert.equal(h.find(n => n.type === 'Image').props.src, asset);
      assert.equal(h.tree.props['aria-label'], 'Taylor Made Creations home');
    }
  }
  draft.site.name = 'Custom studio'; h.render(PublicFooter);
  assert.match(content(h.tree), /Custom studio\. All rights reserved\./);
});
