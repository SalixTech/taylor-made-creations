// Independent component-hook regressions. No browser/pixel or live-service claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const CLIENT = 'TMC-0000000000000301', OTHER = 'TMC-0000000000000302';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISO = '2026-10-27T17:00:00.000Z';
const row = (version = 2, clientId = CLIENT, projectId = uuid(1)) => ({ notificationId: `${projectId}-client-chat`, clientId, projectId, recipientRole: 'client', channel: 'chat', latestItemId: uuid(999), latestAt: ISO, version, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null });
function bell(t, action) {
  const h = harness(), subscriptions = [], actions = [], storage = new Map();
  h.document.visibilityState = 'visible'; h.document.hasFocus = () => true;
  h.window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  h.globals.Notification = class { static permission = 'default'; };
  h.globals.Audio = class { constructor() { throw Error('No application audio for clients'); } };
  h.overrides['./workspace-client'] = { subscribeHubNotifications(_owner, onData, onError) { const sub = { onData, onError }; subscriptions.push(sub); return () => { sub.stopped = true; }; } };
  h.overrides['./notification-client'] = {
    loadHubNotificationLabels: async () => ({ [uuid(1)]: 'Private project', [uuid(2)]: 'Next account project' }),
    async changeHubNotifications(...args) { actions.push(args); return action(...args); },
  };
  const C = h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell, props = { owner: false, accountKey: CLIENT }, render = () => h.render(C, props);
  const button = label => h.find(n => n.type === 'button' && (content(n) === label || n.props.title === label || n.props['aria-label'] === label));
  render(); t.after(() => h.unmount());
  return { h, props, render, button, subscriptions, actions, rows: () => h.all(n => n.type === 'li'), async ready() { await tick(); render(); }, open() { button('Notifications').props.onClick(); render(); } };
}

test('notification X immediately hides only the captured version; newer arrivals stay visible before and after confirmation', async t => {
  const gate = deferred(), f = bell(t, () => gate.promise); await f.ready(); f.subscriptions[0].onData([row()]); await f.ready(); f.open();
  const original = row(), dismiss = f.button('Dismiss Private project, Maker Chat notification'); dismiss.props.onClick(); dismiss.props.onClick(); f.render();
  assert.equal(f.actions.length, 1); assert.equal(f.rows().length, 0, 'visual close must not wait for network');
  assert.deepEqual(f.actions[0][2], [original], 'Captured payload cannot acquire fabricated read cursors');
  f.subscriptions[0].onData([row(3)]); f.render(); assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /1 unread message/);
  gate.resolve([{ ...original, dismissedVersion: 2 }]); await f.ready(); assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /1 unread message/);
  assert.equal(f.actions[0][2][0].readVersion, 0); assert.equal(f.actions[0][2][0].readAt, null);
});

test('uncertain optimistic dismiss rolls back only its captured overlay and leaves actual receipts untouched', async t => {
  const gate = deferred(), f = bell(t, () => gate.promise); await f.ready(); f.subscriptions[0].onData([row()]); await f.ready(); f.open();
  f.button('Dismiss Private project, Maker Chat notification').props.onClick(); f.render(); assert.equal(f.rows().length, 0);
  f.subscriptions[0].onData([row(3)]); f.render(); gate.reject(Error('Lost response')); await f.ready();
  assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /3 unread messages/); assert.match(content(f.h.tree), /could not be confirmed/);
  assert.equal(f.actions[0][2][0].readAt, null); assert.equal(f.actions[0][2][0].readVersion, 0);
});

test('late failed dismiss from account A cannot restore its data or error into account B', async t => {
  const gate = deferred(), f = bell(t, () => gate.promise); await f.ready(); f.subscriptions[0].onData([row()]); await f.ready(); f.open();
  f.button('Dismiss Private project, Maker Chat notification').props.onClick(); f.render();
  f.props.accountKey = OTHER; f.render(); await f.ready(); assert.equal(f.actions[0][3].aborted, true);
  f.subscriptions[1].onData([row(1, OTHER, uuid(2))]); await f.ready(); gate.reject(Error('Old account failure')); await f.ready();
  assert.doesNotMatch(content(f.h.tree), /Private project|Old account failure|could not be confirmed/);
  assert.match(f.button('Notifications').props['aria-label'], /1 unread update/);
});

