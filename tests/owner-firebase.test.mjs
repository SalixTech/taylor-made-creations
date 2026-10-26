import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// All Firebase imports are mocked before evaluation. These tests never make a
// Firebase request, initialize the real SDK, or touch a real project/account.
const root = fileURLToPath(new URL('../src/', import.meta.url));
function fixture() {
  let raw = null, readError = null, writeError = null, beforeRead = null, afterRead = null, retryDocument;
  let reads = 0, commits = 0, appInitializations = 0, authInitializations = 0;
  let publicRaw = null, publicAssetsRaw = null;
  const cloudFiles = new Map();
  const user = { uid: 'owner-uid', email: 'owner@example.test', reload: async () => {}, getIdToken: async () => 'mock-token' };
  const auth = { currentUser: user };
  const db = {};
  const appMocks = { getApps: () => [], initializeApp: options => { ++appInitializations; return { name: 'tmc-private-owner', options }; } };
  const authMocks = { browserSessionPersistence: { type: 'SESSION' }, initializeAuth: (_app, options) => { ++authInitializations; assert.equal(options.persistence.type, 'SESSION'); return auth; } };
  const snapshot = value => ({ exists: () => value !== null, data: () => structuredClone(value) });
  const liteMocks = {
    getFirestore: () => db,
    doc: (actualDb, ...parts) => { const path = parts.join('/'); assert.equal(actualDb, db); assert.ok(['ownerWorkspace/current', 'site/published', 'site/publishedAssets'].includes(path) || /^ownerFiles\/[a-f0-9-]{36}$/.test(path)); return { path }; },
    getDoc: async () => { ++reads; await beforeRead?.(); if (readError) throw readError; const result = snapshot(raw); await afterRead?.(); return result; },
    runTransaction: async (_db, transform) => {
      let pending = new Map();
      const transaction = {
        get: async ref => { ++reads; await beforeRead?.(); if (readError) throw readError; const result = snapshot(ref.path === 'site/published' ? publicRaw : ref.path === 'site/publishedAssets' ? publicAssetsRaw : ref.path.startsWith('ownerFiles/') ? cloudFiles.get(ref.path.slice(11)) ?? null : raw); await afterRead?.(); return result; },
        set: (ref, data) => { pending.set(ref.path, structuredClone(data)); },
      };
      let result = await transform(transaction);
      if (retryDocument !== undefined) { raw = structuredClone(retryDocument); retryDocument = undefined; pending = new Map(); result = await transform(transaction); }
      if (writeError) throw typeof writeError === 'function' ? writeError() : writeError;
      if (pending.size) { if (pending.has('ownerWorkspace/current')) raw = pending.get('ownerWorkspace/current'); if (pending.has('site/published')) publicRaw = pending.get('site/published'); if (pending.has('site/publishedAssets')) publicAssetsRaw = pending.get('site/publishedAssets'); ++commits; }
      return result;
    },
  };
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (!extname(path)) path += '.ts';
    if (cache.has(path)) return cache.get(path).exports;
    const compiledModule = { exports: {} }; cache.set(path, compiledModule);
    const source = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) { compiledModule.exports = JSON.parse(source); return compiledModule.exports; }
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const require = name => name === 'firebase/app' ? appMocks : name === 'firebase/auth' ? authMocks : name === 'firebase/firestore/lite' ? liteMocks : name.startsWith('.') ? load(resolve(dirname(path), name)) : (() => { throw new Error(`Unexpected import ${name}`); })();
    new Function('require', 'module', 'exports', output)(require, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  const storeModule = load(resolve(root, 'owner/firebase-store.ts'));
  const client = load(resolve(root, 'owner/firebase-client.ts'));
  const defaults = load(resolve(root, 'owner/defaults.ts'));
  const model = load(resolve(root, 'owner/model.ts'));
  return {
    storeModule, client, defaults, model, user, auth, db,
    store: () => storeModule.createFirebaseOwnerStore({ db, auth, ownerUid: 'owner-uid' }),
    state: () => ({ raw: structuredClone(raw), reads, commits, appInitializations, authInitializations }),
    raw: value => { raw = structuredClone(value); },
    publicRaw: () => structuredClone(publicRaw),
    publicAssetsRaw: () => structuredClone(publicAssetsRaw),
    cloudFile: (id, value) => cloudFiles.set(id, structuredClone(value)),
    setPublicRaw: value => { publicRaw = structuredClone(value); },
    readError: value => { readError = value; }, writeError: value => { writeError = value; },
    beforeRead: value => { beforeRead = value; }, afterRead: value => { afterRead = value; }, retryDocument: value => { retryDocument = value; },
  };
}
const validEnvironment = {
  apiKey: 'AIza' + 'a'.repeat(35), authDomain: 'taylor-made-creations.firebaseapp.com', projectId: 'taylor-made-creations',
  storageBucket: 'taylor-made-creations.firebasestorage.app', messagingSenderId: '419542649730',
  appId: '1:419542649730:web:44fcea3e91247c36429d9b', ownerUid: 'owner-uid',
};

