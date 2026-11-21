import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ID = 'TMC-0123456789ABCDEF';
const OTHER = 'TMC-ABCDEF0123456789';
const CODE = 'TMC-abcdefghijklmnopqrstuvwxyz012345';
const ISO = '2026-10-26T20:00:00.000Z';
const session = (id = ID, version = 1) => ({ uid: `hub:${id}`, clientId: id, authVersion: version });
const client = (id = ID) => ({ clientId: id, displayName: id === ID ? 'Sky' : 'River', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO });
const project = (overrides = {}) => ({ projectId: '11111111-1111-4111-8111-111111111111', clientId: ID, title: 'Sky’s fox partial', summary: 'A fox partial with handpaws and a tail.', status: 'queued', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO, ...overrides });
const dashboard = (id = ID) => ({ client: client(id), projects: [project({ clientId: id, title: id === ID ? 'Sky’s fox partial' : 'River’s wolf head' })] });
function setup(options = {}) {
  const h = harness(), calls = [], subscriptions = [], dashboards = [];
  h.globals.AbortController = AbortController;
  h.overrides['@/components/PublicSiteContext'] = { usePublicOwnerContent: () => null };
  h.overrides['@/components/Brand'] = { Brand: 'Brand' };
  h.overrides['@/owner/site-design'] = { getTemplateImage: () => ({ src: '/images/tmc-wordmark.png', alt: '' }) };
  h.overrides['./client'] = {
    subscribeClientSession(callback, error) { const sub = { callback, error, stopped: false }; subscriptions.push(sub); calls.push({ method: 'subscribe' }); options.subscribe?.(sub); return () => { sub.stopped = true; }; },
    subscribeClientDashboard(session, callback, error) { const sub = { session, callback, error, stopped: false }; dashboards.push(sub); return () => { sub.stopped = true; }; },
    async signInClient(code) { calls.push({ method: 'sign-in', code }); return options.signIn ? options.signIn(code) : session(); },
    async signOutClient() { calls.push({ method: 'sign-out' }); return options.signOut?.(); },
    async loadClientDashboard(value, signal) { calls.push({ method: 'load', session: value, signal }); return options.load ? options.load(value, signal) : dashboard(value.clientId); },
    clientHubErrorMessage: error => error.message || 'Safe generic error',
    isClientHubSessionError: error => error.code === 'expired',
  };
  const Component = h.load('src/client-hub/ClientHub.tsx').ClientHub;
  const render = () => h.render(Component);
  const button = label => h.find(n => n.type === 'button' && (content(n) === label || n.props['aria-label'] === label));
  const view = () => h.find(n => n.type?.name === 'ClientDashboard');
  const emit = value => subscriptions.at(-1).callback(value);
  render();
  return { h, render, calls, subscriptions, dashboards, button, view, emit, async ready() { await flush(); emit(session()); await flush(); render(); } };
}

test('client login is a labelled code-only native form with paste/Enter support without an owner entry', async () => {
  const t = setup(); await flush(); t.emit(null); t.render();
  const input = t.h.find(n => n.type?.name === 'SignInCodeFields');
  assert.ok(input, 'dedicated segmented control is mounted'); assert.equal(input.props.show, false); assert.equal(input.props.value, ''); assert.equal(input.props.disabled, false);
  assert.equal(t.h.find(n => n.type === 'label' && n.props.id === 'client-code-label').props.htmlFor, 'client-signin-code');
  assert.ok(t.h.find(n => n.type === 'form').props.onSubmit); assert.equal(t.button('Enter the studio→').props.type, 'submit');
  assert.equal(t.h.find(n => n.type === 'Link' && content(n).startsWith('Head Floof Login')), undefined);
  assert.equal(t.h.all(n => n.type?.name === 'SignInCodeFields').length, 1); t.h.unmount();
});

