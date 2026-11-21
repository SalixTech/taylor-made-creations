// Source-hook regression tests: no Firebase calls and no claim of browser rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const ISO = '2026-10-28T00:00:00.000Z';
const client = { clientId: 'TMC-0011223344556677', displayName: 'Archive safety fixture', status: 'active', authVersion: 1, createdAt: ISO, updatedAt: ISO };
const project = (id, overrides = {}) => ({ projectId: id, clientId: client.clientId, title: `Commission ${id}`, summary: '', status: 'completed', progress: null, progressSource: 'manual', trackingUrl: null, requestId: null, version: 3, createdAt: ISO, updatedAt: ISO, ...overrides });
const first = project('11111111-1111-4111-8111-111111111111');
const second = project('22222222-2222-4222-8222-222222222222');

async function fixture(t, options = {}) {
  const h = harness(), calls = [], dirty = [], confirmations = [], detailStreams = [];
  const projects = options.projects ?? [first, second];
  h.overrides['./owner-whimsy'] = { useAddClientLabel: () => 'Add client' };
  h.overrides['./taylor-services-client'] = { async taylorOwnerSession() { return { assertCurrent() {}, auth: { onAuthStateChanged() { return () => {}; } } }; } };
  h.overrides['./client-hub-client'] = {
    clientHubErrorMessage: error => error.message,
    subscribeClients() { return () => {}; }, subscribeClientDetail(id, onData) { detailStreams.push(onData); return () => {}; },
    async listClients() { return [client]; },
    async getClientDetail() { return { client, projects }; },
    async createProject(input) { calls.push({create:input}); return options.create ? options.create(input) : {project:project('33333333-3333-4333-8333-333333333333',{status:'queued',title:input.title})}; },
    async setProjectArchived(projectId, expectedVersion, archived) {
      calls.push({ projectId, expectedVersion, archived });
      if (options.archive) return options.archive(projectId, expectedVersion, archived);
      return { project: { ...projects.find(item => item.projectId === projectId), ownerArchived: archived, version: expectedVersion + 1 } };
    },
  };
  h.window.confirm = text => { confirmations.push(text); return options.confirm !== false; };
  const Component = h.load('src/owner/OwnerClientHub.tsx').OwnerClientHub;
  const props = { onDirtyChange: value => dirty.push(value) };
  const render = () => h.render(Component, props);
  const workspace = () => h.find(node => node.type?.name === 'HubWorkspaceWindow');
  const card = id => h.find(node => node.type === 'article' && node.key === id);
  const archiveButton = id => nodes(card(id)).find(node => node.type === 'button' && node.props['aria-label'] === `Archive commission ${projects.find(item => item.projectId === id).title}`);
  render(); await tick(); render();
  h.find(node => node.type === 'button' && node.props.className === 'clientRow').props.onClick();
  await tick(); render();
  t.after(() => h.unmount());
  return { h, calls, dirty, confirmations, render, workspace, card, archiveButton,
    emitDetail(nextProjects) { detailStreams.at(-1)({ client, projects: nextProjects }); render(); },
    markDirty() { workspace().props.onDirtyChange(true); render(); },
    select(id) { workspace().props.onProjectSelect(id); render(); },
    async archive(id) { archiveButton(id).props.onClick(); await tick(); render(); },
  };
}

for (const explicit of [false, true]) test(`archiving ${explicit ? 'explicitly selected' : 'auto-selected fallback'} commission keeps its open workspace and draft`, async t => {
  const f = await fixture(t);
  if (explicit) f.select(first.projectId);
  f.markDirty(); const key = f.workspace().key;
  await f.archive(first.projectId);
  assert.equal(f.confirmations.length, 0, 'a reversible card-only archive does not discard content');
  assert.equal(f.calls.length, 1);
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key, 'archive leaves the mounted draft untouched');
  assert.equal(f.dirty.at(-1), true);
  assert.equal(f.card(first.projectId), undefined, 'archived card leaves the owner active list');
  assert.ok(f.workspace().props.projects.some(item => item.projectId === first.projectId), 'open archived workspace remains in the selector');
  // The callable acknowledgement may beat Firestore's realtime snapshot.
  f.emitDetail([{ ...first, ownerArchived: true, version: 4 }, second]);
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
});

test('selected archive preserves draft typing during the request and a subscription before acknowledgement', async t => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = await fixture(t, { archive: () => pending });
  const key = f.workspace().key;
  f.archiveButton(first.projectId).props.onClick(); f.render();
  assert.equal(f.calls.length, 1);
  f.markDirty();
  const saved = { ...first, ownerArchived: true, version: 4 };
  f.emitDetail([saved, second]);
  assert.equal(f.workspace().props.project.projectId, first.projectId, 'realtime update cannot switch the auto-selected workspace');
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
  resolve({ project: saved }); await tick(); f.render();
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
});

