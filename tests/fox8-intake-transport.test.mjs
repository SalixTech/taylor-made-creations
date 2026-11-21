// Offline callable contract integration: real Firebase web SDK + the real
// Firebase Functions HTTP wrapper + intake service. Only persistence is an
// explicitly in-memory adapter. This does NOT establish deployed IAM/Firestore.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';
import { tmcHubRequestCode, tmcSubmitCommissionRequest, tmcHubResolveCodeRequest, tmcHubLinkCommissionRequest, tmcReadCommissionReference, tmcDenyCommissionRequest, tmcSetCommissionRequestTrashed } from '../firebase/functions/intake.mjs';
import { emptyDraft } from '../firebase/functions/commission-validation/commission-model.mjs';
const backendRequire = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = backendRequire('firebase-admin/app');
const { getFirestore } = backendRequire('firebase-admin/firestore');
const { getStorage } = backendRequire('firebase-admin/storage');
const { getAuth } = backendRequire('firebase-admin/auth');
// The Functions wrapper caches its Admin app after the first authenticated call.
// Keep that real app alive for this serial file; each fixture still replaces and
// restores all persistence/auth methods and owns a fresh in-memory database.
const adminApp = initializeAdmin({ projectId: 'demo-fox8-intake' });
after(async () => { await deleteAdmin(adminApp); });
const { OWNER_UID } = await import('../firebase/functions/cleanup-core.mjs');
const { getApps, deleteApp } = appRequire('firebase/app');
const sharp = backendRequire('sharp');
const endpoints = { tmcHubRequestCode, tmcSubmitCommissionRequest, tmcHubResolveCodeRequest, tmcHubLinkCommissionRequest, tmcReadCommissionReference, tmcDenyCommissionRequest, tmcSetCommissionRequestTrashed };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const terms = { title: 'Fixture terms', blocks: [{ id: 'one', type: 'text', body: 'Local in-memory testing only.' }] };
const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
const recovery = (operationId = id(1)) => ({ operationId, name: 'Fixture client', email: 'fixture@example.test', message: 'Fixture code request', website: '' });
const commission = (operationId = id(2)) => ({ operationId, name: 'Fixture fox', email: 'fixture@example.test', draft: { ...emptyDraft, email: 'fixture@example.test', character: 'Fixture fox', species: 'Fox', tos: 'Yes', tosAgreed: true, usa: 'Yes', suit: 'Head only' }, termsIdentity: JSON.stringify(terms), termsAgreed: true, references: [{ fileName: 'fixture.png', contentType: 'image/png', base64: png.toString('base64') }], website: '' });
const snapshot = value => ({ exists: value !== undefined, data: () => structuredClone(value) });
function assertFirestoreValue(value, inArray = false) {
  assert.notEqual(value, undefined, 'Firestore rejects undefined');
  if (Array.isArray(value)) { assert.equal(inArray, false, 'Firestore rejects direct nested arrays'); value.forEach(item => assertFirestoreValue(item, true)); }
  else if (value && typeof value === 'object') Object.values(value).forEach(item => assertFirestoreValue(item));
}
class MemoryDb {
  docs = new Map(); tail = Promise.resolve(); writes = 0;
  doc = path => ({ path, get: async () => snapshot(this.docs.get(path)) });
  runTransaction = work => {
    const result = this.tail.then(async () => {
      let writing = false; const writes = [];
      const tx = { get: async ref => { assert.equal(writing, false); return snapshot(this.docs.get(ref.path)); } };
      for (const kind of ['set', 'create', 'update']) tx[kind] = (ref, value) => { writing = true; assertFirestoreValue(value); writes.push({ kind, path: ref.path, value: structuredClone(value) }); };
      const value = await work(tx), next = new Map(this.docs);
      for (const write of writes) {
        if (write.kind === 'create') assert.equal(next.has(write.path), false);
        if (write.kind === 'update') assert.equal(next.has(write.path), true);
        next.set(write.path, write.kind === 'update' ? { ...next.get(write.path), ...write.value } : write.value);
      }
      this.docs = next; this.writes += writes.length; return value;
    });
    this.tail = result.catch(() => {}); return result;
  };
}
async function fixture(t) {
  const previousProject = process.env.GCLOUD_PROJECT, previousEmulator = process.env.FUNCTIONS_EMULATOR;
  process.env.GCLOUD_PROJECT = 'demo-fox8-intake'; process.env.FUNCTIONS_EMULATOR = 'true';
  const app = adminApp;
  const db = new MemoryDb(), objects = new Map(), requests = [], responses = [];
  const database = getFirestore(app), storage = getStorage(app), auth = getAuth(app);
  t.mock.method(database, 'doc', db.doc); t.mock.method(database, 'runTransaction', db.runTransaction);
  const bucket = { file: path => ({
    save: async (bytes, options) => { if (objects.has(path)) throw Object.assign(new Error('Fixture exists'), { code: 412 }); objects.set(path, { bytes: Buffer.from(bytes), metadata: { ...options.metadata, size: String(bytes.length) } }); },
    getMetadata: async () => [objects.get(path).metadata], download: async () => [objects.get(path).bytes],
  }) };
  t.mock.method(storage, 'bucket', () => bucket);
  const verify = t.mock.method(auth, 'verifyIdToken', async () => { throw new Error('Public requests must not verify owner tokens.'); });
  db.docs.set('site/access', { schemaVersion: 1, revision: 1, constructionMode: false });
  db.docs.set('site/published', { payload: JSON.stringify({ content: { site: { commissionStatus: 'Open!' }, pages: [{ ...terms, builtinKey: 'terms' }] } }) });
  let transportMode = 'normal';
  async function invoke(endpoint, input, method = 'POST', extraHeaders = {}) {
    const headers = { 'content-type': 'application/json', origin: 'https://fixture.invalid', ...extraHeaders };
    const req = { method, headers, body: { data: input }, ip: 'fixture-ip', header: name => headers[name.toLowerCase()], get: name => headers[name.toLowerCase()] };
    const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
    res.getHeader = name => res.headers[name.toLowerCase()];
    res.set = (name, value) => { res.setHeader(name, value); return res; };
    res.status = status => { res.statusCode = status; return res; };
    res.end = () => { res.emit('finish'); return res; };
    res.send = body => { res.body = body; return res.end(); };
    req.res = res; await endpoint(req, res); responses.push(res);
    return { status: res.statusCode, json: async () => res.body };
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://us-central1-demo-fox8-intake.cloudfunctions.net');
    const name = target.pathname.slice(1); assert.ok(endpoints[name], 'No external network or unrelated endpoint is permitted');
    assert.equal(options.method, 'POST'); if (!['tmcDenyCommissionRequest','tmcSetCommissionRequestTrashed'].includes(name)) assert.equal(options.headers.Authorization, undefined, 'Public app never sends owner auth');
    const envelope = JSON.parse(options.body); assert.deepEqual(Object.keys(envelope), ['data']); requests.push({ name, input: envelope.data });
    if (transportMode === 'missing') return { status: 404, json: async () => { throw new Error('HTML response'); } };
    if (transportMode === 'denied') return { status: 403, json: async () => { throw new Error('HTML response'); } };
    if (transportMode === 'malformed') return { status: 200, json: async () => ({ result: { accepted: true, message: '' } }) };
    const response = await invoke(endpoints[name], envelope.data, 'POST', options.headers.Authorization ? { authorization: options.headers.Authorization } : {});
    if (transportMode === 'lost-response') { transportMode = 'normal'; throw new Error('Fixture lost response after real handler committed'); }
    return response;
  });
  // All actual sockets are forbidden. The fetch bridge above never opens one.
  const forbidden = () => { throw new Error('Network forbidden in offline intake contract test'); };
  for (const protocol of ['node:http', 'node:https']) { t.mock.method(appRequire(protocol), 'request', forbidden); t.mock.method(appRequire(protocol), 'get', forbidden); }
  t.mock.method(appRequire('node:net').Socket.prototype, 'connect', forbidden);
  let config = { status: 'ready', options: { projectId: 'demo-fox8-intake', apiKey: 'fixture-not-a-secret', appId: 'fixture-web-app' } };
  const client = sourceLoader({ '@/client-hub/client': { readClientHubFirebaseConfig: () => config } })('src/intake/client.ts');
  t.after(async () => {
    for (const clientApp of getApps().filter(entry => ['tmc-public-intake','fox11-owner-intake-fixture'].includes(entry.name))) await deleteApp(clientApp);
    t.mock.restoreAll();
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = previousProject;
    if (previousEmulator === undefined) delete process.env.FUNCTIONS_EMULATOR; else process.env.FUNCTIONS_EMULATOR = previousEmulator;
  });
  return { client, db, objects, bucket, requests, responses, verify, invoke, setMode: mode => { transportMode = mode; }, setConfig: value => { config = value; } };
}

