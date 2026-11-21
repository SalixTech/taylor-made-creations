// Actual installed Firebase Functions serialization over local HTTP.
// Firestore Lite/rules tests are in fox5-drafts-firestore.integration.mjs.
// No live Firebase, Auth, deployment, publication, or browser/pixel QA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';
import { createOwnerBackupService } from '../firebase/functions/owner-backups-core.mjs';
import { OWNER_UID } from '../firebase/functions/cleanup-core.mjs';

const { initializeApp, deleteApp } = appRequire('firebase/app');
const lite = appRequire('firebase/firestore/lite');
const functions = appRequire('firebase/functions');
const load = sourceLoader();
const { createDefaultOwnerContent } = load('src/owner/defaults.ts');
const { assertOwnerContent } = load('src/owner/model.ts');
const { createFirebaseOwnerStore, encodeOwnerWorkspace } = load('src/owner/firebase-store.ts');

function memoryFirestore() {
  const docs = new Map();
  const snapshot = path => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) });
  let queue = Promise.resolve();
  const db = {
    doc: path => ({ path, get: async () => snapshot(path) }),
    runTransaction(action) {
      const pending = queue.then(async () => {
        const writes = [];
        const result = await action({
          get: async ref => snapshot(ref.path),
          set: (ref, value) => writes.push([ref.path, structuredClone(value)]),
          create(ref, value) { assert.equal(docs.has(ref.path), false); writes.push([ref.path, structuredClone(value)]); },
        });
        for (const [path, value] of writes) docs.set(path, value);
        return result;
      });
      queue = pending.catch(() => {});
      return pending;
    },
  };
  return { db, docs };
}

