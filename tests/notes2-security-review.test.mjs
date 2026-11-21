// Independent source-hook and schema tests; these are not real-browser/pixel QA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content as textContent } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const load = sourceLoader({}), model = load('src/owner/draft-recovery.ts');
const fresh = () => load('src/owner/defaults.ts').createDefaultOwnerContent();
const identity = { projectId: 'taylor-made-creations', ownerUid: 'a4ARjp0z8ZOByKlC2AfGzmMRj843' };
const branchName = index => `review-branch-${String(index).padStart(8, '0')}`;
const now = Date.parse('2026-10-27T15:00:00Z');
const tick = () => new Promise(resolve => setImmediate(resolve));
function memory() {
  const values = new Map(); let blocked = false;
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (blocked) throw new DOMException('Quota full', 'QuotaExceededError'); values.set(key, value); }, removeItem: key => values.delete(key), block: value => { blocked = value; } };
}
const message = (window, origin, source, data) => { const event = new Event('message'); Object.assign(event, { origin, source, data }); window.dispatchEvent(event); };

test('local recovery is schema-strict and partitioned by project/owner, with no token or Hub data accepted', () => {
  const storage = memory(), a = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => now), doc = fresh();
  const saved = a.checkpoint(doc, 7); assert.equal(saved.record.cloudRevision, 7);
  doc.home.title = 'Mutated after checkpoint'; assert.notEqual(model.readRecoveryRecord(saved.raw, now).content.home.title, doc.home.title);
  assert.equal(model.listRecovery(storage, { ...identity, ownerUid: 'another-owner' }, now).length, 0);
  assert.equal(model.listRecovery(storage, { ...identity, projectId: 'another-project' }, now).length, 0);
  for (const content of [{ ...fresh(), idToken: 'secret' }, { ...fresh(), hubClients: [] }]) assert.throws(() => a.checkpoint(content, 7));
  assert.equal(storage.getItem(a.key), saved.raw);
  const parsed = JSON.parse(saved.raw);
  for (const patch of [{ token: 'secret' }, { cloudRevision: -1 }, { updatedAt: now + 60001 }, { updatedAt: now - model.RECOVERY_MAX_AGE - 1 }, { content: { ...fresh(), refreshToken: 'secret' } }]) assert.equal(model.readRecoveryRecord(JSON.stringify({ ...parsed, ...patch }), now), null);
  assert.equal(model.readRecoveryRecord('x'.repeat(model.RECOVERY_MAX_BYTES), now), null);
});

test('independent recovery branches cannot overwrite each other; reviewed discard prevents stale writer resurrection', () => {
  const storage = memory(), a = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => now), b = new model.DraftRecoveryBranch(storage, identity, branchName(2), () => now);
  const first = a.checkpoint(fresh(), 1), second = b.checkpoint(fresh(), 2);
  assert.equal(model.listRecovery(storage, identity, now).length, 2);
  model.discardRecovery(storage, identity, first); assert.throws(() => a.checkpoint(fresh(), 1), /changed or discarded/);
  assert.equal(storage.getItem(b.key), second.raw);
  const newer = b.checkpoint({ ...fresh(), site: { ...fresh().site, name: 'Newer draft' } }, 2);
  assert.throws(() => model.discardRecovery(storage, identity, second), /changed/); assert.equal(storage.getItem(b.key), newer.raw);
  b.dispose(true); assert.equal(storage.getItem(b.key), null); assert.throws(() => b.checkpoint(fresh(), 3), /closed/);
});

