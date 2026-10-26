import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),m=load('src/owner/cloud-files-model.ts');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ISO='2026-10-26T15:00:00.000Z';
const photo=(patch={})=>({schemaVersion:1,revision:1,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status:'uploading',trashedAt:null,createdAt:ISO,updatedAt:ISO,...patch});
const folder=(patch={})=>({name:'Folder',parentId:'root',trashedAt:null,...patch});
test('cloud IDs, display names and sources cannot become injected paths',()=>{
  assert.equal(m.cloudPhotoSource(A),`/api/cloud-media/${A}`);
  assert.equal(m.cloudObjectPath({id:A,kind:'photo'}),`photos/${A}.webp`);
  assert.equal(m.cloudObjectPath({id:A,kind:'pdf'}),`files/${A}.pdf`);
  for(const id of ['../secret','root',A+'/nested',A+'.webp','https://example.test/a','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])assert.throws(()=>m.assertCloudId(id));
  for(const name of ['', '.', '..', '../secret','folder/file','folder\\file',' x','x ', 'x\n','x\u0000','x'.repeat(151)])assert.equal(m.validFileName(name),false,name);
  assert.equal(m.validFileName('Taylor’s photo 01.webp'),true);
});
test('cloud metadata validates exact fields, upload limits and kind-specific dimensions',()=>{
  assert.equal(m.decodeCloudFile(photo(),A).id,A);
  assert.equal(m.decodeCloudFile(photo({kind:'pdf',contentType:'application/pdf',width:0,height:0,bytes:20*1024*1024}),A).kind,'pdf');
  for(const patch of [{id:A},{extra:1},{revision:0},{revision:NaN},{contentType:'image/svg+xml'},{bytes:0},{bytes:12*1024*1024+1},{width:4097},{height:0},{status:'done'},{createdAt:'not-a-time'},{parentId:'../bad'},{trashedAt:'2026-10-26'}])assert.throws(()=>m.decodeCloudFile(photo(patch),A));
});
test('folder graph rejects cycles, missing parents, excessive depth and count',()=>{
  for(const folders of [{[A]:folder({parentId:A})},{[A]:folder({parentId:B})},{[A]:folder({parentId:B}),[B]:folder({parentId:A})}])assert.throws(()=>m.decodeCloudFolders({schemaVersion:1,revision:1,folders}));
  const folders={};let parent='root';
  for(let i=0;i<9;i++){const id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;folders[id]=folder({parentId:parent});parent=id;}
  assert.throws(()=>m.decodeCloudFolders({schemaVersion:1,revision:1,folders}),/deep/);
  const tooMany=Object.fromEntries(Array.from({length:201},(_,i)=>[`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,folder()]));
  assert.throws(()=>m.decodeCloudFolders({schemaVersion:1,revision:1,folders:tooMany}));
});
test('ancestor Trash hides descendants and blocks moves until the parent is restored',()=>{
  const registry={schemaVersion:1,revision:1,folders:{[A]:folder({trashedAt:ISO}),[B]:folder({parentId:A})}};
  m.decodeCloudFolders(registry);
  assert.equal(m.isFolderTrashed(registry,B),true);assert.throws(()=>m.assertActiveFolder(registry,B),/Restore/);
  assert.equal(m.isFolderTrashed(registry,'root'),false);
  registry.folders[A].trashedAt=null;assert.doesNotThrow(()=>m.assertActiveFolder(registry,B));
});
test('public photo index deduplicates only cloud photo references and stays bounded',()=>{
  const d=load('src/owner/defaults.ts'),model=load('src/owner/model.ts');
  const draft=d.createDefaultOwnerContent();draft.home.image.src=m.cloudPhotoSource(A);draft.gallery[0].src=m.cloudPhotoSource(A);draft.gallery[1].src=m.cloudPhotoSource(B);draft.gallery[1].visible=false;
  const content=model.createPublishedOwnerSnapshot(draft,1,ISO).content;
  assert.deepEqual(m.publishedCloudPhotoIds(content),[A]);
  content.gallery=Array.from({length:501},(_,i)=>({src:`/api/cloud-media/00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
  assert.throws(()=>m.publishedCloudPhotoIds(content),/500/);
});

test('private files and cloud fonts validate distinct bounds and immutable paths',()=>{
 const file=m.decodeCloudFile(photo({kind:'file',contentType:'application/octet-stream',width:0,height:0,bytes:500000000}),A);
 assert.equal(m.cloudObjectPath(file),`files/${A}.bin`);
 assert.throws(()=>m.decodeCloudFile(photo({kind:'file',contentType:'application/octet-stream',width:0,height:0,bytes:500000001}),A));
 const font=m.decodeCloudFile(photo({kind:'font',contentType:'font/woff2',width:0,height:0,bytes:4000000,status:'ready',name:'Head Floof.woff2'}),A);
 assert.equal(m.cloudObjectPath(font),`fonts/${A}.font`);assert.equal(m.cloudFileToOwnerFont(font).src,`/api/cloud-fonts/${A}`);
 assert.equal(m.cloudFileToOwnerFont({...font,status:'deleting'}),null);
 assert.throws(()=>m.decodeCloudFile(photo({kind:'font',contentType:'font/woff2',width:0,height:0,bytes:4000001}),A));
});
test('cloud reference scans exact owned URL values and includes private draft fonts',()=>{
 assert.deepEqual(m.cloudReferencedAssetIds({draft:{image:`/api/cloud-media/${A}`,font:`/api/cloud-fonts/${B}`,other:`https://attacker.test/api/cloud-media/${A}`},private:`/api/cloud-files/${A}?kind=file`}),[A,B]);
 const loop={};loop.self=loop;assert.throws(()=>m.cloudReferencedAssetIds(loop));
});