async function wireFixture(t) {
  const { db: adminDb, docs } = memoryFirestore();
  const service = createOwnerBackupService({ db: adminDb, now: () => Date.parse('2026-10-28T00:00:00.000Z') });
  const requests = [];
  const methods = { tmcOwnerCheckpointDraft: 'checkpointDraft', tmcOwnerListRecovery: 'listRecovery', tmcOwnerReadRecovery: 'readRecovery', tmcOwnerDismissRecovery: 'dismissRecovery' };
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    try {
      const name = request.url.split('/').at(-1);
      assert.ok(methods[name], 'Only recovery methods are supported in this local test');
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const { data } = JSON.parse(raw);
      requests.push({ name, data });
      // Claims are injected here. This tests the actual client encoder/decoder
      // and backend service, not live Auth or deployed callable infrastructure.
      const result = await service[methods[name]](data, { auth: { uid: OWNER_UID } });
      response.end(JSON.stringify({ result }));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: { status: String(error.code ?? 'internal').replaceAll('-', '_').toUpperCase(), message: error.message } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const projectId = `demo-fox5-wire-${crypto.randomUUID()}`;
  const app = initializeApp({ projectId }, projectId);
  const callable = functions.getFunctions(app, 'us-central1');
  functions.connectFunctionsEmulator(callable, '127.0.0.1', server.address().port);
  const db = lite.getFirestore(app);
  lite.connectFirestoreEmulator(db, '127.0.0.1', 18080);
  const user = { uid: OWNER_UID, getIdToken: async () => 'test-owner-session' };
  const auth = { app, currentUser: user };
  const store = createFirebaseOwnerStore({ db, auth, ownerUid: OWNER_UID });
  t.after(async () => { store.dispose(); await lite.terminate(db); await deleteApp(app); await new Promise(resolve => server.close(resolve)); });
  const saveWorkspace = content => docs.set('ownerWorkspace/current', encodeOwnerWorkspace({ schemaVersion: 1, revision: 4, updatedAt: '2026-10-28T00:00:00.000Z', draft: content, localPublished: null }));
  return { store, callable, docs, requests, saveWorkspace, auth };
}

test('actual callable SDK reproduces undefined-to-null rejection; adapter checkpoints canonical saved JSON instead', async t => {
  const f = await wireFixture(t), content = createDefaultOwnerContent();
  content.design = { bodyFontSize: undefined, headingFontSize: 26 };
  content.pages[0].titleAppearance = undefined;
  assertOwnerContent(content);
  f.saveWorkspace(content);
  const before = structuredClone(f.docs.get('ownerWorkspace/current'));
  const input = { operationId: 'saved-wire-operation', branchId: 'saved-wire-branch', expectedRevision: 4, reason: 'saved-draft', content };
  await assert.rejects(functions.httpsCallable(f.callable, 'tmcOwnerCheckpointDraft')(input), { code: 'functions/invalid-argument' });
  assert.equal(f.requests[0].data.content.design.bodyFontSize, null, 'Unfixed SDK transport changes valid optional omission to invalid null');
  assert.equal(f.docs.has('ownerRecoveryState/current'), false);

  const entry = await f.store.recovery.checkpointDraft(input);
  assert.equal(entry.id, 'd-saved-wire-operation');
  assert.equal(entry.cloudRevision, 4);
  assert.equal(entry.expiresAt, '2026-11-04T00:00:00.000Z');
  const sent = f.requests.at(-1).data;
  assert.deepEqual(sent.content, JSON.parse(before.payload).draft);
  assert.equal(Object.hasOwn(sent.content.design, 'bodyFontSize'), false);
  assert.equal(Object.hasOwn(sent.content.pages[0], 'titleAppearance'), false);
  assert.equal(sent.operationId, input.operationId);
  assert.equal(Object.hasOwn(content.design, 'bodyFontSize'), true, 'No mutation of current builder content');
  assert.deepEqual(await f.store.recovery.checkpointDraft(input), entry, 'Exact retry keeps the same recovery identity');
  assert.equal([...f.docs.keys()].filter(path => path.startsWith('ownerRecoveryVersions/')).length, 1);
  assert.deepEqual(f.docs.get('ownerWorkspace/current'), before);
  assert.equal(f.docs.has('site/published'), false);
});

test('canonical recovery still rejects invalid null, preserves valid null, and list/restore/dismiss never publish', async t => {
  const f = await wireFixture(t), content = createDefaultOwnerContent();
  content.premades = [{ id: 'private-premade', name: 'Private listing', image: '/images/test.png', alt: 'Test', description: '', price: null, visible: false }];
  f.saveWorkspace(content);
  const input = { operationId: 'private-checkpoint', branchId: 'private-branch', expectedRevision: 4, reason: 'saved-draft', content };
  const bad = structuredClone(content); bad.design = { bodyFontSize: null };
  await assert.rejects(f.store.recovery.checkpointDraft({ ...input, content: bad }), { name: 'OwnerValidationError' });
  assert.equal(f.requests.length, 0, 'Invalid content is rejected before transport');
  const entry = await f.store.recovery.checkpointDraft(input);
  assert.equal(f.requests[0].data.content.premades[0].price, null);
  assert.deepEqual(await f.store.recovery.listRecovery(), [entry]);
  const beforeRestore = structuredClone([...f.docs]);
  assert.deepEqual(await f.store.recovery.readRecovery(entry.id, 4), content);
  assert.deepEqual([...f.docs], beforeRestore, 'Restore is a read-only copy');
  await assert.rejects(f.store.recovery.readRecovery(entry.id, 3), { code: 'functions/aborted' });
  const changed = structuredClone(content); changed.home.title = 'Reused identity with changed content';
  await assert.rejects(f.store.recovery.checkpointDraft({ ...input, content: changed }), { code: 'functions/already-exists' });
  await f.store.recovery.dismissRecovery(entry.id);
  assert.deepEqual(await f.store.recovery.listRecovery(), []);
  assert.equal(f.docs.has(`ownerRecoveryVersions/${entry.id}`), true, 'Dismiss retains immutable bytes');
  assert.equal(f.docs.has('site/published'), false);
  const requestCount = f.requests.length; f.auth.currentUser = null;
  await assert.rejects(f.store.recovery.listRecovery(), { code: 'unavailable' });
  assert.equal(f.requests.length, requestCount, 'Ended owner session cannot send another request');
});

// Source-hook integration below runs the real portal/recovery handlers with a
// controlled cloud port. It is not a browser or React-renderer integration test.
import { harness, content as textContent, nodes } from './owner-ui-harness.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function portalFixture(t) {
  const h = harness(), values = new Map(), timers = new Map(), checkpoints = [], saves = [], versions = [];
  let timerId = 0, current = true, listFailure = null, saveFailure = null;
  h.window.location.href = '/taylor/pages'; h.window.location.origin = 'https://tmc.test';
  h.window.localStorage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const schedule = (fn, ms = 0) => { timers.set(++timerId, { fn, ms }); return timerId; };
  h.globals.setTimeout = h.window.setTimeout = schedule;
  h.globals.clearTimeout = h.window.clearTimeout = id => timers.delete(id);
  h.window.setInterval = () => 0; h.window.clearInterval = () => {};
  for (const name of ['HelpButton', 'TaylorServices', 'CommissionRequests']) h.overrides[`./${name}`] = { [name]: () => null };
  let saved = h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
  const store = {
    load: async () => structuredClone(saved), subscribe: () => () => {},
    async saveDraft(content, revision, version) { assert.equal(saved.revision, revision); versions.push(structuredClone(version)); if (saveFailure) throw saveFailure; saves.push(structuredClone(content)); saved = { ...saved, revision: revision + 1, updatedAt: '2026-10-28T00:00:00.000Z', draft: structuredClone(content) }; return structuredClone(saved); },
    async publishLive() { assert.fail('Draft actions must never publish'); },
    recovery: {
      checkpointDraft(input) {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        const entry = { id: `d-${input.operationId}`, kind: 'draft', createdAt: '2026-10-28T00:00:00.000Z', expiresAt: '2026-11-04T00:00:00.000Z', cloudRevision: input.expectedRevision, branchId: input.branchId };
        checkpoints.push({ input: structuredClone(input), resolve: () => resolve(entry), reject });
        return promise;
      },
      async listRecovery() { if (listFailure) throw listFailure; return []; },
      async readRecovery() { assert.fail('Not a restore test'); },
      async dismissRecovery() { assert.fail('Not a dismissal test'); },
    },
  };
  const props = { mode: 'cloud', userEmail: 'owner@example.test', initialSection: 'pages', store, recoveryIdentity: { projectId: 'demo-owner', ownerUid: OWNER_UID, assertCurrent() { if (!current) throw Error('Owner session ended'); } }, onSignOut: async () => { current = false; } };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  const render = () => h.render(Portal, props);
  const builder = () => h.find(node => node.type?.name === 'OwnerVisualBuilder');
  const button = name => h.find(node => node.type === 'button' && textContent(node).trim() === name);
  const settle = async () => { await tick(); render(); await tick(); render(); };
  const edit = name => { builder().props.onEdit(value => { value.home.title = name; }); render(); };
  t.after(() => h.unmount()); render(); await settle();
  return { h, render, builder, button, settle, edit, checkpoints, saves, versions, timers, failSave(error) { saveFailure = error; }, get saved() { return saved; }, failList(error) { listFailure = error; } };
}