test('real web SDK through real callable HTTP boundary saves recovery and commission into isolated persistence', async t => {
  const f = await fixture(t);
  for (const [name, input] of [['tmcHubRequestCode', recovery()], ['tmcSubmitCommissionRequest', commission()]]) {
    assert.equal((await f.client.sendPublicIntake(name, input)).accepted, true);
    assert.equal(f.responses.at(-1).headers['access-control-allow-origin'], 'https://fixture.invalid');
    assert.equal(f.responses.at(-1).headers['cache-control'], 'private, no-store');
  }
  assert.equal(f.db.docs.get(`hubCodeRecoveryRequests/${id(1)}`).status, 'open');
  const saved = f.db.docs.get(`commissionRequests/${id(2)}`);
  assert.equal(saved.status, 'received'); assert.ok(saved.answers.every(row => typeof row.label === 'string' && typeof row.value === 'string'));
  assert.equal(f.objects.size, 1); assert.equal(saved.references[0].contentType, 'image/jpeg');
  assert.equal(f.verify.mock.callCount(), 0);
  assert.equal([...f.db.docs.keys()].some(path => /hubClients|hubClientSecrets|hubCodeIndex/.test(path)), false);
});

test('post-commit lost response then same SDK retry returns one recovery and one commission without extra quota', async t => {
  const f = await fixture(t);
  for (const [name, input, collection] of [['tmcHubRequestCode', recovery(), 'hubCodeRecoveryRequests/'], ['tmcSubmitCommissionRequest', commission(), 'commissionRequests/']]) {
    f.setMode('lost-response');
    await assert.rejects(f.client.sendPublicIntake(name, input), error => error.code === 'functions/internal' && /not be reached or confirmed/.test(error.message));
    const writes = f.db.writes;
    assert.equal((await f.client.sendPublicIntake(name, input)).accepted, true);
    assert.equal(f.db.writes, writes); assert.equal([...f.db.docs.keys()].filter(path => path.startsWith(collection)).length, 1);
  }
  assert.equal(f.db.docs.get('publicIntakeLimits/global').count, 2); assert.equal(f.objects.size, 1);
});