test('popup storage readiness probe cannot overwrite a concurrent logout generation', () => {
  const h = harness(), local = new Map(), session = new Map(), marker = `tmc-hub-logout-v1:client:hub:${CLIENT}`;
  h.window.location.pathname = '/client-hub'; h.window.location.search = '';
  h.window.localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) };
  h.window.sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) };
  const api = h.load('src/client-hub/window-session.ts'); api.assertHubWindowSession('client', `hub:${CLIENT}`);
  let interleaved = false;
  h.window.localStorage.setItem = (key, value) => { if (!interleaved) { interleaved = true; local.set(marker, 'concurrent-explicit-logout'); } local.set(key, value); };
  assert.throws(() => api.hubWindowGeneration('client', `hub:${CLIENT}`), /sign-in changed/);
  assert.equal(interleaved, true); assert.equal(local.get(marker), 'concurrent-explicit-logout');
});

function ownerGate(t) {
  const h = harness(), auth = { currentUser: null }, gate = deferred(), calls = { accepted: 0, verified: 0, stores: 0, signOut: 0 }; let observer;
  const ownerUid = 'a4ARjp0z8ZOByKlC2AfGzmMRj843', user = { uid: ownerUid, email: 'local-owner@example.test' }, client = { auth, ownerUid };
  h.overrides['@/client-hub/window-session'] = { acceptHubWindowSignIn() { calls.accepted++; }, revokeHubWindows() {}, assertHubWindowSession() { if (!calls.accepted) throw Error('Old logout generation remains locked'); } };
  h.overrides['firebase/auth'] = { onAuthStateChanged(_auth, fn) { observer = fn; return () => {}; }, signInWithEmailAndPassword: () => gate.promise, signOut: async () => { calls.signOut++; auth.currentUser = null; } };
  h.overrides['./firebase-client'] = {
    readOwnerFirebaseConfig: () => ({ status: 'ready', options: { projectId: 'taylor-made-creations' }, ownerUid }), getOwnerFirebaseClient: () => client,
    ownerSignInError: () => 'Credentials failed', OwnerSessionError: class extends Error {},
    async verifyOwnerSession() { calls.verified++; if (!calls.accepted) throw Error('Credentials have not succeeded'); },
  };
  h.overrides['./firebase-store'] = { createFirebaseOwnerStore() { calls.stores++; return { dispose() {} }; } };
  h.overrides['./OwnerBrandLogo'] = { OwnerBrandLogo: () => null };
  h.overrides['./OwnerGateFrame'] = { OwnerGateFrame: () => null };
  const C = h.load('src/owner/FirebaseOwnerGate.tsx').FirebaseOwnerGate, render = () => h.render(C, { children: () => null });
  render(); t.after(() => h.unmount());
  return { h, auth, user, gate, calls, render, async start() { await tick(); observer(null); render(); }, submit() { return h.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); }, emitUser() { auth.currentUser = user; observer(user); } };
}

test('failed owner credentials cannot adopt a newer logout generation or reopen the old private session', async t => {
  const f = ownerGate(t); await f.start(); const pending = f.submit();
  assert.equal(f.calls.accepted, 0, 'Do not accept logout generation before credentials resolve');
  f.gate.reject(Error('Wrong password')); await pending; f.render();
  assert.equal(f.calls.accepted, 0); assert.equal(f.calls.stores, 0); assert.match(content(f.h.tree), /Credentials failed/);
});

test('owner Auth event arriving before successful credential response waits for generation acceptance', async t => {
  const f = ownerGate(t); await f.start(); const pending = f.submit(); f.emitUser(); await tick(); f.render();
  assert.equal(f.calls.accepted, 0); assert.equal(f.calls.verified, 0, 'Early Auth event must not race the explicit credential gate');
  f.gate.resolve({ user: f.user }); await pending; await tick(); f.render();
  assert.equal(f.calls.accepted, 1); assert.equal(f.calls.verified, 1); assert.equal(f.calls.stores, 1);
});

test('cross-window owner logout cancels an already pending successful credential exchange', async t => {
  const f = ownerGate(t); await f.start(); const pending = f.submit();
  const event = new Event('tmc-hub-session-lock'); Object.assign(event, { detail: { role: 'owner', uid: f.user.uid } }); f.h.window.dispatchEvent(event);
  f.emitUser(); f.gate.resolve({ user: f.user }); await pending; await tick(); f.render();
  assert.equal(f.calls.accepted, 0, 'A pre-logout credential attempt cannot adopt the new generation');
  assert.equal(f.calls.stores, 0); assert.ok(f.calls.signOut >= 1, 'Late credential must be cleared from the SDK'); assert.equal(f.auth.currentUser, null);
});

