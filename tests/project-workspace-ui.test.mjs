import { chatDraftStorageFixture } from './helpers/chat-draft-storage.mjs';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';

// Teardown must run even when an assertion fails: real workspace timers/listeners
// must not keep the test worker alive and hide the failed assertion.
const fixtures = new Set();
function trackedHarness() { const h = harness(); fixtures.add(h); return h; }
afterEach(() => { for (const h of fixtures) h.unmount(); fixtures.clear(); });

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const CLIENT = 'TMC-0123456789ABCDEF', PROJECT = '11111111-1111-4111-8111-111111111111', ISO = '2026-10-26T20:00:00.000Z';
const project = { clientId: CLIENT, projectId: PROJECT, title: 'Cloud fox partial', summary: 'A soft cream fox with burgundy ears.', status: 'in-progress', progress: 35, progressSource: 'manual', trackingUrl: null, trelloUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO };
const savedMessage = (body = 'Hello Taylor', id = '22222222-2222-4222-8222-222222222222') => ({ messageId: id, projectId: PROJECT, clientId: CLIENT, senderRole: 'client', body, createdAt: ISO });
const savedPhoto = (id = '33333333-3333-4333-8333-333333333333') => ({ photoId: id, projectId: PROJECT, clientId: CLIENT, storagePath: `hub-progress/${CLIENT}/${PROJECT}/${id}`, fileName: 'progress.png', caption: 'Ear shape', contentType: 'image/png', size: 100, createdAt: ISO });
const empty = () => ({ messages: [], photos: [], requests: [], requestReplies: [], notifications: [], visibility: [], privateWorkspace: null });
function setup(options = {}) {
  const h = trackedHarness(), calls = [], dirty = [], busy = [], sessionErrors = [], live = [];
  h.globals.AbortController = AbortController;
  h.overrides['./client'] = { clientHubErrorMessage: error => error.message || 'Could not connect', isClientHubSessionError: error => error.code === 'session-expired' };
  h.overrides['./workspace-client'] = {...chatDraftStorageFixture(h), async getHubCommissionFolders(){return {version:0,folderNames:options.folderNames ?? []};},
    clearHubPhotoCache() {},
    async getHubUpdateRequestCooldown() { return { clientId: CLIENT, settingsRevision: 0, revision: 0, overrideDays: null, effectiveDays: 7, source: 'global', lastRequestedAt: null, nextEligibleAt: null, eligible: true, serverNow: ISO, resetAt: null }; },
    subscribeProjectWorkspace(project, owner, onData, onError) { const sub = { project, owner, onData, onError, stopped: false }; live.push(sub); return () => { sub.stopped = true; }; },
    async markHubConversationRead(...args) { calls.push({ method: "read", args }); return { notification: null }; },
    async listHubPhotoFolder(...args) { calls.push({ method: "folder", args }); return options.folder ? options.folder(...args) : options.data?.photos ?? []; },
    async loadProjectWorkspace(...args) { calls.push({ method: 'load', args }); return options.load ? options.load(...args) : options.data ?? empty(); },
    async sendHubMessage(...args) { calls.push({ method: 'message', args }); return options.send ? options.send(...args) : { message: savedMessage(args[2], args[3]) }; },
    async uploadHubPhoto(...args) { calls.push({ method: 'photo', args }); return options.upload ? options.upload(...args) : { photo: savedPhoto(args[3]) }; },
    async createHubSupportRequest(...args) { calls.push({ method: 'request', args }); const input = args[2]; return { request: { ...input, requestId: input.operationId, clientId: CLIENT, projectId: PROJECT, status: 'open', response: '', version: 1, createdAt: ISO, updatedAt: ISO } }; },
    async resolveHubSupportRequest(request, response) { calls.push({ method: 'resolve', request, response }); return { request: { ...request, response, status: 'resolved', version: request.version + 1 } }; },
    async saveHubPrivateWorkspace(...args) { calls.push({ method: 'private', args }); return { workspace: { projectId: PROJECT, clientId: CLIENT, notes: args[2], materials: args[3], version: (args[1]?.version ?? 0) + 1, updatedAt: ISO } }; },
    async loadHubPhotoBlob() { return new Blob(['photo'], { type: 'image/png' }); },
  };
  h.overrides['./file-copy-client'] = { ...h.overrides['./file-copy-client'], async deleteHubFileCopy(...args) { calls.push({ method: 'delete-copy', args }); return { deleted: true }; } };
  const Component = h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace;
  const props = { project, owner: !!options.owner, disabled: !!options.disabled, onDirtyChange: value => dirty.push(value), onBusyChange: value => busy.push(value), onSessionError: error => sessionErrors.push(error) };
  const render = () => h.render(Component, props);
  const button = label => h.find(node => node.type === 'button' && (content(node) === label || node.props['aria-label'] === label));
  const textarea = ending => h.find(node => node.type === 'textarea' && node.props.id?.endsWith(ending));
  const formOf = name => h.find(node => node.type === 'form' && node.props.className === name);
  render();
  return { h, calls, dirty, busy, sessionErrors, live, props, render, button, textarea, formOf, async ready() { await flush(); render(); } };
}

