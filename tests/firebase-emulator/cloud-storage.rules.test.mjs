// Local emulators only: fixed loopback addresses and a demo-only project.
import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch} from 'firebase/firestore';
import {ref, uploadBytes, uploadBytesResumable, getBytes, getMetadata, updateMetadata, deleteObject, listAll} from 'firebase/storage';
const PROJECT='demo-tmc-storage-rules';
const OWNER='a4ARjp0z8ZOByKlC2AfGzmMRj843';
const ID='11111111-1111-4111-8111-111111111111';
const ID2='22222222-2222-4222-8222-222222222222';
const ISO='2026-10-26T15:00:00.000Z';
let env,owner,wrong,anon;
const metadata=(overrides={})=>({schemaVersion:1,revision:1,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status:'uploading',trashedAt:null,createdAt:ISO,updatedAt:ISO,...overrides});
const object=(ctx,id=ID,kind='photo')=>ref(ctx.storage(),`${kind==='photo'?'photos':'files'}/${id}.${kind==='photo'?'webp':'pdf'}`);
const file=(ctx,id=ID)=>doc(ctx.firestore(),`ownerFiles/${id}`);
async function seed(path,data){await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),path),data));}
async function seedPhoto(id=ID){await seed(`ownerFiles/${id}`,metadata());await assertSucceeds(uploadBytes(object(owner,id),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:id}}));}
async function seedPublic(ids=[ID],closed=false){await seed('site/access',{schemaVersion:1,revision:1,constructionMode:closed});await seed('site/publishedAssets',{schemaVersion:1,revision:1,ids});}
async function publish(ctx,revision=1,ids=[],options={}){const db=ctx.firestore(),batch=writeBatch(db),wrapper={schemaVersion:1,revision,payload:'{}'};batch.set(doc(db,'ownerWorkspace/current'),wrapper);batch.set(doc(db,'site/published'),wrapper);if(!options.omitIndex)batch.set(doc(db,'site/publishedAssets'),{schemaVersion:1,revision:options.indexRevision??revision,ids});return batch.commit();}
before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules', import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:19199,rules:readFileSync(new URL('../../firebase/storage.rules', import.meta.url),'utf8')}});owner=env.authenticatedContext(OWNER);wrong=env.authenticatedContext('not-the-owner');anon=env.unauthenticatedContext();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{async function clear(path){const listing=await listAll(path);await Promise.all(listing.items.map(item=>deleteObject(item)));await Promise.all(listing.prefixes.map(clear));}await clear(ref(ctx.storage()));});});
after(async()=>{await env?.cleanup();});
test('only exact owner can create private file metadata and read/list it',async()=>{await assertFails(setDoc(file(anon),metadata()));await assertFails(setDoc(file(wrong),metadata()));await assertSucceeds(setDoc(file(owner),metadata()));await assertSucceeds(getDoc(file(owner)));await assertSucceeds(getDocs(collection(owner.firestore(),'ownerFiles')));for(const ctx of [wrong,anon]){await assertFails(getDoc(file(ctx)));await assertFails(getDocs(collection(ctx.firestore(),'ownerFiles')));}});
test('metadata IDs and MIME/kind/size are bounded',async()=>{for(const [id,value] of [['bad-id',metadata()],[ID,metadata({bytes:0})],[ID,metadata({bytes:12*1024*1024+1})],[ID,metadata({contentType:'text/html'})],[ID,metadata({contentType:'application/pdf',cacheControl:'private, no-store, max-age=0',contentDisposition:'attachment',customMetadata:{fileId:ID}})],[ID,metadata({kind:'pdf',contentType:'application/pdf',bytes:500000001,width:0,height:0})]])await assertFails(setDoc(file(owner,id),value));});
test('metadata rejects path-like display names and parent IDs',async()=>{for(const patch of [{name:'../photo'},{name:'nested\\photo'},{name:'..'},{parentId:'../../private'}])await assertFails(setDoc(file(owner),metadata(patch)));});
test('metadata starts uploading at revision one and cannot be deleted',async()=>{for(const patch of [{status:'ready'},{revision:0},{revision:2}])await assertFails(setDoc(file(owner),metadata(patch)));await assertSucceeds(setDoc(file(owner),metadata()));await assertFails(deleteDoc(file(owner)));});
test('metadata ready/trash/restore changes are revision checked and immutable blob fields cannot change',async()=>{await assertSucceeds(setDoc(file(owner),metadata()));await assertSucceeds(updateDoc(file(owner),{status:'ready',revision:2}));await assertFails(updateDoc(file(owner),{name:'Stale',revision:2}));for(const patch of [{bytes:4},{kind:'pdf',contentType:'application/pdf',width:0,height:0},{createdAt:'2026-10-25T00:00:00.000Z'},{status:'uploading'}])await assertFails(updateDoc(file(owner),{revision:3,...patch}));await assertSucceeds(updateDoc(file(owner),{revision:3,trashedAt:ISO}));await assertSucceeds(updateDoc(file(owner),{revision:4,trashedAt:null}));});
test('uploads require an exact matching reserved metadata document',async()=>{await assertFails(uploadBytes(object(owner),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));await seed(`ownerFiles/${ID}`,metadata({bytes:2}));await assertFails(uploadBytes(object(owner),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));await seed(`ownerFiles/${ID}`,metadata({status:'ready'}));await assertFails(uploadBytes(object(owner),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));await seed(`ownerFiles/${ID}`,metadata());await assertSucceeds(uploadBytes(object(owner),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));});
test('wrong account and anonymous cannot upload even with reserved metadata',async()=>{await seed(`ownerFiles/${ID}`,metadata());for(const ctx of [wrong,anon])await assertFails(uploadBytes(object(ctx),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));});
test('uploaded photo bytes are private by default, including metadata',async()=>{await seedPhoto();await assertSucceeds(getBytes(object(owner)));for(const ctx of [wrong,anon]){await assertFails(getBytes(object(ctx)));await assertFails(getMetadata(object(ctx)));}});
test('Storage listing is never allowed, including owner',async()=>{await seedPhoto();for(const ctx of [owner,wrong,anon])await assertFails(listAll(ref(ctx.storage(),'photos')));});
test('objects cannot be overwritten, metadata edited, or deleted',async()=>{await seedPhoto();await assertFails(uploadBytes(object(owner),new Uint8Array([3,2,1]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));await assertFails(updateMetadata(object(owner),{contentType:'text/html'}));await assertFails(deleteObject(object(owner)));});
test('Storage rejects incorrect extension, nested paths, traversal names, and arbitrary prefixes',async()=>{await seed(`ownerFiles/${ID}`,metadata());for(const path of [`photos/${ID}.png`,`photos/${ID}/photo.webp`,`photos/../${ID}.webp`,`uploads/${ID}.webp`,`photos/not-a-uuid.webp`])await assertFails(uploadBytes(ref(owner.storage(),path),new Uint8Array([1,2,3]),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));});
test('Storage rejects wrong MIME, oversized bytes, and empty objects even with bypass-seeded metadata',async()=>{for(const [bytes,type] of [[3,'image/svg+xml'],[3,'text/html'],[0,'image/webp'],[12*1024*1024+1,'image/webp']]){await seed(`ownerFiles/${ID}`,metadata({bytes,contentType:type}));await assertFails(uploadBytes(object(owner),new Uint8Array(bytes),{contentType:type,cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}}));}});
test('valid PDFs upload privately and never become public through photo index',async()=>{await seed(`ownerFiles/${ID}`,metadata({kind:'pdf',contentType:'application/pdf',width:0,height:0}));await assertSucceeds(uploadBytes(object(owner,ID,'pdf'),new Uint8Array([1,2,3]),{contentType:'application/pdf',cacheControl:'private, no-store, max-age=0',contentDisposition:'attachment',customMetadata:{fileId:ID}}));await assertSucceeds(getBytes(object(owner,ID,'pdf')));await seedPublic();for(const ctx of [wrong,anon])await assertFails(getBytes(object(ctx,ID,'pdf')));});
test('anonymous photo reads require both a valid public index and an open construction gate',async()=>{await seedPhoto();await assertFails(getBytes(object(anon)));await seedPublic([],false);await assertFails(getBytes(object(anon)));await seedPublic([ID],true);await assertFails(getBytes(object(anon)));await seedPublic([ID],false);await assertSucceeds(getBytes(object(anon)));await assertSucceeds(getBytes(object(wrong)));await seed('site/access',{schemaVersion:1,revision:2,constructionMode:true});await assertFails(getBytes(object(anon)));});
test('nonindexed photo stays private beside an indexed photo',async()=>{await seedPhoto(ID);await seedPhoto(ID2);await seedPublic([ID]);await assertSucceeds(getBytes(object(anon,ID)));await assertFails(getBytes(object(anon,ID2)));});
test('malformed or missing access/index documents fail closed',async()=>{await seedPhoto();for(const access of [{},{constructionMode:false},{schemaVersion:1,revision:1,constructionMode:'false'}]){await seed('site/access',access);await seed('site/publishedAssets',{schemaVersion:1,revision:1,ids:[ID]});await assertFails(getBytes(object(anon)));}await seed('site/access',{schemaVersion:1,revision:1,constructionMode:false});for(const index of [{},{schemaVersion:1,revision:1,ids:'bad'},{schemaVersion:2,revision:1,ids:[ID]}]){await seed('site/publishedAssets',index);await assertFails(getBytes(object(anon)));}});
test('only owner may atomically publish workspace + site + photo index',async()=>{await assertFails(publish(anon));await assertFails(publish(wrong));await assertSucceeds(publish(owner,1,[ID]));await assertSucceeds(publish(owner,2,[ID2]));assert.deepEqual((await getDoc(doc(owner.firestore(),'site/publishedAssets'))).data().ids,[ID2]);});
test('standalone public index write and index revision mismatch are denied',async()=>{await assertFails(setDoc(doc(owner.firestore(),'site/publishedAssets'),{schemaVersion:1,revision:1,ids:[ID]}));await assertFails(publish(owner,1,[ID],{indexRevision:2}));await assertSucceeds(publish(owner,1,[ID]));await assertFails(setDoc(doc(owner.firestore(),'site/publishedAssets'),{schemaVersion:1,revision:2,ids:[ID2]}));await assertFails(deleteDoc(doc(owner.firestore(),'site/publishedAssets')));});
test('publishing without matching index and stale revision cannot leave a stale allowlist',async()=>{await assertFails(publish(owner,1,[],{omitIndex:true}));await assertSucceeds(publish(owner,1,[ID]));await assertFails(publish(owner,2,[],{omitIndex:true}));await assertFails(publish(owner,1,[ID2]));assert.deepEqual((await getDoc(doc(owner.firestore(),'site/publishedAssets'))).data().ids,[ID]);});
test('public index is bounded and rejects unexpected fields',async()=>{await assertFails(publish(owner,1,Array(501).fill(ID)));await assertSucceeds(publish(owner,1,[ID]));await assertFails(updateDoc(doc(owner.firestore(),'site/publishedAssets'),{extra:true}));});
test('folder registry is exact-owner private and revision-checked',async()=>{const path='ownerFileFolders/current',base={schemaVersion:1,revision:1,folders:{}};for(const ctx of [anon,wrong])await assertFails(setDoc(doc(ctx.firestore(),path),base));await assertSucceeds(setDoc(doc(owner.firestore(),path),base));for(const ctx of [anon,wrong])await assertFails(getDoc(doc(ctx.firestore(),path)));await assertFails(setDoc(doc(owner.firestore(),path),{...base,folders:{[ID]:{name:'New',parentId:'root',trashedAt:null}}}));await assertSucceeds(setDoc(doc(owner.firestore(),path),{...base,revision:2,folders:{[ID]:{name:'New',parentId:'root',trashedAt:null}}}));await assertFails(deleteDoc(doc(owner.firestore(),path)));});