test('quota failure preserves the previous checkpoint; expired copies require exact explicit cleanup without deleting a newer active record', () => {
  const storage = memory(), a = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => now), first = a.checkpoint(fresh(), 1);
  storage.block(true); assert.throws(() => a.checkpoint(fresh(), 2), /Quota/); assert.equal(storage.getItem(a.key), first.raw); storage.block(false);
  const expired = JSON.stringify({ ...first.record, branch: branchName(2), updatedAt: now - model.RECOVERY_MAX_AGE - 1 });
  const key = model.recoveryPrefix(identity) + branchName(2); storage.setItem(key, expired);
  const unavailable = model.listUnavailableRecovery(storage, identity, now); assert.equal(unavailable.length, 1);
  storage.setItem(key, JSON.stringify({ ...first.record, branch: branchName(2) }));
  assert.throws(() => model.discardUnavailableRecovery(storage, identity, unavailable, now), /changed/); assert.equal(storage.length, 2);
  storage.setItem(key, expired); model.discardUnavailableRecovery(storage, identity, model.listUnavailableRecovery(storage, identity, now), now);
  assert.equal(storage.getItem(key), null); assert.equal(storage.getItem(a.key), first.raw);
});

test('valid recovery bytes under a mismatched branch key remain explicitly cleanable, never restorable or silently deleted', () => {
  const storage = memory(), writer = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => now), saved = writer.checkpoint(fresh(), 1);
  const wrongKey = model.recoveryPrefix(identity) + branchName(2); storage.setItem(wrongKey, saved.raw);
  assert.deepEqual(model.listRecovery(storage, identity, now).map(item => item.key), [writer.key]);
  const unavailable = model.listUnavailableRecovery(storage, identity, now); assert.deepEqual(unavailable.map(item => item.key), [wrongKey]);
  model.discardUnavailableRecovery(storage, identity, unavailable, now); assert.equal(storage.getItem(wrongKey), null); assert.equal(storage.getItem(writer.key), saved.raw);
});

test('cross-tab checkpoint interleaving at discard cannot erase a newer recovery snapshot', () => {
  const storage = memory(), writer = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => now), saved = writer.checkpoint(fresh(), 1);
  const remove = storage.removeItem; let interleaved = false, newer;
  storage.removeItem = key => {
    if (!interleaved) { interleaved = true; newer = writer.checkpoint({ ...fresh(), home: { ...fresh().home, title: 'Newer unsaved cross-tab edits' } }, 2); }
    remove(key);
  };
  try { model.discardRecovery(storage, identity, saved); } catch { /* Refusing a stale discard is safe. */ }
  assert.ok(newer, 'test injects the other tab between compare and removal');
  assert.equal(storage.getItem(newer.key), newer.raw, 'Newer unsaved bytes must survive the old snapshot discard');
});

test('immutable recovery generation can refresh at the eight-copy limit without removing any other branch', () => {
  const storage = memory(), writers = Array.from({ length: model.RECOVERY_MAX_BRANCHES }, (_, i) => new model.DraftRecoveryBranch(storage, identity, branchName(i + 10), () => now));
  const saved = writers.map(writer => { writer.protectActive(); return writer.checkpoint(fresh(), 1); });
  const newer = writers[0].checkpoint({ ...fresh(), home: { ...fresh().home, title: 'Updated own checkpoint' } }, 2);
  assert.notEqual(newer.key, saved[0].key); assert.equal(model.listRecovery(storage, identity, now).length, model.RECOVERY_MAX_BRANCHES); assert.equal(storage.length, model.RECOVERY_MAX_BRANCHES * 2, "each active writer has a separate lease"); assert.equal(storage.getItem(saved[0].key), null);
  for (const item of saved.slice(1)) assert.equal(storage.getItem(item.key), item.raw);
  const ninth = new model.DraftRecoveryBranch(storage, identity, branchName(99), () => now); assert.throws(() => ninth.checkpoint(fresh(), 1), /full/);
  assert.equal(storage.getItem(newer.key), newer.raw);
});

