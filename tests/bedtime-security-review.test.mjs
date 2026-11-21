// Independent source-hook/data-adapter regressions, not browser/pixel QA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const C1 = 'TMC-0000000000000301', C2 = 'TMC-0000000000000302';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISO = '2026-10-27T06:00:00.000Z';
const row = (version = 1, projectId = uuid(1), extra = {}) => ({ notificationId: `${projectId}-client-chat`, clientId: C1, projectId, recipientRole: 'client', channel: 'chat', latestItemId: uuid(999), latestAt: ISO, version, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null, ...extra });
function bell(t, { sound = false, action, labels } = {}) {
  const h = harness(), subscriptions = [], notifications = [], actions = [], storage = new Map([[`tmc-hub-notifications:client:${C1}`, JSON.stringify({ desktop: true, sound })]]);
  h.document.visibilityState = 'hidden'; h.document.hasFocus = () => false;
  h.window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  h.globals.Notification = class { static permission = 'granted'; constructor(title, options) { this.title = title; this.options = options; notifications.push(this); } close() { this.closed = true; } };
  h.globals.Audio = class { constructor() { throw Error('Client must never instantiate an Audio element.'); } };
  h.globals.URL = { createObjectURL() { throw Error('Client must never create a sound object URL.'); }, revokeObjectURL() {} };
  h.overrides['./workspace-client'] = { subscribeHubNotifications(_owner, onData, onError) { const subscription = { onData, onError, stopped: false }; subscriptions.push(subscription); return () => { subscription.stopped = true; }; } };
  h.overrides['./notification-client'] = {
    loadHubNotificationLabels: (...args) => labels ? labels(...args) : Promise.resolve({ [uuid(1)]: 'Private commission title' }),
    async changeHubNotifications(...args) { actions.push(args); return action ? action(...args) : args[2].map(item => ({ ...item, [args[1] === 'dismiss' ? 'dismissedVersion' : 'acknowledgedVersion']: item.version })); },
  };
  const Bell = h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell, props = { owner: false, accountKey: C1 }, render = () => h.render(Bell, props);
  const button = label => h.find(node => node.type === 'button' && (content(node) === label || node.props.title === label || node.props['aria-label'] === label));
  render(); t.after(() => h.unmount());
  return { h, props, subscriptions, notifications, actions, storage, render, button, async ready() { await flush(); render(); }, open() { button('Notifications').props.onClick(); render(); } };
}

test('client sound is exclusively OS notification silent preference, with no mount/backlog audio or private lock-screen text', async t => {
  for (const sound of [false, true]) {
    const f = bell(t, { sound }); await f.ready();
    f.subscriptions[0].onData([row(1)]); await f.ready(); assert.equal(f.notifications.length, 0);
    f.subscriptions[0].onData([row(2)]); await f.ready(); assert.equal(f.notifications.length, 1);
    assert.equal(f.notifications[0].options.silent, !sound);
    assert.equal(f.notifications[0].options.body, 'New activity in your private Client Hub.');
    assert.doesNotMatch(JSON.stringify(f.notifications[0].options), /Private commission title|TMC-/);
    f.open(); assert.equal(f.h.find(node => node.type === 'input' && node.props.type === 'file'), undefined);
    const toggle = f.h.find(node => node.type === 'input' && node.props.type === 'checkbox');
    assert.equal(toggle.props.checked, sound); toggle.props.onChange({ target: { checked: !sound } }); f.render();
    f.subscriptions[0].onData([row(3)]); assert.equal(f.notifications.at(-1).options.silent, sound);
  }
});

test('captured notification ack is duplicate-locked and cannot hide a newer live event or manufacture receipt fields', async t => {
  const pending = deferred(), f = bell(t, { action: () => pending.promise }); await f.ready();
  f.subscriptions[0].onData([row(1)]); await f.ready(); f.open();
  const all = f.button('Mark all as read'); all.props.onClick(); all.props.onClick(); assert.equal(f.actions.length, 1);
  assert.equal(f.actions[0][1], 'acknowledge'); assert.equal(f.actions[0][2][0].version, 1);
  f.subscriptions[0].onData([row(2, uuid(1), { latestItemId: uuid(998) })]); f.render();
  pending.resolve([row(1, uuid(1), { acknowledgedVersion: 1 })]); await f.ready();
  const opened = f.h.find(node => node.props['aria-label']?.startsWith('Open Private commission title'));
  assert.match(opened.props['aria-label'], /1 unread message/);
  assert.match(content(f.h.tree), /Notification controls don’t change message read receipts/);
  assert.equal(f.actions[0][2][0].readAt, null); assert.equal(f.actions[0][2][0].readVersion, 0);
});

