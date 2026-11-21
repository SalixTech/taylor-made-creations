// Independent real-source regression probes. SDK/DOM are explicit no-network
// doubles; these do not claim real-browser popup or live-service verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './owner-ui-harness.mjs';

const CID = 'TMC-0000000000000401', OTHER = 'TMC-0000000000000402';
const OWNER = 'a4ARjp0z8ZOByKlC2AfGzmMRj843';
const PID = '00000000-0000-4000-8000-000000000401';
const ISO = '2026-10-27T00:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
const project = { clientId: CID, projectId: PID, title: 'Test commission', summary: '', status: 'in-progress', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO };

function authFixture(t) {
  const h = harness(), apps = [], auths = new Map(), events = new Map(), signouts = [], snapshots = [], values = new Map(), tabs = new Map();
  const environment = { apiKey: `AIza${'a'.repeat(35)}`, authDomain: 'taylor-made-creations.firebaseapp.com', projectId: 'taylor-made-creations', storageBucket: 'taylor-made-creations.firebasestorage.app', messagingSenderId: '123456', appId: '1:123456:web:abc123' };
  const names = { apiKey: 'API_KEY', authDomain: 'AUTH_DOMAIN', projectId: 'PROJECT_ID', storageBucket: 'STORAGE_BUCKET', messagingSenderId: 'MESSAGING_SENDER_ID', appId: 'APP_ID' };
  for (const [key, suffix] of Object.entries(names)) h.process.env[`NEXT_PUBLIC_FIREBASE_${suffix}`] = environment[key];
  h.process.env.NEXT_PUBLIC_OWNER_UID = OWNER;
  h.window.location = { pathname: '/taylor', search: '', origin: 'https://tmc.test' };
  h.window.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  h.window.sessionStorage = { getItem: key => tabs.get(key) ?? null, setItem: (key, value) => tabs.set(key, value) };
  h.globals.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail; } };
  const user = (clientId = CID) => ({ uid: `hub:${clientId}`, getIdTokenResult: async () => ({ claims: { hubRole: 'client', hubClientId: clientId, hubAuthVersion: 1 } }) });
  const clientUser = user(), ownerUser = { uid: OWNER, reload: async () => {}, getIdToken: async () => 'mock-only' };
  h.overrides['firebase/app'] = { getApps: () => apps, initializeApp(options, name) { const app = { options, name }; apps.push(app); return app; } };
  h.overrides['firebase/auth'] = {
    browserSessionPersistence: { type: 'SESSION' },
    initializeAuth(app, options) {
      assert.equal(options.persistence.type, 'SESSION');
      if (!auths.has(app.name)) auths.set(app.name, { app, currentUser: app.name === 'tmc-client-hub' ? clientUser : ownerUser, authStateReady: async () => {} });
      return auths.get(app.name);
    },
    onIdTokenChanged(auth, callback) {
      const item = { auth, callback }; events.set(item, item);
      queueMicrotask(() => { if (events.has(item)) callback(auth.currentUser); });
      return () => events.delete(item);
    },
    onAuthStateChanged(auth, callback) { const item = { auth, callback }; events.set(item, item); queueMicrotask(() => { if (events.has(item)) callback(auth.currentUser); }); return () => events.delete(item); },
    async signOut(auth) { signouts.push(auth.app.name); auth.currentUser = null; for (const item of events.values()) if (item.auth === auth) item.callback(null); },
  };
  const record = { clientId: CID, displayName: 'Test', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO };
  const document = (value = record) => ({ metadata: { fromCache: false }, exists: () => true, data: () => value });
  const firestore = {
    getFirestore: app => ({ app }), doc: (db, ...parts) => ({ db, path: parts.join('/') }), collection: (db, path) => ({ db, path }),
    where: (...args) => ({ args }), orderBy: (...args) => ({ args }), limit: count => ({ count }), query: (target, ...filters) => ({ ...target, filters }),
    getDocFromServer: async () => document(),
    onSnapshot(target, _options, callback, failure) { const item = { target, callback, failure, stopped: false }; snapshots.push(item); return () => { item.stopped = true; }; },
  };
  h.overrides['firebase/firestore'] = firestore;
  h.overrides['firebase/firestore/lite'] = { getFirestore: app => ({ app }) };
  h.overrides['firebase/functions'] = { getFunctions: app => ({ app }), httpsCallable: (_functions, name) => async () => { assert.equal(name, 'tmcHubListPhotos'); return { data: { photos: [], nextCursor: null } }; } };
  h.overrides['firebase/storage'] = {};
  const client = h.load('src/client-hub/client.ts');
  h.overrides['./client'] = client;
  const scopes = h.load('src/client-hub/window-session.ts');
  const cleanups = [];
  t.after(() => { cleanups.forEach(stop => stop()); h.unmount(); h.load('src/client-hub/private-photo-cache.ts').clearHubPhotoCache(); });
  return { h, client, scopes, user, clientUser, ownerUser, auths, signouts, snapshots, document, cleanups, async settled() { await tick(); await tick(); }, auth: () => auths.get('tmc-client-hub') };
}

