import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';

// Execute the real route entries and component callbacks with separate synthetic
// hook scopes per mounted boundary. This is not a browser or Firebase integration test.
const flush = () => new Promise(resolve => setImmediate(resolve));
const button = (h, label) => h.find(node => node.type === 'button' && content(node).trim() === label);
const ownerUid = 'navigation-test-owner';

async function workspaceFixture(section, pageId) {
  const gate = harness(), portal = harness(), builder = harness(), preview = harness();
  for (const h of [portal, builder]) {
    h.overrides['./HelpButton'] = { HelpButton: () => null };
    h.overrides['./TaylorServices'] = { TaylorServices: () => null };
    h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
  }
  const Builder = builder.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  portal.overrides['./OwnerVisualBuilder'] = { OwnerVisualBuilder: Builder };
  const Portal = portal.load('src/owner/OwnerPortal.tsx').default;
  const Preview = preview.load('src/owner/OwnerSitePreview.tsx').OwnerSitePreview;
  gate.overrides['./OwnerPortal'] = { __esModule: true, default: Portal };
  gate.overrides['./OwnerSitePreview'] = { OwnerSitePreview: Preview };
  gate.process.env = {
    NODE_ENV: 'production', NEXT_PUBLIC_FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'navigation-test.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'navigation-test',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'navigation-test.firebasestorage.app',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:abcdef123456', NEXT_PUBLIC_OWNER_UID: ownerUid,
  };
  const auth = { currentUser: null };
  let observer, loads = 0, writes = 0, createdStores = 0, portalElement, builderKey;
  const saved = portal.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
  const store = {
    load: async () => { loads++; return structuredClone(saved); }, subscribe: () => () => {}, dispose() {},
    saveDraft: async () => { writes++; throw Error('Unexpected write'); },
    publishLive: async () => { writes++; throw Error('Unexpected publish'); },
  };
  gate.overrides['firebase/app'] = { getApps: () => [], initializeApp: (options, name) => ({ options, name }) };
  gate.overrides['firebase/auth'] = {
    browserSessionPersistence: { type: 'SESSION' }, initializeAuth: () => auth,
    onAuthStateChanged: (_auth, callback) => { observer = callback; return () => { observer = null; }; },
    signInWithEmailAndPassword: async () => {}, signOut: async () => {},
  };
  gate.overrides['firebase/firestore/lite'] = { getFirestore: () => ({}) };
  gate.overrides['./firebase-store'] = { createFirebaseOwnerStore: () => { createdStores++; return store; } };
  portal.window.location.href = section ? `/taylor/${section}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}` : '/taylor';
  const route = gate.load(section ? 'src/app/taylor/[section]/page.tsx' : 'src/app/taylor/page.tsx').default;
  const entry = await route({ params: Promise.resolve({ section }), searchParams: Promise.resolve({ page: pageId }) });
  assert.equal(entry.type.name, 'OwnerWorkspaceEntry');
  const gateElement = entry.type(entry.props);
  assert.equal(gateElement.type.name, 'FirebaseOwnerGate');
  const renderGate = () => gate.render(gateElement.type, gateElement.props);
  const builderElement = () => portal.find(node => node.type === Builder);
  const render = () => {
    portal.render(portalElement.type, portalElement.props);
    const child = builderElement();
    if (!child) return;
    if (child.key !== builderKey) {
      builder.unmount(); builder.hooks = []; builder.refs.clear(); builderKey = child.key;
    }
    builder.render(child.type, child.props);
  };
  renderGate(); await flush(); renderGate();
  assert.equal(loads, 0); assert.equal(createdStores, 0);
  auth.currentUser = null; observer(null); renderGate();
  assert.ok(gate.find(node => node.type === 'form')); assert.equal(loads, 0);
  auth.currentUser = { uid: 'not-the-owner', email: 'wrong@example.test' };
  observer(auth.currentUser); await flush(); renderGate();
  assert.match(content(gate.tree), /Owner access only/); assert.equal(createdStores, 0);
  auth.currentUser = { uid: ownerUid, email: 'owner@example.test', reload: async () => {}, getIdToken: async () => 'mock-token' };
  observer(auth.currentUser); await flush(); renderGate();
  assert.equal(gate.tree.type.name, 'SessionContent');
  portalElement = nodes(gate.tree.type(gate.tree.props)).find(node => node.type === Portal);
  assert.ok(portalElement, 'the authenticated workspace route must mount OwnerPortal, not the saved preview');
  render(); await flush(); render();
  return {
    gate, portal, builder, preview, store, saved, render, builderElement,
    frame: () => builder.find(node => node.type?.name === 'SiteContentFrame'),
    get loads() { return loads; }, get writes() { return writes; },
    close() { for (const h of [builder, portal, preview, gate]) h.unmount(); },
  };
}

