import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';

// Executes real route, portal and history controller source with synthetic hooks,
// an asynchronous history stack and an in-memory store. No Firebase/cloud writes.
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture({ section = 'overview', pageId, href } = {}) {
  const h = harness();
  h.window.location.href = href ?? (section === 'overview' ? '/taylor' : `/taylor/${section}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}`);
  for (const name of ['HelpButton', 'TaylorServices', 'CommissionRequests']) h.overrides[`./${name}`] = { [name]: () => null };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  let saved = h.load('src/owner/defaults.ts').createInitialOwnerWorkspace(), saves = 0, loads = 0, failSave = false, saveGate;
  const store = {
    async load() { loads++; return structuredClone(saved); }, subscribe: () => () => {},
    async saveDraft(draft) { saves++; if (saveGate) await saveGate; if (failSave) throw Error('Save failed; your draft stays here.'); saved = { ...saved, draft: structuredClone(draft), revision: saved.revision + 1 }; return structuredClone(saved); },
  };
  const props = { store, mode: 'cloud', userEmail: 'owner@example.test', onSignOut: async () => {}, initialSection: section, initialPageId: pageId };
  const render = () => h.render(Portal, props);
  const link = section => h.find(n => n.type === 'a' && n.props.href === `/taylor/${section}`);
  const builder = () => h.find(n => n.type?.name === 'OwnerVisualBuilder');
  const dialog = () => h.find(n => n.type?.name === 'Dialog' && n.props.title === 'Save before moving on?');
  const action = label => nodes(dialog()?.props.actions).find(n => n.type === 'button' && content(n).trim() === label);
  const click = slug => { link(slug).props.onClick({ button: 0, preventDefault() {} }); render(); };
  const travel = async delta => { h.window.history.go(delta); await flush(); render(); };
  const edit = value => { builder().props.onEdit(draft => { draft.home.title = value; }); render(); };
  render(); await flush(); render();
  return { h, render, link, builder, dialog, action, click, travel, edit, props, get saved() { return saved; }, get loads() { return loads; }, get saves() { return saves; }, set failSave(value) { failSave = value; }, set saveGate(value) { saveGate = value; } };
}

const sections = ['overview', 'pages', 'prices', 'photos', 'premades', 'home', 'requests', 'client-hub', 'file-hub', 'services', 'settings'];
test('all 11 owner sections have unique real hrefs; /taylor opens Overview without writes', async () => {
  const t = await fixture();
  assert.equal(t.builder(), undefined); assert.equal(t.link('overview').props['aria-current'], undefined); // brand link
  const nav = t.h.find(n => n.type === 'nav');
  assert.equal(nodes(nav).find(n => n.props.href === '/taylor/overview').props['aria-current'], 'page');
  for (const slug of sections) assert.ok(t.link(slug), slug);
  assert.equal(new Set(sections).size, 11); assert.equal(t.loads, 1); assert.equal(t.saves, 0); t.h.unmount();
});

test('every deep link passes its destination through the exact owner gate; invalid sections are 404s', async () => {
  const h = harness();
  for (const name of ['firebase/auth', 'firebase/app', 'firebase/firestore/lite']) h.overrides[name] = {};
  for (const name of ['HelpButton', 'TaylorServices', 'CommissionRequests']) h.overrides[`./${name}`] = { [name]: () => null };
  const route = h.load('src/app/taylor/[section]/page.tsx');
  assert.deepEqual(route.metadata.robots, { index: false, follow: false });
  const model = h.load('src/owner/owner-navigation.ts');
  for (const slug of sections) {
    const entry = await route.default({ params: Promise.resolve({ section: slug }), searchParams: Promise.resolve({ page: 'page-a/b ?#' }) });
    const gate = entry.type(entry.props);
    assert.equal(gate.type.name, 'FirebaseOwnerGate');
    const portal = gate.props.children({ store: {}, userEmail: 'owner@example.test', signOut: async () => {} });
    assert.equal(portal.type.name, 'OwnerPortal');
    assert.equal(portal.props.initialSection, model.ownerSectionFromSlug(slug));
    assert.equal(portal.props.initialPageId, slug === 'pages' ? 'page-a/b ?#' : undefined);
  }
  for (const section of ['preview', 'unknown', 'files', 'clients', 'pages/other', '__proto__']) await assert.rejects(route.default({ params: Promise.resolve({ section }), searchParams: Promise.resolve({}) }), /MOCK_NOT_FOUND_404/);
  assert.equal(model.ownerDestinationFromUrl('/taylor/preview/gallery'), null);
  assert.equal(model.ownerDestinationFromUrl('/taylor/preview'), null);
  h.unmount();
});

