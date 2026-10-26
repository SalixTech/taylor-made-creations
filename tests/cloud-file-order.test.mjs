import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const m=sourceLoader()('src/owner/cloud-file-order.ts');
const a='file:11111111-1111-4111-8111-111111111111', b='folder:22222222-2222-4222-8222-222222222222', c='file:33333333-3333-4333-8333-333333333333';
test('mixed file and folder insertion is stable, bidirectional and reconciles removed and new items',()=>{
 const saved={schemaVersion:1,revision:4,keys:[a,b]};
 assert.deepEqual(m.reorderCloudKeys(saved,4,[a,b,c],c,a).keys,[c,a,b]);
 assert.deepEqual(m.reorderCloudKeys(saved,4,[a,b,c],a,c,true).keys,[b,c,a]);
 assert.deepEqual(m.orderedCloudKeys(saved,[b,c]),[b,c]);
 assert.deepEqual(m.reorderCloudKeys(saved,4,[a,b],a,a).keys,[a,b]);
 assert.throws(()=>m.reorderCloudKeys(saved,3,[a,b],a,b),/another device/);
 assert.throws(()=>m.reorderCloudKeys(saved,4,[a,b],c,a),/missing/);
 assert.throws(()=>m.reorderCloudKeys(saved,4,[a,b],a,c),/missing/);
});
test('layout decoding rejects malformed IDs, duplicate keys, oversized and extra data',()=>{
 for(const keys of [[a,a],['file:../private'],['other:'+a.slice(5)],[42],Array(5001).fill(a)])assert.throws(()=>m.decodeCloudFileOrder({schemaVersion:1,revision:1,keys}));
 assert.throws(()=>m.decodeCloudFileOrder({schemaVersion:1,revision:1,keys:[a],extra:true}));
});
