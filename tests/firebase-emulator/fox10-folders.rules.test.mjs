// Only local demo Firestore. Verifies the direct-SDK boundary independently of callable code.
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
const PROJECT='demo-tmc-fox10-folder-rules', OWNER='a4ARjp0z8ZOByKlC2AfGzmMRj843';
const ROOT='00000000-0000-4000-8000-000000000003', GALLERY='00000000-0000-4000-8000-000000000002', CHILD='11111111-1111-4111-8111-111111111111';
let env,owner,client,anon;
const ref=(ctx,path)=>doc(ctx.firestore(),path);
const registry={schemaVersion:1,revision:1,folders:{[ROOT]:{name:'Commissions',parentId:'root',trashedAt:null},[GALLERY]:{name:'Gallery',parentId:'root',trashedAt:null}}};
const seed=(path,value)=>env.withSecurityRulesDisabled(ctx=>setDoc(ref(ctx,path),value));
before(async()=>{if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18080')throw Error('Loopback demo emulator required'); env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:18080,rules:readFileSync(new URL('../../firebase/firestore.rules',import.meta.url),'utf8')}});owner=env.authenticatedContext(OWNER);client=env.authenticatedContext('hub:TMC-0123456789ABCDEF',{hubRole:'client',hubClientId:'TMC-0123456789ABCDEF',hubAuthVersion:1});anon=env.unauthenticatedContext();});
beforeEach(async()=>env.clearFirestore());after(async()=>env?.cleanup());
test('all direct folder registry writes are denied, including owner protected-root rename/move/delete',async()=>{
 await seed('ownerFileFolders/current',registry); await assertSucceeds(getDoc(ref(owner,'ownerFileFolders/current')));
 for(const change of [{name:'Other'},{parentId:CHILD},{trashedAt:'2026-10-28T00:00:00.000Z'}]) await assertFails(setDoc(ref(owner,'ownerFileFolders/current'),{...registry,revision:2,folders:{...registry.folders,[ROOT]:{...registry.folders[ROOT],...change}}}));
 await assertFails(deleteDoc(ref(owner,'ownerFileFolders/current')));
 await env.clearFirestore(); await assertFails(setDoc(ref(owner,'ownerFileFolders/current'),registry));
});
test('nested Commissions graph injection and atomic owner-file batch bypass are denied',async()=>{
 await seed('ownerFileFolders/current',registry);
 const nested={...registry,revision:2,folders:{...registry.folders,[CHILD]:{name:'Leak',parentId:ROOT,trashedAt:null}}};
 await assertFails(setDoc(ref(owner,'ownerFileFolders/current'),nested));
 const batch=writeBatch(owner.firestore()); batch.set(ref(owner,'ownerFileFolders/current'),nested); batch.set(ref(owner,`ownerFiles/${CHILD}`),{schemaVersion:1,revision:1,kind:'file',name:'secret.txt',parentId:CHILD,contentType:'application/octet-stream',bytes:1,width:0,height:0,status:'uploading',trashedAt:null,createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z'}); await assertFails(batch.commit());
});
test('client and anonymous sessions cannot browse owner folders or private Gallery metadata',async()=>{
 await seed('ownerFileFolders/current',registry); await seed('ownerGallery/current',{schemaVersion:1,revision:1,items:[]});
 for(const ctx of [client,anon]){ await assertFails(getDoc(ref(ctx,'ownerFileFolders/current'))); await assertFails(getDoc(ref(ctx,'ownerGallery/current'))); await assertFails(getDocs(collection(ctx.firestore(),'ownerFiles'))); }
 await assertSucceeds(getDoc(ref(owner,'ownerGallery/current'))); await assertFails(setDoc(ref(owner,'ownerGallery/current'),{schemaVersion:1,revision:2,items:[]}));
});