test('old-account notification actions, label promises and native notification clicks cannot populate the next account', async t => {
  const pending = deferred(), label = deferred(), f = bell(t, { action: () => pending.promise, labels: () => label.promise });
  await f.ready(); f.subscriptions[0].onData([row(1)]); f.subscriptions[0].onData([row(2)]); f.render(); f.open(); f.button('Mark all as read').props.onClick();
  const signal = f.actions[0][3], native = f.notifications[0];
  f.props.accountKey = C2; f.render(); await f.ready(); assert.equal(signal.aborted, true); assert.equal(f.subscriptions[0].stopped, true);
  f.subscriptions[1].onData([row(1, uuid(2), { clientId: C2 })]); f.render();
  pending.resolve([row(2, uuid(1), { acknowledgedVersion: 2 })]); label.resolve({ [uuid(1)]: 'OLD ACCOUNT PRIVATE TITLE' }); await f.ready();
  assert.doesNotMatch(content(f.h.tree), /OLD ACCOUNT PRIVATE TITLE|Private commission title/);
  assert.match(f.button('Notifications').props['aria-label'], /1 unread updates/);
  f.h.window.focus = () => { throw Error('Old native notification must not refocus a changed account.'); };
  native.onclick(); assert.equal(native.closed, true);
});

test('unconfirmed notification action keeps cards and permits an explicit retry instead of reporting successful clearing', async t => {
  let attempts = 0; const f = bell(t, { action: async (_owner, _action, captured) => { if (!attempts++) throw Error('Lost response'); return captured.map(item => ({ ...item, acknowledgedVersion: item.version })); } });
  await f.ready(); f.subscriptions[0].onData([row(3)]); await f.ready(); f.open(); f.button('Mark all as read').props.onClick(); await f.ready();
  assert.match(content(f.h.tree), /could not be confirmed/); assert.match(f.button('Notifications').props['aria-label'], /3 unread updates/);
  f.button('Mark all as read').props.onClick(); await f.ready(); assert.equal(f.actions.length, 2); assert.match(content(f.h.tree), /all caught up/);
});

function adapter() {
  let current = true, hook = null; const calls = [], reads = [];
  const session = { auth: { app: { name: 'private-client-test' } }, db: {}, functions: {}, session: { clientId: C1, authVersion: 1 }, assertCurrent() { if (!current) throw Error('Old account'); } };
  const api = sourceLoader({
    './client': { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', ClientHubError: class extends Error { constructor(code, text) { super(text); this.code = code; } }, verifiedClientHubConnection: async () => session },
    './callable-owner-session': { hubCallableOwnerSession: async () => session },
    '@/owner/taylor-services-client': { taylorOwnerSession: async () => session },
    'firebase/functions': { getFunctions: () => ({}), httpsCallable: (_functions, name) => async input => { calls.push({ name, input }); const response = await hook?.(input); return { data: response ?? { notifications: input.notifications.map(item => row(item.version, item.projectId, { [input.notificationAction === 'dismiss' ? 'dismissedVersion' : 'acknowledgedVersion']: item.version })) } }; } },
    'firebase/firestore': { getFirestore: () => ({}), doc: (_db, name, id) => ({ name, id }), getDocFromServer: async target => { reads.push(target); return { exists: () => true, data: () => ({ projectId: target.id, clientId: C2, title: 'Must not escape', summary: '', status: 'queued', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO }) }; } },
  })('src/client-hub/notification-client.ts');
  return { api, calls, reads, hook: value => { hook = value; }, expire: () => { current = false; } };
}

test('notification adapter captures all101 rows into100+1 bounded calls, never conversation item reads', async () => {
  const f = adapter(), rows = Array.from({ length: 101 }, (_, i) => row(i + 1, uuid(i + 1)));
  const result = await f.api.changeHubNotifications(false, 'dismiss', rows);
  assert.equal(result.length, 101); assert.deepEqual(f.calls.map(call => call.input.notifications.length), [100, 1]);
  assert.ok(f.calls.every(call => call.name === 'tmcHubMarkConversationRead' && call.input.notificationAction === 'dismiss' && !Object.hasOwn(call.input, 'itemId')));
  assert.deepEqual(f.calls.flatMap(call => call.input.notifications).map(item => item.version), rows.map(item => item.version));
});

test('notification adapter refuses cross-client input, malformed server cursors and account changes between chunks', async () => {
  const cross = adapter(); await assert.rejects(cross.api.changeHubNotifications(false, 'acknowledge', [row(1, uuid(1), { clientId: C2 })])); assert.equal(cross.calls.length, 0);
  const duplicate = adapter(); await assert.rejects(duplicate.api.changeHubNotifications(false, 'acknowledge', [row(), row()])); assert.equal(duplicate.calls.length, 0);
  const stale = adapter(); stale.hook(() => { stale.expire(); }); await assert.rejects(stale.api.changeHubNotifications(false, 'acknowledge', Array.from({ length: 101 }, (_, i) => row(1, uuid(i + 1))))); assert.equal(stale.calls.length, 1);
  const malformed = adapter(); malformed.hook(() => ({ notifications: [row(1, uuid(1), { acknowledgedVersion: 99 })] })); await assert.rejects(malformed.api.changeHubNotifications(false, 'acknowledge', [row()]));
});

test('notification label reads fail closed for mismatched shared-project identity without querying private contacts', async () => {
  const f = adapter(); await assert.rejects(f.api.loadHubNotificationLabels(false, [row()])); assert.deepEqual(f.reads, [{ name: 'hubProjects', id: uuid(1) }]);
  const cross = adapter(); await assert.rejects(cross.api.loadHubNotificationLabels(false, [row(1, uuid(1), { clientId: C2 })])); assert.equal(cross.reads.length, 0);
});

const cacheModule = () => sourceLoader({})('src/client-hub/private-photo-cache.ts');
const localBlob = text => new Blob([text], { type: 'image/png' });

test('private photo cache reauthorizes every hit and never falls back to retained bytes after a rejected read', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(), cache = new PrivatePhotoMemoryCache(), scope = { user: {}, accountKey: 'account:project:epoch1' };
  let reads = 0;
  const initial = await cache.run(scope, 'photo', async previous => { reads++; assert.equal(previous, null); return { blob: localBlob('secret'), generation: '1' }; });
  const hit = await cache.run(scope, 'photo', async previous => { reads++; assert.equal(previous.blob, initial); return { blob: previous.blob, generation: previous.generation }; });
  assert.equal(hit, initial); assert.equal(reads, 2);
  await assert.rejects(cache.run(scope, 'photo', async previous => { assert.ok(previous); throw Error('Authorization unavailable'); }), /Authorization unavailable/);
  await cache.run(scope, 'photo', async previous => { assert.equal(previous, null); return { blob: localBlob('fresh'), generation: '2' }; }); cache.clear();
});

