import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
import { harness } from './owner-ui-harness.mjs';
const api=sourceLoader()('src/client-hub/chat-text-drafts.ts');
function memory(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const key=(uid='owner-a',project='p',epoch=1)=>api.CHAT_DRAFT_PREFIX+encodeURIComponent(JSON.stringify(['owner',uid,'c',project,epoch,'g']));
const scope=(k=key())=>({key:k,assertCurrent(){}});
const attempt={operationId:'11111111-1111-4111-8111-111111111111',body:'Unconfirmed',createdAt:new Date().toISOString(),state:'pending'};
test('local draft round trips exact text and immutable uncertain attempt; never restores automatic pending send',()=>{
 const s=memory(),a=scope();assert.equal(api.readChatDraft(s,a),null);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:attempt.body,attempt});
 const reopen=api.readChatDraft(s,scope());assert.equal(reopen.message,attempt.body);assert.deepEqual(reopen.attempt,{...attempt,state:'failed'});
 assert.deepEqual(Object.keys(JSON.parse(s.getItem(a.key))).sort(),['attempt','draftId','message','updatedAt','version']);
});
test('separate UID, commission and auth epoch cannot read another text draft',()=>{
 const s=memory(),a=scope();api.readChatDraft(s,a);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:'private',attempt:null});
 for(const k of [key('other'),key('owner-a','other-project'),key('owner-a','p',2)])assert.equal(api.readChatDraft(s,scope(k)),null);
});
test('cross-window CAS prevents stale edit and stale acknowledgement from deleting a newer draft',()=>{
 const s=memory(),a=scope(),b=scope();api.readChatDraft(s,a);api.readChatDraft(s,b);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:'newer',attempt:null});
 assert.throws(()=>api.writeChatDraft(s,b,{draftId:'11111111-1111-4111-8111-111111111111',message:'older',attempt:null}),/another window/);assert.throws(()=>api.writeChatDraft(s,b,{draftId:'11111111-1111-4111-8111-111111111111',message:'',attempt:null}),/another window/);assert.equal(api.readChatDraft(s,scope()).message,'newer');
});
test('explicit logout removes only that role and UID; stale callbacks cannot recreate draft',()=>{
 const s=memory();let valid=true;const a={...scope(),assertCurrent(){if(!valid)throw Error('revoked');}};
 api.readChatDraft(s,a);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:'private',attempt:null});const b=scope(key('other'));api.readChatDraft(s,b);api.writeChatDraft(s,b,{draftId:'11111111-1111-4111-8111-111111111111',message:'other',attempt:null});
 valid=false;api.clearAccountChatDrafts(s,'owner','owner-a');assert.equal(s.getItem(a.key),null);assert.ok(s.getItem(b.key));assert.throws(()=>api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:'late callback',attempt:null}),/revoked/);
});
test('malformed, oversized, mismatched attempt and expired drafts fail closed',()=>{
 const record={version:1,updatedAt:Date.now(),message:'x',attempt:null};
 for(const x of [{...record,version:2},{...record,message:'x'.repeat(4001)},{...record,updatedAt:1},{...record,attempt}])assert.throws(()=>api.decodeChatDraft(JSON.stringify(x)));
 assert.throws(()=>api.decodeChatDraft('{bad'));
});
const active=new Set();afterEach(()=>{for(const h of active)h.unmount();active.clear();});
const flush=()=>new Promise(r=>setImmediate(r));
async function hookFixture(storage,resolveScope=async()=>scope()){
 const h=harness();active.add(h);h.window.localStorage=storage;h.overrides['./workspace-client']={verifiedHubChatDraftScope:resolveScope};
 const useDraft=h.load('src/client-hub/use-chat-text-draft.ts').useChatTextDraft;let state;
 function Component(){state=useDraft({projectId:'p',clientId:'c'},true);return null;}
 const render=()=>h.render(Component,{});render();await flush();render();return {h,render,get state(){return state;}};
}
test('actual hook survives component/browser reopen and writes synchronously before navigation',async()=>{
 const s=memory(),first=await hookFixture(s);first.state.setMessage('Saved on this browser');first.render();assert.equal(first.state.durable,true);first.h.unmount();active.delete(first.h);
 const second=await hookFixture(s);assert.equal(second.state.message,'Saved on this browser');assert.equal(second.state.durable,true);second.state.clear();second.render();assert.equal(s.length,0);
});
test('actual hook preserves foreground text and guard when storage fails',async()=>{
 const s=memory();s.setItem=()=>{throw Error('quota');};const t=await hookFixture(s);t.state.setMessage('Never lose this');t.render();assert.equal(t.state.message,'Never lose this');assert.equal(t.state.durable,false);assert.match(t.state.problem,/only in this tab/);
});
test('slow verified scope cannot overwrite foreground typing or read before verification',async()=>{
 const s=memory(),a=scope();api.readChatDraft(s,a);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:'previous draft',attempt:null});let resolve;const wait=new Promise(r=>resolve=r);
 const t=await hookFixture(s,()=>wait);assert.equal(t.state.message,'');t.state.setMessage('typing now');t.render();resolve(scope());await flush();t.render();assert.equal(t.state.message,'typing now');assert.equal(t.state.durable,false);assert.equal(api.readChatDraft(s,scope()).message,'previous draft');
});
test('restored uncertain send remains immutable and cannot auto-send',async()=>{
 const s=memory(),a=scope();api.readChatDraft(s,a);api.writeChatDraft(s,a,{draftId:'11111111-1111-4111-8111-111111111111',message:attempt.body,attempt});const t=await hookFixture(s);assert.deepEqual(t.state.attempt,{...attempt,state:'failed'});assert.equal(t.state.message,attempt.body);assert.equal(t.state.durable,true);
});

