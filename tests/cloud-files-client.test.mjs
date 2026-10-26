import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const ID='11111111-1111-4111-8111-111111111111',FOLDER='22222222-2222-4222-8222-222222222222',CHILD='33333333-3333-4333-8333-333333333333';
const ISO='2026-10-26T15:00:00.000Z';
const base=(patch={})=>({id:ID,schemaVersion:1,revision:1,kind:'photo',name:'Photo',parentId:'root',contentType:'image/webp',bytes:3,width:1,height:1,status:'uploading',trashedAt:null,createdAt:ISO,updatedAt:ISO,...patch});
const persisted=file=>Object.fromEntries(Object.entries(file).filter(([key])=>key!=='id'));
function fixture(){
  const documents=new Map(),objects=new Map(),uploads=[],writes=[],listeners=new Set();let getHook,commitHook,uploadMode='success',afterStart;
  const user={uid:'owner'},auth={currentUser:user,app:{options:{storageBucket:'taylor-made-creations.firebasestorage.app'}},onAuthStateChanged:callback=>{listeners.add(callback);return()=>listeners.delete(callback);}};
  const session={auth,db:{},token:'private-token',assertCurrent:()=>{if(auth.currentUser!==user)throw Error('Session changed');}};
  const snapshot=value=>({exists:()=>value!==undefined,data:()=>structuredClone(value)});
  const fs={
    doc:(_db,...parts)=>({path:parts.join('/')}),collection:(_db,path)=>({path}),
    getDoc:async target=>snapshot(documents.get(target.path)),
    getDocs:async target=>({docs:[...documents].filter(([path])=>path.startsWith(target.path+'/')).map(([path,data])=>({id:path.slice(target.path.length+1),data:()=>structuredClone(data)}))}),
    runTransaction:async(_db,run)=>{const pending=[];const result=await run({get:async target=>{await getHook?.(target.path);return snapshot(documents.get(target.path));},set:(target,data)=>pending.push([target.path,structuredClone(data)])});for(const [path,data]of pending){documents.set(path,data);writes.push([path,data]);}await commitHook?.();return result;},
  };
  const storage={
    getStorage:()=>({}),ref:(_storage,path)=>({path}),
    getMetadata:async target=>{const metadata=objects.get(target.path);if(!metadata)throw Object.assign(Error('Object not found'),{code:'storage/object-not-found'});return structuredClone(metadata);},
    uploadBytesResumable:(target,blob,metadata)=>{
      uploads.push({path:target.path,bytes:blob.size,metadata:structuredClone(metadata)});let rejectCallback,cancelled=false;
      const task={cancel:()=>{cancelled=true;rejectCallback?.(Object.assign(Error('Cancelled'),{code:'storage/canceled'}));return true;},on:(_event,progress,reject,resolve)=>{
        rejectCallback=reject;queueMicrotask(()=>{afterStart?.();if(cancelled)return;if(uploadMode==='failure'){reject(Object.assign(Error('Upload disconnected'),{code:'storage/retry-limit-exceeded'}));return;}progress({bytesTransferred:blob.size,totalBytes:blob.size});objects.set(target.path,{size:blob.size,contentType:metadata.contentType,customMetadata:metadata.customMetadata});resolve();});return()=>{};
      }};return task;
    },
  };
  const client=sourceLoader({'firebase/firestore/lite':fs,'firebase/storage':storage,'./taylor-services-client':{taylorOwnerSession:async()=>{session.assertCurrent();return session;}},'./asset-library-client':{notifyPrivateAssetLibraryChanged:()=>{}}})('src/owner/cloud-files-client.ts');
  return {client,documents,objects,uploads,writes,auth,session,setGetHook:fn=>{getHook=fn;},setCommitHook:fn=>{commitHook=fn;},setUploadMode:value=>{uploadMode=value;},setAfterStart:fn=>{afterStart=fn;},signOut:()=>{auth.currentUser=null;for(const listener of listeners)listener(null);}};
}
test('stale file revision and session loss before a metadata write never commit',async()=>{
  const f=fixture(),file=base();f.documents.set(`ownerFiles/${ID}`,persisted({...file,revision:2}));
  await assert.rejects(f.client.changeCloudFile(file,{name:'Stale'}),/changed/);assert.equal(f.writes.length,0);
  f.documents.set(`ownerFiles/${ID}`,persisted(file));f.setGetHook(()=>f.signOut());
  await assert.rejects(f.client.changeCloudFile(file,{name:'After logout'}),/Session/);assert.equal(f.writes.length,0);
});
test('folder concurrent revision and moving a parent into its descendant fail without writes',async()=>{
  const f=fixture(),registry={schemaVersion:1,revision:1,folders:{[FOLDER]:{name:'Parent',parentId:'root',trashedAt:null},[CHILD]:{name:'Child',parentId:FOLDER,trashedAt:null}}};
  f.documents.set('ownerFileFolders/current',{...registry,revision:2});
  await assert.rejects(f.client.changeCloudFolder(registry,FOLDER,{name:'Stale'}),/changed/);
  f.documents.set('ownerFileFolders/current',registry);
  await assert.rejects(f.client.changeCloudFolder(registry,FOLDER,{parentId:CHILD}),/cycle/);assert.equal(f.writes.length,0);
});
test('upload recovery rejects mismatched object metadata without activating the record',async()=>{
  const f=fixture(),file=base();f.documents.set(`ownerFiles/${ID}`,persisted(file));
  for(const patch of [{size:4},{contentType:'image/svg+xml'},{customMetadata:{fileId:FOLDER}}]){
    f.objects.set(`photos/${ID}.webp`,{size:3,contentType:'image/webp',customMetadata:{fileId:ID},...patch});
    await assert.rejects(f.client.confirmCloudUpload(file),/match/);
  }
  assert.equal(f.writes.length,0);assert.equal(f.documents.get(`ownerFiles/${ID}`).status,'uploading');
});
test('successful recovery advances only an unchanged record and sign-out after commit is not success',async()=>{
  const f=fixture(),file=base();f.documents.set(`ownerFiles/${ID}`,persisted(file));f.objects.set(`photos/${ID}.webp`,{size:3,contentType:'image/webp',customMetadata:{fileId:ID}});
  const ready=await f.client.confirmCloudUpload(file);assert.equal(ready.status,'ready');assert.equal(ready.revision,2);assert.equal(f.uploads.length,0);
  const g=fixture();g.documents.set(`ownerFiles/${ID}`,persisted(file));g.objects.set(`photos/${ID}.webp`,{size:3,contentType:'image/webp',customMetadata:{fileId:ID}});g.setCommitHook(()=>g.signOut());
  await assert.rejects(g.client.confirmCloudUpload(file),/Session/);assert.equal(g.documents.get(`ownerFiles/${ID}`).status,'ready','lost session is uncertain success, never a fake rollback');
});
test('unsupported, oversized, empty and fake PDF inputs fail before metadata reservation',async()=>{
  const f=fixture();for(const file of [new File(['<svg/>'],'x.svg',{type:'image/svg+xml'}),new File(['html'],'x.html',{type:'text/html'}),new File(['not pdf'],'x.pdf',{type:'application/pdf'}),new File([],'x.pdf',{type:'application/pdf'}),new File([new Uint8Array(20*1024*1024+1)],'big.pdf',{type:'application/pdf'})])await assert.rejects(f.client.uploadCloudFile(file));
  await assert.rejects(f.client.uploadCloudFile(new File(['%PDF-test'],'x.pdf',{type:'application/pdf'}),{photoOnly:true}),/photo/);
  assert.equal(f.writes.length,0);assert.equal(f.uploads.length,0);
});
test('PDF uploads go directly to immutable SDK path with fileId, attachment and no-store metadata',async()=>{
  const f=fixture(),progress=[];const file=new File(['%PDF-test'],'Private contract.pdf',{type:'application/pdf'});
  const saved=await f.client.uploadCloudFile(file,{onProgress:value=>progress.push(value)});
  assert.equal(saved.kind,'pdf');assert.equal(saved.status,'ready');assert.equal(saved.revision,2);assert.equal(f.uploads.length,1);
  assert.equal(f.uploads[0].path,`files/${saved.id}.pdf`);assert.deepEqual(f.uploads[0].metadata,{contentType:'application/pdf',cacheControl:'private, no-store, max-age=0',contentDisposition:'attachment',customMetadata:{fileId:saved.id}});
  assert.deepEqual(progress,[100]);assert.equal(f.writes.length,2);assert.equal(f.writes[0][1].status,'uploading');assert.equal(f.writes[1][1].status,'ready');
});
test('failed or cancelled upload retains pending metadata and does not activate or delete anything',async()=>{
  for(const mode of ['failure','cancel']){const f=fixture(),controller=new AbortController();f.setUploadMode(mode==='failure'?'failure':'success');if(mode==='cancel')f.setAfterStart(()=>controller.abort());
    await assert.rejects(f.client.uploadCloudFile(new File(['%PDF-test'],'x.pdf',{type:'application/pdf'}),{signal:controller.signal}));
    assert.equal(f.writes.length,1);assert.equal(f.writes[0][1].status,'uploading');assert.equal(f.documents.size,1);assert.equal(f.objects.size,0);
  }
});
test('photo normalization generates WebP bytes before direct cloud upload',async()=>{
  const f=fixture(),previousImage=globalThis.createImageBitmap,previousDocument=globalThis.document;let closed=0;
  globalThis.createImageBitmap=async()=>({width:8000,height:2000,close:()=>closed++});
  globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return{width:0,height:0,getContext:()=>({drawImage:()=>{}}),toBlob:callback=>callback(new Blob(['normalized'],{type:'image/webp'}))};}};
  try{const saved=await f.client.uploadCloudFile(new File(['raw image'],'photo.png',{type:'image/png'}));assert.equal(saved.width,4096);assert.equal(saved.height,1024);assert.equal(saved.contentType,'image/webp');assert.equal(f.uploads[0].path,`photos/${saved.id}.webp`);assert.equal(f.uploads[0].metadata.contentDisposition,'inline');assert.equal(closed,1);}
  finally{globalThis.createImageBitmap=previousImage;globalThis.document=previousDocument;}
});

