import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const id = '11111111-1111-4111-8111-111111111111';
const folderId = '22222222-2222-4222-8222-222222222222';
const childId = '33333333-3333-4333-8333-333333333333';
const file = { id, schemaVersion: 1, revision: 2, kind: 'photo', name: 'Private cloud photo', parentId: 'root', contentType: 'image/webp', bytes: 1024, width: 500, height: 300, status: 'ready', trashedAt: null, createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
const source = `/api/cloud-media/${id}`;
function setup(options = {}) {
  const h = harness(), calls = [], selected = [];
  const library = { files: [{ ...file }], folders: { schemaVersion: 1, revision: 0, folders: {} }, loading: false, ready: true, error: '', async refresh() { calls.push({ method: 'refresh' }); }, ...options.library };
  const methods = {
    async readCloudFileOrder() { return {schemaVersion:1,revision:0,keys:[]}; },
    async saveCloudFileOrder(parentId, order, moving, target, after) { calls.push({method:"order",parentId,order,moving,target,after}); },
    async changeCloudFile(value, change) { calls.push({ method: 'file', value, change }); if (options.fileChange) return options.fileChange(value, change); return { ...value, ...change }; },
    async changeCloudFolder(registry, id, change) { calls.push({ method: 'folder', registry, id, change }); return {...registry,revision:registry.revision+1,folders:{...registry.folders,[id]:{...registry.folders[id],...change}}}; },
    async ensureCloudFontsFolder() { calls.push({method:'fonts'}); return library.folders; },
    async readCloudCleanupStatus() { return {available:true,automaticCleanupEnabled:false,lastRunAt:null,message:'Ready',...options.cleanup}; },
    async permanentDeleteCloudFiles(files) { calls.push({method:'purge',files}); return options.purge ? options.purge(files) : {deletedIds:files.map(f=>f.id),blockedIds:[],failedIds:[]}; },
    async permanentlyDeleteEmptyCloudFolders(registry,ids) { calls.push({method:'purge-folders',registry,ids}); return registry; },
    async confirmCloudUpload(value) { calls.push({ method: 'recover', value }); },
    async createCloudWebsitePhoto(value,convertOptions) { calls.push({method:'website-photo',value,options:convertOptions}); return options.websitePhoto ? options.websitePhoto(value,convertOptions) : file; },
    async checkCloudStorage() { calls.push({ method: 'probe' }); return 'Actual Storage read probe succeeded; upload access is unverified.'; },
    async downloadCloudFile(value, signal) { calls.push({ method: 'download', value, signal }); return new Blob(['pdf'], { type: 'application/pdf' }); },
    async uploadCloudFile(value, uploadOptions) { calls.push({ method: 'upload', value, options: uploadOptions }); if (options.upload) return options.upload(value, uploadOptions); uploadOptions.onProgress(50); return file; },
  };
  if (options.URL) h.globals.URL = options.URL;
  h.currentContext = { begin(cancel) { calls.push({ method: 'begin', cancel }); return () => calls.push({ method: 'end' }); } };
  h.overrides['./PhotoUpload'] = { UploadActivity: {} };
  h.overrides['./cloud-files-client'] = methods;
  h.overrides['./use-cloud-files'] = { useCloudFiles: () => library };
  h.overrides['./media-client'] = { useOwnerMediaSource: () => ({ src: 'blob:private-image', error: null }) };
  const Hub = h.load('src/owner/CloudFileHub.tsx').CloudFileHub;
  const render = () => h.render(Hub, { manager: true, ...options.props });
  render();
  const button = label => h.find(n => n.type === 'button' && (content(n) === label || n.props['aria-label'] === label));
  const dialog = () => h.find(n => n.type?.name === 'Dialog');
  const action = label => nodes(dialog().props.actions).find(n => n.type === 'button' && content(n) === label);
  return { h, calls, selected, library, render, button, dialog, action };
}
test('File Hub exposes compact usage with truthful billing detail and no fake connection success', () => {
  const t = setup(); assert.match(content(t.h.tree), /1 file · 1 KB, including Trash/); assert.match(t.h.find(n=>n.props.title?.includes('billing')).props.title,/billing total may differ/); assert.match(content(t.h.tree), /Storage read access has not been checked/); assert.equal(t.button('Empty Trash'), undefined); assert.equal(t.button('Use photo'), undefined); assert.ok(t.button('New folder')); t.h.unmount();
});
test('photo picker All photos includes ready nested images but excludes PDFs, pending and inherited-trash photos', () => {
  const chosen = [];
  const t = setup({ props: { manager: false, onSelect: src => chosen.push(src) }, library: { folders: { schemaVersion: 1, revision: 2, folders: { [folderId]: { name: 'Hidden', parentId: 'root', trashedAt: '2026-10-26T00:00:00.000Z' }, [childId]: { name: 'Active', parentId: 'root', trashedAt: null } } }, files: [file, { ...file, id: folderId, parentId: childId, name: 'Nested' }, { ...file, id: childId, parentId: folderId, name: 'Trashed inherited' }, { ...file, id: '44444444-4444-4444-8444-444444444444', kind: 'pdf', name: 'Private PDF' }, { ...file, id: '55555555-5555-4555-8555-555555555555', status: 'uploading', name: 'Pending' }] } });
  t.button('All photos').props.onClick(); t.render();
  assert.match(content(t.h.tree), /Nested/); assert.doesNotMatch(content(t.h.tree), /Trashed inherited|Private PDF|Check completed upload/); assert.equal(t.h.all(n => n.type === 'li').length, 2); assert.deepEqual(chosen, []);
  t.button(`Use photo: ${file.name}`).props.onClick(); assert.deepEqual(chosen, [source]); t.h.unmount();
});
test('view and dialog close leave current selection and URL unchanged', () => {
  const t = setup(); t.button('View').props.onClick(); t.render(); assert.equal(t.dialog().props.title, file.name); assert.ok(t.h.find(n => n.type?.name === 'PrivatePhoto')); t.action('Close photo').props.onClick(); t.render(); assert.equal(t.dialog(), undefined); assert.equal(t.h.window.location.href, ''); assert.equal(t.calls.length, 0); t.h.unmount();
});
test('new folder is inline, cancellation does not write, and Enter saves its name', async () => {
  const t = setup(); t.button('New folder').props.onClick(); t.render(); assert.equal(t.dialog(),undefined); t.button('Cancel').props.onClick(); t.render(); assert.equal(t.calls.length,0);
  t.button('New folder').props.onClick(); t.render(); t.h.find(n=>n.type==='input'&&n.props['aria-label']==='New folder name').props.onChange({target:{value:' Project files '}}); t.render();
  t.h.find(n=>n.type==='input'&&n.props['aria-label']==='New folder name').props.onKeyDown({key:'Enter',preventDefault(){}}); await flush(); t.render();
  const call=t.calls.find(c=>c.method==='folder'); assert.equal(call.change.name,'Project files'); assert.equal(call.change.parentId,'root'); assert.equal(call.registry.revision,0); assert.equal(t.dialog(),undefined); t.h.unmount();
});
test('Trash confirmation is recoverable, repeated submits issue one write, and dismissal cannot conceal a pending change', async () => {
  const gate = deferred(), t = setup({ fileChange: () => gate.promise });
  // The first Trash button is the section tab; use the file action.
  t.h.all(n => n.type === 'button' && content(n) === 'Trash').at(-1).props.onClick(); t.render();
  assert.match(content(t.dialog()), /No bytes are deleted/); assert.match(content(t.dialog()), /Existing page and published photo references are kept/);
  t.action('Move to Trash').props.onClick(); t.action('Move to Trash').props.onClick(); t.render(); assert.equal(t.calls.filter(c => c.method === 'file').length, 1); assert.equal(t.dialog().props.dismissDisabled, true);
  t.dialog().props.onClose(); t.render(); assert.ok(t.dialog()); gate.resolve(file); await flush(); t.render(); assert.equal(t.dialog(), undefined); assert.match(content(t.h.tree), /Moved to Trash/); t.h.unmount();
});
test('failed rename remains editable and does not show saved status; refresh follows uncertain writes', async () => {
  const t = setup({ fileChange: async () => { throw Error('Changed on another device'); } }); t.button('Rename').props.onClick(); t.render(); t.h.find(n => n.type === 'input' && n.props.maxLength === 150).props.onChange({ target: { value: 'New name' } }); t.render(); t.button('Save name').props.onClick(); await flush(); t.render(); assert.equal(t.dialog(),undefined); assert.match(content(t.h.tree), /Changed on another device/); assert.doesNotMatch(content(t.h.tree), /Change saved in Firebase/); assert.ok(t.calls.some(c => c.method === 'refresh')); t.h.unmount();
});
test('folder move chooser excludes itself and descendants, using frozen registry revision', () => {
  const folders = { schemaVersion: 1, revision: 8, folders: { [folderId]: { name: 'Parent', parentId: 'root', trashedAt: null }, [childId]: { name: 'Child', parentId: folderId, trashedAt: null } } };
  const t = setup({ library: { folders, files: [] } }); t.button('Move').props.onClick(); t.render(); const select=t.h.find(n=>n.type?.name==='SiteSelect'); assert.deepEqual(select.props.options.map(n=>n.value),['root']); assert.equal(t.dialog().props.dismissDisabled, false); t.h.unmount();
});
test('pending files expose check-completed-upload; recovery does not upload bytes again', async () => {
  const t = setup({ library: { files: [{ ...file, status: 'uploading' }] } }); assert.equal(t.button('View'), undefined); t.button('Check completed upload').props.onClick(); await flush(); t.render(); assert.ok(t.calls.some(c => c.method === 'recover')); assert.equal(t.calls.some(c => c.method === 'upload'), false); assert.match(content(t.h.tree), /Completed upload verified/); t.h.unmount();
});
test('upload progress and stop are truthful; upload does not choose a photo and repeat starts are ignored', async () => {
  const gate = deferred(), chosen = [], t = setup({ props: { manager: false, onSelect: value => chosen.push(value) }, upload: (_file, options) => { options.onProgress(35); return gate.promise; } });
  const input = t.h.find(n => n.type === 'input' && n.props.type === 'file'); const incoming = new File(['sample'], 'photo.png', { type: 'image/png' }); input.props.onChange({ target: { files: [incoming] } }); input.props.onChange({ target: { files: [incoming] } }); t.render(); assert.equal(t.calls.filter(c => c.method === 'upload').length, 1); assert.equal(t.h.find(n => n.type === 'progress').props.value, 35); assert.deepEqual(chosen, []);
  t.button('Stop upload').props.onClick(); assert.equal(t.calls.find(c => c.method === 'upload').options.signal.aborted, true); gate.resolve(file); await flush(); t.render(); assert.match(content(t.h.tree), /Upload stopped/); assert.doesNotMatch(content(t.h.tree), /1 file saved to Firebase/); assert.deepEqual(chosen, []); t.h.unmount();
});
test('unmount cancels uploads and ignores late completion; auth-loss view hides names and messages', async () => {
  const gate = deferred(), t = setup({ upload: () => gate.promise }); const incoming = new File(['sample'], 'Sensitive photo.png', { type: 'image/png' }); t.h.find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [incoming] } }); t.render(); const signal = t.calls.find(c => c.method === 'upload').options.signal;
  t.library.ready = false; t.library.loading = false; t.library.files = []; t.library.error = 'Owner session changed'; t.render(); assert.equal(signal.aborted, true); assert.doesNotMatch(content(t.h.tree), /Sensitive photo|Private cloud photo/); t.h.unmount(); gate.resolve(file); await flush(); assert.equal(t.calls.some(c => c.method === 'refresh'), false);
});
test('PDF never opens an iframe or new tab; download flow hands a blob attachment to browser', async () => {
  const t = setup({ library: { files: [{ ...file, kind: 'pdf', contentType: 'application/pdf', name: 'Project brief.pdf', width: 0, height: 0 }] } }); let clicked = 0, removed = 0, appended;
  t.h.document.createElement = () => ({ click() { clicked++; }, remove() { removed++; } }); t.h.document.body.append = element => { appended = element; }; t.h.window.setTimeout = callback => { callback(); return 0; };
  assert.equal(t.button('View'), undefined); assert.equal(t.h.find(n => ['iframe', 'object', 'embed'].includes(n.type)), undefined); t.button('Download PDF').props.onClick(); await flush(); t.render(); assert.equal(clicked, 1); assert.equal(removed, 1); assert.equal(appended.download, 'Project brief.pdf'); assert.match(appended.href, /^blob:/); assert.equal(t.h.window.location.href, ''); t.h.unmount();
});
test('logout revokes downloaded object URLs and clears photo dialogs before access returns', async () => {
  const revoked = [], t = setup({ URL: { createObjectURL: () => 'blob:private-download', revokeObjectURL: value => revoked.push(value) } });
  t.h.document.createElement = () => ({ click() {}, remove() {} }); t.h.document.body.append = () => {}; t.h.window.setTimeout = () => 0;
  t.button('Download').props.onClick(); await flush(); t.render(); t.button('View').props.onClick(); t.render(); assert.ok(t.dialog());
  t.library.ready = false; t.library.loading = false; t.library.files = []; t.render(); assert.deepEqual(revoked, ['blob:private-download']); await flush();
  t.library.ready = true; t.library.files = [file]; t.render(); assert.equal(t.dialog(), undefined); assert.doesNotMatch(content(t.h.tree), /File handed to your browser/); t.h.unmount();
});
test('access check reports only after awaited result; denied/unconfigured metadata leaves controls unavailable', async () => {
  const t = setup(); t.button('Check storage access').props.onClick(); t.render(); assert.doesNotMatch(content(t.h.tree), /Actual Storage read probe succeeded/); await flush(); t.render(); assert.match(content(t.h.tree), /Actual Storage read probe succeeded/); t.h.unmount();
  const denied = setup({ library: { ready: false, error: 'Cloud files access was denied', files: [] } }); assert.equal(denied.button('Upload files').props.disabled, true); assert.equal(denied.button('New folder').props.disabled, true); assert.match(content(denied.h.tree), /No local fallback was used/); denied.h.unmount();
});
function hookSetup(reader) {
  const h = harness(); let authCallback, valid = true, result;
  h.overrides['./cloud-files-client'] = { CLOUD_FILES_EVENT: 'cloud-files', readCloudFiles: reader };
  h.overrides['./taylor-services-client'] = { taylorOwnerSession: async () => ({ assertCurrent() { if (!valid) throw Error('Owner changed'); }, auth: { onAuthStateChanged(callback) { authCallback = callback; return () => {}; } } }) };
  const { useCloudFiles } = h.load('src/owner/use-cloud-files.ts');
  const Probe = () => { result = useCloudFiles(); return null; };
  return { h, render() { h.render(Probe); return result; }, get result() { return result; }, invalidate() { valid = false; authCallback(); } };
}
test('cloud metadata hook discards an older read after refresh and clears private data on session change', async () => {
  const first = deferred(); let calls = 0; const t = hookSetup(() => ++calls === 1 ? first.promise : Promise.resolve({ files: [file], folders: { schemaVersion: 1, revision: 0, folders: {} } }));
  t.render(); await flush(); t.result.refresh(); await flush(); t.render(); assert.equal(t.result.files.length, 1); first.resolve({ files: [], folders: { schemaVersion: 1, revision: 0, folders: {} } }); await flush(); t.render(); assert.equal(t.result.files.length, 1); t.invalidate(); t.render(); assert.equal(t.result.files.length, 0); assert.equal(t.result.ready, false); t.h.unmount();
});
test('cloud metadata hook refreshes matching library events and fails closed on missing folder references', async () => {
  let calls = 0; const t = hookSetup(async () => ({ files: ++calls === 1 ? [] : [{ ...file, parentId: folderId }], folders: { schemaVersion: 1, revision: 0, folders: {} } })); t.render(); await flush(); t.render(); assert.equal(t.result.ready, true);
  const event = new Event('tmc-private-library-changed'); Object.assign(event, { endpoint: 'cloud-files' }); t.h.window.dispatchEvent(event); await flush(); t.render(); assert.equal(calls, 2); assert.equal(t.result.ready, false); assert.equal(t.result.files.length, 0); assert.match(t.result.error, /missing/); t.h.unmount();
});
test('UI has no download-token APIs, persistent browser storage, embedded PDF viewer or physical delete actions', () => {
  const source = readFileSync(new URL('../src/owner/CloudFileHub.tsx', import.meta.url), 'utf8'); assert.doesNotMatch(source, /getDownloadURL|localStorage|sessionStorage|deleteObject|<iframe|<embed|<object/); assert.match(source, /URL\.revokeObjectURL/); assert.match(source, /aria-label="Folder path"/);
});