test('owner verification and builder preview lifecycle never replace or revoke an already signed-in client', async t => {
  const f = authFixture(t), seen = [], errors = [];
  f.cleanups.push(f.client.subscribeClientSession(value => seen.push(value), error => errors.push(error)));
  await f.settled();
  f.snapshots.find(item => item.target.path === `hubClients/${CID}`).callback(f.document());
  assert.equal(seen.at(-1)?.clientId, CID);
  const owner = f.h.load('src/owner/firebase-client.ts'), connection = owner.getOwnerFirebaseClient(owner.readOwnerFirebaseConfig());
  await owner.verifyOwnerSession(connection, f.ownerUser);
  const draft = f.h.load('src/owner/defaults.ts').createInitialOwnerWorkspace().draft;
  const child = { closed: false, postMessage() {}, close() { this.closed = true; } };
  f.h.window.open = () => child;
  const { useLivePreview } = f.h.load('src/owner/use-live-preview.ts');
  let bridge;
  f.h.render(() => { bridge = useLivePreview(draft, draft.pages[0].id, () => assert.fail('Unexpected preview error'), () => f.scopes.assertHubWindowSession('owner', OWNER)); return null; });
  bridge.open(); f.h.window.dispatchEvent(new Event('focus')); await f.settled();
  assert.deepEqual(f.signouts, []); assert.equal(f.auth().currentUser, f.clientUser);
  f.h.unmount(); f.h.window.dispatchEvent(new Event('focus')); await f.settled();
  assert.equal(child.closed, true); assert.deepEqual(f.signouts, []);
  f.scopes.revokeHubWindows('owner', OWNER); f.h.window.dispatchEvent(new Event('focus')); await f.settled();
  assert.deepEqual(f.signouts, ['tmc-private-owner']); assert.equal(f.auth().currentUser, f.clientUser);
  assert.equal(seen.at(-1)?.clientId, CID); assert.deepEqual(errors, []);
});

