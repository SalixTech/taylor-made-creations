import { chatDraftStorageFixture } from './helpers/chat-draft-storage.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ID = 'TMC-0123456789ABCDEF', PROJECT = '11111111-1111-4111-8111-111111111111', ISO = '2026-10-20T20:00:00.000Z';
const uuid = n => `${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`;
const project = { clientId: ID, projectId: PROJECT, title: 'Cloud fox', summary: '', status: 'in-progress', progress: 35, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO };
const empty = () => ({ messages: [], photos: [], requests: [], requestReplies: [], notifications: [], privateWorkspace: null });
const message = (n, senderRole = 'owner') => ({ messageId: uuid(n), projectId: PROJECT, clientId: ID, senderRole, body: `Private message ${n}`, createdAt: ISO });
const request = (n, extra = {}) => ({ requestId: uuid(n), projectId: PROJECT, clientId: ID, type: 'support', body: `Please help ${n}`, photoId: null, senderRole: 'client', status: 'open', response: '', createdAt: ISO, updatedAt: ISO, unansweredSince: ISO, version: 1, ...extra });
const photo = (n, extra = {}) => ({ photoId: uuid(n), projectId: PROJECT, clientId: ID, storagePath: `hub-progress/${ID}/${PROJECT}/${uuid(n)}`, fileName: `Cloud-fox-${n}.png`, caption: 'Ear fitting', contentType: 'image/png', size: 5, createdAt: ISO, ...extra });
const notification = (extra = {}) => ({ notificationId: `${PROJECT}-client-chat`, clientId: ID, projectId: PROJECT, recipientRole: 'client', channel: 'chat', latestItemId: uuid(1), latestAt: ISO, version: 1, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null, ...extra });
function setup(options = {}) {
  const h = harness(), calls = [], live = [], downloads = [], revoked = [];
  h.document.visibilityState = 'visible'; h.document.createElement = () => ({ href: '', download: '', click() { downloads.push({ href: this.href, name: this.download }); } });
  h.globals.URL = { createObjectURL: () => 'blob:private-archive', revokeObjectURL: value => revoked.push(value) };
  h.overrides['./client'] = { clientHubErrorMessage: e => e.message || 'Not confirmed', isClientHubSessionError: e => e.code === 'session-expired' };
  h.overrides['./workspace-client'] = {...chatDraftStorageFixture(h),
    async getHubCommissionFolders() { return { version: 0, folderNames: [] }; },
    async loadProjectWorkspace(...args) { calls.push({ type: 'load', args }); return options.data ?? empty(); },
    subscribeProjectWorkspace(project, owner, onData, onError) { const item = { project, owner, onData, onError, stopped: false }; live.push(item); return () => { item.stopped = true; }; },
    async sendHubMessage(...args) { calls.push({ type: 'message', args }); return options.send ? options.send(...args) : { message: { ...message(1, 'client'), messageId: args[3], body: args[2] } }; },
    async markHubConversationRead(...args) { calls.push({ type: 'read', args }); return options.mark ? options.mark(...args) : { notification: null }; },
    async uploadHubPhoto(...args) { calls.push({ type: 'upload', args }); return options.upload ? options.upload(...args) : { photo: { ...photo(1), photoId: args[3], folderName: args[4] } }; },
    async listHubPhotoFolder(...args) { calls.push({ type: 'folder', args }); return options.folder ? options.folder(...args) : options.data.photos; },
    async loadHubPhotoBlob(...args) { calls.push({ type: 'bytes', args }); return options.bytes ? options.bytes(...args) : new Blob(['photo']); },

  };
  h.overrides['./file-copy-client'] = { ...h.overrides['./file-copy-client'], async verifyHubFileCopies(...args) { calls.push({ type: 'verify', args }); return options.verify?.(...args); } };
  const Component = h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace, props = { project, owner: !!options.owner, ...options.props };
  const render = () => h.render(Component, props), button = label => h.find(n => n.type === 'button' && (content(n) === label || n.props['aria-label'] === label || n.props.title === label));
  const switchTab = name => { h.find(n => n.props.role === 'tab' && content(n).startsWith(name)).props.onClick(); render(); };
  render(); return { h, calls, live, props, render, button, downloads, revoked, switchTab, async ready() { await flush(); render(); } };
}

