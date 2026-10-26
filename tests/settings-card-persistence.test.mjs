import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, storage, memoryAdapter, model } from './owner-test-modules.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const { applySettingsCard } = sourceLoader()('src/owner/settings-cards.ts');

test('each Settings card persists only its own fields and leaves unrelated unsaved invalid content out', async () => {
  for (const card of ['business','availability','commission-form','contacts']) {
    const original = defaults.createDefaultOwnerContent();
    const store = storage.createOwnerStore(memoryAdapter());
    await store.saveDraft(original,0);
    const edited = structuredClone(original);
    edited.site.name = 'Taylor Changed';
    edited.site.commissionStatus = 'Waitlist'; edited.site.statusNote = 'Join the waitlist';
    edited.site.additionalPartsQuantities = true;
    edited.site.socialLinks = [{id:'new-social',label:'Art',value:'Taylor',url:'https://example.com/art'}];
    edited.home.intro = 'UNSAVED HOME';
    edited.pages[0].title = '';
    const saved = await store.saveSettingsCard(edited,card,1);
    assert.deepEqual(saved.draft, applySettingsCard(original,edited,card));
    assert.equal(saved.draft.home.intro, original.home.intro);
    assert.equal(saved.draft.pages[0].title, original.pages[0].title);
    assert.equal(saved.revision,2);
    assert.equal(saved.localPublished,null);
  }
});
test('card save snapshots its values, rejects conflicts/invalid own fields/unknown cards without changing saved draft',async()=>{
  const base=defaults.createDefaultOwnerContent(); const adapter=memoryAdapter(); const store=storage.createOwnerStore(adapter);
  await store.saveDraft(base,0);
  const invalid=structuredClone(base);invalid.site.name='';
  await assert.rejects(store.saveSettingsCard(invalid,'business',1));
  await assert.rejects(store.saveSettingsCard(base,'unknown',1));
  await assert.rejects(store.saveSettingsCard(base,'contacts',0));
  assert.deepEqual((await store.load()).draft,base); assert.equal((await store.load()).revision,1);
});
test('individual listing draft deletion does not delete photos, other listings, or private published snapshot',async()=>{
  const base=defaults.createDefaultOwnerContent();
  base.premades=[{id:'draft-item',name:'Draft',image:'/images/heads.webp',alt:'Head',description:'',price:10,visible:false,isDraft:true},{id:'live-item',name:'Live',image:'/images/heads.webp',alt:'Head',description:'',price:20,visible:true}];
  const store=storage.createOwnerStore(memoryAdapter());await store.saveDraft(base,0);await store.publishLocal(1);
  const before=await store.load();const after=await store.deletePremadeDraft('draft-item',2);
  assert.deepEqual(after.draft.premades,[base.premades[1]]);assert.deepEqual(after.localPublished,before.localPublished);assert.deepEqual(after.draft.gallery,base.gallery);
  await assert.rejects(store.deletePremadeDraft('live-item',3));await assert.rejects(store.deletePremadeDraft('draft-item',3));
  assert.equal((await store.load()).revision,3);
});
test('targeted live projection begins with existing publication, never private gallery/listings/page content',()=>{
  const original=defaults.createDefaultOwnerContent();const published=model.createPublishedOwnerSnapshot(original,1);
  const edited=structuredClone(original);edited.site.name='Taylor New';edited.home.intro='PRIVATE HOME';edited.gallery=[];
  const merged=applySettingsCard(model.publicContentToOwnerContent(published.content),edited,'business');
  const next=model.createPublishedOwnerSnapshot(merged,2);
  assert.equal(next.content.site.name,'Taylor New');assert.equal(next.content.home.intro,published.content.home.intro);assert.deepEqual(next.content.gallery,published.content.gallery);
});
