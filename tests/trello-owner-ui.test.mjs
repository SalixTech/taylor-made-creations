import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
import { harness, content } from './owner-ui-harness.mjs';
const PID = '11111111-1111-4111-8111-111111111111', CARD = 'aaaaaaaaaaaaaaaaaaaaaaaa', BOARD = 'bbbbbbbbbbbbbbbbbbbbbbbb', SECTION = 'cccccccccccccccccccccccc', ITEM = 'dddddddddddddddddddddddd';
const HASH = "f".repeat(64);
const CALLBACK = 'https://us-central1-taylor-made-creations.cloudfunctions.net/tmcTrelloWebhook', ISO = '2026-10-27T00:00:00.000Z';
const statuses = ['queued','in-progress','on-hold','delayed','completed','shipped','delivered'];
const lists = Object.fromEntries(statuses.map((value, index) => [value, String(index + 1).repeat(24)]));
const config = { version: 1, enabled: true, boardId: BOARD, lists, callbackUrl: CALLBACK, publicTransferApproved: true, webhookId: 'eeeeeeeeeeeeeeeeeeeeeeee' };
const project = { projectId: PID, clientId: 'TMC-0123456789ABCDEF', title: 'Public fox commission', summary: 'Public construction update', status: 'queued', progress: 15, progressSource: 'manual', trackingUrl: null, trelloUrl: null, requestId: null, version: 4, createdAt: ISO, updatedAt: ISO };
const sections = [{ id: SECTION, name: 'Head', items: [{ id: ITEM, name: 'Ears fitted', complete: false }] }];
const mapping = { projectId: PID, cardId: CARD, version: 2, state: 'synced', sections, lastSyncedAt: ISO };
const state = (patch = {}) => ({ config, ready: true, gaps: [], mappings: [], ...patch });
const turn = () => new Promise(resolve => setImmediate(resolve));
function clientFixture(response = state()) {
  const calls = [], sessions = [];
  const session = { auth: { app: { name: 'owner' } }, assertCurrent() { sessions.push('current'); } };
  const client = sourceLoader({
    '@/client-hub/callable-owner-session': { async hubCallableOwnerSession() { sessions.push('session'); return session; } },
    './taylor-services-client': { async taylorOwnerSession() { throw Error('not needed'); } },
    'firebase/functions': { getFunctions(app, region) { assert.equal(app, session.auth.app); assert.equal(region, 'us-central1'); return {}; }, httpsCallable(_functions, name) { return async input => { calls.push({ name, input: structuredClone(input) }); return { data: response }; }; } },
    'firebase/firestore/lite': {},
  })('src/owner/trello-client.ts');
  return { client, calls, sessions };
}
test('Trello status decoders enforce mapping identity, safe public fields, unique lists and exact callback', () => {
  const f = clientFixture(); assert.equal(f.client.decodeTrelloStatus(state({ mappings: [mapping] })).mappings[0].sections[0].items[0].complete, false);
  for (const invalid of [state({ config: { ...config, callbackUrl: 'https://attacker.test/hook' } }), state({ config: { ...config, lists: Object.fromEntries(statuses.map(value => [value, CARD])) } }), state({ mappings: [mapping, mapping] }), state({ mappings: [{ ...mapping, projectId: 'wrong' }] }), state({ mappings: [{ ...mapping, sections: [{ ...sections[0], items: [{ ...sections[0].items[0], complete: 'yes' }] }] }] })]) assert.throws(() => f.client.decodeTrelloStatus(invalid));
});
test('Trello calls are explicit owner callables with pre/post session checks and allowlisted transfer inputs', async () => {
  const f = clientFixture(); await f.client.loadTrelloStatus(); assert.deepEqual(f.sessions, ['session','current','current']);
  await f.client.mapTrelloProject({ projectId: PID, expectedProjectVersion: 4, cardId: CARD, publicTransferApproved: true, initialDirection: 'hub', importChecklistSections: true, previewHash: HASH, privateNotes: 'NEVER TRANSFER' });
  assert.deepEqual(f.calls[1], { name: 'tmcTrelloMapProject', input: { projectId: PID, expectedProjectVersion: 4, cardId: CARD, publicTransferApproved: true, initialDirection: 'hub', importChecklistSections: true, previewHash: HASH } });
  assert.doesNotMatch(JSON.stringify(f.calls), /NEVER TRANSFER|privateNotes|clientId/);
});
test('malformed IDs, unapproved mappings and arbitrary callback URLs fail before any callable', async () => {
  const f = clientFixture();
  await assert.rejects(f.client.mapTrelloProject({ projectId: PID, expectedProjectVersion: 4, cardId: CARD, publicTransferApproved: false, initialDirection: 'hub', importChecklistSections: false }));
  await assert.rejects(f.client.queueTrelloSync('wrong', 2));
  await assert.rejects(f.client.saveTrelloConfig({ ...config, expectedVersion: 1, callbackUrl: 'http://localhost/hook' }));
  await assert.rejects(f.client.saveTrelloChecklist(PID, 2, [{ id: ITEM, complete: true }, { id: ITEM, complete: false }]));
  assert.equal(f.calls.length, 0);
});
function uiFixture(value = state(), options = {}) {
  const h = harness(), calls = [];
  const stub = async (name, ...args) => { calls.push({ name, args: structuredClone(args) }); if (options.failure === name) throw Error('Provider failed safely'); };
  h.overrides['./client-hub-client'] = { clientHubErrorMessage: error => error.message };
  h.overrides['./trello-client'] = { TRELLO_ID: /^[a-f0-9]{24}$/, TRELLO_CALLBACK_URL: CALLBACK, loadTrelloStatus: async () => { calls.push({ name: 'status' }); return structuredClone(value); }, listTrelloProjects: async () => { calls.push({ name: 'projects' }); return [structuredClone(project)]; }, mapTrelloProject: input => stub('map', input), previewTrelloMapping: async input => { await stub('preview', input); return { previewHash: HASH, projectId: input.projectId, cardId: input.cardId, local: { ...project, sections: [] }, remote: { ...project, sections } }; }, queueTrelloSync: (...args) => stub('sync', ...args), saveTrelloConfig: input => stub('config', input), saveTrelloChecklist: (...args) => stub('checklist', ...args), resolveTrelloConflict: (...args) => stub('resolve', ...args), registerTrelloWebhook: (...args) => stub('webhook', ...args), verifyTrelloWebhook: (...args) => stub('verifyWebhook', ...args) };
  const Component = h.load('src/owner/TrelloStudio.tsx').TrelloStudio, props = {}, render = () => h.render(Component, props), button = label => h.find(node => node.type === 'button' && content(node) === label);
  render(); return { h, calls, props, render, button, async load() { button('Load Trello setup').props.onClick(); await turn(); render(); } };
}
test('opening Trello studio never contacts Firebase or Trello and setup remains explicit', async () => {
  const t = uiFixture(); await turn(); t.render(); assert.equal(t.calls.length, 0); assert.match(content(t.h.tree), /An existing Trello link is not a sync mapping/); await t.load(); assert.deepEqual(t.calls.map(call => call.name), ['status','projects']);
  const endpoint = t.h.find(node => node.type === 'input' && node.props.type === 'url'); assert.equal(endpoint.props.value, CALLBACK); assert.equal(endpoint.props.readOnly, true); t.h.unmount();
});
test('existing-card mapping requires selected commission and its explicit public approval', async () => {
  const t = uiFixture(); await t.load(); assert.equal(t.button('Approve card mapping & queue sync').props.disabled, true);
  const commission = t.h.find(node => node.type === 'select' && node.props.value === ''); commission.props.onChange({ target: { value: PID } }); t.render();
  const card = t.h.all(node => node.type === 'input' && node.props.maxLength === 24).at(-1); card.props.onChange({ target: { value: CARD } }); t.render();
  assert.equal(t.button('Approve card mapping & queue sync').props.disabled, true); t.button('Preview exact card & public fields').props.onClick(); await turn(); t.render();
  const approval = t.h.all(node => node.type === 'input' && node.props.type === 'checkbox').at(-1); approval.props.onChange({ target: { checked: true } }); t.render(); assert.equal(t.button('Approve card mapping & queue sync').props.disabled, false);
  t.button('Approve card mapping & queue sync').props.onClick(); await turn(); t.render(); const input = t.calls.find(call => call.name === 'map').args[0]; assert.equal(input.projectId, PID); assert.equal(input.expectedProjectVersion, 4); assert.equal(input.publicTransferApproved, true); assert.equal(input.importChecklistSections, false); assert.equal(input.previewHash, HASH); assert.match(content(t.h.tree), /queued/); t.h.unmount();
});
test('mapped checklist completion uses mapping version and stable IDs, never creates/deletes checklist structure', async () => {
  const t = uiFixture(state({ mappings: [mapping] })); await t.load();
  const item = t.h.find(node => node.type === 'label' && content(node) === 'Ears fitted').props.children[0]; item.props.onChange({ target: { checked: true } }); t.render(); assert.equal(t.button('Save checklist & queue sync').props.disabled, false);
  t.button('Save checklist & queue sync').props.onClick(); await turn(); t.render(); assert.deepEqual(t.calls.find(call => call.name === 'checklist').args, [PID, 2, [{ id: ITEM, complete: true }]]); t.h.unmount();
});
test('conflicts show explicit owner choice and cancellation never queues an overwrite', async () => {
  const conflict = { local: project, remote: { ...project, title: 'Other public title' }, detectedAt: ISO, localSections: sections, remoteSections: [{ ...sections[0], items: [{ ...sections[0].items[0], complete: true }] }] };
  const t = uiFixture(state({ mappings: [{ ...mapping, state: 'conflict', conflict }] })); await t.load(); assert.match(content(t.h.tree), /Review conflicting public versions/); assert.equal(t.button('Queue sync / retry'), undefined);
  t.h.window.confirm = () => false; t.button('Keep reviewed Trello version').props.onClick(); await turn(); assert.equal(t.calls.some(call => call.name === 'resolve'), false);
  t.h.window.confirm = () => true; t.button('Keep reviewed Trello version').props.onClick(); await turn(); t.render(); assert.deepEqual(t.calls.find(call => call.name === 'resolve').args, [PID, 2, 'trello']); t.h.unmount();
});
test('webhook registration is a separately approved action and provider failure never shows success', async () => {
  const t = uiFixture(state({ config: { ...config, enabled: false, webhookId: null }, ready: false, gaps: ['Register webhook'] }), { failure: 'webhook' }); await t.load();
  assert.equal(t.button('Register Trello webhook').props.disabled, true);
  const approval = t.h.find(node => node.type === 'label' && content(node).includes('I authorize registering')).props.children[0]; approval.props.onChange({ target: { checked: true } }); t.render(); t.button('Register Trello webhook').props.onClick(); await turn(); t.render();
  assert.deepEqual(t.calls.find(call => call.name === 'webhook').args, [1]); assert.match(content(t.h.tree), /Provider failed safely/); assert.doesNotMatch(content(t.h.tree), /registration was confirmed/); t.h.unmount();
});

