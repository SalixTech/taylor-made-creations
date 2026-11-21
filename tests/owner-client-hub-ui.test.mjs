import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content, nodes } from './owner-ui-harness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const client = { clientId: 'TMC-0011223344556677', displayName: 'Owner test client', status: 'active', authVersion: 1, createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
const second = { ...client, clientId: 'TMC-8899AABBCCDDEEFF', displayName: 'Another test client' };
const project = { projectId: 'test-project', clientId: client.clientId, title: 'Existing commission', summary: 'Client-visible details', status: 'in-progress', progress: 25, progressSource: 'manual', trackingUrl: null, requestId: null, version: 3, createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
const code = 'TMC-abcdefghijklmnopqrstuvwxyz012345';

function setup(options = {}) {
  const h = harness(), calls = [], dirty = [], busy = [], listSubscriptions = [], detailSubscriptions = [];
  let authCallback, valid = true;
  h.globals.navigator = { clipboard: { async writeText(value) { calls.push({ method: 'copy', value }); if (options.copyFailure) throw Error('Clipboard denied'); } } };
  h.overrides['./taylor-services-client'] = { async taylorOwnerSession() { return { assertCurrent() { if (!valid) throw Error('Owner changed'); }, auth: { onAuthStateChanged(callback) { authCallback = callback; return () => {}; } } }; } };
  h.overrides['./client-hub-client'] = {
    clientHubErrorMessage: error => error instanceof Error ? error.message : 'Client Hub request failed',
    subscribeClients(onData, onError) { const subscription = { onData, onError, stopped: false }; listSubscriptions.push(subscription); return () => { subscription.stopped = true; }; },
    subscribeClientDetail(clientId, onData, onError) { const subscription = { clientId, onData, onError, stopped: false }; detailSubscriptions.push(subscription); return () => { subscription.stopped = true; }; },
    async getMilestoneDefaults() { calls.push({ method: 'getMilestoneDefaults' }); return options.defaults ? options.defaults() : { version: 1, milestones: [{ id: 'queued', label: 'Not Started', status: 'queued' }, { id: 'making', label: 'Making', status: 'in-progress' }, { id: 'completed', label: 'Completed', status: 'completed' }, { id: 'shipped', label: 'Shipped', status: 'shipped' }, { id: 'delivered', label: 'Delivered', status: 'delivered' }] }; },
    async saveMilestoneDefaults(input) { calls.push({ method: 'saveMilestoneDefaults', input }); return { milestones: input.milestones, version: input.expectedVersion + 1 }; },
    async setProjectArchived(projectId, expectedVersion, archived) { calls.push({ method: 'archive', projectId, expectedVersion, archived }); return { project: { ...project, status: 'completed', ownerArchived: archived, version: expectedVersion + 1 } }; },
    async listClients() { calls.push({ method: 'list' }); return options.list ? options.list() : options.clients ?? [client, second]; },
    async getClientDetail(clientId) { calls.push({ method: 'detail', clientId }); return options.detail ? options.detail(clientId) : { client: clientId === client.clientId ? client : second, email: 'owner-test@example.invalid', projects: clientId === client.clientId ? [project] : [] }; },
    async createClient(input) { calls.push({ method: 'createClient', input }); return options.createClient ? options.createClient(input) : { client, project: null, signInCode: code }; },
    async createProject(input) { calls.push({ method: 'createProject', input }); return options.createProject ? options.createProject(input) : { project: { ...project, title: input.title, summary: input.summary, status: 'queued', progress: null } }; },
    async updateProject(input) { calls.push({ method: 'updateProject', input }); return options.updateProject ? options.updateProject(input) : { project: { ...project, ...input, version: input.expectedVersion + 1 } }; },
    async resetClientLoginCode(input) { calls.push({ method: 'reset', input }); return options.reset ? options.reset(input) : { clientId: input.clientId, authVersion: input.expectedAuthVersion + 1, signInCode: code }; },
    async setClientStatus(input) { calls.push({ method: 'status', input }); return options.status ? options.status(input) : { client: { ...client, status: input.status, authVersion: input.expectedAuthVersion + 1 } }; },
    async updateClientProfile(input) { calls.push({ method: 'profile', input }); return options.profile ? options.profile(input) : { client: { ...client, displayName: input.displayName, updatedAt: '2026-10-26T00:01:00.000Z' }, email: input.email }; },
  };
  if(options.labelContext){for(const key of ['./label-presentation-client','@/client-hub/label-presentation-client'])h.overrides[key]={...h.overrides[key],getOwnerLabelPresentationContext:options.labelContext};}
  if(options.labelRead){for(const key of ['./label-presentation-client','@/client-hub/label-presentation-client'])h.overrides[key]={...h.overrides[key],getOwnerLabelPresentation:options.labelRead};}
  if(options.order)h.overrides['./client-order-client']=options.order;
  const Hub = h.load('src/owner/OwnerClientHub.tsx').OwnerClientHub;
  const props = { openNotification: options.openNotification, onDirtyChange: value => dirty.push(value), onBusyChange: value => busy.push(value) };
  const render = () => h.render(Hub, props);
  const dialogs = () => h.all(node => node.type?.name === 'Dialog');
  const dialog = () => dialogs().at(-1);
  const button = label => h.find(node => node.type === 'button' && (content(node) === label || node.props['aria-label'] === label || node.props.title === label));
  const action = label => nodes(dialog()?.props.actions).find(node => node.type === 'button' && content(node) === label);
  const field = label => {
    const parent = h.all(node => node.type === 'label').find(node => content(node).startsWith(label));
    return nodes(parent).find(node => ['input', 'textarea'].includes(node.type));
  };
  function change(label, value) { field(label).props.onChange({ target: { value } }); render(); }
  function submit() { h.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); }
  async function open(id = client.clientId) { const row = h.all(node => node.type === 'button').find(node => content(node).includes(id)); row.props.onClick(); await flush(); render(); }
  render();
  return { h, calls, dirty, busy, props, listSubscriptions, detailSubscriptions, emitClients: clients => { listSubscriptions.at(-1).onData(clients); render(); }, emitDetail: value => { detailSubscriptions.at(-1).onData(value); render(); }, render, button, dialog, dialogs, action, field, change, submit, open, async ready() { await flush(); render(); }, invalidate() { valid = false; authCallback(); render(); } };
}

test('empty cloud directory offers a real create flow with no fabricated clients or connected integrations', async () => {
  const t = setup({ clients: [] }); assert.match(content(t.h.tree), /Loading your clients/); await t.ready();
  assert.match(content(t.h.tree), /Your first client starts here/); assert.match(content(t.h.tree), /Trello · Manual, not synced/); assert.match(content(t.h.tree), /PayPal & email · Not connected/);
  assert.equal(t.h.all(node => node.props.className === 'clientRow').length, 0); assert.equal(t.button('Add client').props.disabled, false); t.h.unmount();
});

test('Fox9 directory places Add client immediately before Refresh in the heading', async () => {
  const t = setup(); await t.ready();
  const directory=t.h.find(node=>node.type==='section'&&node.props['aria-label']==='Client directory');
  const heading=nodes(directory).find(node=>node.type==='div'&&node.props.className==='sectionHeading');
  const actions=nodes(directory).find(node=>node.type==='div'&&node.props.className==='directoryActions');
  const headingButtons=nodes(heading).filter(node=>node.type==='button');
  assert.equal(headingButtons.length,2);assert.deepEqual(headingButtons.map(button=>button.props['aria-label']),['Add client','Refresh clients']);
  assert.ok(nodes(heading).some(node=>node.type==='h3'&&content(node).startsWith('Clients')));
  assert.equal(nodes(actions).filter(node=>node.type==='button').length,2);
  assert.equal(nodes(actions).find(node=>node.type==='button').props['aria-label'],'Add client');
  const before=t.calls.filter(call=>call.method==='list').length;
  headingButtons[1].props.onClick();await t.ready();assert.equal(t.calls.filter(call=>call.method==='list').length,before+1);
  t.h.unmount();
});