test('callable preflight is browser-origin compatible and never calls persistence', async t => {
  const f = await fixture(t);
  for (const endpoint of Object.values(endpoints)) {
    const result = await f.invoke(endpoint, {}, 'OPTIONS');
    assert.equal(result.status, 204);
    assert.equal(f.responses.at(-1).headers['access-control-allow-origin'], 'https://fixture.invalid');
  }
  assert.equal(f.db.writes, 0); assert.equal(f.objects.size, 0);
});

test('missing endpoint, IAM rejection, and malformed success are distinct non-success outcomes', async t => {
  const f = await fixture(t);
  for (const [mode, code, message] of [['missing', 'functions/not-found', /not set up/], ['denied', 'functions/permission-denied', /access check/], ['malformed', 'invalid-response', /not confirmed/]]) {
    f.setMode(mode);
    await assert.rejects(f.client.sendPublicIntake('tmcHubRequestCode', recovery()), error => error.code === code && error.endpoint === 'tmcHubRequestCode' && message.test(error.message));
  }
  assert.equal(f.db.writes, 0); assert.equal(f.objects.size, 0);
});

test('backend access failures expose only an allowlisted support code, never private provider text', async t => {
  const f = await fixture(t), privateText = 'PRIVATE_CONTACT_TOKEN_PROVIDER_BODY';
  t.mock.method(getFirestore(), 'runTransaction', async () => { throw Object.assign(new Error(privateText), { code: 7, details: privateText }); });
  const logs = []; t.mock.method(process.stderr, 'write', line => { logs.push(String(line)); return true; });
  await assert.rejects(f.client.sendPublicIntake('tmcHubRequestCode', recovery()), error => error.code === 'functions/unavailable' && error.supportCode === 'INTAKE_BACKEND_ACCESS' && !JSON.stringify(error).includes(privateText));
  assert.equal(JSON.stringify(f.responses.at(-1).body).includes(privateText), false);
  assert.equal(logs.join('').includes(privateText), false); assert.ok(logs.join('').includes('INTAKE_BACKEND_ACCESS'));
  assert.equal(f.db.writes, 0);
});

