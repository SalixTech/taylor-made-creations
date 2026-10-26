import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Pure mock SDK: these tests cannot contact any Firebase project.
const root = fileURLToPath(new URL('../src/', import.meta.url));
function fixture() {
  const documents = new Map(), cache = new Map();
  let reads = 0, commits = 0, queue = Promise.resolve(), beforeRead, beforeCommit, writeError;
  const user = { uid: 'owner', getIdToken: async () => 'mock-token' }, auth = { currentUser: user }, db = {};
  const snapshot = (path, value = documents.get(path)) => ({ id: path.split('/').at(-1), exists: () => value !== undefined, data: () => structuredClone(value) });
  const get = async ref => { ++reads; await beforeRead?.(ref.path); return snapshot(ref.path); };
  const sdk = {
    doc: (actualDb, path) => { assert.equal(actualDb, db); return { path }; },
    collection: (actualDb, path) => { assert.equal(actualDb, db); return { path }; },
    getDoc: get,
    getDocs: async ref => { ++reads; await beforeRead?.(ref.path); return { docs: [...documents.keys()].filter(path => path.startsWith(ref.path + '/')).map(path => snapshot(path)) }; },
    runTransaction: (_db, transform) => {
      const pendingOperation = queue.then(async () => {
        let writes = new Map();
        const tx = { get, set: (ref, data) => writes.set(ref.path, structuredClone(data)), delete: ref => writes.set(ref.path, undefined) };
        let result = await transform(tx);
        if (beforeCommit) { const action = beforeCommit; beforeCommit = undefined; action(); writes = new Map(); result = await transform(tx); }
        if (writeError && writes.size) throw typeof writeError === 'function' ? writeError() : writeError;
        if (writes.size) { for (const [path, value] of writes) { if (value === undefined) documents.delete(path); else documents.set(path, value); } ++commits; }
        return result;
      });
      queue = pendingOperation.catch(() => {}); return pendingOperation;
    },
  };
  function load(path) {
    path = resolve(path); if (!extname(path)) path += '.ts';
    if (cache.has(path)) return cache.get(path).exports;
    const compiledModule = { exports: {} }; cache.set(path, compiledModule);
    const source = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) { compiledModule.exports = JSON.parse(source); return compiledModule.exports; }
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const require = name => name === 'firebase/firestore/lite' ? sdk : name.startsWith('.') ? load(resolve(dirname(path), name)) : (() => { throw new Error(`Unexpected import: ${name}`); })();
    new Function('require', 'module', 'exports', output)(require, compiledModule, compiledModule.exports); return compiledModule.exports;
  }
  const cloud = load(resolve(root, 'owner/firebase-store.ts')), defaults = load(resolve(root, 'owner/defaults.ts')), model = load(resolve(root, 'owner/model.ts'));
  return { documents, auth, user, cloud, defaults, model, store: () => cloud.createFirebaseOwnerStore({ db, auth, ownerUid: 'owner' }), stats: () => ({ reads, commits }), beforeRead: value => { beforeRead = value; }, retry: action => { beforeCommit = action; }, failWrite: value => { writeError = value; } };
}
const code = expected => error => error.code === expected;
const premade = () => ({ id: 'premade-test', name: 'Published premade', image: '/images/example.jpg', alt: 'Example', description: 'Ready for sale', price: 100, visible: true });

test('legacy working draft opens unchanged, and listing/loading named drafts never writes or publishes', async () => {
  const f = fixture(), store = f.store(), initial = f.defaults.createInitialOwnerWorkspace();
  initial.revision = 4; initial.draft.home.title = 'Legacy private work';
  const encoded = f.cloud.encodeOwnerWorkspace(initial); f.documents.set('ownerWorkspace/current', encoded);
  assert.deepEqual(await store.load(), initial); assert.deepEqual(await store.listNamedDrafts(), []);
  assert.deepEqual(f.documents.get('ownerWorkspace/current'), encoded); assert.equal(f.stats().commits, 0);
  const saved = await store.saveNamedDraft('Holiday', initial.draft);
  assert.deepEqual(await store.loadNamedDraft(saved.id), saved); assert.equal(f.stats().commits, 1);
  assert.deepEqual(f.documents.get('ownerWorkspace/current'), encoded); assert.equal(f.documents.has('site/published'), false);
  assert.deepEqual(Object.keys((await store.listNamedDrafts())[0]).sort(), ['createdAt', 'id', 'name', 'revision', 'updatedAt']);
});