test('load failures fail closed and retry only shows acknowledged cloud records', async () => {
  let attempt = 0; const t = setup({ list: async () => { if (++attempt === 1) throw Error('Client Hub not configured'); return [client]; } }); await t.ready();
  assert.match(content(t.h.tree), /Client Hub not configured/); assert.equal(t.button('Add client').props.disabled, true); assert.doesNotMatch(content(t.h.tree), /Your first client starts here/);
  t.button('Try again').props.onClick(); await t.ready(); assert.match(content(t.h.tree), /Owner test client/); assert.equal(t.button('Add client').props.disabled, false); t.h.unmount();
});

test('client search is case-insensitive and a late detail cannot replace a newer selection', async () => {
  const first = deferred(), t = setup({ detail: id => id === client.clientId ? first.promise : Promise.resolve({ client: second, projects: [] }) }); await t.ready();
  t.change('Search clients', '8899aabb'); assert.equal(t.h.all(node => node.props.className === 'clientRow').length, 1); t.change('Search clients', '');
  const old = t.h.all(node => node.props.className === 'clientRow').find(node => content(node).includes(client.clientId)); old.props.onClick(); t.render(); await t.open(second.clientId);
  first.resolve({ client, projects: [project] }); await t.ready(); const selected = t.h.find(node => node.props['aria-label'] === 'Selected client'); assert.match(content(selected), /Another test client/); assert.doesNotMatch(content(selected), /Existing commission/); t.h.unmount();
});

test('cancel and discard are non-mutating, preserve history, and report dirty state to owner navigation', async () => {
  const t = setup(); await t.ready(); t.button('Add client').props.onClick(); t.render(); assert.equal(t.dialog().props.draggable, false); t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog(), undefined);
  t.button('Add client').props.onClick(); t.render(); t.change('Client name', 'Unsaved client'); assert.equal(t.dirty.at(-1), true); t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog().props.title, 'Discard this edit?');
  t.action('Keep editing').props.onClick(); t.render(); assert.equal(t.field('Client name').props.value, 'Unsaved client'); t.action('Cancel').props.onClick(); t.render(); t.action('Discard edit').props.onClick(); t.render();
  assert.equal(t.dialog(), undefined); assert.equal(t.dirty.at(-1), false); assert.equal(t.calls.some(call => call.method === 'createClient'), false); assert.equal(t.h.window.history.length, 1); assert.equal(t.h.window.location.href, ''); t.h.unmount();
});

