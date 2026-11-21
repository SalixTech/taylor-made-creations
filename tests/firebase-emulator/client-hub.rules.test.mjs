// Independent security review. Loopback emulator only; no real Auth/API calls.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, orderBy, limit } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getBytes, getMetadata, getDownloadURL, updateMetadata, deleteObject, listAll } from 'firebase/storage';
import { createRequire } from 'node:module';
const requireAdmin = createRequire(new URL('../../firebase/functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireAdmin('firebase-admin/app');
const { getStorage } = requireAdmin('firebase-admin/storage');

const PROJECT = 'demo-tmc-hub-rules';
const OWNER = 'a4ARjp0z8ZOByKlC2AfGzmMRj843';
const A = 'TMC-0123456789ABCDEF', B = 'TMC-FEDCBA9876543210';
const PA = '11111111-1111-4111-8111-111111111111', PB = '22222222-2222-4222-8222-222222222222';
const ISO = '2026-10-26T21:00:00.000Z';
let env, owner, anon, adminApp, adminBucket;
const clientRecord = (clientId, extra = {}) => ({ clientId, displayName: 'Client', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO, ...extra });
const projectRecord = (projectId, clientId) => ({ projectId, clientId, title: 'Commission', summary: '', status: 'queued', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO });
const claims = (clientId, extra = {}) => ({ hubRole: 'client', hubClientId: clientId, hubAuthVersion: 1, ...extra });
const client = (clientId = A, extra = {}, uid = `hub:${clientId}`) => env.authenticatedContext(uid, claims(clientId, extra));
const ref = (context, path) => doc(context.firestore(), path);
const projects = (context, clientId) => query(collection(context.firestore(), 'hubProjects'), where('clientId', '==', clientId));
const seed = (path, value) => env.withSecurityRulesDisabled(context => setDoc(ref(context, path), value));

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8') }, storage: { host: '127.0.0.1', port: 19199, rules: readFileSync(new URL('../../firebase/storage.rules', import.meta.url), 'utf8') } });
  owner = env.authenticatedContext(OWNER); anon = env.unauthenticatedContext();
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:19199') throw new Error('Admin Storage tests only run on the local emulator.');
  adminApp = initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, 'hub-rules-storage');
  adminBucket = getStorage(adminApp).bucket(storageRef(owner.storage()).bucket);
});
beforeEach(async () => {
  await env.clearFirestore();
  await adminBucket.deleteFiles({ force: true });
  await seed(`hubClients/${A}`, clientRecord(A)); await seed(`hubClients/${B}`, clientRecord(B));
  await seed(`hubProjects/${PA}`, projectRecord(PA, A)); await seed(`hubProjects/${PB}`, projectRecord(PB, B));
  await seed(`hubClientPrivate/${A}`, { clientId: A, email: 'private@example.test' });
});
after(async () => { await env?.cleanup(); if (adminApp) await deleteApp(adminApp); });

test('client can read only personal record and explicitly scoped projects', async () => {
  const a = client();
  await assertSucceeds(getDoc(ref(a, `hubClients/${A}`)));
  await assertSucceeds(getDoc(ref(a, `hubProjects/${PA}`)));
  const result = await assertSucceeds(getDocs(projects(a, A)));
  assert.deepEqual(result.docs.map(document => document.id), [PA]);
  await assertFails(getDoc(ref(a, `hubClients/${B}`)));
  await assertFails(getDoc(ref(a, `hubProjects/${PB}`)));
  await assertFails(getDocs(projects(a, B)));
  await assertFails(getDocs(collection(a.firestore(), 'hubProjects')));
  await assertFails(getDocs(collection(a.firestore(), 'hubClients')));
});