test('workspace loads only the selected commission and offers keyboard-accessible sections without fake integrations', async () => {
  const t = setup(); await t.ready();
  assert.equal(t.calls[0].args[0].projectId, PROJECT); assert.equal(t.calls[0].args[1], false);
  const tabs = t.h.all(node => node.props.role === 'tab'); assert.deepEqual(tabs.map(content), ['Overview', 'Maker Chat', 'Photos', 'Requests']);
  assert.equal(tabs[0].props['aria-selected'], true); assert.equal(tabs[0].props.tabIndex, 0);
  tabs[0].props.onKeyDown({ key: 'ArrowRight', preventDefault() {} }); t.render();
  assert.equal(t.h.all(node => node.props.role === 'tab')[1].props['aria-selected'], true);
  assert.equal(t.live.length, 1); assert.equal(t.live[0].project.projectId, PROJECT); assert.ok(t.button("Refresh")); assert.doesNotMatch(content(t.h.tree), /live connection unavailable/); assert.doesNotMatch(content(t.h.tree), /Stripe|Pay now|Synced with Trello/); t.h.unmount();
});

test('load errors keep writes disabled; a successful retry enables real actions', async () => {
  let attempt = 0; const t = setup({ load: async () => { if (!attempt++) throw Error('Workspace setup is incomplete.'); return empty(); } }); await t.ready();
  assert.match(content(t.h.tree), /Workspace setup is incomplete/); assert.equal(t.textarea('-message').props.disabled, true);
  t.button('Check saved updates').props.onClick(); await t.ready(); assert.equal(t.textarea('-message').props.disabled, false); t.h.unmount();
});

test('repeated message submit is locked and only acknowledged success clears the draft', async () => {
  const pending = deferred(), t = setup({ send: () => pending.promise }); await t.ready();
  t.textarea('-message').props.onChange({ target: { value: 'A tiny detail about the ears.' } }); t.render();
  const submit = t.formOf('composer').props.onSubmit; submit({ preventDefault() {} }); submit({ preventDefault() {} }); t.render();
  assert.equal(t.calls.filter(item => item.method === 'message').length, 1); assert.equal(t.textarea('-message').props.value, 'A tiny detail about the ears.'); assert.equal(t.textarea('-message').props.disabled, true);
  const operation = t.calls.find(item => item.method === 'message').args[3]; pending.resolve({ message: savedMessage('A tiny detail about the ears.', operation) }); await t.ready();
  assert.equal(t.textarea('-message').props.value, ''); assert.match(content(t.h.tree), /Sent ·/); assert.equal(t.button("Dismiss workspace notice"), undefined); assert.equal(t.busy.at(-1), false); t.h.unmount();
});

test('uncertain message retry retains the exact body and operation ID rather than creating a duplicate', async () => {
  let attempt = 0; const t = setup({ send: async (...args) => { if (!attempt++) throw Error('The response was lost.'); return { message: savedMessage(args[2], args[3]) }; } }); await t.ready();
  t.textarea('-message').props.onChange({ target: { value: 'Keep this draft safe.' } }); t.render(); t.formOf('composer').props.onSubmit({ preventDefault() {} }); await t.ready();
  assert.equal(t.textarea('-message').props.readOnly, true); assert.ok(t.button('Retry message')); t.formOf('composer').props.onSubmit({ preventDefault() {} }); await t.ready();
  const calls = t.calls.filter(item => item.method === 'message'); assert.equal(calls.length, 2); assert.deepEqual(calls[0].args, calls[1].args); assert.equal(t.textarea('-message').props.value, ''); t.h.unmount();
});

test('photo upload retry keeps the same File and photo ID, and does not silently start a new upload', async () => {
  let attempt = 0; const t = setup({ owner: true, upload: async (...args) => { if (!attempt++) throw Error('Upload not confirmed'); return { photo: savedPhoto(args[3]) }; } }); await t.ready();
  const file = new File(['abc'], 'progress.png', { type: 'image/png' }); t.h.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file] } }); t.render();
  t.formOf('uploadForm').props.onSubmit({ preventDefault() {} }); await t.ready(); assert.equal(t.h.find(node => node.type === 'input' && node.props.type === 'file').props.disabled, true);
  t.formOf('uploadForm').props.onSubmit({ preventDefault() {} }); await t.ready(); const calls = t.calls.filter(item => item.method === 'photo'); assert.equal(calls.length, 2); assert.equal(calls[0].args[1], file); assert.deepEqual(calls[0].args, calls[1].args); assert.equal(t.button('Share photos').props.disabled, true); t.h.unmount();
});

