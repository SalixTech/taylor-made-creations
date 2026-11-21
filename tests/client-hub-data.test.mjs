import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceLoader } from './scout-source-loader.mjs';

// Every Firebase dependency is replaced before evaluation. No real SDK, token,
// account, configuration, or network connection is used by these fixtures.
const ID = 'TMC-0123456789ABCDEF', OTHER = 'TMC-FEDCBA9876543210';
const PID = '11111111-1111-4111-8111-111111111111', OP = '22222222-2222-4222-8222-222222222222';
const CODE = 'TMC-' + 'A_b-'.repeat(8), ISO = '2026-10-26T21:00:00.000Z';
const account = (patch = {}) => ({ clientId: ID, displayName: 'Test client', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO, ...patch });
const project = (patch = {}) => ({ projectId: PID, clientId: ID, title: 'Test commission', summary: '', status: 'queued', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO, ...patch });
const environment = { apiKey: 'AIza' + 'a'.repeat(35), authDomain: 'taylor-made-creations.firebaseapp.com', projectId: 'taylor-made-creations', storageBucket: 'taylor-made-creations.firebasestorage.app', messagingSenderId: '123456', appId: '1:123456:web:abc123' };
const names = { apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY', authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', appId: 'NEXT_PUBLIC_FIREBASE_APP_ID' };
const prior = {}, priorWindow = globalThis.window;
before(() => { for (const [key, name] of Object.entries(names)) { prior[name] = process.env[name]; process.env[name] = environment[key]; } globalThis.window = {}; });
after(() => { for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow; });
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function clientFixture() {
  const ownerUser = { uid: 'test-owner' }, ownerApp = { name: 'tmc-private-owner', options: environment }, ownerAuth = { currentUser: ownerUser };
  const apps = [ownerApp], listeners = new Set(), snapshots = new Set(), calls = [], reads = [], authCalls = [];
  const documents = new Map([[`hubClients/${ID}`, account()], [`hubProjects/${PID}`, project()]]);
  let exchangeHook, signInHook, signOutHook, readHook, tokenHook, claims = { hubRole: 'client', hubClientId: ID, hubAuthVersion: 1 }, queryOverride;
  const auth = { currentUser: null }, db = {};
  const user = { uid: `hub:${ID}`, getIdTokenResult: async force => { await tokenHook?.(force); return { claims: { ...claims } }; } };
  const emit = value => { auth.currentUser = value; for (const listener of listeners) listener(value); };
  const snapshot = value => ({ metadata: { fromCache: false }, exists: () => value !== undefined, data: () => structuredClone(value) });
  const sdk = {
    'firebase/app': { getApps: () => apps, initializeApp: (options, name) => { assert.equal(name, 'tmc-client-hub'); const app = { options, name }; apps.push(app); return app; } },
    'firebase/auth': {
      browserSessionPersistence: { type: 'SESSION' },
      initializeAuth: (app, options) => { assert.notEqual(app, ownerApp); assert.equal(options.persistence.type, 'SESSION'); authCalls.push(app.name); return auth; },
      onIdTokenChanged: (_auth, callback) => { assert.equal(_auth, auth); listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); }); return () => listeners.delete(callback); },
      signInWithCustomToken: async (_auth, token) => { assert.equal(_auth, auth); assert.equal(token, 'test-custom-token'); await signInHook?.(); emit(user); return { user }; },
      signOut: async _auth => { assert.equal(_auth, auth); await signOutHook?.(); emit(null); },
    },
    'firebase/functions': {
      getFunctions: (app, region) => { assert.equal(app.name, 'tmc-client-hub'); assert.equal(region, 'us-central1'); return {}; },
      httpsCallable: (_functions, name) => async input => { calls.push({ name, input: structuredClone(input) }); const response = await exchangeHook?.(input); return { data: response ?? { token: 'test-custom-token', clientId: ID } }; },
    },
    'firebase/firestore': {
      getFirestore: app => { assert.equal(app.name, 'tmc-client-hub'); return db; },
      onSnapshot: (target, _options, callback, error) => { const listener = { target, callback, error }; snapshots.add(listener); queueMicrotask(() => { if (snapshots.has(listener)) callback(target.filter ? { metadata: { fromCache: false }, docs: [...documents].filter(([path, value]) => path.startsWith(target.path + '/') && value.clientId === target.filter.value).map(([path, value]) => ({ id: path.split('/')[1], data: () => structuredClone(value) })) } : snapshot(documents.get(target.path))); }); return () => snapshots.delete(listener); },
      doc: (_db, ...parts) => { assert.equal(_db, db); return { path: parts.join('/') }; },
      collection: (_db, path) => { assert.equal(_db, db); return { path }; },
      where: (field, operator, value) => ({ field, operator, value }), query: (target, filter) => ({ ...target, filter }),
      getDocFromServer: async target => { reads.push(target); await readHook?.(target); return snapshot(documents.get(target.path)); },
      getDocsFromServer: async target => { reads.push(target); await readHook?.(target); assert.deepEqual(target.filter, { field: 'clientId', operator: '==', value: ID }); return { docs: (queryOverride ?? [...documents].filter(([path, value]) => path.startsWith('hubProjects/') && value.clientId === ID)).map(([path, value]) => ({ id: path.split('/')[1], data: () => structuredClone(value) })) }; },
    },
  };
  const client = sourceLoader(sdk)('src/client-hub/client.ts');
  return { client, auth, user, ownerAuth, ownerUser, apps, calls, reads, documents, authCalls, emit, emitSnapshot: (path, value, fromCache = false) => { for (const listener of snapshots) if (listener.target.path === path) listener.callback({ ...snapshot(value), metadata: { fromCache } }); }, snapshotCount: () => snapshots.size, emitRawSnapshot: (path, value) => { for (const listener of snapshots) if (listener.target.path === path) listener.callback(value); }, claims: value => { claims = value; }, exchangeHook: value => { exchangeHook = value; }, signInHook: value => { signInHook = value; }, signOutHook: value => { signOutHook = value; }, readHook: value => { readHook = value; }, tokenHook: value => { tokenHook = value; }, queryOverride: value => { queryOverride = value; } };
}

