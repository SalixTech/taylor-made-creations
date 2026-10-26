import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';

// Exact current source with synthetic hooks/store; no Firebase, browser, or external writes.
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup() {
  const h = harness(), timers = new Map(); let timerId = 0;
  h.globals.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  h.globals.clearTimeout = id => timers.delete(id);
  h.overrides['./HelpButton'] = { HelpButton: function HelpButton() {} };
  h.overrides['./TaylorServices'] = { TaylorServices: () => null };
  h.overrides['./CommissionRequests'] = { CommissionRequests: () => null };
  const defaults = h.load('src/owner/defaults.ts'), storage = h.load('src/owner/storage.ts');
  let raw = defaults.createInitialOwnerWorkspace(), loads = 0, saves = 0, publishes = 0, queue = [], saveGate = null, saveError = null;
  const listeners = new Set();
  const base = storage.createOwnerStore({ read: async () => structuredClone(raw), update: async fn => { raw = structuredClone(fn(raw)); return structuredClone(raw); } });
  const store = { ...base,
    async load() { loads++; if (queue.length) return queue.shift(); return structuredClone(raw); },
    async saveDraft(...args) { saves++; if (saveGate) await saveGate.promise; if (saveError) throw new Error(saveError); return base.saveDraft(...args); },
    async publishLive() { publishes++; throw new Error('Publishing not authorized by these tests'); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  const props = { store, initialSection: 'pages', mode: 'cloud', userEmail: 'qa@example.test', onSignOut: async () => {} };
  const render = () => h.render(Portal, props);
  const button = label => h.find(n => (n.type === 'button' || n.type === 'a') && (content(n).trim() === label || n.props['aria-label'] === label || label === 'Save' && /^Save\s/.test(content(n))));
  const builder = () => h.find(n => typeof n.type === 'function' && n.type.name === 'OwnerVisualBuilder');
  const dialog = () => h.find(n => typeof n.type === 'function' && n.type.name === 'Dialog');
  const action = label => nodes(dialog()?.props.actions).find(n => (n.type === 'button' || n.type === 'a') && content(n) === label);
  const edit = title => { builder().props.onEdit(d => { d.home.title = title; }); render(); };
  const upload = busy => { h.find(n => typeof n.type === 'function' && n.type.name === 'OwnerUploadProvider').props.onBusyChange(busy); render(); };
  return { h, timers, defaults, props, render, button, builder, dialog, action, edit, upload, listeners,
    get title() { return builder()?.props.content.home.title; }, get loads() { return loads; }, get saves() { return saves; }, get publishes() { return publishes; }, get raw() { return raw; },
    set raw(value) { raw = value; }, set queue(value) { queue = value; }, set saveGate(value) { saveGate = value; }, set saveError(value) { saveError = value; },
    focus() { h.window.dispatchEvent(new Event('focus')); }, notify() { for (const fn of listeners) fn(); },
    remote(title, revision = 1) { const next = defaults.createInitialOwnerWorkspace(); next.draft.home.title = title; next.revision = revision; next.updatedAt = '2026-10-25T21:00:00.000Z'; raw = next; return structuredClone(next); },
    expire() { const scheduled = [...timers.values()]; timers.clear(); for (const timer of scheduled) timer.fn(); render(); },
  };
}
async function open() { const t = setup(); t.render(); await flush(); t.render(); return t; }

for (const event of ['focus', 'notify']) test(`clean ${event} refresh reads newer draft without autosaving or publishing`, async () => {
  const t = await open(); assert.equal(t.loads, 1); t.remote('OTHER DEVICE'); t[event](); await flush(); t.render();
  assert.equal(t.title, 'OTHER DEVICE'); assert.equal(t.loads, 2); assert.equal(t.saves, 0); assert.equal(t.publishes, 0);
  assert.doesNotMatch(content(t.h.tree), /unsaved changes/); t.h.unmount(); assert.equal(t.listeners.size, 0);
});
for (const event of ['focus', 'notify']) test(`dirty ${event} refresh does not read or overwrite edits`, async () => {
  const t = await open(); t.edit('MY UNSAVED'); t.remote('OTHER DEVICE'); t[event](); await flush(); t.render();
  assert.equal(t.title, 'MY UNSAVED'); assert.equal(t.loads, 1); assert.equal(t.saves, 0); assert.equal(t.publishes, 0); t.h.unmount();
});
test('upload state synchronously prevents automatic reads, sync clicks, and native unload without relying on render', async () => {
  const t = await open(); const provider = t.h.find(n => typeof n.type === 'function' && n.type.name === 'OwnerUploadProvider');
  provider.props.onBusyChange(true); t.focus(); t.notify(); const event = new Event('beforeunload', { cancelable: true }); Object.defineProperty(event, 'returnValue', { value: null, writable: true }); t.h.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.equal(event.returnValue, ''); t.render();
  assert.equal(t.button('Sync cloud draft').props.disabled, true); t.button('Sync cloud draft').props.onClick(); await flush(); t.render();
  assert.equal(t.loads, 1); assert.equal(t.dialog(), undefined); assert.equal(t.saves, 0); t.upload(false); t.h.unmount();
});
test('manual clean sync reloads from cloud, is duplicate-locked, and never writes', async () => {
  const t = await open(), pending = deferred(); t.queue = [pending.promise]; t.remote('SYNCED', 3);
  const click = t.button('Sync cloud draft').props.onClick; click(); click(); t.render(); assert.equal(t.loads, 2); assert.equal(t.button('Sync cloud draft').props.disabled, true);
  assert.equal(t.h.find(n => n.type === 'fieldset').props.disabled, true); pending.resolve(t.raw); await flush(); t.render();
  assert.equal(t.title, 'SYNCED'); assert.equal(t.saves, 0); assert.equal(t.publishes, 0); assert.match(content(t.h.tree), /Cloud Sync complete/); t.h.unmount();
});
test('manual dirty sync requires explicit choice; Cancel preserves edits and never reads', async () => {
  const t = await open(); t.edit('DO NOT DISCARD'); t.remote('CLOUD ONLY'); t.button('Sync cloud draft').props.onClick(); t.render();
  assert.equal(t.dialog().props.title, 'Sync with unsaved changes?'); assert.equal(t.loads, 1); assert.equal(t.saves, 0);
  t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.title, 'DO NOT DISCARD'); assert.equal(t.loads, 1); t.h.unmount();
});
test('explicit dirty reload discards only unsaved work and does not save or publish', async () => {
  const t = await open(); t.edit('UNSAVED'); t.remote('SAVED ELSEWHERE', 7); t.button('Sync cloud draft').props.onClick(); t.render();
  await t.action('Reload saved draft').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.title, 'SAVED ELSEWHERE'); assert.equal(t.saves, 0); assert.equal(t.publishes, 0); t.h.unmount();
});
test('save-first sync waits for one acknowledged save before reloading and never publishes', async () => {
  const t = await open(); t.edit('SAVE THIS FIRST'); t.button('Sync cloud draft').props.onClick(); t.render(); const pending = deferred(); t.saveGate = pending;
  const click = t.action('Save draft & sync').props.onClick; const first = click(); const second = click(); t.render(); assert.equal(t.saves, 1); assert.equal(t.loads, 1); assert.equal(t.dialog().props.dismissDisabled, true);
  pending.resolve(); await Promise.all([first, second]); t.render(); assert.equal(t.raw.draft.home.title, 'SAVE THIS FIRST'); assert.equal(t.raw.revision, 1); assert.equal(t.loads, 2); assert.equal(t.publishes, 0); assert.equal(t.dialog(), undefined); t.h.unmount();
});
test('conflicted save-first sync retains edits, does not reload, and offers deliberate reload or cancel', async () => {
  const t = await open(); t.edit('MY VERSION'); t.remote('NEWER DEVICE', 2); t.button('Sync cloud draft').props.onClick(); t.render(); await t.action('Save draft & sync').props.onClick(); t.render();
  assert.equal(t.title, 'MY VERSION'); assert.equal(t.raw.draft.home.title, 'NEWER DEVICE'); assert.equal(t.loads, 1); assert.equal(t.saves, 1); assert.match(content(t.h.tree), /another tab or device/); assert.ok(t.action('Reload saved draft')); assert.ok(t.action('Cancel')); t.h.unmount();
});
test('failed manual reload preserves unsaved content and exposes an error without retrying writes', async () => {
  const t = await open(); t.edit('PRESERVE ON ERROR'); t.button('Sync cloud draft').props.onClick(); t.render(); const pending = deferred(); t.queue = [pending.promise]; const call = t.action('Reload saved draft').props.onClick(); pending.reject(new Error('Permission denied')); await call; t.render();
  assert.equal(t.title, 'PRESERVE ON ERROR'); assert.match(content(t.h.tree), /Permission denied/); assert.equal(t.saves, 0); assert.equal(t.publishes, 0); t.h.unmount();
});
test('background read started clean cannot overwrite edits made while the read is pending', async () => {
  const t = await open(), pending = deferred(); t.queue = [pending.promise]; t.focus(); t.render(); t.edit('TYPED WHILE READING'); pending.resolve(t.remote('LATE CLOUD', 2)); await flush(); t.render();
  assert.equal(t.title, 'TYPED WHILE READING'); assert.equal(t.saves, 0); assert.match(content(t.h.tree), /unsaved changes/); t.h.unmount();
});
test('background read started clean cannot install content while upload is pending', async () => {
  const t = await open(), title = t.title, pending = deferred(); t.queue = [pending.promise]; t.focus(); t.upload(true); pending.resolve(t.remote('LATE CLOUD', 2)); await flush(); t.render(); assert.equal(t.title, title); t.upload(false); t.focus(); await flush(); t.render(); assert.equal(t.title, 'LATE CLOUD'); t.h.unmount();
});
test('save invalidates an older background read and the late response cannot roll the draft back', async () => {
  const t = await open(), pending = deferred(); t.queue = [pending.promise]; t.focus(); t.edit('NEW SAVED VERSION'); t.button('Save').props.onClick(); t.render(); await t.action('Save draft').props.onClick(); t.render();
  assert.equal(t.raw.revision, 1); const old = t.defaults.createInitialOwnerWorkspace(); old.draft.home.title = 'STALE RESULT'; pending.resolve(old); await flush(); t.render(); assert.equal(t.title, 'NEW SAVED VERSION'); assert.equal(t.saves, 1); t.h.unmount();
});
test('repeated focus/store events are coalesced and lower cloud revisions are ignored', async () => {
  const t = await open(); t.remote('REVISION FIVE', 5); t.focus(); await flush(); t.render(); const pending = deferred(); t.queue = [pending.promise]; t.focus(); t.notify(); t.focus(); assert.equal(t.loads, 3); pending.resolve(t.remote('STALE REVISION', 4)); await flush(); t.render(); assert.equal(t.title, 'REVISION FIVE'); t.h.unmount();
});
test('unmount cancels background effects and late manual/automatic results do not install private content', async () => {
  for (const start of [t => t.focus(), t => t.button('Sync cloud draft').props.onClick()]) {
    const t = await open(), pending = deferred(); t.queue = [pending.promise]; start(t); t.render(); const before = t.title; t.h.unmount(); pending.resolve(t.remote('AFTER SESSION ENDS', 2)); await flush();
    assert.equal(t.listeners.size, 0); assert.equal(t.h.hooks.some(slot => slot?.home?.title === 'AFTER SESSION ENDS'), false); assert.equal(t.title, before); t.focus(); assert.equal(t.loads, 2);
  }
});
test('success notices expire after exactly 30 seconds and can be dismissed immediately', async () => {
  const t = await open(); t.button('Sync cloud draft').props.onClick(); await flush(); t.render(); assert.match(content(t.h.tree), /Cloud Sync complete/); assert.deepEqual([...t.timers.values()].map(x => x.delay), [30_000]);
  t.expire(); assert.doesNotMatch(content(t.h.tree), /Cloud Sync complete/); t.button('Sync cloud draft').props.onClick(); await flush(); t.render(); t.button('Dismiss notification').props.onClick(); t.render(); assert.doesNotMatch(content(t.h.tree), /Cloud Sync complete/); assert.equal(t.timers.size, 0); t.h.unmount();
});
test('actionable error does not auto-expire, survives section navigation, and has an explicit dismiss control', async () => {
  const t = await open(), pending = deferred(); t.queue = [pending.promise]; t.focus(); pending.reject(new Error('Permission denied')); await flush(); t.render(); assert.match(content(t.h.tree), /Permission denied/); assert.equal(t.timers.size, 0);
  t.button('Home page').props.onClick(); t.render(); assert.match(content(t.h.tree), /Permission denied/); t.expire(); assert.match(content(t.h.tree), /Permission denied/); t.button('Dismiss error').props.onClick(); t.render(); assert.doesNotMatch(content(t.h.tree), /Permission denied/); t.h.unmount();
});
test('help feedback is delivered to a dismissible main-workspace notice rather than only sidebar state', async () => {
  const t = await open(); const help = t.h.find(n => typeof n.type === 'function' && n.type.name === 'HelpButton'); assert.equal(typeof help.props.onFeedback, 'function'); help.props.onFeedback({ kind: 'success', message: 'Provider accepted test report.' }); t.render();
  const main = t.h.find(n => n.type === 'div' && n.props.className === 'workspace'); assert.match(content(main), /Provider accepted test report/); assert.ok(nodes(main).some(n => n.props['aria-label'] === 'Dismiss notification')); t.h.unmount();
});
test('beforeunload requests the browser native guard only for dirty work and performs no application confirmation/write', async () => {
  const t = await open(); let prompts = 0; t.h.window.confirm = () => { prompts++; return true; };
  const before = new Event('beforeunload', { cancelable: true }); t.h.window.dispatchEvent(before); assert.equal(before.defaultPrevented, false); t.edit('UNSAVED');
  const dirty = new Event('beforeunload', { cancelable: true }); Object.defineProperty(dirty, 'returnValue', { value: null, writable: true }); t.h.window.dispatchEvent(dirty); assert.equal(dirty.defaultPrevented, true); assert.equal(dirty.returnValue, ''); assert.equal(prompts, 0); assert.equal(t.saves, 0); assert.equal(t.publishes, 0); t.h.unmount();
});

