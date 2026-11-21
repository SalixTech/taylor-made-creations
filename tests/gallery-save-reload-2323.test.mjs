import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BackupError, createOwnerBackupService } from '../firebase/functions/owner-backups-core.mjs';
import { OWNER_UID } from '../firebase/functions/cleanup-core.mjs';

// All Firebase imports are mocked before evaluation. These tests never make a
// Firebase request, initialize the real SDK, or touch a real project/account.
const root = fileURLToPath(new URL('../src/', import.meta.url));
function fixture() {
  let raw = null, readError = null, writeError = null, beforeRead = null, afterRead = null, afterCallable = null, retryDocument;
  let reads = 0, commits = 0, appInitializations = 0, authInitializations = 0;
  let publicRaw = null, publicAssetsRaw = null;
  const cloudFiles = new Map(), privateRecovery = new Map(), callableInputs = [];
  const lookup = path => path === 'ownerWorkspace/current' ? raw : path === 'site/published' ? publicRaw : path === 'site/publishedAssets' ? publicAssetsRaw : path.startsWith('ownerFiles/') ? cloudFiles.get(path.slice(11)) ?? null : privateRecovery.get(path) ?? null;
  const user = { uid: 'a4ARjp0z8ZOByKlC2AfGzmMRj843', email: 'owner@example.test', reload: async () => {}, getIdToken: async () => 'mock-token' };
  const auth = { currentUser: user };
  const db = {};
  const appMocks = { getApps: () => [], initializeApp: options => { ++appInitializations; return { name: 'tmc-private-owner', options }; } };
  const authMocks = { browserSessionPersistence: { type: 'SESSION' }, initializeAuth: (_app, options) => { ++authInitializations; assert.equal(options.persistence.type, 'SESSION'); return auth; } };
  const snapshot = value => ({ exists: () => value !== null, data: () => structuredClone(value) });
  const liteMocks = {
    getFirestore: () => db,
    doc: (actualDb, ...parts) => { const path = parts.join('/'); assert.equal(actualDb, db); assert.ok(['ownerWorkspace/current', 'site/published', 'site/publishedAssets', 'ownerDraftIndex/current'].includes(path) || /^ownerDraft(?:s|Trash)\/draft-[a-f0-9-]{36}$/.test(path) || /^ownerFiles\/[a-f0-9-]{36}$/.test(path)); return { path }; },
    getDoc: async ref => { ++reads; await beforeRead?.(ref.path); if (readError) throw readError; const result = snapshot(lookup(ref.path)); await afterRead?.(ref.path); return result; },
    runTransaction: async (_db, transform) => {
      let pending = new Map();
      const transaction = {
        get: async ref => { ++reads; await beforeRead?.(ref.path); if (readError) throw readError; const result = snapshot(lookup(ref.path)); await afterRead?.(ref.path); return result; },
        set: (ref, data) => { pending.set(ref.path, structuredClone(data)); },
        create: (ref, data) => { assert.equal(lookup(ref.path), null, `immutable create ${ref.path}`); assert.equal(pending.has(ref.path), false); pending.set(ref.path, structuredClone(data)); },
      };
      let result = await transform(transaction);
      if (retryDocument !== undefined) { raw = structuredClone(retryDocument); retryDocument = undefined; pending = new Map(); result = await transform(transaction); }
      if (writeError) throw typeof writeError === 'function' ? writeError() : writeError;
      if (pending.size) { if (pending.has('ownerWorkspace/current')) raw = pending.get('ownerWorkspace/current'); if (pending.has('site/published')) publicRaw = pending.get('site/published'); if (pending.has('site/publishedAssets')) publicAssetsRaw = pending.get('site/publishedAssets'); for (const [path, value] of pending) if (!['ownerWorkspace/current', 'site/published', 'site/publishedAssets'].includes(path)) privateRecovery.set(path, value); ++commits; }
      return result;
    },
  };
  const toAdmin = snap => ({ exists: snap.exists(), data: () => snap.exists() ? snap.data() : undefined });
  const adminDb = { doc: path => ({ path, get: async () => toAdmin(await liteMocks.getDoc({ path })) }), runTransaction: callback => liteMocks.runTransaction(db, tx => callback({ get: async ref => toAdmin(await tx.get(ref)), set: tx.set, create: tx.create })) };
  const service = createOwnerBackupService({ db: adminDb });
  const functionsMocks = { getFunctions: () => ({}), httpsCallable: (_functions, name) => async input => {
    assert.equal(name, 'tmcOwnerPublishContent'); callableInputs.push(structuredClone(input));
    try { const data = await service.publishContent(input, { auth: { uid: OWNER_UID } }); await afterCallable?.(); return { data }; }
    catch (cause) { const error = new Error(cause instanceof BackupError ? cause.message : cause?.name === 'OwnerValidationError' ? 'The website content is invalid. Nothing was saved or published.' : 'This action could not be confirmed.'); error.code = `functions/${cause instanceof BackupError ? cause.code : cause?.name === 'OwnerValidationError' ? 'invalid-argument' : 'unavailable'}`; throw error; }
  } };
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (!extname(path)) path += '.ts';
    if (cache.has(path)) return cache.get(path).exports;
    const compiledModule = { exports: {} }; cache.set(path, compiledModule);
    const source = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) { compiledModule.exports = JSON.parse(source); return compiledModule.exports; }
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const require = name => name === 'firebase/functions' ? functionsMocks : name === 'firebase/app' ? appMocks : name === 'firebase/auth' ? authMocks : name === 'firebase/firestore/lite' ? liteMocks : name.startsWith('@/') ? load(resolve(root, name.slice(2))) : name.startsWith('.') ? load(resolve(dirname(path), name)) : (() => { throw new Error(`Unexpected import ${name}`); })();
    new Function('require', 'module', 'exports', output)(require, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  const storeModule = load(resolve(root, 'owner/firebase-store.ts'));
  const client = load(resolve(root, 'owner/firebase-client.ts'));
  const defaults = load(resolve(root, 'owner/defaults.ts'));
  const model = load(resolve(root, 'owner/model.ts'));
  return {
    storeModule, client, defaults, model, user, auth, db,
    store: () => storeModule.createFirebaseOwnerStore({ db, auth, ownerUid: 'a4ARjp0z8ZOByKlC2AfGzmMRj843' }),
    state: () => ({ raw: structuredClone(raw), reads, commits, appInitializations, authInitializations }),
    raw: value => { raw = structuredClone(value); },
    publicRaw: () => structuredClone(publicRaw),
    publicAssetsRaw: () => structuredClone(publicAssetsRaw),
    recovery: () => structuredClone(privateRecovery), callableInputs, afterCallable: value => { afterCallable = value; },
    cloudFile: (id, value) => cloudFiles.set(id, structuredClone(value)),
    setPublicRaw: value => { publicRaw = structuredClone(value); },
    readError: value => { readError = value; }, writeError: value => { writeError = value; },
    beforeRead: value => { beforeRead = value; }, afterRead: value => { afterRead = value; }, retryDocument: value => { retryDocument = value; },
  };
}