test('ten independently bounded documents exceed 700 KB aggregate safely; eleventh never commits', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  content.home.image.src = 'data:image/png;base64,' + 'a'.repeat(110000);
  const drafts = [];
  for (let i = 0; i < 10; ++i) { content.home.title = `Plan ${i}`; drafts.push(await store.saveNamedDraft(`Plan ${i}`, content)); }
  const encoded = [...f.documents].filter(([path]) => path.startsWith('ownerDrafts/'));
  assert.equal(encoded.length, 10); assert.ok(encoded.reduce((sum, [, value]) => sum + value.payload.length, 0) > 700000);
  assert.ok(JSON.stringify(f.documents.get('ownerDraftIndex/current')).length < 2000);
  const before = structuredClone(f.documents);
  await assert.rejects(store.saveNamedDraft('Eleventh', content), code('limit'));
  assert.deepEqual(f.documents, before);
  const revised = await store.saveNamedDraft('Plan 0 updated', content, { id: drafts[0].id, expectedRevision: 1 });
  assert.equal(revised.revision, 2); assert.equal((await store.listNamedDrafts()).length, 10);
});

test('concurrent last-slot creation and edits cannot silently overwrite', async () => {
  const f = fixture(), a = f.store(), b = f.store(), content = f.defaults.createDefaultOwnerContent();
  for (let i = 0; i < 9; ++i) await a.saveNamedDraft(`Slot ${i}`, content);
  const outcomes = await Promise.allSettled([a.saveNamedDraft('Last A', content), b.saveNamedDraft('Last B', content)]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(value => value.status === 'rejected').reason.code, 'limit');
  const selected = (await a.listNamedDrafts())[0];
  await a.renameNamedDraft(selected.id, 'Renamed safely', selected.revision);
  for (const action of [() => b.renameNamedDraft(selected.id, 'Stale name', selected.revision), () => b.saveNamedDraft('Stale contents', content, { id: selected.id, expectedRevision: selected.revision }), () => b.deleteNamedDraft(selected.id, selected.revision)]) await assert.rejects(action(), code('conflict'));
  assert.equal((await a.loadNamedDraft(selected.id)).name, 'Renamed safely');
});

test('archive is an exact private recoverable copy; restore uses a new ID and respects all ten slots', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  content.home.title = 'Convention setup'; const saved = await store.saveNamedDraft('Convention', content);
  const encoded = structuredClone(f.documents.get(`ownerDrafts/${saved.id}`));
  await store.deleteNamedDraft(saved.id, saved.revision);
  assert.equal(f.documents.has(`ownerDrafts/${saved.id}`), false); assert.deepEqual(f.documents.get(`ownerDraftTrash/${saved.id}`), encoded);
  await assert.rejects(store.loadNamedDraft(saved.id), code('not-found'));
  assert.equal((await store.listTrashedNamedDrafts())[0].id, saved.id);
  const restored = await store.restoreNamedDraft(saved.id);
  assert.notEqual(restored.id, saved.id); assert.equal(restored.revision, 1); assert.deepEqual(restored.content, saved.content);
  assert.deepEqual(f.documents.get(`ownerDraftTrash/${saved.id}`), encoded);
  await assert.rejects(store.restoreNamedDraft(saved.id), f.model.OwnerValidationError);
  for (let i = 0; i < 9; ++i) await store.saveNamedDraft(`Filler ${i}`, content);
  await assert.rejects(store.restoreNamedDraft(saved.id, 'Another copy'), code('limit'));
});

test('draft content/name validation, duplicate names and replacement revisions fail before overwrite', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  const saved = await store.saveNamedDraft('  Holiday  ', content); assert.equal(saved.name, 'Holiday');
  await assert.rejects(store.saveNamedDraft('holiday', content), f.model.OwnerValidationError);
  for (const options of [{ id: saved.id }, { id: saved.id, expectedRevision: -1 }, { expectedRevision: 1 }, { id: '../published', expectedRevision: 1 }]) await assert.rejects(store.saveNamedDraft('Bad', content, options), f.model.OwnerValidationError);
  for (const name of ['', '   ', 'a'.repeat(81), 'bad\nname']) await assert.rejects(store.saveNamedDraft(name, content), f.model.OwnerValidationError);
  const commits = f.stats().commits; content.site.showPremades = 'not a bool';
  await assert.rejects(store.saveNamedDraft('Invalid content', content), f.model.OwnerValidationError); assert.equal(f.stats().commits, commits);
});

test('named saves snapshot form content before async authentication', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  content.home.title = 'Snapshot'; const pending = store.saveNamedDraft('Snapshot', content); content.home.title = 'Later form change';
  const saved = await pending; assert.equal(saved.content.home.title, 'Snapshot');
  saved.content.home.title = 'Mutated return'; assert.equal((await store.loadNamedDraft(saved.id)).content.home.title, 'Snapshot');
});

test('failed commits, corrupt registry and orphan identifiers never reset/overwrite saved content', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  const saved = await store.saveNamedDraft('Safe', content), before = structuredClone(f.documents);
  f.failWrite({ code: 'unavailable' });
  await assert.rejects(store.deleteNamedDraft(saved.id, 1), code('write')); assert.deepEqual(f.documents, before);
  f.failWrite(undefined);
  f.documents.set('ownerDraftIndex/current', { schemaVersion: 1, revision: 1, drafts: { missing: 1 }, changedDraftId: 'missing' });
  const corrupt = structuredClone(f.documents);
  await assert.rejects(store.listNamedDrafts(), code('corrupt'));
  await assert.rejects(store.saveNamedDraft('Never', content), code('corrupt')); assert.deepEqual(f.documents, corrupt);
});

