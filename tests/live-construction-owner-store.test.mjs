import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';

// SDK calls are isolated below. These tests never initialize Firebase or contact
// a real project, and seeded data exists only in this in-memory transaction mock.
function fixture() {
  const documents = new Map(), reads = [], writes = [];
  const db = {};
  let tokenCalls = 0, transactions = 0, commits = 0;
  const controls = { token: null, afterRead: null, beforeCommit: null, afterCommit: null, readError: null, writeError: null, retry: null };
  const user = { uid: 'owner-fixture', async getIdToken() { tokenCalls++; await controls.token?.(); return 'fixture-token'; } };
  const auth = { currentUser: user };
  const snapshot = value => ({ exists: () => value !== undefined, data: () => structuredClone(value) });
  async function get(ref) {
    reads.push(ref.path);
    if (controls.readError) throw controls.readError;
    const result = snapshot(documents.get(ref.path));
    await controls.afterRead?.(ref.path);
    return result;
  }
  const lite = {
    doc(actual, path) { assert.equal(actual, db); return { path }; },
    getDoc: get,
    async runTransaction(actual, callback) {
      assert.equal(actual, db); transactions++;
      let pending = new Map();
      const transaction = { get, set(ref, value) { pending.set(ref.path, structuredClone(value)); } };
      let result = await callback(transaction);
      if (controls.retry) {
        const retry = controls.retry; controls.retry = null;
        retry(); pending = new Map(); result = await callback(transaction);
      }
      await controls.beforeCommit?.();
      if (controls.writeError) throw controls.writeError;
      for (const [path, value] of pending) { documents.set(path, value); writes.push({ path, value: structuredClone(value) }); }
      if (pending.size) commits++;
      await controls.afterCommit?.();
      return result;
    },
  };
  const load = sourceLoader({ 'firebase/firestore/lite': lite, 'firebase/auth': {} });
  const backend = load('src/owner/firebase-store.ts');
  const access = load('src/owner/site-access.ts');
  const defaults = load('src/owner/defaults.ts');
  const model = load('src/owner/model.ts');
  const store = backend.createFirebaseOwnerStore({ db, auth, ownerUid: user.uid });
  function seedPublication() {
    const content = defaults.createDefaultOwnerContent();
    const published = model.createPublishedOwnerSnapshot(content, 7, '2026-10-25T00:00:00.000Z');
    documents.set('site/published', backend.encodePublishedOwnerSnapshot(published));
  }
  return { documents, reads, writes, db, auth, user, controls, backend, access, store, seedPublication,
    stats: () => ({ tokenCalls, transactions, commits }) };
}
const setting = (constructionMode, revision = 1) => ({ schemaVersion: 1, revision, constructionMode });
const rest = (constructionMode, revision = '1') => ({ fields: { schemaVersion: { integerValue: '1' }, revision: { integerValue: revision }, constructionMode: { booleanValue: constructionMode } } });

test('missing Construction Mode is a minimal ON default and a read never seeds any document', async () => {
  const f = fixture();
  assert.deepEqual(await f.store.readLiveSiteAccess(), setting(true, 0));
  assert.deepEqual(f.reads, ['site/access']); assert.equal(f.documents.size, 0); assert.deepEqual(f.writes, []);
  assert.deepEqual(f.stats(), { tokenCalls: 1, transactions: 0, commits: 0 });
});

test('existing live access reads return only strict public-safe fields, never workspace or publication', async () => {
  const f = fixture(); f.documents.set('site/access', setting(false, 9));
  f.documents.set('ownerWorkspace/current', { secretDraft: 'not-accessible-to-this-operation' });
  assert.deepEqual(await f.store.readLiveSiteAccess(), setting(false, 9));
  assert.deepEqual(f.reads, ['site/access']); assert.deepEqual(f.writes, []);
});