test('live snapshots replace selected-project data, preserve drafts and unsubscribe before late events', async () => {
  const t = setup(); await t.ready();
  const input = () => t.h.find(n => n.type === 'textarea' && n.props.id?.endsWith('-message'));
  input().props.onChange({ target: { value: 'Unsaved ears detail' } }); t.render(); t.live[0].onData({ ...empty(), messages: [message(1)] }); t.render();
  assert.equal(input().props.value, 'Unsaved ears detail'); assert.match(content(t.h.tree), /Private message 1/); assert.doesNotMatch(content(t.h.tree), /Live updates connected/); assert.ok(t.button("Refresh"));
  t.props.project = { ...project, title: 'Renamed fox', version: 2 }; t.render(); assert.equal(t.live.length, 1, 'content edits do not reconnect the immutable scope');
  t.h.unmount(); assert.equal(t.live[0].stopped, true); const tree = t.h.tree; t.live[0].onData({ ...empty(), messages: [message(2)] }); assert.equal(t.h.tree, tree);
});

test('optimistic chat is visible immediately as Sending, not falsely Sent or Read; committed cursor adds Read time', async () => {
  const pending = deferred(), t = setup({ send: () => pending.promise }); await t.ready();
  t.h.find(n => n.type === 'textarea' && n.props.id?.endsWith('-message')).props.onChange({ target: { value: 'Awoo!' } }); t.render();
  t.h.find(n => n.type === 'form' && n.props.className === 'composer').props.onSubmit({ preventDefault() {} }); t.render();
  const optimistic = t.h.find(n => n.type === 'article' && n.props['data-pending'] === 'true'); assert.match(content(optimistic), /Awoo!Sending/); assert.doesNotMatch(content(optimistic), /Sent|Read/);
  const operationId = t.calls.find(c => c.type === 'message').args[3], saved = { ...message(1, 'client'), messageId: operationId, body: 'Awoo!' }; pending.resolve({ message: saved }); await t.ready(); assert.match(content(t.h.tree), /Sent ·/);
  t.live[0].onData({ ...empty(), messages: [saved], notifications: [notification({ recipientRole: 'owner', throughCreatedAt: ISO, readAt: '2026-10-20T21:00:00.000Z', readVersion: 1 })] }); t.render(); assert.match(content(t.h.tree), /Read ·/); t.h.unmount();
});

test('read receipts require the visible channel and transient failures can retry on focus without a loop', async () => {
  let tries = 0; const t = setup({ data: { ...empty(), messages: [message(1)] }, mark: async () => { if (!tries++) throw Error('Connection lost'); return { notification: null }; } }); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'read').length, 0);
  t.switchTab('Maker Chat'); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'read').length, 1); t.render(); await flush(); assert.equal(t.calls.filter(c => c.type === 'read').length, 1);
  t.h.window.dispatchEvent(new Event('focus')); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'read').length, 2); t.h.unmount();
});

test('opening request A never marks unopened request B read, and own root status events can be acknowledged', async () => {
  const a = request(2), b = request(3); const t = setup({ data: { ...empty(), requests: [a, b], notifications: [notification({ channel: 'requests', requestId: a.requestId, latestItemId: a.requestId })] } }); await t.ready(); t.switchTab('Requests'); assert.equal(t.calls.filter(c => c.type === 'read').length, 0);
  const cards = t.h.all(n => n.type?.name === 'RequestCard'); cards.find(card => card.props.request.requestId === a.requestId).props.onToggle(); t.render(); await t.ready(); const reads = t.calls.filter(c => c.type === 'read'); assert.equal(reads.length, 1); assert.equal(reads[0].args[2].requestId, a.requestId); assert.equal(reads[0].args[2].itemId, a.requestId); t.h.unmount();
});