test('inline rename Escape cancels without mutating and Enter validates the name', async () => {
  const t=setup(); t.button('Rename').props.onClick(); t.render(); const input=()=>t.h.find(n=>n.type==='input'&&n.props['aria-label']==='Rename item');
  input().props.onChange({target:{value:'bad/name'}}); t.render(); input().props.onKeyDown({key:'Enter',preventDefault(){}}); await flush(); t.render(); assert.match(content(t.h.tree),/without slashes/); assert.equal(t.calls.some(c=>c.method==='file'),false);
  input().props.onKeyDown({key:'Escape',preventDefault(){}}); t.render(); assert.equal(input(),undefined); assert.equal(t.dialog(),undefined); t.h.unmount();
});
test('whole-card drag moves a file into a folder and does not rewrite its source', async()=>{
  const t=setup({library:{folders:{schemaVersion:1,revision:3,folders:{[folderId]:{name:'Projects',parentId:'root',trashedAt:null}}}}});
  const card=t.h.all(n=>n.type==='li').find(n=>content(n).includes(file.name)); let ghost; const dataTransfer={types:[],files:[],setData(type,value){this.types.push(type);this.value=value;},setDragImage(node){ghost=node;}}; const origin={}; card.props.onDragStart({currentTarget:origin,dataTransfer,preventDefault(){}}); t.render(); assert.equal(ghost,origin);
  const folder=t.h.all(n=>n.type==='li').find(n=>content(n).includes('Projects')); let prevented=0; folder.props.onDragOver({currentTarget:{getBoundingClientRect:()=>({top:0,height:100})},clientY:50,dataTransfer,preventDefault(){prevented++;},stopPropagation(){}}); folder.props.onDrop({dataTransfer,preventDefault(){},stopPropagation(){}}); await flush(); t.render();
  assert.equal(prevented,1); const write=t.calls.find(c=>c.method==='file'); assert.deepEqual(write.change,{parentId:folderId}); assert.equal(write.value.id,id); assert.match(content(t.h.tree),/Moved/); t.h.unmount();
});
test('folder cannot be dropped inside itself and foreign drag payloads are ignored',async()=>{
  const t=setup({library:{files:[],folders:{schemaVersion:1,revision:1,folders:{[folderId]:{name:'Projects',parentId:'root',trashedAt:null}}}}}); const card=t.h.find(n=>n.type==='li'); const dataTransfer={types:[],files:[],setData(type){this.types.push(type);},setDragImage(){}};
  card.props.onDragStart({currentTarget:{},dataTransfer,preventDefault(){}}); card.props.onDrop({dataTransfer,preventDefault(){},stopPropagation(){}}); await flush(); assert.equal(t.calls.some(c=>c.method==='folder'),false);
  t.h.tree.props.onDrop({dataTransfer:{types:['application/x-tmc-cloud-item'],files:[]},preventDefault(){},stopPropagation(){}}); await flush(); assert.equal(t.calls.some(c=>c.method==='folder'),false); t.h.unmount();
});
test('dropping OS files onto a folder uses that folder, not the current root',async()=>{
  const t=setup({library:{folders:{schemaVersion:1,revision:1,folders:{[folderId]:{name:'Projects',parentId:'root',trashedAt:null}}}}}); const folder=t.h.all(n=>n.type==='li').find(n=>content(n).includes('Projects')); const incoming=new File(['pdf'],'Project.pdf',{type:'application/pdf'}); folder.props.onDrop({dataTransfer:{types:['Files'],files:[incoming]},preventDefault(){},stopPropagation(){}}); await flush(); t.render(); assert.equal(t.calls.find(c=>c.method==='upload').options.parentId,folderId); t.h.unmount();
});
test('font upload starts directly without a checkbox or fabricated rights assertion',async()=>{
  const t=setup(); const incoming=new File(['font'],'Custom.woff2',{type:'font/woff2'}); t.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[incoming]}}); await flush();t.render();
  const call=t.calls.find(c=>c.method==='upload');assert.ok(call);assert.equal(Object.hasOwn(call.options,'fontRightsConfirmed'),false);assert.equal(t.button('Continue upload'),undefined);assert.doesNotMatch(content(t.h.tree),/permission to use and embed/);t.h.unmount();
});
test('permanent delete requires confirmation, cancel preserves files, repeat clicks issue one request',async()=>{
  const gate=deferred(),t=setup({library:{files:[{...file,trashedAt:'2026-10-26T00:00:00.000Z'}]},purge:()=>gate.promise}); await flush();t.render();t.button('Trash').props.onClick();t.render();t.button('Empty Trash').props.onClick();t.render();assert.match(content(t.dialog()),/cannot be undone/);t.action('Cancel').props.onClick();t.render();assert.equal(t.calls.some(c=>c.method==='purge'),false);
  t.button('Delete').props.onClick();t.render();t.action('Delete permanently').props.onClick();t.action('Delete permanently').props.onClick();t.render();assert.equal(t.calls.filter(c=>c.method==='purge').length,1);assert.equal(t.dialog().props.dismissDisabled,true);gate.resolve({deletedIds:[],blockedIds:[id],failedIds:[]});await flush();t.render();assert.match(content(t.h.tree),/file kept: in use/);assert.equal(t.library.files.length,1);t.h.unmount();
});
test('automatic cleanup wording follows confirmed scheduler status, never mere availability',async()=>{
  const t=setup({cleanup:{automaticCleanupEnabled:false}});await flush();t.render();t.button('Trash').props.onClick();t.render();assert.match(content(t.h.tree),/not active yet/);assert.doesNotMatch(content(t.h.tree),/Unused files in Trash are automatically deleted/);t.h.unmount();
  const active=setup({cleanup:{automaticCleanupEnabled:true,lastRunAt:'2026-10-26T00:00:00.000Z'}});await flush();active.render();active.button('Trash').props.onClick();active.render();assert.match(content(active.h.tree),/automatically deleted after 30 days/);active.h.unmount();
});
test('cleanup unavailable disables physical delete but leaves restore accessible',async()=>{
  const t=setup({cleanup:{available:false,message:'Cleanup requires setup'},library:{files:[{...file,trashedAt:'2026-10-26T00:00:00.000Z'}]}});await flush();t.render();t.button('Trash').props.onClick();t.render();assert.equal(t.button('Empty Trash').props.disabled,true);assert.equal(t.button('Delete').props.disabled,true);assert.equal(t.button('Restore file').props.disabled,false);assert.match(content(t.h.tree),/Cleanup requires setup/);t.h.unmount();
});
test('empty folder purge avoids a zero-file delete request',async()=>{
  const t=setup({library:{files:[],folders:{schemaVersion:1,revision:5,folders:{[folderId]:{name:'Old folder',parentId:'root',trashedAt:'2026-10-26T00:00:00.000Z'}}}}});await flush();t.render();t.button('Trash').props.onClick();t.render();t.button('Empty Trash').props.onClick();t.render();t.action('Delete permanently').props.onClick();await flush();t.render();assert.equal(t.calls.some(c=>c.method==='purge'),false);assert.deepEqual(t.calls.find(c=>c.method==='purge-folders').ids,[folderId]);t.h.unmount();
});
test('File Hub uploads preserve originals, while the photo picker requests website-ready photos',async()=>{
  for(const picker of [false,true]){
    const t=setup({props:picker?{manager:false,onSelect(){}}:{manager:true}});t.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['bytes'],'Original.png',{type:'image/png'})]}});await flush();assert.equal(t.calls.find(c=>c.method==='upload').options.preserveOriginal,!picker);t.h.unmount();
  }
});
test('original photo conversion is explicit, keeps original metadata and does not select or publish',async()=>{
  const original={...file,kind:'file',contentType:'application/octet-stream',name:'Original.png',width:0,height:0};const gate=deferred(),t=setup({library:{files:[original]},websitePhoto:()=>gate.promise});
  assert.equal(t.button('View'),undefined);t.button('Create website photo').props.onClick();t.button('Create website photo').props.onClick();t.render();assert.equal(t.calls.filter(c=>c.method==='website-photo').length,1);assert.equal(t.library.files[0],original);gate.resolve(file);await flush();t.render();assert.match(content(t.h.tree),/original file is unchanged/);assert.equal(t.library.files[0],original);t.h.unmount();
});
test('default Fonts folder is protected from rename, move, Trash and dragging',()=>{
  const fontFolder='00000000-0000-4000-8000-000000000001';
  const h=harness();const actual=h.load('src/owner/cloud-files-model.ts').CLOUD_FONTS_FOLDER_ID;h.unmount();
  const t=setup({library:{files:[],folders:{schemaVersion:1,revision:1,folders:{[actual||fontFolder]:{name:'Fonts',parentId:'root',trashedAt:null}}}}});
  const card=t.h.find(n=>n.type==='li');assert.equal(card.props.draggable,false);assert.equal(t.button('Rename'),undefined);assert.equal(t.button('Move'),undefined);assert.equal(t.button('Move to Trash: Fonts'),undefined);assert.match(content(t.h.tree),/Fonts folder · Protected/);t.h.unmount();
});