test('mapping preview decoder binds fresh snapshots to the requested exact card and commission', async () => {
  const result = { previewHash: HASH, projectId: PID, cardId: CARD, local: { ...project, sections: [] }, remote: { ...project, sections } };
  const f = clientFixture(result); const input = { projectId: PID, expectedProjectVersion: 4, cardId: CARD, importChecklistSections: true };
  const preview = await f.client.previewTrelloMapping(input); assert.equal(preview.previewHash, HASH); assert.equal(preview.remote.sections[0].items[0].name, 'Ears fitted'); assert.equal(f.calls[0].name, 'tmcTrelloPreviewMapping');
  for (const patch of [{ projectId: '22222222-2222-4222-8222-222222222222' }, { cardId: BOARD }, { previewHash: 'not-a-hash' }]) await assert.rejects(clientFixture({ ...result, ...patch }).client.previewTrelloMapping(input));
});
test('changing mapping input invalidates an approved preview before a transfer can be queued', async () => {
  const t = uiFixture(); await t.load();
  t.h.find(node => node.type === 'select' && node.props.value === '').props.onChange({ target: { value: PID } }); t.render();
  t.h.all(node => node.type === 'input' && node.props.maxLength === 24).at(-1).props.onChange({ target: { value: CARD } }); t.render(); t.button('Preview exact card & public fields').props.onClick(); await turn(); t.render();
  t.h.all(node => node.type === 'input' && node.props.type === 'checkbox').at(-1).props.onChange({ target: { checked: true } }); t.render(); assert.equal(t.button('Approve card mapping & queue sync').props.disabled, false);
  t.h.all(node => node.type === 'input' && node.props.maxLength === 24).at(-1).props.onChange({ target: { value: BOARD } }); t.render(); assert.equal(t.button('Approve card mapping & queue sync').props.disabled, true); assert.doesNotMatch(content(t.h.tree), /Review the exact two public versions/); t.h.unmount();
});