test('client creation is double-submit locked, shows a one-time code, and guards accidental dismissal', async () => {
  const gate = deferred(), t = setup({ createClient: () => gate.promise }); await t.ready(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', ' Owner test client '); t.change('Email address', 'owner-test@example.invalid'); t.change('First commission title', 'First suit');
  t.submit(); t.submit(); t.render(); assert.equal(t.calls.filter(call => call.method === 'createClient').length, 1); assert.equal(t.dialog().props.dismissDisabled, true); t.dialog().props.onClose(); t.render(); assert.equal(t.dialog().props.title, 'Add client');
  const input = t.calls.find(call => call.method === 'createClient').input; assert.equal(input.displayName, client.displayName); assert.match(input.operationId, /^[a-f0-9-]{36}$/);
  gate.resolve({ client, project, signInCode: code }); await t.ready(); assert.equal(t.dialog().props.title, 'Client created'); assert.match(content(t.dialog()), new RegExp(code)); assert.equal(t.dirty.at(-1), true);
  t.button('Copy sign-in code').props.onClick(); await t.ready(); assert.match(content(t.dialog()), /Sign-in code copied/); t.dialog().props.onClose(); t.render(); assert.equal(t.dialog().props.title, 'Hide this sign-in code?'); t.action('Keep code open').props.onClick(); t.render(); assert.match(content(t.dialog()), new RegExp(code));
  t.action('Done, I’ve saved the code').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.doesNotMatch(content(t.h.tree), new RegExp(code)); assert.equal(t.dirty.at(-1), false); t.h.unmount();
});

test('uncertain create retries the same operation and payload without allowing a second identity', async () => {
  let count = 0; const t = setup({ createClient: async () => { if (++count === 1) throw Error('Network interrupted'); return { client, project: null }; } }); await t.ready(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', client.displayName); t.submit(); await t.ready();
  assert.match(content(t.dialog()), /Network interrupted/); assert.equal(t.h.find(node => node.type === 'fieldset').props.disabled, true); t.change('Client name', 'Different name'); assert.equal(t.field('Client name').props.value, client.displayName);
  t.submit(); await t.ready(); const calls = t.calls.filter(call => call.method === 'createClient'); assert.deepEqual(calls[0].input, calls[1].input); assert.match(content(t.dialog()), /one-time code was not returned again/); assert.equal(t.button('Copy sign-in code'), undefined); t.h.unmount();
});

test('invalid create fields never call the service and clipboard failure offers manual copy', async () => {
  const t = setup({ copyFailure: true }); await t.ready(); t.button('Add client').props.onClick(); t.render(); t.submit(); await t.ready(); assert.match(content(t.dialog()), /Enter the client’s name/); t.change('Client name', client.displayName); t.change('Email address', 'bad@'); t.submit(); await t.ready(); assert.match(content(t.dialog()), /valid email address/); assert.equal(t.calls.some(call => call.method === 'createClient'), false);
  t.change('Email address', ''); t.submit(); await t.ready(); t.button('Copy sign-in code').props.onClick(); await t.ready(); assert.match(content(t.dialog()), /copy it manually/); assert.doesNotMatch(content(t.dialog()), /Sign-in code copied/); t.h.unmount();
});

test('reset requires confirmation, carries the observed auth version, and cannot be dismissed while pending', async () => {
  const gate = deferred(), t = setup({ reset: () => gate.promise }); await t.ready(); await t.open(); t.button('Reset sign-in code').props.onClick(); t.render(); assert.match(content(t.dialog()), /current client sessions will stop working/); t.action('Cancel').props.onClick(); t.render(); assert.equal(t.calls.some(call => call.method === 'reset'), false);
  t.button('Reset sign-in code').props.onClick(); t.render(); t.action('Reset sign-in code').props.onClick(); t.action('Reset sign-in code').props.onClick(); t.render(); assert.equal(t.calls.filter(call => call.method === 'reset').length, 1); assert.deepEqual(t.calls.find(call => call.method === 'reset').input, { clientId: client.clientId, expectedAuthVersion: 1 });
  t.dialog().props.onClose(); t.render(); assert.equal(t.dialog().props.dismissDisabled, true); gate.resolve({ clientId: client.clientId, authVersion: 2, signInCode: code }); await t.ready(); assert.equal(t.dialog().props.title, 'New sign-in code'); assert.match(content(t.h.tree), /Code Reset Successfully/); t.action('Done, I’ve saved the code').props.onClick(); t.render(); t.button('Reset sign-in code').props.onClick(); t.render(); t.action('Reset sign-in code').props.onClick(); await t.ready(); assert.equal(t.calls.filter(call => call.method === 'reset').at(-1).input.expectedAuthVersion, 2); t.h.unmount();
});

test('a lost reset response has an explicit reload path and refresh also refreshes selected details', async () => {
  let version = 1; const t = setup({ detail: async () => ({ client: { ...client, authVersion: version }, projects: [project] }), reset: async () => { version++; throw Error('Response lost'); } });
  await t.ready(); await t.open(); t.button('Reset sign-in code').props.onClick(); t.render(); t.action('Reset sign-in code').props.onClick(); await t.ready();
  assert.match(content(t.dialog()), /reset may have reached the server/); t.button('Reload client details').props.onClick(); await t.ready(); assert.equal(t.dialog(), undefined);
  t.button('Reset sign-in code').props.onClick(); t.render(); t.action('Reset sign-in code').props.onClick(); await t.ready(); assert.equal(t.calls.filter(call => call.method === 'reset').at(-1).input.expectedAuthVersion, 2);
  t.action('Cancel').props.onClick(); t.render(); const count = t.calls.filter(call => call.method === 'detail').length; t.h.find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh clients').props.onClick(); await t.ready(); assert.equal(t.calls.filter(call => call.method === 'detail').length, count + 1); t.h.unmount();
});

test('manually added commissions have no request dependency or email/payment side effect', async () => {
  const t = setup(); await t.ready(); await t.open(); t.button('Add commission').props.onClick(); t.render(); assert.match(content(t.dialog()), /starts as Queued with progress unset/); t.change('Commission title', 'Existing suit'); t.change('Client-visible summary', 'Already in production'); t.submit(); await t.ready();
  const call = t.calls.find(call => call.method === 'createProject'); assert.equal(call.input.clientId, client.clientId); assert.equal(call.input.title, 'Existing suit'); assert.equal(Object.hasOwn(call.input, 'requestId'), false); assert.match(content(t.h.tree), /does not send email, issue an invoice, or charge/); assert.equal(t.dialog(), undefined); t.h.unmount();
});

test('commission editor preserves hidden progress and validates links before versioned updates', async () => {
  const t = setup(); await t.ready(); await t.open(); t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission(); t.render(); assert.ok(t.h.find(node => node.type?.name === 'OwnerSelect')); assert.doesNotMatch(content(t.dialog()), /Manual progress/);
  t.change('Tracking link', 'javascript:alert(1)'); t.submit(); await t.ready(); assert.match(content(t.dialog()), /https/); assert.equal(t.calls.some(call => call.method === 'updateProject'), false);
  t.change('Tracking link', 'https://example.invalid/track/123'); t.change('Client-visible summary', 'An update for the client'); t.submit(); await t.ready(); const call = t.calls.find(call => call.method === 'updateProject'); assert.equal(call.input.expectedVersion, 3); assert.equal(call.input.progress, project.progress); assert.equal(call.input.projectId, project.projectId); assert.equal(call.input.summary, 'An update for the client'); assert.doesNotMatch(content(t.h.tree), /ProgressNot set/); assert.equal(t.h.find(node => node.type?.name === 'HubProgress'), undefined); t.h.unmount();
});

test('auth loss clears client details, edits, and secrets and discards late save results', async () => {
  const gate = deferred(), t = setup({ createClient: () => gate.promise }); await t.ready(); await t.open(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', client.displayName); t.submit(); t.render(); t.invalidate();
  assert.doesNotMatch(content(t.h.tree), /Owner test client|Existing commission|owner-test@example/); assert.equal(t.dialog(), undefined); assert.match(content(t.h.tree), /owner session changed/);
  gate.resolve({ client, project, signInCode: code }); await t.ready(); assert.equal(t.dialog(), undefined); assert.doesNotMatch(content(t.h.tree), new RegExp(code)); assert.equal(t.button('Add client').props.disabled, true); t.h.unmount();
});

test('unmount ignores late creation and source never stores or logs credentials', async () => {
  const gate = deferred(), t = setup({ createClient: () => gate.promise }); await t.ready(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', client.displayName); t.submit(); t.render(); t.h.unmount(); gate.resolve({ client, project: null, signInCode: code }); await flush();
  const source = readFileSync(new URL('../src/owner/OwnerClientHub.tsx', import.meta.url), 'utf8'); assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|document\.cookie|indexedDB/); assert.doesNotMatch(source, /draggable=\{true\}/); assert.match(source, /beforeunload/);
});

test('suspending access requires confirmation, locks repeated submissions and preserves the permanent client ID', async () => {
  const pending = deferred(), t = setup({ status: () => pending.promise }); await t.ready(); await t.open();
  t.button('Suspend access').props.onClick(); t.render(); assert.equal(t.calls.some(call => call.method === 'status'), false); assert.match(content(t.dialog()), /changes sign-in access only/);
  const confirm = t.action('Suspend access').props.onClick; confirm(); confirm(); t.render(); const calls = t.calls.filter(call => call.method === 'status'); assert.equal(calls.length, 1); assert.deepEqual(calls[0].input, { clientId: client.clientId, expectedAuthVersion: 1, status: 'suspended' });
  pending.resolve({ client: { ...client, status: 'suspended', authVersion: 2 } }); await t.ready(); assert.equal(t.dialog(), undefined); assert.match(content(t.h.tree), /Access Suspended Successfully/); assert.ok(t.button('Restore access')); assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.disabled, true); t.h.unmount();
});

test('new workspace drafts guard client switches and refreshing asks once rather than discarding silently', async () => {
  const t = setup(); await t.ready(); await t.open(); t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onDirtyChange(true); t.render(); assert.equal(t.dirty.at(-1), true);
  t.h.window.confirm = () => { throw Error('Native confirm must not be used'); }; const before = t.calls.filter(call => call.method === 'detail').length;
  t.h.find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh clients').props.onClick(); await t.ready(); assert.equal(t.calls.filter(call => call.method === 'detail').length, before);
  t.h.find(node => node.type?.name === 'HubActionDialog').props.onClose(); await t.ready(); assert.equal(t.calls.filter(call => call.method === 'detail').length, before);
  t.h.find(node => node.type === 'button' && node.props['aria-label'] === 'Refresh clients').props.onClick(); await t.ready(); t.h.find(node => node.type?.name === 'HubActionDialog').props.onConfirm(); await t.ready(); assert.equal(t.h.find(node => node.type?.name === 'HubActionDialog'), undefined, 'one confirmation for entire refresh'); assert.equal(t.calls.filter(call => call.method === 'detail').length, before + 1); t.h.unmount();
});

test('client saved banner dismisses immediately and automatically after six seconds without an action cooldown', async () => {
  const t = setup(), timers = []; t.h.window.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; }; t.h.window.clearTimeout = () => {};
  await t.ready(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', 'Saved banner test'); t.submit(); await t.ready();
  t.action('Done, I’ve saved the code').props.onClick(); t.render(); assert.equal(t.button('Add client').props.disabled, false); assert.ok(t.button('Dismiss client notification')); assert.ok(timers.some(timer => timer.delay === 6_000));
  t.button('Dismiss client notification').props.onClick(); t.render(); assert.equal(t.button('Dismiss client notification'), undefined); assert.equal(t.button('Add client').props.disabled, false); t.h.unmount();
});

test('Trello editor rejects unsafe links and saves only a manual card reference', async () => {
  const t = setup(); await t.ready(); await t.open(); t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission(); t.render();
  t.change('Trello card link', 'https://trello.com/c/Ab12Cd34?token=secret'); t.submit(); await t.ready(); assert.equal(t.calls.some(call => call.method === 'updateProject'), false); assert.match(content(t.dialog()), /without tracking parameters/);
  t.change('Trello card link', 'https://trello.com/c/Ab12Cd34/my-fox'); t.submit(); await t.ready(); assert.equal(t.calls.find(call => call.method === 'updateProject').input.trelloUrl, 'https://trello.com/c/Ab12Cd34/my-fox'); assert.match(content(t.h.tree), /Manual, not synced/); t.h.unmount();
});

test('profile editor refreshes authoritative contact details and saves one versioned change without resetting identity or code', async () => {
  const pending = deferred(); let detailReads = 0; const fresh = { ...client, displayName: 'Recently updated name', updatedAt: '2026-10-26T00:00:30.000Z' };
  const t = setup({ detail: async () => ({ client: ++detailReads === 1 ? client : fresh, email: 'private@example.invalid', projects: [project] }), profile: () => pending.promise }); await t.ready(); await t.open();
  t.button('Edit client').props.onClick(); t.render(); assert.equal(t.dialog().props.title, 'Edit client profile'); assert.equal(t.h.find(node => node.type === 'fieldset').props.disabled, true); await t.ready();
  assert.equal(t.field('Client name').props.value, fresh.displayName); assert.equal(t.field('Email address').props.value, 'private@example.invalid'); assert.match(content(t.dialog()), /Private owner contact record/); assert.match(content(t.dialog()), /Editing the name does not change the current sign-in code/);
  t.change('Client name', ' Renamed client '); t.change('Email address', ' new-private@example.invalid '); t.submit(); t.submit(); t.render(); const saves = t.calls.filter(call => call.method === 'profile'); assert.equal(saves.length, 1); assert.deepEqual(saves[0].input, { clientId: client.clientId, expectedUpdatedAt: fresh.updatedAt, displayName: 'Renamed client', email: 'new-private@example.invalid' });
  assert.equal(t.dialog().props.dismissDisabled, true); t.dialog().props.onClose(); t.render(); assert.equal(t.dialog().props.title, 'Edit client profile');
  pending.resolve({ client: { ...fresh, displayName: 'Renamed client', updatedAt: '2026-10-26T00:02:00.000Z' }, email: 'new-private@example.invalid' }); await t.ready(); assert.equal(t.dialog(), undefined); assert.match(content(t.h.tree), /Renamed client/); assert.match(content(t.h.tree), /new-private@example.invalid/); assert.match(content(t.h.tree), /Saved Successfully/); assert.equal(t.calls.some(call => call.method === 'reset' || call.method === 'status'), false); t.h.unmount();
});

test('stale profile errors preserve the name and private email draft until the owner explicitly reloads', async () => {
  const t = setup({ profile: async () => { throw Error('This client changed on another device. Reload before saving.'); } }); await t.ready(); await t.open(); t.button('Edit client').props.onClick(); await t.ready();
  t.change('Client name', 'My local name'); t.change('Email address', 'local@example.invalid'); t.submit(); await t.ready();
  assert.equal(t.field('Client name').props.value, 'My local name'); assert.equal(t.field('Email address').props.value, 'local@example.invalid'); assert.match(content(t.dialog()), /changed on another device/); assert.equal(t.dirty.at(-1), true);
  t.h.window.confirm = () => { throw Error('Native confirm must not be used'); }; t.button('Reload saved profile').props.onClick(); await t.ready(); t.h.find(node => node.type?.name === 'HubActionDialog').props.onClose(); await t.ready(); assert.equal(t.field('Client name').props.value, 'My local name');
  t.button('Reload saved profile').props.onClick(); await t.ready(); t.h.find(node => node.type?.name === 'HubActionDialog').props.onConfirm(); await t.ready(); assert.equal(t.field('Client name').props.value, client.displayName); assert.equal(t.field('Email address').props.value, 'owner-test@example.invalid'); assert.equal(t.calls.filter(call => call.method === 'profile').length, 1); t.h.unmount();
});

test('profile dirty dismissal is non-mutating and owner session loss clears private fields and ignores late saves', async () => {
  const pending = deferred(), t = setup({ profile: () => pending.promise }); await t.ready(); await t.open(); t.button('Edit client').props.onClick(); await t.ready(); t.change('Client name', 'Unsaved identity label');
  t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog().props.title, 'Discard profile changes?'); t.action('Keep editing profile').props.onClick(); t.render(); assert.equal(t.field('Client name').props.value, 'Unsaved identity label');
  t.action('Cancel').props.onClick(); t.render(); t.action('Discard profile changes').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.calls.some(call => call.method === 'profile'), false); assert.equal(t.dirty.at(-1), false);
  t.button('Edit client').props.onClick(); await t.ready(); t.change('Email address', 'sensitive-draft@example.invalid'); t.submit(); t.render(); t.invalidate(); assert.equal(t.dialog(), undefined); assert.doesNotMatch(content(t.h.tree), /sensitive-draft@example.invalid/);
  pending.resolve({ client: { ...client, displayName: 'Late private result', updatedAt: '2026-10-26T00:02:00.000Z' }, email: 'sensitive-draft@example.invalid' }); await t.ready(); assert.doesNotMatch(content(t.h.tree), /Late private result|sensitive-draft@example.invalid/); t.h.unmount();
});