test('gallery loads at most twelve photo previews and own-copy deletion requires confirmation without a support draft', async () => {
  const photos = Array.from({ length: 20 }, (_, i) => savedPhoto(`${String(i).padStart(8, '0')}-3333-4333-8333-333333333333`)); const t = setup({ data: { ...empty(), photos } }); await t.ready();
  const photoTab = t.h.all(node => node.props.role === 'tab')[2]; photoTab.props.onClick(); t.render(); const tiles = t.h.all(node => node.type?.name === 'PhotoTile'); assert.equal(tiles.length, 12);
  tiles[0].props.onDeleteCopy(); t.render(); let confirmation = t.h.find(node => node.type?.name === 'HubActionDialog'); assert.ok(confirmation); assert.equal(t.calls.filter(call => call.method === 'delete-copy').length, 0); confirmation.props.onClose(); t.render(); assert.equal(t.h.find(node => node.type?.name === 'HubActionDialog'), undefined);
  tiles[0].props.onDeleteCopy(); t.render(); confirmation = t.h.find(node => node.type?.name === 'HubActionDialog'); confirmation.props.onConfirm(); await t.ready(); const call = t.calls.find(call => call.method === 'delete-copy'); assert.deepEqual(call.args[2], { kind: 'photo', fileId: photos[0].photoId }); assert.equal(t.calls.filter(call => call.method === 'request').length, 0); assert.equal(t.h.all(node => node.type?.name === 'PhotoTile').some(node => node.props.photo.photoId === photos[0].photoId), false);
});

test('expired workspace sessions immediately remove private activity and notify the enclosing gate', async () => {
  let count = 0; const t = setup({ data: { ...empty(), messages: [savedMessage('Very private message')] }, load: async () => { if (count++) throw Object.assign(Error('Session no longer active'), { code: 'session-expired' }); return { ...empty(), messages: [savedMessage('Very private message')] }; } }); await t.ready(); assert.match(content(t.h.tree), /Very private message/);
  t.button('Refresh').props.onClick(); await t.ready(); assert.doesNotMatch(content(t.h.tree), /Very private message/); assert.equal(t.sessionErrors.length, 1); assert.equal(t.h.all(node => node.type === 'textarea').length, 0); t.h.unmount();
});

test('unmount aborts the project read and late records cannot revive a discarded workspace', async () => {
  const gate = deferred(), t = setup({ load: () => gate.promise }); await flush(); const signal = t.calls[0].args[2]; t.h.unmount(); assert.equal(signal.aborted, true); gate.resolve({ ...empty(), messages: [savedMessage('Late private message')] }); await flush(); assert.doesNotMatch(content(t.h.tree), /Late private message/);
});

test('owner has a genuinely private studio section and suspended clients cannot add activity', async () => {
  const t = setup({ owner: true, disabled: true }); await t.ready(); assert.ok(t.h.find(node => node.type?.name === 'StudioPanel')); assert.equal(t.textarea('-message').props.disabled, true); assert.match(content(t.h.tree), /Reactivate this client/); t.h.unmount();
});

test('studio save binds the edit baseline so a background refresh cannot silently overwrite another owner edit', async () => {
  const h = trackedHarness(), saves = []; h.overrides['@/owner/inventory-client'] = { async readInventory() { return { items: [] }; } };
  const Panel = h.load('src/client-hub/ProjectWorkspace.tsx').StudioPanel;
  const previous = { projectId: PROJECT, clientId: CLIENT, notes: 'Original private note', materials: [], version: 1, updatedAt: ISO };
  const props = { project, previous, busy: false, onDirtyChange() {}, async onSave(notes, materials, baseline) { saves.push({ notes, materials, baseline }); return { ...baseline, notes, materials, version: baseline.version + 1 }; } };
  const render = () => h.render(Panel, props); render(); await flush(); render();
  h.find(node => node.type === 'textarea').props.onChange({ target: { value: 'My unsaved private note' } }); render(); props.previous = { ...previous, notes: 'Another owner device changed it', version: 2 }; render();
  assert.equal(h.find(node => node.type === 'textarea').props.value, 'My unsaved private note'); assert.match(content(h.tree), /changed on another device/); assert.equal(h.find(node => node.type === 'button' && content(node) === 'Save private workspace').props.disabled, true);
  h.find(node => node.type === 'button' && content(node) === 'Load saved version').props.onClick(); render(); assert.equal(h.find(node => node.type === 'textarea').props.value, 'My unsaved private note'); h.find(node => node.type?.name === 'HubActionDialog').props.onConfirm(); await flush(); render(); assert.equal(h.find(node => node.type === 'textarea').props.value, 'Another owner device changed it'); assert.equal(saves.length, 0); h.unmount();
});