test('Firebase config fails closed for every missing field and placeholders', () => {
  const { client, state } = fixture();
  assert.equal(client.readOwnerFirebaseConfig(validEnvironment).status, 'ready');
  for (const key of Object.keys(validEnvironment)) {
    assert.equal(client.readOwnerFirebaseConfig({ ...validEnvironment, [key]: undefined }).status, 'missing');
    assert.equal(client.readOwnerFirebaseConfig({ ...validEnvironment, [key]: 'REDACTED' }).status, 'invalid');
    assert.equal(client.readOwnerFirebaseConfig({ ...validEnvironment, [key]: ' ' + validEnvironment[key] }).status, 'invalid');
  }
  assert.equal(state().appInitializations, 0); assert.equal(state().authInitializations, 0);
});
test('owner verification rejects wrong UID before any account verification', async () => {
  const f = fixture(); let calls = 0;
  const wrong = { ...f.user, uid: 'someone-else', reload: async () => { ++calls; } };
  await assert.rejects(f.client.verifyOwnerSession({ auth: f.auth, db: f.db, ownerUid: 'owner-uid' }, wrong), error => error.code === 'denied');
  assert.equal(calls, 0);
});
test('owner verification waits for server reload and forced token refresh', async () => {
  const f = fixture(), calls = [];
  f.user.reload = async () => { calls.push('reload'); };
  f.user.getIdToken = async force => { assert.equal(force, true); calls.push('token'); return 'mock'; };
  await f.client.verifyOwnerSession({ auth: f.auth, db: f.db, ownerUid: 'owner-uid' }, f.user);
  assert.deepEqual(calls, ['reload', 'token']);
});
test('async verification cannot grant access to a replaced or signed-out session', async () => {
  for (const replacement of [null, { uid: 'owner-uid' }, { uid: 'wrong' }]) {
    const f = fixture(); f.user.getIdToken = async () => { f.auth.currentUser = replacement; return 'mock'; };
    await assert.rejects(f.client.verifyOwnerSession({ auth: f.auth, db: f.db, ownerUid: 'owner-uid' }, f.user), error => error.code === 'expired');
  }
});
test('an empty cloud document loads defaults without writing or opening IndexedDB', async () => {
  const f = fixture(); const initial = await f.store().load();
  assert.equal(initial.revision, 0); assert.equal(initial.updatedAt, null); assert.equal(initial.localPublished, null);
  assert.deepEqual(f.state(), { raw: null, reads: 1, commits: 0, appInitializations: 0, authInitializations: 0 });
});
test('cloud draft and private preview commit explicit independent snapshots', async () => {
  const f = fixture(), store = f.store();
  let state = await store.load(); state.draft.home.title = 'Cloud title';
  state = await store.saveDraft(state.draft, 0); assert.equal(state.revision, 1); assert.equal(state.localPublished, null);
  assert.deepEqual(Object.keys(f.state().raw).sort(), ['payload', 'revision', 'schemaVersion']);
  state = await store.publishLocal(1); assert.equal(state.revision, 2); assert.equal(state.localPublished.content.home.title, 'Cloud title');
  state.draft.home.title = 'Later draft'; state = await store.saveDraft(state.draft, 2);
  assert.equal(state.localPublished.content.home.title, 'Cloud title');
  state = await store.resetDraft(3); assert.equal(state.draft.home.title, 'Cloud title');
  assert.equal(f.state().commits, 4);
});
test('stale revision cannot overwrite cloud content on any write operation', async () => {
  const f = fixture(), store = f.store();
  await store.saveDraft(f.defaults.createDefaultOwnerContent(), 0);
  for (const operation of [() => store.saveDraft(f.defaults.createDefaultOwnerContent(), 0), () => store.publishLocal(0), () => store.resetDraft(0)]) {
    await assert.rejects(operation(), error => error.code === 'conflict' && /device/.test(error.message));
  }
  assert.equal(f.state().commits, 1);
});
test('invalid, malformed and mismatched wrappers remain untouched', async () => {
  const f = fixture(), baseline = f.defaults.createInitialOwnerWorkspace(); baseline.revision = 1;
  const encoded = f.storeModule.encodeOwnerWorkspace(baseline);
  const invalid = [ {}, { ...encoded, extra: true }, { ...encoded, revision: 2 }, { ...encoded, payload: '{bad json' }, { ...encoded, schemaVersion: 2 }, { ...encoded, payload: JSON.stringify({ ...baseline, draft: {} }) }, { ...encoded, payload: 'a'.repeat(700001) } ];
  for (const raw of invalid) {
    f.raw(raw); const store = f.store();
    await assert.rejects(store.load(), error => error.code === 'corrupt');
    await assert.rejects(store.saveDraft(f.defaults.createDefaultOwnerContent(), 0), error => error.code === 'corrupt');
    assert.deepEqual(f.state().raw, raw);
  }
  assert.equal(f.state().commits, 0);
});
test('draft+preview total UTF-8 size is checked before any commit', async () => {
  const f = fixture(), store = f.store();
  const content = f.defaults.createDefaultOwnerContent();
  content.home.image.src = 'data:image/png;base64,' + 'a'.repeat(360000);
  const saved = await store.saveDraft(content, 0); assert.equal(saved.revision, 1);
  await assert.rejects(store.publishLocal(1), error => error instanceof f.model.OwnerValidationError && /both draft and private preview/.test(error.message));
  assert.equal(f.state().commits, 1); assert.equal((await store.load()).localPublished, null);
  const multibyte = f.defaults.createInitialOwnerWorkspace(); multibyte.revision = 1;
  multibyte.draft.home.image.src = content.home.image.src; multibyte.localPublished = { content: structuredClone(multibyte.draft), publishedAt: new Date().toISOString() };
  await assert.rejects(Promise.resolve().then(() => f.storeModule.encodeOwnerWorkspace(multibyte)), f.model.OwnerValidationError);
});
test('missing auth, wrong UID and disposed stores never read or write documents', async () => {
  for (const mode of ['signed-out', 'wrong', 'disposed']) {
    const f = fixture(), store = f.store();
    if (mode === 'signed-out') f.auth.currentUser = null;
    if (mode === 'wrong') f.auth.currentUser = { ...f.user, uid: 'wrong' };
    if (mode === 'disposed') store.dispose();
    await assert.rejects(store.load(), error => error.code === 'unavailable');
    await assert.rejects(store.saveDraft(f.defaults.createDefaultOwnerContent(), 0), error => error.code === 'unavailable');
    assert.equal(f.state().reads, 0); assert.equal(f.state().commits, 0);
  }
});
test('sign-out during pending read or transaction prevents returning private state or commit', async () => {
  for (const write of [false, true]) {
    const f = fixture(), store = f.store();
    f.afterRead(() => { store.dispose(); f.auth.currentUser = null; });
    await assert.rejects(write ? store.saveDraft(f.defaults.createDefaultOwnerContent(), 0) : store.load(), error => error.code === 'unavailable');
    assert.equal(f.state().commits, 0);
  }
});
test('permission/network failure is explicit and never falls back or marks a failed save successful', async () => {
  const f = fixture(), store = f.store();
  f.readError({ code: 'permission-denied' });
  await assert.rejects(store.load(), error => error.code === 'read' && /owner-only Firestore rules/.test(error.message));
  assert.equal(f.state().commits, 0);
  f.readError({ code: 'unavailable' });
  await assert.rejects(store.load(), error => error.code === 'read' && /No browser-local copy/.test(error.message));
  f.readError(null); f.writeError({ code: 'unavailable' });
  await assert.rejects(store.saveDraft(f.defaults.createDefaultOwnerContent(), 0), error => error.code === 'write' && /not confirmed/.test(error.message));
  assert.equal(f.state().commits, 0); assert.equal(f.state().raw, null);
});
test('input is snapshotted before asynchronous cloud calls and invalid content never touches cloud', async () => {
  const f = fixture(), store = f.store(), content = f.defaults.createDefaultOwnerContent();
  content.home.title = 'Requested snapshot';
  const pending = store.saveDraft(content, 0); content.home.title = 'Later edit';
  assert.equal((await pending).draft.home.title, 'Requested snapshot');
  content.prices.parts[0].price = -5;
  const before = f.state();
  await assert.rejects(store.saveDraft(content, 1), f.model.OwnerValidationError);
  assert.equal(f.state().reads, before.reads); assert.equal(f.state().commits, before.commits);
});


