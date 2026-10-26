import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const photo = { id: '11111111-1111-4111-8111-111111111111', src: '/api/media/11111111-1111-4111-8111-111111111111', name: 'Private temporary photo', createdAt: '2026-10-25T00:00:00.000Z', width: 500, height: 300, bytes: 1024, contentType: 'image/webp', storage: 'development-disk', trashedAt: null };
function setup(options = {}) {
  const h = harness(), selected = [], calls = [], added = [];
  const library = { assets: [{ ...photo }], loading: false, error: '', available: true, refresh() {}, add(asset) { added.push(asset); this.assets = [asset, ...this.assets.filter(item => item.id !== asset.id)]; }, ...options.library };
  h.overrides['./asset-library-client'] = { usePrivateAssetLibrary: () => library };
  h.overrides['./temporary-photo-client'] = { isStagedPhoto: () => true, async changeTemporaryPhotoTrash(id, action, signal) { calls.push({ id, action, signal }); return options.change ? options.change(id, action, signal) : { ...photo, trashedAt: action === 'trash' ? '2026-10-26T00:00:00.000Z' : null }; } };
  const Library = h.load('src/owner/AssetLibrary.tsx').LegacyAssetLibrary;
  const render = () => h.render(Library, { selected: photo.src, onSelect: value => selected.push(value), ...options.props });
  render();
  const button = label => h.find(n => n.type === 'button' && (n.props['aria-label'] === label || content(n) === label));
  const dialog = () => h.find(n => n.type?.name === 'Dialog');
  const action = label => nodes(dialog().props.actions).find(n => n.type === 'button' && content(n) === label);
  return { h, library, selected, calls, added, render, button, dialog, action };
}
test('View opens the full-image dialog and close returns to unchanged chooser; explicit Use photo still works', () => {
  const t = setup(); t.button(`View photo: ${photo.name}`).props.onClick(); t.render();
  const viewer = t.h.find(n => n.type?.name === 'TemporaryPhotoView'); assert.equal(viewer.props.photo.src, photo.src); assert.deepEqual(t.selected, []);
  viewer.props.onClose(); t.render(); assert.equal(t.h.find(n => n.type?.name === 'TemporaryPhotoView'), undefined);
  t.button(`Use photo: ${photo.name}`).props.onClick(); assert.deepEqual(t.selected, [photo.src]); t.h.unmount();
});
test('Delete opens a clear recoverable confirmation; Cancel and dismissal do not mutate metadata or references', () => {
  const t = setup(); t.button(`Delete photo: ${photo.name}`).props.onClick(); t.render();
  assert.match(content(t.dialog()), /image file is kept/); assert.match(content(t.dialog()), /No gallery entries are removed/);
  t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.calls.length, 0);
  t.button(`Delete photo: ${photo.name}`).props.onClick(); t.render(); t.dialog().props.onClose(); t.render(); assert.equal(t.dialog(), undefined);
  assert.deepEqual(t.selected, []); assert.equal(t.library.assets[0].src, photo.src); t.h.unmount();
});
test('Trash waits for confirmation, ignores repeated clicks, hides chooser item, focuses Photos, and retains URL', async () => {
  const gate = deferred(), t = setup({ change: () => gate.promise });
  t.button(`Delete photo: ${photo.name}`).props.onClick(); t.render(); const confirm = t.action('Move to Trash'); confirm.props.onClick(); confirm.props.onClick(); t.render();
  assert.equal(t.calls.length, 1); assert.equal(t.dialog().props.dismissDisabled, true); assert.equal(t.library.assets[0].trashedAt, null); assert.deepEqual(t.selected, []);
  gate.resolve({ ...photo, trashedAt: '2026-10-26T00:00:00.000Z' }); await flush(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.button(`Use photo: ${photo.name}`), undefined); assert.equal(t.library.assets[0].src, photo.src); assert.deepEqual(t.selected, []);
  assert.match(content(t.h.tree), /Existing page photos are unchanged/); assert.equal(t.h.focusLog.at(-1), 'Photos (0)'); t.h.unmount();
});
test('Trash shows View, Restore and safely scoped Empty Trash; restore returns item to chooser', async () => {
  const t = setup({ library: { assets: [{ ...photo, trashedAt: '2026-10-26T00:00:00.000Z' }] } });
  t.button('Trash (1)').props.onClick(); t.render(); assert.ok(t.button(`View photo: ${photo.name}`)); assert.equal(t.button(`Use photo: ${photo.name}`), undefined); assert.equal(t.button(`Delete photo: ${photo.name}`), undefined);
  assert.match(content(t.h.tree), /Empty Trash permanently removes library entries/); assert.match(content(t.h.tree), /does not free disk space/); t.button(`Restore photo: ${photo.name}`).props.onClick(); await flush(); t.render();
  assert.deepEqual(t.calls.map(call => call.action), ['restore']); assert.equal(t.library.assets[0].trashedAt, null); assert.equal(t.h.focusLog.at(-1), 'Trash (0)');
  t.button('Photos (1)').props.onClick(); t.render(); assert.ok(t.button(`Use photo: ${photo.name}`)); assert.deepEqual(t.selected, []); t.h.unmount();
});
test('failed Trash remains reviewable/retryable and never falsely reports deletion', async () => {
  const t = setup({ change: async () => { throw new Error('Disk change not confirmed'); } }); t.button(`Delete photo: ${photo.name}`).props.onClick(); t.render(); t.action('Move to Trash').props.onClick(); await flush(); t.render();
  assert.ok(t.dialog()); assert.match(content(t.dialog()), /Disk change not confirmed/); assert.equal(t.action('Move to Trash').props.disabled, false); assert.equal(t.added.length, 0); assert.equal(t.library.assets[0].trashedAt, null); t.h.unmount();
});
test('unmount aborts pending Trash and ignores late confirmation', async () => {
  const gate = deferred(), t = setup({ change: () => gate.promise }); t.button(`Delete photo: ${photo.name}`).props.onClick(); t.render(); t.action('Move to Trash').props.onClick(); t.h.unmount(); assert.equal(t.calls[0].signal.aborted, true);
  gate.resolve({ ...photo, trashedAt: '2026-10-26T00:00:00.000Z' }); await flush(); assert.equal(t.added.length, 0);
});
test('File Hub removes legacy presentation without deleting legacy files or disabling their readers', () => {
  const h = harness(), Hub = h.load('src/owner/TemporaryFileHub.tsx').TemporaryFileHub; h.render(Hub);
  assert.doesNotMatch(content(h.tree), /Shared files, private by default|Temporary development-server photos/); assert.equal(h.find(n => n.type?.name === 'AssetLibrary').props.manager, true); assert.doesNotMatch(content(h.tree), /home.drive|2 TB|8 TB/i); h.unmount();
  const assetSource = readFileSync(new URL('../src/owner/AssetLibrary.tsx', import.meta.url), 'utf8'); assert.match(assetSource, /return <CloudFileHub \{\.\.\.props\} \/>/); assert.match(assetSource, /export function LegacyAssetLibrary/);
  const t = setup({ props: { manager: true, onSelect: undefined } }); assert.equal(t.button(`Use photo: ${photo.name}`), undefined); assert.equal(t.h.find(n => n.type?.name === 'PhotoUpload').props.libraryOnly, true); t.button('List').props.onClick(); t.render(); assert.match(t.h.find(n => n.type === 'ul').props.className, /detailsList/); assert.equal(t.button('List').props['aria-pressed'], true); t.button('Grid').props.onClick(); t.render(); assert.doesNotMatch(t.h.find(n => n.type === 'ul').props.className, /detailsList/); t.h.unmount();
});
test('unavailable hosted library hides upload controls and never shows fake cloud success', () => {
  const t = setup({ library: { assets: [], available: false, error: 'Production storage has not been configured.' }, props: { manager: true, onSelect: undefined } });
  assert.equal(t.h.find(n => n.type?.name === 'PhotoUpload'), undefined); assert.match(content(t.h.tree), /Production storage has not been configured/); assert.equal(t.h.all(n => n.type === 'li').length, 0); t.h.unmount();
});
test('hover actions have keyboard focus-within and default visible touch controls, with reduced-motion support', () => {
  const css = readFileSync(new URL('../src/owner/AssetLibrary.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.photoActions\{[^}]*opacity:1/); assert.match(css, /@media\(hover:hover\) and \(pointer:fine\)/); assert.match(css, /\.item:focus-within \.photoActions\{opacity:1/); assert.match(css, /prefers-reduced-motion:reduce/);
});
test('full-image viewer uses authenticated media hook and accessible native dialog with close action', () => {
  const h = harness(); let requested; h.overrides['./media-client'] = { useOwnerMediaSource(src) { requested = src; return { src: 'blob:private-view', error: null }; } };
  const View = h.load('src/owner/TemporaryPhotoView.tsx').TemporaryPhotoView; let closed = 0; h.render(View, { photo, onClose() { closed++; } });
  assert.equal(requested, photo.src); assert.equal(h.find(n => n.type === 'Image').props.src, 'blob:private-view'); assert.equal(h.tree.props.wide, true); assert.equal(h.tree.props.title, photo.name); h.tree.props.actions.props.onClick(); assert.equal(closed, 1); h.unmount();
});
test('native viewer dialog handles Escape, backdrop and focus restoration without changing the URL', () => {
  const h = harness(), Dialog = h.load('src/owner/OwnerDialog.tsx').Dialog; let closed = 0, focused = 0;
  // Obtain a real harness HTMLElement as the opener.
  const ref = { current: null }; h.render(() => ({ type: 'button', props: { ref, children: 'View' } })); ref.current.focus(); const opener = ref.current; opener.focus = () => focused++; h.document.activeElement = opener;
  h.render(Dialog, { title: photo.name, children: 'Full photo', actions: 'Close photo', onClose() { closed++; } }); const dialog = h.find(n => n.type === 'dialog'); let prevented = 0;
  dialog.props.onCancel({ preventDefault() { prevented++; } }); assert.equal(closed, 1); assert.equal(prevented, 1);
  const target = { getBoundingClientRect: () => ({ left: 10, right: 100, top: 10, bottom: 100 }) }; const outside = { target, currentTarget: target, clientX: 0, clientY: 0 }; dialog.props.onPointerDown(outside); dialog.props.onClick(outside); assert.equal(closed, 2);
  assert.equal(h.window.location.href, ''); h.unmount(); assert.equal(focused, 1);
});
function hookSetup(fetcher) {
  const h = harness(), requests = []; let valid = true;
  h.overrides['./taylor-services-client'] = { taylorOwnerSession: async () => ({ token: 'private-token', assertCurrent() { if (!valid) throw Error('Owner changed'); }, auth: { onAuthStateChanged() { return () => {}; } } }), responseObject: async response => response.json() };
  h.globals.fetch = async (url, options) => { requests.push({ url, options }); return fetcher(url, options); };
  const exports = h.load('src/owner/asset-library-client.ts'), validate = value => Boolean(value && typeof value.id === 'string'); let result;
  const Probe = () => { result = exports.usePrivateAssetLibrary('/api/taylor/media?trash=1', 'photos', validate); return null; };
  return { h, requests, exports, render() { h.render(Probe); return result; }, get result() { return result; }, invalidate() { valid = false; } };
}
test('refresh replaces removed metadata instead of resurrecting it; same-endpoint events refresh all pickers', async () => {
  let records = [photo]; const t = hookSetup(async () => new Response(JSON.stringify({ ok: true, photos: records, available: true })));
  t.render(); await flush(); t.render(); assert.equal(t.result.assets.length, 1);
  records = []; t.exports.notifyPrivateAssetLibraryChanged('/api/taylor/media'); t.render(); await flush(); t.render(); assert.deepEqual(t.result.assets, []); assert.equal(t.requests.length, 2); t.h.unmount();
});
test('new upload invalidates an older snapshot immediately and focus refreshes cross-tab changes', async () => {
  const gate = deferred(); let calls = 0; const t = hookSetup(async () => ++calls === 1 ? gate.promise : new Response(JSON.stringify({ ok: true, photos: [photo], available: true })));
  t.render(); await flush(); t.result.add(photo); gate.resolve(new Response(JSON.stringify({ ok: true, photos: [], available: true }))); await flush(); t.render(); await flush(); t.render(); assert.equal(t.result.assets.length, 1);
  t.h.window.dispatchEvent(new Event('focus')); t.render(); await flush(); t.render(); assert.equal(calls, 3); t.h.unmount();
});
test('Trash request is authenticated, no-store, confirmation-validated, and never sends image bytes or token URL', async () => {
  const h = harness(), requests = []; h.overrides['./taylor-services-client'] = { taylorOwnerSession: async () => ({ token: 'secret-token', assertCurrent() {} }), responseObject: async response => response.json() }; h.globals.fetch = async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ ok: true, media: { ...photo, trashedAt: '2026-10-26T00:00:00.000Z' } })); };
  const { changeTemporaryPhotoTrash } = h.load('src/owner/temporary-photo-client.ts'); const result = await changeTemporaryPhotoTrash(photo.id, 'trash'); assert.ok(result.trashedAt);
  assert.equal(requests[0].url, '/api/taylor/media'); assert.equal(requests[0].options.method, 'PATCH'); assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token'); assert.equal(requests[0].options.cache, 'no-store'); assert.deepEqual(JSON.parse(requests[0].options.body), { id: photo.id, action: 'trash' });
  await assert.rejects(changeTemporaryPhotoTrash('../private', 'trash'), /valid temporary photo/); await assert.rejects(changeTemporaryPhotoTrash(photo.id, 'restore'), /did not confirm/); h.unmount();
});