test('suspended client profiles can be edited and invalid contact fields never call the profile service', async () => {
  const suspended = { ...client, status: 'suspended' }, t = setup({ clients: [suspended], detail: async () => ({ client: suspended, email: '', projects: [] }) }); await t.ready(); await t.open(); assert.equal(t.button('Edit client').props.disabled, false);
  t.button('Edit client').props.onClick(); await t.ready(); t.change('Client name', ''); t.submit(); await t.ready(); assert.match(content(t.dialog()), /Enter the client’s name/); t.change('Client name', 'Valid name'); t.change('Email address', 'bad@'); t.submit(); await t.ready(); assert.match(content(t.dialog()), /valid email address/); assert.equal(t.calls.some(call => call.method === 'profile'), false); t.h.unmount();
});

test('failed profile refresh never enables a save against an unverified snapshot', async () => {
  let reads = 0; const t = setup({ detail: async () => { if (++reads > 1) throw Error('Connection lost before profile verification'); return { client, projects: [] }; } }); await t.ready(); await t.open(); t.button('Edit client').props.onClick(); await t.ready();
  assert.equal(t.action('Save profile').props.disabled, true); assert.match(content(t.dialog()), /Connection lost before profile verification/); t.submit(); await t.ready(); assert.equal(t.calls.some(call => call.method === 'profile'), false); t.action('Cancel').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); t.h.unmount();
});

test('directory stat cards filter real clients, and suspended empty state never offers first-client creation', async () => {
  const t = setup(); await t.ready();
  const stats = t.h.find(node => node.props.className === 'studioStats');
  const statButtons = nodes(stats).filter(node => node.type === 'button'); assert.equal(statButtons.length, 2); assert.equal(statButtons.some(node => content(node).startsWith("ACCESS SUSPENDED")), false);
  t.button('Suspended').props.onClick(); t.render();
  assert.match(content(t.h.tree), /No suspended clients/); assert.equal(t.button('Add your first client'), undefined); assert.equal(t.h.all(node => node.props.className === 'clientRow').length, 0);
  assert.equal(t.button('Suspended').props['aria-pressed'], true);
  t.emitClients([client, { ...second, status: 'suspended' }]); assert.equal(t.h.all(node => node.props.className === 'clientRow').length, 1); assert.match(content(t.h.tree), /Another test client/);
  nodes(t.h.find(node => node.props.className === 'studioStats')).find(node => node.type === 'button' && node.props['aria-label']==='View all clients').props.onClick(); t.render(); assert.equal(t.h.all(node => node.props.className === 'clientRow').length, 2); t.h.unmount();
});

test('Fox9 removes decorative feature pills while the client workspace retains its real identity', async () => {
  const namedClient = { ...client, nickname: 'Star Fox' }, t = setup({ clients: [namedClient], detail: async () => ({ client: namedClient, projects: [project] }) }); await t.ready(); await t.open();
  for (const label of ['Private client access','Maker Chat','Progress photos','Support requests']) assert.equal(t.button(label), undefined);
  const workspace = t.h.find(node => node.type?.name === 'HubWorkspaceWindow'); assert.equal(workspace.props.project.projectId, project.projectId); assert.equal(workspace.props.clientDisplayName, client.displayName); assert.equal(workspace.props.clientNickname, 'Star Fox'); t.h.unmount();
});

test('selected commission has no redundant workspace button and keeps the live workspace draft', async () => {
  const t = setup(); await t.ready(); await t.open();
  t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onDirtyChange(true); t.render();
  assert.equal(t.button('Open workspace: Existing commission').props.className, 'projectOpen'); t.button('Open workspace: Existing commission').props.onClick(); t.render();
  assert.doesNotMatch(content(t.h.tree), /Workspace open below/);
  assert.equal(t.dirty.at(-1), true);
  assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.project.projectId, project.projectId);
  t.h.unmount();
});

test('live client detail updates status and commission without replacing a dirty profile draft, then unsubscribes', async () => {
  const t = setup(); await t.ready(); await t.open(); t.button('Edit client').props.onClick(); await t.ready(); t.change('Client name', 'My local identity label');
  t.emitDetail({ client: { ...client, displayName: 'Remote name', status: 'suspended' }, email: 'remote@example.invalid', projects: [{ ...project, progress: 70 }] });
  assert.equal(t.field('Client name').props.value, 'My local identity label'); assert.match(content(t.h.tree), /ACCESS SUSPENDED/); assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.disabled, true);
  t.h.unmount(); assert.ok(t.listSubscriptions.every(item => item.stopped)); assert.ok(t.detailSubscriptions.every(item => item.stopped));
});

test('old live detail callbacks cannot replace a newer client selection or revive private data after auth loss', async () => {
  const t = setup(); await t.ready(); await t.open(); const previous = t.detailSubscriptions.at(-1); await t.open(second.clientId);
  previous.onData({ client, email: 'old-private@example.invalid', projects: [project] }); t.render(); assert.doesNotMatch(content(t.h.tree), /old-private@example.invalid/);
  t.invalidate(); t.listSubscriptions.at(-1).onData([client]); t.detailSubscriptions.at(-1).onData({ client, email: 'late-private@example.invalid', projects: [project] }); t.render(); assert.doesNotMatch(content(t.h.tree), /late-private@example.invalid|Existing commission/); t.h.unmount();
});

