import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('explicit transfer starts beside one blocked thumbnail, never alongside another in its lane',async()=>{
 const run=sourceLoader()('src/client-hub/attachment-transfer-queue.ts').createAttachmentTransferQueue();
 const gate=deferred(),events=[];let active=0,max=0;
 const job=(name,wait)=>async()=>{events.push(name);max=Math.max(max,++active);await wait;active--;return name;};
 const a=run('background',job('background1',gate.promise)),b=run('background',job('background2',Promise.resolve()));
 await tick();const c=run('interactive',job('click',Promise.resolve()));assert.equal(await c,'click');
 assert.deepEqual(events,['background1','click']);assert.equal(max,2);gate.resolve();await Promise.all([a,b]);assert.deepEqual(events,['background1','click','background2']);
});
test('queued abort rejects promptly without starting; failure frees its lane',async()=>{
 const run=sourceLoader()('src/client-hub/attachment-transfer-queue.ts').createAttachmentTransferQueue(),gate=deferred(),abort=new AbortController();let starts=0;
 const a=run('background',()=>gate.promise);const b=run('background',async()=>{starts++;},abort.signal);abort.abort();await assert.rejects(b,{name:'AbortError'});assert.equal(starts,0);gate.resolve();await a;
 await assert.rejects(run('background',async()=>{throw Error('denied');}),/denied/);assert.equal(await run('background',async()=>42),42);
});
test('queued task checks current auth when starting and no bytes are allocated for cancelled queue entries',async()=>{
 const run=sourceLoader()('src/client-hub/attachment-transfer-queue.ts').createAttachmentTransferQueue(),gate=deferred();let current=true,allocations=0;
 const a=run('interactive',()=>gate.promise),b=run('interactive',async()=>{if(!current)throw Error('session changed');allocations++;});
 current=false;gate.resolve();await a;await assert.rejects(b,/session changed/);assert.equal(allocations,0);
});