test('repeated sign-in submits issue one exchange and immediately clear the reusable secret', async () => {
  const pending = deferred(), t = setup({ signIn: () => pending.promise }); await flush(); t.emit(null); t.render();
  t.h.find(n => n.type?.name === 'SignInCodeFields').props.onChange(` ${CODE} `); t.render();
  const submit = t.h.find(n => n.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} }); const second = submit({ preventDefault() {} }); t.render();
  assert.equal(t.calls.filter(c => c.method === 'sign-in').length, 1); assert.equal(t.calls.find(c => c.method === 'sign-in').code, CODE);
  assert.equal(t.h.find(n => n.type?.name === 'SignInCodeFields').props.value, ''); assert.equal(t.h.find(n => n.type?.name === 'SignInCodeFields').props.disabled, true);
  assert.equal(t.h.window.location.href, ''); assert.equal(t.h.window.history.length, 1);
  pending.reject(new Error('That code could not be verified.')); await Promise.all([first, second]); t.render();
  assert.match(content(t.h.tree), /That code could not be verified/); assert.equal(t.h.find(n => n.type?.name === 'SignInCodeFields').props.value, ''); assert.equal(t.h.find(n => n.type?.name === 'SignInCodeFields').props.disabled, false); t.h.unmount();
});

test('sign-in promise alone cannot expose private data without a verified session callback', async () => {
  const t = setup(); await flush(); t.emit(null); t.render(); t.h.find(n => n.type?.name === 'SignInCodeFields').props.onChange(CODE); t.render();
  await t.h.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); t.render(); assert.equal(t.view(), undefined); assert.equal(t.calls.some(c => c.method === 'load'), false); t.h.unmount();
});

test('same semantic auth session does not create a force-refresh/token-listener reload loop', async () => {
  const t = setup(); await t.ready(); assert.ok(t.view());
  t.emit({ ...session() }); t.emit({ ...session() }); await flush(); t.render();
  assert.equal(t.calls.filter(c => c.method === 'load').length, 1); assert.equal(t.view().props.client.clientId, ID); t.h.unmount();
});

test('account changes abort stale reads and late results cannot replace the newer client', async () => {
  const first = deferred(), second = deferred(); const t = setup({ load: value => value.clientId === ID ? first.promise : second.promise });
  await flush(); t.emit(session()); const firstSignal = t.calls.find(c => c.method === 'load').signal;
  t.emit(session(OTHER)); assert.equal(firstSignal.aborted, true);
  second.resolve(dashboard(OTHER)); await flush(); t.render(); assert.equal(t.view().props.client.clientId, OTHER);
  first.resolve(dashboard(ID)); await flush(); t.render(); assert.equal(t.view().props.client.clientId, OTHER);
  t.emit(null); t.render(); assert.equal(t.view(), undefined); assert.doesNotMatch(content(t.h.tree), /River’s wolf head|Sky’s fox partial/); t.h.unmount();
});

test('manual refresh and focus re-verify without unmounting the selected workspace', async () => {
  let count = 0; const refresh = deferred(); const t = setup({ load: () => ++count === 1 ? dashboard() : refresh.promise }); await t.ready();
  const key = t.view().key; t.view().props.onRefresh(); t.render(); assert.ok(t.view()); assert.equal(t.view().key, key);
  refresh.resolve(dashboard()); await flush(); t.render(); assert.ok(t.view());
  t.h.window.dispatchEvent(new Event('focus')); await flush(); t.render(); assert.equal(t.calls.filter(c => c.method === 'load').length, 3); t.h.unmount();
});

test('sign-out immediately locks data; failed sign-out stays locked and offers a safe retry', async () => {
  const pending = deferred(); let count = 0; const t = setup({ signOut: () => ++count === 1 ? pending.promise : undefined }); await t.ready();
  const signOut = t.view().props.onSignOut; signOut(); signOut(); t.render(); assert.equal(t.calls.filter(c => c.method === 'sign-out').length, 1); assert.equal(t.view(), undefined); assert.match(content(t.h.tree), /Signing out and locking/);
  pending.reject(new Error('Network')); await flush(); t.render(); assert.equal(t.view(), undefined); assert.match(content(t.h.tree), /Sign-out could not be confirmed/);
  t.emit(session()); await flush(); t.render(); assert.equal(t.view(), undefined); assert.equal(t.calls.filter(c => c.method === 'load').length, 1, 'late token events cannot unlock a failed sign-out');
  t.button('Try signing out again').props.onClick(); await flush(); t.render(); assert.ok(t.h.find(n => n.type === 'form')); assert.equal(t.view(), undefined); assert.ok(t.h.find(n => n.type?.name === 'SignInCodeFields').props.inputRef, 'return focus is supplied to the segmented control'); t.h.unmount();
});

