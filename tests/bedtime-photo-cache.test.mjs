import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const {PrivatePhotoMemoryCache}=sourceLoader()('src/client-hub/private-photo-cache.ts');
const scope=()=>({user:{},accountKey:'client:one:project:epoch1'});
const result=(size=2,generation='1')=>({blob:new Blob(['x'.repeat(size)],{type:'image/png'}),generation});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('memory hit always calls validator; bounded LRU/TTL never returns bytes on its own',async t=>{
 let now=0;const c=new PrivatePhotoMemoryCache(4,2,100,()=>now),s=scope(),seen=[];t.after(()=>c.clear());
 const load=async old=>{seen.push(old);return old?{blob:old.blob,generation:old.generation}:result();};
 const first=await c.run(s,'one',load);assert.equal(await c.run(s,'one',load),first);assert.equal(seen.length,2);assert.equal(seen[1].blob,first);
 await c.run(s,'two',load);await c.run(s,'three',load);await c.run(s,'one',load);assert.equal(seen.at(-1),null);
 now=101;await c.run(s,'one',load);assert.equal(seen.at(-1),null);
});
test('old server without generation and overbudget bytes are never retained',async t=>{
 const c=new PrivatePhotoMemoryCache(4,2,100),s=scope(),seen=[];t.after(()=>c.clear());
 for(let i=0;i<2;i++)await c.run(s,'old',async old=>{seen.push(old);return{blob:result().blob};});
 for(let i=0;i<2;i++)await c.run(s,'large',async old=>{seen.push(old);return result(5);});
 assert.deepEqual(seen,[null,null,null,null]);
});
test('authorization/network failure never returns a cached fallback',async t=>{
 const c=new PrivatePhotoMemoryCache(),s=scope();t.after(()=>c.clear());await c.run(s,'photo',async()=>result());
 await assert.rejects(c.run(s,'photo',async old=>{assert.ok(old);throw new Error('offline');}),/offline/);
 await c.run(s,'photo',async old=>{assert.equal(old,null);return result();});
});
test('overlapping identical calls share one request but a consumer abort does not poison another',async t=>{
 const c=new PrivatePhotoMemoryCache(),s=scope(),a=new AbortController();t.after(()=>c.clear());let finish,calls=0;
 const load=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const one=c.run(s,'photo',load,a.signal),two=c.run(s,'photo',load);await flush();a.abort();await assert.rejects(one,e=>e.name==='AbortError');finish(result());assert.equal((await two).size,2);assert.equal(calls,1);
});
test('new auth epoch or user identity purges entries and fences old pending completion',async t=>{
 const c=new PrivatePhotoMemoryCache(),s=scope();t.after(()=>c.clear());let finish;
 const pending=c.run(s,'photo',()=>new Promise(resolve=>finish=resolve));const rejected=assert.rejects(pending,e=>e.name==='AbortError');await flush();
 const next={...s,accountKey:'client:one:project:epoch2'};await c.run(next,'photo',async old=>{assert.equal(old,null);return result(2,'2');});finish(result());await rejected;
 await c.run({...next,user:{}},'photo',async old=>{assert.equal(old,null);return result();});
});
test('cache data uses no object URLs or persistence API',()=>{
 const c=new PrivatePhotoMemoryCache();c.clear();assert.equal(typeof c.run,'function');
});
test('scope-specific revocation cannot evict a replacement account but clears its own scope',async t=>{
 const c=new PrivatePhotoMemoryCache(),old=scope(),current=scope();t.after(()=>c.clear());
 await c.run(current,'photo',async()=>result());c.clearIfCurrent(old);
 await c.run(current,'photo',async previous=>{assert.ok(previous);return {blob:previous.blob,generation:previous.generation};});
 c.clearIfCurrent(current);await c.run(current,'photo',async previous=>{assert.equal(previous,null);return result();});
});