test('Save as Draft unlocks after the workspace commits while its independently tracked recovery acknowledgment is pending', async t => {
  const f = await portalFixture(t);
  f.edit('Captured private draft');
  const save = f.builder().props.onSaveDraft;
  save(); save(); await f.settle();
  assert.equal(f.saves.length, 1, 'Repeated clicks cannot duplicate the workspace transaction');
  assert.equal(f.saved.revision, 1);
  assert.match(f.versions[0].id, /^draft-/); assert.match(f.versions[0].name, /^Draft /);
  assert.match(textContent(f.h.tree), /saved in Drafts/);
  assert.equal(f.checkpoints.length, 1);
  assert.equal(f.checkpoints[0].input.expectedRevision, 1);
  assert.equal(f.checkpoints[0].input.content.home.title, 'Captured private draft');
  assert.equal(f.checkpoints[0].input.reason, 'saved-draft');
  assert.equal(f.builder().props.saveBusy, false, 'Secondary backup latency cannot strand the builder');
  assert.match(f.builder().props.draftSaveStatus, /Draft saved; recovery copy pending/);
  f.edit('Newer unsaved edits');
  f.checkpoints[0].resolve(); await f.settle();
  assert.equal(f.builder().props.content.home.title, 'Newer unsaved edits');
  assert.equal(f.saved.draft.home.title, 'Captured private draft');
  assert.match(textContent(f.h.tree), /You have unsaved changes/);
});

