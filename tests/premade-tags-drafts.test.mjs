import { test } from 'node:test';
import assert from 'node:assert/strict';
import { model as m, defaults as d, storage as s, memoryAdapter } from './owner-test-modules.mjs';
import { sourceLoader } from './scout-source-loader.mjs';

const item = changes => ({ id: 'selected', name: 'Selected', image: '/images/heads.webp', alt: 'Character', description: '', price: null, visible: true, soldChannel: 'tmc', ...changes });
const draft = changes => { const content = d.createDefaultOwnerContent(); content.site.showPremades = true; content.premades = [item(changes)]; return content; };

test('listing tag parser supports zero and ten tags, keeps eleven for validation, trims and deduplicates case-insensitively', () => {
  assert.deepEqual(m.parsePremadeTags(' , ,\t , '), []);
  assert.deepEqual(m.parsePremadeTags(' Ready to ship, Fox, ready TO ship, , Fox , Soft '), ['Ready to ship', 'Fox', 'Soft']);
  for (const count of [0, 10, 11]) {
    const tags = m.parsePremadeTags(Array.from({ length: count }, (_, i) => ` tag ${i} `).join(','));
    assert.equal(tags.length, count, 'input must never be silently truncated');
    assert.equal(m.validateOwnerContent(draft({ tags })).valid, count <= 10);
  }
});

test('strict private and public validators reject malformed tags and accept empty optional lists', () => {
  for (const tags of [null, 'Fox', [null], [''], ['   '], [' fox'], ['fox '], ['a,b'], ['Fox', 'fox'], ['x'.repeat(81)], Array.from({ length: 11 }, (_, i) => `tag${i}`)]) {
    assert.equal(m.validateOwnerContent(draft({ tags })).valid, false, JSON.stringify(tags));
    const publicContent = m.createPublicContentSnapshot(draft()); publicContent.premades[0].tags = tags;
    assert.throws(() => m.assertPublicOwnerContent(publicContent), m.OwnerValidationError);
  }
  for (const tags of [[], ['x'.repeat(80)], ['Fox', 'Ready to ship']]) {
    const expectedTags = [...tags]; const source = draft({ tags }); const projected = m.createPublicContentSnapshot(source);
    m.assertPublicOwnerContent(projected); assert.deepEqual(projected.premades[0].tags, tags);
    assert.deepEqual(m.publicContentToOwnerContent(projected).premades[0].tags, tags);
    if (tags.length) source.premades[0].tags[0] = 'Changed locally';
    assert.deepEqual(projected.premades[0].tags, expectedTags);
  }
});

test('legacy badge reads remain one badge and unchanged legacy cloud data round-trips', async () => {
  const content = draft({ badge: 'Ready, steady, ship' });
  assert.deepEqual(m.getPremadeTags(content.premades[0]), ['Ready, steady, ship']);
  const store = s.createOwnerStore(memoryAdapter()); await store.saveDraft(content, 0);
  assert.deepEqual((await store.load()).draft, content);
  assert.equal(m.createPublicContentSnapshot(content).premades[0].badge, 'Ready, steady, ship');
  assert.deepEqual(m.getPremadeTags({ badge: 'old', tags: ['new', 'tags'] }), ['new', 'tags']);
});

test('draft state is strict, excluded from whole-site publication even if visible, and forbidden in public payloads', () => {
  const content = draft({ isDraft: true, visible: true, tags: ['PRIVATE_TAG'], description: 'PRIVATE_DESCRIPTION' });
  content.premades.push(item({ id: 'public', name: 'Public', tags: ['Ready'] }));
  const published = m.createPublishedOwnerSnapshot(content, 1);
  assert.deepEqual(published.content.premades.map(value => value.id), ['public']);
  assert.doesNotMatch(JSON.stringify(published), /PRIVATE_|isDraft/);
  assert.throws(() => m.createPublishedPremadeSnapshot(published, content.premades[0], 2), /saved listing draft/);
  for (const isDraft of [false, true]) {
    const bad = structuredClone(published); bad.content.premades[0].isDraft = isDraft;
    assert.throws(() => m.assertPublishedOwnerSnapshot(bad), /Private listing draft state/);
  }
  for (const isDraft of ['draft', 1, null]) assert.equal(m.validateOwnerContent(draft({ isDraft })).valid, false);
});

test('per-card draft save persists only the selected listing, survives a fresh store, and never changes preview', async () => {
  const base = d.createInitialOwnerWorkspace(); base.draft.premades = [item(), item({ id: 'other', description: 'Other saved' })];
  base.localPublished = { content: structuredClone(base.draft), publishedAt: '2026-10-25T12:00:00.000Z' };
  const adapter = memoryAdapter(base), store = s.createOwnerStore(adapter), before = structuredClone(base);
  const selected = item({ name: 'Renamed draft', description: 'Card only', tags: ['Fox', 'Ready'] });
  const saved = await store.savePremadeDraft(selected, 0);
  assert.equal(saved.revision, 1); assert.equal(saved.draft.premades[0].isDraft, true); assert.equal(saved.draft.premades[0].visible, false);
  assert.equal(saved.draft.premades[0].name, 'Renamed draft'); assert.deepEqual(saved.draft.premades[1], before.draft.premades[1]);
  assert.deepEqual({ ...saved.draft, premades: [] }, { ...before.draft, premades: [] });
  assert.deepEqual(saved.localPublished, before.localPublished); assert.equal(selected.isDraft, undefined);
  assert.deepEqual(await s.createOwnerStore(adapter).load(), saved);
});

