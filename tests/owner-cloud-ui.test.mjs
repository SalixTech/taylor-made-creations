import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, nodes, content } from './owner-ui-harness.mjs';

// Mock hooks/storage only. No browser, Firebase login, network read or cloud write.
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setupPortal() {
  const h = harness();
  h.overrides['./HelpButton'] = { HelpButton: () => null };
  h.overrides['./TaylorServices'] = { TaylorServices: () => null };
  h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
  const defaults = h.load('src/owner/defaults.ts');
  const storage = h.load('src/owner/storage.ts');
  let raw = null, saves = 0, previews = 0, signsOut = 0, failSave = false, failPreview = false, saveGate = null, signOutGate = null;
  const base = storage.createOwnerStore({ read: async () => structuredClone(raw), update: async fn => { raw = structuredClone(fn(raw)); return structuredClone(raw); } });
  const store = {
    ...base,
    async saveDraft(...args) { saves++; if (saveGate) await saveGate.promise; if (failSave) throw new Error('Network unavailable; your changes were not saved.'); return base.saveDraft(...args); },
    async publishLocal(...args) { previews++; if (failPreview) throw new Error('Private snapshot could not be saved.'); return base.publishLocal(...args); },
  };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  const props = { store, mode: 'cloud', userEmail: 'owner@example.test', onSignOut: async () => { signsOut++; if (signOutGate) await signOutGate.promise; } };
  const render = () => h.render(Portal, props);
  const button = label => h.find(node => node.type === 'button' && (content(node).trim() === label || (label === 'Save' && /^Save\s/.test(content(node).trim()))));
  const builder = () => h.find(node => typeof node.type === 'function' && node.type.name === 'OwnerVisualBuilder');
  // Parent regression follows either the standalone builder or the simple Home manager.
  const editableContent = () => builder()?.props.content ?? h.find(node => typeof node.type === 'function' && node.type.name === 'HomePageManager')?.props.content;
  const field = label => label === 'Main heading' && editableContent() ? { props: { value: editableContent().home.title } } : h.find(node => typeof node.type === 'function' && node.type.name === 'Field' && node.props.label === label);
  const dialog = () => h.find(node => typeof node.type === 'function' && node.type.name === 'Dialog');
  const dialogButton = label => nodes(dialog()?.props.actions).find(node => node.type === 'button' && content(node) === label);
  const editTitle = title => { builder().props.onEdit(draft => { draft.home.title = title; }); render(); };
  return { h, defaults, store, render, button, field, dialog, dialogButton, editTitle, get raw() { return raw; }, set raw(value) { raw = value; }, get saves() { return saves; }, get previews() { return previews; }, get signsOut() { return signsOut; }, set failSave(value) { failSave = value; }, set failPreview(value) { failPreview = value; }, set saveGate(value) { saveGate = value; }, set signOutGate(value) { signOutGate = value; } };
}
async function openPortal() { const t = setupPortal(); t.render(); await flush(); t.render(); return t; }