test('photo confirmation is dismissible immediately and its five-second timer never locks actions', async () => {
  const t = setup({ owner: true }); const timers = []; t.h.window.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return 100; }; t.h.window.clearTimeout = () => {}; await t.ready();
  t.h.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } }); t.render(); t.formOf('uploadForm').props.onSubmit({ preventDefault() {} }); await t.ready();
  assert.ok(timers.some(timer => timer.delay === 5_000)); assert.equal(t.textarea('-message').props.disabled, false); t.button('Dismiss workspace notice').props.onClick(); t.render(); assert.equal(t.button('Dismiss workspace notice'), undefined); t.h.unmount();
});

test('workspace source never turns private image reads into shareable token URLs or pretends to delete photos', () => {
  const source = readFileSync(new URL('../src/client-hub/ProjectWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /getDownloadURL|localStorage|sessionStorage|dangerouslySetInnerHTML|console\.|deleteObject|deleteDoc/);
  assert.match(source, /loadHubPhotoBlob/); assert.match(source, /URL\.revokeObjectURL/); assert.match(source, /subscribeProjectWorkspace/); assert.doesNotMatch(source, /25_000/); assert.match(source, /visibilityState/); assert.match(source, /progressSource === "trello"/); assert.match(source, /Last progress update received from Trello/);
});

test('photo polling with fresh decoded objects does not refetch the same bytes and unmount revokes its preview', async () => {
  const h = trackedHarness(), reads = [], revoked = []; h.globals.URL = { createObjectURL() { return 'blob:private-test'; }, revokeObjectURL(value) { revoked.push(value); } };
  h.overrides['./workspace-client'] = { async getHubCommissionFolders(){return {version:0,folderNames:options.folderNames ?? []};}, async loadHubPhotoBlob(photo) { reads.push(photo.photoId); return new Blob(['image']); } };
  const PhotoTile = h.load('src/client-hub/ProjectWorkspace.tsx').PhotoTile;
  const props = { photo: savedPhoto(), owner: false, onFailure() {}, onDeleteCopy() {} }; const render = () => h.render(PhotoTile, props);
  render(); await flush(); render(); assert.equal(reads.length, 1);
  props.photo = { ...props.photo }; render(); await flush(); render(); assert.equal(reads.length, 1, 'same immutable identity is not a new read'); assert.equal(revoked.length, 0);
  h.unmount(); assert.deepEqual(revoked, ['blob:private-test']);
});

test('hidden photo gallery does not mount photo readers and leaving it removes every reader', async () => {
  const t = setup({ data: { ...empty(), photos: [savedPhoto()] } }); await t.ready();
  assert.equal(t.h.all(node => node.type?.name === 'PhotoTile').length, 0);
  t.h.all(node => node.props.role === 'tab')[2].props.onClick(); t.render(); assert.equal(t.h.all(node => node.type?.name === 'PhotoTile').length, 1);
  t.h.all(node => node.props.role === 'tab')[0].props.onClick(); t.render(); assert.equal(t.h.all(node => node.type?.name === 'PhotoTile').length, 0); t.h.unmount();
});

test('a failed photo has an explicit isolated retry instead of a polling retry loop', async () => {
  const h = trackedHarness(); let reads = 0; h.globals.URL = { createObjectURL() { return 'blob:retried-photo'; }, revokeObjectURL() {} };
  h.overrides['./workspace-client'] = { async getHubCommissionFolders(){return {version:0,folderNames:options.folderNames ?? []};}, async loadHubPhotoBlob() { if (++reads === 1) throw Error('Network interrupted'); return new Blob(['image']); } };
  const PhotoTile = h.load('src/client-hub/ProjectWorkspace.tsx').PhotoTile; const props = { photo: savedPhoto(), owner: false, onFailure() {}, onDeleteCopy() {} }; const render = () => h.render(PhotoTile, props);
  render(); await flush(); render(); assert.match(content(h.tree), /could not be loaded/); props.photo = { ...props.photo }; render(); await flush(); assert.equal(reads, 1);
  h.find(node => node.type === 'button' && content(node) === 'Retry this photo').props.onClick(); render(); await flush(); render(); assert.equal(reads, 2); assert.equal(h.find(node => node.type === 'img').props.src, 'blob:retried-photo'); assert.equal(h.find(node => node.type === 'button' && content(node) === 'Retry this photo'), undefined); h.unmount();
});

test('double-click followed by a lost response retains the first operation ID for an exact retry', async () => {
  const pending = deferred(); let count = 0; const t = setup({ send: async (...args) => { if (++count === 1) return pending.promise; return { message: savedMessage(args[2], args[3]) }; } }); await t.ready();
  t.textarea('-message').props.onChange({ target: { value: 'Do not duplicate me' } }); t.render(); const submit = t.formOf('composer').props.onSubmit;
  submit({ preventDefault() {} }); submit({ preventDefault() {} }); t.render(); pending.reject(Error('Response lost after server saved')); await t.ready();
  t.formOf('composer').props.onSubmit({ preventDefault() {} }); await t.ready(); const calls = t.calls.filter(call => call.method === 'message'); assert.equal(calls.length, 2); assert.deepEqual(calls[0].args, calls[1].args); t.h.unmount();
});

test('Fox9 named photo retry preserves each chosen name and file while invalid names stay editable', async () => {
 let tries=0; const t=setup({owner:true,upload:async(...args)=>{if(!tries++)throw Error('Not confirmed');return{photo:{...savedPhoto(args[3]),fileName:`${args[5]}.png`}};}}); await t.ready();
 const file=new File(['abc'],'progress.png',{type:'image/png'});t.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});t.render();
 const name=()=>t.h.find(n=>n.type?.name==='ProgressPhotoQueue');name().props.onChange([file],['../bad']);t.render();
 t.formOf('uploadForm').props.onSubmit({preventDefault(){}});await t.ready();assert.equal(t.calls.filter(c=>c.method==='photo').length,0);assert.equal(name().props.disabled,false);
 name().props.onChange([file],['First fitting']);t.render();t.formOf('uploadForm').props.onSubmit({preventDefault(){}});await t.ready();assert.equal(name().props.disabled,true);
 t.formOf('uploadForm').props.onSubmit({preventDefault(){}});await t.ready();const calls=t.calls.filter(c=>c.method==='photo');assert.equal(calls.length,2);assert.equal(calls[0].args[5],'First fitting');assert.deepEqual(calls[0].args,calls[1].args);assert.equal(name(),undefined);
});