import {harness,nodes,content} from './owner-ui-harness.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function portalFixture(t,store){const h=harness();h.window.location.href='/taylor/photos';h.window.location.origin='https://tmc.test';h.globals.setTimeout=h.window.setTimeout=()=>1;h.globals.clearTimeout=h.window.clearTimeout=()=>{};h.window.setInterval=()=>1;h.window.clearInterval=()=>{};h.overrides['./use-draft-recovery']={useDraftRecovery:()=>({flush:()=>true,stop(){},cloud:{enabled:false,stop(){},checkpointSaved:async()=>{},acknowledgePublication(){}},candidates:[],unavailable:[]})};for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};const props={mode:'cloud',userEmail:'owner@example.test',initialSection:'photos',recoveryIdentity:{projectId:'taylor-made-creations',ownerUid:'a4ARjp0z8ZOByKlC2AfGzmMRj843',assertCurrent(){}},onSignOut:async()=>{},store};const Portal=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(Portal,props),gallery=()=>h.find(n=>n.type?.name==='PhotoGalleryManager');render();await tick();render();await tick();render();t.after(()=>h.unmount());return{h,render,gallery};}
for(const action of ['Save draft','Publish live'])test(`actual delete → Save photos → ${action} → fresh portal reload preserves removed association`,async t=>{
 const f=fixture(),store=f.store();let saved=await store.publishLive(f.defaults.createDefaultOwnerContent(),0);const photo=saved.draft.gallery[0],originalSource=photo.src;
 const p=await portalFixture(t,store),m=harness(),Manager=m.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
 m.render(Manager,p.gallery().props);const list=m.find(n=>n.type?.name==='OwnerPriceReorderList');nodes(list.props.children(photo,null)).find(n=>n.props['aria-label']===`Remove photo: ${photo.name}`).props.onClick();p.render();const confirmation=p.h.find(n=>n.type?.name==='Dialog'&&n.props.title.startsWith('Remove “'));nodes(confirmation.props.actions).find(n=>content(n)==='Remove').props.onClick();p.render();assert.equal(p.gallery().props.content.gallery.some(x=>x.id===photo.id),false);
 m.render(Manager,p.gallery().props);m.find(n=>n.type==='button'&&content(n)==='Save photos').props.onClick();p.render();const chooser=p.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Save your changes');assert.ok(chooser);await nodes(chooser.props.actions).find(n=>content(n)===action).props.onClick();for(let i=0;i<4;i++){await tick();p.render();}
 assert.equal(p.gallery().props.content.gallery.some(x=>x.id===photo.id),false);saved=await store.load();assert.equal(saved.draft.gallery.some(x=>x.id===photo.id),false,content(p.h.tree));
 if(action==='Save draft'){const retained=f.recovery(),index=retained.get('ownerDraftIndex/current');assert.ok(index);assert.equal(Object.keys(index.drafts).length,1);const id=Object.keys(index.drafts)[0],named=f.storeModule.decodeOwnerNamedDraft(retained.get(`ownerDrafts/${id}`),id);assert.deepEqual(named.content,saved.draft);assert.equal(named.content.gallery.some(x=>x.id===photo.id),false);}
 const reopened=await portalFixture(t,store);assert.equal(reopened.gallery().props.content.gallery.some(x=>x.id===photo.id),false);
 const live=JSON.parse(f.publicRaw().payload).content;assert.equal(live.gallery.some(x=>x.id===photo.id),action==='Save draft');assert.equal(photo.src,originalSource);assert.ok([...f.recovery().keys()].every(k=>!k.startsWith('deleted-media/')));m.unmount();
});