test('sign-out, wrong UID and replaced sessions block named and shop APIs', async () => {
  for (const replacement of [null, { uid: 'stranger' }, { uid: 'owner' }]) {
    const f = fixture(), store = f.store(); f.auth.currentUser = replacement;
    for (const action of [() => store.listNamedDrafts(), () => store.listTrashedNamedDrafts(), () => store.saveNamedDraft('No', f.defaults.createDefaultOwnerContent()), () => store.readLiveShopVisibility(), () => store.updateLiveShopVisibility(true, 0)]) await assert.rejects(action(), code('unavailable'));
    assert.deepEqual(f.stats(), { reads: 0, commits: 0 });
  }
});

test('Update Live requires first publication and changes only the actual published shop flag', async () => {
  const f = fixture(), store = f.store(), original = f.defaults.createDefaultOwnerContent();
  assert.equal(await store.readLiveShopVisibility(), null);
  await assert.rejects(store.updateLiveShopVisibility(true, 0), code('not-published')); assert.equal(f.stats().commits, 0);
  original.premades = [premade()]; original.site.showPremades = true; original.home.title = 'Published title';
  let workspace = await store.publishLive(original, 0);
  const beforePublic = f.cloud.decodePublishedOwnerSnapshot(f.documents.get('site/published'));
  const editing = structuredClone(original); editing.home.title = 'PRIVATE unfinished title'; editing.prices.parts[0].price = 999;
  editing.premades[0].name = 'PRIVATE unfinished product';
  workspace = await store.saveDraft(editing, workspace.revision);
  const beforeWorking = structuredClone(workspace.draft);
  workspace = await store.updateLiveShopVisibility(false, workspace.revision);
  assert.equal(await store.readLiveShopVisibility(), false); assert.deepEqual(workspace.draft, beforeWorking);
  const hidden = f.cloud.decodePublishedOwnerSnapshot(f.documents.get('site/published'));
  assert.deepEqual(hidden.content, { ...beforePublic.content, site: { ...beforePublic.content.site, showPremades: false } });
  workspace = await store.updateLiveShopVisibility(true, workspace.revision);
  assert.deepEqual(f.cloud.decodePublishedOwnerSnapshot(f.documents.get('site/published')).content, beforePublic.content);
  await assert.rejects(store.updateLiveShopVisibility(false, workspace.revision - 1), code('conflict'));
});

test('multiple-photo validation preserves cover and blocks private or malformed public sources', () => {
  const f = fixture(), content = f.defaults.createDefaultOwnerContent(), item = premade(); content.premades = [item];
  content.site.showPremades = true;
  item.photos = [{ id: 'front', src: '/api/media/123e4567-e89b-12d3-a456-426614174000', alt: 'Front' }, { id: 'back', src: '/images/back.jpg', alt: 'Back' }];
  item.coverPhotoId = 'front'; item.image = item.photos[0].src; item.alt = 'Front';
  f.model.assertOwnerContent(content);
  const published = f.model.createPublishedOwnerSnapshot(content, 1); assert.deepEqual(published.content.premades[0].photos, item.photos);
  item.coverPhotoId = 'missing'; assert.throws(() => f.model.assertOwnerContent(content), f.model.OwnerValidationError);
  item.coverPhotoId = 'front'; item.photos[1].src = 'data:image/png;base64,aGVsbG8=';
  f.model.assertOwnerContent(content); assert.throws(() => f.model.createPublishedOwnerSnapshot(content, 1), f.model.OwnerValidationError);
  for (const source of ['/api/media/../secret', '/api/media/123e4567-e89b-12d3-a456-426614174000?token=secret', 'javascript:alert(1)']) assert.equal(f.model.isSafeImageSource(source), false);
});


test('permission-denied races are conflicts only after validated revision change, with no write retry', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  const saved = await store.saveNamedDraft('Race', content);
  f.failWrite({ code: 'permission-denied' });
  await assert.rejects(store.renameNamedDraft(saved.id, 'Not saved', 1), code('write'));
  assert.equal(f.stats().commits, 1);
  f.failWrite(() => {
    const concurrent = { ...saved, name: 'Another device', revision: 2 };
    f.documents.set(`ownerDrafts/${saved.id}`, f.cloud.encodeOwnerNamedDraft(concurrent));
    f.documents.set('ownerDraftIndex/current', { schemaVersion: 1, revision: 2, drafts: { [saved.id]: 2 }, changedDraftId: saved.id });
    return { code: 'permission-denied' };
  });
  await assert.rejects(store.renameNamedDraft(saved.id, 'Stale rename', 1), code('conflict'));
  assert.equal(f.stats().commits, 1);
  assert.equal((await store.loadNamedDraft(saved.id)).name, 'Another device');
});
