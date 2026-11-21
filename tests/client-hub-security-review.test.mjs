// Independent native review of fail-closed race/collision behavior. No Auth calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHubService, hashCode, LOGIN_FAILURE } from '../firebase/functions/hub-core.mjs';

const OWNER = { auth: { uid: 'a4ARjp0z8ZOByKlC2AfGzmMRj843' } };
const op = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const snap = value => ({ exists: value !== undefined, data: () => structuredClone(value) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class AtomicStore {
  records = new Map();
  queue = Promise.resolve();
  doc(path) { return { path, get: async () => snap(this.records.get(path)) }; }
  runTransaction(work) {
    const result = this.queue.then(async () => {
      const operations = []; let writing = false;
      const tx = { get: async reference => { assert.equal(writing, false); return snap(this.records.get(reference.path)); } };
      for (const kind of ['create', 'set', 'update']) tx[kind] = (reference, value) => { writing = true; operations.push({ kind, path: reference.path, value: structuredClone(value) }); };
      const value = await work(tx), next = new Map(this.records);
      for (const change of operations) {
        if (change.kind === 'create' && next.has(change.path)) throw new Error('collision');
        if (change.kind === 'update' && !next.has(change.path)) throw new Error('missing');
        next.set(change.path, change.kind === 'update' ? { ...next.get(change.path), ...change.value } : change.value);
      }
      this.records = next; return value;
    });
    this.queue = result.catch(() => {}); return result;
  }
}
function fixture() {
  const db = new AtomicStore(), minted = []; let clientNumber = 0, projectNumber = 100, codeNumber = 0, signingHook;
  const dependencies = { db, now: () => Date.parse('2026-10-26T21:00:00.000Z'), generateClientId: () => `TMC-${String(++clientNumber).padStart(16, '0')}`, generateProjectId: () => op(++projectNumber), generateCode: () => 'TMC-' + String(++codeNumber).padStart(32, 'a'), auth: { createCustomToken: async (uid, claims) => { minted.push({ uid, claims }); await signingHook?.(); return 'dummy-token'; } } };
  const service = createHubService(dependencies);
  return { db, minted, service, dependencies, onSign: hook => { signingHook = hook; }, create: (operationId = op(1)) => service.createClient({ operationId, displayName: 'Review fixture', projectTitle: 'Commission' }, OWNER) };
}

test('reset or suspension during token signing never returns an apparently valid login', async () => {
  for (const mutation of ['reset', 'suspend']) {
    const f = fixture(), initial = await f.create(), signed = deferred(), release = deferred();
    f.onSign(async () => { signed.resolve(); await release.promise; });
    const attempt = f.service.signIn({ code: initial.signInCode });
    await signed.promise;
    const input = { clientId: initial.client.clientId, expectedAuthVersion: 1 };
    if (mutation === 'reset') await f.service.resetClientCode(input, OWNER);
    else await f.service.setClientStatus({ ...input, status: 'suspended' }, OWNER);
    release.resolve();
    await assert.rejects(attempt, error => error.code === 'unauthenticated' && error.message === LOGIN_FAILURE);
    assert.equal(f.minted[0].claims.hubAuthVersion, 1);
    assert.equal(f.db.records.get(`hubClients/${initial.client.clientId}`).authVersion, 2);
  }
});

test('reset credential collision leaves previous code and entire transaction unchanged', async () => {
  const f = fixture(), initial = await f.create();
  const colliding = createHubService({ ...f.dependencies, generateCode: () => initial.signInCode });
  const before = structuredClone([...f.db.records]);
  await assert.rejects(colliding.resetClientCode({ clientId: initial.client.clientId, expectedAuthVersion: 1 }, OWNER));
  assert.deepEqual([...f.db.records], before);
  await f.service.signIn({ code: initial.signInCode });
  assert.equal(f.minted.at(-1).claims.hubAuthVersion, 1);
});

test('different clients cannot receive the same credential hash even under generator collision', async () => {
  const f = fixture(), initial = await f.create();
  const colliding = createHubService({ ...f.dependencies, generateCode: () => initial.signInCode });
  const before = structuredClone([...f.db.records]);
  await assert.rejects(colliding.createClient({ operationId: op(2), displayName: 'Different person' }, OWNER));
  assert.deepEqual([...f.db.records], before);
  assert.equal(f.db.records.get(`hubCodeIndex/${hashCode(initial.signInCode)}`).clientId, initial.client.clientId);
});

test('concurrent reset and suspension cannot both commit from a stale expected version', async () => {
  const f = fixture(), initial = await f.create(), input = { clientId: initial.client.clientId, expectedAuthVersion: 1 };
  const outcomes = await Promise.allSettled([f.service.resetClientCode(input, OWNER), f.service.setClientStatus({ ...input, status: 'suspended' }, OWNER)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'aborted');
  assert.equal(f.db.records.get(`hubClients/${initial.client.clientId}`).authVersion, 2);
});

test('token signing outage returns an availability error without SDK or credential details', async () => {
  const f = fixture(), initial = await f.create();
  f.onSign(() => { throw new Error(`signing failed with ${initial.signInCode}`); });
  await assert.rejects(f.service.signIn({ code: initial.signInCode }), error => error.code === 'unavailable' && !error.message.includes(initial.signInCode) && !error.message.includes('signing failed'));
});

test('auth version is session-scoped, never globally upgraded for old refresh-token sessions', () => {
  const core = readFileSync(new URL('../firebase/functions/hub-core.mjs', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('../firebase/functions/hub.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(core + wrapper, /setCustomUserClaims|updateUser|console\.(log|error|warn)|logger\./);
  assert.match(core, /createCustomToken\([\s\S]*?hubAuthVersion: client\.authVersion/);
  assert.match(wrapper, /verifyIdToken\(header\.slice\(7\), true\)/);
  assert.match(wrapper, /project !== "taylor-made-creations"/);
});