test('Fox11 progress queue owns its count after native chooser clears and after removing every photo', async () => {
 const t=setup({owner:true});await t.ready();t.button('Photos').props.onClick();t.render();
 const input=()=>t.h.find(n=>n.type==='input'&&n.props.type==='file'&&!('webkitdirectory' in n.props));
 const file=new File(['x'],'fox.png',{type:'image/png'}),target={files:[file],value:'C:\\fakepath\\fox.png'};
 input().props.onChange({target});t.render();assert.equal(target.value,'');const queue=t.h.find(n=>n.type?.name==='ProgressPhotoQueue');assert.deepEqual(queue.props.files,[file]);queue.props.onChange([],[]);t.render();assert.equal(t.h.find(n=>n.type?.name==='ProgressPhotoQueue'),undefined);assert.match(content(t.h.tree),/0 selected/);
 input().props.onChange({target:{files:[file],value:'same file'}});t.render();assert.equal(t.h.find(n=>n.type?.name==='ProgressPhotoQueue').props.files[0],file);t.h.unmount();
});


test('saved commission folders use themed selector and cannot change through a disabled workspace', async () => {
 const t=setup({owner:true,folderNames:['Head fittings','Tail']});await t.ready();t.button('Photos').props.onClick();await t.ready();
 const chooser=()=>t.h.find(n=>n.type?.name==='SiteSelect'&&n.props.id?.endsWith('-saved-folder'));
 assert.ok(chooser());assert.deepEqual(chooser().props.options.map(v=>v.value),['','Head fittings','Tail']);chooser().props.onChange('Tail');t.render();
 const folder=()=>t.h.find(n=>n.type==='input'&&n.props.placeholder==='Optional new folder name');assert.equal(folder().props.value,'Tail');
 t.props.disabled=true;t.render();chooser().props.onChange('Head fittings');t.render();assert.equal(folder().props.value,'Tail');
});

test('Fox12 Maker Chat restores separate shared history beside its connection status without restoring support access',async()=>{
 const t=setup({owner:true});await t.ready();t.button('Maker Chat').props.onClick();t.render();
 const history=t.button('Shared attachments');assert.ok(history);history.props.onClick({currentTarget:{isConnected:true}});t.render();assert.equal(t.h.find(n=>n.type?.name==='MakerChatAttachments').props.openRequest.mode,'history');
 t.button('Attach files').props.onClick({currentTarget:{isConnected:true}});t.render();assert.equal(t.h.find(n=>n.type?.name==='MakerChatAttachments').props.openRequest.mode,'upload');
 assert.equal(t.button('Attach files to support request'),undefined);assert.equal(t.button('Shared support and chat attachments'),undefined);t.h.unmount();
});

test('Fox13 Maker Chat durable text removes navigation dirtiness but uncertain sends never proceed after storage failure',async()=>{
 const t=setup();await t.ready();t.textarea('-message').props.onChange({target:{value:'Keep my commission text'}});t.render();
 assert.equal(t.dirty.at(-1),false);assert.match(content(t.h.tree),/Unsent text saved on this browser/);
 t.h.window.localStorage.setItem=()=>{throw Error('quota');};t.formOf('composer').props.onSubmit({preventDefault(){}});await t.ready();
 assert.equal(t.calls.filter(c=>c.method==='message').length,0);assert.equal(t.dirty.at(-1),true);assert.equal(t.textarea('-message').props.value,'Keep my commission text');assert.match(content(t.h.tree),/Sending is paused/);t.h.unmount();
});
test('Fox13 stale cross-window draft never sends or deletes the newer window text',async()=>{
 const t=setup();await t.ready();t.textarea('-message').props.onChange({target:{value:'Old tab'}});t.render();
 const storage=t.h.window.localStorage,k=storage.key(0),record=JSON.parse(storage.getItem(k));storage.setItem(k,JSON.stringify({...record,message:'Newer tab',updatedAt:Date.now()+1}));
 t.formOf('composer').props.onSubmit({preventDefault(){}});await t.ready();assert.equal(t.calls.filter(c=>c.method==='message').length,0);assert.equal(JSON.parse(storage.getItem(k)).message,'Newer tab');assert.equal(t.textarea('-message').props.value,'Old tab');t.h.unmount();
});