test('new card save snapshots its input before awaiting storage and accepts an unfinished third-party address privately', async () => {
  const adapter = memoryAdapter(); let release; const gate = new Promise(resolve => release = resolve);
  const store = s.createOwnerStore({ read: adapter.read, update: async transform => { await gate; return adapter.update(transform); } });
  const selected = item({ soldChannel: 'third-party', tags: ['Before'] });
  const pending = store.savePremadeDraft(selected, 0); selected.name = 'Later edit'; selected.tags.push('Later'); release();
  const saved = await pending; assert.equal(saved.draft.premades[0].name, 'Selected'); assert.deepEqual(saved.draft.premades[0].tags, ['Before']);
  assert.equal(saved.draft.premades[0].soldChannel, 'third-party'); assert.equal(saved.draft.premades[0].isDraft, true);
  const promoted = { ...saved.draft.premades[0], visible: true }; delete promoted.isDraft;
  assert.throws(() => m.createPublishedPremadeSnapshot(m.createPublishedOwnerSnapshot(d.createDefaultOwnerContent(), 1), promoted, 2), /third-party listing address/);
});

test('invalid tag card never touches storage; rejected commit or stale revision never overwrites any saved listing', async () => {
  let calls = 0; const store = s.createOwnerStore({ read: async () => null, update: async () => { calls++; throw new Error('Commit failed'); } });
  await assert.rejects(store.savePremadeDraft(item({ tags: ['x'.repeat(81)] }), 0), m.OwnerValidationError); assert.equal(calls, 0);
  await assert.rejects(store.savePremadeDraft(item(), 0), error => error.code === 'write'); assert.equal(calls, 1);
  const adapter = memoryAdapter(), a = s.createOwnerStore(adapter), b = s.createOwnerStore(adapter);
  await a.savePremadeDraft(item({ id: 'other-device' }), 0); const before = adapter.peek();
  await assert.rejects(b.savePremadeDraft(item(), 0), error => error.code === 'conflict'); assert.deepEqual(adapter.peek(), before);
});

// Firestore transaction double: no SDK initialization, real account or external writes.
function cloud() {
  const documents = new Map(); let fail = false, retry; const writes = []; const user = { uid: 'owner', getIdToken: async () => 'inert-test-token' }; const auth = { currentUser: user };
  const api = { doc: (_db, path) => ({ path }), getDoc: async ref => view(ref.path), runTransaction: async (_db, callback) => {
    let pending = new Map(); const tx = { get: async ref => view(ref.path), set: (ref, value) => pending.set(ref.path, structuredClone(value)) };
    let next = await callback(tx); if (retry) { retry(); retry = null; pending = new Map(); next = await callback(tx); }
    if (fail) throw { code: 'unavailable' }; for (const [path, value] of pending) { documents.set(path, value); writes.push(path); } return next;
  } };
  const view = path => ({ exists: () => documents.has(path), data: () => structuredClone(documents.get(path)) });
  const load = sourceLoader({ 'firebase/firestore/lite': api }), fm = load('src/owner/firebase-store.ts');
  return { documents, writes, fm, auth, store: fm.createFirebaseOwnerStore({ db: {}, auth, ownerUid: 'owner' }), fail: () => fail = true, retry: fn => retry = fn };
}

test('cloud Save as Draft writes only ownerWorkspace and full site publication keeps its card private', async () => {
  const f = cloud(); let saved = await f.store.publishLive(draft({ description: 'OLD LIVE' }), 0);
  const beforePublic = structuredClone(f.documents.get('site/published')); f.writes.length = 0;
  saved = await f.store.savePremadeDraft(item({ description: 'PRIVATE NEW VERSION', tags: ['PRIVATE_TAG'] }), saved.revision);
  assert.deepEqual(f.writes, ['ownerWorkspace/current']); assert.deepEqual(f.documents.get('site/published'), beforePublic);
  assert.equal((await f.store.load()).draft.premades[0].isDraft, true);
  await f.store.publishLive(saved.draft, saved.revision);
  const publicContent = f.fm.decodePublishedOwnerSnapshot(f.documents.get('site/published')).content;
  assert.equal(publicContent.premades.length, 0); assert.doesNotMatch(JSON.stringify(publicContent), /PRIVATE_/);
});

test('cloud failed, expired and retried-concurrent saves preserve data and do not produce false success', async () => {
  for (const mode of ['failure', 'expired', 'concurrent']) {
    const f = cloud(); const saved = await f.store.savePremadeDraft(item({ id: 'original' }), 0); f.writes.length = 0;
    if (mode === 'failure') f.fail();
    if (mode === 'expired') f.auth.currentUser = null;
    if (mode === 'concurrent') f.retry(() => { const newer = structuredClone(saved); newer.revision++; newer.draft.home.title = 'OTHER DEVICE'; f.documents.set('ownerWorkspace/current', f.fm.encodeOwnerWorkspace(newer)); });
    await assert.rejects(f.store.savePremadeDraft(item(), saved.revision)); assert.deepEqual(f.writes, []);
    const stored = f.fm.decodeOwnerWorkspace(f.documents.get('ownerWorkspace/current'));
    assert.deepEqual(stored.draft.premades.map(value => value.id), ['original']);
    if (mode === 'concurrent') assert.equal(stored.draft.home.title, 'OTHER DEVICE');
  }
});
