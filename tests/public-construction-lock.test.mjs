import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sourceLoader } from './scout-source-loader.mjs';
import { harness, content, nodes } from './owner-ui-harness.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('construction is fail-closed without explicit valid live config, regardless of obsolete server environment', async () => {
  const reader = sourceLoader()('src/server/published-site.ts');
  const previous = process.env.TMC_PUBLIC_SITE_ACCESS;
  try {
    for (const setting of [undefined, '', 'closed', 'false', 'true', 'OPEN', ' open ', 'open']) {
      if (setting === undefined) delete process.env.TMC_PUBLIC_SITE_ACCESS;
      else process.env.TMC_PUBLIC_SITE_ACCESS = setting;
      for (const projectId of ['', 'taylor-made-creations']) {
        const paths=[];
        const state = await reader.readPublishedSite({ projectId, fetcher: async url => { paths.push(url); return Response.json({}, {status:404}); } });
        assert.deepEqual(state, { status: 'locked' });
        assert.ok(paths.every(path=>path.endsWith('/site/access')));
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TMC_PUBLIC_SITE_ACCESS;
    else process.env.TMC_PUBLIC_SITE_ACCESS = previous;
  }
});

test('anonymous JSON endpoint cannot expose publication or a draft while locked, even with bypass-like query/cookie/header', async () => {
  const h = sourceLoader();
  const previous = process.env.TMC_PUBLIC_SITE_ACCESS;
  delete process.env.TMC_PUBLIC_SITE_ACCESS;
  try {
    const response = await h('src/app/api/site-published/route.ts').GET(new Request('https://site.test/api/site-published?preview=1&access=open', { headers: { Cookie: 'owner=true', Authorization: 'Bearer not-a-real-token' } }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'locked' });
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  } finally {
    if (previous === undefined) delete process.env.TMC_PUBLIC_SITE_ACCESS;
    else process.env.TMC_PUBLIC_SITE_ACCESS = previous;
  }
});

test('root, builtins, custom routes, direct product and commission requests return only construction before serializing fallback', async () => {
  const h = harness();
  h.overrides['./published-site'] = { getPublishedSite: async () => ({ status: 'locked' }) };
  const { PublishedRoute } = h.load('src/server/PublishedRoute.tsx');
  for (const slug of [[], ['gallery'], ['terms'], ['suitcare'], ['contact'], ['about-taylor'], ['premades', 'private-product'], ['commissions', 'request']]) {
    const tree = await PublishedRoute({ slug, fallback: 'DO_NOT_SERIALIZE_BASELINE_OR_DRAFT' });
    assert.equal(tree.type.name, 'PublishedPage');
    assert.deepEqual(tree.props.serverState, {status:'locked'});
    assert.deepEqual(tree.props.slug, slug);
    assert.equal(tree.props.fallback, undefined);
    assert.doesNotMatch(JSON.stringify(tree), /DO_NOT_SERIALIZE/);
  }
});

