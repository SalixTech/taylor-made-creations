import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ID = 'TMC-0123456789ABCDEF', OTHER = 'TMC-ABCDEF0123456789', PID = '11111111-1111-4111-8111-111111111111', MID = '22222222-2222-4222-8222-222222222222', ISO = '2026-10-26T21:00:00.000Z';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (extra = {}) => { const item = { clientId: ID, projectId: PID, recipientRole: 'client', channel: 'chat', latestItemId: MID, latestAt: ISO, version: 3, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null, ...extra }; return { ...item, notificationId: `${item.projectId}-${item.recipientRole}-${item.channel}${item.requestId ? `-${item.requestId}` : ''}` }; };
function setup(t, options = {}) {
  const h = harness(), calls = [], subscriptions = [], routed = [], labels = [], native = [], audio = [], stored = new Map(), permissions = [];
  h.overrides['./notification-presence'] = { notificationAreaIsActive: () => h.matchingArea === true };
  h.document.visibilityState = 'hidden'; h.document.hasFocus = () => false;
  const events = new EventTarget(); h.document.addEventListener = events.addEventListener.bind(events); h.document.removeEventListener = events.removeEventListener.bind(events);
  h.window.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  h.globals.Notification = class { static permission = options.permission ?? 'default'; static async requestPermission() { permissions.push(true); const result = options.request ? await options.request() : 'granted'; this.permission = result; return result; } constructor(title, value) { native.push({ title, options: value, target: this }); } close() { this.closed = true; } };
  h.globals.Audio = class { constructor() { audio.push(this); } play() { return Promise.resolve(); } pause() {} canPlayType() { return 'probably'; } };
  h.globals.URL = { createObjectURL() { throw Error('Client must not create audio URLs'); }, revokeObjectURL() { throw Error('Client must not own audio URLs'); } };
  h.overrides['./workspace-client'] = { subscribeHubNotifications(owner, onData, onError) { const sub = { owner, onData, onError, stopped: false }; subscriptions.push(sub); return () => { sub.stopped = true; }; } };
  h.overrides['./notification-client'] = {
    async loadHubNotificationLabels(...args) { labels.push(args); return options.labels ? options.labels(...args) : { [PID]: 'Cloud fox' }; },
    async changeHubNotifications(...args) { calls.push(args); return options.action ? options.action(...args) : args[2].map(item => ({ ...item, [args[1] === 'dismiss' ? 'dismissedVersion' : 'acknowledgedVersion']: item.version })); },
  };
  const Bell = h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell;
  const props = { owner: options.owner ?? false, accountKey: ID, onNavigate: item => routed.push(item) }, render = () => h.render(Bell, props); render(); t.after(() => h.unmount());
  const button = name => h.find(n => n.type === 'button' && (content(n) === name || n.props['aria-label'] === name || n.props.title === name));
  return { h, props, render, calls, labels, subscriptions, routed, native, audio, stored, permissions, events, button, async ready() { await flush(); render(); }, open() { button('Notifications').props.onClick(); render(); }, rows() { return h.all(n => n.type === 'li'); } };
}

test('same-chat unread messages are one titled card, totals count events, and other channels say updates', async t => {
  const f = setup(t); await f.ready(); f.subscriptions[0].onData([row(), row({ channel: 'photos', version: 4, readVersion: 2, readAt: ISO, throughItemId: MID, throughCreatedAt: ISO })]); await f.ready(); f.open();
  assert.equal(f.rows().length, 2); assert.match(content(f.h.tree), /Cloud foxMaker Chat · 3 unread messages/); assert.match(content(f.h.tree), /Photos · 2 unread updates/);
  assert.match(f.button('Notifications').props['aria-label'], /5 unread updates/); assert.equal(f.labels.length, 1);
  f.subscriptions[0].onData([row({ version: 4 })]); await f.ready(); assert.equal(f.labels.length, 1, 'version-only updates reuse account-lifetime titles');
  f.h.find(n => n.props.className === 'openNotification').props.onClick(); f.render(); assert.equal(f.routed.length, 1); assert.equal(f.calls.length, 0, 'navigation does not pretend the content was viewed');
});