test('transaction retry rechecks revision instead of overwriting a concurrent writer', async () => {
  const f = fixture(), store = f.store();
  const concurrent = f.defaults.createInitialOwnerWorkspace(); concurrent.revision = 1; concurrent.draft.home.title = 'Another device saved this';
  f.retryDocument(f.storeModule.encodeOwnerWorkspace(concurrent));
  const draft = f.defaults.createDefaultOwnerContent(); draft.home.title = 'Stale current editor';
  await assert.rejects(store.saveDraft(draft, 0), error => error.code === 'conflict');
  assert.equal(f.state().commits, 0);
  assert.equal(f.storeModule.decodeOwnerWorkspace(f.state().raw).draft.home.title, 'Another device saved this');
});
test('UTF-8 limit counts multibyte text rather than JavaScript string length', () => {
  const f = fixture(), state = f.defaults.createInitialOwnerWorkspace(); state.revision = 1;
  state.draft.pages[0].blocks = Array.from({length: 12}, (_, i) => ({ id: 'utf8-' + i, type: 'text', heading: '', body: '€'.repeat(20000) }));
  f.model.assertOwnerWorkspace(state);
  assert.ok(JSON.stringify(state).length < f.storeModule.MAX_OWNER_CLOUD_BYTES);
  assert.throws(() => f.storeModule.encodeOwnerWorkspace(state), f.model.OwnerValidationError);
});
test('token failure or a same-UID replacement session invalidates the old store', async () => {
  for (const point of ['token', 'read', 'transaction']) {
    const f = fixture(), store = f.store();
    const replace = () => { f.auth.currentUser = { ...f.user }; };
    if (point === 'token') f.user.getIdToken = async () => { replace(); return 'mock'; };
    else f.afterRead(replace);
    await assert.rejects(point === 'transaction' ? store.saveDraft(f.defaults.createDefaultOwnerContent(), 0) : store.load(), error => error.code === 'unavailable');
    assert.equal(f.state().commits, 0);
  }
  const f = fixture(), store = f.store();
  f.user.getIdToken = async () => { throw { code: 'auth/user-token-expired' }; };
  await assert.rejects(store.load(), error => error.code === 'read');
  assert.equal(f.state().reads, 0);
});
test('only explicitly saved workspaces can be encoded for a cloud document', () => {
  const f = fixture();
  assert.throws(() => f.storeModule.encodeOwnerWorkspace(f.defaults.createInitialOwnerWorkspace()), f.model.OwnerValidationError);
});

