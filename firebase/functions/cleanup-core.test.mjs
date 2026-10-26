import { test } from "node:test";
import assert from "node:assert/strict";
import { RETENTION_MS, canPurge, trashTime, objectPath, cleanupHealth } from "./cleanup-core.mjs";
const A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222";
const created="2026-09-01T00:00:00.000Z", trash="2026-09-15T00:00:00.000Z";
const base={id:A,kind:"photo",status:"ready",revision:2,createdAt:created,parentId:"root",trashedAt:trash};
const args={file:base,folders:{},publishedIds:[],now:Date.parse(trash)+RETENTION_MS,automatic:true};
test("daily cleanup waits full30days; manualcleanup requiresTrash",()=>{
 assert.equal(canPurge(args),true);assert.equal(canPurge({...args,now:args.now-1}),false);
 assert.equal(canPurge({...args,automatic:false,now:Date.parse(trash)}),true);
 assert.equal(canPurge({...args,file:{...base,trashedAt:null}}),false);
});
test("live assets protected evenwhenTrash or alreadyreserved",()=>{
 assert.equal(canPurge({...args,publishedIds:[A]}),false);
 assert.equal(canPurge({...args,publishedIds:[A],file:{...base,status:"deleting"}}),false);
});
test("stale manualconfirmation andfolderrestore do notpurge",()=>{
 assert.equal(canPurge({...args,automatic:false,revision:1}),false);
 assert.equal(canPurge({...args,file:{...base,trashedAt:null,parentId:B},folders:{[B]:{parentId:"root",trashedAt:null}}}),false);
});
test("nestedfolderTrash works withoutclobberingfile age",()=>{
 const file={...base,trashedAt:null,parentId:B};
 assert.equal(trashTime(file,{[B]:{parentId:"root",trashedAt:trash}}),Date.parse(trash));
 assert.equal(trashTime({...file,createdAt:"2026-09-20T00:00:00.000Z"},{[B]:{parentId:"root",trashedAt:trash}}),Date.parse("2026-09-20T00:00:00.000Z"));
});
test("malformedfoldergraph failsclosed",()=>{
 assert.throws(()=>trashTime({...base,parentId:B},{}));
 assert.throws(()=>trashTime({...base,parentId:B},{[B]:{parentId:B,trashedAt:trash}}));
});
test("reserveddeletion retries but unknownkinds neverpurge",()=>{
 assert.equal(canPurge({...args,file:{...base,status:"deleting"},now:0}),true);
 assert.equal(canPurge({...args,file:{...base,kind:"script"}}),false);
});
test("objectpaths fixedby UUID andkind",()=>{
 assert.equal(objectPath(A,"file"),`files/${A}.bin`); assert.equal(objectPath(A,"font"),`fonts/${A}.font`);
 assert.throws(()=>objectPath("../secret","file")); assert.throws(()=>objectPath(A,"../secret"));
});
test("cleanupstatus truthful onlyfreshsuccessfulscheduledheartbeat",()=>{
 const now=Date.parse("2026-10-26T16:00:00.000Z");assert.equal(cleanupHealth(null,now),false);
 assert.equal(cleanupHealth("2026-10-26T15:00:00.000Z",now),true);
 assert.equal(cleanupHealth("2026-10-23T15:00:00.000Z",now),false);
 assert.equal(cleanupHealth("2026-10-27T15:00:00.000Z",now),false);
});

test("pending resumableupload neverpurges and leaves its reservation intact",()=>{
 assert.equal(canPurge({...args,file:{...base,status:"uploading"}}),false);
 assert.equal(canPurge({...args,automatic:false,file:{...base,status:"uploading"}}),false);
});

test('savedworkspace and namedDraft reference scanning is exact and corruptwrappersfailclosed',async()=>{
 const {wrapperReferences}=await import('./cleanup-core.mjs');
 const wrap=value=>({schemaVersion:1,revision:1,payload:JSON.stringify(value)});
 assert.equal(wrapperReferences(wrap({draft:{image:`/api/cloud-media/${A}`}}),A),true);
 assert.equal(wrapperReferences(wrap({content:{font:`/api/cloud-fonts/${A}`}}),A),true);
 assert.equal(wrapperReferences(wrap({file:`/api/cloud-files/${A}?kind=file`}),A),true);
 assert.equal(wrapperReferences(wrap({text:`https://evil.test/api/cloud-media/${A}`}),A),false);
 assert.throws(()=>wrapperReferences({schemaVersion:1,revision:1,payload:'{broken'},A));
 assert.throws(()=>wrapperReferences({schemaVersion:1,revision:1,payload:'x'.repeat(700001)},A));
});