test('resumable owner upload completes with the production metadata contract',async()=>{
  const bytes=300000;await seed(`ownerFiles/${ID}`,metadata({bytes}));
  const task=uploadBytesResumable(object(owner),new Uint8Array(bytes),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}});
  const snapshot=await assertSucceeds(task);assert.equal(snapshot.bytesTransferred,bytes);
  assert.equal((await getBytes(object(owner))).byteLength,bytes);
});
test('cancelled resumable upload never produces a readable object',async()=>{
  const bytes=300000;await seed(`ownerFiles/${ID}`,metadata({bytes}));
  const task=uploadBytesResumable(object(owner),new Uint8Array(bytes),{contentType:'image/webp',cacheControl:'private, no-store, max-age=0',contentDisposition:'inline',customMetadata:{fileId:ID}});
  assert.equal(task.cancel(),true);await assert.rejects(task,error=>error.code==='storage/canceled');
  await assert.rejects(getMetadata(object(owner)),error=>error.code==='storage/object-not-found');
});
test('reservation identity and attachment disposition cannot be substituted',async()=>{
  await seed(`ownerFiles/${ID}`,metadata());
  for(const patch of [{customMetadata:{}},{customMetadata:{fileId:ID2}},{customMetadata:{fileId:ID,extra:'value'}},{contentDisposition:'attachment'}])await assertFails(uploadBytes(object(owner),new Uint8Array([1,2,3]),{contentType:'image/webp',contentDisposition:'inline',customMetadata:{fileId:ID},...patch}));
});
test('missing/trashed parent folders reject creates and moves; root restore stays possible',async()=>{
  await assertFails(setDoc(file(owner),metadata({parentId:ID2})));
  await seed('ownerFileFolders/current',{schemaVersion:1,revision:1,folders:{[ID2]:{name:'Parent',parentId:'root',trashedAt:ISO}}});
  await assertFails(setDoc(file(owner),metadata({parentId:ID2})));
  await assertSucceeds(setDoc(file(owner),metadata()));
  await assertFails(updateDoc(file(owner),{parentId:ID2,revision:2}));
  await assertSucceeds(updateDoc(file(owner),{trashedAt:ISO,revision:2}));
  await assertSucceeds(updateDoc(file(owner),{trashedAt:null,parentId:'root',revision:3}));
});
test('public asset index itself remains private even while images are public',async()=>{
  await seedPublic([ID],false);for(const ctx of [anon,wrong]){await assertFails(getDoc(doc(ctx.firestore(),'site/publishedAssets')));await assertFails(getDocs(collection(ctx.firestore(),'ownerFileFolders')));}
  await assertSucceeds(getDoc(doc(owner.firestore(),'site/publishedAssets')));
});