test('edit callback marks dirty immediately, so a same-tick focus cannot race React rendering', async () => {
  const t = await open(); t.builder().props.onEdit(d => { d.home.title = 'SAME TICK EDIT'; }); t.focus(); t.notify(); await flush(); t.render(); assert.equal(t.loads, 1); assert.equal(t.title, 'SAME TICK EDIT'); assert.equal(t.saves, 0); t.h.unmount();
});
test('a slow save-first sync which unmounts never begins its follow-on cloud read', async () => {
  const t = await open(); t.edit('SAVE WITHOUT FOLLOWON'); t.button('Sync cloud draft').props.onClick(); t.render(); const pending = deferred(); t.saveGate = pending; const action = t.action('Save draft & sync').props.onClick(); t.h.unmount(); pending.resolve(); await action; assert.equal(t.loads, 1); assert.equal(t.saves, 1); assert.equal(t.publishes, 0);
});
test('Dialog outside-click dismissal requires both pointer-down and click outside; busy disables dismissal', () => {
  const h = harness(), Dialog = h.load('src/owner/OwnerFields.tsx').Dialog; let dismissed = 0;
  const props = { title: 'Confirmation', children: 'Content', actions: null, onClose() { dismissed++; }, dismissDisabled: false };
  const render = () => h.render(Dialog, props); render(); const dom = h.tree.props.ref.current; dom.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 300 });
  const event = (x, y, target = dom) => ({ currentTarget: dom, target, clientX: x, clientY: y });
  const gesture = (down, up) => { h.tree.props.onPointerDown(down); h.tree.props.onClick(up); };
  gesture(event(50, 50), event(50, 50)); assert.equal(dismissed, 1);
  gesture(event(150, 150), event(50, 50)); assert.equal(dismissed, 1, 'content drag to backdrop is not dismissal');
  gesture(event(50, 50), event(150, 150)); assert.equal(dismissed, 1);
  gesture(event(50, 50, {}), event(50, 50)); assert.equal(dismissed, 1);
  props.dismissDisabled = true; render(); gesture(event(50, 50), event(50, 50)); assert.equal(dismissed, 1); let prevented = false;
  h.tree.props.onCancel({ preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(dismissed, 1);
  assert.equal(h.find(n => (n.type === 'button' || n.type === 'a') && n.props['aria-label'] === 'Close dialog').props.disabled, true);
  props.dismissDisabled = false; render(); h.tree.props.onCancel({ preventDefault() {} }); assert.equal(dismissed, 2); h.unmount();
});

test('identical new notifications restart the full 30-second timer rather than inheriting old expiry', async () => {
  const t = await open(); const notify = t.h.find(n => typeof n.type === 'function' && n.type.name === 'HelpButton').props.onFeedback;
  notify({ kind: 'success', message: 'Report accepted.' }); t.render(); const firstId = [...t.timers.keys()][0]; assert.ok(firstId);
  notify({ kind: 'success', message: 'Report accepted.' }); t.render(); const secondId = [...t.timers.keys()][0]; assert.notEqual(firstId, secondId); assert.equal(t.timers.size, 1); assert.equal(t.timers.get(secondId).delay, 30_000); assert.equal(t.timers.has(firstId), false); t.h.unmount(); assert.equal(t.timers.size, 0);
});