test('unavailable-copy cleanup interleaved with its live writer preserves the new immutable generation', () => {
  const storage = memory(); let time = now - model.RECOVERY_MAX_AGE - 1;
  const writer = new model.DraftRecoveryBranch(storage, identity, branchName(1), () => time); writer.checkpoint(fresh(), 1);
  const entries = model.listUnavailableRecovery(storage, identity, now); assert.equal(entries.length, 1); time = now;
  const remove = storage.removeItem; let interleaved = false, newer;
  storage.removeItem = key => { if (!interleaved) { interleaved = true; newer = writer.checkpoint(fresh(), 2); } remove(key); };
  try { model.discardUnavailableRecovery(storage, identity, entries, now); } catch { /* A stale cleanup may safely refuse. */ }
  assert.ok(newer); assert.equal(storage.getItem(newer.key), newer.raw);
});

function recoveryHook(t) {
  const h = harness(), storage = memory(), timers = []; let authorized = true, api;
  t?.after(() => h.unmount());
  h.window.localStorage = storage;
  h.globals.setTimeout = (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; };
  h.globals.clearTimeout = timer => { timer.cancelled = true; };
  const assertCurrent = () => { if (!authorized) throw Error('Owner session changed'); };
  const props = { session: { ...identity, assertCurrent }, doc: fresh(), revision: 3, dirty: false, ready: true };
  const use = h.load('src/owner/use-draft-recovery.ts').useDraftRecovery;
  const C = () => { api = use(props.session, props.doc, props.revision, props.dirty, props.ready); return null; };
  const render = () => h.render(C); render();
  return { h, props, storage, timers, render, get api() { return api; }, async ready() { await tick(); render(); }, revoke() { authorized = false; } };
}

test('recovery debounce fails closed after auth loss and logout cannot be followed by a queued stale write', async t => {
  const f = recoveryHook(t); await f.ready(); f.props.dirty = true; f.render(); await f.ready(); const timer = f.timers.at(-1);
  f.revoke(); timer.fn(); f.render(); assert.equal(f.storage.length, 0); assert.match(f.api.problem, /session changed/);
  f.api.stop(); timer.fn(); f.render(); assert.equal(f.storage.length, 0); f.h.unmount();
  const g = recoveryHook(t); await g.ready(); g.props.dirty = true; g.render(); await g.ready(); assert.equal(g.api.flush(), true); assert.equal(model.listRecovery(g.storage, identity).length, 1); assert.equal(g.storage.length, 2, "one immutable checkpoint plus its separate active-writer lease");
  const pending = g.timers.at(-1); g.api.stop(); assert.equal(g.storage.length, 0); pending.fn(); assert.equal(g.storage.length, 0); g.h.unmount();
});

test('recovery restore is explicit, revalidates exact bytes and current authority, and stable session wrappers do not create extra branches', async t => {
  const f = recoveryHook(t), original = fresh(), other = new model.DraftRecoveryBranch(f.storage, identity, branchName(30)); await f.ready();
  original.home.title = 'Recovered unsaved title'; const saved = other.checkpoint(original, 1);
  f.api.refresh(); f.render(); assert.notEqual(f.props.doc.home.title, original.home.title, 'listing must never auto-restore');
  const restored = f.api.restore(saved); assert.equal(restored.home.title, original.home.title); assert.equal(f.props.revision, 3);
  f.props.dirty = true; f.render(); f.api.flush();
  for (let i = 0; i < 5; i++) { f.props.session = { ...f.props.session }; f.render(); f.api.flush(); }
  assert.equal(model.listRecovery(f.storage, identity).length, 2); assert.equal(f.storage.length, 3, "two checkpoints plus this hook’s active lease");
  other.checkpoint({ ...original, home: { ...original.home, title: 'Newer recovery' } }, 2);
  assert.throws(() => f.api.restore(saved), /changed/); f.revoke(); assert.throws(() => f.api.restore(saved), /session changed/); f.h.unmount();
});

test('stop before deferred recovery initialization cannot recreate a writable branch while auth teardown is pending', async t => {
  const f = recoveryHook(t); f.props.dirty = true; f.render(); f.api.stop();
  await f.ready(); assert.equal(f.api.flush(), false); assert.equal(f.storage.length, 0); f.h.unmount();
});