test('initial bookmark and simulated refresh select the same builder page in view mode', async () => {
  const h = harness(); const pageId = h.load('src/owner/defaults.ts').createInitialOwnerWorkspace().draft.pages.find(p => p.builtinKey === 'gallery').id;
  for (let refresh = 0; refresh < 2; refresh++) {
    const t = await fixture({ section: 'pages', pageId });
    assert.equal(t.builder().props.page.id, pageId); assert.equal(t.builder().props.browsing, true);
    assert.equal(t.h.window.location.href, `/taylor/pages?page=${encodeURIComponent(pageId)}`); assert.equal(t.saves, 0); t.h.unmount();
  }
});

test('clean Back/Forward follows section URLs without remounting, rereading or saving', async () => {
  const t = await fixture();
  t.click('pages'); t.builder().props.onBrowsingChange(false); t.render(); t.click('photos');
  assert.equal(t.h.window.location.href, '/taylor/photos');
  await t.travel(-1); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.browsing, false);
  await t.travel(-1); assert.equal(t.h.window.location.href, '/taylor'); assert.equal(t.builder(), undefined);
  await t.travel(1); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.browsing, false);
  await t.travel(1); assert.equal(t.h.window.location.href, '/taylor/photos'); assert.equal(t.loads, 1); assert.equal(t.saves, 0); t.h.unmount();
});

for (const dismiss of ['Keep editing', 'outside']) test(`dirty Back restores URL; ${dismiss} preserves history and unsaved draft`, async () => {
  const t = await fixture(); t.click('pages'); t.edit('KEEP PRIVATE');
  const length = t.h.window.history.length;
  await t.travel(-1);
  assert.equal(t.h.window.location.href, '/taylor/pages'); assert.ok(t.dialog()); assert.equal(t.builder().props.content.home.title, 'KEEP PRIVATE');
  if (dismiss === 'outside') t.dialog().props.onClose(); else t.action(dismiss).props.onClick(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.h.window.history.length, length); assert.equal(t.saves, 0);
  await t.travel(-1); assert.ok(t.dialog()); assert.equal(t.h.window.location.href, '/taylor/pages');
  t.action('Discard changes').props.onClick(); await flush(); t.render();
  assert.equal(t.h.window.location.href, '/taylor'); assert.equal(t.builder(), undefined);
  await t.travel(1); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.notEqual(t.builder().props.content.home.title, 'KEEP PRIVATE');
  assert.equal(t.h.window.history.length, length); assert.equal(t.saves, 0); t.h.unmount();
});

test('dirty Forward save failure stays at original URL with edits; successful retry follows original history entry', async () => {
  const t = await fixture(); t.click('pages'); t.click('photos'); await t.travel(-1); t.edit('SAVE ME');
  await t.travel(1); assert.equal(t.h.window.location.href, '/taylor/pages');
  t.failSave = true; await t.action('Save and continue').props.onClick(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.content.home.title, 'SAVE ME'); assert.equal(t.dialog(), undefined);
  t.failSave = false; await t.travel(1); await t.action('Save and continue').props.onClick(); await flush(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/photos'); assert.equal(t.saved.draft.home.title, 'SAVE ME');
  await t.travel(-1); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.content.home.title, 'SAVE ME');
  assert.equal(t.h.window.history.length, 3); assert.equal(t.saves, 2); t.h.unmount();
});

