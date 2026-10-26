import {test} from 'node:test';
import assert from 'node:assert/strict';
import {model as m,defaults as d,storage as s,memoryAdapter} from './owner-test-modules.mjs';

test('empty local store returns pristine defaults without claiming a save',async()=>{
  const adapter=memoryAdapter(),store=s.createOwnerStore(adapter);
  const state=await store.load();
  assert.equal(state.revision,0);assert.equal(state.updatedAt,null);assert.equal(state.localPublished,null);assert.equal(adapter.peek(),null);
});
test('draft changes persist but cannot change local preview until explicit publish',async()=>{
  const adapter=memoryAdapter(),store=s.createOwnerStore(adapter);
  const initial=await store.load();initial.draft.site.commissionStatus='Open!';
  const saved=await store.saveDraft(initial.draft,0);
  assert.equal(saved.revision,1);assert.equal(saved.localPublished,null);
  const published=await store.publishLocal(1);
  assert.equal(published.revision,2);assert.equal(published.localPublished.content.site.commissionStatus,'Open!');
  published.draft.site.commissionStatus='Closed';
  const edited=await store.saveDraft(published.draft,2);
  assert.equal(edited.draft.site.commissionStatus,'Closed');assert.equal(edited.localPublished.content.site.commissionStatus,'Open!');
  const reloaded=await s.createOwnerStore(adapter).load();assert.deepEqual(reloaded,edited);
});
test('reset restores last preview, or defaults before first preview',async()=>{
  const store=s.createOwnerStore(memoryAdapter());let state=await store.load();state.draft.home.title='Before';
  state=await store.saveDraft(state.draft,0);state=await store.resetDraft(1);assert.equal(state.draft.home.title,'Welcome to your new Fursuit');
  state.draft.home.title='Preview title';state=await store.saveDraft(state.draft,state.revision);state=await store.publishLocal(state.revision);
  state.draft.home.title='Unsaved preview draft';state=await store.saveDraft(state.draft,state.revision);state=await store.resetDraft(state.revision);
  assert.equal(state.draft.home.title,'Preview title');
});
test('stale cross-tab edits are rejected without overwriting current state',async()=>{
  const adapter=memoryAdapter(),a=s.createOwnerStore(adapter),b=s.createOwnerStore(adapter);
  const first=await a.load(),stale=await b.load();first.draft.home.title='Saved first';await a.saveDraft(first.draft,0);
  stale.draft.home.title='Stale change';await assert.rejects(b.saveDraft(stale.draft,0),error=>error.code==='conflict');
  await assert.rejects(b.publishLocal(0),error=>error.code==='conflict');
  assert.equal((await a.load()).draft.home.title,'Saved first');
});
test('invalid persisted content is visibly rejected and never replaced with defaults',async()=>{
  const raw=d.createInitialOwnerWorkspace();raw.draft.pages=[];
  const adapter=memoryAdapter(raw),store=s.createOwnerStore(adapter);
  await assert.rejects(store.load(),error=>error.code==='corrupt');
  await assert.rejects(store.saveDraft(d.createDefaultOwnerContent(),0),error=>error.code==='corrupt');
  assert.deepEqual(adapter.peek(),raw);
});
test('quota/adapter failures reject rather than mark draft saved',async()=>{
  const adapter={read:async()=>null,update:async()=>{throw new DOMException('Full','QuotaExceededError');}};
  const store=s.createOwnerStore(adapter);
  await assert.rejects(store.saveDraft(d.createDefaultOwnerContent(),0),error=>error.code==='write'&&/not saved/.test(error.message));
  await assert.rejects(store.publishLocal(0),error=>error.code==='write');
});
test('invalid content fails before storage is touched',async()=>{
  let touched=false;const adapter={read:async()=>null,update:async()=>{touched=true;throw new Error('unexpected');}};
  const content=d.createDefaultOwnerContent();content.prices.parts[0].price=-1;
  await assert.rejects(s.createOwnerStore(adapter).saveDraft(content,0),m.OwnerValidationError);assert.equal(touched,false);
});
test('snapshot saved is independent of later caller mutation',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const memory=memoryAdapter();
  const adapter={read:memory.read,update:async transform=>{await gate;return memory.update(transform);}};
  const store=s.createOwnerStore(adapter),content=d.createDefaultOwnerContent();content.home.title='Requested snapshot';
  const pending=store.saveDraft(content,0);content.home.title='Later form edit';release();
  assert.equal((await pending).draft.home.title,'Requested snapshot');
});
test('browser-only adapter reports missing IndexedDB explicitly in Node',async()=>{
  await assert.rejects(s.createBrowserOwnerStore().load(),error=>error.code==='unavailable');
});
test('unsupported versions and malformed publication dates are never loaded',async()=>{
  for(const mutate of [s=>{s.schemaVersion=2;},s=>{s.localPublished={content:s.draft,publishedAt:'yesterday'};},s=>{s.revision=-1;}]){
    const raw=d.createInitialOwnerWorkspace();mutate(raw);await assert.rejects(s.createOwnerStore(memoryAdapter(raw)).load(),error=>error.code==='corrupt');
  }
});