test('only explicit live publish commits a separate public snapshot atomically', async () => {
  const f=fixture(),store=f.store();
  let state=await store.saveDraft(f.defaults.createDefaultOwnerContent(),0);
  assert.equal(f.publicRaw(),null);
  state=await store.publishLocal(state.revision);
  assert.equal(f.publicRaw(),null);
  const previousPreview=structuredClone(state.localPublished);
  const content=structuredClone(state.draft);
  content.home.title='Published title';content.gallery[0].visible=false;
  const trashed=f.model.trashPage(content,'builtin-terms');
  state=await store.publishLive(trashed,state.revision);
  assert.equal(state.revision,3);assert.equal(f.state().commits,3);
  assert.deepEqual(f.publicAssetsRaw(), { schemaVersion: 1, revision: 3, ids: [] });
  assert.deepEqual(state.localPublished,previousPreview,'private preview is not replaced by live publication');
  const published=f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());
  assert.equal(published.revision,state.revision);assert.equal(published.publishedAt,state.updatedAt);
  assert.equal(published.content.home.title,'Published title');
  assert.equal(published.content.gallery.length,11);
  assert.equal(published.content.pages.some(page=>page.builtinKey==='terms'),false);
  assert.equal('draft' in published,false);assert.equal('localPublished' in published,false);
  assert.equal('trashedAt' in published.content.pages[0],false);
  state.draft.home.title='Private later edit';
  state=await store.saveDraft(state.draft,state.revision);
  assert.deepEqual(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()),published);
  await store.resetDraft(state.revision);
  assert.deepEqual(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()),published);
});
test('live publish snapshots unsaved edits and can explicitly publish the saved draft', async () => {
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
  content.home.title='Clicked publish';
  const pending=store.publishLive(content,0);content.home.title='Typed later';
  const state=await pending;
  assert.equal(state.draft.home.title,'Clicked publish');
  assert.equal(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()).content.home.title,'Clicked publish');
  const next=await store.publishLive(undefined,state.revision);
  assert.equal(next.revision,2);assert.equal(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()).revision,2);
});
test('live publish failure, conflict and retry never partially commit either document', async () => {
  for(const mode of ['network','stale','retry','session','data-image','corrupt']){
    const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
    await store.publishLive(content,0);
    const beforePrivate=f.state().raw,beforePublic=f.publicRaw(),beforeAssets=f.publicAssetsRaw();
    if(mode==='network')f.writeError({code:'unavailable'});
    if(mode==='session')f.afterRead(()=>{f.auth.currentUser=null;});
    if(mode==='data-image')content.home.image.src='data:image/png;base64,aGVsbG8=';
    if(mode==='corrupt')f.raw({...beforePrivate,payload:'broken'});
    if(mode==='retry'){
      const concurrent=f.storeModule.decodeOwnerWorkspace(beforePrivate);concurrent.revision=2;concurrent.draft.home.title='Concurrent draft';
      f.retryDocument(f.storeModule.encodeOwnerWorkspace(concurrent));
    }
    await assert.rejects(store.publishLive(content,mode==='stale'?0:1));
    assert.deepEqual(f.publicRaw(),beforePublic,mode);
    assert.deepEqual(f.publicAssetsRaw(),beforeAssets,mode);
    assert.equal(f.state().commits,1,mode);
    if(!['corrupt','retry'].includes(mode))assert.deepEqual(f.state().raw,beforePrivate,mode);
  }
});
test('public wrapper decoder rejects revisions, unknown fields and private data',()=>{
  const f=fixture();
  const snapshot=f.model.createPublishedOwnerSnapshot(f.defaults.createDefaultOwnerContent(),2,'2026-10-25T12:00:00.000Z');
  const encoded=f.storeModule.encodePublishedOwnerSnapshot(snapshot);
  assert.deepEqual(f.storeModule.decodePublishedOwnerSnapshot(encoded),snapshot);
  const privatePayload=structuredClone(snapshot);privatePayload.content.pages[0].trashedAt=null;
  for(const raw of [{}, {...encoded,extra:1}, {...encoded,revision:1}, {...encoded,schemaVersion:2}, {...encoded,payload:'{'}, {...encoded,payload:'a'.repeat(700001)}, {...encoded,payload:JSON.stringify(privatePayload)}]){
    assert.throws(()=>f.storeModule.decodePublishedOwnerSnapshot(raw),error=>error.code==='corrupt');
  }
});
test('live publication validates invalid content before any network access',async()=>{
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
  content.prices.parts[0].price=-1;
  await assert.rejects(store.publishLive(content,0),f.model.OwnerValidationError);
  assert.equal(f.state().reads,0);assert.equal(f.state().commits,0);assert.equal(f.publicRaw(),null);
});