test('actual workspace transport binds verified UID/client/authVersion/project/logout generation and rejects stale identity',async()=>{
 let valid=true,clientId='TMC-0123456789ABCDEF',epoch=4,generation='g1';const auth={currentUser:{uid:'hub:verified-client'},app:{}};
 const connection={auth,db:{},functions:{},assertCurrent(){if(!valid)throw Error('revoked');}};
 const loader=sourceLoader({
  './client':{verifiedClientHubConnection:async()=>({...connection,session:{clientId,authVersion:epoch}}),ClientHubError:class extends Error{constructor(code,message){super(message);this.code=code;}},CLIENT_HUB_FUNCTIONS_REGION:'us-central1'},
  '@/owner/taylor-services-client':{taylorOwnerSession:async()=>connection},'./callable-owner-session':{hubCallableOwnerSession:async()=>connection},
  './window-session':{hubWindowGeneration:()=>generation},'firebase/firestore':{getFirestore:()=>({})},'firebase/functions':{getFunctions:()=>({})},
 });
 const transport=loader('src/client-hub/workspace-client.ts');const p={clientId,projectId:'11111111-1111-4111-8111-111111111111'};
 const first=await transport.verifiedHubChatDraftScope(p,false),identity=JSON.parse(decodeURIComponent(first.key.slice(api.CHAT_DRAFT_PREFIX.length)));
 assert.deepEqual(identity,['client','hub:verified-client',clientId,p.projectId,4,'g1']);
 epoch=5;assert.notEqual((await transport.verifiedHubChatDraftScope(p,false)).key,first.key);
 generation='g2';assert.throws(first.assertCurrent,/session changed/);const second=await transport.verifiedHubChatDraftScope(p,false);auth.currentUser={uid:'other'};assert.throws(second.assertCurrent,/session changed/);
 clientId='TMC-ABCDEF0123456789';await assert.rejects(transport.verifiedHubChatDraftScope(p,false),/not part/);
 valid=false;await assert.rejects(transport.verifiedHubChatDraftScope(p,true),/revoked/);
});

test('attempt transition reports failure before a caller may send when quota or cross-window CAS fails',async()=>{
 const s=memory(),t=await hookFixture(s);t.state.setMessage(attempt.body);t.render();s.setItem=()=>{throw Error('quota');};
 assert.equal(t.state.setAttempt({...attempt,operationId:t.state.draftId}),false);t.render();assert.equal(t.state.durable,false);assert.match(t.state.problem,/Sending is paused/);
 const s2=memory(),a=await hookFixture(s2);a.state.setMessage(attempt.body);a.render();const other=scope();api.readChatDraft(s2,other);api.writeChatDraft(s2,other,{draftId:'11111111-1111-4111-8111-111111111111',message:'newer in another window',attempt:null});
 assert.equal(a.state.setAttempt({...attempt,operationId:a.state.draftId}),false);a.render();assert.equal(api.readChatDraft(s2,scope()).message,'newer in another window');
});

test('two restored windows use the same durable idempotency identity for the same saved text',async()=>{
 const s=memory(),first=await hookFixture(s);first.state.setMessage('One shared draft');first.render();const id=first.state.draftId;first.h.unmount();active.delete(first.h);
 const a=await hookFixture(s),b=await hookFixture(s);assert.equal(a.state.draftId,id);assert.equal(b.state.draftId,id);
 const exact={operationId:id,body:'One shared draft',createdAt:new Date().toISOString(),state:'pending'};
 assert.equal(a.state.setAttempt(exact),true);assert.equal(b.state.setAttempt(exact),false);assert.equal(api.readChatDraft(s,scope()).attempt.operationId,id);
});

test('real logout generation clears role/UID drafts and locks old scope across windows',()=>{
 const h=harness();active.add(h);const storage=memory();h.window.localStorage=storage;h.window.sessionStorage=memory();
 const windows=h.load('src/client-hub/window-session.ts');windows.acceptHubWindowSignIn('owner','owner-a');const oldGeneration=windows.hubWindowGeneration('owner','owner-a');
 const a=scope();api.readChatDraft(storage,a);api.writeChatDraft(storage,a,{draftId:attempt.operationId,message:'remove on explicit logout',attempt:null});
 const other=scope(key('other'));api.readChatDraft(storage,other);api.writeChatDraft(storage,other,{draftId:attempt.operationId,message:'other owner',attempt:null});
 assert.equal(windows.revokeHubWindows('owner','owner-a'),true);assert.equal(storage.getItem(a.key),null);assert.ok(storage.getItem(other.key));assert.throws(()=>windows.assertHubWindowSession('owner','owner-a'));
 windows.acceptHubWindowSignIn('owner','owner-a');assert.notEqual(windows.hubWindowGeneration('owner','owner-a'),oldGeneration);
});
test('active hook immediately removes foreground text after authenticated session lock',async()=>{
 const s=memory();let valid=true;const t=await hookFixture(s,async()=>({key:key(),assertCurrent(){if(!valid)throw Error('revoked');}}));
 t.state.setMessage('private foreground');t.render();valid=false;t.h.window.dispatchEvent(new Event('tmc-hub-session-lock'));t.render();assert.equal(t.state.message,'');assert.equal(s.getItem(key()),null);assert.equal(t.state.durable,false);
 t.state.setMessage('late event');t.render();assert.equal(s.getItem(key()),null);assert.equal(t.state.durable,false);
});