test('persisted access rejects unknown fields, invalid versions, revisions, booleans and prototypes', () => {
  const { access } = fixture();
  const invalid = [null, [], false, '', {}, Object.create(null), new Date(),
    { ...setting(false), draft: 'private' }, { ...setting(false), ownerUid: 'private' },
    { ...setting(false), schemaVersion: 2 }, { ...setting(false), schemaVersion: '1' },
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map(revision => setting(false, revision)),
    ...['false', 0, null, undefined].map(constructionMode => setting(constructionMode))];
  for (const value of invalid) assert.throws(() => access.decodeSiteAccess(value), /Invalid/);
  assert.deepEqual(access.decodeSiteAccess(setting(true, Number.MAX_SAFE_INTEGER)), setting(true, Number.MAX_SAFE_INTEGER));
  const input = setting(false); const decoded = access.decodeSiteAccess(input); decoded.constructionMode = true;
  assert.equal(input.constructionMode, false, 'decoded result is independent from the original object');
});

test('REST access decoder rejects private fields and noncanonical Firestore types', () => {
  const { access } = fixture();
  assert.deepEqual(access.decodeSiteAccessRestDocument(rest(false, '42')), setting(false, 42));
  assert.deepEqual(access.decodeSiteAccessRestDocument(rest(true)), setting(true));
  for (const raw of [null, [], {}, { fields: [] }, { fields: { ...rest(false).fields, secret: { stringValue: 'private' } } },
    { fields: { ...rest(false).fields, constructionMode: { stringValue: 'false' } } },
    { fields: { ...rest(false).fields, constructionMode: { booleanValue: false, stringValue: 'false' } } },
    { fields: { ...rest(false).fields, schemaVersion: { integerValue: '1', doubleValue: 1 } } },
    ...['0', '-1', '1.5', '01', ' 1 ', '9007199254740992'].map(revision => rest(false, revision)),
    { fields: { ...rest(false).fields, revision: { integerValue: 1 } } },
    { fields: { ...rest(false).fields, schemaVersion: { integerValue: '2' } } }]) {
    assert.throws(() => access.decodeSiteAccessRestDocument(raw), /Invalid/);
  }
});

test('read failures and corrupt settings do not silently substitute a default or rewrite data', async () => {
  for (const fault of ['network', 'denied', 'corrupt']) {
    const f = fixture();
    if (fault === 'corrupt') f.documents.set('site/access', { ...setting(false), secret: 'never-return' });
    else f.controls.readError = { code: fault === 'denied' ? 'permission-denied' : 'unavailable' };
    await assert.rejects(f.store.readLiveSiteAccess(), error => error.code === 'read' && !error.message.includes('never-return'));
    assert.deepEqual(f.writes, []); assert.equal(f.stats().commits, 0);
  }
});

test('wrong, signed-out, replaced or disposed owner sessions cannot read or write the setting', async () => {
  for (const mutation of ['wrong', 'signed-out', 'replaced', 'disposed']) {
    for (const action of ['read', 'write']) {
      const f = fixture();
      if (mutation === 'wrong') f.auth.currentUser = { ...f.user, uid: 'somebody-else' };
      if (mutation === 'signed-out') f.auth.currentUser = null;
      if (mutation === 'replaced') f.auth.currentUser = { ...f.user };
      if (mutation === 'disposed') f.store.dispose();
      await assert.rejects(action === 'read' ? f.store.readLiveSiteAccess() : f.store.updateConstructionMode(true, 0));
      assert.equal(f.stats().tokenCalls, 0); assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
    }
  }
});

test('session loss during token refresh prevents any Firestore operation', async () => {
  for (const action of ['read', 'write']) {
    const f = fixture(); f.controls.token = () => { f.auth.currentUser = null; };
    await assert.rejects(action === 'read' ? f.store.readLiveSiteAccess() : f.store.updateConstructionMode(false, 0));
    assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []); assert.equal(f.stats().transactions, 0);
  }
});

test('session loss after access read prevents its return and prevents queued changes', async () => {
  for (const action of ['read', 'write']) {
    const f = fixture(); f.documents.set('site/access', setting(true));
    f.controls.afterRead = path => { if (path === 'site/access') f.auth.currentUser = null; };
    await assert.rejects(action === 'read' ? f.store.readLiveSiteAccess() : f.store.updateConstructionMode(false, 1));
    assert.deepEqual(f.reads, ['site/access']); assert.deepEqual(f.writes, []); assert.equal(f.stats().commits, 0);
  }
});