test('uncertain registration blocks duplicate creation and exposes explicit read-only verification recovery', async () => {
  const t = uiFixture(state({ config: { ...config, enabled: false, webhookId: null, registrationUncertain: true }, ready: false, gaps: ['Reconcile uncertain registration'] })); await t.load();
  assert.equal(t.button('Register Trello webhook').props.disabled, true); assert.match(content(t.h.tree), /Do not create another webhook/);
  const input = t.h.find(node => node.type === 'label' && content(node).startsWith('Existing webhook ID')).props.children[1]; input.props.onChange({ target: { value: CARD } }); t.render(); t.button('Verify & use existing webhook').props.onClick(); await turn(); t.render();
  assert.deepEqual(t.calls.find(call => call.name === 'verifyWebhook').args, [1, CARD]); assert.equal(t.calls.some(call => call.name === 'webhook'), false); assert.match(content(t.h.tree), /No new Trello webhook was created/); t.h.unmount();
});
test('Trello studio reports dirty setup and busy operations to parent navigation guards', async () => {
  const t = uiFixture(), busy = [], dirty = []; t.props.onBusyChange = value => busy.push(value); t.props.onDirtyChange = value => dirty.push(value); t.render(); await t.load();
  t.h.all(node => node.type === 'input' && node.props.maxLength === 24)[0].props.onChange({ target: { value: CARD } }); t.render(); assert.equal(dirty.at(-1), true); assert.equal(busy.includes(true), false, "read-only loading does not lock navigation"); t.button("Save setup").props.onClick(); assert.equal(busy.at(-1), true, "writes still lock navigation immediately"); await turn(); t.render(); assert.ok(busy.includes(true)); assert.equal(busy.at(-1), false); t.h.unmount(); assert.equal(dirty.at(-1), false);
});