test('wrong bucket configuration fails closed without reserving or uploading files',async()=>{
  const f=fixture();f.auth.app.options.storageBucket='unrelated-bucket.example';
  await assert.rejects(f.client.uploadCloudFile(new File(['%PDF-test'],'x.pdf',{type:'application/pdf'})),/not configured/);
  assert.equal(f.writes.length,0);assert.equal(f.uploads.length,0);
});

test('File Hub preserves image originals as private attachments without decoding or resizing',async()=>{
 const f=fixture(),raw=new File(['original-image-bytes'],'Artwork.png',{type:'image/png'});
 const saved=await f.client.uploadCloudFile(raw,{preserveOriginal:true});
 assert.equal(saved.kind,'file');assert.equal(saved.contentType,'application/octet-stream');assert.equal(saved.bytes,raw.size);
 assert.equal(saved.name,'Artwork.png');assert.equal(f.uploads[0].path,`files/${saved.id}.bin`);assert.equal(f.uploads[0].metadata.contentDisposition,'attachment');
});
test('supported project files keep bytes private and blocked executable types never reserve',async()=>{
 for(const name of ['Archive.zip','Video.mp4','Artwork.psd','Pattern.pes','Notes.docx']){
  const f=fixture(),saved=await f.client.uploadCloudFile(new File(['rawbytes'],name,{type:'application/octet-stream'}));assert.equal(saved.kind,'file');assert.equal(saved.bytes,8);
 }
 for(const name of ['Script.js','App.exe','Page.html','Vector.svg']){
  const f=fixture();await assert.rejects(f.client.uploadCloudFile(new File(['raw'],name)));assert.equal(f.writes.length,0);
 }
 const f=fixture(),oversize=new File(['%PDF-test'],'Huge.pdf',{type:'application/pdf'});Object.defineProperty(oversize,'size',{value:500000001});
 await assert.rejects(f.client.uploadCloudFile(oversize),/500 MB/);assert.equal(f.writes.length,0);
});
test('default Fonts folder is stable and cannot be moved, renamed or trashed',async()=>{
 const f=fixture(),fonts=await f.client.ensureCloudFontsFolder();const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(fonts.folders[id],{name:'Fonts',parentId:'root',trashedAt:null});
 assert.equal((await f.client.ensureCloudFontsFolder()).revision,fonts.revision);
 for(const change of [{name:'Other'},{parentId:FOLDER},{trashedAt:ISO}])await assert.rejects(f.client.changeCloudFolder(fonts,id,change),/default Fonts/);
});
test('server-reserved deleting files cannot be edited or restored',async()=>{
 const f=fixture(),file=base({status:'deleting',trashedAt:ISO});f.documents.set(`ownerFiles/${ID}`,persisted(file));
 await assert.rejects(f.client.changeCloudFile(file,{trashedAt:null}),/permanently deleted/);assert.equal(f.writes.length,0);
});