test('click navigation retains original URL until Save/Discard; failure and Keep editing never navigate', async () => {
  const t = await fixture({ section: 'pages' }); t.edit('DO NOT LOSE');
  t.click('prices'); assert.equal(t.h.window.location.href, '/taylor/pages'); t.action('Keep editing').props.onClick(); t.render();
  t.click('prices'); t.failSave = true; await t.action('Save and continue').props.onClick(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.content.home.title, 'DO NOT LOSE');
  t.click('prices'); t.action('Discard changes').props.onClick(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/prices'); assert.equal(t.builder(), undefined); t.h.unmount();
});

test('builder page history preserves unsaved content and chosen edit mode without a discard prompt', async () => {
  const t = await fixture({ section: 'pages' }); t.builder().props.onBrowsingChange(false); t.render(); t.edit('PRIVATE PAGE EDIT');
  const gallery = t.builder().props.content.pages.find(p => p.builtinKey === 'gallery'); t.builder().props.onPageChange(gallery); t.render();
  assert.equal(t.h.window.location.href, `/taylor/pages?page=${encodeURIComponent(gallery.id)}`);
  await t.travel(-1); assert.equal(t.builder().props.page.builtinKey, 'home'); assert.equal(t.builder().props.content.home.title, 'PRIVATE PAGE EDIT');
  await t.travel(1); assert.equal(t.builder().props.page.id, gallery.id); assert.equal(t.builder().props.browsing, false); assert.equal(t.dialog(), undefined); assert.equal(t.saves, 0); t.h.unmount();
});

test('modified and middle-click links stay native; keyboard/primary activation uses the dirty guard', async () => {
  const t = await fixture({ section: 'pages' }); t.edit('ORIGINAL TAB'); let prevented = 0;
  for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) t.link('photos').props.onClick({ button: 0, ...modifiers, preventDefault() { prevented++; } });
  t.render(); assert.equal(prevented, 0); assert.equal(t.dialog(), undefined); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.builder().props.content.home.title, 'ORIGINAL TAB');
  t.link('photos').props.onClick({ button: 0, detail: 0, preventDefault() { prevented++; } }); t.render();
  assert.equal(prevented, 1); assert.ok(t.dialog()); assert.equal(t.saves, 0); t.h.unmount();
});

test('Back during a pending save or upload rolls back without replacing the draft or history stack', async () => {
  const t = await fixture(); t.click('pages'); t.edit('PENDING SAVE');
  const provider = t.h.find(n => n.type?.name === 'OwnerUploadProvider'); provider.props.onBusyChange(true); t.render();
  await t.travel(-1); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.equal(t.dialog(), undefined); assert.equal(t.builder().props.content.home.title, 'PENDING SAVE');
  provider.props.onBusyChange(false); t.render(); t.click('photos');
  let finish; t.saveGate = new Promise(resolve => { finish = resolve; });
  const saving = t.action('Save and continue').props.onClick(); t.render();
  await t.travel(-1); assert.equal(t.h.window.location.href, '/taylor/pages');
  finish(); await saving; await flush(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/photos'); assert.equal(t.saved.draft.home.title, 'PENDING SAVE'); assert.equal(t.saves, 1); t.h.unmount();
});

test('File Hub opens its temporary-photo section without exposing the retired home-storage plan', async () => {
  const t = await fixture({ section: 'files', href: '/taylor/file-hub' });
  assert.ok(t.h.find(n => n.type?.name === 'TemporaryFileHub'));
  assert.equal(content(t.h.find(n => n.type === 'h1')), 'Your files, in one place');
  assert.doesNotMatch(content(t.h.tree), /2 TB|8 TB|Home storage setup|Home computer/i);
  assert.equal(t.saves, 0); t.h.unmount();
});

test('current URL wins after authentication remount even when server entry props are older', async () => {
  const t = await fixture({ section: 'overview', href: '/taylor/photos' });
  assert.ok(t.h.find(n => n.type?.name === 'PhotoGalleryManager')); assert.equal(t.builder(), undefined);
  assert.equal(t.h.window.location.href, '/taylor/photos'); assert.equal(t.saves, 0); t.h.unmount();
});

test('unknown or trashed bookmarked builder page falls back safely and repairs only its current URL', async () => {
  const t = await fixture({ section: 'pages', pageId: 'missing-private-page' }); t.render();
  assert.equal(t.builder().props.page.builtinKey, 'home'); assert.equal(t.h.window.location.href, '/taylor/pages');
  assert.equal(t.h.window.history.length, 1); assert.equal(t.saves, 0); t.h.unmount();
});

test('rapid and repeated Back requests cannot bypass a dirty navigation guard', async () => {
  const t = await fixture(); t.click('photos'); t.click('prices'); t.click('pages'); t.edit('RAPID BACK');
  t.h.window.history.back(); t.h.window.history.back(); await flush(); t.render();
  assert.equal(t.h.window.location.href, '/taylor/pages'); assert.ok(t.dialog()); assert.equal(t.builder().props.content.home.title, 'RAPID BACK');
  t.action('Keep editing').props.onClick(); t.render();
  await t.travel(-3); assert.equal(t.h.window.location.href, '/taylor/pages'); assert.ok(t.dialog());
  t.action('Keep editing').props.onClick(); t.render(); assert.equal(t.h.window.history.length, 4); assert.equal(t.saves, 0); t.h.unmount();
});
