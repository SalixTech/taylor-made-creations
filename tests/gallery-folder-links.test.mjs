import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';
const {galleryLinkedFileIds}=sourceLoader()('src/owner/gallery-folder-links.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const folders={schemaVersion:1,revision:1,folders:{[id(2)]:{name:'Gallery',parentId:'root',trashedAt:null},[id(3)]:{name:'Commissions',parentId:'root',trashedAt:null},[id(4)]:{name:'Trash',parentId:'root',trashedAt:'2026-10-28T00:00:00.000Z'}}};
const file=(n,patch={})=>({id:id(n),kind:'photo',status:'ready',parentId:'root',trashedAt:null,...patch});
test('virtual Gallery links dedupe exact owner photo IDs and never include private originals, trash, missing or pending assets',()=>{
 const files=[file(10),file(11,{parentId:id(2)}),file(12,{kind:'file'}),file(13,{status:'uploading'}),file(14,{trashedAt:'2026-10-28T00:00:00.000Z'}),file(15,{parentId:id(4)}),file(16,{parentId:id(3)}),file(17,{parentId:id(99)})];
 const gallery={items:[...Array.from({length:10},(_,n)=>({src:`/api/cloud-media/${id(n+10)}`})),{src:`/api/cloud-media/${id(10)}`},{src:`https://example.test/api/cloud-media/${id(10)}`},{src:`/api/cloud-files/${id(12)}?kind=file`}]};
 assert.deepEqual([...galleryLinkedFileIds(gallery,files,folders)],[id(10)]);assert.deepEqual([...galleryLinkedFileIds(null,files,folders)],[]);
 assert.equal(files[0].parentId,'root');assert.equal(files[0].name,undefined,'helper does not rename or copy records');
});