function windowPage(local, channels, pathname = '/client-hub', search = '') {
  const h = harness(), session = new Map(); h.window.location.pathname = pathname; h.window.location.search = search;
  h.window.localStorage = local;
  h.window.sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) };
  h.globals.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail; } };
  h.globals.BroadcastChannel = class { constructor() { channels.push(this); } postMessage(data) { for (const channel of channels) if (channel !== this && !channel.closed) channel.onmessage?.({ data }); } close() { this.closed = true; } };
  return { h, api: h.load('src/client-hub/window-session.ts'), session };
}

test('independent window rejects pre-open generation after delayed startup logout but ordinary opener close does not revoke it', () => {
  const values = new Map(), channels = [], local = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const marker = `tmc-hub-logout-v1:client:hub:${CLIENT}`;
  values.set(marker, 'newer-logout');
  const stale = windowPage(local, channels, '/hub-window', '?role=client&generation=0'); assert.throws(() => stale.api.assertHubWindowSession('client', `hub:${CLIENT}`), /sign-in changed/);
  const current = windowPage(local, channels, '/hub-window', '?role=client&generation=newer-logout'); current.api.assertHubWindowSession('client', `hub:${CLIENT}`);
  current.h.window.opener = { closed: true }; current.h.window.dispatchEvent(new Event('focus')); assert.doesNotThrow(() => current.api.assertHubWindowSession('client', `hub:${CLIENT}`));
});

test('durable logout failure still locks active exact-scope peers and does not falsely confirm all windows signed out', () => {
  const values = new Map(), channels = []; let blocked = false;
  const local = { getItem: key => values.get(key) ?? null, setItem(key, value) { if (blocked) throw Error('Storage became denied'); values.set(key, value); }, removeItem: key => values.delete(key) };
  const parent = windowPage(local, channels), child = windowPage(local, channels), uid = `hub:${CLIENT}`; let locks = 0;
  parent.api.assertHubWindowSession('client', uid); child.api.assertHubWindowSession('client', uid); child.api.assertHubWindowSession('owner', 'owner-only');
  child.api.watchHubWindowSession('client', uid, () => locks++); blocked = true;
  assert.equal(parent.api.revokeHubWindows('client', uid), false); assert.equal(locks, 1); assert.throws(() => child.api.assertHubWindowSession('client', uid), /sign-in changed/);
  assert.doesNotThrow(() => child.api.assertHubWindowSession('owner', 'owner-only'));
});

test('blocked browser storage preserves main-window auth checks but refuses independent-window authorization', () => {
  const local = { getItem() { throw Error('Storage denied'); }, setItem() { throw Error('Storage denied'); }, removeItem() {} }, main = windowPage(local, []), uid = `hub:${CLIENT}`;
  assert.doesNotThrow(() => main.api.assertHubWindowSession('client', uid)); assert.throws(() => main.api.hubWindowGeneration('client', uid), /storage/);
  const child = windowPage(local, [], '/hub-window', '?role=client&generation=0'); assert.throws(() => child.api.assertHubWindowSession('client', uid), /sign-in changed/);
});

const settings = (revision, extra = {}) => ({ schemaVersion: 1, revision, whimsyEnabled: false, whimsyTerms: [], updateRequestCooldownDays: 7, updateRequestCooldownResetAt: null, updatedAt: ISO, ...extra });
test('late settings save after same-account remount cannot replace the newer authenticated session state', async t => {
  const h = harness(), connections = [], pendingSave = deferred(); let observed;
  h.overrides['./studio-settings-client'] = { async connectStudioSettings(data, error) { const entry = { data, error, closed: false }; connections.push(entry); return { assertCurrent() { if (entry.closed) throw Error('Closed'); }, close() { entry.closed = true; }, save: () => pendingSave.promise }; } };
  const api = h.load('src/owner/use-studio-settings.ts'), C = () => { observed = api.useStudioSettings(); return null; }, render = () => h.render(C);
  render(); await tick(); connections[0].data(settings(3)); render(); const saving = api.saveStudioSettings({ whimsyEnabled: true });
  h.unmount(); h.hooks = []; render(); await tick(); connections[1].data(settings(10, { whimsyTerms: ['New session'] })); render();
  pendingSave.resolve(settings(99, { whimsyEnabled: true, whimsyTerms: ['Old session'] })); assert.equal(await saving, false); render();
  assert.equal(observed.settings.revision, 10); assert.equal(observed.settings.whimsyEnabled, false); assert.deepEqual(observed.settings.whimsyTerms, ['New session']); assert.equal(connections[0].closed, true); t.after(() => h.unmount());
});