test('batch photos number IDs once, retain folder metadata and retry only unconfirmed files', async () => {
  let failed = false; const t = setup({ owner: true, upload: async (...args) => { if (args[1].name === 'two.png' && !failed) { failed = true; throw Error('Response lost'); } return { photo: { ...photo(1), photoId: args[3] } }; } }); await t.ready();
  const files = ['one.png', 'two.png', 'three.png'].map(name => new File(['photo'], name, { type: 'image/png' })); t.h.find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files } }); t.h.find(n => n.type === 'input' && n.props.maxLength === 80).props.onChange({ target: { value: 'Head fitting' } }); t.render();
  const upload = () => t.h.find(n => n.type === 'form' && n.props.className === 'uploadForm').props.onSubmit({ preventDefault() {} }); upload(); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'upload').length, 2); upload(); await t.ready(); const calls = t.calls.filter(c => c.type === 'upload'); assert.equal(calls.length, 4); assert.equal(calls[0].args[1], files[0]); assert.equal(calls[1].args[3], calls[2].args[3]); assert.equal(calls[3].args[1], files[2]); assert.equal(calls[3].args[4], 'Head fitting'); assert.match(content(t.h.tree), /Saved Successfully/); t.h.unmount();
});

test('folder ZIP uses complete authenticated listing, sequential private bytes and a final session check', async () => {
  const photos = [photo(1, { folderName: 'Head' }), photo(2, { folderName: 'Head' })], t = setup({ data: { ...empty(), photos } }); await t.ready(); t.switchTab('Photos'); t.button('Download folder (.zip)').props.onClick(); await t.ready();
  assert.deepEqual(t.calls.filter(c => ['folder', 'bytes', 'verify'].includes(c.type)).map(c => c.type), ['folder', 'bytes', 'bytes', 'verify']); assert.equal(t.downloads.length, 1); assert.match(t.downloads[0].name, /Cloud fox-Head-2026-10-20.zip/); t.h.unmount();
});

test('cancelled or revoked ZIPs never trigger a download and unmount aborts byte reads', async () => {
  const gate = deferred(), t = setup({ data: { ...empty(), photos: [photo(1)] }, bytes: () => gate.promise }); await t.ready(); t.switchTab('Photos'); t.button('Download folder (.zip)').props.onClick(); await flush(); t.render(); const signal = t.calls.find(c => c.type === 'bytes').args[2]; t.h.unmount(); assert.equal(signal.aborted, true); gate.resolve(new Blob(['photo'])); await flush(); assert.equal(t.downloads.length, 0);
  const revoked = setup({ data: { ...empty(), photos: [photo(1)] }, verify: async () => { throw Object.assign(Error('Revoked'), { code: 'session-expired' }); } }); await revoked.ready(); revoked.switchTab('Photos'); revoked.button('Download folder (.zip)').props.onClick(); await revoked.ready(); assert.equal(revoked.downloads.length, 0); assert.doesNotMatch(content(revoked.h.tree), /Ear fitting/); revoked.h.unmount();
});

test('support replies remain open until an explicit close; failed retries keep their operation and body', async () => {
  const h = harness(), calls = [], statuses = []; let fail = true;
  const Card = h.load('src/client-hub/ProjectWorkspace.tsx').RequestCard, props = { request: request(1), owner: false, busy: false, onDraftChange() {}, async onReply(...args) { calls.push(args); if (fail) { fail = false; return false; } return true; }, async onStatus(...args) { statuses.push(args); return true; } }, render = () => h.render(Card, props); render();
  h.find(n => n.type === 'textarea').props.onChange({ target: { value: 'One more detail' } }); render(); h.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await flush(); render(); assert.equal(h.find(n => n.type === 'textarea').props.readOnly, true); h.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await flush(); render(); assert.deepEqual(calls[0], calls[1]); assert.equal(statuses.length, 0); assert.equal(props.request.status, 'open'); assert.equal(h.find(n => n.type === 'textarea').props.value, ''); h.find(n => n.type === 'button' && content(n) === 'Close chat').props.onClick(); assert.equal(statuses[0][1], 'closed'); h.unmount();
});

test('overdue is strictly more than 96 hours of unanswered client activity, never closed/cancelled or replied', () => {
  const h = harness(), overdue = h.load('src/client-hub/ProjectWorkspace.tsx').supportRequestOverdue, now = Date.parse(ISO) + 96 * 3600000;
  assert.equal(overdue(request(1), now), false); assert.equal(overdue(request(1), now + 1), true);
  for (const status of ['closed', 'cancelled', 'resolved']) assert.equal(overdue(request(1, { status }), now + 1), false);
  assert.equal(overdue(request(1, { unansweredSince: null }), now + 1), false); assert.equal(overdue(request(1, { lastOwnerMessageAt: '2026-10-20T21:00:00.000Z' }), now + 1), false); h.unmount();
});