test('mark-all is duplicate-locked, captures versions, and preserves concurrent arrivals and actual read cursors', async t => {
  const gate = deferred(), f = setup(t, { action: () => gate.promise }); await f.ready(); f.subscriptions[0].onData([row()]); await f.ready(); f.open();
  const mark = f.button('Mark all as read'); mark.props.onClick(); mark.props.onClick(); f.render(); assert.equal(f.calls.length, 1); assert.equal(f.rows().length, 0, 'captured notifications hide immediately while acknowledgment is pending'); assert.equal(f.calls[0][1], 'acknowledge'); assert.equal(f.calls[0][2][0].version, 3);
  f.subscriptions[0].onData([row({ version: 4 })]); f.render(); gate.resolve([row({ acknowledgedVersion: 3 })]); await f.ready();
  assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /1 unread message/); assert.equal(f.calls.length, 1);
  f.h.find(n => n.props.className === 'openNotification').props.onClick(); assert.equal(f.routed[0].version, 4); assert.equal(f.routed[0].readVersion, 0); assert.equal(f.routed[0].readAt, null);
});

test('notification X dismisses only its captured card, never navigates or deletes messages', async t => {
  const f = setup(t); await f.ready(); f.subscriptions[0].onData([row(), row({ channel: 'requests', requestId: MID })]); await f.ready(); f.open();
  f.button('Dismiss Cloud fox, Maker Chat notification').props.onClick(); await f.ready(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1], 'dismiss'); assert.equal(f.calls[0][2].length, 1); assert.equal(f.routed.length, 0); assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /Requests · 3 unread updates/);
  f.button('Mark all as read').props.onClick(); await f.ready(); assert.equal(f.rows().length, 0); assert.match(content(f.h.tree), /all caught up/);
});

test('uncertain action preserves cards, offers retry, and account switch aborts late action and labels', async t => {
  let first = true; const gate = deferred(), labelGate = deferred();
  const f = setup(t, { action: () => { if (first) { first = false; throw Error('Uncertain'); } return gate.promise; }, labels: () => labelGate.promise }); await f.ready(); f.subscriptions[0].onData([row()]); f.open(); f.button('Mark all as read').props.onClick(); await f.ready(); assert.equal(f.rows().length, 1); assert.match(content(f.h.tree), /could not be confirmed/);
  f.button('Mark all as read').props.onClick(); f.props.accountKey = OTHER; f.render(); await f.ready(); assert.equal(f.calls[1][3].aborted, true); assert.equal(f.labels[0][2].aborted, true); assert.equal(f.subscriptions[0].stopped, true);
  f.subscriptions[1].onData([row({ clientId: OTHER, projectId: uuid(2), version: 1 })]); f.render();
  gate.resolve([row({ acknowledgedVersion: 3 })]); labelGate.resolve({ [PID]: 'OLD PRIVATE TITLE' }); await f.ready();
  assert.doesNotMatch(content(f.h.tree), /OLD PRIVATE TITLE|could not be confirmed/); assert.match(f.button('Notifications').props['aria-label'], /1 unread update/);
});

test('client sound is native only, generic lockscreen content, no initial backlog or foreground playback', async t => {
  const f = setup(t); await f.ready(); f.subscriptions[0].onData([row()]); await f.ready(); f.open();
  assert.equal(f.h.find(n => n.type === 'input' && n.props.type === 'file'), undefined); assert.equal(f.audio.length, 0); assert.equal(f.native.length, 0);
  f.h.find(n => n.type === 'input').props.onChange({ target: { checked: true } }); f.render(); f.subscriptions[0].onData([row({ version: 4 })]); assert.equal(f.native.length, 0);
  f.button('Enable desktop notifications').props.onClick(); await f.ready(); f.subscriptions[0].onData([row({ version: 5, secret: 'PRIVATE CHAT BODY' })]); f.render();
  assert.equal(f.native.length, 1); assert.equal(f.native[0].options.silent, false); assert.equal(f.audio.length, 0); assert.doesNotMatch(JSON.stringify(f.native.map(x => ({ title: x.title, options: x.options }))), /Cloud fox|PRIVATE|TMC-0123/);
  f.h.find(n => n.type === 'input').props.onChange({ target: { checked: false } }); f.render(); f.subscriptions[0].onData([row({ version: 6 })]); assert.equal(f.native[1].options.silent, true);
  f.h.document.visibilityState = 'visible'; f.h.document.hasFocus = () => true; f.h.matchingArea = true; f.subscriptions[0].onData([row({ version: 7 })]); assert.equal(f.native.length, 2); assert.equal(f.audio.length, 0);
});