test('the actual /taylor route authenticates before mounting the workspace and its mode buttons update the parent', async () => {
  const t = await workspaceFixture();
  assert.equal(t.builderElement(), undefined, '/taylor starts at Overview');
  assert.ok(t.portal.find(node => node.type === 'a' && node.props.href === '/taylor/overview' && node.props['aria-current'] === 'page'));
  t.portal.find(node => node.type === 'a' && content(node).trim() === 'Website builder').props.onClick(); t.render();
  assert.equal(t.frame().props.editable, false); assert.equal(t.loads, 1);
  button(t.builder, 'Edit website').props.onClick(); t.render();
  assert.equal(t.builderElement().props.browsing, false); assert.equal(t.frame().props.editable, true);
  button(t.builder, 'Welcome text').props.onClick(); t.render();
  t.builder.find(node => node.type?.name === 'Field' && node.props.label === 'Main heading').props.onChange('KEEP THIS UNSAVED EDIT');
  t.render();
  assert.ok(t.builder.find(node => node.type === 'aside'));
  const exit = button(t.builder, 'Exit edit mode').props.onClick;
  exit(); exit(); t.render();
  assert.equal(t.builderElement().props.browsing, true); assert.equal(t.frame().props.editable, false);
  assert.equal(t.builder.find(node => node.type === 'aside'), undefined);
  assert.equal(t.frame().props.content.home.title, 'KEEP THIS UNSAVED EDIT');
  assert.equal(t.portal.find(node => node.type?.name === 'Dialog'), undefined);
  const oldKey = t.builderElement().key;
  const frame = t.frame();
  const navigation = nodes(frame.type(frame.props)).find(node => node.type?.name === 'ContentLink' && node.props.href === '/gallery');
  assert.ok(navigation);
  t.builder.currentContext = frame.props;
  const galleryLink = navigation.type(navigation.props);
  assert.equal(galleryLink.type, 'Link'); assert.equal(galleryLink.props.href, '/taylor/preview/gallery');
  let prevented = false;
  galleryLink.props.onClick({ preventDefault() { prevented = true; } }); t.render();
  assert.equal(prevented, true, 'workspace navigation stays in the unsaved in-memory draft');
  assert.notEqual(t.builderElement().key, oldKey); assert.equal(t.frame().props.page.builtinKey, 'gallery');
  assert.equal(t.frame().props.editable, false); assert.equal(t.frame().props.content.home.title, 'KEEP THIS UNSAVED EDIT');
  button(t.builder, 'Edit website').props.onClick(); t.render();
  assert.equal(t.frame().props.editable, true); assert.equal(t.builder.find(node => node.type === 'aside'), undefined);
  button(t.builder, 'Exit edit mode').props.onClick(); t.render();
  assert.equal(t.frame().props.editable, false); assert.equal(t.writes, 0); assert.equal(t.loads, 1);
  assert.notEqual(t.saved.draft.home.title, 'KEEP THIS UNSAVED EDIT');
  t.close();
});

test('bookmarked section destination survives signed-out and wrong-UID gates until the owner signs in', async () => {
  const t = await workspaceFixture('photos');
  assert.equal(t.builderElement(), undefined);
  assert.ok(t.portal.find(node => node.type?.name === 'PhotoGalleryManager'));
  assert.equal(t.portal.window.location.href, '/taylor/photos');
  assert.equal(t.loads, 1); assert.equal(t.writes, 0); t.close();
});