test('ZIP writer creates verified collision-safe UTF-8 archives without traversal entries', async () => {
  const zip = sourceLoader({})('src/client-hub/photo-zip.ts'), folder = mkdtempSync(join(tmpdir(), 'tmc-photozip-'));
  try {
    const archive = await zip.createPhotoZip([{ name: '../../Head/fox.png', blob: new Blob(['first']) }, { name: '../../Head/fox.png', blob: new Blob(['second']) }, { name: 'Cón/ear.png', blob: new Blob(['third']) }]); const path = join(folder, 'photos.zip'); writeFileSync(path, Buffer.from(await archive.arrayBuffer()));
    const check = spawnSync('python', ['-c', 'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))', path], { encoding: 'utf8' }); assert.equal(check.status, 0, check.stderr); const entries = JSON.parse(check.stdout); assert.equal(Object.keys(entries).length, 3); assert.deepEqual(Object.values(entries), ['first','second','third']); for (const name of Object.keys(entries)) assert.ok(!name.startsWith('/') && !name.split('/').includes('..')); assert.ok(Object.keys(entries).some(n => n.endsWith('fox-2.png'))); assert.equal(zip.safeArchiveName('CON.png'), '_CON.png');
    const aborted = new AbortController(); aborted.abort(); await assert.rejects(zip.createPhotoZip([{ name: 'a.png', blob: new Blob(['a']) }], aborted.signal), { name: 'AbortError' });
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('required new copy, reduced-motion guards and full viewport background are present without Salix branding', () => {
  const hub = readFileSync(new URL('../src/client-hub/ClientHub.tsx', import.meta.url), 'utf8'), work = readFileSync(new URL('../src/client-hub/ProjectWorkspace.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/client-hub/ProjectWorkspace.module.css', import.meta.url), 'utf8');
  for (const copy of ['YOUR CHARACTER. YOUR HUB','Enter the studio','/client-hub/request-code']) assert.ok(hub.includes(copy));
  for (const copy of ['No Awooo - $350 fine','Send Awoo','Delete my copy','From idea to doorstep']) assert.ok(work.includes(copy));
  assert.doesNotMatch(work, /Talk with Taylor|See it take shape|Manual progress|Salix/); assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /animation:none/); assert.match(readFileSync(new URL('../src/client-hub/ClientHub.module.css', import.meta.url), 'utf8'), /min-height:100dvh/);
});

test('later request status events sharing the same root ID still advance a visible thread receipt', async () => {
  const a = request(2), row = notification({ channel: 'requests', requestId: a.requestId, latestItemId: a.requestId }), t = setup({ data: { ...empty(), requests: [a], notifications: [row] } }); await t.ready(); t.switchTab('Requests'); t.h.find(n => n.type?.name === 'RequestCard').props.onToggle(); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'read').length, 1);
  t.live[0].onData({ ...empty(), requests: [{ ...a, status: 'closed', version: 2 }], notifications: [{ ...row, version: 2, latestAt: '2026-10-20T21:00:00.000Z' }] }); await t.ready(); assert.equal(t.calls.filter(c => c.type === 'read').length, 2); t.h.unmount();
});

test('partial-folder byte failure never emits a partial ZIP', async () => {
  let reads = 0; const t = setup({ data: { ...empty(), photos: [photo(1), photo(2)] }, bytes: async () => { if (++reads === 2) throw Error('Photo access temporarily limited.'); return new Blob(['photo']); } }); await t.ready(); t.switchTab('Photos'); t.button('Download folder (.zip)').props.onClick(); await t.ready(); assert.equal(t.downloads.length, 0); assert.match(content(t.h.tree), /Photo access temporarily limited/); t.h.unmount();
});

