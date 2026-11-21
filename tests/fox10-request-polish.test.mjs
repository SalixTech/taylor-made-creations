import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const request={requestId:'00000000-0000-4000-8000-000000000001',name:'Fox',email:'test@example.test',message:'Please help',status:'closed',resolution:'handled',version:2,createdAt:'2026-10-28T01:00:00Z'};
function recovery(t){
 const h=harness(); delete h.overrides['./IntakeInbox']; let calls=[],reads=0;
 h.overrides['./client-hub-client']={listClients:async()=>{reads++;return[{clientId:'TMC-ONE',displayName:'Verified Fox',status:'active',authVersion:reads}]},resetClientLoginCode:async()=>{throw Error('Must not reset during status changes')}};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={collection:()=>({}),limit:()=>({}),query:()=>({}),getDocs:async()=>({docs:[{id:request.requestId,data:()=>({...request})}]})};
 h.overrides['./intake-client']={callOwnerIntake:async(name,input)=>{calls.push({name,input});return{status:input.action==='reopen'?'open':'closed',resolution:input.action==='reopen'?null:'handled',version:input.expectedVersion+1,trashedAt:input.action==='trash'?'2026-10-28T02:00:00Z':null}},referenceDisplayName:()=>''};
 const Component=h.load('src/owner/IntakeInbox.tsx').CodeRecoveryInbox,render=()=>h.render(Component); t.after(()=>h.unmount());
 const button=label=>h.find(n=>n.type==='button'&&content(n)===label)||nodes(h.find(n=>n.type?.name==='Dialog')?.props.actions).find(n=>n.type==='button'&&content(n)===label);
 return{h,render,button,calls,get reads(){return reads}};
}
test('handled recovery requires explicit reopen and fresh owner verification before code generation',async t=>{
 const f=recovery(t);f.render();await flush();f.render();f.h.find(n=>n.type==='button'&&content(n).includes('Fox')).props.onClick();await flush();f.render();
 assert.equal(f.button('Generate replacement code'),undefined);assert.ok(f.button('Reopen'));
 f.button('Reopen').props.onClick();f.button('Reopen').props.onClick();await flush();f.render();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].input,{requestId:request.requestId,expectedVersion:2,action:'reopen'});
 assert.equal(f.reads,2);assert.equal(f.button('Generate replacement code').props.disabled,true);
 assert.equal(f.h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
 assert.equal(f.h.find(n=>n.type?.name==='SiteSelect'&&n.props.id==='verified-recovery-client').props.value,'');
});
test('code request delete is explicitly confirmed, reversible, and never removes audit data client-side',async t=>{
 const f=recovery(t);f.render();await flush();f.render();f.h.find(n=>n.type==='button'&&content(n).includes('Fox')).props.onClick();await flush();f.render();
 f.h.find(n=>n.type==='button'&&n.props['aria-label']==='Delete request').props.onClick();f.render();assert.equal(f.calls.length,0);assert.match(content(f.h.tree),/history stay recoverable/);
 f.button('Cancel').props.onClick();f.render();assert.equal(f.button('Move to Deleted'),undefined);
 f.h.find(n=>n.type==='button'&&n.props['aria-label']==='Delete request').props.onClick();f.render();f.button('Move to Deleted').props.onClick();await flush();f.render();assert.equal(f.calls[0].input.action,'trash');assert.equal(f.h.find(n=>n.type?.name==='Dialog'),undefined);f.h.find(n=>n.props['aria-label']==='Deleted code requests (1)').props.onClick();f.render();f.h.find(n=>n.props.className==='recoveryCard').props.onClick();await flush();f.render();assert.ok(f.button('Restore request'));assert.equal(f.button('Reopen'),undefined);
 f.button('Restore request').props.onClick();await flush();f.render();assert.equal(f.calls[1].input.action,'restore');assert.equal(f.calls[1].input.expectedVersion,3);assert.equal(f.h.find(n=>n.type?.name==='Dialog'),undefined);assert.ok(f.h.find(n=>n.type==='button'&&content(n).includes('Fox')));assert.equal(f.h.find(n=>n.props['aria-label']==='Deleted code requests (0)').props['aria-pressed'],false);
});
test('private image viewer shows loading, zoom, safe blob-only source and keyboard dismissal',t=>{
 const h=harness(),Viewer=h.load('src/components/PrivateImageLightbox.tsx').PrivateImageLightbox;let closes=0;const props={src:'',title:'Private photo',loading:true,onClose(){closes++}};t.after(()=>h.unmount());
 h.render(Viewer,props);assert.match(content(h.tree),/Loading image/);assert.equal(h.find(n=>n.type==='img'),undefined);
 props.src='blob:one';props.loading=false;h.render(Viewer,props);h.find(n=>n.type==='img').props.onLoad();h.render(Viewer,props);h.find(n=>n.props['aria-label']==='Zoom in').props.onClick();h.render(Viewer,props);assert.match(content(h.tree),/125%/);
 props.src='blob:two';h.render(Viewer,props);assert.match(content(h.tree),/100%/);assert.equal(h.find(n=>n.props['aria-label']==='Zoom in').props.disabled,true);
 props.src='https://untrusted.example/photo.png';h.render(Viewer,props);assert.equal(h.find(n=>n.type==='img'),undefined);assert.match(content(h.tree),/could not be displayed/);
 let prevented=false;h.find(n=>n.type==='dialog').props.onCancel({preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(closes,1);
});
test('actual private Test Form uses independent additional-part stacks and keeps selected followups with their part',t=>{
 const h=harness();h.overrides['./PublicSiteContext']={usePublicSiteState:()=>({status:'unpublished'})};const Form=h.load('src/components/CommissionForm.tsx').default;
 const draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),props={previewContent:draft,configuration:{}};t.after(()=>h.unmount());
 h.render(Form,props);const suit=h.find(n=>n.type==='SiteSelect'&&n.props.placeholder==='Choose a suit type');assert.ok(suit);suit.props.onChange('Head only');h.render(Form,props);
 const columns=()=>h.all(n=>n.props.className==='additionalColumn');assert.equal(columns().length,2);
 const part=h.all(n=>n.props.className==='additionalPart').find(n=>content(n).includes('Hand paws'));assert.ok(part);nodes(part).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render(Form,props);
 assert.match(content(h.all(n=>n.props.className==='additionalPart').find(n=>content(n).includes('Hand paws'))),/Hand paw extras/);
 assert.equal(columns().length,2);assert.equal(h.find(n=>n.type==='button'&&content(n)==='Send request'),undefined);
});
test('Deleted icon with accessible count sits before refresh and only switches the recovery view',async t=>{const f=recovery(t);f.render();await flush();f.render();const toggle=f.h.find(n=>n.type==='button'&&n.props['aria-label']==='Deleted code requests (0)');assert.ok(toggle);const tools=f.h.find(n=>n.type==='div'&&nodes(n).includes(toggle)&&n.props.className?.includes('recoveryTools'));assert.equal(nodes(tools).find(n=>n.type==='button'),toggle);assert.ok(nodes(tools).some(n=>n.props?.label==='Refresh client code requests'));toggle.props.onClick();f.render();assert.match(content(f.h.tree),/No deleted code requests/);assert.equal(f.calls.length,0);assert.ok(f.h.find(n=>n.props['aria-label']==='Back to requests (0)'));});