for (const source of ['session', 'dashboard', 'workspace', 'notifications']) {
  for (const sameUid of [false, true]) {
    test(`obsolete ${source} listener failure cannot sign out a newer ${sameUid ? 'same-account' : 'different-account'} sign-in`, async t => {
      const f = authFixture(t), errors = [];
      if (source === 'session') f.cleanups.push(f.client.subscribeClientSession(() => {}, error => errors.push(error)));
      else if (source === 'dashboard') f.cleanups.push(f.client.subscribeClientDashboard({ uid: f.clientUser.uid, clientId: CID, authVersion: 1 }, () => {}, error => errors.push(error)));
      else {
        const adapter = f.h.load('src/client-hub/workspace-client.ts');
        f.cleanups.push(source === 'workspace' ? adapter.subscribeProjectWorkspace(project, false, () => {}, error => errors.push(error)) : adapter.subscribeHubNotifications(false, () => {}, error => errors.push(error)));
      }
      await f.settled();
      const old = f.snapshots.find(item => item.target.path === `hubClients/${CID}`);
      assert.ok(old, 'A genuine old-account listener must be installed before the interleaving');
      const replacement = f.user(sameUid ? CID : OTHER);
      // Firebase can replace currentUser before React effect cleanup or a later
      // onIdTokenChanged delivery. A late Firestore permission error belongs to
      // the captured old user object, not to the newly accepted credentials.
      f.auth().currentUser = replacement;
      f.scopes.acceptHubWindowSignIn('client', replacement.uid);
      old.failure(Object.assign(new Error('Old listener revoked'), { code: 'permission-denied' }));
      await f.settled();
      assert.deepEqual(f.signouts, [], 'Old listener must not invoke unscoped global sign-out');
      assert.equal(f.auth().currentUser, replacement);
      assert.doesNotThrow(() => f.scopes.assertHubWindowSession('client', replacement.uid));
    });
  }
  test(`current ${source} listener revocation still locks and signs out its own session`, async t => {
    const f = authFixture(t), errors = [];
    if (source === 'session') f.cleanups.push(f.client.subscribeClientSession(() => {}, error => errors.push(error)));
    else if (source === 'dashboard') f.cleanups.push(f.client.subscribeClientDashboard({ uid: f.clientUser.uid, clientId: CID, authVersion: 1 }, () => {}, error => errors.push(error)));
    else {
      const adapter = f.h.load('src/client-hub/workspace-client.ts');
      f.cleanups.push(source === 'workspace' ? adapter.subscribeProjectWorkspace(project, false, () => {}, error => errors.push(error)) : adapter.subscribeHubNotifications(false, () => {}, error => errors.push(error)));
    }
    await f.settled();
    f.snapshots.find(item => item.target.path === `hubClients/${CID}`).failure(Object.assign(new Error('Current access revoked'), { code: 'permission-denied' }));
    await f.settled();
    assert.deepEqual(f.signouts, ['tmc-client-hub']); assert.equal(f.auth().currentUser, null);
    assert.equal(errors.length, 1); assert.throws(() => f.scopes.assertHubWindowSession('client', f.clientUser.uid), /sign-in changed/);
  });
  test(`superseded asynchronous ${source} setup cannot revoke replacement credentials`, async t => {
    const f = authFixture(t), errors = [];
    let rejectToken;
    f.clientUser.getIdTokenResult = () => new Promise((_resolve, reject) => { rejectToken = reject; });
    if (source === 'session') f.cleanups.push(f.client.subscribeClientSession(() => {}, error => errors.push(error)));
    else if (source === 'dashboard') f.cleanups.push(f.client.subscribeClientDashboard({ uid: f.clientUser.uid, clientId: CID, authVersion: 1 }, () => {}, error => errors.push(error)));
    else {
      const adapter = f.h.load('src/client-hub/workspace-client.ts');
      f.cleanups.push(source === 'workspace' ? adapter.subscribeProjectWorkspace(project, false, () => {}, error => errors.push(error)) : adapter.subscribeHubNotifications(false, () => {}, error => errors.push(error)));
    }
    await f.settled(); assert.equal(typeof rejectToken, 'function');
    const replacement = f.user(OTHER); f.auth().currentUser = replacement; f.scopes.acceptHubWindowSignIn('client', replacement.uid);
    rejectToken(Object.assign(new Error('Obsolete ID token revoked'), { code: 'auth/id-token-revoked' }));
    await f.settled();
    assert.deepEqual(f.signouts, []); assert.equal(f.auth().currentUser, replacement);
    assert.deepEqual(errors, [], 'Obsolete initialization cannot report an auth failure into the replacement view');
  });
}