test('owner notification selects its authenticated client, commission and request thread, then focuses the workspace', async () => {
  const notification = { notificationId: 'row', clientId: client.clientId, projectId: project.projectId, recipientRole: 'owner', channel: 'requests', requestId: 'request-1', version: 1, readVersion: 0, latestItemId: 'reply-1', latestAt: project.updatedAt, readAt: null, throughItemId: null, throughCreatedAt: null };
  const t = setup({ openNotification: notification }); await t.ready(); await t.ready();
  const workspace = t.h.find(node => node.type?.name === 'HubWorkspaceWindow'); assert.equal(workspace.props.project.projectId, project.projectId); assert.equal(workspace.props.navigation.tab, 'support'); assert.equal(workspace.props.navigation.requestId, 'request-1'); assert.ok(t.h.focusLog.includes('Selected commission workspace')); t.h.unmount();
});

test('a notification for a missing commission does not open the wrong workspace', async () => {
  const t = setup({ openNotification: { notificationId: 'row', clientId: client.clientId, projectId: 'missing', recipientRole: 'owner', channel: 'chat', version: 1 } }); await t.ready(); await t.ready(); assert.match(content(t.h.tree), /commission is no longer available/); assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.navigation, undefined); t.h.unmount();
});

test('owner directory uses authenticated PFP component and actual spade art, not initial-letter placeholders', async () => {
  const t = setup(); await t.ready(); const avatars = t.h.all(node => node.type?.name === 'ClientAvatar'); assert.equal(avatars.length, 2); assert.equal(avatars[0].props.owner, true); assert.equal(avatars[0].props.client.clientId, client.clientId); assert.ok(t.h.all(node => node.type?.name === 'SpadeMark').length >= 1); t.h.unmount();
});

test('a newer same-client notification wins over an older notification whose detail fetch resolves late', async () => {
  const first = deferred(), latest = deferred(), otherProject = { ...project, projectId: 'second-project', title: 'Second commission' }; let reads = 0;
  const row = projectId => ({ notificationId: projectId, clientId: client.clientId, projectId, recipientRole: 'owner', channel: 'chat', version: 1 });
  const t = setup({ openNotification: row(project.projectId), detail: () => ++reads === 1 ? first.promise : latest.promise }); await t.ready(); await flush();
  t.props.openNotification = row(otherProject.projectId); t.render(); await flush();
  latest.resolve({ client, projects: [project, otherProject] }); await t.ready(); assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.project.projectId, otherProject.projectId);
  first.resolve({ client, projects: [project, otherProject] }); await t.ready(); assert.equal(t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.project.projectId, otherProject.projectId); t.h.unmount();
});

test('live permission loss removes a one-time credential immediately and late data cannot revive it', async () => {
  const t = setup(); await t.ready(); t.button('Add client').props.onClick(); t.render(); t.change('Client name', client.displayName); t.submit(); await t.ready(); assert.match(content(t.dialog()), new RegExp(code));
  const old = t.listSubscriptions.at(-1); old.onError(Object.assign(Error('Owner access lost'), { code: 'firestore/permission-denied' })); t.render();
  assert.equal(t.dialog(), undefined); assert.doesNotMatch(content(t.h.tree), new RegExp(code)); assert.match(content(t.h.tree), /owner session needs attention/);
  old.onData([client]); t.render(); assert.equal(t.button('Add client').props.disabled, true); t.h.unmount();
});

test('retry after a live connection error reopens the subscription instead of leaving a static directory', async () => {
  const t = setup(); await t.ready(); t.listSubscriptions.at(-1).onError(Error('Connection interrupted')); t.render(); assert.equal(t.button('Add client').props.disabled, true);
  t.button('Try again').props.onClick(); await t.ready(); assert.equal(t.listSubscriptions.length, 2); assert.equal(t.listSubscriptions[0].stopped, true);
  t.emitClients([client, { ...second, status: 'suspended' }]); assert.match(content(t.h.tree), /Another test client/); t.h.unmount();
});


test('directory spacing hook wraps each real client in a separate list item and preserves selection semantics', async () => {
 const t=setup(); await t.ready();
 try {
  const list=t.h.find(node=>node.type==='ul'&&node.props.className==='clientList');
  const items=list.props.children;
  assert.equal(items.length,2); assert.ok(items.every(node=>node.type==='li'));
  const rows=items.map(item=>nodes(item).find(node=>node.type==='button'));
  assert.ok(rows.every(row=>row.props.className==='clientRow'&&row.props['aria-pressed']===false));
  await t.open(client.clientId);
  assert.equal(t.h.find(node=>node.type==='button'&&content(node).includes(client.clientId)).props['aria-pressed'],true);
 } finally { t.h.unmount(); }
});


test('owner manual tag checkboxes allow DTD plus one paid label and preserve omission for unchanged legacy edits', async () => {
  const t=setup(); try {
    await t.ready(); await t.open(); t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission(); t.render();
    assert.match(content(t.dialog()),/Manual organizational labels, not verified PayPal payments/);
    const toggle=label=>{t.field(label).props.onChange({target:{checked:true}});t.render();};
    toggle('100% paid'); toggle('DTD needed'); assert.equal(t.field('100% paid').props.checked,true); assert.equal(t.field('DTD needed').props.checked,true);
    toggle('Partially paid'); assert.equal(t.field('100% paid').props.checked,false); assert.equal(t.field('Partially paid').props.checked,true); assert.equal(t.field('DTD needed').props.checked,true);
    t.submit();await t.ready();const call=t.calls.find(row=>row.method==='updateProject');assert.deepEqual([...call.input.informationTags].sort(),['dtd-needed','paid-partial']);
    assert.equal(t.calls.some(row=>/paypal|invoice|email/i.test(row.method)),false);
  } finally {t.h.unmount();}
  const legacy=setup();try {await legacy.ready();await legacy.open();legacy.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission();legacy.render();legacy.change('Commission title','Updated legacy title');legacy.submit();await legacy.ready();assert.equal(Object.hasOwn(legacy.calls.find(row=>row.method==='updateProject').input,'informationTags'),false);}finally{legacy.h.unmount();}
});