test('synchronous preference-listener failure cannot install a closed connection or permit later cloud saves', async t => {
  const h = harness(); let closed = 0, writes = 0, observed;
  h.overrides['./studio-settings-client'] = { async connectStudioSettings(_data, error) { error(Error('Denied')); return { assertCurrent() {}, close() { closed++; }, async save() { writes++; return settings(1); } }; } };
  const api = h.load('src/owner/use-studio-settings.ts'), C = () => { observed = api.useStudioSettings(); return null; }; h.render(C); await tick(); h.render(C);
  assert.equal(closed, 1); assert.equal(observed.settings, null); assert.equal(await api.saveStudioSettings({ whimsyEnabled: true }), false); assert.equal(writes, 0); t.after(() => h.unmount());
});

function independentRoute(query) {
  const h = harness(), calls = [];
  const ClientGate = () => null, OwnerGate = () => null;
  h.overrides['next/navigation'] = { useSearchParams: () => new URLSearchParams(query) };
  h.overrides['./ClientHub'] = { ClientHub: ClientGate };
  h.overrides['@/owner/FirebaseOwnerGate'] = { FirebaseOwnerGate: OwnerGate };
  h.overrides['@/owner/OwnerGateFrame'] = { OwnerGateFrame: () => null };
  h.overrides['@/owner/client-hub-client'] = { getClientDetail: async id => { calls.push(['get', id]); return null; }, subscribeClientDetail: id => { calls.push(['listen', id]); return () => {}; } };
  h.overrides['./ProjectWorkspace'] = { ProjectWorkspace: () => null };
  h.overrides['./HubNotificationBell'] = { HubNotificationBell: () => null };
  h.overrides['./client'] = { clientHubErrorMessage: () => 'Locked' };
  const C = h.load('src/client-hub/HubWindowRoute.tsx').HubWindowRoute;
  h.render(C);
  return { h, calls, ClientGate, OwnerGate };
}

test('independent route rejects malformed scopes before any private loader and places owner loading behind its own gate', t => {
  for (const query of ['role=owner&project=bad&generation=0', `role=owner&project=${uuid(1)}&client=not-a-client&generation=0`, `role=admin&project=${uuid(1)}&generation=0`]) {
    const f = independentRoute(query); assert.match(content(f.h.tree), /Open this window from your Hub/); assert.deepEqual(f.calls, []); f.h.unmount();
  }
  const f = independentRoute(`role=owner&project=${uuid(1)}&client=${CLIENT}&generation=0&scope=all`);
  assert.equal(f.h.tree.type, f.OwnerGate); assert.deepEqual(f.calls, [], 'No owner read before gate authorizes the child');
  const child = f.h.tree.props.children({ signOut() {} }); f.h.render(child.type, child.props);
  assert.deepEqual(f.calls, [['listen', CLIENT], ['get', CLIENT]]); t.after(() => f.h.unmount());
});

test('client independent route never invokes owner loaders and refuses missing requested project instead of substituting another', t => {
  const f = independentRoute(`role=client&project=${uuid(999)}&client=${OTHER}&generation=0&scope=all`);
  assert.equal(f.h.tree.type, f.ClientGate); assert.deepEqual(f.calls, []);
  const child = f.h.tree.props.renderDashboard({ client: { clientId: CLIENT, authVersion: 3, displayName: 'Verified account', status: 'active' }, projects: [{ projectId: uuid(1), clientId: CLIENT, title: 'Different commission' }], onSignOut() {} });
  f.h.render(child.type, child.props); assert.match(content(f.h.tree), /Commission unavailable/); assert.doesNotMatch(content(f.h.tree), /Different commission/); assert.deepEqual(f.calls, []); t.after(() => f.h.unmount());
});

test('a delayed logout broadcast for an older generation cannot relock an explicitly reauthenticated newer session', () => {
  const values = new Map(), channels = [], local = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const page = windowPage(local, channels), uid = `hub:${CLIENT}`, marker = `tmc-hub-logout-v1:client:${uid}`; let locks = 0;
  page.api.assertHubWindowSession('client', uid); page.api.watchHubWindowSession('client', uid, () => locks++);
  values.set(marker, 'new-current-generation'); page.api.acceptHubWindowSignIn('client', uid);
  channels[0].onmessage({ data: { role: 'client', uid, previousGeneration: '0', nextGeneration: 'new-current-generation' } });
  assert.equal(locks, 0); assert.doesNotThrow(() => page.api.assertHubWindowSession('client', uid));
});