function attachmentFixture(t, bytes = Buffer.alloc(256 * 1024 + 7, 62)) {
  const h = harness(), calls = [], clicks = [], B = '00000000-0000-4000-8000-000000000411', F = '00000000-0000-4000-8000-000000000412', chunkSize = 256 * 1024;
  let generation = 1, available = true, receivedBytes = 0, blocked = null;
  const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', value)).toString('hex');
  const file = new File([bytes], 'untrusted.html', { type: 'text/html' });
  const makeSession = signal => { const captured = generation; return { auth: { app: { name: 'isolated-review' } }, functions: {}, session: { clientId: CID }, assertCurrent() { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); if (captured !== generation) throw new Error('captured session changed'); } }; };
  h.overrides['./client'] = { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', ClientHubError: Error, verifiedClientHubConnection: async signal => makeSession(signal) };
  h.overrides['./callable-owner-session'] = { hubCallableOwnerSession: async () => makeSession() };
  const attachment = { attachmentId: F, batchId: B, clientId: CID, projectId: PID, fileName: file.name, size: bytes.length, senderRole: 'client', createdAt: ISO, retentionEpisode: 0 };
  h.overrides['firebase/functions'] = { getFunctions: () => ({}), httpsCallable: (_functions, name) => async input => {
    calls.push({ name, input, generation }); await blocked?.(name, input);
    if (name === 'tmcHubBeginAttachmentBatch') return { data: { batchId: B, status: 'staging', chunkBytes: chunkSize, files: [{ attachmentId: F, size: bytes.length, receivedBytes }] } };
    if (name === 'tmcHubUploadAttachmentChunk') { receivedBytes = input.offset + Buffer.from(input.base64, 'base64').length; return { data: { attachmentId: F, index: input.index, receivedBytes } }; }
    if (name === 'tmcHubCommitAttachmentBatch') return { data: { batchId: B, attachments: [{ ...attachment, sha256: await hash(bytes) }] } };
    if (name === 'tmcHubDownloadAttachmentChunk') { if (!available) throw new Error('attachment expired'); const chunk = bytes.subarray(input.index * chunkSize, (input.index + 1) * chunkSize); return { data: { ...attachment, sha256: await hash(chunk), fileSha256: await hash(bytes), index: input.index, offset: input.index * chunkSize, contentType: 'application/octet-stream', contentDisposition: 'attachment', base64: chunk.toString('base64') } }; }
    throw new Error(`Unexpected callable ${name}`);
  } };
  h.globals.File = File; h.globals.Blob = Blob;
  h.globals.URL = { createObjectURL: () => 'blob:only-review', revokeObjectURL() {} };
  h.globals.setTimeout = callback => { callback(); return 1; };
  h.document.body.appendChild = () => {};
  h.document.createElement = () => ({ style: {}, click() { clicks.push(this.download); }, remove() {} });
  const api = h.load('src/client-hub/attachments-client.ts'); t.after(() => h.unmount());
  return { api, file, calls, clicks, options: { batchId: B, attachmentIds: [F] }, attachment: async () => ({ ...attachment, sha256: await hash(bytes) }), switchAccount: () => generation++, expire: () => { available = false; }, block: value => { blocked = value; } };
}

test('an attachment upload cannot adopt replacement credentials between acknowledged chunks', async t => {
  const f = attachmentFixture(t); let changed = false;
  await assert.rejects(f.api.uploadHubAttachments(project, false, [f.file], { ...f.options, onProgress(value) { if (!changed && value.uploadedBytes > 0) { changed = true; f.switchAccount(); } } }), /session changed/);
  assert.equal(f.calls.some(call => call.generation === 2), false);
  assert.equal(f.calls.some(call => call.name === 'tmcHubCommitAttachmentBatch'), false);
});

test('download cannot adopt a replacement same-client session after its last chunk', async t => {
  const f = attachmentFixture(t, Buffer.from('last-chunk'));
  await assert.rejects(f.api.downloadHubAttachment(project, false, await f.attachment(), { onProgress() { f.switchAccount(); } }), /session changed/);
  assert.deepEqual(f.clicks, []);
});

test('download reauthorizes attachment availability after bytes and final checksum, before a save click', async t => {
  const f = attachmentFixture(t, Buffer.from('deadline'));
  await assert.rejects(f.api.downloadHubAttachment(project, true, await f.attachment(), { onProgress() { f.expire(); } }), /expired/);
  assert.deepEqual(f.clicks, []);
});

test('replacement credentials during an async upload slice are rejected before any chunk RPC', async t => {
  const f = attachmentFixture(t), originalSlice = f.file.slice.bind(f.file);
  f.file.slice = (...args) => { const blob = originalSlice(...args), originalRead = blob.arrayBuffer.bind(blob); blob.arrayBuffer = async () => { const result = await originalRead(); f.switchAccount(); return result; }; return blob; };
  await assert.rejects(f.api.uploadHubAttachments(project, false, [f.file], f.options), /session changed/);
  assert.equal(f.calls.some(call => call.name === 'tmcHubUploadAttachmentChunk'), false, 'No side effect may adopt a fresh session while processing the old user operation');
});