test('configuration errors have no fallback sign-in; retry starts a fresh subscription', async () => {
  let attempts = 0; const t = setup({ subscribe(sub) { if (++attempts === 1) { sub.callback(null); sub.error(new Error('Connection setup is incomplete.')); } else sub.callback(null); } });
  await flush(); t.render(); assert.match(content(t.h.tree), /Connection setup is incomplete/); assert.equal(t.h.find(n => n.type === 'form'), undefined);
  t.button('Try again').props.onClick(); t.render(); await flush(); t.render(); assert.equal(t.subscriptions[0].stopped, true); assert.ok(t.h.find(n => n.type === 'form')); t.h.unmount();
});

test('revoked session hides data and directs the client to the current sign-in code', async () => {
  const t = setup({ load: async () => { throw Object.assign(new Error('Your session has expired.'), { code: 'expired' }); } }); await t.ready();
  assert.equal(t.view(), undefined); assert.match(content(t.h.tree), /Your session has expired/); assert.ok(t.button('Sign out to enter a new code')); assert.equal(t.button('Try again'), undefined); t.h.unmount();
});

test('unmount aborts reads and late results cannot revive a private dashboard', async () => {
  const pending = deferred(); const t = setup({ load: () => pending.promise }); await flush(); t.emit(session()); t.render();
  const signal = t.calls.find(c => c.method === 'load').signal; t.h.unmount(); assert.equal(signal.aborted, true); assert.equal(t.subscriptions[0].stopped, true);
  pending.resolve(dashboard()); await flush(); assert.equal(t.view(), undefined);
});

function dashboardSetup(props = {}, clipboard = async () => {}) {
  const h = harness(), copies = []; h.globals.navigator = { clipboard: { async writeText(value) { copies.push(value); return clipboard(value); } } };
  const Component = h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard;
  const defaults = { ...dashboard(), onRefresh() {}, onSignOut() {}, ...props };
  const render = () => h.render(Component, defaults); render();
  const button = label => h.find(n => n.type === 'button' && (content(n) === label || n.props['aria-label'] === label));
  return { h, render, copies, button };
}

test('one client selects between multiple commissions without changing the URL or revealing a login code', () => {
  const projects = [project(), project({ projectId: '22222222-2222-4222-8222-222222222222', title: 'Second character', status: 'in-progress', progress: 25 })];
  const t = dashboardSetup({ projects });
  assert.equal(t.h.find(n => n.type?.name === 'HubWorkspaceWindow').props.project.projectId, projects[0].projectId);
  const choices = t.h.find(n => n.type?.name === 'ClientCommissionCards'); assert.equal(choices.props.projects.length, 2); assert.equal(choices.props.selectedId, projects[0].projectId);
  choices.props.onSelect(projects[1].projectId); t.render(); assert.equal(t.h.find(n => n.type?.name === 'HubWorkspaceWindow').props.project.projectId, projects[1].projectId);
  assert.equal(t.h.window.location.href, ''); assert.equal(t.h.find(n => n.type === 'input'), undefined); assert.doesNotMatch(content(t.h.tree), new RegExp(ID));
  assert.doesNotMatch(content(t.h.tree), new RegExp(CODE)); assert.equal(t.h.all(n => n.type === 'input' && n.props.type === 'password').length, 0); t.h.unmount();
});

test('permanent IDs and copy controls are absent from the client dashboard', () => {
  const t = dashboardSetup(); assert.equal(t.button('Copy permanent client ID'), undefined); assert.equal(t.h.find(n => n.type === 'input' && n.props.value === ID), undefined); assert.doesNotMatch(content(t.h.tree), /permanent client ID|One client ID/); t.h.unmount();
});