test('folder restore cannot race a reserved child deletion',async()=>{
 const f=fixture(),registry={schemaVersion:1,revision:1,folders:{[FOLDER]:{name:'Old projects',parentId:'root',trashedAt:ISO}}};
 f.documents.set('ownerFileFolders/current',registry);f.documents.set(`ownerFiles/${ID}`,persisted(base({parentId:FOLDER,status:'deleting',trashedAt:ISO})));
 await assert.rejects(f.client.changeCloudFolder(registry,FOLDER,{trashedAt:null}),/permanently deleted/);assert.equal(f.writes.length,0);
});

test('saved order is private metadata only and rejects stale, cross-folder and unknown identities',async()=>{
 const f=fixture(),a=base({status:'ready'}),b=base({id:CHILD,status:'ready',name:'Second'});
 f.documents.set(`ownerFiles/${ID}`,persisted(a));f.documents.set(`ownerFiles/${CHILD}`,persisted(b));
 const empty=await f.client.readCloudFileOrder('root');
 await f.client.saveCloudFileOrder('root',empty,`file:${CHILD}`,`file:${ID}`,false);
 assert.deepEqual((await f.client.readCloudFileOrder('root')).keys,[`file:${CHILD}`,`file:${ID}`]);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],'ownerFileOrder/root');assert.deepEqual(f.documents.get(`ownerFiles/${ID}`),persisted(a));assert.equal(f.uploads.length,0);
 await assert.rejects(f.client.saveCloudFileOrder('root',empty,`file:${ID}`,`file:${CHILD}`,false),/another device/);
 const saved=await f.client.readCloudFileOrder('root');
 await assert.rejects(f.client.saveCloudFileOrder('root',saved,`file:${FOLDER}`,`file:${ID}`,false),/missing/);
 f.documents.set('ownerFileFolders/current',{schemaVersion:1,revision:1,folders:{[FOLDER]:{name:'Other',parentId:'root',trashedAt:null}}});
 f.documents.set(`ownerFiles/${CHILD}`,persisted({...b,parentId:FOLDER}));
 await assert.rejects(f.client.saveCloudFileOrder('root',saved,`file:${CHILD}`,`file:${ID}`,false),/missing/);assert.equal(f.writes.length,1);
});
test('order transaction rechecks a concurrent move before writing and rejects sign-out',async()=>{
 const f=fixture();f.documents.set(`ownerFiles/${ID}`,persisted(base({status:'ready'})));f.documents.set(`ownerFiles/${CHILD}`,persisted(base({id:CHILD,status:'ready'})));
 f.setGetHook(path=>{if(path===`ownerFiles/${CHILD}`) f.documents.delete(path);});
 await assert.rejects(f.client.saveCloudFileOrder('root',{schemaVersion:1,revision:0,keys:[]},`file:${CHILD}`,`file:${ID}`,false),/missing/);assert.equal(f.writes.length,0);
 f.setGetHook(()=>f.signOut());await assert.rejects(f.client.saveCloudFileOrder('root',{schemaVersion:1,revision:0,keys:[]},`file:${ID}`,`file:${ID}`,false),/Session/);assert.equal(f.writes.length,0);
});