test('every current public page uses the server publication boundary; owner entrypoints stay independent', () => {
  const walk = directory => readdirSync(new URL(`../${directory}`, import.meta.url), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : entry.name === 'page.tsx' ? [`${directory}/${entry.name}`] : []);
  const routes = walk('src/app').filter(file => !/^src\/app\/(?:taylor|owner)(?:\/|$)/.test(file));
  assert.ok(routes.length > 10);
  for (const file of routes) assert.match(read(file), /PublishedRoute/, file);
  assert.match(read('src/app/layout.tsx'), /const initialState = await getPublishedSite\(\)/);
  for (const file of ['src/app/taylor/page.tsx', 'src/app/taylor/preview/[[...slug]]/page.tsx']) {
    assert.doesNotMatch(read(file), /PublishedRoute|redirect\(/);
  }
});

test('malformed and deeper public paths return the construction gate before the streaming not-found boundary', async () => {
  const h = harness();
  h.overrides['@/server/published-site'] = { getPublishedSite: async () => ({ status: 'locked' }) };
  h.overrides['./published-site'] = { getPublishedSite: async () => ({ status: 'locked' }) };
  const CustomPage = h.load('src/app/[...slug]/page.tsx').default;
  for (const slug of [['does', 'not', 'exist'], ['UPPERCASE'], ['not-a-page!']]) {
    const result = await CustomPage({ params: Promise.resolve({ slug }) });
    assert.equal(result.type.name, 'PublishedPage');
    assert.deepEqual(result.props, {slug, serverState:{status:'locked'}});
  }
});

test('construction page preserves original branding and provides only canonical Owner Login; no redirect loop', () => {
  const h = harness(), Gate = h.load('src/components/UnderConstruction.tsx').UnderConstruction;
  h.render(Gate);
  assert.equal(h.tree.props['data-site-locked'], 'true');
  assert.match(content(h.tree), /Pardon the fluff\.This den is getting a makeover\./);
  assert.match(content(h.tree), /Owner Login/);
  const links = h.all(node => node.type === 'Link');
  assert.deepEqual(links.map(node => node.props.href), ['/taylor']);
  assert.equal(links[0].props.prefetch, false);
  assert.ok(h.find(node => node.type?.name === 'Brand'));
  assert.doesNotMatch(read('src/components/UnderConstruction.tsx'), /getPublishedSite|readPublishedSite|OwnerContent|window\.location|redirect\(/);
});

test('locked 404, client page, header and footer never expose baseline links or cached publication', () => {
  const h = harness();
  const context = { usePublicOwnerContent: () => null, usePublicSiteState: () => ({ status: 'locked' }), usePublicServerState: () => ({ status: 'locked' }) };
  h.overrides['./PublicSiteContext'] = context;
  h.overrides['@/components/PublicSiteContext'] = context;
  h.render(h.load('src/app/not-found.tsx').default);
  assert.equal(h.tree.type.name, 'UnderConstruction');
  h.render(h.load('src/components/PublishedPage.tsx').PublishedPage, { slug: [], fallback: 'NEVER_BASELINE', serverState: { status: 'locked' } });
  assert.equal(h.tree.type.name, 'UnderConstruction');
  const chrome = h.load('src/components/PublicChrome.tsx');
  assert.equal(h.render(chrome.PublicHeader), null);
  assert.equal(h.render(chrome.PublicFooter), null);
});

test('locked public tabs refresh while private owner routes stay independent; open tabs accept a lock response', async () => {
  for (const pathname of ['/', '/gallery', '/taylor', '/taylor/preview/gallery']) {
    const h = harness(); h.pathname = pathname;
    let calls = 0;
    h.globals.fetch = async () => { calls++; return Response.json({status:'locked'},{status:503}); };
    const { PublicSiteProvider } = h.load('src/components/PublicSiteContext.tsx');
    h.render(PublicSiteProvider, { initialState: { status: 'locked' }, children: null });
    await flush();
    assert.equal(calls, /^\/taylor/.test(pathname) ? 0 : 1, pathname);
    assert.deepEqual(h.tree.props.value.state, { status: 'locked' });
    h.unmount();
  }
  const h = harness();
  h.globals.fetch = async () => Response.json({ status: 'locked' }, { status: 503 });
  const { PublicSiteProvider } = h.load('src/components/PublicSiteContext.tsx');
  const props = { initialState: { status: 'baseline', reason: 'unconfigured' }, children: null };
  h.render(PublicSiteProvider, props); await flush(); h.render(PublicSiteProvider, props);
  assert.deepEqual(h.tree.props.value.state, { status: 'locked' });
  h.unmount();
});

test('private preview passes the existing verified owner session only, renders read-only and provides sign-out', async () => {
  const h = harness();
  h.overrides['./FirebaseOwnerGate'] = { FirebaseOwnerGate: 'VerifiedOwnerGate' };
  const Entry = h.load('src/owner/OwnerPreviewEntry.tsx').default;
  h.render(Entry, { slug: ['gallery'] });
  assert.equal(h.tree.type, 'VerifiedOwnerGate');
  assert.equal(typeof h.tree.props.children, 'function');
  const workspace = h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
  let signouts = 0, reads = 0;
  const store = { load: async () => { reads++; return workspace; }, subscribe: () => () => {} };
  const preview = h.tree.props.children({ store, userEmail: 'owner@example.test', signOut: async () => { signouts++; } });
  assert.equal(preview.props.onSignOut instanceof Function, true);
  h.render(preview.type, preview.props); await flush(); h.render(preview.type, preview.props);
  const frame = h.find(node => node.type?.name === 'SiteContentFrame');
  assert.equal(frame.props.mode, 'private-preview');
  assert.equal(frame.props.editable, undefined);
  assert.equal(reads, 1);
  assert.equal(nodes(h.tree).some(node => node.props['data-owner-edit'] !== undefined), false);
  assert.match(content(h.tree), /editing is off/);
  await h.find(node => node.type === 'button' && content(node) === 'Sign out').props.onClick();
  assert.equal(signouts, 1);
  h.unmount();
});

test('Firestore publication is conditional on safe live access; exact owner and write checks remain intact', () => {
  const rules = read('firebase/firestore.rules');
  const publication = rules.slice(rules.indexOf('match /site/published'), rules.indexOf('function validDraftId'));
  assert.match(publication, /allow get: if isOwner\(\) \|\| \(isPublicSiteOpen\(\) && validWorkspace\(resource\.data\)\);/);
  assert.doesNotMatch(publication, /allow get: if true|allow read:/);
  assert.match(rules, /request\.auth\.uid == 'a4ARjp0z8ZOByKlC2AfGzmMRj843'/);
  assert.match(publication, /allow create: if isOwner\(\) && validWorkspace/);
  assert.match(publication, /allow update: if isOwner\(\) && validWorkspace/);
  assert.match(publication, /publishingWithDraft\(request\.resource\.data\.revision\)/);
  assert.match(publication, /allow list, delete: if false/);
});