function cloudRecoveryFixture(t) {
  const h = harness(), writes = [], timers = new Map(); let value, fail = false, id = 0;
  h.globals.setTimeout = callback => { timers.set(++id, callback); return id; }; h.globals.clearTimeout = key => timers.delete(key);
  const content = h.load('src/owner/defaults.ts').createDefaultOwnerContent(), props = { revision: 4, content, dirty: true };
  const port = { async checkpointDraft(input) { writes.push(structuredClone(input)); if (fail) throw new Error('lost response'); return { id: 'd-review', kind: 'draft', cloudRevision: input.expectedRevision, createdAt: ISO, expiresAt: '2026-11-03T00:00:00.000Z', branchId: input.branchId }; }, async listRecovery() { return []; }, async readRecovery() { return content; }, async dismissRecovery() {} };
  const session = { projectId: 'taylor-made-creations', ownerUid: OWNER, assertCurrent() {} };
  const use = h.load('src/owner/use-cloud-draft-recovery.ts').useCloudDraftRecovery;
  const Component = () => { value = use(port, session, props.content, props.revision, props.dirty, true); return null; };
  t.after(() => h.unmount());
  return { h, Component, props, writes, timers, get api() { return value; }, fail(value) { fail = value; } };
}

test('cloud recovery stop before passive mount setup remains permanently locked during pending logout', async t => {
  const f = cloudRecoveryFixture(t);
  // Render-phase hook allocation, then logout/teardown before queued mount
  // effects: equivalent ordering to a parent synchronous layout teardown.
  f.Component(); f.api.stop(); f.h.pending.forEach(effect => effect());
  await f.api.checkpoint(); await tick();
  assert.equal(f.writes.length, 0); assert.equal(f.timers.size, 0);
});

test('uncertain cloud checkpoint retry retains its exact immutable operation identity', async t => {
  const f = cloudRecoveryFixture(t); f.h.render(f.Component); f.fail(true);
  await f.api.checkpoint(); f.fail(false); await f.api.checkpoint();
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].operationId, f.writes[0].operationId);
  assert.deepEqual(f.writes[1], f.writes[0]);
});

test('a newer account theme snapshot cannot be overwritten by an older pending save response', async t => {
  const h = harness(), runtime = h.load('src/components/theme-runtime.ts'); let release;
  const modes = { public: 'inherit', owner: 'light', hub: 'inherit' }, before = { schemaVersion: 1, revision: 1, modes };
  const defaults = { ...before, defaultMode: 'light' };
  const binding = runtime.bindThemeAccount('owner', OWNER, before, () => new Promise(resolve => { release = resolve; }));
  t.after(() => { binding.close(); h.unmount(); }); binding.update(before);
  runtime.chooseTheme('owner', 'dark');
  binding.update({ ...before, revision: 3, modes: { ...modes, owner: 'light' } });
  release({ ...before, revision: 2, modes: { ...modes, owner: 'dark' } }); await tick();
  assert.equal(runtime.effectiveTheme('owner', defaults), 'light');
});

test('client logout locks only its role and cannot sign out the already verified owner app', async t => {
  const f = authFixture(t); f.cleanups.push(f.client.subscribeClientSession(() => {}, () => {})); await f.settled();
  const owner = f.h.load('src/owner/firebase-client.ts'), connection = owner.getOwnerFirebaseClient(owner.readOwnerFirebaseConfig());
  await owner.verifyOwnerSession(connection, f.ownerUser);
  f.scopes.revokeHubWindows('client', f.clientUser.uid); f.h.window.dispatchEvent(new Event('focus')); await f.settled();
  assert.ok(f.signouts.includes('tmc-client-hub')); assert.equal(f.signouts.includes('tmc-private-owner'), false); assert.equal(connection.auth.currentUser, f.ownerUser);
});