test('private photo dedup keeps a second consumer alive when only the first consumer cancels', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(), cache = new PrivatePhotoMemoryCache(), scope = { user: {}, accountKey: 'scope' }, gate = deferred(), first = new AbortController();
  let reads = 0, sharedSignal;
  const loader = async (_previous, signal) => { reads++; sharedSignal = signal; return gate.promise; };
  const a = cache.run(scope, 'photo', loader, first.signal), b = cache.run(scope, 'photo', loader);
  const rejection = assert.rejects(a, error => error.name === 'AbortError'); await flush(); first.abort(); await rejection;
  assert.equal(sharedSignal.aborted, false); assert.equal(reads, 1);
  gate.resolve({ blob: localBlob('same'), generation: '7' }); assert.equal(await (await b).text(), 'same'); cache.clear();
});

test('a completely canceled photo job cannot poison reopening or later erase its successful replacement cache entry', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(), cache = new PrivatePhotoMemoryCache(), scope = { user: {}, accountKey: 'scope' }, old = deferred(), controller = new AbortController();
  let loads = 0;
  const a = cache.run(scope, 'photo', async () => { loads++; return old.promise; }, controller.signal);
  const rejection = assert.rejects(a, error => error.name === 'AbortError'); await flush(); controller.abort(); await rejection;
  const b = cache.run(scope, 'photo', async previous => { loads++; assert.equal(previous, null); return { blob: localBlob('replacement'), generation: '2' }; });
  // Attach rejection now so a failure is reported by this assertion, not unhandled.
  const outcome = b.then(value => ({ value }), error => ({ error })); await flush();
  assert.equal(loads, 2, 'reopening starts a fresh job rather than joining the aborted transfer');
  old.resolve({ blob: localBlob('old'), generation: '1' }); await flush();
  const result = await outcome; assert.equal(result.error, undefined); assert.equal(await result.value.text(), 'replacement');
  await cache.run(scope, 'photo', async previous => { assert.equal(previous.generation, '2'); assert.equal(await previous.blob.text(), 'replacement'); return { blob: previous.blob, generation: previous.generation }; }); cache.clear();
});

test('account/project/epoch scope changes cancel pending cache jobs and never install their late bytes', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(), cache = new PrivatePhotoMemoryCache(), user = {}, old = deferred();
  const pending = cache.run({ user, accountKey: 'clientA:project1:epoch1' }, 'photo', () => old.promise);
  const rejection = assert.rejects(pending, error => error.name === 'AbortError'); await flush();
  await cache.run({ user, accountKey: 'clientA:project2:epoch2' }, 'photo', async previous => { assert.equal(previous, null); return { blob: localBlob('new-scope'), generation: '9' }; });
  old.resolve({ blob: localBlob('private-old-scope'), generation: '1' }); await rejection;
  await cache.run({ user, accountKey: 'clientA:project2:epoch2' }, 'photo', async previous => { assert.equal(await previous.blob.text(), 'new-scope'); return { blob: previous.blob, generation: previous.generation }; });
  await cache.run({ user: {}, accountKey: 'clientA:project2:epoch2' }, 'photo', async previous => { assert.equal(previous, null); return { blob: localBlob('new-auth-object'), generation: '10' }; }); cache.clear();
});