test('Fox7 shared default editor tracks dirty state and saves only new-project defaults', async () => {
 const t=setup(); try { await t.ready(); await t.open(); t.button('Milestone defaults').props.onClick(); await t.ready();
 const editor=t.h.find(node=>node.type?.name==='HubMilestoneEditor'); const changed=editor.props.value.map(node=>node.id==='making'?{...node,label:'Sewing'}:node);
 editor.props.onChange(changed); t.render(); assert.equal(t.dirty.at(-1),true);
 t.action('Save defaults').props.onClick(); await t.ready();
 const call=t.calls.find(row=>row.method==='saveMilestoneDefaults'); assert.equal(call.input.expectedVersion,1); assert.equal(call.input.milestones[1].label,'Sewing');
 assert.equal(t.calls.some(row=>row.method==='updateProject'),false); assert.equal(t.dialog(),undefined); assert.equal(t.dirty.at(-1),false);
 }finally{t.h.unmount();}
});
test('Fox7 custom labels and per-commission milestone edits are included only in explicit versioned Save changes', async () => {
 const t=setup({detail:async()=>({client,projects:[{...project,informationTags:['custom:Rush order']}]})}); try { await t.ready(); await t.open(); t.h.find(node=>node.type?.name==='HubWorkspaceWindow').props.onEditCommission(); t.render();
 const choice=()=>nodes(t.h.find(node=>node.type==='label'&&content(node).startsWith('Rush order'))).find(node=>node.type==='input');choice().props.onChange();t.render();
 assert.match(content(t.dialog()),/Rush order/);
 const editor=t.h.find(node=>node.type?.name==='HubMilestoneEditor');editor.props.onChange(editor.props.value.map(node=>node.id==='making'?{...node,label:'Assembly'}:node));t.render();
 t.h.find(node=>node.type?.name==='OwnerSelect'&&node.props.label==='Current milestone').props.onChange('making');t.render();
 assert.equal(t.calls.some(row=>row.method==='updateProject'),false);t.submit();await t.ready();
 const call=t.calls.find(row=>row.method==='updateProject');assert.equal(call.input.expectedVersion,3);assert.equal(call.input.activeMilestoneId,'making');assert.equal(call.input.status,'in-progress');assert.equal(call.input.milestones[1].label,'Assembly');assert.deepEqual(call.input.informationTags,[]);
 }finally{t.h.unmount();}
});
test('Fox7 archive hides only owner cards and can be restored without changing client access', async () => {
 const t=setup({detail:async()=>({client,projects:[{...project,status:'completed'}]})});try{await t.ready();await t.open();t.button('Archive card').props.onClick();await t.ready();
 const call=t.calls.find(row=>row.method==='archive');assert.equal(call.archived,true);assert.equal(call.expectedVersion,3);assert.equal(t.calls.some(row=>row.method==='status'),false);assert.equal(t.button('Archive card'),undefined);
 const toggle=t.h.find(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Show archived commissions'));toggle.props.onClick();t.render();
 t.button('Restore card').props.onClick();await t.ready();assert.equal(t.calls.filter(row=>row.method==='archive').at(-1).archived,false);
 }finally{t.h.unmount();}
});

test('Fox8 all new owner commission actions opt into the existing custom button theme', async () => {
 const t=setup({detail:async()=>({client,projects:[{...project,status:'completed'}]})});
 try { await t.ready(); await t.open();
  for (const label of ['Milestone defaults','Archive card']) assert.equal(t.button(label).props['data-owner-button'],true,label);
  t.button('Milestone defaults').props.onClick(); await t.ready();
  for (const label of ['Cancel','Save defaults']) assert.equal(t.action(label).props['data-owner-button'],true,label);
  t.action('Cancel').props.onClick();t.render();
  t.h.find(node=>node.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
  assert.equal(t.button('Label order').props['data-owner-button'],true); const milestone=t.h.find(node=>node.type?.name==='HubMilestoneEditor'); assert.equal(nodes(milestone.props.actions).find(node=>node.type==='button'&&content(node)==='Use shared defaults').props['data-owner-button'],true);
 } finally {t.h.unmount();}
});

test('Fox8 compact identity cards keep full permanent IDs and only actionable workspace controls', async () => {
 const other={...project,projectId:'other-project',title:'Other commission'};
 const t=setup({detail:async()=>({client,projects:[project,other]})});
 try {await t.ready();await t.open();
  const row=t.h.find(node=>node.props.className==='clientRow'&&content(node).includes(client.clientId));
  assert.equal(nodes(row).find(node=>node.type==='code').props.children,client.clientId);
  assert.ok(t.button('Copy ID'));
  const cards=t.h.all(node=>node.type==='article'&&node.props.className==='project');assert.equal(cards.length,2);assert.equal(cards.filter(node=>node.props['aria-current']==='true').length,1);assert.match(content(cards.find(node=>node.props['aria-current']==='true')),/Existing commission/);
  assert.equal(t.button('Open workspace: Existing commission').props['aria-pressed'],true);
  assert.ok(t.button('Open workspace: Other commission'));
  assert.doesNotMatch(content(t.h.tree),/Workspace open below|ProgressNot set/);
  assert.equal(t.h.find(node=>node.type?.name==='HubProgress'),undefined);
  t.button('Open workspace: Other commission').props.onClick();t.render();
  assert.ok(t.button('Open workspace: Existing commission'));
  assert.equal(t.button('Open workspace: Other commission').props['aria-pressed'],true);assert.match(content(t.h.find(node=>node.type==='article'&&node.props['aria-current']==='true')),/Other commission/);
 } finally {t.h.unmount();}
});


test('directory cards need no redundant chevron and remain native selectable buttons',async()=>{
 const t=setup();try {await t.ready();const rows=()=>t.h.all(node=>node.props.className==='clientRow');
  assert.equal(rows().length,2);for(const row of rows()){assert.equal(row.type,'button');assert.equal(row.props.type,'button');assert.equal(typeof row.props.onClick,'function');assert.doesNotMatch(content(row),/[›>]/);assert.equal(row.props['aria-pressed'],false);assert.equal(row.props['data-owner-button'],true);}
  await t.open();assert.equal(rows().filter(row=>row.props['aria-pressed']).length,1);assert.match(content(rows().find(row=>row.props['aria-pressed'])),/Owner test client/);
  assert.doesNotMatch(readFileSync('src/owner/OwnerClientHub.module.css','utf8'),/clientChevron/);
 }finally{t.h.unmount();}
});

test('Fox9 dirty milestone defaults discard uses themed confirmation, keeps edits on cancel and clears on confirmation', async () => {
 const t=setup();try{
  t.h.window.confirm=()=>{throw Error('Browser confirmation must not be used for milestone defaults');};
  await t.ready();await t.open();t.button('Milestone defaults').props.onClick();await t.ready();
  const editor=t.h.find(node=>node.type?.name==='HubMilestoneEditor');editor.props.onChange(editor.props.value.map(node=>node.id==='making'?{...node,label:'Cutting'}:node));t.render();
  t.action('Cancel').props.onClick();t.render();assert.equal(t.dialog().props.title,'Discard milestone changes?');
  t.action('Keep editing').props.onClick();t.render();assert.equal(t.dialog().props.title,'Milestone defaults');assert.equal(t.h.find(node=>node.type?.name==='HubMilestoneEditor').props.value[1].label,'Cutting');
  t.action('Cancel').props.onClick();t.render();t.action('Discard changes').props.onClick();t.render();assert.equal(t.dialog(),undefined);assert.equal(t.calls.some(call=>call.method==='saveMilestoneDefaults'),false);assert.equal(t.dirty.at(-1),false);
 }finally{t.h.unmount();}
});

test('Fox14 hierarchy keeps legacy assignments separate until explicit adoption and prevents duplicate additions', async () => {
 const existing={...project,informationTags:['custom:Ready','custom:New label']};
 const entries={status:{name:'Commission status',color:null,hidden:false,deleted:false},information:{name:'Information labels',color:null,hidden:false,deleted:false}};
 const candidates=Object.fromEntries(existing.informationTags.map(key=>[key,{name:key.slice(7),color:null,hidden:false,deleted:false}]));
 const t=setup({detail:async()=>({client,projects:[existing]}),labelContext:async()=>({presentation:{schemaVersion:1,revision:4,updatedAt:null,entries,order:Object.keys(entries)},legacyCandidates:candidates})});
 try{await t.ready();await t.open();t.button('Label order').props.onClick();await t.ready();
 let editor=t.h.find(node=>node.type?.name==='LabelPresentationEditor');assert.ok(editor);assert.equal(editor.props.value.entries['custom:Ready'],undefined);
 const adopt=t.button('Add Ready to saved choices').props.onClick;adopt();adopt();t.render();editor=t.h.find(node=>node.type?.name==='LabelPresentationEditor');assert.equal(editor.props.value.order.filter(key=>key==='custom:Ready').length,1);assert.equal(editor.props.value.entries['custom:Ready'].name,'Ready');assert.ok(editor.props.value.order.includes('status'));assert.ok(editor.props.value.order.includes('information'));assert.equal(t.calls.some(row=>row.method==='updateProject'),false);
 t.action('Cancel').props.onClick();t.render();assert.equal(t.dialog(),undefined);assert.deepEqual(existing.informationTags,['custom:Ready','custom:New label']);
 }finally{t.h.unmount();}
});

test('Fox11 tracker uses the shared Toggle and preserves explicit false through editor save/reopen', async () => {
  const t = setup(); await t.ready(); await t.open();
  t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission(); t.render();
  const toggle = () => t.h.find(node => node.type?.name === 'Toggle' && node.props.label === 'Show progress tracker for this commission');
  assert.equal(toggle().props.checked, true);
  toggle().props.onChange(false); t.render(); assert.equal(toggle().props.checked, false);
  t.submit(); await t.ready();
  assert.equal(t.calls.find(row => row.method === 'updateProject').input.trackingEnabled, false);
  t.h.find(node => node.type?.name === 'HubWorkspaceWindow').props.onEditCommission(); t.render();
  assert.equal(toggle().props.checked, false);
  toggle().props.onChange(true); t.render(); t.submit(); await t.ready();
  assert.equal(t.calls.filter(row => row.method === 'updateProject').at(-1).input.trackingEnabled, true);
  t.h.unmount();
});

test('Fox11 only the selected commission receives the blue current-view marker', async () => {
  const another = { ...project, projectId: 'another-project', title: 'Another commission' };
  const t = setup({ detail: async () => ({ client, projects: [project, another] }) }); await t.ready(); await t.open();
  const markers = () => t.h.all(node => node.props['aria-label'] === 'Currently viewed commission');
  assert.equal(markers().length, 1);
  t.button('Open workspace: Another commission').props.onClick(); await t.ready();
  assert.equal(markers().length, 1);
  const selectedCard = t.h.find(node => node.type === 'article' && node.props['data-selected'] === true);
  assert.match(content(selectedCard), /Another commission/);
  assert.equal(nodes(selectedCard).filter(node => node.props['aria-label'] === 'Currently viewed commission').length, 1);
  t.h.unmount();
});

test('Fox15 local labels stage only on the commission and save stays open with acknowledged version',async()=>{
 const t=setup();try{await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();t.button('Add commission label').props.onClick();t.render();assert.equal(t.dialog().props.title,'Commission label');t.change('Label name','Only this fox');t.action('Save label').props.onClick();t.render();assert.equal(t.calls.some(c=>c.method==='updateProject'),false);assert.match(content(t.dialog()),/Only this fox/);t.submit();await t.ready();const first=t.calls.find(c=>c.method==='updateProject');const key=Object.keys(first.input.localLabelDefinitions)[0];assert.match(key,/^custom:local_/);assert.deepEqual(first.input.informationTags,[key]);assert.equal(first.input.localLabelDefinitions[key].name,'Only this fox');assert.equal(t.dialog().props.title,'Edit commission');assert.equal(t.dirty.at(-1),false);t.change('Commission title','A second saved title');t.submit();await t.ready();assert.equal(t.calls.filter(c=>c.method==='updateProject')[1].input.expectedVersion,4);assert.equal(t.dialog().props.title,'Edit commission');t.action('Save changes & close').props.onClick();await t.ready();assert.equal(t.dialog(),undefined);
 }finally{t.h.unmount();}
});
test('Fox15 local label cancel and parent discard never change catalogue or commission',async()=>{
 const t=setup();try{await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();t.button('Add commission label').props.onClick();t.render();t.change('Label name','Not saved');t.action('Cancel').props.onClick();t.render();assert.doesNotMatch(content(t.dialog()),/Not saved/);assert.equal(t.calls.some(c=>c.method==='updateProject'),false);t.button('Add commission label').props.onClick();t.render();t.change('Label name','Staged only');const save=t.action('Save label').props.onClick;save();save();t.render();assert.equal(t.h.all(n=>n.type==='label'&&content(n).startsWith('Staged only')).length,1);t.action('Cancel').props.onClick();t.render();t.action('Discard edit').props.onClick();t.render();assert.equal(t.dialog(),undefined);assert.equal(t.calls.some(c=>c.method==='updateProject'),false);
 }finally{t.h.unmount();}
});
test('Fox15 save and close stays open on failure and duplicate clicks remain single flight',async()=>{
 const pending=deferred(),t=setup({updateProject:()=>pending.promise});try{await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();t.change('Commission title','Keep me');const save=t.action('Save changes & close').props.onClick;save();save();t.render();assert.equal(t.calls.filter(c=>c.method==='updateProject').length,1);assert.ok(t.dialog());pending.reject(Error('Unconfirmed'));await t.ready();assert.equal(t.dialog().props.title,'Edit commission');assert.equal(t.field('Commission title').props.value,'Keep me');assert.match(content(t.dialog()),/Unconfirmed/);
 }finally{t.h.unmount();}
});
test('Fox15 owner card grid starts collapsed without hiding controls or selected workspace',async()=>{
 const t=setup();try{await t.ready();await t.open();const grid=()=>t.h.find(n=>n.props.id==='owner-commission-cards');assert.equal(grid().props.hidden,true);assert.ok(t.button('Add commission'));assert.ok(t.h.find(n=>n.type?.name==='HubWorkspaceWindow'));const toggle=t.h.find(n=>n.type==='button'&&n.props['aria-controls']==='owner-commission-cards');toggle.props.onClick();t.render();assert.equal(grid().props.hidden,false);t.h.find(n=>n.type==='button'&&n.props['aria-controls']==='owner-commission-cards').props.onClick();t.render();assert.equal(grid().props.hidden,true);assert.ok(t.h.find(n=>n.type?.name==='HubWorkspaceWindow'));
 }finally{t.h.unmount();}
});


test('Fox16 pending client selection keeps the previous detail inert and never exposes stale actions',async()=>{
 const pending=deferred(),t=setup({detail:id=>id===second.clientId?pending.promise:{client,projects:[project],email:''}});try{await t.ready();await t.open();const row=t.h.all(n=>n.type==='button'&&n.props.className==='clientRow').find(n=>content(n).includes(second.clientId));row.props.onClick();t.render();const region=t.h.find(n=>n.props.className==='detailContent');assert.equal(region.props.inert,true);assert.match(content(region),/Existing commission/);assert.match(content(t.h.tree),/Opening selected client/);pending.resolve({client:second,projects:[],email:''});await t.ready();assert.equal(t.h.find(n=>n.props.className==='detailContent').props.inert,false);assert.doesNotMatch(content(t.h.tree),/Existing commission/);}finally{t.h.unmount();}
});
test('Fox16 newer live detail suppresses old generic read failure but never an auth failure',async()=>{
 for(const auth of [false,true]){const pending=deferred(),t=setup({detail:()=>pending.promise});try{await t.ready();const row=t.h.all(n=>n.type==='button'&&n.props.className==='clientRow').find(n=>content(n).includes(client.clientId));row.props.onClick();t.render();await t.ready();t.emitDetail({client,projects:[project],email:''});pending.reject(Object.assign(Error('old read failed'),auth?{code:'functions/permission-denied'}:{}));await t.ready();if(auth){assert.equal(t.h.find(n=>n.type?.name==='HubWorkspaceWindow'),undefined);assert.match(content(t.h.tree),/owner session needs attention/);}else{assert.ok(t.h.find(n=>n.type?.name==='HubWorkspaceWindow'));assert.doesNotMatch(content(t.h.tree),/old read failed/);}}finally{t.h.unmount();}}
});
test('Fox16 card selection does not scroll workspace and editor actions stay Cancel Save Close order',async()=>{
 const another={...project,projectId:'second-project',title:'Second commission'},t=setup({detail:()=>({client,projects:[project,another],email:''})});try{await t.ready();await t.open();const before=t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.openVersion;t.button('Open workspace: Second commission').props.onClick();t.render();assert.equal(t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.openVersion,before);assert.equal(t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.navigation,undefined);t.button('Edit commission Second commission').props.onClick();t.render();const actions=nodes(t.dialog().props.actions).filter(n=>n.type==='button').map(content);assert.deepEqual(actions,['Cancel','Save changes','Save changes & close']);t.change('Commission title','Saved title');t.submit();await t.ready();assert.match(content(t.dialog()),/Saved successfully/);assert.equal(t.dialog().props.title,'Edit commission');}finally{t.h.unmount();}
});
test('Fox16 local removal tombstones only its exact assigned choice and new case-only duplicates are blocked',async()=>{
 const key='custom:local_11111111111141118111111111111111',other='custom:local_22222222222242228222222222222222';const p={...project,informationTags:[key,other],localLabelDefinitions:{[key]:{name:'Rawr',color:'#7f0011'},[other]:{name:'RAWR',color:'#00b1f5'}}};const t=setup({detail:()=>({client,projects:[p],email:''})});try{await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();t.button('Add commission label').props.onClick();t.render();t.change('Label name','rawr');t.action('Save label').props.onClick();t.render();assert.match(content(t.dialog()),/already exists/);assert.equal(t.calls.some(c=>c.method==='updateProject'),false);t.action('Cancel').props.onClick();t.render();t.button('Remove from commission Rawr').props.onClick({preventDefault(){},stopPropagation(){}});t.render();t.submit();await t.ready();const saved=t.calls.find(c=>c.method==='updateProject').input;assert.deepEqual(saved.informationTags,[other]);assert.deepEqual(saved.localLabelDefinitions[key],{name:'Rawr',color:'#7f0011',deleted:true});assert.deepEqual(saved.localLabelDefinitions[other],p.localLabelDefinitions[other]);}finally{t.h.unmount();}
});
test('Fox16 filtered keyboard reorder persists full IDs without losing hidden clients',async()=>{
 const third={...client,clientId:'TMC-3333333333333333',displayName:'Hidden',status:'suspended'},writes=[];const order={schemaVersion:1,revision:3,updatedAt:client.updatedAt,clientIds:[client.clientId,third.clientId,second.clientId]};const t=setup({clients:[client,second,third],order:{getOwnerClientOrder:async()=>order,saveOwnerClientOrder:async input=>{writes.push(input);return {...order,revision:4,clientIds:input.clientIds};}}});try{await t.ready();await t.ready();t.h.find(n=>n.type==='button'&&content(n).includes('Access active')).props.onClick();t.render();const row=t.h.all(n=>n.type==='button'&&n.props.className==='clientRow').find(n=>content(n).includes(client.clientId));row.props.onKeyDown({altKey:true,key:'ArrowDown',preventDefault(){}});await t.ready();assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,3);assert.deepEqual(writes[0].clientIds,[second.clientId,third.clientId,client.clientId]);}finally{t.h.unmount();}
});
test('Fox16 repeated identical validation reopens its six-second banner without erasing editor state',async()=>{
 const t=setup(),timers=[];t.h.window.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};t.h.window.clearTimeout=()=>{};try{await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();t.change('Commission title','');t.submit();t.render();assert.match(content(t.dialog()),/title/i);const alert=()=>nodes(t.dialog()).find(n=>n.props?.role==='alert');assert.ok(alert());timers.filter(x=>x.delay===6000).at(-1).fn();t.render();assert.equal(alert(),undefined);t.submit();t.render();assert.ok(alert());assert.equal(t.field('Commission title').props.value,'');assert.equal(t.calls.some(c=>c.method==='updateProject'),false);}finally{t.h.unmount();}
});