test('published closure blocks commission, not recovery, at actual callable boundary', async t => {
  const f = await fixture(t); f.db.docs.set('site/access', { schemaVersion: 1, revision: 2, constructionMode: true });
  await assert.rejects(f.client.sendPublicIntake('tmcSubmitCommissionRequest', commission()), error => error.code === 'functions/failed-precondition' && /under construction/.test(error.message));
  assert.equal(f.objects.size, 0); assert.equal((await f.client.sendPublicIntake('tmcHubRequestCode', recovery())).accepted, true);
});

test('public caller cannot invoke owner linking, resolution, or private reference reads', async t => {
  const f = await fixture(t);
  for (const endpoint of [tmcHubLinkCommissionRequest, tmcHubResolveCodeRequest, tmcReadCommissionReference, tmcDenyCommissionRequest]) {
    const result = await f.invoke(endpoint, {}); assert.equal(result.status, 403); assert.equal((await result.json()).error.status, 'PERMISSION_DENIED');
  }
  assert.equal(f.db.writes, 0); assert.equal(f.verify.mock.callCount(), 0);
});

test('public named app refuses changed connection configuration rather than silently using the old app', async t => {
  const f = await fixture(t); await f.client.sendPublicIntake('tmcHubRequestCode', recovery());
  f.setConfig({ status: 'ready', options: { projectId: 'changed-project', apiKey: 'fixture-not-a-secret', appId: 'fixture-web-app' } });
  await assert.rejects(f.client.sendPublicIntake('tmcHubRequestCode', recovery(id(3))), /connection changed/);
  assert.equal(f.requests.length, 1);
});