test('generic files remain private and attachment-only even when indexed',async()=>{
 await seed(`ownerFiles/${ID}`,metadata({kind:'file',contentType:'application/octet-stream',width:0,height:0}));
 const path=`files/${ID}.bin`;const meta={contentType:'application/octet-stream',contentDisposition:'attachment',customMetadata:{fileId:ID}};
 await assertFails(uploadBytes(ref(owner.storage(),path),new Uint8Array([1,2,3]),{...meta,contentDisposition:'inline'}));
 await assertSucceeds(uploadBytes(ref(owner.storage(),path),new Uint8Array([1,2,3]),meta)); await seedPublic();
 for(const ctx of [anon,wrong])await assertFails(getBytes(ref(ctx.storage(),path)));
});
test('fonts private until indexed and gateopen; wrongtypes denied',async()=>{
 await seed(`ownerFiles/${ID}`,metadata({kind:'font',contentType:'font/woff2',width:0,height:0}));
 const path=`fonts/${ID}.font`,meta={contentType:'font/woff2',contentDisposition:'inline',customMetadata:{fileId:ID}};
 await assertSucceeds(uploadBytes(ref(owner.storage(),path),new Uint8Array([1,2,3]),meta));
 await assertFails(getBytes(ref(anon.storage(),path)));await seedPublic();await assertSucceeds(getBytes(ref(anon.storage(),path)));
 await seedPublic([ID],true);await assertFails(getBytes(ref(anon.storage(),path)));
});
test('owner cannot manufacture or change deletionreservation',async()=>{
 await assertFails(setDoc(file(owner),metadata({status:'deleting'})));await seed(`ownerFiles/${ID}`,metadata({status:'deleting'}));
 await assertFails(updateDoc(file(owner),{status:'ready',revision:2}));await assertFails(updateDoc(file(owner),{name:'Restored',revision:2}));await assertFails(deleteDoc(file(owner)));
 for(const ctx of [owner,wrong,anon])await assertFails(setDoc(doc(ctx.firestore(),'ownerFileMaintenance/current'),{lastRunAt:ISO}));
});