test('failed selected archive keeps the current workspace and draft guard intact', async t => {
  const f = await fixture(t, { archive: async () => { throw Error('Archive was not confirmed'); } });
  f.markDirty(); const key = f.workspace().key;
  await f.archive(first.projectId);
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
  assert.match(content(f.h.tree), /Archive was not confirmed/);
});

test('archiving a different commission does not discard or remount the open draft', async t => {
  const f = await fixture(t); f.markDirty(); const key = f.workspace().key;
  await f.archive(second.projectId);
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
});

test('archiving the last selected commission preserves its open draft rather than unmounting it', async t => {
  const f = await fixture(t, { projects: [first] }); f.markDirty(); const key = f.workspace().key;
  await f.archive(first.projectId);
  assert.equal(f.card(first.projectId), undefined);
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
});

test('changing commissions after archiving still protects the open unsaved draft', async t => {
  const f = await fixture(t, { confirm: false }); f.markDirty();
  await f.archive(first.projectId);
  f.select(second.projectId);
  assert.ok(f.h.find(n=>n.type?.name==='HubActionDialog'));f.h.find(n=>n.type?.name==='HubActionDialog').props.onClose();await new Promise(r=>setImmediate(r));
  assert.equal(f.workspace().props.project.projectId, first.projectId);
  assert.equal(f.dirty.at(-1), true);
  f.h.window.confirm = () => { throw Error("No browser confirm"); };
  f.select(second.projectId); f.h.find(n=>n.type?.name==='HubActionDialog').props.onConfirm();await new Promise(r=>setImmediate(r)); f.render();
  assert.equal(f.workspace().props.project.projectId, second.projectId);
  assert.equal(f.dirty.at(-1), false);
});

test('archive acknowledgement cannot overwrite a newer subscribed commission or its open draft', async t => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = await fixture(t, { archive: () => pending });
  f.markDirty(); const key = f.workspace().key;
  f.archiveButton(first.projectId).props.onClick(); f.render();
  const latest = { ...first, ownerArchived: true, version: 5, summary: 'A newer saved commission update' };
  f.emitDetail([latest, second]);
  resolve({ project: { ...first, ownerArchived: true, version: 4 } });
  await tick(); f.render();
  assert.equal(f.workspace().props.project.version, 5);
  assert.equal(f.workspace().props.project.summary, latest.summary);
  assert.equal(f.workspace().key, key);
  assert.equal(f.dirty.at(-1), true);
});


test('Fox9 nonterminal archived cards are hidden/restorable, while an open draft remains mounted',async t=>{
 const active={...first,status:'in-progress'},f=await fixture(t,{projects:[active,second]});
 f.markDirty();const key=f.workspace().key; await f.archive(active.projectId);
 assert.equal(f.card(active.projectId),undefined);assert.equal(f.workspace().key,key);assert.equal(f.workspace().props.project.status,'in-progress');
 f.h.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Show archived commissions')).props.onClick();f.render();
 const restore=nodes(f.card(active.projectId)).find(n=>n.type==='button'&&n.props['aria-label']===`Restore commission ${active.title}`);assert.ok(restore);restore.props.onClick();await tick();f.render();
 assert.equal(f.calls.at(-1).archived,false);assert.equal(f.workspace().props.project.status,'in-progress');assert.equal(f.dirty.at(-1),true);
});

test('Fox9 live autoarchive from another window pins implicit current workspace without dropping its draft',async t=>{
 const active={...first,status:'queued'},f=await fixture(t,{projects:[active,second]});f.markDirty();const key=f.workspace().key;
 const added=project('33333333-3333-4333-8333-333333333333',{status:'queued'});
 f.emitDetail([{...active,ownerArchived:true,version:4},second,added]);
 assert.equal(f.workspace().props.project.projectId,active.projectId);assert.equal(f.workspace().key,key);assert.equal(f.dirty.at(-1),true);assert.equal(f.card(active.projectId),undefined);assert.equal(f.confirmations.length,0);
});

test('Fox9 local create preserves current draft through earlier subscription and delayed acknowledgement',async t=>{
 let resolve;const pending=new Promise(done=>{resolve=done;});const active={...first,status:'queued'},f=await fixture(t,{projects:[active,second],create:()=>pending});
 f.markDirty();const key=f.workspace().key;
 f.h.find(n=>n.type==='button'&&content(n)==='Add commission').props.onClick();f.render();assert.equal(f.confirmations.length,0);assert.equal(f.dirty.at(-1),true);
 const label=f.h.find(n=>n.type==='label'&&content(n).startsWith('Commission title'));nodes(label).find(n=>n.type==='input').props.onChange({target:{value:'New commission'}});f.render();
 const submit=f.h.find(n=>n.type==='form'&&n.props.id==='client-hub-editor').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});f.render();assert.equal(f.calls.filter(c=>c.create).length,1);
 const added=project('33333333-3333-4333-8333-333333333333',{status:'queued',title:'New commission'});f.emitDetail([{...active,ownerArchived:true,version:4},second,added]);
 resolve({project:added});await tick();f.render();
 assert.equal(f.workspace().props.project.projectId,active.projectId);assert.equal(f.workspace().key,key);assert.equal(f.dirty.at(-1),true);assert.match(content(f.h.tree),/current draft is still open/);assert.equal(f.confirmations.length,0);
});