test('card edge drops reorder mixed items without changing folders or file bytes',async()=>{
 const t=setup({library:{folders:{schemaVersion:1,revision:1,folders:{[folderId]:{name:'Projects',parentId:'root',trashedAt:null}}}}});await flush();t.render();
 const getCard=name=>t.h.all(n=>n.type==='li').find(n=>content(n).includes(name));
 const dataTransfer={types:[],files:[],setData(type){this.types.push(type);},setDragImage(){}};
 getCard(file.name).props.onDragStart({currentTarget:{},dataTransfer,preventDefault(){}});t.render();
 getCard('Projects').props.onDragOver({currentTarget:{getBoundingClientRect:()=>({top:0,height:100})},clientY:5,dataTransfer,preventDefault(){},stopPropagation(){}});t.render();
 assert.equal(getCard('Projects').props['data-insert'],'before');getCard('Projects').props.onDrop({dataTransfer,preventDefault(){},stopPropagation(){}});await flush();t.render();
 const call=t.calls.find(c=>c.method==='order');assert.equal(call.moving,`file:${id}`);assert.equal(call.target,`folder:${folderId}`);assert.equal(call.after,false);assert.equal(t.calls.some(c=>c.method==='file'||c.method==='folder'),false);t.h.unmount();
});
test('touch/keyboard placement moves an item out through visible Up without opening a dialog',async()=>{
 const t=setup({library:{files:[{...file,parentId:folderId}],folders:{schemaVersion:1,revision:1,folders:{[folderId]:{name:'Projects',parentId:'root',trashedAt:null}}}}});
 t.button('Open').props.onClick();t.render();await flush();t.render();t.button('Reorder / move').props.onClick();t.render();
 assert.equal(t.dialog(),undefined);t.button('↑ Move selected item up one folder').props.onClick();await flush();t.render();assert.equal(t.calls.find(c=>c.method==='file').change.parentId,'root');t.h.unmount();
});
test('Cancel move sits in a dedicated contained toolbar rather than inside the announcement paragraph',async()=>{
 const t=setup();await flush();t.render();t.button('Reorder / move').props.onClick();t.render();
 const toolbar=t.h.find(n=>n.props['data-file-move-toolbar']);assert.ok(toolbar);assert.match(toolbar.props.className,/moveStatus/);
 const cancel=nodes(toolbar).find(n=>n.type==='button'&&content(n)==='Cancel move');assert.ok(cancel);
 const message=nodes(toolbar).find(n=>n.props.role==='status');assert.ok(message);assert.equal(nodes(message).some(n=>n.type==='button'),false);
 cancel.props.onClick();t.render();assert.equal(t.h.find(n=>n.props['data-file-move-toolbar']),undefined);assert.equal(t.calls.filter(c=>c.method==='file'||c.method==='folder').length,0);t.h.unmount();
});