test('publication refuses corrupted or ahead-of-workspace public state without overwriting',async()=>{
  for(const mode of ['corrupt','ahead']){
    const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
    await store.publishLive(content,0);
    if(mode==='corrupt')f.setPublicRaw({...f.publicRaw(),payload:'broken'});
    else f.setPublicRaw(f.storeModule.encodePublishedOwnerSnapshot(f.model.createPublishedOwnerSnapshot(content,2)));
    const beforePrivate=f.state().raw,beforePublic=f.publicRaw();
    await assert.rejects(store.publishLive(content,1),error=>error.code==='corrupt');
    assert.deepEqual(f.state().raw,beforePrivate);assert.deepEqual(f.publicRaw(),beforePublic);assert.equal(f.state().commits,1);
  }
});
test('a failed public transaction read never queues a private draft save',async()=>{
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
  f.afterRead(()=>{f.readError({code:'permission-denied'});});
  await assert.rejects(store.publishLive(content,0),error=>error.code==='write');
  assert.equal(f.state().raw,null);assert.equal(f.publicRaw(),null);assert.equal(f.state().commits,0);
});

test('permission failure is classified as conflict only after a validated server revision change',async()=>{
  for(const mode of ['changed','unchanged','corrupt','read-denied']){
    const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
    const saved=await store.publishLive(content,0),beforePublic=f.publicRaw();
    f.writeError(()=>{
      if(mode==='changed'){
        const concurrent=structuredClone(saved);concurrent.revision=2;concurrent.draft.home.title='Other device';
        f.raw(f.storeModule.encodeOwnerWorkspace(concurrent));
      }
      if(mode==='corrupt')f.raw({schemaVersion:1,revision:2,payload:'invalid'});
      if(mode==='read-denied')f.readError({code:'permission-denied'});
      return {code:'permission-denied'};
    });
    await assert.rejects(store.publishLive(content,1),error=>error.code===(mode==='changed'?'conflict':'write'));
    assert.deepEqual(f.publicRaw(),beforePublic);assert.equal(f.state().commits,1);
  }
});

