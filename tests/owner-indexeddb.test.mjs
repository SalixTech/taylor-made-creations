import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {defaults as d,storage as s} from './owner-test-modules.mjs';

/** Minimal controlled IDB lifecycle, including transaction completion separately
 * from a put's success. Real browser persistence is covered in browser QA. */
function controlledIDB({initial=null,mode='manual'}={}){
  let raw=structuredClone(initial),staged,transaction,openRequest,closed=0,putSuccess=false;
  let reachedPut;const whenPut=new Promise(resolve=>{reachedPut=resolve;});
  const db={
    objectStoreNames:{contains:()=>true},close(){closed++;},
    transaction(_name,access){
      transaction={
        error:null,
        abort(){queueMicrotask(()=>transaction.onabort?.());},
        objectStore(){return {
          get(){const request={};queueMicrotask(()=>{request.result=structuredClone(raw);request.onsuccess?.();if(access==='readonly'){if(mode==='read-abort'){transaction.error=new Error('Read interrupted');transaction.onabort?.();}else transaction.oncomplete?.();}});return request;},
          put(value){
            staged=structuredClone(value);const request={};
            queueMicrotask(()=>{putSuccess=true;request.onsuccess?.();reachedPut();if(mode==='quota'){transaction.error=new DOMException('Storage is full','QuotaExceededError');transaction.onabort?.();}});
            return request;
          },
        };},
      };
      return transaction;
    },
  };
  const factory={open(){
    openRequest={result:db};queueMicrotask(()=>{
      if(mode==='blocked')openRequest.onblocked?.();
      else if(mode==='open-error'){openRequest.error=new DOMException('Not allowed','SecurityError');openRequest.onerror?.();}
      else openRequest.onsuccess?.();
    });return openRequest;
  }};
  return {factory,whenPut,commit(){raw=staged;transaction.oncomplete?.();},lateOpen(){openRequest.onsuccess?.();},get raw(){return raw;},get putSuccess(){return putSuccess;},get closed(){return closed;}};
}

test('IDB save does not resolve at put success; only complete confirms commit',async()=>{
  const idb=controlledIDB(),store=s.createOwnerStore(s.createIndexedDBOwnerAdapter(idb.factory));
  let saved=false;const promise=store.saveDraft(d.createDefaultOwnerContent(),0).then(value=>{saved=true;return value;});
  await idb.whenPut;await tick();assert.equal(idb.putSuccess,true);assert.equal(saved,false);assert.equal(idb.raw,null);
  idb.commit();const state=await promise;assert.equal(saved,true);assert.equal(state.revision,1);assert.equal(idb.raw.revision,1);assert.equal(idb.closed,1);
});
test('IDB quota abort after put never changes stored content or confirms success',async()=>{
  const idb=controlledIDB({mode:'quota'}),store=s.createOwnerStore(s.createIndexedDBOwnerAdapter(idb.factory));
  await assert.rejects(store.saveDraft(d.createDefaultOwnerContent(),0),error=>error.code==='write');
  assert.equal(idb.raw,null);assert.equal(idb.closed,1);
});
test('IDB blocked open is reported, and later connection is closed, not used',async()=>{
  const idb=controlledIDB({mode:'blocked'}),store=s.createOwnerStore(s.createIndexedDBOwnerAdapter(idb.factory));
  await assert.rejects(store.load(),error=>error.code==='blocked');assert.equal(idb.closed,0);
  idb.lateOpen();assert.equal(idb.closed,1);assert.equal(idb.raw,null);
});
test('IDB failure to open and interrupted read are visible failures',async()=>{
  for(const [mode,code] of [['open-error','unavailable'],['read-abort','read']]){
    const idb=controlledIDB({mode}),store=s.createOwnerStore(s.createIndexedDBOwnerAdapter(idb.factory));
    await assert.rejects(store.load(),error=>error.code===code);
  }
});
test('IDB stale revision abort retains original state and exposes conflict',async()=>{
  const state=d.createInitialOwnerWorkspace();state.revision=4;
  const idb=controlledIDB({initial:state}),store=s.createOwnerStore(s.createIndexedDBOwnerAdapter(idb.factory));
  await assert.rejects(store.saveDraft(d.createDefaultOwnerContent(),0),error=>error.code==='conflict');
  assert.deepEqual(idb.raw,state);assert.equal(idb.closed,1);
});