test('Save dialog closes after committed draft, not after the secondary recovery acknowledgment', async t => {
  const f = await portalFixture(t); f.edit('Dialog save');
  f.builder().props.onSave(); f.render();
  const dialog = f.h.find(node => node.type?.name === 'Dialog' && node.props.title === 'Save your changes');
  const save = nodes(dialog.props.actions).find(node => node.type === 'button' && textContent(node) === 'Save draft');
  await save.props.onClick(); await f.settle();
  assert.equal(f.h.find(node => node.type?.name === 'Dialog' && node.props.title === 'Save your changes'), undefined);
  assert.equal(f.checkpoints.length, 1);
  assert.match(f.builder().props.draftSaveStatus, /recovery copy pending/);
  f.checkpoints[0].resolve(); await f.settle();
});

test('unconfirmed saved recovery remains visible and exact manual retry cannot be cleared by a successful list read', async t => {
  const f = await portalFixture(t); f.edit('Retry exact saved version');
  f.builder().props.onSaveDraft(); await f.settle();
  f.checkpoints[0].reject(Error('Recovery connection interrupted')); await f.settle();
  assert.equal(f.builder().props.saveBusy, false);
  assert.match(textContent(f.h.tree), /Draft saved; recovery copy not confirmed/);
  assert.match(textContent(f.h.tree), /Recovery connection interrupted/);
  f.edit('Newer edits stay separate from saved recovery retry');
  const retry = f.button('Retry cloud recovery'); assert.ok(retry);
  retry.props.onClick(); await f.settle();
  assert.equal(f.checkpoints.length, 2);
  assert.deepEqual(f.checkpoints[1].input, f.checkpoints[0].input, 'Retry preserves operation ID, captured bytes and saved revision');
  assert.equal(f.button('Retry cloud recovery'), undefined, 'Pending state replaces the prior failure while retry is tracked');
  assert.match(f.builder().props.draftSaveStatus, /Draft saved; recovery copy pending/);
  assert.equal(f.builder().props.content.home.title, 'Newer edits stay separate from saved recovery retry');
  f.checkpoints[1].reject(Error('Still not confirmed')); await f.settle();
  assert.ok(f.button('Retry cloud recovery'));
  assert.equal([...f.timers.values()].some(timer => timer.ms === 3000), false, 'No automatic storm after failed exact retry');
  for (const [id, timer] of [...f.timers]) if ([5000, 8000].includes(timer.ms)) { f.timers.delete(id); timer.fn(); }
  f.render(); assert.match(textContent(f.h.tree), /Still not confirmed/, 'Backup failure is persistent, not a disappearing save toast');
  f.button('Retry cloud recovery').props.onClick(); await f.settle();
  f.checkpoints[2].resolve(); await f.settle();
  assert.doesNotMatch(textContent(f.h.tree), /Still not confirmed/);
  assert.match(f.builder().props.draftSaveStatus, /Cloud recovery saved/);
});

test('later explicit save supersedes older checkpoint results without overwriting current edits or newer failure', async t => {
  const f = await portalFixture(t); f.edit('First saved version');
  f.builder().props.onSaveDraft(); await f.settle();
  f.edit('Second saved version'); f.builder().props.onSaveDraft(); await f.settle();
  assert.equal(f.checkpoints.length, 2);
  assert.equal(f.checkpoints[1].input.expectedRevision, 2);
  assert.notEqual(f.checkpoints[1].input.operationId, f.checkpoints[0].input.operationId);
  f.checkpoints[1].reject(Error('Newer checkpoint failed')); await f.settle();
  f.edit('Third unsaved version');
  f.checkpoints[0].resolve(); await f.settle();
  assert.match(f.builder().props.draftSaveStatus, /Newer checkpoint failed/);
  assert.equal(f.builder().props.content.home.title, 'Third unsaved version');
  assert.equal(f.saved.draft.home.title, 'Second saved version');
  assert.equal(f.builder().props.saveBusy, false);
});