test('configuration rejects missing, placeholders and unrelated projects without installing runtime credentials', () => {
  const f = clientFixture(); assert.equal(f.client.readClientHubFirebaseConfig(environment).status, 'ready');
  for (const key of Object.keys(environment)) {
    assert.equal(f.client.readClientHubFirebaseConfig({ ...environment, [key]: undefined }).status, 'missing');
    assert.equal(f.client.readClientHubFirebaseConfig({ ...environment, [key]: 'REDACTED' }).status, 'invalid');
  }
  assert.equal(f.client.readClientHubFirebaseConfig({ ...environment, projectId: 'unrelated-project' }).status, 'invalid');
  assert.equal(f.apps.length, 1); assert.equal(f.authCalls.length, 0);
});
test('config failure is delivered to subscription without connecting or manufacturing a session', async () => {
  const f = clientFixture(), sessions = [], errors = [], saved = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  try { const stop = f.client.subscribeClientSession(value => sessions.push(value), error => errors.push(error)); await turn(); stop(); assert.deepEqual(sessions, [null]); assert.equal(errors[0].code, 'configuration'); assert.equal(f.apps.length, 1); } finally { process.env.NEXT_PUBLIC_FIREBASE_API_KEY = saved; }
});
test('client sign-in and sign-out use a distinct session-only app and never replace owner authentication', async () => {
  const f = clientFixture(), sessions = []; const stop = f.client.subscribeClientSession(value => sessions.push(value)); await turn();
  const session = await f.client.signInClient(`  ${CODE}  `); await turn();
  assert.deepEqual(session, { uid: `hub:${ID}`, clientId: ID, authVersion: 1 });
  assert.deepEqual(f.calls, [{ name: 'tmcHubSignIn', input: { code: CODE } }]);
  assert.equal(f.apps.filter(app => app.name === 'tmc-client-hub').length, 1); assert.equal(sessions.at(-1).clientId, ID);
  await f.client.signOutClient(); assert.equal(sessions.at(-1), null); assert.equal(f.ownerAuth.currentUser, f.ownerUser); stop();
  const source = readFileSync(new URL('../src/client-hub/client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|connectAuthEmulator|connectFirestoreEmulator/);
  assert.doesNotMatch(source, /setDoc|updateDoc|addDoc|runTransaction|enableIndexedDbPersistence/);
});
test('permanent ID, lowercased prefix, and malformed sign-in codes are rejected before a callable', async () => {
  const f = clientFixture(); for (const code of [ID, CODE.replace('TMC-', 'tmc-'), '', CODE + 'a']) await assert.rejects(f.client.signInClient(code), error => error.code === 'invalid-code'); assert.equal(f.calls.length, 0);
});
test('callable authentication failures are generic and missing deployment is reported as setup, not empty data', async () => {
  const f = clientFixture(); f.exchangeHook(() => { throw Object.assign(new Error('secret: must never surface'), { code: 'functions/unauthenticated' }); });
  await assert.rejects(f.client.signInClient(CODE), error => error.code === 'invalid-code' && !error.message.includes('secret'));
  assert.match(f.client.clientHubErrorMessage({ code: 'functions/not-found' }), /setup is incomplete/);
  assert.match(f.client.clientHubErrorMessage({ code: 'functions/unavailable' }), /could not be reached/);
  assert.doesNotMatch(f.client.clientHubErrorMessage(new Error('secret login token in unknown upstream failure')), /secret|token/);
});
test('one client reads only its own projects and never its private owner contact document', async () => {
  const f = clientFixture(); f.documents.set(`hubProjects/33333333-3333-4333-8333-333333333333`, project({ projectId: '33333333-3333-4333-8333-333333333333', clientId: OTHER }));
  const session = await f.client.signInClient(CODE), dashboard = await f.client.loadClientDashboard(session);
  assert.equal(dashboard.projects.length, 1); assert.equal(dashboard.client.clientId, ID);
  assert.deepEqual(f.reads.map(read => read.path), [`hubClients/${ID}`, 'hubProjects']);
  assert.equal(f.reads.some(read => read.path.includes('Private')), false);
});
test('reset epoch, suspended account and altered claims fail before projects are read', async () => {
  for (const patch of [{ authVersion: 2 }, { status: 'suspended' }]) {
    const f = clientFixture(), session = await f.client.signInClient(CODE); f.documents.set(`hubClients/${ID}`, account(patch));
    await assert.rejects(f.client.loadClientDashboard(session), error => f.client.isClientHubSessionError(error)); assert.equal(f.reads.length, 1);
  }
  const f = clientFixture(), session = await f.client.signInClient(CODE); f.claims({ hubRole: 'client', hubClientId: OTHER, hubAuthVersion: 1 });
  await assert.rejects(f.client.loadClientDashboard(session), error => f.client.isClientHubSessionError(error)); assert.equal(f.reads.length, 0);
});
test('cross-client or mismatched project responses fail closed rather than showing leaked data', async () => {
  const f = clientFixture(), session = await f.client.signInClient(CODE); f.queryOverride([[`hubProjects/${PID}`, project({ clientId: OTHER })]]);
  await assert.rejects(f.client.loadClientDashboard(session), /mismatched commission/);
  f.queryOverride([[`hubProjects/${PID}`, project({ projectId: OP })]]); await assert.rejects(f.client.loadClientDashboard(session), /mismatched commission/);
});
test('sign-out and abort during reads discard stale private results', async () => {
  for (const mode of ['logout', 'abort']) {
    const f = clientFixture(), session = await f.client.signInClient(CODE), controller = new AbortController();
    f.readHook(() => mode === 'logout' ? f.emit(null) : controller.abort());
    await assert.rejects(f.client.loadClientDashboard(session, controller.signal), error => mode === 'logout' ? f.client.isClientHubSessionError(error) : error.name === 'AbortError'); assert.equal(f.reads.length, 1);
  }
});
test('logout intent blocks a read result even before asynchronous SDK logout completes', async () => {
  const f = clientFixture(), session = await f.client.signInClient(CODE), pending = deferred(); let logout;
  f.signOutHook(() => pending.promise); f.readHook(() => { logout = f.client.signOutClient(); });
  await assert.rejects(f.client.loadClientDashboard(session), error => f.client.isClientHubSessionError(error));
  assert.equal(f.auth.currentUser, f.user); pending.resolve(); await logout;
});
test('sign-out while callable is pending prevents later login and repeated clicks do not call twice', async () => {
  const f = clientFixture(), pending = deferred(); f.exchangeHook(() => pending.promise);
  const login = f.client.signInClient(CODE); await assert.rejects(f.client.signInClient(CODE), error => error.code === 'busy');
  await f.client.signOutClient(); pending.resolve({ token: 'test-custom-token', clientId: ID }); await assert.rejects(login, error => f.client.isClientHubSessionError(error));
  assert.equal(f.auth.currentUser, null); assert.equal(f.calls.length, 1); assert.equal(f.ownerAuth.currentUser, f.ownerUser);
});
test('sign-out during SDK token exchange never emits the late-created session to subscribers', async () => {
  const f = clientFixture(), pending = deferred(), sessions = []; f.signInHook(() => pending.promise);
  const stop = f.client.subscribeClientSession(value => sessions.push(value)); await turn();
  const login = f.client.signInClient(CODE); await turn(); await f.client.signOutClient(); pending.resolve();
  await assert.rejects(login, error => f.client.isClientHubSessionError(error)); await turn(); assert.equal(f.auth.currentUser, null);
  assert.ok(sessions.every(session => session === null)); stop();
});
test('a delayed logout blocks a newer login until it cannot clear the new session', async () => {
  const f = clientFixture(), pending = deferred(); await f.client.signInClient(CODE); f.signOutHook(() => pending.promise);
  const logout = f.client.signOutClient(); await assert.rejects(f.client.signInClient(CODE), error => error.code === 'busy');
  assert.equal(f.calls.length, 1); pending.resolve(); await logout; f.signOutHook(null);
  const session = await f.client.signInClient(CODE); assert.equal(session.clientId, ID); assert.equal(f.auth.currentUser, f.user);
});
test('failed logout keeps subscriptions and dashboard locked until a successful explicit login', async () => {
  const f = clientFixture(), sessions = [], errors = [];
  const stop = f.client.subscribeClientSession(value => sessions.push(value), error => errors.push(error)); await turn();
  const previous = await f.client.signInClient(CODE); await turn();
  f.signOutHook(() => { throw new Error('SDK storage failure'); }); await assert.rejects(f.client.signOutClient());
  const start = sessions.length; f.emit(f.user); await turn();
  assert.ok(sessions.slice(start).every(session => session === null)); assert.ok(errors.some(error => f.client.isClientHubSessionError(error)));
  await assert.rejects(f.client.loadClientDashboard(previous), error => f.client.isClientHubSessionError(error));
  f.signOutHook(null); const current = await f.client.signInClient(CODE); await turn(); assert.equal(current.clientId, ID); assert.equal(sessions.at(-1).clientId, ID); stop();
});
test('an unsubscribed or superseded asynchronous auth result cannot restore an old session', async () => {
  const f = clientFixture(), pending = deferred(), sessions = []; f.tokenHook(() => pending.promise);
  const stop = f.client.subscribeClientSession(value => sessions.push(value)); await turn(); f.emit(f.user); f.emit(null); pending.resolve(); await turn();
  assert.deepEqual(sessions, [null, null]); stop(); f.emit(f.user); await turn(); assert.deepEqual(sessions, [null, null]);
});

function ownerFixture() {
  const documents = new Map([[`hubClients/${ID}`, account()], [`hubClientPrivate/${ID}`, { clientId: ID, email: 'client@example.test' }], [`hubProjects/${PID}`, project()]]), calls = [], reads = [];
  let response, afterCall, valid = true, sessionCount = 0;
  const app = { name: 'tmc-private-owner' }, session = { auth: { app }, db: {}, assertCurrent: () => { if (!valid) throw new Error('Your owner session changed.'); } };
  const fs = { doc: (_db, ...parts) => ({ path: parts.join('/') }), collection: (_db, path) => ({ path }), where: (field, operator, value) => ({ field, operator, value }), query: (target, filter) => ({ ...target, filter }), getDoc: async target => { reads.push(target); const value = documents.get(target.path); return { exists: () => value !== undefined, data: () => structuredClone(value) }; }, getDocs: async target => { reads.push(target); return { docs: [...documents].filter(([path, value]) => path.startsWith(target.path + '/') && (!target.filter || value[target.filter.field] === target.filter.value)).map(([path, value]) => ({ id: path.split('/')[1], data: () => structuredClone(value) })) }; } };
  const client = sourceLoader({
    '@/client-hub/callable-owner-session': { hubCallableOwnerSession: async () => { sessionCount++; session.assertCurrent(); return session; } },
    'firebase/firestore/lite': fs,
    'firebase/firestore': { ...fs, getFirestore: () => session.db },
    'firebase/functions': { getFunctions: (actual, region) => { assert.equal(actual, app); assert.equal(region, 'us-central1'); return {}; }, httpsCallable: (_functions, name) => async input => { calls.push({ name, input: structuredClone(input) }); await afterCall?.(); return { data: structuredClone(response) }; } },
    './taylor-services-client': { taylorOwnerSession: async () => { sessionCount++; session.assertCurrent(); return session; } },
    '@/client-hub/client': { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', clientHubErrorMessage: error => error.message },
  })('src/owner/client-hub-client.ts');
  return { client, calls, reads, documents, response: value => { response = value; }, afterCall: value => { afterCall = value; }, invalidate: () => { valid = false; }, sessions: () => sessionCount };
}
test('owner client detail reads separately protected email and client-filtered commissions', async () => {
  const f = ownerFixture(), detail = await f.client.getClientDetail(ID); assert.equal(detail.email, 'client@example.test'); assert.equal(detail.client.clientId, ID); assert.equal(detail.projects.length, 1);
  assert.deepEqual(f.reads.map(read => read.path), [`hubClients/${ID}`, `hubClientPrivate/${ID}`, 'hubProjects']); assert.deepEqual(f.reads[2].filter, { field: 'clientId', operator: '==', value: ID });
  assert.equal((await f.client.listClients()).length, 1);
});
test('owner creation retains the provided operation ID and replay does not manufacture a code', async () => {
  const f = ownerFixture(), input = { operationId: OP, displayName: ' Test client ', email: ' client@example.test ', projectTitle: ' New commission ' };
  f.response({ client: account(), project: project(), signInCode: CODE }); assert.equal((await f.client.createClient(input)).signInCode, CODE);
  f.response({ client: account(), project: project() }); const replay = await f.client.createClient(input); assert.equal(Object.hasOwn(replay, 'signInCode'), false);
  assert.deepEqual(f.calls[0], { name: 'tmcHubCreateClient', input: { operationId: OP, displayName: 'Test client', email: 'client@example.test', projectTitle: 'New commission' } }); assert.deepEqual(f.calls[1], f.calls[0]);
});
test('owner update/reset/status use server callables with optimistic versions, never direct document writes', async () => {
  const f = ownerFixture(); f.response({ project: project({ version: 2, progress: 40, status: 'in-progress' }) });
  await f.client.updateProject({ projectId: PID, expectedVersion: 1, title: 'Test commission', summary: '', status: 'in-progress', progress: 40, trackingUrl: null });
  assert.equal(f.calls.at(-1).name, 'tmcHubUpdateProject'); assert.equal(f.calls.at(-1).input.expectedVersion, 1);
  f.response({ clientId: ID, authVersion: 2, signInCode: CODE }); await f.client.resetClientLoginCode({ clientId: ID, expectedAuthVersion: 1 }); assert.equal(f.calls.at(-1).name, 'tmcHubResetClientCode');
  f.response({ client: account({ authVersion: 2, status: 'suspended' }) }); await f.client.setClientStatus({ clientId: ID, expectedAuthVersion: 1, status: 'suspended' }); assert.equal(f.calls.at(-1).name, 'tmcHubSetClientStatus');
  assert.equal(f.reads.length, 0); const source = readFileSync(new URL('../src/owner/client-hub-client.ts', import.meta.url), 'utf8'); assert.doesNotMatch(source, /setDoc|updateDoc|runTransaction|localStorage|sessionStorage/);
});
test('invalid owner inputs fail before authentication or network calls', async () => {
  const f = ownerFixture();
  for (const input of [{ operationId: 'not-an-id', displayName: 'Name' }, { operationId: OP, displayName: 'x'.repeat(101) }, { operationId: OP, displayName: 'Name', email: 'not-email' }]) await assert.rejects(f.client.createClient(input));
  for (const progress of [-1, 101, 1.5, '25']) await assert.rejects(f.client.updateProject({ projectId: PID, expectedVersion: 1, title: 'Title', summary: '', status: 'queued', progress }));
  for (const trackingUrl of ['javascript:alert(1)', 'http://example.test/track', 'https://user:secret@example.test/track']) await assert.rejects(f.client.updateProject({ projectId: PID, expectedVersion: 1, title: 'Title', summary: '', status: 'queued', progress: null, trackingUrl }));
  assert.equal(f.sessions(), 0); assert.equal(f.calls.length, 0);
});
test('owner session loss after mutation is an unconfirmed outcome, not a successful save', async () => {
  const f = ownerFixture(); f.response({ clientId: ID, authVersion: 2, signInCode: CODE }); f.afterCall(() => f.invalidate());
  await assert.rejects(f.client.resetClientLoginCode({ clientId: ID, expectedAuthVersion: 1 }), /session changed/); assert.equal(f.calls.length, 1);
});
test('safe model decoders omit private and secret fields, reject invalid progress and unsafe links', () => {
  const model = sourceLoader()('src/client-hub/model.ts');
  const decoded = model.decodeClientHubClient(account({ email: 'secret@example.test', signInCode: CODE, codeHash: 'private' }), ID);
  for (const key of ['email', 'signInCode', 'codeHash']) assert.equal(Object.hasOwn(decoded, key), false);
  for (const progress of [-1, 101, 2.5, '40', undefined]) assert.throws(() => model.decodeClientHubProject(project({ progress })));
  for (const trackingUrl of ['javascript:alert(1)', 'http://example.test/', 'https://person:password@example.test/']) assert.throws(() => model.decodeClientHubProject(project({ trackingUrl })));
  assert.equal(model.decodeClientHubProject(project({ progress: 0 })).progress, 0); assert.equal(model.decodeClientHubProject(project()).progress, null);
});

test('owner diagnostics distinguish backend deployment and owner access from client code problems', () => {
  const f = ownerFixture(); assert.match(f.client.clientHubErrorMessage({ code: 'functions/not-found' }), /backend must be deployed/);
  const denied = f.client.clientHubErrorMessage({ code: 'permission-denied' }); assert.match(denied, /owner access/); assert.doesNotMatch(denied, /current code/);
});

test('owner profile edit preserves permanent identity and expects a newer saved timestamp', async () => {
  const f = ownerFixture(), updatedAt='2026-10-26T21:00:00.001Z';
  f.response({client:account({displayName:'New name',updatedAt}),email:'new@example.test'});
  const saved=await f.client.updateClientProfile({clientId:ID,expectedUpdatedAt:ISO,displayName:' New name ',email:' new@example.test '});
  assert.equal(saved.client.clientId,ID);assert.equal(saved.client.authVersion,1);assert.equal(saved.email,'new@example.test');
  assert.equal(Object.hasOwn(saved.client,'email'),false);
  assert.deepEqual(f.calls,[{name:'tmcHubUpdateClientProfile',input:{clientId:ID,expectedUpdatedAt:ISO,displayName:'New name',email:'new@example.test'}}]);
});
test('profile edit rejects invalid inputs before auth, stale responses and private-email mismatch', async () => {
  const f=ownerFixture(),good={clientId:ID,expectedUpdatedAt:ISO,displayName:'Name',email:'new@example.test'};
  for(const patch of [{clientId:'wrong'},{expectedUpdatedAt:'yesterday'},{displayName:''},{email:'bad'}])await assert.rejects(f.client.updateClientProfile({...good,...patch}));
  assert.equal(f.sessions(),0);assert.equal(f.calls.length,0);
  for(const patch of [{client:account({displayName:'Name'})},{email:'wrong@example.test'}]){
    f.response({client:account({displayName:'Name',updatedAt:'2026-10-26T21:00:00.001Z'}),email:'new@example.test',...patch});
    await assert.rejects(f.client.updateClientProfile(good),/not confirmed/);
  }
});


test('active epoch subscription clears a suspended/reset account immediately and cleans up listeners', async () => {
  for (const patch of [{status:'suspended',authVersion:2},{authVersion:2}]) {
    const f=clientFixture(), sessions=[],errors=[]; const stop=f.client.subscribeClientSession(s=>sessions.push(s),e=>errors.push(e)); await turn();
    await f.client.signInClient(CODE); await turn(); assert.equal(sessions.at(-1).clientId,ID); assert.equal(f.snapshotCount(),1);
    f.emitSnapshot(`hubClients/${ID}`,account(patch)); await turn();
    assert.equal(sessions.at(-1),null); assert.equal(f.auth.currentUser,null); assert.ok(errors.some(e=>f.client.isClientHubSessionError(e))); assert.equal(f.snapshotCount(),0); stop();
  }
});
test('live dashboard publishes only server snapshots and never marks a conversation read', async () => {
  const f=clientFixture(),session=await f.client.signInClient(CODE),dashboards=[],errors=[];
  const stop=f.client.subscribeClientDashboard(session,d=>dashboards.push(d),e=>errors.push(e)); await turn();
  assert.equal(dashboards.length,1); assert.equal(dashboards[0].projects.length,1);
  f.emitSnapshot(`hubClients/${ID}`,account({nickname:'Cached'}),true);assert.equal(dashboards.length,1);
  f.emitSnapshot(`hubClients/${ID}`,account({nickname:'Live'}));assert.equal(dashboards.at(-1).client.nickname,'Live');
  assert.equal(f.calls.length,1,'only sign-in callable, snapshots never write read state');
  stop(); assert.equal(f.snapshotCount(),0); f.emitSnapshot(`hubClients/${ID}`,account({nickname:'Late'})); assert.equal(dashboards.at(-1).client.nickname,'Live'); assert.deepEqual(errors,[]);
});
test('unsubscribing during async dashboard setup prevents late listener attachment or data emission',async()=>{
 const f=clientFixture(),session=await f.client.signInClient(CODE),gate=deferred(),data=[];f.readHook(()=>gate.promise);
 const stop=f.client.subscribeClientDashboard(session,d=>data.push(d),()=>{});stop();gate.resolve();await turn();
 assert.equal(f.snapshotCount(),0);assert.deepEqual(data,[]);
});


test('manual tag adapters reject invalid values before auth and carry only explicit validated metadata',async()=>{
 const f=ownerFixture(),input={projectId:PID,expectedVersion:1,title:'Title',summary:'',status:'queued',progress:null};
 for(const informationTags of [null,['paid-100','paid-partial'],['paid-100','paid-100'],['verified']])await assert.rejects(f.client.updateProject({...input,informationTags}));assert.equal(f.sessions(),0);assert.equal(f.calls.length,0);
 f.response({project:project({version:2,informationTags:['paid-partial','dtd-needed']})});await f.client.updateProject({...input,informationTags:['dtd-needed','paid-partial']});assert.deepEqual(f.calls.at(-1).input.informationTags,['paid-partial','dtd-needed']);
 f.response({project:project({version:2})});await f.client.updateProject(input);assert.equal(Object.hasOwn(f.calls.at(-1).input,'informationTags'),false);
});

test('tracking visibility crosses actual create and update callable serializers, including false and omission', async()=>{
 for(const trackingEnabled of [false,true,undefined]){
  const f=ownerFixture(), option=trackingEnabled===undefined?{}:{trackingEnabled};
  f.response({project:project({...option})});
  await f.client.createProject({operationId:OP,clientId:ID,title:'Tracking test',...option});
  assert.equal(Object.hasOwn(f.calls.at(-1).input,'trackingEnabled'),trackingEnabled!==undefined);
  assert.equal(f.calls.at(-1).input.trackingEnabled,trackingEnabled);
  f.response({project:project({version:2,...option})});
  const result=await f.client.updateProject({projectId:PID,expectedVersion:1,title:'Tracking test',summary:'',status:'queued',progress:null,...option});
  assert.equal(Object.hasOwn(f.calls.at(-1).input,'trackingEnabled'),trackingEnabled!==undefined);
  assert.equal(f.calls.at(-1).input.trackingEnabled,trackingEnabled);
  assert.equal(result.project.trackingEnabled,trackingEnabled);
 }
});
test('tracking visibility rejects invalid values before opening an owner session or making a call',async()=>{
 for(const trackingEnabled of [null,0,1,'false',{},[]]){
  const f=ownerFixture();
  await assert.rejects(f.client.createProject({operationId:OP,clientId:ID,title:'Tracking test',trackingEnabled}));
  await assert.rejects(f.client.updateProject({projectId:PID,expectedVersion:1,title:'Tracking test',summary:'',status:'queued',progress:null,trackingEnabled}));
  assert.equal(f.sessions(),0);assert.equal(f.calls.length,0);
 }
});
test('tracking save does not report a confirmed project when callable response omits or changes the requested flag',async()=>{
 for(const responseFlag of [undefined,true]){
  const f=ownerFixture(), extra=responseFlag===undefined?{}:{trackingEnabled:responseFlag};
  f.response({project:project(extra)});
  await assert.rejects(f.client.createProject({operationId:OP,clientId:ID,title:'Tracking test',trackingEnabled:false}),/tracking choice could not be confirmed/);
  f.response({project:project({version:2,...extra})});
  await assert.rejects(f.client.updateProject({projectId:PID,expectedVersion:1,title:'Tracking test',summary:'',status:'queued',progress:null,trackingEnabled:false}),/tracking choice could not be confirmed/);
 }
});
test('Fox15 local label transport atomically serializes definitions/assignment and rejects incomplete returned state',async()=>{
 const f=ownerFixture(),key='custom:local_00000000000000000000000000000001',localLabelDefinitions={[key]:{name:'Local only',color:'#aabbcc'}},saved={[key]:{name:'Local only',color:'#AABBCC'}};
 f.response({project:project({localLabelDefinitions:saved,informationTags:[key]})});await f.client.createProject({operationId:OP,clientId:ID,title:'Local',informationTags:[key],localLabelDefinitions});assert.deepEqual(f.calls.at(-1).input.localLabelDefinitions,saved);assert.deepEqual(f.calls.at(-1).input.informationTags,[key]);
 f.response({project:project({version:2,localLabelDefinitions:saved,informationTags:[]})});await f.client.updateProject({projectId:PID,expectedVersion:1,title:'Local',summary:'',status:'queued',progress:null,localLabelDefinitions,informationTags:[]});assert.deepEqual(f.calls.at(-1).input.localLabelDefinitions,saved);assert.deepEqual(f.calls.at(-1).input.informationTags,[]);
 f.response({project:project({version:2})});await assert.rejects(f.client.updateProject({projectId:PID,expectedVersion:1,title:'Local',summary:'',status:'queued',progress:null,localLabelDefinitions}),/could not be confirmed/);
 await f.client.updateProject({projectId:PID,expectedVersion:1,title:'Omission',summary:'',status:'queued',progress:null});assert.equal(Object.hasOwn(f.calls.at(-1).input,'localLabelDefinitions'),false);
});
test('Fox15 malformed scoped definitions are rejected by project decoder without reinterpreting legacy literal tags',()=>{
 const model=sourceLoader({})('src/client-hub/model.ts'),key='custom:local_00000000000000000000000000000001';assert.deepEqual(model.decodeClientHubProject(project({informationTags:[key]})).informationTags,[key]);assert.equal(model.decodeClientHubProject(project({informationTags:[key]})).localLabelDefinitions,undefined);
 for(const definitions of [{[key]:{name:'Unsafe',color:'red'}},{'custom:Other':{name:'Wrong identity',color:null}},null])assert.throws(()=>model.decodeClientHubProject(project({localLabelDefinitions:definitions})));
});
test('Fox15 100 global plus 100 local assigned definitions fit scoped projection without leaking other entries',()=>{const load=sourceLoader({}),model=load('src/client-hub/model.ts'),labels=load('src/client-hub/label-presentation.ts'),presentation=labels.emptyLabelPresentation(),local={},tags=[];for(let n=0;n<100;n++){const suffix=String(n).padStart(32,'0'),g=`custom:id_${suffix}`,l=`custom:local_${suffix}`;tags.push(g,l);local[l]={name:`Local${n}`,color:null};presentation.entries[g]={name:`Global${n}`,color:null,hidden:false,deleted:false};presentation.entries[l]={...local[l],hidden:false,deleted:false};presentation.order.push(g,l);}assert.equal(model.decodeClientHubProject(project({informationTags:tags,localLabelDefinitions:local})).informationTags.length,200);assert.equal(Object.keys(labels.decodeLabelPresentation(presentation).entries).length,206);});