test('permanent ID, authenticated stranger, malformed claims, and role forgery grant no access', async () => {
  const denied = [anon, env.authenticatedContext(A), env.authenticatedContext('stranger'),
    client(A, {}, 'stranger'), client(A, { hubRole: 'owner' }), client(A, { hubClientId: B }),
    client(A, { hubAuthVersion: '1' }), client(A, { hubAuthVersion: 0 }), client(A, { hubAuthVersion: 2 })];
  for (const context of denied) {
    await assertFails(getDoc(ref(context, `hubClients/${A}`)));
    await assertFails(getDoc(ref(context, `hubProjects/${PA}`)));
    await assertFails(getDocs(projects(context, A)));
  }
});

test('reset immediately rejects old version while a new version can read', async () => {
  const oldSession = client();
  await assertSucceeds(getDoc(ref(oldSession, `hubProjects/${PA}`)));
  await seed(`hubClients/${A}`, clientRecord(A, { authVersion: 2 }));
  await assertFails(getDoc(ref(oldSession, `hubClients/${A}`)));
  await assertFails(getDoc(ref(oldSession, `hubProjects/${PA}`)));
  await assertFails(getDocs(projects(oldSession, A)));
  const newSession = client(A, { hubAuthVersion: 2 });
  await assertSucceeds(getDoc(ref(newSession, `hubClients/${A}`)));
  await assertSucceeds(getDocs(projects(newSession, A)));
});

test('suspension and later reactivation cannot revive old sessions', async () => {
  const oldSession = client();
  await seed(`hubClients/${A}`, clientRecord(A, { status: 'suspended', authVersion: 2 }));
  for (const context of [oldSession, client(A, { hubAuthVersion: 2 })]) {
    await assertFails(getDoc(ref(context, `hubClients/${A}`)));
    await assertFails(getDoc(ref(context, `hubProjects/${PA}`)));
    await assertFails(getDocs(projects(context, A)));
  }
  await seed(`hubClients/${A}`, clientRecord(A, { status: 'active', authVersion: 3 }));
  await assertFails(getDoc(ref(oldSession, `hubProjects/${PA}`)));
  await assertFails(getDoc(ref(client(A, { hubAuthVersion: 2 }), `hubProjects/${PA}`)));
  await assertSucceeds(getDoc(ref(client(A, { hubAuthVersion: 3 }), `hubProjects/${PA}`)));
});