test('selective premade publication changes only selected saved and public listing', async () => {
  const f = fixture(), store = f.store(), draft = f.defaults.createDefaultOwnerContent();
  draft.site.showPremades = true;
  const product = (id, name) => ({ id, name, image: '/images/home-collage.webp', alt: name, description: name, price: 12.34, visible: true, soldChannel: 'tmc' });
  draft.premades = [product('one', 'Public one'), product('two', 'Public two')];
  const live = await store.publishLive(draft, 0);
  const privateDraft = structuredClone(live.draft);
  privateDraft.home.title = 'PRIVATE HOMEPAGE';
  privateDraft.premades[1].name = 'PRIVATE OTHER PRODUCT';
  privateDraft.home.image.src = 'data:image/png;base64,aGVsbG8=';
  const saved = await store.saveDraft(privateDraft, live.revision);
  const item = { ...saved.draft.premades[0], name: 'Selected live update', soldChannel: 'third-party', externalUrl: 'https://example.test/listing' };
  const beforePublic = f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());
  const pending = store.publishPremadeLive(item, saved.revision);
  item.name = 'RACE SHOULD NOT LEAK';
  const next = await pending;
  const published = f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());
  assert.equal(next.draft.home.title, 'PRIVATE HOMEPAGE');
  assert.equal(next.draft.premades[1].name, 'PRIVATE OTHER PRODUCT');
  assert.equal(next.draft.premades[0].name, 'Selected live update');
  assert.equal(published.content.premades[0].name, 'Selected live update');
  assert.deepEqual(published.content.premades[1], beforePublic.content.premades[1]);
  assert.deepEqual(published.content.home, beforePublic.content.home);
  assert.deepEqual(published.content.site, beforePublic.content.site);
  assert.deepEqual(published.content.pages, beforePublic.content.pages);
  assert.equal(JSON.stringify(published).includes('PRIVATE'), false);
  assert.equal(published.revision, next.revision);
});

