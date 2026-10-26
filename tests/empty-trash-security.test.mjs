import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';
const load = sourceLoader(), media = load('src/server/dev-media.ts'), auth = load('src/server/taylor-auth.ts'), sharp = appRequire('sharp');
const keys = ['NODE_ENV', 'VERCEL', 'TMC_DEV_MEDIA_ENABLED', 'TMC_DEV_MEDIA_DIR'], initial = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let root, png;
before(async () => { root = await fs.mkdtemp(resolve('empty-trash-fixture-')); png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#3a4587' } }).png().toBuffer(); });
beforeEach(() => { process.env.NODE_ENV = 'development'; delete process.env.VERCEL; delete process.env.TMC_DEV_MEDIA_ENABLED; process.env.TMC_DEV_MEDIA_DIR = join(root, randomUUID()); });
after(async () => { for (const key of keys) if (initial[key] === undefined) delete process.env[key]; else process.env[key] = initial[key]; await fs.rm(root, { recursive: true, force: true }); });
const save = () => media.storeDevelopmentMedia(png, 'image/png', 'Empty Trash fixture');
const trash = async () => media.setDevelopmentMediaTrash((await save()).id, 'trash');
const entry = photo => ({ id: photo.id, trashedAt: photo.trashedAt, revision: photo.revision ?? 0 });
const metadata = id => join(process.env.TMC_DEV_MEDIA_DIR, `${id}.photo.json`);
const request = (entries, headers = {}, raw) => new Request('http://localhost/api/taylor/media', { method: 'DELETE', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...headers }, body: raw === undefined ? JSON.stringify({ action: 'empty-trash', entries }) : raw });
const route = (verify = async () => ({ uid: auth.TAYLOR_OWNER_UID }), adapter = media) => sourceLoader({ '@/server/taylor-auth': { ...auth, verifyTaylorOwner: verify }, '@/server/dev-media': adapter })('src/app/api/taylor/media/route.ts');

test('confirmed Empty Trash permanently removes only library entries, retains bytes, and cannot be restored', async () => {
  const a = await trash(), b = await save(), bytes = await media.readDevelopmentMedia(a.id);
  const response = await route().DELETE(request([entry(a)])); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(response.headers.get('vary'), 'Authorization');
  assert.deepEqual(await response.json(), { ok: true, outcomes: [{ id: a.id, status: 'removed' }], filesRetained: true });
  assert.deepEqual((await media.listDevelopmentMedia(true)).map(photo => photo.id), [b.id]); assert.deepEqual(await media.readDevelopmentMedia(a.id), bytes);
  for (const action of ['trash', 'restore']) await assert.rejects(media.setDevelopmentMediaTrash(a.id, action), e => e.status === 409);
  const tombstone = JSON.parse(await fs.readFile(metadata(a.id), 'utf8')); assert.ok(tombstone.emptiedAt); assert.equal(tombstone.src, a.src); assert.equal((await fs.stat(metadata(a.id))).mode & 0o777, 0o600);
});
test('repeat is idempotent and unknown/missing records are failed, not falsely reported removed or empty', async () => {
  const a = await trash(); await media.emptyDevelopmentMediaTrash([entry(a)]); const before = await fs.readFile(metadata(a.id));
  const missing = randomUUID();
  assert.deepEqual(await media.emptyDevelopmentMediaTrash([entry(a), { ...entry(a), id: missing }]), [{ id: a.id, status: 'already-removed' }, { id: missing, status: 'failed' }]);
  assert.deepEqual(await fs.readFile(metadata(a.id)), before);

});
test('only the confirmed snapshot is affected; later arrivals and restored/retrashed versions survive even with identical timestamps', async () => {
  const a = await trash(), confirmed = entry(a), b = await trash();
  await media.setDevelopmentMediaTrash(a.id, 'restore'); const retrash = await media.setDevelopmentMediaTrash(a.id, 'trash');
  await fs.writeFile(metadata(a.id), JSON.stringify({ ...retrash, trashedAt: a.trashedAt }));
  assert.deepEqual(await media.emptyDevelopmentMediaTrash([confirmed]), [{ id: a.id, status: 'changed' }]);
  assert.deepEqual(new Set((await media.listDevelopmentMedia(true)).map(photo => photo.id)), new Set([a.id, b.id]));
  await media.setDevelopmentMediaTrash(a.id, 'restore'); assert.equal((await media.emptyDevelopmentMediaTrash([entry(retrash)]))[0].status, 'changed');
});
test('legacy trash without revisions is safely emptied without breaking draft, page, gallery, named-draft or public references', async () => {
  const a = await trash(); const legacy = { ...a }; delete legacy.revision; await fs.writeFile(metadata(a.id), JSON.stringify(legacy));
  const content = load('src/owner/defaults.ts').createDefaultOwnerContent(); content.home.image.src = a.src; content.gallery[0].src = a.src;
  const model = load('src/owner/model.ts'), published = model.createPublishedOwnerSnapshot(content, 1), namedDraft = { name: 'Private named draft', content: structuredClone(content) }, before = JSON.stringify({ content, published, namedDraft });
  await media.emptyDevelopmentMediaTrash([entry(legacy)]); assert.equal(JSON.stringify({ content, published, namedDraft }), before); assert.equal(media.publicContentReferencesMedia(published.content, a.src), true);
  const imageRoute = sourceLoader({ '@/server/taylor-auth': { ...auth, verifyTaylorOwner: async () => ({ uid: auth.TAYLOR_OWNER_UID }) }, '@/server/dev-media': media, '@/server/published-site': { readPublishedSite: async () => ({ status: 'published', snapshot: published }) } })('src/app/api/media/[id]/route.ts');
  for (const headers of [{}, { authorization: 'Bearer private-owner-fixture' }]) { const response = await imageRoute.GET(new Request(`http://localhost${a.src}`, { headers }), { params: Promise.resolve({ id: a.id }) }); assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), await media.readDevelopmentMedia(a.id)); }
});
for (const status of [401, 403]) test(`Empty Trash denies ${status} before body parsing or disk access`, async () => {
  let touched = 0; const r = route(async () => { throw new auth.TaylorApiError(status, 'Denied'); }, { ...media, readEmptyMediaTrashRequest: async () => { touched++; }, emptyDevelopmentMediaTrash: async () => { touched++; } });
  assert.equal((await r.DELETE(request([], {}, 'not json'))).status, status); assert.equal(touched, 0);
});
test('real signed wrong UID is rejected and exact owner accepted, with all certificate/network requests locally mocked', async () => {
  const jose = appRequire('jose'), pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), jwtAuth = sourceLoader({ jose: { ...jose, importX509: async () => pair.publicKey } })('src/server/taylor-auth.ts');
  const now = Math.floor(Date.now() / 1000), token = uid => new jose.SignJWT({ aud: jwtAuth.TAYLOR_PROJECT_ID, iss: `https://securetoken.google.com/${jwtAuth.TAYLOR_PROJECT_ID}`, sub: uid, iat: now - 10, auth_time: now - 20, exp: now + 300 }).setProtectedHeader({ alg: 'RS256', kid: 'empty-fixture' }).sign(pair.privateKey);
  const a = await trash(), r = sourceLoader({ '@/server/taylor-auth': jwtAuth, '@/server/dev-media': media })('src/app/api/taylor/media/route.ts'), previous = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(url, 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'); return Response.json({ 'empty-fixture': '-----BEGIN CERTIFICATE-----\nlocal-only\n-----END CERTIFICATE-----' }); };
  try { assert.equal((await r.DELETE(request([entry(a)], { authorization: `Bearer ${await token('wrong-owner')}` }))).status, 403); assert.equal((await media.listDevelopmentMedia(true)).length, 1); assert.equal((await r.DELETE(request([entry(a)], { authorization: `Bearer ${await token(jwtAuth.TAYLOR_OWNER_UID)}` }))).status, 200); } finally { globalThis.fetch = previous; }
});
for (const disable of [() => process.env.NODE_ENV = 'production', () => process.env.VERCEL = '1', () => process.env.TMC_DEV_MEDIA_ENABLED = 'false']) test('production/unavailable storage fails before reading a removal request', async () => {
  disable(); let touched = 0; const r = route(undefined, { ...media, readEmptyMediaTrashRequest: async () => { touched++; }, emptyDevelopmentMediaTrash: async () => { touched++; } });
  assert.equal((await r.DELETE(request([]))).status, 503); assert.equal(touched, 0); await assert.rejects(media.emptyDevelopmentMediaTrash([]), e => e.status === 503);
});
test('strict confirmation rejects unscoped purge, paths, duplicates, unknown fields, bad dates/revisions, and oversized entry lists', async () => {
  const a = await trash(), valid = entry(a), before = await fs.readFile(metadata(a.id)), r = route();
  const invalid = [null, [], {}, { action: 'empty-trash' }, { action: 'purge', entries: [valid] }, { action: 'empty-trash', entries: [valid], all: true }, { action: 'empty-trash', entries: [] }, ...[[{ ...valid, id: '../outside' }], [{ ...valid, path: '/outside' }], [{ id: a.id, trashedAt: a.trashedAt }], [{ ...valid, revision: -1 }], [{ ...valid, revision: 1.5 }], [{ ...valid, trashedAt: 'yesterday' }], [valid, valid], Array.from({ length: 101 }, () => ({ ...valid, id: randomUUID() }))].map(entries => ({ action: 'empty-trash', entries }))];
  for (const body of invalid) assert.equal((await r.DELETE(request([], {}, JSON.stringify(body)))).status, 400, JSON.stringify(body));
  for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await r.DELETE(request([valid], headers))).status, 403);
  assert.equal((await r.DELETE(request([valid], { 'content-type': 'text/plain' }))).status, 415); assert.deepEqual(await fs.readFile(metadata(a.id)), before);
});
test('Empty Trash enforces declared and actual size, complete body and cancellation', async () => {
  for (const length of ['-1', 'NaN', '16385']) await assert.rejects(media.readEmptyMediaTrashRequest(request([], { 'content-length': length })), e => e.status === 413);
  await assert.rejects(media.readEmptyMediaTrashRequest(request([], { 'content-length': '1' })), e => e.status === 400);
  let canceled = false; const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16385)); }, cancel() { canceled = true; } });
  await assert.rejects(media.readEmptyMediaTrashRequest(new Request('http://localhost/api/taylor/media', { method: 'DELETE', duplex: 'half', headers: { 'content-type': 'application/json' }, body })), e => e.status === 413); assert.equal(canceled, true);
});
test('per-entry disk failure is explicit, preserves failed entry and bytes, and allows retry without false all-empty success', async () => {
  const a = await trash(), b = await trash(), before = await fs.readFile(metadata(a.id));
  const adapter = sourceLoader({ 'node:fs/promises': { ...fs, rename: async (from, to) => { if (to === metadata(a.id)) throw Error('fixture disk failure'); return fs.rename(from, to); } } })('src/server/dev-media.ts');
  assert.deepEqual(await adapter.emptyDevelopmentMediaTrash([entry(a), entry(b)]), [{ id: a.id, status: 'failed' }, { id: b.id, status: 'removed' }]);
  assert.deepEqual(await fs.readFile(metadata(a.id)), before); assert.deepEqual((await media.listDevelopmentMedia(true)).map(photo => photo.id), [a.id]); assert.ok(await media.readDevelopmentMedia(b.id));
  assert.equal((await media.emptyDevelopmentMediaTrash([entry(a)]))[0].status, 'removed'); assert.ok((await fs.readdir(process.env.TMC_DEV_MEDIA_DIR)).every(name => !name.endsWith('.tmp') && !name.endsWith('.lock')));
});
test('Restore and Empty Trash share the same queue; whichever wins cannot be undone by a stale other action', async () => {
  const a = await trash(); let enter, release; const entered = new Promise(r => enter = r), gate = new Promise(r => release = r);
  const adapter = sourceLoader({ 'node:fs/promises': { ...fs, rename: async (...args) => { enter(); await gate; return fs.rename(...args); } } })('src/server/dev-media.ts');
  const restore = adapter.setDevelopmentMediaTrash(a.id, 'restore'); await entered; const empty = adapter.emptyDevelopmentMediaTrash([entry(a)]); release(); await restore; assert.equal((await empty)[0].status, 'changed');
  const b = await trash(); await media.emptyDevelopmentMediaTrash([entry(b)]); await assert.rejects(media.setDevelopmentMediaTrash(b.id, 'restore'), e => e.status === 409); assert.equal((await media.listDevelopmentMedia(true))[0].id, a.id);
});
test('cross-process lock, symlink sidecar and symlink bytes all fail closed without modifying targets', async () => {
  const a = await trash(), lock = join(process.env.TMC_DEV_MEDIA_DIR, `${a.id}.photo.lock`), outside = join(root, randomUUID()); await fs.writeFile(outside, JSON.stringify(a)); await fs.symlink(outside, lock);
  assert.equal((await media.emptyDevelopmentMediaTrash([entry(a)]))[0].status, 'failed'); assert.equal((await fs.lstat(lock)).isSymbolicLink(), true); await fs.rm(lock);
  await fs.rm(metadata(a.id)); await fs.symlink(outside, metadata(a.id)); assert.equal((await media.emptyDevelopmentMediaTrash([entry(a)]))[0].status, 'failed'); assert.equal(await fs.readFile(outside, 'utf8'), JSON.stringify(a));
  await fs.rm(metadata(a.id)); await fs.writeFile(metadata(a.id), JSON.stringify(a)); const bytes = join(process.env.TMC_DEV_MEDIA_DIR, `${a.id}.webp`), original = await fs.readFile(bytes), externalBytes = join(root, randomUUID()); await fs.writeFile(externalBytes, original); await fs.rm(bytes); await fs.symlink(externalBytes, bytes); assert.equal((await media.emptyDevelopmentMediaTrash([entry(a)]))[0].status, 'failed'); assert.deepEqual(await fs.readFile(externalBytes), original);
});
test('missing, corrupt or malformed tombstones never silently acknowledge success', async () => {
  const a = await trash(); for (const changes of [{ emptiedAt: 'bad-date' }, { emptiedAt: new Date().toISOString(), trashedAt: null }, { revision: -1 }]) { await fs.writeFile(metadata(a.id), JSON.stringify({ ...a, ...changes })); assert.equal((await media.emptyDevelopmentMediaTrash([entry(a)]))[0].status, 'failed'); }
});