test('saved-preview links and both return links mount the workspace route, not another saved preview', async () => {
  const t = await workspaceFixture();
  const open = t.portal.find(node => node.type === 'a' && /View saved site/.test(content(node)));
  assert.equal(open.props.href, '/taylor/preview');
  const route = t.gate.load('src/app/taylor/preview/[[...slug]]/page.tsx').default;
  const entry = await route({ params: Promise.resolve({ slug: ['gallery'] }) });
  assert.equal(entry.type.name, 'OwnerPreviewEntry');
  const boundary = entry.type(entry.props);
  assert.equal(boundary.type.name, 'FirebaseOwnerGate');
  const preview = boundary.props.children({ store: t.store, userEmail: 'owner@example.test', signOut: async () => {} });
  assert.equal(preview.type.name, 'OwnerSitePreview'); assert.deepEqual(preview.props.slug, ['gallery']);
  t.preview.render(preview.type, preview.props); await flush(); t.preview.render(preview.type, preview.props);
  const returns = t.preview.all(node => node.type === 'Link' && /Taylor’s Space/.test(content(node)));
  assert.equal(returns.length, 2);
  for (const link of returns) {
    assert.equal(link.props.href, '/taylor');
    const destination = await t.gate.load('src/app/taylor/page.tsx').default({ params: Promise.resolve({}) });
    assert.equal(destination.type.name, 'OwnerWorkspaceEntry');
    assert.equal(destination.type(destination.props).type.name, 'FirebaseOwnerGate');
  }
  assert.equal(t.preview.find(node => node.type?.name === 'SiteContentFrame').props.mode, 'private-preview');
  assert.equal(t.writes, 0); t.close();
});

test('legacy workspace and preview URLs redirect to their distinct canonical paths', async () => {
  const h = harness();
  h.overrides['next/navigation'] = { redirect: href => { throw Object.assign(Error('redirect'), { href }); } };
  await assert.rejects(h.load('src/app/owner/page.tsx').default({ params: Promise.resolve({}) }), error => error.href === '/taylor');
  const preview = h.load('src/app/owner/preview/[[...slug]]/page.tsx').default;
  for (const slug of [undefined, ['gallery'], ['custom page', 'item/one']]) {
    await assert.rejects(preview({ params: Promise.resolve({ slug }) }), error => error.href === `/taylor/preview${slug?.length ? '/' + slug.map(encodeURIComponent).join('/') : ''}`);
  }
});

test('every concrete public route renders its own identity and stays behind the publication gate', async () => {
  const routes = [
    ['page.tsx', [], 'Home'], ['client-hub/page.tsx', ['client-hub'], 'ClientHub'],
    ['commissions/page.tsx', ['commissions'], 'Commissions'],
    ['commissions/request/page.tsx', ['commissions/request'], 'Request'],
    ['contact/page.tsx', ['contact'], 'Contact'], ['examples/page.tsx', ['examples'], 'Examples'],
    ['gallery/page.tsx', ['gallery'], 'Gallery'], ['premades/page.tsx', ['premades'], 'Premades'],
    ['prices/page.tsx', ['prices'], 'Prices'], ['suitcare/page.tsx', ['suitcare'], 'SuitCare'],
    ['terms/page.tsx', ['terms'], 'Terms'],
  ];
  const h = harness(); h.overrides['./published-site'] = { getPublishedSite: async () => ({ status: 'locked' }) };
  for (const [file, slug, fallbackName] of routes) {
    const element = await h.load(`src/app/${file}`).default();
    assert.equal(element.type.name, 'PublishedRoute', file);
    assert.deepEqual(element.props.slug, slug, file); assert.equal(element.props.fallback.type.name, fallbackName, file);
    assert.equal(!!element.props.request, file === 'commissions/request/page.tsx', file);
    const locked = await element.type(element.props);
    assert.equal(locked.type.name, 'UnderConstruction', file); assert.equal(locked.props.fallback, undefined, file);
  }
});

test('care alias and catch-all preserve current publication routing, validation, and construction lock', async () => {
  const h = harness(); let state = { status: 'baseline' };
  const published = { getPublishedSite: async () => state };
  h.overrides['@/server/published-site'] = published; h.overrides['./published-site'] = published;
  h.overrides['next/navigation'] = {
    permanentRedirect: href => { throw Object.assign(Error('redirect'), { href }); },
    notFound: () => { throw Error('MOCK_NOT_FOUND_404'); },
  };
  const care = h.load('src/app/care/page.tsx').default;
  await assert.rejects(care(), error => error.href === '/suitcare');
  state = { status: 'published' };
  assert.deepEqual((await care()).props.slug, ['care']);
  const custom = h.load('src/app/[...slug]/page.tsx').default;
  assert.deepEqual((await custom({ params: Promise.resolve({ slug: ['custom-page'] }) })).props.slug, ['custom-page']);
  await assert.rejects(custom({ params: Promise.resolve({ slug: ['a', 'b', 'c'] }) }), /MOCK_NOT_FOUND_404/);
  state = { status: 'locked' };
  const locked = await custom({ params: Promise.resolve({ slug: ['a', 'b', 'c'] }) });
  assert.equal(locked.type.name, 'UnderConstruction');
});