test('photo preview reader waits until near viewport and disconnects on unmount', async () => {
  const h = harness(), observers = [], reads = [], revoked = [];
  h.globals.IntersectionObserver = class { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } };
  h.globals.URL = { createObjectURL: () => 'blob:near-view', revokeObjectURL: value => revoked.push(value) }; h.overrides['./workspace-client'] = {
    async getHubCommissionFolders() { return { version: 0, folderNames: [] }; }, async loadHubPhotoBlob(...args) { reads.push(args); return new Blob(['photo']); } };
  const Tile = h.load('src/client-hub/ProjectWorkspace.tsx').PhotoTile, props = { photo: photo(1), owner: false, onFailure() {}, onDeleteCopy() {} }, render = () => h.render(Tile, props); render(); await flush(); assert.equal(reads.length, 0); assert.ok(observers[0].target);
  observers[0].callback([{ isIntersecting: true }]); await flush(); render(); assert.equal(reads.length, 1); assert.equal(observers[0].disconnected, true); h.unmount(); assert.equal(reads[0][2].aborted, true); assert.deepEqual(revoked, ['blob:near-view']);
});

function bellSetup() {
  const h = harness(), subscriptions = [], native = [], stored = new Map(), routed = [], permissions = [], audio = [];
  const events = new EventTarget(); h.document.addEventListener = events.addEventListener.bind(events); h.document.removeEventListener = events.removeEventListener.bind(events); h.document.visibilityState = 'hidden'; h.window.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  h.globals.Notification = class { static permission = 'default'; static async requestPermission() { permissions.push('requested'); this.permission = 'granted'; return 'granted'; } constructor(title, options) { native.push({ title, options }); } close() {} };
  h.globals.Audio = class { constructor(url) { this.url = url; this.playCount = 0; audio.push(this); } async play() { this.playCount++; } pause() { this.paused = true; } };
  h.globals.URL = { createObjectURL: () => 'blob:custom-audio', revokeObjectURL() {} };
  h.overrides['./workspace-client'] = {
    async getHubCommissionFolders() { return { version: 0, folderNames: [] }; }, subscribeHubNotifications(owner, onData, onError) { const sub = { owner, onData, onError, stopped: false }; subscriptions.push(sub); return () => { sub.stopped = true; }; } };
  h.overrides['./notification-client'] = { async loadHubNotificationLabels() { return { [PROJECT]: 'Cloud fox' }; }, async changeHubNotifications() { throw Error('Not used in this fixture'); } };
  const Bell = h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell, props = { owner: false, accountKey: ID, onNavigate: item => routed.push(item) }, render = () => h.render(Bell, props); render();
  const button = text => h.find(n => n.type === 'button' && (content(n) === text || n.props['aria-label'] === text));
  return { h, subscriptions, native, stored, routed, permissions, audio, props, render, button, events, open() { h.find(n => n.type === 'button' && n.props.title === 'Notifications').props.onClick(); render(); }, async ready() { await flush(); render(); } };
}

test('bell is unread live data with explicit desktop permission and generic private notification text', async () => {
  const t = bellSetup(); await t.ready(); assert.equal(t.permissions.length, 0); assert.equal(t.audio.length, 0); t.subscriptions[0].onData([notification()]); t.render(); assert.equal(t.native.length, 0, 'initial backlog does not produce a notification storm'); assert.match(t.h.find(n => n.props.title === 'Notifications').props['aria-label'], /1 unread/);
  t.open(); t.button('Enable desktop notifications').props.onClick(); await t.ready(); assert.equal(t.permissions.length, 1); t.subscriptions[0].onData([notification({ version: 2, privateBody: 'DO NOT LEAK THIS' })]); t.render(); assert.equal(t.native.length, 1); assert.equal(t.native[0].options.body, 'New activity in your private Client Hub.'); assert.doesNotMatch(JSON.stringify(t.native), /DO NOT LEAK|Cloud fox|Private message/);
  const activity = t.h.find(n => n.type === 'button' && n.props.className === 'openNotification'); activity.props.onClick(); t.render(); assert.equal(t.routed.length, 1); assert.equal(t.h.find(n => n.props.role === 'region'), undefined); t.h.unmount(); assert.equal(t.subscriptions[0].stopped, true);
});

