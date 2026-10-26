import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, nodes, content } from './owner-ui-harness.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture() {
  const h=harness();let raw={name:'Real request',description:'A fox'}, active=true, fail=false, commits=[], calls=0;
  const auth={currentUser:{uid:'verified-owner'}};
  h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},auth,assertCurrent(){if(!active)throw Error('Owner session changed');}})};
  h.overrides['firebase/firestore/lite']={doc(base,...parts){return {path:[base.path,...parts].filter(Boolean).join('/')};},serverTimestamp:()=>({server:'timestamp'}),async runTransaction(_db,fn){calls++;const writes=[];const result=await fn({get:async()=>({exists:()=>true,data:()=>structuredClone(raw)}),update:(ref,value)=>writes.push({kind:'update',path:ref.path,value}),set:(ref,value)=>writes.push({kind:'set',path:ref.path,value})});if(fail)throw Error('Permission denied');commits.push(...writes);return result;}};
  const model=h.load('src/owner/commission-requests-model.ts'),client=h.load('src/owner/commission-requests-client.ts');
  return {h,model,client,summary:()=>model.requestSummary('real-doc',raw),get commits(){return commits;},get calls(){return calls;},set raw(v){raw=v;},set active(v){active=v;},set fail(v){fail=v;}};
}
test('owner decision atomically persists status/version plus immutable matching history only',async()=>{
  const t=fixture(),request=t.summary();assert.equal(request.status,'received');assert.equal(request.version,0);
  assert.deepEqual(await t.client.decideCommissionRequest(request,'approved'),{status:'approved',version:1});
  assert.equal(t.commits.length,2);assert.equal(t.commits[0].path,'commissionRequests/real-doc');assert.deepEqual(Object.keys(t.commits[0].value).sort(),['status','updatedAt','updatedBy','version']);
  assert.equal(t.commits[1].path,'commissionRequests/real-doc/history/1');assert.deepEqual(t.commits[1].value,{fromStatus:'received',toStatus:'approved',version:1,actorUid:'verified-owner',createdAt:{server:'timestamp'}});t.h.unmount();
});
test('concurrent stale decision, malformed state, auth loss and persistence failure never commit',async()=>{
  for(const kind of ['stale','corrupt','session','write']){const t=fixture(),request=t.summary();if(kind==='stale')t.raw={status:'waitlisted',version:1};if(kind==='corrupt')t.raw={status:'unexpected',version:0};if(kind==='session')t.active=false;if(kind==='write')t.fail=true;
    await assert.rejects(t.client.decideCommissionRequest(request,'denied'));assert.deepEqual(t.commits,[]);t.h.unmount();}
});
test('no-op decision and invalid decision are rejected without a write',async()=>{
  const t=fixture();t.raw={status:'approved',version:1};await assert.rejects(t.client.decideCommissionRequest(t.summary(),'approved'),/already/);await assert.rejects(t.client.decideCommissionRequest(t.summary(),'received'),/Choose/);assert.deepEqual(t.commits,[]);t.h.unmount();
});
test('confirmation is cancellable, double-click locked, failure retains original status',async()=>{
  const h=harness();let decisions=0,reject;const wait=new Promise((_,r)=>{reject=r;});
  h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
  h.overrides['./commission-requests-client']={decideCommissionRequest:async()=>{decisions++;return wait;},readCommissionHistory:async()=>[]};
  h.overrides['firebase/firestore/lite']={collection:()=>({}),limit:()=>({}),query:()=>({}),getDocs:async()=>({docs:[{id:'real',data:()=>({name:'Real request'})}]})};
  const Component=h.load('src/owner/CommissionRequests.tsx').CommissionRequests,render=()=>h.render(Component),button=label=>h.find(n=>n.type==='button'&&content(n)===label),dialog=()=>h.find(n=>typeof n.type==='function'&&n.type.name==='Dialog');
  render();await flush();render();button('Approve').props.onClick();render();assert.equal(decisions,0);assert.match(content(dialog()),/No email, customer reply, contract, or charge/);dialog().props.onClose();render();assert.equal(dialog(),undefined);
  button('Deny').props.onClick();render();let save=nodes(dialog().props.actions).find(n=>n.type==='button'&&content(n)==='Save decision');save.props.onClick();save.props.onClick();render();assert.equal(decisions,1);assert.equal(dialog().props.dismissDisabled,true);
  reject(Error('Denied; no decision saved'));await flush();render();assert.match(content(h.tree),/Denied; no decision saved/);assert.match(content(h.tree),/Received/);assert.doesNotMatch(content(h.tree),/saved privately/);h.unmount();
});