test('photo picker shows folders immediately without New folder and can switch to flattened All photos', () => {
  const folders = { schemaVersion: 1, revision: 2, folders: {
    [folderId]: { name: 'Suit references', parentId: 'root', trashedAt: null },
    [childId]: { name: 'Archived folder', parentId: 'root', trashedAt: '2026-10-26T00:00:00.000Z' },
  } };
  const t = setup({ props: { manager: false, onSelect() {} }, library: { folders, files: [
    file, { ...file, id: '44444444-4444-4444-8444-444444444444', parentId: folderId, name: 'Nested reference' },
  ] } });
  assert.equal(t.button('All photos').props['aria-pressed'], false);
  assert.match(content(t.h.tree), /Suit references/);
  assert.doesNotMatch(content(t.h.tree), /Archived folder|Nested reference/);
  assert.ok(t.button('Open'));
  assert.equal(t.calls.length, 0);
  t.button('Open').props.onClick(); t.render();
  assert.match(content(t.h.tree), /Nested reference/);
  assert.doesNotMatch(content(t.h.tree), /Private cloud photo/);
  t.button('All photos').props.onClick(); t.render();
  assert.equal(t.button('All photos').props['aria-pressed'], true);
  assert.match(content(t.h.tree), /Nested reference/);
  assert.match(content(t.h.tree), /Private cloud photo/);
  assert.equal(t.button('Open'), undefined);
  t.h.all(n => n.type === 'button' && content(n) === 'My files')[0].props.onClick(); t.render();
  assert.ok(t.button('Open'));
  assert.doesNotMatch(content(t.h.tree), /Nested reference/);
  assert.equal(t.calls.length, 0);
  t.h.unmount();
});

test('photo picker displays folders as soon as the first library read completes', () => {
  const t = setup({ props: { manager: false, onSelect() {} }, library: { ready: false, loading: true, files: [] } });
  assert.equal(t.button('New folder').props.disabled, true);
  t.library.folders = { schemaVersion: 1, revision: 1, folders: { [folderId]: { name: 'Loaded folder', parentId: 'root', trashedAt: null } } };
  t.library.ready = true; t.library.loading = false; t.render();
  assert.match(content(t.h.tree), /Loaded folder/);
  assert.ok(t.button('Open'));
  assert.equal(t.calls.length, 0);
  t.h.unmount();
});