test('client sound uses only OS notification sound and does not leak preferences between accounts', async () => {
  const t = bellSetup(); await t.ready(); t.subscriptions[0].onData([notification()]); t.open();
  assert.equal(t.h.find(n => n.type === 'input' && n.props.type === 'file'), undefined);
  t.h.find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await t.ready();
  assert.equal(t.audio.length, 0); t.subscriptions[0].onData([notification({ version: 2 })]); assert.equal(t.native.length, 0, 'sound toggle alone does not enable desktop notifications');
  t.button('Enable desktop notifications').props.onClick(); await t.ready(); t.subscriptions[0].onData([notification({ version: 3 })]);
  assert.equal(t.native.at(-1).options.silent, false); assert.equal(t.audio.length, 0);
  t.h.find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: false } }); await t.ready(); t.subscriptions[0].onData([notification({ version: 4 })]); assert.equal(t.native.at(-1).options.silent, true);
  assert.ok(t.stored.has(`tmc-hub-notifications:client:${ID}`)); t.props.accountKey = 'TMC-ABCDEF0123456789'; t.render(); assert.equal(t.h.find(n => n.props.title === 'Notifications').props['aria-label'], 'Notifications'); await t.ready(); assert.equal(t.audio.length, 0); assert.equal(t.h.find(n => n.type === 'input' && n.props.type === 'checkbox').props.checked, false); assert.equal(t.subscriptions[0].stopped, true); t.h.unmount();
});

test('native gallery lightbox supports arrows, Escape, focus return and private URL cleanup', async () => {
  const h = harness(), revoked = [], reads = [], moves = []; let closes = 0, focused = 0;
  h.globals.URL = { createObjectURL: () => 'blob:enlarged', revokeObjectURL: value => revoked.push(value) }; h.overrides['./workspace-client'] = {
    async getHubCommissionFolders() { return { version: 0, folderNames: [] }; }, async loadHubPhotoBlob(...args) { reads.push(args); return new Blob(['photo']); } };
  const Lightbox = h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox, props = { photos: [photo(1), photo(2)], activeId: photo(1).photoId, owner: false, onChange: photoId => moves.push(photoId), onClose: () => { closes++; }, onFailure() {}, trigger: { current: { focus() { focused++; } } } }, render = () => h.render(Lightbox, props); render(); await flush(); render();
  assert.equal(h.find(n => n.type === 'dialog').props.ref.current.open, true); assert.equal(h.document.body.style.overflow, 'hidden'); assert.equal(h.find(n => n.type === 'img').props.src, 'blob:enlarged'); h.find(n => n.type === 'dialog').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} }); assert.deepEqual(moves, [photo(2).photoId]); h.find(n => n.type === 'dialog').props.onCancel({ preventDefault() {} }); assert.equal(closes, 1);
  props.photos = [photo(3), ...props.photos]; render(); await flush(); render(); assert.equal(reads.length, 1, "a new upload does not change the selected photo or refetch its bytes"); assert.equal(h.find(n => n.type === "img").props.alt, "Ear fitting");
  props.activeId = null; render(); assert.equal(focused, 1); assert.equal(h.document.body.style.overflow, 'auto'); assert.equal(reads[0][2].aborted, true); assert.deepEqual(revoked, ['blob:enlarged']); h.unmount();
});