test('default Fonts folder cannot be renamed, moved, trashed or removed by owner client',async()=>{
 const fonts='00000000-0000-4000-8000-000000000001',path='ownerFileFolders/current',folder={name:'Fonts',parentId:'root',trashedAt:null};
 await assertSucceeds(setDoc(doc(owner.firestore(),path),{schemaVersion:1,revision:1,folders:{[fonts]:folder}}));
 for(const folders of [{},{[fonts]:{...folder,name:'Other'}},{[fonts]:{...folder,trashedAt:ISO}}])await assertFails(setDoc(doc(owner.firestore(),path),{schemaVersion:1,revision:2,folders}));
});
test('inventory data and barcode registries are exactownerprivate and revisionbound',async()=>{
 const item={schemaVersion:1,revision:1,name:'Fur',kind:'material',categoryId:'',barcode:'FUR01',tags:['blue'],quantity:2,unit:'yards',lowStock:1,notes:'',archived:false,createdAt:ISO,updatedAt:ISO,history:[]};
 for(const ctx of [wrong,anon])await assertFails(setDoc(doc(ctx.firestore(),`ownerInventory/${ID}`),item));
 await assertSucceeds(setDoc(doc(owner.firestore(),`ownerInventory/${ID}`),item));
 for(const ctx of [wrong,anon]){await assertFails(getDoc(doc(ctx.firestore(),`ownerInventory/${ID}`)));await assertFails(getDocs(collection(ctx.firestore(),'ownerInventory')));}
 await assertFails(updateDoc(doc(owner.firestore(),`ownerInventory/${ID}`),{quantity:-1,revision:2}));await assertFails(updateDoc(doc(owner.firestore(),`ownerInventory/${ID}`),{quantity:3,revision:1}));
 await assertSucceeds(updateDoc(doc(owner.firestore(),`ownerInventory/${ID}`),{quantity:3,revision:2}));await assertFails(deleteDoc(doc(owner.firestore(),`ownerInventory/${ID}`)));
 const categories={schemaVersion:1,revision:1,categories:[]};await assertSucceeds(setDoc(doc(owner.firestore(),'ownerInventorySettings/categories'),categories));
 const key='4655523031';await assertSucceeds(setDoc(doc(owner.firestore(),`ownerInventoryBarcodes/${key}`),{itemId:ID}));
 for(const ctx of [wrong,anon]){await assertFails(getDoc(doc(ctx.firestore(),`ownerInventoryBarcodes/${key}`)));await assertFails(setDoc(doc(ctx.firestore(),'ownerInventorySettings/categories'),categories));await assertFails(deleteDoc(doc(ctx.firestore(),`ownerInventoryBarcodes/${key}`)));}
});