test('selective publication requires initial publication and rejects invalid or invisible listing atomically', async () => {
  const f = fixture(), store = f.store();
  const item = { id: 'selected', name: 'Selected', image: '/images/home-collage.webp', alt: 'Selected', description: '', price: 2, visible: true };
  await assert.rejects(store.publishPremadeLive(item, 0), error => error.code === 'not-published');
  assert.equal(f.state().commits, 0);
  const current = await store.publishLive(undefined, 0);
  const before = f.state().raw, beforePublic = f.publicRaw();
  for (const invalid of [{ ...item, visible: false }, { ...item, soldChannel: 'third-party', externalUrl: 'javascript:alert(1)' }, { ...item, image: 'data:image/png;base64,aGVsbG8=' }, { ...item, price: -1 }]) {
    await assert.rejects(store.publishPremadeLive(invalid, current.revision));
    assert.deepEqual(f.state().raw, before); assert.deepEqual(f.publicRaw(), beforePublic);
  }
  const next = await store.publishPremadeLive(item, current.revision);
  assert.equal(next.draft.premades.length, 1);
  assert.equal(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()).content.site.showPremades, current.draft.site.showPremades);
});

test('selective publication rejects stale revisions, transaction races and failures without partial changes', async () => {
  for (const scenario of ['stale', 'retry', 'denied']) {
    const f = fixture(), store = f.store(), current = await store.publishLive(undefined, 0);
    const before = f.state().raw, beforePublic = f.publicRaw();
    const item = { id: 'selected', name: 'Selected', image: '/images/home-collage.webp', alt: 'Selected', description: '', price: 2, visible: true };
    if (scenario === 'retry') {
      const concurrent = structuredClone(current); concurrent.revision++; concurrent.updatedAt = '2026-10-25T22:00:00.000Z';
      f.retryDocument(f.storeModule.encodeOwnerWorkspace(concurrent));
    }
    if (scenario === 'denied') f.writeError({ code: 'permission-denied' });
    await assert.rejects(store.publishPremadeLive(item, scenario === 'stale' ? 0 : current.revision));
    assert.deepEqual(f.publicRaw(), beforePublic);
    if (scenario !== 'retry') assert.deepEqual(f.state().raw, before);
    assert.equal(f.state().commits, 1);
  }
});


test('public photo index is projected from visible published content and selective publish never exposes other draft photos', async () => {
  const f = fixture(), store = f.store(), draft = f.defaults.createDefaultOwnerContent();
  const id = '11111111-1111-4111-8111-111111111111';
  const privateId = '22222222-2222-4222-8222-222222222222';
  const selectedId = '33333333-3333-4333-8333-333333333333';
  const source = value => `/api/cloud-media/${value}`;
  for (const value of [id, privateId, selectedId]) f.cloudFile(value, {schemaVersion:1,revision:2,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status:'ready',trashedAt:null,createdAt:'2026-10-26T15:00:00.000Z',updatedAt:'2026-10-26T15:00:00.000Z'});
  draft.home.image.src = source(id);
  draft.gallery[0].src = source(privateId); draft.gallery[0].visible = false;
  draft.site.showPremades = true;
  draft.premades = [{id:'selected',name:'Product',image:source(id),alt:'Product',description:'',price:12,visible:true}];
  const live = await store.publishLive(draft, 0);
  assert.deepEqual(f.publicAssetsRaw(), {schemaVersion:1,revision:live.revision,ids:[id]});
  const later = structuredClone(live.draft); later.home.image.src = source(privateId);
  const saved = await store.saveDraft(later, live.revision);
  assert.deepEqual(f.publicAssetsRaw(), {schemaVersion:1,revision:live.revision,ids:[id]});
  const selected = {...saved.draft.premades[0],image:source(selectedId)};
  const next = await store.publishPremadeLive(selected, saved.revision);
  assert.deepEqual(f.publicAssetsRaw(), {schemaVersion:1,revision:next.revision,ids:[id,selectedId]});
});