test('profile picture uncertain retry retains the same file and baseline despite a live profile update', async () => {
  const h = harness(), calls = []; let count = 0;
  h.overrides['./client'] = { clientHubErrorMessage: e => e.message, async saveHubAvatar(...args) { calls.push(args); if (!count++) throw Error('Response lost'); return { client: { ...args[0], avatarVersion: 1, updatedAt: '2026-10-20T21:00:00.000Z' } }; } };
  const Dashboard = h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard, props = { client: { clientId: ID, displayName: 'Sky', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO }, projects: [project], onRefresh() {}, onSignOut() {} }, render = () => h.render(Dashboard, props); render(); h.find(n => n.type === 'button' && content(n) === 'Edit Profile').props.onClick(); render();
  const file = new File(['photo'], 'avatar.png', { type: 'image/png' }); h.find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file] } }); render(); assert.equal(calls.length,0); void h.find(n=>n.type?.name==='AvatarCrop').props.onApply(file).catch(()=>{}); render(); h.all(n => n.type === 'form')[1].props.onSubmit({ preventDefault() {} }); await flush(); render(); assert.equal(h.find(n => n.type === 'input' && n.props.type === 'file').props.disabled, true);
  props.client = { ...props.client, updatedAt: '2026-10-20T20:30:00.000Z' }; render(); await h.find(n=>n.type?.name==='AvatarCrop').props.onApply(file); await flush(); render(); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0][1], file); assert.equal(h.find(n => n.type?.name === 'ClientAvatar').props.client.avatarVersion, 1); h.unmount();
});
test('avatar crop is local until its Save; Cancel does not upload and account replacement retires its crop',()=>{
 const h=harness(),calls=[];h.overrides['./client']={clientHubErrorMessage:e=>e.message,saveHubAvatar:async(...args)=>{calls.push(args);return{client:args[0]};}};const C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client:{clientId:ID,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO},projects:[project],onRefresh(){},onSignOut(){}},render=()=>h.render(C,props);render();h.find(n=>n.type==='button'&&content(n)==='Edit Profile').props.onClick();render();const file=new File(['image'],'x.png',{type:'image/png'});h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});render();h.all(n=>n.type==='form')[1].props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);h.find(n=>n.type?.name==='AvatarCrop').props.onCancel();render();assert.equal(h.find(n=>n.type?.name==='AvatarCrop'),undefined);assert.equal(calls.length,0);h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});render();props.client={...props.client,authVersion:2};render();render();assert.equal(h.find(n=>n.type?.name==='AvatarCrop'),undefined);assert.equal(calls.length,0);h.unmount();
});
test('restoring popup commission does not mount a second same-project inline workspace',()=>{
 const h=harness(),archived={...project,status:'completed',clientArchived:true},C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client:{clientId:ID,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO},projects:[archived],onRefresh(){},onSignOut(){}},render=()=>h.render(C,props),cards=()=>h.find(n=>n.type?.name==='ClientCommissionCards');render();assert.equal(h.find(n=>n.type?.name==='HubWorkspaceWindow'),undefined);cards().props.onPopupProjectChange(archived.projectId);render();cards().props.onProjectUpdated({...archived,clientArchived:false,version:archived.version+1});render();assert.equal(h.find(n=>n.type?.name==='HubWorkspaceWindow'),undefined);cards().props.onPopupProjectChange(null);render();assert.equal(h.find(n=>n.type?.name==='HubWorkspaceWindow').props.project.projectId,archived.projectId);h.unmount();
});
test('archive confirmation does not clear dirty protection before a confirmed archive update',async()=>{
 const h=harness(),other={...project,projectId:'99999999-9999-4999-8999-999999999999'},C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client:{clientId:ID,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO},projects:[project,other],onRefresh(){},onSignOut(){}},render=()=>h.render(C,props),cards=()=>h.find(n=>n.type?.name==='ClientCommissionCards');let attempted=0;render();h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onDirtyChange(true);render();cards().props.onBeforeArchive(()=>{attempted++;});render();let confirm=h.find(n=>n.type?.name==='HubActionDialog');assert.ok(confirm);confirm.props.onConfirm();await flush();render();assert.equal(attempted,1);cards().props.onSelect(other.projectId);render();confirm=h.find(n=>n.type?.name==='HubActionDialog');assert.ok(confirm,'failed/unconfirmed archive must leave the original draft guarded');confirm.props.onClose();h.unmount();
});
test('crop Save persists immediately and closes only after acknowledgement; old account callback cannot upload or paint',async()=>{
 const h=harness(),calls=[];let resolve;h.overrides['./client']={clientHubErrorMessage:e=>e.message,saveHubAvatar:async(...args)=>{calls.push(args);return new Promise(yes=>{resolve=yes;});}};
 const C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client:{clientId:ID,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO},projects:[project],onRefresh(){},onSignOut(){}},render=()=>h.render(C,props),crop=()=>h.find(n=>n.type?.name==='AvatarCrop');
 render();h.find(n=>n.type==='button'&&content(n)==='Edit Profile').props.onClick();render();const file=new File(['png'],'crop.png',{type:'image/png'});h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});render();const apply=crop().props.onApply,request=apply(file);render();assert.equal(calls.length,1);assert.ok(crop());await assert.rejects(apply(file),/already saving/);assert.equal(calls.length,1);
 resolve({client:{...props.client,avatarVersion:2,updatedAt:'2030-01-01T00:00:00Z'}});await request;render();assert.equal(crop(),undefined);assert.equal(h.find(n=>n.type?.name==='ClientAvatar').props.client.avatarVersion,2);
 props.client={...props.client,authVersion:2};render();render();await assert.rejects(apply(file),/session changed/);assert.equal(calls.length,1);h.unmount();
});
