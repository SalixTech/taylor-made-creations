import {test} from 'node:test';import assert from 'node:assert/strict';import {sourceLoader} from './scout-source-loader.mjs';
const scan=sourceLoader()('src/owner/inventory-scanner.ts');
function read(keys,gap=8){let state=scan.emptyInventoryScan(),result,at=100;for(const key of keys){result=scan.inventoryScanKey(state,key,at);state=result.state;at+=gap;}return result;}
test('only a scanner-speed terminated burst qualifies; repeated characters remain legitimate barcode data',()=>{
 assert.equal(read([...'ABC112233','Enter']).barcode,'ABC112233');assert.equal(read([...'ABC112233','Tab']).barcode,'ABC112233');assert.equal(read([...'ABC112233','Enter'],100).barcode,undefined);assert.equal(read(['A','Enter']).barcode,undefined);assert.equal(read([...'ABC112233']).barcode,undefined);assert.equal(read([...'ABC','Escape',...'12','Enter']).barcode,undefined);
});
test('held keys, modifier shortcuts, composition and oversized payloads reset the scanner buffer',()=>{
 const state={value:'ABC',startedAt:1,lastAt:10};for(const option of [{repeat:true},{modified:true},{composing:true}])assert.equal(scan.inventoryScanKey(state,'D',11,option).state.value,'');assert.equal(read([...('X'.repeat(26)),'Enter']).barcode,undefined);
});