test('Fox17 owner commission actions are pencil then archive icons with named targets', async () => {
 const t=setup();try { await t.ready();await t.open();
 const edit=t.button('Edit commission Existing commission'),archive=t.button('Archive commission Existing commission');
 assert.ok(edit);assert.ok(archive);assert.equal(content(archive),'');assert.equal(archive.props.title,'Archive card');
 const actions=t.h.all(node=>node.props.className==='projectActions').find(node=>nodes(node).includes(edit));
 assert.deepEqual(nodes(actions).filter(node=>node.type==='button').map(node=>node.props['aria-label']),['Edit commission Existing commission','Archive commission Existing commission']);
 edit.props.onClick();await t.ready();assert.equal(t.dialog().props.title,'Edit commission');
 assert.equal(t.calls.some(row=>row.method==='updateProject'||row.method==='archive'),false);
 } finally { t.h.unmount(); }
});

test('Fox18 shared label pencil opens explicit account-wide defaults and preserves unsaved commission',async()=>{
 const p={...project,projectId:'second-project',title:'Second commission',informationTags:['custom:Rawr'],localLabelDefinitions:{}};let contextCalls=0;
 const t=setup({detail:async()=>({client,projects:[project,p],email:''}),labelContext:async()=>{contextCalls++;throw Error('Wrong commission context read');}});
 try {
  await t.ready();await t.open();
  t.button('Edit commission Second commission').props.onClick();await t.ready();
  t.change('Commission title','Unsaved fox title');
  const pencil=t.h.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Edit shared label'));
  assert.ok(pencil);pencil.props.onClick({preventDefault(){}});await t.ready();
  const hierarchy=t.dialogs().find(n=>n.props.title==='Card label hierarchy');
  assert.ok(hierarchy);assert.equal(contextCalls,0);assert.match(content(hierarchy),/Account-wide label defaults/);
  assert.match(content(hierarchy),/does not save your commission draft/);
  assert.equal(t.field('Commission title').props.value,'Unsaved fox title');
  assert.equal(t.calls.some(c=>c.method==='updateProject'),false);
  hierarchy.props.onClose();t.render();
  assert.equal(t.field('Commission title').props.value,'Unsaved fox title');
 } finally {t.h.unmount();}
});
test('Fox18 order instructions follow directory cards and destructive discard uses primary styling',async()=>{
 const t=setup();try{
  await t.ready();const directory=t.h.find(n=>n.type==='section'&&n.props['aria-label']==='Client directory');
  const all=nodes(directory);assert.ok(all.findIndex(n=>n.props.className==='clientList')<all.findIndex(n=>n.props.id==='client-order-help'));
  await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
  t.change('Commission title','Disposable draft');t.action('Cancel').props.onClick();t.render();
  assert.match(t.action('Discard edit').props.className,/primary/);
 }finally{t.h.unmount();}
});