test('client permission request is duplicate-locked and late result after account switch is ignored', async t => {
  const gate = deferred(), f = setup(t, { request: () => gate.promise }); await f.ready(); f.open(); const enable = f.button('Enable desktop notifications'); enable.props.onClick(); enable.props.onClick(); f.render(); assert.equal(f.permissions.length, 1); assert.equal(f.button('Waiting for browser…').props.disabled, true); assert.equal(f.audio.length, 0);
  f.props.accountKey = OTHER; f.render(); await f.ready(); gate.resolve('granted'); await f.ready(); assert.equal(f.stored.size, 0); assert.ok(f.button('Enable desktop notifications')); assert.equal(f.audio.length, 0);
});

test('acknowledged/dismissed backlog stays silent, errors show no data and Escape respects IME composition', async t => {
  const f = setup(t); await f.ready(); f.subscriptions[0].onData([row({ acknowledgedVersion: 3 })]); await f.ready(); f.open(); assert.equal(f.rows().length, 0);
  const composition = new Event('keydown'); Object.assign(composition, { key: 'Escape', isComposing: true }); f.events.dispatchEvent(composition); f.render(); assert.ok(f.h.find(n => n.props.role === 'region'));
  const escape = new Event('keydown'); Object.assign(escape, { key: 'Escape', isComposing: false }); f.events.dispatchEvent(escape); f.render(); assert.equal(f.h.find(n => n.props.role === 'region'), undefined); assert.match(f.h.focusLog.at(-1), /Notifications/);
  f.open(); f.subscriptions[0].onError(Error('Session revoked')); f.render(); assert.match(content(f.h.tree), /could not connect/); assert.equal(f.rows().length, 0);
});

const model = sourceLoader({})('src/client-hub/model.ts');
test('notification decoder preserves legacy records, validates independent cursors and computes true bell delta', () => {
  const old = model.decodeHubNotification(row()); assert.equal(old.acknowledgedVersion, undefined); assert.equal(model.hubNotificationUnreadCount(old), 3);
  const acknowledged = model.decodeHubNotification(row({ acknowledgedVersion: 2, dismissedVersion: 1 })); assert.equal(model.hubNotificationUnreadCount(acknowledged), 1); assert.equal(acknowledged.readVersion, 0);
  for (const patch of [{ acknowledgedVersion: -1 }, { acknowledgedVersion: 4 }, { dismissedVersion: 1.5 }, { dismissedVersion: null }, { acknowledgedVersion: '1' }]) assert.throws(() => model.decodeHubNotification(row(patch)));
});

function apiFixture() {
  const calls = [], reads = [], connectionCalls = []; let valid = true, clientId = ID, hook, readHook;
  const auth = { app: {} }, session = { auth, db: {}, functions: {}, assertCurrent() { if (!valid) throw Error('Session changed'); } };
  const projects = new Map();
  const overrides = {
    './client': { CLIENT_HUB_FUNCTIONS_REGION: 'us-central1', ClientHubError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, async verifiedClientHubConnection(signal, read) { connectionCalls.push({ signal, read }); return { ...session, session: { clientId }, assertCurrent() { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); session.assertCurrent(); } }; } },
    './callable-owner-session': { async hubCallableOwnerSession() { return session; } }, '@/owner/taylor-services-client': { async taylorOwnerSession() { return session; } },
    'firebase/firestore': { getFirestore: () => session.db, doc: (_db, ...parts) => ({ path: parts.join('/') }), async getDocFromServer(target) { reads.push(target.path); await readHook?.(target); return { exists: () => projects.has(target.path), data: () => projects.get(target.path) }; } },
    'firebase/functions': { getFunctions: () => session.functions, httpsCallable: (_fn, name) => async payload => { calls.push({ name, payload }); const data = await hook?.(payload); return { data: data ?? { notifications: payload.notifications.map(item => row({ ...item, [payload.notificationAction === 'dismiss' ? 'dismissedVersion' : 'acknowledgedVersion']: item.version })) } }; } },
  };
  const api = sourceLoader(overrides)('src/client-hub/notification-client.ts');
  return { api, calls, reads, connectionCalls, projects, expire: () => { valid = false; }, client: value => { clientId = value; }, hook: value => { hook = value; }, readHook: value => { readHook = value; } };
}