test('session loss after publication read cannot open the site', async () => {
  const f = fixture(); f.seedPublication();
  f.controls.afterRead = path => { if (path === 'site/published') f.store.dispose(); };
  await assert.rejects(f.store.updateConstructionMode(false, 0));
  assert.deepEqual(f.reads, ['site/access', 'site/published']); assert.deepEqual(f.writes, []); assert.equal(f.documents.has('site/access'), false);
});

test('closing can create revision one without a publication and changes only the access document', async () => {
  const f = fixture();
  const privateDraft = { sentinel: 'KEEP_PRIVATE_AND_UNMODIFIED' }; f.documents.set('ownerWorkspace/current', privateDraft);
  assert.deepEqual(await f.store.updateConstructionMode(true, 0), setting(true));
  assert.deepEqual(f.reads, ['site/access']); assert.deepEqual(f.writes, [{ path: 'site/access', value: setting(true) }]);
  assert.deepEqual(f.documents.get('ownerWorkspace/current'), privateDraft); assert.equal(f.documents.has('site/published'), false);
});

test('opening is independently saved and requires an existing validated publication', async () => {
  const f = fixture(); f.seedPublication();
  const originalPublication = structuredClone(f.documents.get('site/published'));
  f.documents.set('ownerWorkspace/current', { payload: 'private unsaved work is not used' });
  const originalWorkspace = structuredClone(f.documents.get('ownerWorkspace/current'));
  assert.deepEqual(await f.store.updateConstructionMode(false, 0), setting(false));
  assert.deepEqual(f.reads, ['site/access', 'site/published']); assert.deepEqual(f.writes, [{ path: 'site/access', value: setting(false) }]);
  assert.deepEqual(f.documents.get('site/published'), originalPublication);
  assert.deepEqual(f.documents.get('ownerWorkspace/current'), originalWorkspace);
});

test('ON to OFF to ON round-trip advances only independent access revisions', async () => {
  const f = fixture(); f.seedPublication();
  assert.deepEqual(await f.store.updateConstructionMode(true, 0), setting(true, 1));
  assert.deepEqual(await f.store.updateConstructionMode(false, 1), setting(false, 2));
  assert.deepEqual(await f.store.updateConstructionMode(true, 2), setting(true, 3));
  assert.deepEqual(await f.store.readLiveSiteAccess(), setting(true, 3));
  assert.deepEqual(f.writes.map(write => write.path), ['site/access', 'site/access', 'site/access']);
  assert.equal(f.documents.get('site/published').revision, 7);
});

test('opening missing publication is rejected without creating a gate or publishing the draft', async () => {
  const f = fixture(); f.documents.set('ownerWorkspace/current', { draft: 'not-publishable-by-toggle' });
  await assert.rejects(f.store.updateConstructionMode(false, 0), error => error.code === 'not-published');
  assert.deepEqual(f.writes, []); assert.equal(f.documents.has('site/access'), false); assert.equal(f.documents.has('site/published'), false);
});

test('opening malformed publication or private-field wrapper is rejected without any write', async () => {
  for (const corruption of ['payload', 'extra-field', 'bad-content', 'revision']) {
    const f = fixture(); f.seedPublication();
    const raw = f.documents.get('site/published');
    if (corruption === 'payload') raw.payload = '{broken';
    if (corruption === 'extra-field') raw.draft = 'private';
    if (corruption === 'bad-content') raw.payload = JSON.stringify({ revision: 7, draft: 'private' });
    if (corruption === 'revision') raw.revision = 8;
    await assert.rejects(f.store.updateConstructionMode(false, 0), error => error.code === 'write');
    assert.deepEqual(f.writes, []); assert.equal(f.documents.has('site/access'), false);
  }
});