test('an old account window watcher cannot sign out the newly selected client on focus or a late logout signal', async t => {
  const values = new Map(), channels = [], local = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, page = windowPage(local, channels), h = page.h;
  Object.assign(h.process.env, { NEXT_PUBLIC_FIREBASE_API_KEY: `AIza${'a'.repeat(35)}`, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'taylor-made-creations.firebaseapp.com', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'taylor-made-creations', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'taylor-made-creations.appspot.com', NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456', NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456:web:abcdef' });
  const user = clientId => ({ uid: `hub:${clientId}`, getIdTokenResult: async () => ({ claims: { hubRole: 'client', hubClientId: clientId, hubAuthVersion: 1 } }) });
  const first = user(CLIENT), second = user(OTHER), auth = { currentUser: first }; let observer, signOuts = 0;
  h.overrides['./private-photo-cache'] = { clearHubPhotoCache() {} };
  h.overrides['firebase/app'] = { getApps: () => [], initializeApp: (options, name) => ({ options, name }) };
  h.overrides['firebase/auth'] = { initializeAuth: () => auth, browserSessionPersistence: {}, onIdTokenChanged(_auth, callback) { observer = callback; return () => {}; }, async signOut() { signOuts++; auth.currentUser = null; } };
  h.overrides['firebase/firestore'] = { getFirestore: () => ({}), doc: (...args) => args, onSnapshot: () => () => {} };
  h.overrides['firebase/functions'] = { getFunctions: () => ({}) };
  const client = h.load('src/client-hub/client.ts'), stop = client.subscribeClientSession(() => {}); t.after(stop);
  observer(first); await tick(); page.api.revokeHubWindows('client', first.uid);
  auth.currentUser = second; page.api.acceptHubWindowSignIn('client', second.uid); observer(second); await tick(); const before = signOuts;
  h.window.dispatchEvent(new Event('focus')); await tick();
  for (const channel of channels) channel.onmessage?.({ data: { role: 'client', uid: first.uid, previousGeneration: '0', nextGeneration: values.get(`tmc-hub-logout-v1:client:${first.uid}`) } });
  await tick();
  assert.equal(signOuts, before, 'A stale A watcher must not invoke global sign-out on B'); assert.equal(auth.currentUser, second);
  assert.equal(page.api.activeHubWindowUid('client'), second.uid, 'Checks for old scopes cannot replace the active account identity');
});