test('verified owner reads the private reference, links an approved request, and handles recovery through real HTTP wrappers', async t => {
  const f = await fixture(t);
  await f.client.sendPublicIntake('tmcHubRequestCode', recovery());
  await f.client.sendPublicIntake('tmcSubmitCommissionRequest', commission());
  const token = 'fixture-owner-token', headers = { authorization: `Bearer ${token}` };
  f.verify.mock.mockImplementation(async value => { assert.equal(value, token); return { uid: OWNER_UID }; });
  const saved = f.db.docs.get(`commissionRequests/${id(2)}`);
  let result = await f.invoke(tmcReadCommissionReference, { requestId: id(2), index: 0 }, 'POST', headers);
  assert.equal(result.status, 200);
  const reference = (await result.json()).result;
  assert.equal(reference.contentType, 'image/jpeg'); assert.equal(reference.fileName, saved.references[0].fileName);
  assert.equal(Buffer.from(reference.base64, 'base64').length, saved.references[0].size);
  const clientId = 'TMC-1111111111111111', projectId = id(9);
  f.db.docs.set(`commissionRequests/${id(2)}`, { ...saved, status: 'approved', version: 1 });
  f.db.docs.set(`hubClients/${clientId}`, { clientId, status: 'active', authVersion: 1 });
  f.db.docs.set(`hubProjects/${projectId}`, { projectId, clientId, requestId: null, version: 1 });
  const link = { requestId: id(2), expectedVersion: 1, clientId, projectId };
  for (let n = 0; n < 2; n++) {
    result = await f.invoke(tmcHubLinkCommissionRequest, link, 'POST', headers); assert.equal(result.status, 200);
    result = await f.invoke(tmcHubResolveCodeRequest, { requestId: id(1), expectedVersion: 1 }, 'POST', headers); assert.equal(result.status, 200);
  }
  assert.deepEqual(f.db.docs.get(`hubRequestLinks/${id(2)}`), { clientId, projectId });
  assert.equal(f.db.docs.get(`hubProjects/${projectId}`).version, 2);
  assert.equal(f.db.docs.get(`hubCodeRecoveryRequests/${id(1)}`).status, 'closed');
  assert.equal(f.db.docs.get(`hubCodeRecoveryRequests/${id(1)}`).version, 2);
  assert.equal([...f.db.docs.keys()].some(path => /hubClientSecrets|hubCodeIndex/.test(path)), false);
  assert.ok(f.verify.mock.calls.some(call => call.arguments[1] === true), 'Owner actions recheck revocation after callable token verification');
});

test('all intake callable discovery records remain bounded, secret-free and in the configured region', () => {
  for (const endpoint of Object.values(endpoints)) {
    assert.deepEqual(endpoint.__endpoint.region, ['us-central1']);
    assert.deepEqual(endpoint.__endpoint.callableTrigger, {});
    assert.deepEqual(endpoint.__endpoint.secretEnvironmentVariables ?? [], []);
    assert.equal(endpoint.__endpoint.maxInstances, 2); assert.equal(endpoint.__endpoint.concurrency, 2);
    assert.equal(endpoint.__endpoint.timeoutSeconds, 60);
  }
});


test('real owner client SDK serializes metadata-only denial through the real HTTP callable and rejects destructive input', async t => {
  const f=await fixture(t);
  await f.client.sendPublicIntake('tmcSubmitCommissionRequest',commission());
  const {initializeApp}=appRequire('firebase/app'),{getFunctions}=appRequire('firebase/functions');
  const ownerApp=initializeApp({projectId:'demo-fox8-intake',apiKey:'fixture-not-a-secret',appId:'fixture-owner'},'fox11-owner-intake-fixture');
  // The auth token provider is synthetic; the SDK encoder, headers, HTTP wrapper,
  // owner token checks and service are real. No socket or real identity is used.
  const functions=getFunctions(ownerApp,'us-central1'),token='fixture-owner-denial-token';
  functions.contextProvider.auth={getToken:async()=>({accessToken:token})};
  let currentChecks=0;
  const ownerClient=sourceLoader({'./taylor-services-client':{taylorOwnerSession:async()=>({auth:{app:ownerApp},assertCurrent:()=>currentChecks++})}})('src/owner/intake-client.ts');
  f.verify.mock.mockImplementation(async value=>{assert.equal(value,token);return {uid:OWNER_UID};});
  const before=structuredClone(f.db.docs.get(`commissionRequests/${id(2)}`)),beforeObjects=structuredClone(f.objects);
  const storage=t.mock.method(f.bucket,'file',()=>{throw Error('Deny must never access Storage');});
  let writes=f.db.writes;
  await assert.rejects(ownerClient.callOwnerIntake('tmcDenyCommissionRequest',{requestId:id(2),expectedVersion:0,confirmPermanentReferenceDeletion:true}),error=>error.code==='functions/invalid-argument');
  assert.equal(f.db.writes,writes);assert.equal(storage.mock.callCount(),0);
  f.verify.mock.mockImplementation(async()=>({uid:'not-owner'}));
  await assert.rejects(ownerClient.denyCommissionRequest(id(2),0),error=>error.code==='functions/permission-denied');
  assert.equal(f.db.writes,writes);
  f.verify.mock.mockImplementation(async value=>{assert.equal(value,token);return {uid:OWNER_UID};});
  const result=await ownerClient.denyCommissionRequest(id(2),0);
  assert.deepEqual(result,{status:'denied',version:1});
  assert.deepEqual(f.requests.at(-1),{name:'tmcDenyCommissionRequest',input:{requestId:id(2),expectedVersion:0,confirmDenial:true}});
  const saved=f.db.docs.get(`commissionRequests/${id(2)}`);
  assert.equal(saved.status,'denied');assert.equal(saved.version,1);assert.deepEqual(saved.references,before.references);assert.deepEqual(saved.answers,before.answers);assert.equal(Object.hasOwn(saved,'referencePurge'),false);
  assert.deepEqual(structuredClone(f.objects),beforeObjects);assert.equal(storage.mock.callCount(),0);assert.ok(currentChecks>0);
  writes=f.db.writes;
  await assert.rejects(ownerClient.denyCommissionRequest(id(2),0),error=>error.code==='functions/aborted');
  assert.deepEqual(await ownerClient.denyCommissionRequest(id(2),1),result);assert.equal(f.db.writes,writes);assert.equal(storage.mock.callCount(),0);
  assert.ok(f.verify.mock.calls.some(call=>call.arguments[1]===true),'Owner revocation is rechecked');
});