test('corrupt gate settings cannot be overwritten or repaired by an assumed default', async () => {
  for (const raw of [{ ...setting(false), privateDraft: 'hidden' }, setting(false, 0), setting('false'), { revision: 1 }]) {
    const f = fixture(); f.documents.set('site/access', raw);
    await assert.rejects(f.store.updateConstructionMode(true, 0), error => error.code === 'write');
    assert.deepEqual(f.documents.get('site/access'), raw); assert.deepEqual(f.writes, []);
  }
});

test('stale revision rejects both opening and closing without overwriting the live decision', async () => {
  for (const target of [true, false]) {
    const f = fixture(); f.seedPublication(); f.documents.set('site/access', setting(!target, 4));
    await assert.rejects(f.store.updateConstructionMode(target, 3), error => error.code === 'conflict');
    assert.deepEqual(f.documents.get('site/access'), setting(!target, 4)); assert.deepEqual(f.writes, []);
    assert.deepEqual(f.reads, ['site/access'], 'stale callers do not read the publication or publish anything');
  }
});

test('transaction retry observes another device decision and fails rather than silently replacing it', async () => {
  const f = fixture(); f.seedPublication(); f.documents.set('site/access', setting(true, 1));
  f.controls.retry = () => f.documents.set('site/access', setting(true, 2));
  await assert.rejects(f.store.updateConstructionMode(false, 1), error => error.code === 'conflict');
  assert.deepEqual(f.documents.get('site/access'), setting(true, 2)); assert.deepEqual(f.writes, []); assert.equal(f.stats().commits, 0);
});

test('invalid update inputs reject locally without authentication or database calls', async () => {
  for (const [target, revision] of [[null, 0], ['false', 0], [0, 0], [true, -1], [true, 1.2], [true, NaN], [true, Infinity], [true, '1']]) {
    const f = fixture(); await assert.rejects(f.store.updateConstructionMode(target, revision));
    assert.deepEqual(f.stats(), { tokenCalls: 0, transactions: 0, commits: 0 }); assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
  }
});

test('revision exhaustion fails without unsafe integer overflow or writing a new config', async () => {
  const f = fixture(); f.documents.set('site/access', setting(false, Number.MAX_SAFE_INTEGER));
  await assert.rejects(f.store.updateConstructionMode(true, Number.MAX_SAFE_INTEGER));
  assert.deepEqual(f.writes, []); assert.deepEqual(f.documents.get('site/access'), setting(false, Number.MAX_SAFE_INTEGER));
});

test('permission/network transaction failures report unconfirmed update and are never automatically replayed', async () => {
  for (const code of ['permission-denied', 'unavailable', 'deadline-exceeded']) {
    const f = fixture(); f.controls.writeError = { code };
    await assert.rejects(f.store.updateConstructionMode(true, 0), error => error.code === 'write' && /not confirmed/.test(error.message));
    assert.equal(f.stats().transactions, 1); assert.equal(f.stats().commits, 0); assert.deepEqual(f.writes, []);
  }
});

test('lost acknowledgment after a committed change stays uncertain, with no blind retry', async () => {
  const f = fixture(); f.controls.afterCommit = () => { throw { code: 'unavailable' }; };
  await assert.rejects(f.store.updateConstructionMode(true, 0), error => error.code === 'write' && /Check the live setting again/.test(error.message));
  assert.equal(f.stats().transactions, 1); assert.equal(f.stats().commits, 1); assert.deepEqual(f.documents.get('site/access'), setting(true));
  f.controls.afterCommit = null;
  assert.deepEqual(await f.store.readLiveSiteAccess(), setting(true), 'a deliberate read can establish the authoritative result');
  assert.equal(f.stats().transactions, 1);
});

test('session loss after commit prevents a success result even when the write already reached Firestore', async () => {
  const f = fixture(); f.controls.afterCommit = () => { f.auth.currentUser = null; };
  await assert.rejects(f.store.updateConstructionMode(true, 0), error => error.code === 'unavailable');
  assert.equal(f.stats().transactions, 1); assert.equal(f.stats().commits, 1);
});