test('queued private attachment downloads retain their initiating session rather than the account at dequeue time', async t => {
  const f = attachmentFixture(t, Buffer.from('queued')), attachment = await f.attachment(); let release, entered;
  const began = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true; f.block(async name => { if (first && name === 'tmcHubDownloadAttachmentChunk') { first = false; entered(); await gate; } });
  const a = f.api.downloadHubAttachment(project, false, attachment); await began;
  const b = f.api.downloadHubAttachment(project, false, attachment); await tick(); f.switchAccount(); release();
  const results = await Promise.allSettled([a, b]);
  assert.ok(results.every(result => result.status === 'rejected' && /session changed/.test(result.reason.message)));
  assert.equal(f.calls.length, 1); assert.deepEqual(f.clicks, []);
});


test('Retry recovery can confirm an uncertain saved-draft checkpoint even when the editor is clean', async t => {
  const f = cloudRecoveryFixture(t); f.props.dirty = false; f.h.render(f.Component); f.fail(true);
  await f.api.checkpointSaved(f.props.content, f.props.revision); f.fail(false); await f.api.checkpoint();
  assert.equal(f.writes.length, 2, 'Visible Retry recovery must not silently do nothing after successful Save draft');
  assert.equal(f.writes[1].operationId, f.writes[0].operationId); assert.deepEqual(f.writes[1], f.writes[0]);
});


test('stale public client theme hint cannot initialize either Auth app on any private preview or Hub route', async t => {
  const f = authFixture(t), api = f.h.load('src/components/theme-public-account.ts'); api.rememberPublicThemeRole('client');
  for (const path of ['/taylor', '/taylor/live-preview', '/taylor/preview', '/owner', '/owner/settings', '/client-hub', '/hub-window', '/api/site-theme']) f.cleanups.push(api.watchPublicThemeAccount(path, () => assert.fail('Private routes must never start a public cosmetic account bridge')));
  await f.settled(); assert.equal(f.auths.size, 0); assert.deepEqual(f.signouts, []);
});

test('ordinary public owner theme verification initializes only the hinted owner app', async t => {
  const f = authFixture(t), api = f.h.load('src/components/theme-public-account.ts'), seen = [];
  api.rememberPublicThemeRole('owner'); f.cleanups.push(api.watchPublicThemeAccount('/premades', value => seen.push(value))); await f.settled();
  assert.equal(seen.at(-1)?.role, 'owner'); assert.equal(seen.at(-1)?.accountKey, OWNER);
  assert.deepEqual([...f.auths.keys()], ['tmc-private-owner']); assert.deepEqual(f.signouts, []);
});

test('ordinary public client theme epoch failure only unbinds cosmetics, never signs out either role', async t => {
  const f = authFixture(t), api = f.h.load('src/components/theme-public-account.ts'), seen = [];
  api.rememberPublicThemeRole('client'); f.cleanups.push(api.watchPublicThemeAccount('/', value => seen.push(value))); await f.settled();
  assert.equal(seen.at(-1)?.accountKey, CID); assert.deepEqual([...f.auths.keys()], ['tmc-client-hub']);
  const epoch = f.snapshots.find(item => item.target.path === `hubClients/${CID}`); assert.ok(epoch);
  epoch.failure(Object.assign(new Error('epoch revoked'), { code: 'permission-denied' })); await f.settled();
  assert.equal(seen.at(-1), null); assert.deepEqual(f.signouts, []); assert.equal(f.auth().currentUser, f.clientUser);
});

test('retired public theme verification cannot publish an account or revoke sessions after opening owner preview', async t => {
  const f = authFixture(t), api = f.h.load('src/components/theme-public-account.ts'), seen = []; let reject;
  f.clientUser.getIdTokenResult = () => new Promise((_resolve, fail) => { reject = fail; });
  api.rememberPublicThemeRole('client'); const stop = api.watchPublicThemeAccount('/', value => seen.push(value)); f.cleanups.push(stop); await f.settled(); assert.ok(reject);
  stop(); const owner = f.h.load('src/owner/firebase-client.ts'), connection = owner.getOwnerFirebaseClient(owner.readOwnerFirebaseConfig()); await owner.verifyOwnerSession(connection, f.ownerUser);
  reject(Object.assign(new Error('obsolete client token'), { code: 'auth/user-disabled' })); await f.settled();
  assert.ok(seen.every(value => value === null)); assert.deepEqual(f.signouts, []); assert.equal(connection.auth.currentUser, f.ownerUser); assert.equal(f.auth().currentUser, f.clientUser);
});