function recoveryHookFixture(t) {
  const h = harness(), timers = new Map(); let timerId = 0, value;
  h.globals.setTimeout = (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; };
  h.globals.clearTimeout = id => timers.delete(id);
  const content = createDefaultOwnerContent(), checkpointRequests = [], listRequests = [];
  const props = {
    port: {
      checkpointDraft(input) { return new Promise((resolve, reject) => checkpointRequests.push({ input, resolve, reject })); },
      listRecovery() { return new Promise((resolve, reject) => listRequests.push({ resolve, reject })); },
    },
    session: { projectId: 'demo-owner', ownerUid: OWNER_UID, assertCurrent() {} }, content, revision: 1, dirty: false, ready: true,
  };
  const { useCloudDraftRecovery } = h.load('src/owner/use-cloud-draft-recovery.ts');
  function Component() { value = useCloudDraftRecovery(props.port, props.session, props.content, props.revision, props.dirty, props.ready); return null; }
  const render = () => h.render(Component);
  const entry = input => ({ id: `d-${input.operationId}`, kind: 'draft', branchId: input.branchId, cloudRevision: input.expectedRevision, createdAt: '2026-10-28T00:00:00.000Z', expiresAt: '2026-11-04T00:00:00.000Z' });
  render(); t.after(() => h.unmount());
  return { render, props, entry, checkpointRequests, listRequests, get value() { return value; } };
}

test('list errors clear on successful refresh without clearing an unconfirmed checkpoint, and stale lists cannot erase new entries', async t => {
  const f = recoveryHookFixture(t);
  const save = f.value.checkpointSaved(f.props.content, 1);
  f.checkpointRequests[0].reject(Error('Checkpoint not confirmed')); await save; f.render();
  const firstList = f.value.refresh(); f.listRequests[0].resolve([]); await firstList; f.render();
  assert.equal(f.value.problem, 'Checkpoint not confirmed', 'Successful list is not evidence of a successful saved checkpoint');
  const retry = f.value.checkpoint();
  const staleList = f.value.refresh();
  const entry = f.entry(f.checkpointRequests[1].input);
  f.checkpointRequests[1].resolve(entry); await retry; f.render();
  f.listRequests[1].resolve([]); await staleList; f.render();
  assert.deepEqual(f.value.entries, [entry], 'A pre-acknowledgment list cannot erase the newly confirmed copy');
  const badList = f.value.refresh(); f.listRequests[2].reject(Error('List unavailable')); await badList; f.render();
  assert.equal(f.value.problem, 'List unavailable');
  const goodList = f.value.refresh(); f.listRequests[3].resolve([entry]); await goodList; f.render();
  assert.equal(f.value.problem, null);
});

test('superseded failure and owner-session stop ignore late saved-checkpoint completion', async t => {
  const f = recoveryHookFixture(t);
  const older = f.value.checkpointSaved(f.props.content, 1);
  const newerContent = structuredClone(f.props.content); newerContent.home.title = 'Newer saved';
  const newer = f.value.checkpointSaved(newerContent, 2);
  const entry = f.entry(f.checkpointRequests[1].input);
  f.checkpointRequests[1].resolve(entry); await newer; f.render();
  f.checkpointRequests[0].reject(Error('Old request was late')); await older; f.render();
  assert.equal(f.value.problem, null); assert.deepEqual(f.value.entries, [entry]); assert.equal(f.value.pending, false);
  const beforeStop = f.value.status;
  const stopped = f.value.checkpointSaved(newerContent, 2); f.render(); f.value.stop();
  f.checkpointRequests[2].resolve(f.entry(f.checkpointRequests[2].input)); await stopped; f.render();
  assert.deepEqual(f.value.entries, [entry]); assert.notEqual(f.value.status, beforeStop, 'Stopped session receives no late success status');
});

test('explicit Save Draft retains the same named-version request after an uncertain save error, while background checkpoints create no versions', async t => {
  const f = await portalFixture(t); f.edit('Preserve exact named attempt');
  f.failSave(Error('Save acknowledgment was not confirmed'));
  f.builder().props.onSaveDraft(); await f.settle();
  assert.equal(f.versions.length, 1); assert.equal(f.saves.length, 0); assert.equal(f.checkpoints.length, 0);
  f.failSave(null); f.builder().props.onSaveDraft(); await f.settle();
  assert.equal(f.versions.length, 2); assert.deepEqual(f.versions[1], f.versions[0]);
  assert.equal(f.saves.length, 1);
  f.checkpoints[0].resolve(); await f.settle();
  f.edit('Background recovery is not another named version');
  for (const [id, timer] of [...f.timers]) if (timer.ms >= 3000 && timer.ms <= 300000) { f.timers.delete(id); timer.fn(); }
  await f.settle();
  assert.equal(f.versions.length, 2, 'Only explicit save attempts may ask for a named version');
  for (const checkpoint of f.checkpoints.slice(1)) checkpoint.resolve(); await f.settle();
});