test('real SDK trash receipt survives lost response, preserves references and rejects owner impersonation',async t=>{
 const f=await fixture(t);await f.client.sendPublicIntake('tmcSubmitCommissionRequest',commission());
 const {initializeApp}=appRequire('firebase/app'),{getFunctions}=appRequire('firebase/functions');
 const app=initializeApp({projectId:'demo-fox8-intake',apiKey:'fixture-not-a-secret',appId:'fixture-owner'},'fox11-owner-intake-fixture');
 const functions=getFunctions(app,'us-central1'),token='fixture-owner-trash-token';functions.contextProvider.auth={getToken:async()=>({accessToken:token})};
 const load=sourceLoader({'./taylor-services-client':{taylorOwnerSession:async()=>({auth:{app},assertCurrent(){}})}}),client=load('src/owner/commission-requests-client.ts');
 f.verify.mock.mockImplementation(async()=>({uid:'not-owner'}));const request={id:id(2),version:0};await assert.rejects(client.setCommissionRequestTrashed(request,true,id(920)),e=>e.code==='functions/permission-denied');
 f.verify.mock.mockImplementation(async()=>({uid:OWNER_UID}));const before=structuredClone(f.db.docs.get(`commissionRequests/${id(2)}`));const storage=t.mock.method(f.bucket,'file',()=>{throw Error('Trash must not access Storage')});
 f.setMode('lost-response');await assert.rejects(client.setCommissionRequestTrashed(request,true,id(920)));const writes=f.db.writes;const result=await client.setCommissionRequestTrashed(request,true,id(920));assert.equal(result.version,1);assert.ok(result.trashedAt);assert.equal(f.db.writes,writes);assert.equal(storage.mock.callCount(),0);
 assert.deepEqual(f.requests.at(-1).input,{requestId:id(2),expectedVersion:0,trashed:true,operationId:id(920)});const saved=f.db.docs.get(`commissionRequests/${id(2)}`);assert.deepEqual(saved.references,before.references);assert.equal(saved.status,before.status);
 await client.setCommissionRequestTrashed({...request,version:1},false,id(921));assert.equal(f.db.docs.get(`commissionRequests/${id(2)}`).trashedAt,null);assert.equal(storage.mock.callCount(),0);
});