test('File Hub presentation order is owner-only, revisioned and cannot grant public file access',async()=>{
 const path='ownerFileOrder/root',value={schemaVersion:1,revision:1,keys:[`file:${ID}`]};
 for(const ctx of [anon,wrong]){await assertFails(getDoc(doc(ctx.firestore(),path)));await assertFails(setDoc(doc(ctx.firestore(),path),value));}
 await assertSucceeds(setDoc(doc(owner.firestore(),path),value));await assertSucceeds(getDoc(doc(owner.firestore(),path)));
 await assertFails(setDoc(doc(owner.firestore(),path),value));
 await assertSucceeds(setDoc(doc(owner.firestore(),path),{...value,revision:2,keys:[]}));
 await assertFails(setDoc(doc(owner.firestore(),path),{...value,revision:3,keys:[`file:${ID}`,`file:${ID}`]}));
 await assertFails(setDoc(doc(owner.firestore(),'ownerFileOrder/missing'),value));
 await assertFails(deleteDoc(doc(owner.firestore(),path)));await assertFails(getDocs(collection(owner.firestore(),'ownerFileOrder')));
 await seedPhoto();await assertFails(getBytes(object(anon)));
});

test('inventory custom settings and half thresholds preserve legacy stock; barcode reservations cannot be stolen',async()=>{
 const db=owner.firestore(),target=doc(db,`ownerInventory/${ID}`);
 const item={schemaVersion:1,revision:1,name:'Fur / trim',kind:ID2,categoryId:'',barcode:'FUR01',tags:[],quantity:2.375,unit:'rolls',lowStock:0.5,notes:'',archived:false,createdAt:ISO,updatedAt:ISO,history:[]};
 await assertSucceeds(setDoc(doc(db,'ownerInventorySettings/categories'),{schemaVersion:1,revision:1,categories:[],itemTypes:[{id:ID2,name:'Packaging'}],units:['rolls']}));
 await assertFails(setDoc(target,{...item,lowStock:0.25}));await assertSucceeds(setDoc(target,item));
 await assertFails(updateDoc(target,{revision:2,lowStock:0.1}));await assertSucceeds(updateDoc(target,{revision:2,lowStock:1.5}));
 await seed(`ownerInventory/${ID}`,{...item,lowStock:0.125});
 await assertSucceeds(updateDoc(target,{revision:2,name:'Legacy preserved'}));await assertFails(updateDoc(target,{revision:3,lowStock:0.25}));
 const reservation=doc(db,'ownerInventoryBarcodes/4655523031');
 await assertSucceeds(setDoc(reservation,{itemId:ID}));await assertSucceeds(setDoc(reservation,{itemId:ID}));
 await assertFails(setDoc(reservation,{itemId:ID2}));assert.equal((await getDoc(reservation)).data().itemId,ID);
});