test('contacts are owner-only and all browser Hub mutations are denied including owner', async () => {
  await assertSucceeds(getDoc(ref(owner, `hubClientPrivate/${A}`)));
  await assertSucceeds(getDocs(collection(owner.firestore(), 'hubClientPrivate')));
  for (const context of [anon, client(), client(B)]) {
    await assertFails(getDoc(ref(context, `hubClientPrivate/${A}`)));
    await assertFails(getDocs(collection(context.firestore(), 'hubClientPrivate')));
  }
  for (const context of [owner, anon, client()]) {
    for (const path of [`hubClients/${A}`, `hubProjects/${PA}`, `hubClientPrivate/${A}`]) {
      await assertFails(setDoc(ref(context, path), { unauthorized: true }));
      await assertFails(updateDoc(ref(context, path), { unauthorized: true }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
});

test('credential indexes, secret records, operation records, and limits are inaccessible to every browser', async () => {
  for (const name of ['hubClientSecrets', 'hubCodeIndex', 'hubRequestLinks', 'hubOperations', 'hubLoginLimits', 'hubWorkspaceOperations', 'hubWorkspaceLimits']) {
    await seed(`${name}/test`, { marker: 'server-only' });
    for (const context of [owner, anon, client()]) {
      await assertFails(getDoc(ref(context, `${name}/test`)));
      await assertFails(getDocs(collection(context.firestore(), name)));
      await assertFails(setDoc(ref(context, `${name}/test`), { unauthorized: true }));
      await assertFails(deleteDoc(ref(context, `${name}/test`)));
    }
  }
});

test('client claims do not escalate to existing private owner collections', async () => {
  for (const path of ['ownerWorkspace/current', 'ownerDraftIndex/current', 'ownerInventory/test', 'commissionRequests/test', 'ownerFileMaintenance/current']) {
    await seed(path, { marker: 'owner-only' });
    await assertFails(getDoc(ref(client(), path)));
  }
  await assertSucceeds(getDocs(collection(owner.firestore(), 'hubClients')));
  await assertSucceeds(getDocs(collection(owner.firestore(), 'hubProjects')));
});


const PHOTO = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const photoPath = (clientId = A, projectId = PA, photoId = PHOTO) => `hub-progress/${clientId}/${projectId}/${photoId}`;
const blob = (context, clientId = A, projectId = PA, photoId = PHOTO) => storageRef(context.storage(), photoPath(clientId, projectId, photoId));
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBVkAAAAASUVORK5CYII=', 'base64'));
const uploadMetadata = (extra = {}) => ({ contentType: 'image/png', contentDisposition: 'inline', cacheControl: 'private, no-store, max-age=0', customMetadata: { clientId: A, projectId: PA, photoId: PHOTO }, ...extra });
const photoRecord = (extra = {}) => ({ photoId: PHOTO, clientId: A, projectId: PA, storagePath: photoPath(), fileName: 'progress.png', caption: 'Progress photo', contentType: 'image/png', size: png.length, createdAt: ISO, ...extra });
async function publishPhoto() {
  await assertSucceeds(uploadBytes(blob(owner), png, uploadMetadata()));
  await seed(`hubPhotos/${PHOTO}`, photoRecord());
}
const scoped = (context, name, clientId = A, projectId = PA) => query(collection(context.firestore(), name), where('clientId', '==', clientId), where('projectId', '==', projectId), orderBy('createdAt', 'desc'), limit(200));
async function seedWorkspace() {
  await seed(`hubMessages/${MESSAGE}`, { messageId: MESSAGE, clientId: A, projectId: PA, senderRole: 'owner', body: 'Client-facing only', createdAt: ISO });
  await seed(`hubSupportRequests/${REQUEST}`, { requestId: REQUEST, clientId: A, projectId: PA, type: 'support', body: 'Help', photoId: null, status: 'open', response: '', createdAt: ISO, updatedAt: ISO, version: 1 });
  await seed(`hubProjectPrivate/${PA}`, { projectId: PA, clientId: A, notes: 'Private studio note', materials: [], version: 1, updatedAt: ISO });
  await seed(`hubPhotos/${PHOTO}`, photoRecord());
}
test('workspace reads require own client, matching existing project and current auth epoch', async () => {
  await seedWorkspace();
  for (const [name, id] of [['hubMessages', MESSAGE], ['hubSupportRequests', REQUEST]]) {
    await assertSucceeds(getDoc(ref(client(), `${name}/${id}`)));
    await assertSucceeds(getDocs(scoped(client(), name)));
    for (const context of [anon, client(B), client(A, { hubAuthVersion: 2 }), client(A, { hubRole: 'owner' })]) {
      await assertFails(getDoc(ref(context, `${name}/${id}`)));
      await assertFails(getDocs(scoped(context, name)));
    }
    await assertFails(getDocs(collection(client().firestore(), name)));
    await assertSucceeds(getDocs(collection(owner.firestore(), name)));
    await seed(`${name}/${id}`, { ...(await getDoc(ref(owner, `${name}/${id}`))).data(), projectId: PB });
    await assertFails(getDoc(ref(client(), `${name}/${id}`)));
  }
});
test('studio notes and material estimates stay owner-only, including collection queries', async () => {
  await seedWorkspace();
  await assertSucceeds(getDoc(ref(owner, `hubProjectPrivate/${PA}`)));
  for (const context of [anon, client(), client(B)]) {
    await assertFails(getDoc(ref(context, `hubProjectPrivate/${PA}`)));
    await assertFails(getDocs(collection(context.firestore(), 'hubProjectPrivate')));
  }
});
test('all workspace browser writes are denied, even by owner and cross-client substitutions', async () => {
  await seedWorkspace();
  for (const context of [anon, owner, client(), client(B)]) for (const path of [`hubMessages/${MESSAGE}`, `hubPhotos/${PHOTO}`, `hubSupportRequests/${REQUEST}`, `hubProjectPrivate/${PA}`]) {
    await assertFails(setDoc(ref(context, path), { clientId: B, projectId: PB }));
    await assertFails(updateDoc(ref(context, path), { clientId: B, projectId: PB }));
    await assertFails(deleteDoc(ref(context, path)));
  }
});
test('published progress photos deny both viewers direct bytes, metadata and download-URL requests', async () => {
  await publishPhoto();
  for (const context of [owner, anon, client(), client(B), env.authenticatedContext('stranger'), client(A, { hubRole: 'owner' })]) {
    await assertFails(getBytes(blob(context))); await assertFails(getMetadata(blob(context)));
    await assertFails(getDownloadURL(blob(context)));
  }
  for (const context of [owner, anon, client()]) await assertFails(listAll(storageRef(context.storage(), `hub-progress/${A}/${PA}`)));
});
test('unpublished photo is owner-readable for safe retry but private to clients', async () => {
  await assertSucceeds(uploadBytes(blob(owner), png, uploadMetadata()));
  await assertSucceeds(getMetadata(blob(owner)));
  await assertFails(getMetadata(blob(client()))); await assertFails(getBytes(blob(client())));
});
test('no browser client epoch can obtain a direct photo URL before or after reset and suspension', async () => {
  await publishPhoto();
  for (const [status, authVersion] of [['active', 1], ['active', 2], ['suspended', 3], ['active', 4]]) {
    await seed(`hubClients/${A}`, clientRecord(A, { status, authVersion }));
    for (const context of [client(), client(A, { hubAuthVersion: authVersion })]) {
      await assertFails(getBytes(blob(context))); await assertFails(getMetadata(blob(context)));
      await assertFails(getDownloadURL(blob(context)));
    }
  }
});
test('progress uploads require owner, real matching project, fixed metadata, image bounds and immutable path', async () => {
  for (const context of [anon, client(), client(B)]) await assertFails(uploadBytes(blob(context), png, uploadMetadata()));
  for (const patch of [{ contentType: 'image/svg+xml' }, { contentType: 'text/html' }, { contentDisposition: 'attachment' }, { customMetadata: { clientId: B, projectId: PA, photoId: PHOTO } }, { customMetadata: { clientId: A, projectId: PA, photoId: PHOTO, unexpected: 'forbidden' } }]) {
    await assertFails(uploadBytes(blob(owner), png, uploadMetadata(patch)));
  }
  await assertFails(uploadBytes(blob(owner, A, PB), png, uploadMetadata({ customMetadata: { clientId: A, projectId: PB, photoId: PHOTO } })));
  await assertFails(uploadBytes(blob(owner), new Uint8Array(), uploadMetadata()));
  await assertFails(uploadBytes(blob(owner), new Uint8Array(10485761), uploadMetadata()));
  await assertSucceeds(uploadBytes(blob(owner), png, uploadMetadata()));
  await assertFails(uploadBytes(blob(owner), png, uploadMetadata()));
  await assertFails(updateMetadata(blob(owner), { customMetadata: { firebaseStorageDownloadTokens: 'token' } }));
  await assertFails(deleteObject(blob(owner)));
});
test('mismatched published records and token-bearing Storage metadata never authorize browser client reads', async () => {
  await publishPhoto();
  for (const patch of [{ clientId: B }, { projectId: PB }, { storagePath: 'photos/other.webp' }, { contentType: 'image/svg+xml' }, { size: 1 }]) {
    await seed(`hubPhotos/${PHOTO}`, photoRecord(patch));
    await assertFails(getBytes(blob(client())));
  }
  await seed(`hubPhotos/${PHOTO}`, photoRecord());
  await adminBucket.file(photoPath()).setMetadata({ metadata: { firebaseStorageDownloadTokens: 'must-never-be-client-visible' } });
  await assertFails(getBytes(blob(client()))); await assertFails(getMetadata(blob(client())));
});


test('client code reset and suspension revoke all persisted workspace reads immediately', async () => {
  await seedWorkspace();
  const oldSession = client();
  const records = [['hubMessages', MESSAGE], ['hubSupportRequests', REQUEST]];
  for (const [name, id] of records) await assertSucceeds(getDoc(ref(oldSession, `${name}/${id}`)));
  await seed(`hubClients/${A}`, clientRecord(A, { authVersion: 2 }));
  for (const [name, id] of records) {
    await assertFails(getDoc(ref(oldSession, `${name}/${id}`)));
    await assertFails(getDocs(scoped(oldSession, name)));
    await assertSucceeds(getDoc(ref(client(A, { hubAuthVersion: 2 }), `${name}/${id}`)));
  }
  await seed(`hubClients/${A}`, clientRecord(A, { status: 'suspended', authVersion: 3 }));
  for (const [name, id] of records) await assertFails(getDoc(ref(client(A, { hubAuthVersion: 3 }), `${name}/${id}`)));
});

const REPLY = '66666666-6666-4666-8666-666666666666';
const noticeId = (role = 'owner', requestId = REQUEST) => `${PA}-${role}-requests-${requestId}`;
const noticeRecord = (role = 'owner', requestId = REQUEST) => ({ notificationId: noticeId(role, requestId), clientId: A, projectId: PA, requestId, recipientRole: role, channel: 'requests', latestItemId: REPLY, latestAt: ISO, version: 1, readVersion: 0, readAt: null, throughItemId: null, throughCreatedAt: null });
async function seedThreadedWorkspace() {
  await seedWorkspace();
  await seed(`hubSupportReplies/${REPLY}`, { replyId: REPLY, requestId: REQUEST, clientId: A, projectId: PA, senderRole: 'client', body: 'Scoped follow-up', createdAt: ISO });
  for (const role of ['owner', 'client']) await seed(`hubNotifications/${noticeId(role)}`, noticeRecord(role));
}

test('threaded replies and both receipt roles remain client/project scoped with server-only writes', async () => {
  await seedThreadedWorkspace();
  const a = client();
  await assertSucceeds(getDocs(scoped(a, 'hubSupportReplies')));
  for (const path of [`hubSupportReplies/${REPLY}`, `hubNotifications/${noticeId()}`, `hubNotifications/${noticeId('client')}`]) {
    for (const context of [owner, a]) await assertSucceeds(getDoc(ref(context, path)));
    for (const context of [anon, client(B), client(A, { hubAuthVersion: 2 }), env.authenticatedContext('stranger')]) await assertFails(getDoc(ref(context, path)));
    for (const context of [owner, a, anon]) {
      await assertFails(setDoc(ref(context, path), { forged: true }));
      await assertFails(updateDoc(ref(context, path), { readVersion: 1000 }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
  await assertFails(getDocs(collection(a.firestore(), 'hubSupportReplies')));
  await seed(`hubSupportReplies/${REPLY}`, { replyId: REPLY, requestId: REQUEST, clientId: A, projectId: PB, senderRole: 'client', body: 'Mismatched project', createdAt: ISO });
  await assertFails(getDoc(ref(a, `hubSupportReplies/${REPLY}`)));
});

test('account notification query allows only own client across commissions and current epoch', async () => {
  await seedThreadedWorkspace();
  const a = client();
  const bell = context => query(collection(context.firestore(), 'hubNotifications'), where('clientId', '==', A), where('recipientRole', '==', 'client'));
  assert.equal((await assertSucceeds(getDocs(bell(a)))).size, 1);
  await assertFails(getDocs(collection(a.firestore(), 'hubNotifications')));
  await assertFails(getDocs(query(collection(a.firestore(), 'hubNotifications'), where('recipientRole', '==', 'client'))));
  await assertFails(getDocs(bell(client(B))));
  await seed(`hubClients/${A}`, clientRecord(A, { authVersion: 2 }));
  await assertFails(getDocs(bell(a)));
  await assertSucceeds(getDocs(bell(client(A, { hubAuthVersion: 2 }))));
});

test('live epoch listener revokes immediately and changed conversation/receipt streams reject the old epoch', async () => {
  for (const mutation of [{ authVersion: 2 }, { status: 'suspended', authVersion: 2 }]) {
    await seed(`hubClients/${A}`, clientRecord(A));
    await seedThreadedWorkspace();
    const a = client();
    const targets = [ref(a, `hubClients/${A}`), scoped(a, 'hubSupportReplies'), query(collection(a.firestore(), 'hubNotifications'), where('clientId', '==', A))];
    const streams = targets.map(target => {
      let initialResolve, revokedResolve, initialReject, stop;
      const observed = { ready: false, revoked: false };
      const ready = new Promise((resolve, reject) => { initialResolve = resolve; initialReject = reject; });
      const revoked = new Promise(resolve => { revokedResolve = resolve; });
      stop = onSnapshot(target, { includeMetadataChanges: true }, snapshot => { if (!snapshot.metadata.fromCache) { observed.ready = true; initialResolve(); } }, error => { observed.revoked = true; initialReject(error); revokedResolve(error); });
      return { ready, revoked, stop, observed };
    });
    let timer;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Live listener did not observe auth epoch revocation: ${JSON.stringify(streams.map(stream => stream.observed))}`)), 15000); });
      await Promise.race([Promise.all(streams.map(stream => stream.ready)), timeout]);
      await seed(`hubClients/${A}`, clientRecord(A, mutation));
      // The local emulator does not invalidate an unchanged query solely when
      // its get() dependency changes. The app therefore keeps this dedicated
      // epoch listener and tears down all project/bell subscriptions on error.
      assert.equal((await Promise.race([streams[0].revoked, timeout])).code, 'permission-denied');
      // An old query must never deliver newly modified private data afterward.
      await seed(`hubSupportReplies/${REPLY}`, { replyId: REPLY, requestId: REQUEST, clientId: A, projectId: PA, senderRole: 'owner', body: 'New private data after revocation', createdAt: ISO });
      await seed(`hubNotifications/${noticeId()}`, { ...noticeRecord(), version: 2 });
      const errors = await Promise.race([Promise.all(streams.map(stream => stream.revoked)), timeout]);
      assert.ok(errors.every(error => error.code === 'permission-denied'));
    } finally { clearTimeout(timer); streams.forEach(stream => stream.stop()); }
  }
});

test('private avatar bytes, photo counters and intake abuse records are inaccessible to every browser', async () => {
  for (const path of [`hubClientAvatars/${A}`, `hubProjectCounters/${PA}`, `publicIntakeOperations/${REQUEST}`, 'publicIntakeLimits/global']) {
    await seed(path, { marker: 'server-only', base64: png.toString() });
    for (const context of [owner, anon, client(), client(B)]) {
      await assertFails(getDoc(ref(context, path)));
      await assertFails(getDocs(collection(context.firestore(), path.split('/')[0])));
      await assertFails(setDoc(ref(context, path), { unauthorized: true }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
});

test('recovery and commission intake contacts are owner-readable but never browser-writable', async () => {
  for (const path of [`hubCodeRecoveryRequests/${REQUEST}`, `commissionRequests/${REQUEST}`]) {
    await seed(path, { requestId: REQUEST, name: 'Private person', email: 'private@example.test', status: 'open', version: 1 });
    await assertSucceeds(getDoc(ref(owner, path)));
    for (const context of [anon, client(), client(B)]) {
      await assertFails(getDoc(ref(context, path)));
      await assertFails(getDocs(collection(context.firestore(), path.split('/')[0])));
    }
    for (const context of [owner, anon, client()]) {
      await assertFails(setDoc(ref(context, path), { unauthorized: true }));
      await assertFails(updateDoc(ref(context, path), { email: 'forged@example.test' }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
});

test('commission references expose no direct Storage bytes, metadata or bearer URLs even to owner', async () => {
  const path = `commission-intake/${REQUEST}/0`;
  await adminBucket.file(path).save(Buffer.from(png), { resumable: false, metadata: { contentType: 'image/png' } });
  for (const context of [owner, anon, client(), client(B)]) {
    const target = storageRef(context.storage(), path);
    await assertFails(getBytes(target)); await assertFails(getMetadata(target)); await assertFails(getDownloadURL(target));
    await assertFails(uploadBytes(target, png, { contentType: 'image/png' }));
    await assertFails(deleteObject(target)); await assertFails(listAll(storageRef(context.storage(), `commission-intake/${REQUEST}`)));
  }
});

test('email templates and acceptance records are owner-readable only; send limits and all writes stay server-only', async () => {
  for (const path of [`ownerEmailTemplates/${REQUEST}`, `ownerEmailOperations/${REQUEST}`, 'ownerEmailLimits/current']) {
    await seed(path, { marker: 'private-email-data' });
    const serverOnly = path.startsWith('ownerEmailLimits/');
    if (!serverOnly) await assertSucceeds(getDoc(ref(owner, path)));
    for (const context of [owner, anon, client(), client(B)]) {
      if (context !== owner || serverOnly) {
        await assertFails(getDoc(ref(context, path)));
        await assertFails(getDocs(collection(context.firestore(), path.split('/')[0])));
      }
      await assertFails(setDoc(ref(context, path), { forgedSend: true }));
      await assertFails(updateDoc(ref(context, path), { status: 'accepted' }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
});

test('PayPal and Trello operation state, stock, capabilities and secrets are never browser-writable', async () => {
  const paths = ['ownerTrello/config', `trelloMappings/${PA}`, `trelloCards/${PA}`, `trelloJobs/${PA}`, 'trelloEvents/ab', 'trelloLimits/webhook-a', `paypalInvoices/${REQUEST}`, `paypalInvoiceOperations/${REQUEST}`, `paypalInvoiceIndex/${REQUEST}`, `paypalInvoiceDraftLocks/${REQUEST}`, `paypalCheckoutOperations/${REQUEST}`, `paypalOrderIndex/${REQUEST}`, 'paypalStock/fox', 'paypalLimits/global', `paypalWebhookEvents/${REQUEST}`];
  for (const path of paths) {
    await seed(path, { marker: 'private-provider-state', capabilityHash: 'not-a-public-bearer', shippingAddress: { country_code: 'US' } });
    const ownerReadable = path === 'ownerTrello/config' || path.startsWith('paypalInvoices/');
    if (ownerReadable) await assertSucceeds(getDoc(ref(owner, path)));
    for (const context of [owner, anon, client(), client(B)]) {
      if (context !== owner || !ownerReadable) {
        await assertFails(getDoc(ref(context, path)));
        await assertFails(getDocs(collection(context.firestore(), path.split('/')[0])));
      }
      await assertFails(setDoc(ref(context, path), { forged: true }));
      await assertFails(updateDoc(ref(context, path), { status: 'captured', available: 100 }));
      await assertFails(deleteDoc(ref(context, path)));
    }
  }
});

// Photo metadata is no longer a broad browser stream: own-copy filtering is
// enforced server-side, including legacy records without copyDeletions.
test('photo metadata is server-only and own-copy revision listeners cannot expose another viewer', async () => {
  await seedWorkspace();
  for (const context of [owner, anon, client(), client(B)]) {
    await assertFails(getDoc(ref(context, `hubPhotos/${PHOTO}`)));
    await assertFails(getDocs(scoped(context, 'hubPhotos')));
  }
  const path = `hubFileCopyRevisions/${PA}/viewers/client`;
  await assertSucceeds(getDoc(ref(client(), path))); // missing revision is safe
  await assertFails(getDoc(ref(client(B), path)));
  await assertFails(getDoc(ref(owner, path)));
  await assertSucceeds(getDoc(ref(owner, `hubFileCopyRevisions/${PA}/viewers/owner`)));
  await assertFails(getDoc(ref(client(), `hubFileCopyRevisions/${PA}/viewers/owner`)));
  for (const context of [owner, client(), anon]) await assertFails(setDoc(ref(context, path), { revision: 1 }));
});