test('storage denial during logout cleanup cannot prevent closure or permit queued recovery writes', async t => {
  const f = recoveryHook(t); await f.ready(); f.props.dirty = true; f.render(); await f.ready(); assert.equal(f.api.flush(), true);
  f.storage.removeItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  assert.doesNotThrow(() => f.api.stop()); assert.equal(f.api.flush(), false);
  for (const timer of f.timers) timer.fn(); assert.equal(model.listRecovery(f.storage, identity).length, 1); assert.equal(f.storage.length, 2, 'Browser-denied deletion retains the old checkpoint and lease, never new writes');
  assert.throws(() => f.api.restore(model.listRecovery(f.storage, identity)[0]), /locked/); f.h.unmount();
});

test('preview snapshots reject unknown private structures, invalid page/sequence and oversize data, and are detached copies', () => {
  const api = load('src/owner/live-preview-channel.ts'), doc = fresh(), page = doc.pages[0].id;
  const view = api.createPreviewSnapshot(doc, page, 1); doc.home.title = 'Changed later'; assert.notEqual(view.content.home.title, doc.home.title);
  for (const value of [{ ...view, auth: { token: 'secret' } }, { ...view, pageId: 'missing' }, { ...view, sequence: Infinity }, { ...view, content: { ...fresh(), hubClientSecrets: [] } }]) assert.equal(api.readPreviewSnapshot(value), null);
  assert.throws(() => api.createPreviewSnapshot({ ...fresh(), home: { ...fresh().home, description: 'x'.repeat(api.PREVIEW_MAX_BYTES) } }, page, 2));
});

test('parent preview sends no bytes before exact-peer handshake and ignores foreign or save/publish message commands', () => {
  const h = harness(), sent = [], errors = [], intervals = [], timers = [];
  h.window.location.origin = 'https://tmc.test';
  const peer = { closed: false, postMessage: (value, origin) => sent.push({ value, origin }), focus() {}, close() { this.closed = true; } };
  h.window.open = () => peer; h.window.setInterval = fn => { intervals.push(fn); return fn; }; h.window.clearInterval = () => {};
  h.window.setTimeout = fn => { timers.push(fn); return fn; }; h.window.clearTimeout = () => {};
  const use = h.load('src/owner/use-live-preview.ts').useLivePreview, doc = fresh(), error = text => errors.push(text), authorize = () => {};
  let api; const C = () => { api = use(doc, doc.pages[0].id, error, authorize); return null; }; h.render(C); api.open(); timers.forEach(fn => fn());
  assert.equal(sent.some(item => item.value.kind === 'snapshot'), false);
  const data = { channel: 'tmc-owner-live-preview-v1', kind: 'ready' };
  message(h.window, 'https://evil.test', peer, data); message(h.window, h.window.location.origin, {}, data);
  for (const kind of ['save', 'publish', 'navigate', 'credentials']) message(h.window, h.window.location.origin, peer, { ...data, kind });
  assert.equal(sent.some(item => item.value.kind === 'snapshot'), false);
  message(h.window, h.window.location.origin, peer, data); assert.equal(sent.filter(item => item.value.kind === 'snapshot').length, 1);
  assert.ok(sent.every(item => item.origin === h.window.location.origin));
  api.close(); assert.equal(peer.closed, true); const count = sent.length;
  message(h.window, h.window.location.origin, peer, data); intervals.forEach(fn => fn()); assert.equal(sent.length, count); assert.deepEqual(errors, []); h.unmount();
});