test('font uploads need no checkbox assertion but retain authenticated binary validation before cloud writes',async()=>{
 const previous=globalThis.fetch,requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response('{}',{status:200});};
 try{
  const f=fixture(),file=new File(['font-fixture'],'Display.woff2',{type:'font/woff2'}),saved=await f.client.uploadCloudFont(file);
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/taylor/cloud-fonts/validate');assert.equal(requests[0].options.headers.Authorization,'Bearer private-token');assert.equal(requests[0].options.headers['Content-Type'],'font/woff2');assert.equal(Object.hasOwn(requests[0].options.headers,'x-tmc-font-rights'),false);
  assert.equal(saved.kind,'font');assert.equal(saved.parentId,'00000000-0000-4000-8000-000000000001');assert.equal(saved.status,'ready');assert.equal(f.uploads[0].path,`fonts/${saved.id}.font`);
  globalThis.fetch=async()=>new Response('{}',{status:400});const denied=fixture();await assert.rejects(denied.client.uploadCloudFont(file),/safely validated/);assert.equal(denied.writes.length,0);assert.equal(denied.uploads.length,0);
  const invalid=fixture();await assert.rejects(invalid.client.uploadCloudFont(new File(['x'],'Script.svg')),/WOFF/);await assert.rejects(invalid.client.uploadCloudFont(new File([],'Empty.woff2')),/4 MB/);assert.equal(invalid.writes.length,0);
 }finally{globalThis.fetch=previous;}
});