test('editor requires injected store, never saves baseline on open, and accurately labels private cloud drafts', async () => {
  const t = await openPortal();
  assert.equal(t.raw, null);
  assert.equal(t.button('Save').props.disabled, false);
  assert.match(content(t.h.tree), /PRIVATE CLOUD DRAFT/);
  assert.match(content(t.h.tree), /No cloud draft saved yet/);
  assert.match(content(t.h.tree), /owner@example.test/);
  for (const file of ['OwnerPortal.tsx', 'OwnerSitePreview.tsx', 'OwnerWorkspaceEntry.tsx', 'OwnerPreviewEntry.tsx']) {
    const source = readFileSync(new URL(`../src/owner/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /createBrowserOwnerStore|indexedDB|localStorage/);
  }
  t.h.unmount();
});

test('failed network save retains edits; repeated click is locked until acknowledged persistence', async () => {
  const t = await openPortal(); t.editTitle('CLOUD DRAFT');
  t.failSave = true; t.button('Save').props.onClick(); t.render(); t.dialogButton('Save draft').props.onClick(); await flush(); t.render();
  assert.equal(t.raw, null);
  assert.equal(t.field('Main heading').props.value, 'CLOUD DRAFT');
  assert.match(content(t.h.tree), /not saved/);
  assert.equal(t.button('Save').props.disabled, false);
  t.dialogButton('Keep editing').props.onClick(); t.render();
  t.failSave = false; const pending = deferred(); t.saveGate = pending;
  t.button('Save').props.onClick(); t.render();
  const save = t.dialogButton('Save draft').props.onClick; save(); save(); t.render();
  assert.equal(t.saves, 2, 'one failed save plus one pending save; duplicate is ignored');
  assert.equal(t.button('Sign out').props.disabled, true);
  assert.equal(t.button('Preview').props.disabled, true);
  assert.equal(t.h.find(node => node.type === 'fieldset').props.disabled, true);
  assert.equal(t.raw, null);
  pending.resolve(); await flush(); t.render();
  assert.equal(t.raw.draft.home.title, 'CLOUD DRAFT'); assert.equal(t.raw.revision, 1);
  assert.equal(t.raw.localPublished, null);
  assert.match(content(t.h.tree), /Private cloud draft saved/);
  t.h.unmount();
});

test('instant preview shows unsaved edits without draft, snapshot or public writes', async () => {
  const t = await openPortal(); t.editTitle('UNSAVED PRIVATE PREVIEW');
  t.failPreview = true; t.button('Preview').props.onClick(); t.render();
  assert.equal(t.raw, null); assert.equal(t.saves, 0); assert.equal(t.previews, 0);
  assert.equal(t.dialog().props.title, 'Your draft preview');
  const frame = nodes(t.dialog()).find(node => typeof node.type === 'function' && node.type.name === 'SiteContentFrame');
  assert.equal(frame.props.content.home.title, 'UNSAVED PRIVATE PREVIEW');
  assert.equal(frame.props.mode, 'editor');
  t.dialogButton('Back to editing').props.onClick(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.field('Main heading').props.value, 'UNSAVED PRIVATE PREVIEW');
  assert.equal(t.saves, 0); assert.equal(t.previews, 0); t.h.unmount();
});

test('dirty signout can be canceled or save first, and failed save never signs out', async () => {
  const t = await openPortal(); t.editTitle('KEEP MY EDITS');
  t.button('Sign out').props.onClick(); t.render();
  assert.equal(t.signsOut, 0); assert.equal(t.dialog().props.title, 'Save before signing out?');
  t.dialogButton('Keep editing').props.onClick(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.field('Main heading').props.value, 'KEEP MY EDITS');
  t.button('Sign out').props.onClick(); t.render();
  t.failSave = true; await t.dialogButton('Save and sign out').props.onClick(); t.render();
  assert.equal(t.signsOut, 0); assert.equal(t.raw, null); assert.equal(t.dialog(), undefined);
  assert.equal(t.field('Main heading').props.value, 'KEEP MY EDITS');
  t.failSave = false; t.button('Sign out').props.onClick(); t.render();
  const pending = deferred(); t.saveGate = pending;
  const saveAndExit = t.dialogButton('Save and sign out').props.onClick(); t.render();
  assert.equal(t.dialog().props.dismissDisabled, true);
  for (const node of nodes(t.dialog().props.actions).filter(node => node.type === 'button')) assert.equal(node.props.disabled, true);
  assert.equal(t.signsOut, 0); pending.resolve(); await saveAndExit; t.render();
  assert.equal(t.raw.draft.home.title, 'KEEP MY EDITS'); assert.equal(t.signsOut, 1);
  assert.equal(t.raw.localPublished, null);
  t.h.unmount();
});

test('explicit signout without saving leaves cloud draft unchanged and repeated signout is locked', async () => {
  const t = await openPortal(); t.editTitle('DISCARD ONLY UNSAVED');
  t.button('Sign out').props.onClick(); t.render();
  const pending = deferred(); t.signOutGate = pending;
  const signOut = t.dialogButton('Sign out without saving').props.onClick; signOut(); signOut(); t.render();
  assert.equal(t.signsOut, 1); assert.equal(t.raw, null); assert.equal(t.saves, 0);
  assert.match(content(t.h.tree), /Signing out/); assert.equal(t.button('Sign out').props.disabled, true);
  pending.resolve(); await flush(); t.h.unmount();
});

test('unmount prevents late save from updating UI or beginning another persistence action', async () => {
  const t = await openPortal(); t.editTitle('SESSION ENDS');
  const pending = deferred(); t.saveGate = pending;
  t.button('Save').props.onClick(); t.render();
  t.dialogButton('Save draft').props.onClick(); t.render();
  t.h.unmount(); const before = structuredClone(t.h.hooks.filter(slot => slot?.draft || slot?.home));
  pending.resolve(); await flush();
  assert.equal(t.previews, 0, 'no new write is begun after the private UI unmounts');
  // operationRef may release the lock, but no draft/snapshot state is installed.
  assert.deepEqual(t.h.hooks.filter(slot => slot?.draft || slot?.home), before);
  assert.equal(t.h.hooks.some(slot => slot?.revision === 1), false);
});

function setupPreview() {
  const h = harness(), defaults = h.load('src/owner/defaults.ts');
  let raw = defaults.createInitialOwnerWorkspace(), queue = [];
  const listeners = new Set();
  const store = { load: async () => queue.length ? queue.shift() : structuredClone(raw), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const Preview = h.load('src/owner/OwnerSitePreview.tsx').OwnerSitePreview;
  const render = (nextStore = store) => h.render(Preview, { store: nextStore, mode: 'cloud', userEmail: 'owner@example.test', slug: [] });
  return { h, defaults, store, render, listeners, get raw() { return raw; }, set raw(value) { raw = value; }, set queue(value) { queue = value; }, notify() { listeners.forEach(fn => fn()); } };
}
function snapshot(title, defaults) { const value = defaults.createInitialOwnerWorkspace(); value.localPublished = { content: structuredClone(value.draft), publishedAt: '2026-10-25T18:00:00.000Z' }; value.localPublished.content.home.title = 'LEGACY SNAPSHOT'; value.draft.home.title = title; value.updatedAt = '2026-10-25T18:00:00.000Z'; return value; }
function previewContent(tree) { const node = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'SiteContentFrame'); return node?.props.content; }

test('preview displays saved draft instead of legacy snapshot, handles failed reads, and cleans up on unmount', async () => {
  const t = setupPreview(); t.raw.draft.home.title = 'SAVED PRIVATE DRAFT';
  t.render(); await flush(); t.render();
  assert.equal(previewContent(t.h.tree)?.home.title, 'SAVED PRIVATE DRAFT');
  assert.match(content(t.h.tree), /Your starting draft/);
  t.raw = snapshot('PRIVATE PREVIEW', t.defaults); t.notify(); await flush(); t.render();
  assert.equal(previewContent(t.h.tree).home.title, 'PRIVATE PREVIEW');
  t.queue = [Promise.reject(new Error('Permission denied; cloud preview not loaded.'))]; t.notify(); await flush(); t.render();
  assert.match(content(t.h.tree), /Permission denied/); assert.equal(previewContent(t.h.tree), undefined);
  assert.equal(t.listeners.size, 1); t.h.unmount(); assert.equal(t.listeners.size, 0);
});

test('preview hides old session immediately, unsubscribes its store, and ignores stale reads', async () => {
  const t = setupPreview(); t.raw = snapshot('FIRST SESSION SECRET', t.defaults);
  t.render(); await flush(); t.render(); assert.equal(previewContent(t.h.tree).home.title, 'FIRST SESSION SECRET');
  const pending = deferred(); let subscriptions = 0;
  const next = { load: () => pending.promise, subscribe() { subscriptions++; return () => subscriptions--; } };
  t.render(next);
  assert.equal(previewContent(t.h.tree), undefined); assert.match(content(t.h.tree), /Loading your site preview/);
  assert.equal(t.listeners.size, 0); assert.equal(subscriptions, 1);
  t.h.unmount(); pending.resolve(snapshot('LATE SESSION SECRET', t.defaults)); await flush();
  assert.equal(subscriptions, 0);
  assert.equal(t.h.hooks.some(slot => slot?.content?.home?.title === 'LATE SESSION SECRET'), false);
});

test('both routes stay 404 in production before importing owner components', async () => {
  for (const file of ['src/app/owner/page.tsx', 'src/app/owner/preview/[[...slug]]/page.tsx']) {
    const h = harness(); h.process.env.NODE_ENV = 'production';
    const Page = h.load(file).default;
    await assert.rejects(Promise.resolve().then(() => Page({ params: Promise.resolve({ slug: ['prices'] }) })), /MOCK_NOT_FOUND_404/);
    assert.equal([...h.cache.keys()].some(file => /OwnerWorkspaceEntry|OwnerPreviewEntry|FirebaseOwnerGate/.test(file)), false);
  }
});

test('editor and direct preview entrypoints defer all private rendering to the same auth gate', () => {
  for (const file of ['src/owner/OwnerWorkspaceEntry.tsx', 'src/owner/OwnerPreviewEntry.tsx']) {
    const h = harness(); function Gate() { return null; }
    h.overrides['./FirebaseOwnerGate'] = { FirebaseOwnerGate: Gate };
    h.overrides['./HelpButton'] = { HelpButton: () => null };
    h.overrides['./TaylorServices'] = { TaylorServices: () => null };
    h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
    const Entry = h.load(file).default, tree = h.render(Entry, { slug: ['prices'] });
    assert.equal(tree.type, Gate); assert.equal(typeof tree.props.children, 'function');
    assert.equal(h.hooks.length, 0, 'no editor or preview data effects run before authentication');
    const injectedStore = {}; const injectedSignOut = async () => {};
    const protectedChild = tree.props.children({ store: injectedStore, userEmail: 'owner@example.test', signOut: injectedSignOut });
    assert.equal(protectedChild.props.store, injectedStore); assert.equal(protectedChild.props.mode, 'cloud');
    assert.equal(protectedChild.props.userEmail, 'owner@example.test');
  }
});

test('dirty section navigation can cancel, discard only unsaved work, or fail saving without leaving builder', async () => {
  const t = await openPortal(); t.editTitle('DO NOT LOSE');
  t.button('Prices & options').props.onClick(); t.render();
  assert.equal(t.dialog().props.title, 'Save before moving on?');
  t.dialogButton('Keep editing').props.onClick(); t.render();
  assert.equal(t.field('Main heading').props.value, 'DO NOT LOSE');
  t.button('Prices & options').props.onClick(); t.render(); t.failSave = true;
  await t.dialogButton('Save and continue').props.onClick(); t.render();
  assert.equal(t.raw, null); assert.equal(t.field('Main heading').props.value, 'DO NOT LOSE');
  t.button('Prices & options').props.onClick(); t.render();
  t.dialogButton('Discard changes').props.onClick(); t.render();
  assert.ok(t.field('Introductory text')); assert.equal(t.raw, null);
  t.button('Home page').props.onClick(); t.render();
  assert.notEqual(t.field('Main heading').props.value, 'DO NOT LOSE'); t.h.unmount();
});

test('stale saved revision exposes actionable conflict, keeps edits, and requires explicit reload confirmation', async () => {
  const t = await openPortal(); t.editTitle('LOCAL UNSAVED VERSION');
  const other = t.defaults.createInitialOwnerWorkspace(); other.revision = 1; other.updatedAt = new Date().toISOString(); other.draft.home.title = 'OTHER DEVICE VERSION'; t.raw = other;
  t.button('Save').props.onClick(); t.render(); await t.dialogButton('Save draft').props.onClick(); t.render();
  assert.match(content(t.h.tree), /another tab or device/); assert.equal(t.field('Main heading').props.value, 'LOCAL UNSAVED VERSION'); assert.equal(t.raw.draft.home.title, 'OTHER DEVICE VERSION');
  t.dialogButton('Keep editing').props.onClick(); t.render();
  t.button('Reload saved draft').props.onClick(); t.render();
  assert.equal(t.dialog().props.title, 'Reload the saved draft?');
  t.dialogButton('Cancel').props.onClick(); t.render(); assert.equal(t.field('Main heading').props.value, 'LOCAL UNSAVED VERSION');
  t.button('Reload saved draft').props.onClick(); t.render(); t.dialogButton('Reload saved draft').props.onClick(); await flush(); t.render();
  assert.equal(t.field('Main heading').props.value, 'OTHER DEVICE VERSION'); assert.equal(t.raw.revision, 1); t.h.unmount();
});

test('dirty browser unload/back is guarded and cancellation restores saved history location without writing', async () => {
  const t = setupPortal(); t.h.window.location.href = '/taylor'; t.render(); await flush(); t.render(); t.editTitle('DIRTY HISTORY');
  const unload = new Event('beforeunload', { cancelable: true }); Object.defineProperty(unload, 'returnValue', { value: null, writable: true });
  t.h.window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true); assert.equal(unload.returnValue, '');
  let prompts = 0; t.h.window.confirm = () => { prompts++; return false; }; t.h.window.location.href = '/previous';
  t.h.window.dispatchEvent(new Event('popstate')); assert.equal(prompts, 1); assert.equal(t.h.window.location.href, '/taylor'); assert.equal(t.raw, null); assert.equal(t.saves, 0);
  t.h.unmount(); const after = new Event('beforeunload', { cancelable: true }); t.h.window.dispatchEvent(after); assert.equal(after.defaultPrevented, false);
});

test('upload busy locks save, navigation and signout before handlers can change section or persist', async () => {
  const t = await openPortal(); t.editTitle('UPLOADING WORK');
  const provider = t.h.find(node => typeof node.type === 'function' && node.type.name === 'OwnerUploadProvider');
  provider.props.onBusyChange(true); t.render();
  for (const label of ['Save', 'Preview', 'Sign out', 'Prices & options']) assert.equal(t.button(label).props.disabled, true, label);
  t.button('Prices & options').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.field('Main heading').props.value, 'UPLOADING WORK'); assert.equal(t.saves, 0); assert.equal(t.signsOut, 0);
  provider.props.onBusyChange(false); t.render(); assert.equal(t.button('Save').props.disabled, false); t.h.unmount();
});