test('account display name saves separately and follows the commission workspace without overwriting canonical name', async () => {
  const h = harness(), saves = [], pending = deferred(); h.overrides['./client'] = { clientHubErrorMessage: e => e.message, async updateHubNickname(...args) { saves.push(args); await pending.promise; return { client: { ...args[0], nickname: args[1], updatedAt: "2026-10-26T21:00:00.000Z" } }; } };
  const Component = h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard, props = { ...dashboard(), onRefresh() {}, onSignOut() {} }, render = () => h.render(Component, props); render();
  h.find(n => n.type === 'button' && content(n) === 'Edit Profile').props.onClick(); render(); const input = h.find(n => n.type === 'input' && n.props.maxLength === 60); input.props.onChange({ target: { value: 'Moon fox' } }); render();
  const form = h.find(n => n.type === 'form'); form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} }); render(); assert.equal(saves.length, 1); pending.resolve(); await flush(); render();
  assert.match(content(h.tree), /Welcome back, Moon fox/); assert.ok(h.find(n => n.type === 'section' && n.props['aria-label'] === 'Your display settings'), 'successful save keeps display settings open'); const workspace = h.find(n => n.type?.name === 'HubWorkspaceWindow'); assert.equal(workspace.props.clientDisplayName, 'Sky'); assert.equal(workspace.props.clientNickname, 'Moon fox'); h.unmount();
});

test('empty accounts have an honest no-commissions state and planned PayPal-only invoice area', () => {
  const t = dashboardSetup({ projects: [] }); assert.match(content(t.h.tree), /No commissions are linked/); assert.equal(t.h.find(n => n.type?.name === 'HubWorkspaceWindow'), undefined); assert.equal(t.h.find(n => n.type?.name === 'HubProgress'), undefined);
  assert.match(content(t.h.tree), /All invoices and payments are handled through PayPal/); assert.doesNotMatch(content(t.h.tree), /Stripe|Visa|card number|Pay now/); t.h.unmount();
});

test('client commission detail no longer renders a percentage bar for known or unknown progress', () => {
  const h = harness(), Detail = h.load('src/client-hub/ClientDashboard.tsx').ProjectDetail;
  for (const value of [null, undefined, NaN, -1, 101, '50', 0, 25, 100]) {
    h.render(Detail, { project: project({ status: 'completed', progress: value }) });
    assert.equal(h.find(n => n.type?.name === 'HubProgress'), undefined);
    assert.equal(h.find(n => n.props.role === 'progressbar'), undefined);
    assert.doesNotMatch(content(h.tree), /Manual progress|percentage not set/);
  }
  h.unmount();
});

test('tracking links open safely, and absent or unsafe links have no fake tracking control', () => {
  const h = harness(), Detail = h.load('src/client-hub/ClientDashboard.tsx').ProjectDetail;
  for (const value of [null, 'javascript:alert(1)', 'https://person:secret@example.com/', '//example.com', 'https:\\example.com']) { h.render(Detail, { project: project({ status: 'shipped', trackingUrl: value }) }); assert.equal(h.find(n => n.type === 'a' && n.props.target === '_blank'), undefined); }
  h.render(Detail, { project: project({ status: 'shipped', trackingUrl: 'https://example.com/tracking/123' }) }); const link = h.find(n => n.type === 'a' && n.props.target === '_blank'); assert.equal(link.props.href, 'https://example.com/tracking/123'); assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noopener noreferrer'); h.unmount();
});

test('UI source has no credential storage, URL transport, logging, local auth or fake payment form', () => {
  const source = ['ClientHub.tsx', 'ClientDashboard.tsx'].map(file => readFileSync(new URL(`../src/client-hub/${file}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|URLSearchParams|signInWithEmail|dangerouslySetInnerHTML|localStorage/);
  assert.match(source, /type="submit"/); assert.match(source, /setCode\(""\)/); assert.doesNotMatch(source, /href="\/taylor"/); assert.doesNotMatch(source, /href="\/contact"/);
});