test('explicit tab intent scrolls after render to expose chat composer under sticky header; live updates never yank page',async()=>{
 const t=setup({owner:true});await t.ready();const frames=new Map(),scrolls=[];let id=0;
 t.h.window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};t.h.window.cancelAnimationFrame=id=>frames.delete(id);t.h.window.innerHeight=800;t.h.window.scrollY=100;t.h.window.scrollTo=value=>scrolls.push(value);t.h.window.getComputedStyle=()=>({position:'sticky'});t.h.document.querySelectorAll=()=>[{getBoundingClientRect:()=>({top:0,bottom:100})}];
 const workspace=t.h.find(n=>n.type==='section'&&n.props['data-active-tab']).props.ref.current;workspace.closest=()=>null;workspace.getBoundingClientRect=()=>({top:450,bottom:1200,height:750});
 const composer=t.formOf('composer').props.ref.current;composer.getBoundingClientRect=()=>({top:1000,bottom:1180,height:180});
 t.button('Maker Chat').props.onClick();assert.equal(scrolls.length,0);t.render();assert.equal(frames.size,1);[...frames.values()][0]();frames.clear();assert.deepEqual(scrolls,[{top:492,behavior:'auto'}]);
 t.live[0].onData({...empty(),messages:[savedMessage('background update')]});t.render();assert.equal(frames.size,0);assert.equal(scrolls.length,1);
 t.button('Overview').props.onClick();t.render();const old=[...frames.values()][0];t.button('Photos').props.onClick();t.render();old();assert.equal(scrolls.length,1);assert.equal(frames.size,1);
 t.h.unmount();for(const fn of frames.values())fn();assert.equal(scrolls.length,1);
});
test('tab focus never scrolls the page behind a popup or after newer external navigation',async()=>{
 const t=setup({owner:true});await t.ready();const frames=new Map(),scrolls=[];let id=0;t.h.window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};t.h.window.cancelAnimationFrame=id=>frames.delete(id);t.h.window.scrollTo=value=>scrolls.push(value);
 const workspace=t.h.find(n=>n.type==='section'&&n.props['data-active-tab']).props.ref.current;workspace.closest=()=>({});t.button('Maker Chat').props.onClick();t.render();[...frames.values()][0]();frames.clear();assert.equal(scrolls.length,0);
 workspace.closest=()=>null;t.button('Overview').props.onClick();t.render();const prior=[...frames.values()][0];t.props.navigation={tab:'photos',projectId:PROJECT};t.render();prior();assert.equal(scrolls.length,0);assert.equal(frames.size,0);t.h.unmount();
});
test('late initial generic read failure cannot overwrite a newer verified live snapshot or erase a draft',async()=>{
 const read=deferred(),t=setup({load:()=>read.promise});await t.ready();t.live[0].onData({...empty(),messages:[savedMessage('Live confirmed')]});t.render();t.textarea('-message').props.onChange({target:{value:'Keep local text'}});t.render();read.reject(Error('Old read failed'));await t.ready();assert.match(content(t.h.tree),/Live confirmed/);assert.doesNotMatch(content(t.h.tree),/Old read failed|That could not be confirmed/);assert.equal(t.textarea('-message').props.value,'Keep local text');assert.equal(t.sessionErrors.length,0);t.h.unmount();
});
test('late initial authorization failure still revokes after newer live snapshot',async()=>{
 const read=deferred(),t=setup({load:()=>read.promise});await t.ready();t.live[0].onData({...empty(),messages:[savedMessage('Private live content')]});t.render();read.reject(Object.assign(Error('Session expired'),{code:'session-expired'}));await t.ready();assert.doesNotMatch(content(t.h.tree),/Private live content/);assert.equal(t.sessionErrors.length,1);assert.equal(t.h.all(n=>n.type==='textarea').length,0);t.h.unmount();
});
test('Fox17 request composer keeps help and Send request in one compact footer with no attachment control',async()=>{
 const t=setup();await t.ready();t.button('Requests').props.onClick();t.render();const form=t.h.find(n=>n.type==='form'&&n.props['data-request-composer']),footer=form.props.children.find(n=>n?.props?.className==='formFooter');assert.ok(footer);assert.match(content(footer),/Enter sends.*Send request/);assert.equal(t.h.all(n=>n.type==='form'&&n.props['data-request-composer']).length,1);assert.doesNotMatch(content(form),/Attach files/);const textarea=form.props.children.find(n=>n?.type==='label').props.children.find(n=>n?.type==='textarea');assert.equal(textarea.props.maxLength,4000);assert.equal(textarea.props.required,true);
});
test('Fox18 discard registration recovers after read error and permits safe local validation drafts',async()=>{
 let reads=0;const t=setup({owner:true,load:async()=>{if(!reads++)throw Error('Temporary read failure');return empty();}});let available; t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();await t.ready();t.button('Check saved updates').props.onClick();await t.ready();assert.equal(typeof available,'function');assert.equal(available(),true);
 t.button('Photos').props.onClick();t.render();t.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['bad'],'bad.txt',{type:'text/plain'})],value:''}});t.render();t.formOf('uploadForm').props.onSubmit({preventDefault(){}});t.render();assert.match(content(t.h.tree),/Choose up to 50/);assert.equal(t.calls.filter(c=>c.method==='photo').length,0);assert.equal(typeof available,'function');assert.equal(available(),true);assert.ok(t.dirty.at(-1));t.h.unmount();
});
test('Fox18 registered discard function rechecks pending writes and true attempts survive healthy read',async()=>{
 const pending=deferred(),t=setup({send:()=>pending.promise});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();const earlier=available;assert.equal(earlier(),true);
 t.textarea('-message').props.onChange({target:{value:'Keep uncertain text'}});t.render();t.formOf('composer').props.onSubmit({preventDefault(){}});assert.equal(earlier(),false,'old parent callback must synchronously block the pending write');t.render();assert.equal(available,null);pending.reject(Error('Response lost'));await t.ready();assert.equal(available,null);
 t.button('Check saved updates').props.onClick();await t.ready();assert.equal(available,null);assert.equal(t.dirty.at(-1),true,'durably saved uncertain attempt must still block parent discard');assert.match(content(t.h.tree),/Keep uncertain text/);t.h.unmount();
});
test('Fox18 discard stays unavailable for authorization revocation and active attachment work',async()=>{
 const t=setup();await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();const initial=available;
 const attachments=t.h.find(n=>n.type?.name==='MakerChatAttachments');attachments.props.onBusyChange(true);t.render();assert.equal(available,null);attachments.props.onBusyChange(false);attachments.props.onDirtyChange(true);t.render();assert.equal(available,null);attachments.props.onDirtyChange(false);t.render();assert.equal(typeof available,'function');
 t.live[0].onError(Object.assign(Error('Session revoked'),{code:'session-expired'}));assert.equal(initial(),false);t.render();assert.equal(available,null);assert.equal(t.sessionErrors.length,1);t.h.unmount();
});
test('Fox18 untracked Studio write uncertainty is independent from notification dismissal and unrelated successful writes',async()=>{
 const t=setup({owner:true});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();t.button('Studio notes').props.onClick();t.render();const studio=()=>t.h.find(n=>n.type?.name==='StudioPanel');let fail=true;t.h.overrides['./workspace-client'].saveHubPrivateWorkspace=async(p,b,notes,materials)=>{if(fail)throw Error('Studio response lost');return {workspace:{projectId:PROJECT,clientId:CLIENT,notes,materials,version:(b?.version??0)+1,updatedAt:ISO}};};
 await studio().props.onSave('Uncertain notes',[],null);t.render();assert.equal(available,null);t.button('Dismiss workspace error').props.onClick();t.render();assert.equal(available,null);
 t.button('Refresh').props.onClick();await t.ready();assert.equal(available,null);fail=false;await studio().props.onSave('Different notes',[],null);t.render();assert.equal(available,null,'a different payload must not erase earlier uncertainty');assert.equal(t.dirty.at(-1),true,'parent navigation must still see retained uncertainty as work');await studio().props.onSave('Uncertain notes',[],null);t.render();assert.equal(typeof available,'function');assert.equal(available(),true);t.h.unmount();
});
test('Fox18 Studio uncertainty only clears after matching acknowledged payload at a newer version',async()=>{
 const t=setup({owner:true});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();const studio=()=>t.h.find(n=>n.type?.name==='StudioPanel');const baseline={projectId:PROJECT,clientId:CLIENT,version:5,notes:'Before',materials:[],updatedAt:ISO};let ack=null;
 t.h.overrides['./workspace-client'].saveHubPrivateWorkspace=async()=>{if(ack===null)throw Error('Response lost');return {workspace:{...baseline,version:ack,notes:'After'}};};
 await studio().props.onSave('After',[],baseline);t.render();assert.equal(available,null);
 ack=5;await studio().props.onSave('After',[],baseline);t.render();assert.equal(available,null,'unchanged version cannot discharge uncertainty');
 ack=7;await studio().props.onSave('After',[],{...baseline,version:6});t.render();assert.equal(typeof available,'function');assert.equal(available(),true);t.h.unmount();
});
test('Fox18 request/photo attempts and cooldown guards remain nondiscardable after recovery reads',async()=>{
 for(const kind of ['request','photo']){
  const waiting=deferred(),t=setup({owner:kind==='photo',upload:()=>waiting.promise});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>{available=fn;};t.render();
  if(kind==='request'){t.h.overrides['./workspace-client'].createHubSupportRequest=()=>waiting.promise;t.button('Requests').props.onClick();t.render();t.h.find(n=>n.type==='form'&&n.props['data-request-composer']).props.children.find(n=>n?.type==='label').props.children.find(n=>n?.type==='textarea').props.onChange({target:{value:'Keep request'}});t.render();t.h.find(n=>n.type==='form'&&n.props['data-request-composer']).props.onSubmit({preventDefault(){}});}
  else{t.button('Photos').props.onClick();t.render();t.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['png'],'fox.png',{type:'image/png'})],value:''}});t.render();t.formOf('uploadForm').props.onSubmit({preventDefault(){}});}
  t.render();assert.equal(available,null);waiting.reject(Error('Upload/write response lost'));await t.ready();t.button('Check saved updates').props.onClick();await t.ready();assert.equal(available,null);t.h.unmount();
 }
 const t=setup({owner:true});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>available=fn;t.render();const control=t.h.find(n=>n.type?.name==='UpdateRequestCooldownControl');control.props.onDirtyChange(true);t.render();assert.equal(available,null);control.props.onDirtyChange(false);control.props.onBusyChange(true);t.render();assert.equal(available,null);t.h.unmount();
});
test('Fox18 mismatched Studio acknowledgement cannot discharge retained write uncertainty',async()=>{
 const t=setup({owner:true});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>available=fn;t.render();const studio=()=>t.h.find(n=>n.type?.name==='StudioPanel');let wrong=true;t.h.overrides['./workspace-client'].saveHubPrivateWorkspace=async()=>({workspace:{projectId:PROJECT,clientId:CLIENT,notes:wrong?'Wrong notes':'Wanted notes',materials:[],version:1,updatedAt:ISO}});
 await studio().props.onSave('Wanted notes',[],null);t.render();assert.equal(available,null);assert.equal(t.dirty.at(-1),true);assert.match(content(t.h.tree),/did not confirm these notes/);wrong=false;await studio().props.onSave('Wanted notes',[],null);t.render();assert.equal(typeof available,'function');t.h.unmount();
});
test('Fox18 mismatched visibility target/action cannot discharge uncertainty; exact acknowledged hide can',async()=>{
 const request={requestId:'22222222-2222-4222-8222-222222222222',projectId:PROJECT,clientId:CLIENT,type:'support',body:'Help',status:'open',version:1,createdAt:ISO,updatedAt:ISO},t=setup({owner:true,data:{...empty(),requests:[request]}});await t.ready();let available;t.props.onDiscardAvailabilityChange=fn=>available=fn;t.render();t.button('Requests').props.onClick();t.render();let wrong=true;t.h.overrides['./workspace-client'].setHubConversationVisibility=async(p,o,input)=>({visibility:{visibilityId:'visibility',projectId:PROJECT,clientId:CLIENT,channel:'requests',requestId:wrong?'other-request':input.requestId,version:1,hidden:true,capturedRequestVersion:1}});
 let card=t.h.find(n=>n.type?.name==='RequestCard');card.props.onHide();await t.ready();assert.equal(available,null);assert.equal(t.dirty.at(-1),true);assert.match(content(t.h.tree),/not confirmed for this conversation/);wrong=false;card=t.h.find(n=>n.type?.name==='RequestCard');card.props.onHide();await t.ready();assert.equal(typeof available,'function');t.h.unmount();
});
test('commission shared chat color updates both-view client bubbles and participates in dirty/write/discard guards',async()=>{for(const owner of [false,true]){const t=setup({owner});const discard=[];t.props.onDiscardAvailabilityChange=value=>discard.push(value);await t.ready();const editor=()=>t.h.find(n=>n.type?.name==='RefSheetChatColor');assert.equal(editor().props.project.projectId,PROJECT);assert.equal(editor().props.owner,owner);editor().props.onDirtyChange(true);editor().props.onBusyChange(true);t.render();assert.equal(t.dirty.at(-1),true);assert.equal(t.busy.at(-1),true);assert.equal(discard.at(-1),null);editor().props.onSaved({...project,version:2,refSheetChatColor:'#123456'});editor().props.onBusyChange(false);editor().props.onDirtyChange(false);t.render();assert.equal(t.h.find(n=>n.props['aria-label']==='Maker Chat messages').props.style['--ref-chat-color'],'#123456');assert.equal(t.busy.at(-1),false);assert.equal(t.dirty.at(-1),false);}});