test('late authorization failure from a discarded photo scope is cancellation, not authority to invalidate the replacement account', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(), cache = new PrivatePhotoMemoryCache(), old = deferred();
  const a = cache.run({ user: {}, accountKey: 'accountA' }, 'photo', () => old.promise);
  const rejection = assert.rejects(a, error => error.name === 'AbortError'); await flush();
  const nextScope = { user: {}, accountKey: 'accountB' };
  await cache.run(nextScope, 'photo', async () => ({ blob: localBlob('accountB-only'), generation: '8' }));
  old.reject(Object.assign(Error('Old account was revoked'), { code: 'functions/permission-denied' }));
  await rejection;
  await cache.run(nextScope, 'photo', async previous => { assert.equal(await previous.blob.text(), 'accountB-only'); return { blob: previous.blob, generation: previous.generation }; });
  cache.clear();
});

test('actual workspace photo adapter keeps replacement-account cache after the prior account RPC rejects late', async () => {
  const bytes = Buffer.from('private-image'), calls = [], pending = deferred();
  const auth = { app: {}, currentUser: { uid: 'accountA' } }; let clientId = C1, observer;
  const mkPhoto = id => ({ photoId: uuid(40), projectId: uuid(41), clientId: id, storagePath: `hub-progress/${id}/${uuid(41)}/${uuid(40)}`, fileName: 'progress.png', caption: '', contentType: 'image/png', size: bytes.length, createdAt: ISO });
  const photoA = mkPhoto(C1), photoB = mkPhoto(C2);
  const api = sourceLoader({
    './client': { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', ClientHubError: class extends Error {}, isClientHubSessionError: error => error.code === 'functions/permission-denied', async verifiedClientHubConnection() {
      const user = auth.currentUser;
      return { auth, db: {}, functions: {}, session: { clientId, authVersion: 1 }, assertCurrent() { if (auth.currentUser !== user) throw Object.assign(Error('Old account'), { code: 'functions/permission-denied' }); } };
    } },
    './callable-owner-session': {}, '@/owner/taylor-services-client': {}, 'firebase/firestore': {}, 'firebase/storage': {},
    'firebase/auth': { onIdTokenChanged(_auth, callback) { observer = callback; return () => {}; } },
    'firebase/functions': { httpsCallable: (_fn, name) => async input => {
      calls.push({ name, input });
      if (calls.length === 1) return pending.promise;
      return { data: { photoId: photoB.photoId, fileName: photoB.fileName, contentType: photoB.contentType, size: bytes.length, generation: '2', ...(input.knownGeneration ? { notModified: true } : { base64: bytes.toString('base64') }) } };
    } },
  })('src/client-hub/workspace-client.ts');
  const first = api.loadHubPhotoBlob(photoA, false), rejected = assert.rejects(first, error => error.name === 'AbortError'); await flush();
  auth.currentUser = { uid: 'accountB' }; clientId = C2; observer(auth.currentUser);
  await api.loadHubPhotoBlob(photoB, false);
  pending.reject(Object.assign(Error('Account A revoked'), { code: 'functions/permission-denied' })); await rejected;
  await api.loadHubPhotoBlob(photoB, false);
  assert.equal(calls.length, 3); assert.equal(calls[2].input.knownGeneration, '2');
  api.clearHubPhotoCache();
});

test('temporary photo cache enforces byte/count/TTL eviction and does not retain old-backend unversioned bytes', async () => {
  const { PrivatePhotoMemoryCache } = cacheModule(); let now = 1000;
  const cache = new PrivatePhotoMemoryCache(6, 2, 100, () => now), scope = { user: {}, accountKey: 'scope' };
  const store = key => cache.run(scope, key, async () => ({ blob: localBlob('123'), generation: '1' }));
  await store('a'); await store('b'); await store('c');
  await cache.run(scope, 'a', async previous => { assert.equal(previous, null); return { blob: localBlob('123'), generation: '2' }; });
  now += 101; await cache.run(scope, 'a', async previous => { assert.equal(previous, null); return { blob: localBlob('123') }; });
  await cache.run(scope, 'a', async previous => { assert.equal(previous, null); return { blob: localBlob('1234567'), generation: '3' }; });
  await cache.run(scope, 'a', async previous => { assert.equal(previous, null); return { blob: localBlob('123'), generation: '4' }; }); cache.clear();
});