test('notification client sends strict captured version actions through existing callable and chunks every item', async () => {
  const f = apiFixture(), items = Array.from({ length: 205 }, (_, index) => row({ projectId: uuid(index + 1), version: 3 }));
  const result = await f.api.changeHubNotifications(false, 'acknowledge', items);
  assert.equal(result.length, 205); assert.deepEqual(f.calls.map(x => x.payload.notifications.length), [100, 100, 5]);
  for (const call of f.calls) { assert.equal(call.name, 'tmcHubMarkConversationRead'); assert.equal(call.payload.notificationAction, 'acknowledge'); assert.ok(call.payload.notifications.every(x => Object.keys(x).sort().join(',') === 'channel,projectId,version')); }
  assert.equal(f.connectionCalls[0].read, false);
});

test('notification client rejects opposite role, duplicates and cross-client before callable, then stops on account switch/abort', async () => {
  const f = apiFixture(); await assert.rejects(f.api.changeHubNotifications(false, 'dismiss', [row({ recipientRole: 'owner' })])); await assert.rejects(f.api.changeHubNotifications(false, 'dismiss', [row(), row()]));
  f.client(OTHER); await assert.rejects(f.api.changeHubNotifications(false, 'dismiss', [row()]), e => e.code === 'session-expired'); assert.equal(f.calls.length, 0);
  const g = apiFixture(); g.hook(() => { g.expire(); }); await assert.rejects(g.api.changeHubNotifications(false, 'dismiss', Array.from({ length: 101 }, (_, i) => row({ projectId: uuid(i + 1) }))), /Session changed/); assert.equal(g.calls.length, 1);
  const canceled = apiFixture(), controller = new AbortController(); controller.abort(); await assert.rejects(canceled.api.changeHubNotifications(false, 'dismiss', [row()], controller.signal), e => e.name === 'AbortError'); assert.equal(canceled.calls.length, 0);
});

test('notification responses fail closed on missing, cross-client, swapped, unacknowledged or malformed data', async () => {
  for (const data of [{}, { notifications: [] }, { notifications: [row()] }, { notifications: [row({ clientId: OTHER, acknowledgedVersion: 3 })] }, { notifications: [row({ projectId: uuid(9), acknowledgedVersion: 3 })] }, { notifications: [row({ acknowledgedVersion: 4 })] }]) {
    const f = apiFixture(); f.hook(() => data); await assert.rejects(f.api.changeHubNotifications(false, 'acknowledge', [row()]));
  }
});

test('labels read only authorized shared projects, ignore contact fields and reject cross-client/late-session data', async () => {
  const project = { projectId: PID, clientId: ID, title: 'Cloud fox', summary: '', status: 'queued', progress: null, progressSource: 'manual', trackingUrl: null, trelloUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO, email: 'private@example.test' };
  const f = apiFixture(); f.projects.set(`hubProjects/${PID}`, project); assert.deepEqual(await f.api.loadHubNotificationLabels(false, [row()]), { [PID]: 'Cloud fox' }); assert.deepEqual(f.reads, [`hubProjects/${PID}`]); assert.equal(f.connectionCalls[0].read, true);
  const cross = apiFixture(); cross.projects.set(`hubProjects/${PID}`, { ...project, clientId: OTHER }); await assert.rejects(cross.api.loadHubNotificationLabels(false, [row()]));
  const late = apiFixture(); late.projects.set(`hubProjects/${PID}`, project); late.readHook(() => late.expire()); await assert.rejects(late.api.loadHubNotificationLabels(false, [row()]), /Session changed/);
});