test('Fox18 late shared catalog response cannot reopen after commission editor closes',async()=>{
 const wait=deferred();let reads=0;const p={...project,informationTags:['custom:Rawr'],localLabelDefinitions:{}};
 const t=setup({detail:async()=>({client,projects:[p],email:''}),labelRead:async()=>{reads++;if(reads===1)return {schemaVersion:1,revision:1,updatedAt:null,entries:{},order:[]};return wait.promise;}});
 try{
  await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
  t.h.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Edit shared label')).props.onClick({preventDefault(){}});t.render();
  t.action('Cancel').props.onClick();t.render();
  wait.resolve({schemaVersion:1,revision:2,updatedAt:null,entries:{},order:[]});await t.ready();
  assert.equal(t.dialogs().some(n=>n.props.title==='Card label hierarchy'),false);
  assert.equal(t.calls.some(c=>c.method==='updateProject'),false);
 }finally{t.h.unmount();}
});

test('Fox18 late shared catalog response cannot attach to a reopened editor for the same commission',async()=>{
 const wait=deferred();let reads=0;const p={...project,informationTags:['custom:Rawr'],localLabelDefinitions:{}};
 const t=setup({detail:async()=>({client,projects:[p],email:''}),labelRead:async()=>{reads++;if(reads===1)return {schemaVersion:1,revision:1,updatedAt:null,entries:{},order:[]};return wait.promise;}});
 try{
  await t.ready();await t.open();t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
  t.h.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Edit shared label')).props.onClick({preventDefault(){}});t.render();
  t.action('Cancel').props.onClick();t.render();
  t.h.find(n=>n.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
  assert.ok(t.dialogs().some(n=>n.props.title==='Edit commission'));
  wait.resolve({schemaVersion:1,revision:2,updatedAt:null,entries:{},order:[]});await t.ready();
  assert.equal(t.dialogs().some(n=>n.props.title==='Card label hierarchy'),false);
  assert.equal(t.calls.some(c=>c.method==='updateProject'),false);
 }finally{t.h.unmount();}
});

test('overnight commission-only label ordering saves with the project version, not shared defaults',async()=>{
 const t=setup();await t.ready();await t.open();t.h.find(node=>node.type?.name==='HubWorkspaceWindow').props.onEditCommission();t.render();
 assert.match(content(t.dialog()),/Label order for this commission/);
 const move=t.h.find(node=>node.type==='button'&&node.props['aria-label']==='Move Commission status down');assert.ok(move);move.props.onClick();t.render();
 assert.equal(t.calls.some(call=>call.method==='updateProject'),false);
 t.submit();await t.ready();const call=t.calls.find(call=>call.method==='updateProject');assert.equal(call.input.expectedVersion,project.version);assert.ok(call.input.labelOrder.indexOf('information')<call.input.labelOrder.indexOf('status'));assert.equal(call.input.progress,project.progress);t.h.unmount();
});
test('read-only client order loading does not report unsaved busy navigation, and late completion after unmount stays silent',async()=>{const read=deferred();const t=setup({order:{getOwnerClientOrder:()=>read.promise,saveOwnerClientOrder:async()=>{throw Error('No write expected')}}});await t.ready();await t.ready();assert.equal(t.busy.at(-1),false);assert.equal(t.dirty.at(-1),false);t.h.unmount();const count=t.busy.length;read.resolve({schemaVersion:1,revision:1,updatedAt:null,clientIds:[client.clientId]});await flush();assert.equal(t.busy.length,count);});