test('child preview rejects wrong origin/peer/nonce/sequence, clears on timeout, and cannot be revived by stale messages', () => {
  const h = harness(), outgoing = [], intervals = []; let currentTime = now, authorized = true;
  h.window.location.origin = 'https://tmc.test'; h.window.opener = { closed: false, postMessage: (...args) => outgoing.push(args) };
  h.window.setInterval = fn => { intervals.push(fn); return fn; }; h.window.clearInterval = () => {};
  h.globals.Date = class extends Date { static now() { return currentTime; } };
  h.overrides['@/components/ColorMode'] = { useColorMode: () => 'light', ColorModeToggle: () => null };
  h.overrides['@/components/SiteContent'] = { SiteContentFrame: function SiteContentFrame() { return null; } };
  h.overrides['./FirebaseOwnerGate'] = { FirebaseOwnerGate: () => null };
  h.overrides['react-dom'] = { createPortal: child => child };
  const C = h.load('src/owner/OwnerLivePreview.tsx').OwnerLivePreview, props = { assertCurrent() { if (!authorized) throw Error('Session changed'); } }, render = () => h.render(C, props);
  render(); assert.equal(outgoing[0][0].kind, 'ready');
  const doc = fresh(), data = { channel: 'tmc-owner-live-preview-v1', kind: 'snapshot', nonce: '12345678-1234-4234-8234-123456789012', snapshot: { content: doc, pageId: doc.pages[0].id, sequence: 1 } };
  const view = () => h.find(node => node.type?.name === 'SiteContentFrame');
  message(h.window, 'https://evil.test', h.window.opener, data); message(h.window, h.window.location.origin, {}, data); render(); assert.equal(view(), undefined);
  message(h.window, h.window.location.origin, h.window.opener, data); render(); assert.ok(view()); assert.equal(view().props.editable, false);
  for (const patch of [{ nonce: '22345678-1234-4234-8234-123456789012' }, { snapshot: { ...data.snapshot, sequence: 0 } }]) message(h.window, h.window.location.origin, h.window.opener, { ...data, ...patch });
  render(); assert.equal(view().props.content.home.title, doc.home.title);
  currentTime += 21000; intervals.forEach(fn => fn()); render(); assert.equal(view(), undefined); assert.match(textContent(h.tree), /paused or ended/);
  message(h.window, h.window.location.origin, h.window.opener, { ...data, snapshot: { ...data.snapshot, sequence: 2 } }); render(); assert.equal(view(), undefined);
  authorized = false; message(h.window, h.window.location.origin, h.window.opener, data); render(); assert.equal(view(), undefined); h.unmount();
});

test('explicit popout reopen creates a fresh receiver and nonce, without accepting the previous window handshake', () => {
  const h = harness(), peers = [], sent = [], intervals = new Set(); h.window.location.origin = 'https://tmc.test';
  h.window.open = () => { const peer = { closed: false, postMessage: (data, origin) => sent.push({ peer, data, origin }), close() { this.closed = true; } }; peers.push(peer); return peer; };
  h.window.setInterval = fn => { intervals.add(fn); return fn; }; h.window.clearInterval = fn => intervals.delete(fn);
  h.window.setTimeout = () => 1; h.window.clearTimeout = () => {};
  const use = h.load('src/owner/use-live-preview.ts').useLivePreview, doc = fresh(), error = () => {}, authorize = () => {}; let api;
  const C = () => { api = use(doc, doc.pages[0].id, error, authorize); return null; }; h.render(C); assert.equal(intervals.size, 0);
  const ready = { channel: 'tmc-owner-live-preview-v1', kind: 'ready' }; api.open(); message(h.window, h.window.location.origin, peers[0], ready);
  const first = sent.find(item => item.data.kind === 'snapshot'); assert.ok(first); api.open(); assert.equal(peers[0].closed, true); assert.equal(intervals.size, 1);
  const count = sent.length; message(h.window, h.window.location.origin, peers[0], ready); assert.equal(sent.length, count);
  message(h.window, h.window.location.origin, peers[1], ready); const second = sent.at(-1); assert.equal(second.data.kind, 'snapshot'); assert.notEqual(second.data.nonce, first.data.nonce); assert.equal(second.peer, peers[1]);
  api.close(); assert.equal(intervals.size, 0); h.unmount();
});