test('settings Save live atomically changes only selected card in private and public documents', async () => {
  const f = fixture(), store = f.store();
  const original = f.defaults.createDefaultOwnerContent();
  const saved = await store.saveDraft(original, 0);
  await store.publishLive(undefined, saved.revision);
  const current = await store.load();
  const edited = structuredClone(current.draft);
  edited.site.name = 'Card only'; edited.home.title = 'PRIVATE HOME'; edited.gallery = [];
  const result = await store.publishSettingsCardLive(edited, 'business', current.revision);
  const live = f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());
  assert.equal(result.draft.site.name, 'Card only'); assert.equal(live.content.site.name, 'Card only');
  assert.equal(result.draft.home.title, original.home.title); assert.equal(live.content.home.title, original.home.title);
  assert.deepEqual(result.draft.gallery, original.gallery); assert.equal(live.content.gallery.length, original.gallery.filter(item => item.visible).length);
  assert.equal(live.revision, result.revision); assert.equal(f.publicAssetsRaw().revision,result.revision);
});
test('settings Save live requires existing publication and rejects stale revision or invalid card without partial writes', async () => {
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
  await store.saveDraft(content,0);const before=f.state().commits;
  await assert.rejects(store.publishSettingsCardLive(content,'business',1));assert.equal(f.state().commits,before);assert.equal(f.publicRaw(),null);
  await store.publishLive(undefined,1);const current=await store.load(),commits=f.state().commits;
  await assert.rejects(store.publishSettingsCardLive(content,'contacts',1));
  const bad=structuredClone(content);bad.site.name='';await assert.rejects(store.publishSettingsCardLive(bad,'business',current.revision));
  assert.equal(f.state().commits,commits);
});
test('settings Save live rejects sign-out during reads and never publishes unrelated dirty cards',async()=>{
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();await store.saveDraft(content,0);await store.publishLive(undefined,1);
  const current=await store.load(),before=f.state().commits;
  f.afterRead(()=>{f.auth.currentUser=null;});
  await assert.rejects(store.publishSettingsCardLive(content,'contacts',current.revision));assert.equal(f.state().commits,before);
});
test('settings live save preserves retained published inventory while shop is switched off',async()=>{
  const f=fixture(),store=f.store(),content=f.defaults.createDefaultOwnerContent();
  content.site.showPremades=true;content.premades=[{id:'retained',name:'Retained',image:'/images/heads.webp',alt:'Head',description:'Public listing',price:621,visible:true}];
  await store.saveDraft(content,0);await store.publishLive(undefined,1);await store.updateLiveShopVisibility(false,2);
  const before=f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());assert.equal(before.content.premades.length,1);
  const current=await store.load();const edited=structuredClone(current.draft);edited.site.name='Settings only';
  await store.publishSettingsCardLive(edited,'business',current.revision);
  const after=f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw());assert.equal(after.content.site.showPremades,false);assert.deepEqual(after.content.premades,before.content.premades);
  await store.updateLiveShopVisibility(true,after.revision);assert.deepEqual(f.storeModule.decodePublishedOwnerSnapshot(f.publicRaw()).content.premades,before.content.premades);
});
test('private draft save refuses newly referenced missing, uploading or deleting assets before any write',async()=>{
  for(const status of [null,'uploading','deleting']) {
    const f=fixture(),store=f.store(),draft=f.defaults.createDefaultOwnerContent(),id='44444444-4444-4444-8444-444444444444';
    await store.saveDraft(draft,0);const before=f.state().commits;
    if(status) f.cloudFile(id,{schemaVersion:1,revision:2,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status,trashedAt:status==='deleting'?'2026-10-26T15:00:00.000Z':null,createdAt:'2026-10-26T15:00:00.000Z',updatedAt:'2026-10-26T15:00:00.000Z'});
    draft.gallery[0].src=`/api/cloud-media/${id}`;
    await assert.rejects(store.saveDraft(draft,1),/missing, uploading, or being deleted/);assert.equal(f.state().commits,before);
  }
});
test('ready cloud assets in Trash can remain referenced by a private draft without deleting gallery entries',async()=>{
  const f=fixture(),store=f.store(),draft=f.defaults.createDefaultOwnerContent(),id='44444444-4444-4444-8444-444444444444';
  f.cloudFile(id,{schemaVersion:1,revision:2,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status:'ready',trashedAt:'2026-10-26T15:00:00.000Z',createdAt:'2026-10-26T15:00:00.000Z',updatedAt:'2026-10-26T15:00:00.000Z'});
  draft.gallery[0].src=`/api/cloud-media/${id}`;
  const saved=await store.saveDraft(draft,0);assert.deepEqual(saved.draft.gallery,draft.gallery);
  saved.draft.site.name='Unrelated name';const next=await store.saveDraft(saved.draft,1);assert.deepEqual(next.draft.gallery,draft.gallery);
});
