import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const photo = { id: '11111111-1111-4111-8111-111111111111', src: '/api/media/11111111-1111-4111-8111-111111111111', name: 'Temporary Trash photo', createdAt: '2026-10-25T00:00:00.000Z', width: 500, height: 300, bytes: 1024, contentType: 'image/webp', storage: 'development-disk', trashedAt: '2026-10-26T00:00:00.000Z', revision: 2 };
const entry = p => ({ id: p.id, trashedAt: p.trashedAt, revision: p.revision ?? 0 });
function setup(options = {}) {
  const h = harness(), calls = [], selected = []; let refreshes = 0;
  const library = { assets: [{ ...photo }], loading: false, error: '', available: true, refresh() { refreshes++; }, add() {}, ...options.library };
  h.overrides['./asset-library-client'] = { usePrivateAssetLibrary: () => library };
  h.overrides['./temporary-photo-client'] = { isStagedPhoto: () => true, emptyTemporaryPhotoTrash(entries, signal) { calls.push({ entries, signal }); return options.empty ? options.empty(entries, signal) : Promise.resolve(entries.map(item => ({ id: item.id, status: 'removed' }))); } };
  const Library = h.load('src/owner/AssetLibrary.tsx').AssetLibrary, render = () => h.render(Library, { manager: true, onSelect: src => selected.push(src) }); render();
  const button = label => h.find(n => n.type === 'button' && (n.props['aria-label'] === label || content(n) === label));
  const dialog = () => h.find(n => n.type?.name === 'Dialog'), action = label => nodes(dialog()?.props.actions).find(n => n.type === 'button' && content(n) === label);
  const open = () => { button(`Trash (${library.assets.filter(photo => photo.trashedAt).length})`).props.onClick(); render(); button('Empty Trash').props.onClick(); render(); };
  return { h, library, calls, selected, render, button, dialog, action, open, get refreshes() { return refreshes; } };
}
test('Empty Trash keeps only a count-bearing permanent title and two explicit actions, without explanatory paragraphs', () => {
  for (const count of [1, 3]) {
    const assets = Array.from({ length: count }, (_, i) => ({ ...photo, id: String(i) }));
    const t = setup({ library: { assets } }); assert.equal(t.button('Empty Trash'), undefined); t.open(); assert.equal(t.calls.length, 0);
    const expected = `Permanently remove ${count} ${count === 1 ? 'entry' : 'entries'}`;
    assert.equal(t.dialog().props.title, `${expected}?`);
    assert.equal(content(t.dialog()), '', 'no informational body remains');
    assert.deepEqual(nodes(t.dialog().props.actions).filter(n => n.type === 'button').map(content), ['Cancel', expected]);
    assert.doesNotMatch(t.dialog().props.title + content(t.dialog().props.actions), /—/);
    assert.ok(t.action(expected).props.className.includes('danger')); t.h.unmount();
  }
});
test('Cancel and Close leave Trash, selected photo and all references unchanged, without an API call', () => {
  const t = setup(); t.open(); t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); t.button('Empty Trash').props.onClick(); t.render(); t.dialog().props.onClose(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.calls.length, 0); assert.deepEqual(t.library.assets, [photo]); assert.deepEqual(t.selected, []); assert.equal(t.refreshes, 0); t.h.unmount();
});
test('repeated confirmation clicks cause one request; dismissal stays disabled until confirmation returns', async () => {
  const gate = deferred(), t = setup({ empty: () => gate.promise }); t.open(); const confirm = t.action('Permanently remove 1 entry'); confirm.props.onClick(); confirm.props.onClick(); t.render();
  assert.equal(t.calls.length, 1); assert.equal(t.dialog().props.dismissDisabled, true); assert.equal(t.action('Cancel').props.disabled, true); assert.equal(t.action('Emptying Trash…').props['aria-busy'], true); assert.equal(t.dialog().props.title, 'Permanently remove 1 entry?'); t.dialog().props.onClose(); t.render(); assert.ok(t.dialog()); assert.deepEqual(t.calls[0].entries, [entry(photo)]);
  gate.resolve([{ id: photo.id, status: 'removed' }]); await flush(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.refreshes, 1); assert.match(content(t.h.tree), /1 entry permanently removed/); assert.match(content(t.h.tree), /All image files remain/); assert.deepEqual(t.selected, []); assert.equal(t.h.focusLog.at(-1), 'Trash (1)'); t.h.unmount();
});
test('confirmation keeps its original snapshot and cannot sweep in photos trashed afterwards', async () => {
  const t = setup(); t.open(); const second = { ...photo, id: '22222222-2222-4222-8222-222222222222', revision: 1 }; t.library.assets.push(second); t.render(); assert.ok(t.action('Permanently remove 1 entry')); t.action('Permanently remove 1 entry').props.onClick(); await flush();
  assert.deepEqual(t.calls[0].entries, [entry(photo)]); t.h.unmount();
});
test('partial failures and changed entries are counted honestly, not reported as emptied or restored', async () => {
  const second = { ...photo, id: '22222222-2222-4222-8222-222222222222' }, third = { ...photo, id: '33333333-3333-4333-8333-333333333333' };
  const t = setup({ library: { assets: [photo, second, third] }, empty: async () => [{ id: photo.id, status: 'removed' }, { id: second.id, status: 'changed' }, { id: third.id, status: 'failed' }] }); t.open(); t.action('Permanently remove 3 entries').props.onClick(); await flush(); t.render();
  assert.match(content(t.h.tree), /1 entry permanently removed/); assert.match(content(t.h.tree), /1 entry changed since confirmation and was left untouched/); assert.match(content(t.h.tree), /1 could not be removed/); assert.doesNotMatch(content(t.h.tree), /Trash is empty/);
  t.library.assets = []; t.render(); assert.match(content(t.h.tree), /previous removal was not confirmed/); assert.doesNotMatch(content(t.h.tree), /Trash is empty/); t.h.unmount();
});
test('ambiguous network failure refreshes status and remains retryable without success or a false-empty claim', async () => {
  const t = setup({ empty: async () => { throw Error('Connection interrupted'); } }); t.open(); t.action('Permanently remove 1 entry').props.onClick(); await flush(); t.render();
  assert.ok(t.dialog()); assert.ok(nodes(t.dialog()).some(n => n.props.role === 'alert')); assert.match(content(t.dialog()), /Connection interrupted/); assert.match(content(t.dialog()), /Some entries may already have been removed/); assert.equal(t.action('Permanently remove 1 entry').props.disabled, false); assert.equal(t.refreshes, 1);
  t.library.assets = []; t.action('Cancel').props.onClick(); t.render(); assert.doesNotMatch(content(t.h.tree), /Trash is empty/); t.h.unmount();
});
test('unmount aborts removal and ignores late confirmation', async () => {
  const gate = deferred(), t = setup({ empty: () => gate.promise }); t.open(); t.action('Permanently remove 1 entry').props.onClick(); t.h.unmount(); assert.equal(t.calls[0].signal.aborted, true); gate.resolve([{ id: photo.id, status: 'removed' }]); await flush(); assert.equal(t.refreshes, 0);
});
for (const [label, change] of [['empty', { assets: [] }], ['loading', { loading: true }], ['stale/error', { error: 'Not confirmed' }]]) test(`Empty Trash cannot be confirmed for ${label} library`, () => {
  const t = setup({ library: change }); t.button(`Trash (${t.library.assets.length})`).props.onClick(); t.render(); assert.equal(t.button('Empty Trash').props.disabled, true); assert.equal(t.dialog(), undefined); t.h.unmount();
});
test('unavailable storage never offers Empty Trash', () => { const t = setup({ library: { available: false } }); t.button('Trash (1)').props.onClick(); t.render(); assert.equal(t.button('Empty Trash'), undefined); t.h.unmount(); });
function clientSetup(fetcher) {
  const h = harness(), requests = []; let current = true;
  h.overrides['./taylor-services-client'] = { taylorOwnerSession: async () => ({ token: 'private-fixture-token', assertCurrent() { if (!current) throw Error('Owner session changed'); } }), responseObject: async response => response.json() };
  h.globals.fetch = async (url, options) => { requests.push({ url, options }); return fetcher(url, options); };
  const client = h.load('src/owner/temporary-photo-client.ts'); return { h, requests, client, invalidate() { current = false; } };
}
const acknowledged = entries => Response.json({ ok: true, filesRetained: true, outcomes: entries.map(e => ({ id: e.id, status: 'removed' })) });
test('client sends exact ID/timestamp/revision snapshot, owner token only in header, no image bytes, and no-store', async () => {
  const t = clientSetup((url, options) => acknowledged(JSON.parse(options.body).entries)); assert.deepEqual(await t.client.emptyTemporaryPhotoTrash([entry(photo)]), [{ id: photo.id, status: 'removed' }]);
  const { url, options } = t.requests[0]; assert.equal(url, '/api/taylor/media'); assert.equal(options.method, 'DELETE'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.headers.Authorization, 'Bearer private-fixture-token'); assert.deepEqual(JSON.parse(options.body), { action: 'empty-trash', entries: [entry(photo)] }); t.h.unmount();
});
test('large confirmations are bounded to 100 entries per request without imposing a library count limit', async () => {
  const t = clientSetup((url, options) => acknowledged(JSON.parse(options.body).entries)); const entries = Array.from({ length: 205 }, (_, i) => ({ ...entry(photo), id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  const result = await t.client.emptyTemporaryPhotoTrash(entries); assert.equal(result.length, 205); assert.deepEqual(t.requests.map(r => JSON.parse(r.options.body).entries.length), [100, 100, 5]); assert.deepEqual(t.requests.flatMap(r => JSON.parse(r.options.body).entries), entries); t.h.unmount();
});
test('client never accepts missing, foreign, duplicate, reordered, unknown-status or file-purge acknowledgements', async () => {
  for (const body of [{ filesRetained: false, outcomes: [{ id: photo.id, status: 'removed' }] }, { filesRetained: true, outcomes: [] }, { filesRetained: true, outcomes: [{ id: 'foreign', status: 'removed' }] }, { filesRetained: true, outcomes: [{ id: photo.id, status: 'success' }] }, { filesRetained: true, outcomes: [{ id: photo.id, status: ['removed'] }] }]) {
    const t = clientSetup(() => Response.json(body)); await assert.rejects(t.client.emptyTemporaryPhotoTrash([entry(photo)]), /did not confirm/); t.h.unmount();
  }
});
test('owner changes and aborted requests cannot be reported as confirmed success', async () => {
  let t; t = clientSetup((url, options) => { t.invalidate(); return acknowledged(JSON.parse(options.body).entries); }); await assert.rejects(t.client.emptyTemporaryPhotoTrash([entry(photo)]), /Owner session changed/); t.h.unmount();
  const aborted = clientSetup(() => { throw Error('must not fetch'); }), controller = new AbortController(); controller.abort(); await assert.rejects(aborted.client.emptyTemporaryPhotoTrash([entry(photo)], controller.signal), e => e.name === 'AbortError'); assert.equal(aborted.requests.length, 0); aborted.h.unmount();
});
test('invalid/duplicate/path requests are rejected locally before authentication or network', async () => {
  const t = clientSetup(() => { throw Error('must not fetch'); }); for (const entries of [[], [entry(photo), entry(photo)], [{ ...entry(photo), id: '../outside' }], [{ ...entry(photo), trashedAt: 'invalid' }], [{ ...entry(photo), revision: -1 }]]) await assert.rejects(t.client.emptyTemporaryPhotoTrash(entries), /valid temporary Trash/); assert.equal(t.requests.length, 0); t.h.unmount();
});

test('multi-entry acknowledgement cannot reorder or duplicate a confirmed ID', async () => {
  const second = { ...entry(photo), id: '22222222-2222-4222-8222-222222222222' };
  for (const ids of [[second.id, photo.id], [photo.id, photo.id]]) {
    const t = clientSetup(() => Response.json({ filesRetained: true, outcomes: ids.map(id => ({ id, status: 'removed' })) }));
    await assert.rejects(t.client.emptyTemporaryPhotoTrash([entry(photo), second]), /did not confirm/); t.h.unmount();
  }
});
test('a later batch network failure refreshes other pickers and stops before sending any additional batch', async () => {
  const t = clientSetup((url, options) => { if (t.requests.length === 2) throw Error('fixture lost connection'); return acknowledged(JSON.parse(options.body).entries); });
  const entries = Array.from({ length: 205 }, (_, i) => ({ ...entry(photo), id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  let invalidations = 0; t.h.window.addEventListener('tmc-private-library-changed', () => invalidations++);
  await assert.rejects(t.client.emptyTemporaryPhotoTrash(entries), /lost connection/); assert.equal(t.requests.length, 2); assert.equal(invalidations, 1); t.h.unmount();
});
