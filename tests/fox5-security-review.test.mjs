// Independent source adapter/cache probes. Explicit no-network SDK doubles;
// these are not real-browser scrolling, scanner or live latency measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';

const C = 'TMC-0000000000000501', P = '00000000-0000-4000-8000-000000000501', F = '00000000-0000-4000-8000-000000000502';
const ISO = '2026-10-28T00:00:00.000Z';
const project = { clientId: C, projectId: P, title: 'Local probe' };
const photo = { photoId: F, projectId: P, clientId: C, storagePath: `hub-progress/${C}/${P}/${F}`, contentType: 'image/png', fileName: 'local.png', caption: '', size: 8, createdAt: ISO };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function liveFixture(owner) {
  const listeners = new Map(), calls = [], snapshots = [], errors = [];
  let hook, signouts = 0;
  const auth = { app: {}, currentUser: { uid: owner ? 'a4ARjp0z8ZOByKlC2AfGzmMRj843' : `hub:${C}` } };
  const session = { auth, db: {}, functions: {}, session: { clientId: C, authVersion: 1 }, assertCurrent() {} };
  const many = values => ({ metadata: { fromCache: false }, docs: values.map(value => ({ id: value.notificationId ?? value.photoId, data: () => value })) });
  const one = value => ({ metadata: { fromCache: false }, exists: () => value !== null, data: () => value });
  const load = sourceLoader({
    './client': { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', ClientHubError: class extends Error {}, captureClientHubSessionOwnership: () => () => true, verifiedClientHubConnection: async () => session, isClientHubSessionError: error => error.code === 'permission-denied', signOutClient: async () => { signouts++; } },
    './callable-owner-session': { hubCallableOwnerSession: async () => session },
    '@/owner/taylor-services-client': { taylorOwnerSession: async () => session },
    'firebase/auth': { onIdTokenChanged: () => () => {} },
    'firebase/storage': {},
    'firebase/functions': { getFunctions: () => ({}), httpsCallable: (_functions, name) => async input => { calls.push({ name, input }); return { data: await hook?.(input) ?? { photos: [photo], nextCursor: null } }; } },
    'firebase/firestore': {
      getFirestore: () => ({}), doc: (_db, ...parts) => ({ path: parts.join('/'), single: true }), collection: (_db, path) => ({ path }), query: value => value, where() {}, orderBy() {}, limit() {},
      onSnapshot(target, _options, onData, onError) {
        const value = { onData, onError }; listeners.set(target.path, value);
        queueMicrotask(() => { if (listeners.get(target.path) !== value) return; onData(target.single ? one(target.path.startsWith('hubClients/') ? { clientId: C, displayName: 'Local', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO } : null) : many([])); });
        return () => listeners.delete(target.path);
      },
    },
  });
  const api = load('src/client-hub/workspace-client.ts');
  const stop = api.subscribeProjectWorkspace(project, owner, value => snapshots.push(value), error => errors.push(error));
  return { calls, snapshots, errors, stop, load, auth, listeners, signouts: () => signouts, setHook: value => { hook = value; }, emit(path, values) { listeners.get(path).onData(many(values)); }, emitCopy(revision) { listeners.get(`hubFileCopyRevisions/${P}/viewers/${owner ? 'owner' : 'client'}`).onData(one({ projectId: P, clientId: C, viewerUid: auth.currentUser.uid, viewerRole: owner ? 'owner' : 'client', revision })); } };
}
const notice = version => ({ notificationId: `${P}-client-photos`, projectId: P, clientId: C, recipientRole: 'client', channel: 'photos', latestItemId: F, latestAt: ISO, version, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null });

test('working photo feed does not refetch on chat or receipt-only events; each new photo event adds one authorized list RPC', async t => {
  for (const owner of [false, true]) {
    const f = liveFixture(owner); t.after(f.stop); await tick(); await tick();
    assert.equal(f.errors.length, 0); const initial = f.calls.length;
    for (const name of ['hubMessages', 'hubSupportRequests', 'hubSupportReplies', 'hubNotifications']) f.emit(name, []);
    await tick(); assert.equal(f.calls.length, initial);
    f.emit('hubNotifications', [notice(1)]); await tick(); assert.equal(f.calls.length, initial + 1);
    f.emit('hubNotifications', [{ ...notice(1), readVersion: 1, readAt: ISO, throughItemId: F, throughCreatedAt: ISO }]);
    await tick(); assert.equal(f.calls.length, initial + 1, 'Marking photos read does not reload photos');
    assert.ok(f.calls.every(call => call.name === 'tmcHubListPhotos'));
    assert.equal(f.listeners.has('hubPhotos'), false, 'No direct browser metadata bypass');
    f.stop();
  }
});

test('deleting a copy while an older list RPC is pending cannot repaint the deleted photo', async t => {
  const f = liveFixture(false); t.after(f.stop); await tick(); await tick();
  const pending = deferred(); let reads = 0;
  f.setHook(() => ++reads === 1 ? pending.promise : { photos: [], nextCursor: null });
  f.emit('hubNotifications', [notice(2)]); await tick();
  f.emitCopy(1); const afterDelete = f.snapshots.length;
  pending.resolve({ photos: [photo], nextCursor: null }); await tick(); await tick();
  assert.equal(reads, 2); assert.ok(f.snapshots.slice(afterDelete).every(value => value.photos.length === 0));
  assert.equal(f.snapshots.at(-1).photos.length, 0); assert.equal(f.errors.length, 0); assert.equal(f.signouts(), 0);
});

test('a deleted cached copy fails closed without classifying normal file removal as a revoked session', async () => {
  const load = sourceLoader(), { PrivatePhotoMemoryCache } = load('src/client-hub/private-photo-cache.ts');
  const cache = new PrivatePhotoMemoryCache(), scope = { user: {}, accountKey: 'local-current-session' };
  const { isClientHubSessionError } = load('src/client-hub/client.ts');
  const error = Object.assign(Error('You deleted your copy of this file.'), { code: 'functions/failed-precondition' });
  await cache.run(scope, 'photo', async () => ({ blob: new Blob(['private']), generation: '1' }));
  await assert.rejects(cache.run(scope, 'photo', async previous => { assert.ok(previous); throw error; }), error);
  assert.equal(isClientHubSessionError(error), false);
  await cache.run(scope, 'photo', async previous => { assert.equal(previous, null, 'Denied cached bytes are removed'); return { blob: new Blob(['new']), generation: '2' }; });
  cache.clear();
});