for (const revokeDuringRead of [false, true]) test(`hidden support outside latest200 ${revokeDuringRead ? 'cannot repopulate after epoch lock' : 'resurfaces from authoritative new-activity read without marking it read'}`, async t => {
  const h = harness(), calls = [], reads = [], gate = deferred(); let live, lookup;
  h.document.visibilityState = 'visible';
  const project = { clientId: CLIENT, projectId: uuid(1), title: 'Verified commission', summary: '', status: 'in-progress', progress: 25, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO };
  const old = { clientId: CLIENT, projectId: uuid(1), requestId: uuid(2), type: 'support', senderRole: 'client', body: 'Older hidden question', photoId: null, status: 'open', response: '', version: 2, createdAt: ISO, updatedAt: ISO };
  const visibility = { visibilityId: `${uuid(1)}-client-requests-${uuid(2)}`, clientId: CLIENT, projectId: uuid(1), viewerUid: `hub:${CLIENT}`, viewerRole: 'client', channel: 'requests', requestId: uuid(2), capturedRequestVersion: 2, version: 1, hidden: true, hiddenAt: ISO, restoredAt: null };
  const notice = version => ({ ...row(version), notificationId: `${uuid(1)}-client-requests-${uuid(2)}`, channel: 'requests', requestId: uuid(2), latestItemId: uuid(900 + version), latestAt: version > 2 ? '2026-10-27T17:01:00.000Z' : ISO });
  const data = { messages: [], photos: [], requests: [old], requestReplies: [], notifications: [notice(2)], visibility: [visibility], privateWorkspace: null };
  lookup = async () => old;
  h.overrides['./workspace-client'] = {
    loadProjectWorkspace: async () => data, subscribeProjectWorkspace(_project, _owner, onData, onError) { live = { onData, onError }; return () => {}; },
    async loadHubSupportRequest(...args) { calls.push(args); return lookup(...args); },
    async markHubConversationRead(...args) { reads.push(args); return { notification: null }; }, clearHubPhotoCache() {},
    getHubUpdateRequestCooldown: async () => ({ clientId: CLIENT, settingsRevision: 0, revision: 0, overrideDays: null, effectiveDays: 7, source: 'global', lastRequestedAt: null, nextEligibleAt: null, eligible: true, serverNow: ISO, resetAt: null }),
  };
  const C = h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace, render = () => h.render(C, { project, owner: false }), settle = async () => { await tick(); render(); await tick(); render(); };
  render(); t.after(() => h.unmount()); await settle();
  h.find(n => n.props.role === 'tab' && content(n).startsWith('Requests')).props.onClick(); render(); await settle();
  const latest200 = Array.from({ length: 200 }, (_, i) => ({ ...old, requestId: uuid(100 + i), body: `Current ${i}`, createdAt: '2026-10-27T17:00:01.000Z' }));
  live.onData({ ...data, requests: latest200 }); render(); await settle();
  assert.equal(h.all(n => n.type?.name === 'RequestCard' && n.props.request.requestId === old.requestId).length, 0);
  lookup = () => gate.promise; const before = calls.length, newest = { ...data, requests: latest200, notifications: [notice(3)] };
  live.onData(newest); render(); await tick(); render();
  assert.equal(calls.length, before + 1, 'A relevant new thread event must revalidate the older hidden parent exactly once');
  live.onData({ ...newest }); render(); await tick(); assert.equal(calls.length, before + 1, 'Equivalent live snapshots must not multiply pending reads');
  if (revokeDuringRead) { live.onError(Object.assign(Error('Epoch changed'), { code: 'session-expired' })); render(); }
  gate.resolve({ ...old, version: 3, updatedAt: '2026-10-27T17:01:00.000Z' }); await settle();
  assert.equal(reads.length, 0, 'Background visibility reconciliation must never fabricate a read receipt');
  if (revokeDuringRead) { assert.equal(h.all(n => n.type?.name === 'RequestCard').length, 0); assert.match(content(h.tree), /session needs attention/); }
  else { const reopened = h.find(n => n.type?.name === 'RequestCard' && n.props.request.requestId === old.requestId); assert.equal(reopened?.props.request.version, 3); assert.equal(reopened.props.expanded, false, 'Resurface is not open/navigation/read'); }
});

test('standalone Hub chrome CSS passes the actual Next CSS Modules pure-selector compiler', async () => {
  const { readFileSync } = await import('node:fs'), { createRequire } = await import('node:module'), { default: postcss } = await import('postcss');
  const require = createRequire(import.meta.url), local = require('next/dist/compiled/postcss-modules-local-by-default'), scope = require('next/dist/compiled/postcss-modules-scope');
  const source = readFileSync(new URL('../src/client-hub/HubWorkspaceWindow.module.css', import.meta.url), 'utf8');
  const compile = css => postcss([local({ mode: 'pure' }), scope({ generateScopedName: key => `HubWorkspaceWindow_${key}` })]).process(css, { from: 'HubWorkspaceWindow.module.css' });
  await assert.rejects(compile(':global(body:has([data-independent-hub-window]) .public-site-frame>footer) { display:none; }'), /not pure/, 'The former all-global selector must remain a real compiler regression');
  const result = await compile(source); assert.match(result.css, /HubWorkspaceWindow_standalone/);
});

test('cross-window second-owner logout cancels an already pending successful credential exchange', async t => {
  const f = ownerGate(t); f.user.uid='VhnIFsEQFqRtS8u98mP921wim4J3'; await f.start(); const pending = f.submit();
  const event = new Event('tmc-hub-session-lock'); Object.assign(event, { detail: { role: 'owner', uid: f.user.uid } }); f.h.window.dispatchEvent(event);
  f.emitUser(); f.gate.resolve({ user: f.user }); await pending; await tick(); f.render();
  assert.equal(f.calls.accepted, 0, 'A pre-logout credential attempt cannot adopt the new generation');
  assert.equal(f.calls.stores, 0); assert.ok(f.calls.signOut >= 1, 'Late credential must be cleared from the SDK'); assert.equal(f.auth.currentUser, null);
});