const archivedFixture = count => Array.from({length:count}, (_,i) => project(`archive-${i}`, {ownerArchived:true, createdAt:`2026-10-${String(20+i).padStart(2,'0')}T00:00:00.000Z`}));
const archiveDialog = f => f.h.find(n => n.type?.name === 'Dialog' && n.props.title === 'All archived commissions');
const allArchivedButton = f => f.h.find(n => n.type === 'button' && content(n).startsWith('All archived ('));
const showArchived = f => { f.h.find(n => n.type === 'button' && n.props['aria-label']?.startsWith('Show archived commissions')).props.onClick(); f.render(); };
for (const count of [0,1,2,3,5]) test(`Fox10 archives: ${count} archived gives at most two inline and overflow only at three`,async t=>{
 const archives=archivedFixture(count),f=await fixture(t,{projects:[first,...archives]});
 assert.equal(nodes(f.h.tree).filter(n=>n.type==='article').length,1,'collapsed archive leaves active cards alone');
 assert.equal(allArchivedButton(f),undefined);
 showArchived(f);
 const cards=nodes(f.h.tree).filter(n=>n.type==='article');
 assert.equal(cards.length,1+Math.min(count,2));
 assert.deepEqual(cards.filter(n=>n.key!==first.projectId).map(n=>n.key),archives.slice(-2).reverse().map(p=>p.projectId));
 assert.equal(Boolean(allArchivedButton(f)),count>=3);
 if(count>=3){allArchivedButton(f).props.onClick();f.render();const modal=archiveDialog(f);assert.ok(modal);assert.equal(modal.props.wide,true);
  assert.deepEqual(nodes(modal).filter(n=>n.type==='article').map(n=>n.key),[...archives].reverse().map(p=>p.projectId),'popup lists all, not merely overflow');
  modal.props.onClose();f.render();assert.equal(archiveDialog(f),undefined);assert.equal(f.workspace().props.project.projectId,first.projectId);
 }
 assert.equal(f.calls.length,0,'browsing archives does not mutate backend');
});

test('Fox10 archive popup selection preserves dirty draft on cancel and closes only after accepted navigation',async t=>{
 const archives=archivedFixture(3),f=await fixture(t,{projects:[first,...archives]});f.markDirty();const key=f.workspace().key;
 showArchived(f);allArchivedButton(f).props.onClick();f.render();
 const open=()=>nodes(archiveDialog(f)).find(n=>n.type==='button'&&n.props['aria-label']===`Open workspace: ${archives[0].title}`);
 open().props.onClick();f.render();assert.equal(archiveDialog(f).props.dismissDisabled,true);
 assert.ok(f.h.find(n=>n.type?.name==='HubActionDialog'));
 f.h.find(n=>n.type?.name==='HubActionDialog').props.onClose();await tick();f.render();
 assert.ok(archiveDialog(f));assert.equal(f.workspace().props.project.projectId,first.projectId);assert.equal(f.workspace().key,key);assert.equal(f.dirty.at(-1),true);
 open().props.onClick();f.render();f.h.find(n=>n.type?.name==='HubActionDialog').props.onConfirm();await tick();f.render();
 assert.equal(archiveDialog(f),undefined);assert.equal(f.workspace().props.project.projectId,archives[0].projectId);assert.equal(f.dirty.at(-1),false);assert.equal(f.calls.length,0);
});

test('Fox10 archive popup disappears when realtime restore leaves fewer than three, without changing workspace',async t=>{
 const archives=archivedFixture(3),f=await fixture(t,{projects:[first,...archives]});showArchived(f);allArchivedButton(f).props.onClick();f.render();
 f.emitDetail([first,{...archives[0],ownerArchived:false},...archives.slice(1)]);
 assert.equal(archiveDialog(f),undefined);assert.equal(allArchivedButton(f),undefined);assert.equal(f.workspace().props.project.projectId,first.projectId);
 assert.equal(nodes(f.h.tree).filter(n=>n.type==='article').length,4,'restored exception remains visible with two archived inline');
 await tick();f.render();f.emitDetail([first,...archives]);
 assert.equal(archiveDialog(f),undefined,'3 → 2 → 3 cannot unexpectedly reopen a dismissed overflow');
 assert.ok(allArchivedButton(f));
});
