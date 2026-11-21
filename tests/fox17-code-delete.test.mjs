import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t){
 const h=harness();delete h.overrides['./IntakeInbox'];let fail=false,release=null;const calls=[],timers=[];
 const item={requestId:'00000000-0000-4000-8000-000000000001',name:'Fox',email:'fox@example.test',message:'Help',status:'open',resolution:null,trashedAt:null,version:4,createdAt:'2026-10-29T00:00:00Z'};
 h.window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};h.window.clearTimeout=()=>{};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={collection:()=>({}),query:()=>({}),limit:()=>({}),getDocs:async()=>({docs:[{id:item.requestId,data:()=>({...item})}]})};
 h.overrides['./client-hub-client']={listClients:async()=>[],resetClientLoginCode:async()=>{throw Error('Reset not authorized by this workflow');}};
 h.overrides['./intake-client']={callOwnerIntake:async(name,input)=>{calls.push({name,input});if(release)await release;if(fail)throw Error('Owner response uncertain');return{status:'open',resolution:null,trashedAt:'2026-10-29T23:00:00Z',version:5};}};
 const C=h.load('src/owner/IntakeInbox.tsx').CodeRecoveryInbox,render=()=>h.render(C),dialog=()=>h.find(n=>n.type?.name==='Dialog'),card=()=>h.find(n=>n.props.className==='recoveryCard'),button=label=>[...nodes(h.tree),...nodes(dialog()?.props.actions)].find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label));
 t.after(()=>h.unmount());return{h,render,dialog,card,button,calls,timers,set fail(v){fail=v},set gate(v){release=v},async ready(){render();await tick();render();}};
}
test('card delete opens only standalone confirmation; Cancel/X never open verification or mutate',async t=>{
 const f=fixture(t);await f.ready();f.card().props.onKeyDown({key:'Delete',preventDefault(){}});f.render();
 assert.equal(f.h.all(n=>n.type?.name==='Dialog').length,1);assert.equal(f.dialog().props.title,'Move this request to Deleted?');assert.doesNotMatch(content(f.h.tree),/Verified client|Request from|Generate replacement code/);assert.equal(f.calls.length,0);
 f.button('Cancel').props.onClick();f.render();assert.equal(f.dialog(),undefined);assert.equal(f.calls.length,0);
 f.card().props.onKeyDown({key:'Delete',preventDefault(){}});f.render();f.dialog().props.onClose();f.render();assert.equal(f.dialog(),undefined);assert.equal(f.calls.length,0);
});
test('deleting from detail replaces—not nests—the detail dialog and Cancel returns without changing access',async t=>{
 const f=fixture(t);await f.ready();f.card().props.onClick();await tick();f.render();assert.equal(f.dialog().props.title,'Help with a client code');
 f.button('Delete request').props.onClick();f.render();assert.equal(f.h.all(n=>n.type?.name==='Dialog').length,1);assert.equal(f.dialog().props.title,'Move this request to Deleted?');assert.equal(f.button('Generate replacement code'),undefined);
 f.dialog().props.onClose();f.render();assert.equal(f.dialog().props.title,'Help with a client code');assert.equal(f.calls.length,0);
});
test('pending delete fences duplicate clicks; uncertain failure retains exact request/version retry after banner expiry',async t=>{
 const f=fixture(t);await f.ready();f.card().props.onKeyDown({key:'Delete',preventDefault(){}});f.render();let resolve;f.gate=new Promise(r=>resolve=r);f.fail=true;
 const click=f.button('Move to Deleted').props.onClick;click();click();f.render();assert.equal(f.calls.length,1);assert.equal(f.button('Moving…').props.disabled,true);assert.equal(f.dialog().props.dismissDisabled,true);
 resolve();await tick();f.render();assert.match(content(f.h.tree),/Owner response uncertain/);const errorTimer=f.timers.findLast(t=>t.ms===6000);errorTimer.fn();f.render();assert.match(content(f.h.tree),/not confirmed/);assert.equal(f.dialog().props.title,'Move this request to Deleted?');
 f.fail=false;f.gate=null;f.button('Move to Deleted').props.onClick();await tick();f.render();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.calls[0].input.expectedVersion,4);assert.equal(f.calls[0].input.action,'trash');assert.equal(f.dialog(),undefined);
});
