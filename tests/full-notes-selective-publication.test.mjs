import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';

// Independent two-document Firestore transaction double. No Firebase app, token,
// live project, network or storage SDK is initialized by these tests.
function fixture() {
  const documents = new Map(); let commitCount = 0, readCount = 0, writeError, onRead, retry;
  const db = {}, user = { uid: 'owner', getIdToken: async () => 'inert-qa-token' }, auth = { currentUser: user };
  const view = path => ({ exists: () => documents.has(path), data: () => structuredClone(documents.get(path)) });
  const api = {
    doc: (database, path) => { assert.equal(database, db); return { path }; },
    getDoc: async ref => { readCount++; return view(ref.path); },
    runTransaction: async (database, callback) => {
      assert.equal(database, db); let writes = new Map();
      const transaction = { get: async ref => { readCount++; await onRead?.(ref.path); return view(ref.path); }, set: (ref, data) => writes.set(ref.path, structuredClone(data)) };
      let value = await callback(transaction);
      if (retry) { retry(); retry = null; writes = new Map(); value = await callback(transaction); }
      if (writeError) throw writeError;
      if (writes.size) { for (const [path, data] of writes) documents.set(path, data); commitCount++; }
      return value;
    },
  };
  const load = sourceLoader({ 'firebase/firestore/lite': api });
  const fm = load('src/owner/firebase-store.ts'), defaults = load('src/owner/defaults.ts'), model = load('src/owner/model.ts');
  return { fm, defaults, model, auth, user, documents, store: fm.createFirebaseOwnerStore({ db, auth, ownerUid: user.uid }), state: () => ({ commitCount, readCount }), fail: error => writeError = error, onRead: callback => onRead = callback, retry: callback => retry = callback };
}
const item = changes => ({ id: 'selected', name: 'Selected', image: '/images/heads.webp', alt: 'Character', description: 'Selected live edit', price: 621, visible: true, ...changes });
async function setup() {
  const f = fixture(), live = f.defaults.createDefaultOwnerContent(); live.site.showPremades = true; live.premades = [item({ description: 'Original selected' }), item({ id: 'other', description: 'Untouched public product' })];
  let workspace = await f.store.publishLive(live, 0);
  workspace.draft.home.title = 'PRIVATE_DRAFT_HOME'; workspace.draft.site.name = 'PRIVATE_DRAFT_BRAND'; workspace.draft.site.catalogMode = true;
  workspace.draft.premades[1].description = 'PRIVATE_OTHER_PRODUCT'; workspace.draft.gallery[0].alt = 'PRIVATE_DRAFT_GALLERY';
  workspace.draft = f.model.createCustomPage(workspace.draft, { title: 'PRIVATE_PAGE', slug: 'private-draft-page' });
  workspace.draft.pages.at(-1).blocks = [{ id: 'secret', type: 'text', heading: 'PRIVATE_HEADING', body: 'PRIVATE_BODY' }];
  workspace = await f.store.saveDraft(workspace.draft, workspace.revision);
  return { ...f, workspace };
}

test('full notes: Publish to store atomically changes just selected item despite unrelated saved private edits', async () => {
  const f = await setup(), beforePublic = f.fm.decodePublishedOwnerSnapshot(f.documents.get('site/published')), beforePrivate = structuredClone(f.workspace);
  const next = await f.store.publishPremadeLive(item({ soldChannel: 'con', venue: 'Convention booth', badge: 'Sold at con' }), f.workspace.revision);
  const afterPublic = f.fm.decodePublishedOwnerSnapshot(f.documents.get('site/published'));
  assert.equal(next.revision, f.workspace.revision + 1); assert.equal(afterPublic.revision, next.revision);
  assert.doesNotMatch(JSON.stringify(afterPublic), /PRIVATE_/);
  assert.equal(afterPublic.content.premades[0].soldChannel, 'con'); assert.equal(afterPublic.content.premades[0].venue, 'Convention booth');
  const exceptSelected = snapshot => { const result = structuredClone(snapshot.content); result.premades = result.premades.filter(entry => entry.id !== 'selected'); return result; };
  assert.deepEqual(exceptSelected(afterPublic), exceptSelected(beforePublic));
  const exceptSelectedPrivate = workspace => { const draft = structuredClone(workspace.draft); draft.premades = draft.premades.filter(entry => entry.id !== 'selected'); return draft; };
  assert.deepEqual(exceptSelectedPrivate(next), exceptSelectedPrivate(beforePrivate));
  assert.deepEqual(next.localPublished, beforePrivate.localPublished);
});

test('full notes: item publish snapshots selection before auth awaits and never changes shop visibility', async () => {
  const f = await setup(); await f.store.updateLiveShopVisibility(false, f.workspace.revision);
  const workspace = await f.store.load(), selected = item({ soldChannel: 'tmc' });
  const result = f.store.publishPremadeLive(selected, workspace.revision); selected.name = 'LATE_MUTATION';
  await result;
  const published = f.fm.decodePublishedOwnerSnapshot(f.documents.get('site/published'));
  assert.equal(published.content.site.showPremades, false);
  assert.equal(published.content.premades.find(entry => entry.id === 'selected').name, 'Selected');
});

test('full notes: individual publication refuses first publication, stale revisions and invalid selected data without partial writes', async () => {
  const empty = fixture(); await assert.rejects(empty.store.publishPremadeLive(item(), 0), error => error.code === 'not-published'); assert.equal(empty.state().commitCount, 0);
  const f = await setup(), state = f.state(), before = structuredClone([...f.documents]);
  await assert.rejects(f.store.publishPremadeLive(item(), f.workspace.revision - 1), error => error.code === 'conflict');
  for (const bad of [item({ visible: false }), item({ price: -1 }), item({ soldChannel: 'third-party', externalUrl: 'javascript:alert(1)' }), item({ image: 'data:image/png;base64,AAAA' })]) await assert.rejects(f.store.publishPremadeLive(bad, f.workspace.revision));
  assert.equal(f.state().commitCount, state.commitCount); assert.deepEqual([...f.documents], before);
});

test('full notes: selective publish retries recheck workspace version instead of overwriting another device', async () => {
  const f = await setup(), changed = structuredClone(f.workspace); changed.revision++; changed.draft.home.title = 'OTHER_DEVICE';
  f.retry(() => f.documents.set('ownerWorkspace/current', f.fm.encodeOwnerWorkspace(changed)));
  const publicBefore = structuredClone(f.documents.get('site/published')), commits = f.state().commitCount;
  await assert.rejects(f.store.publishPremadeLive(item(), f.workspace.revision), error => error.code === 'conflict');
  assert.equal(f.state().commitCount, commits); assert.deepEqual(f.documents.get('site/published'), publicBefore);
  assert.equal((await f.store.load()).draft.home.title, 'OTHER_DEVICE');
});

test('full notes: auth expiry and transaction failure never report selected item as published', async () => {
  for (const mode of ['signed-out', 'replaced-session', 'write-failure']) {
    const f = await setup(), before = structuredClone([...f.documents]), commits = f.state().commitCount;
    if (mode === 'signed-out') f.auth.currentUser = null;
    if (mode === 'replaced-session') f.onRead(() => f.auth.currentUser = { ...f.user });
    if (mode === 'write-failure') f.fail({ code: 'unavailable' });
    await assert.rejects(f.store.publishPremadeLive(item(), f.workspace.revision));
    assert.equal(f.state().commitCount, commits); assert.deepEqual([...f.documents], before);
  }
});
