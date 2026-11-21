import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const request={id:'00000000-0000-4000-8000-000000000001',name:'Fox',email:'test@example.test',description:'FLATTENED PRIVATE ANSWERS',createdAt:'2026-10-28T01:00:00Z',status:'received',version:0};
function detailFixture(t,read,globals={}){const h=harness();Object.assign(h.globals,{atob},globals);delete h.overrides['./IntakeInbox'];h.overrides['./use-outcome-notice']={useOutcomeNotice:()=>['',()=>{},()=>null]};h.overrides['./client-hub-client']={listClients:async()=>[],getClientDetail:async()=>({projects:[]}),createClient:async()=>({})};h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};h.overrides['./intake-client']={callOwnerIntake:async()=>({}),referenceDisplayName:(_a,_b,_c,_d,fallback)=>fallback};h.overrides['firebase/firestore/lite']={doc:()=>({}),getDoc:read};const Component=h.load('src/owner/IntakeInbox.tsx').IntakeHubAction;const render=()=>h.render(Component,{request,onSaved(){}});t.after(()=>h.unmount());return{h,render};}
test('request opens a stable loading shell, never briefly renders flattened answers',async t=>{
 const gate=deferred(),f=detailFixture(t,()=>gate.promise);f.render();f.h.find(n=>n.type==='button').props.onClick();f.render();assert.match(content(f.h.tree),/Opening request details/);assert.doesNotMatch(content(f.h.tree),/FLATTENED/);
 gate.resolve({exists:()=>true,data:()=>({answers:[{label:'Character',value:'Fox'}],references:[]})});await flush();f.render();assert.match(content(f.h.tree),/Character/);assert.doesNotMatch(content(f.h.tree),/FLATTENED|Opening request details/);
});
test('reference preview validates bounded bytes and revokes object URL on close',async t=>{
 const created=[],revoked=[];const f=detailFixture(t,async()=>({exists:()=>true,data:()=>({answers:[],references:[{index:0,fileName:'fox.jpg',contentType:'image/jpeg',size:3}]})}),{URL:{createObjectURL:blob=>{assert.equal(blob.size,3);created.push('blob:test');return'blob:test'},revokeObjectURL:url=>revoked.push(url)}});
 f.h.overrides['./intake-client'].callOwnerIntake=async()=>({fileName:'fox.jpg',contentType:'image/jpeg',base64:'AQID'});
 f.render();f.h.find(n=>n.type==='button').props.onClick();await flush();f.render();f.h.find(n=>n.type==='button'&&content(n)==='View picture').props.onClick();await flush();f.render();assert.equal(created.length,1);const preview=f.h.find(n=>n.type?.name==='PrivateImageLightbox');assert.equal(preview.props.src,'blob:test');preview.props.onClose();f.render();assert.deepEqual(revoked,['blob:test']);
});
test('recovery replacement requires owner selection, verification, confirmation and prevents blind repeat',async t=>{
 const h=harness();delete h.overrides['./IntakeInbox'];let resets=0;const gate=deferred();h.overrides['./use-outcome-notice']={useOutcomeNotice:()=>['',()=>{},()=>null]};h.overrides['./client-hub-client']={listClients:async()=>[{clientId:'TMC-ONE',displayName:'Verified Fox',status:'active',authVersion:3}],resetClientLoginCode:async input=>{resets++;assert.deepEqual(input,{clientId:'TMC-ONE',expectedAuthVersion:3});return gate.promise}};h.overrides['./intake-client']={callOwnerIntake:async()=>({closed:true}),referenceDisplayName:()=>''};h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};h.overrides['firebase/firestore/lite']={collection:()=>({}),limit:()=>({}),query:()=>({}),getDocs:async()=>({docs:[{id:request.id,data:()=>({requestId:request.id,name:'Unverified Fox',email:request.email,message:'Code please',status:'open',version:1,createdAt:request.createdAt})}]})};const Component=h.load('src/owner/IntakeInbox.tsx').CodeRecoveryInbox,render=()=>h.render(Component);t.after(()=>h.unmount());render();await flush();render();h.find(n=>n.type==='button'&&content(n).includes('Unverified Fox')).props.onClick();await flush();render();assert.equal(h.find(n=>n.type==='button'&&content(n)==='Generate replacement code').props.disabled,true);
 h.find(n=>n.type?.name==='SiteSelect'&&n.props.id==='verified-recovery-client').props.onChange('TMC-ONE');render();h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});render();h.find(n=>n.type==='button'&&content(n)==='Generate replacement code').props.onClick();render();assert.equal(resets,0);const replace=h.find(n=>n.type==='button'&&content(n)==='Replace code now');replace.props.onClick();replace.props.onClick();assert.equal(resets,1);gate.reject(new Error('Response lost'));await flush();render();assert.match(content(h.tree),/outcome may be uncertain/);assert.equal(h.find(n=>n.type==='button'&&content(n)==='Generate replacement code'),undefined);
});
test('reference naming is filename-safe with preserved verified format and collision suffix',()=>{
 const h=harness();h.overrides['firebase/functions']={};h.overrides['./taylor-services-client']={};const {referenceDisplayName}=h.load('src/owner/intake-client.ts');assert.equal(referenceDisplayName('../Fox','2026-10-28T00:00:00Z',2,'image/jpeg','old.png'),'..-Fox-TMC-2026-10-28-3.jpg');assert.equal(referenceDisplayName('Fox',null,0,'image/jpeg','folder/old.jpg'),'folder_old.jpg');h.unmount();
});
test('purge security gates block bypass decisions and public notification reads',()=>{
 const rules=fs.readFileSync(new URL('../firebase/firestore.rules',import.meta.url),'utf8');assert.match(rules,/!\("referencePurge" in before\)/);assert.match(rules,/after.status != "denied"/);assert.match(rules,/match \/ownerIntakeNotifications\/\{notificationId\}[\s\S]*?allow get, list: if isOwner\(\)/);
 const handler=fs.readFileSync(new URL('../firebase/functions/intake.mjs',import.meta.url),'utf8');assert.match(handler,/referencePurgeConfigured: process.env.TMC_ENABLE_INTAKE_REFERENCE_PURGE === "true"/);
});

test('canonical reference name keeps original submission date across midnight retry',()=>{
 const h=harness();h.overrides['firebase/functions']={};h.overrides['./taylor-services-client']={};
 const {referenceDisplayName}=h.load('src/owner/intake-client.ts');
 assert.equal(referenceDisplayName('Fox','2026-10-29T00:01:00Z',0,'image/jpeg','Fox-TMC-2026-10-28-1.jpg'),'Fox-TMC-2026-10-28-1.jpg');
 assert.equal(referenceDisplayName('Fox','2026-10-29T00:01:00Z',0,'image/jpeg','../Fox-TMC-2026-10-28-1.jpg'),'Fox-TMC-2026-10-29-1.jpg');
 assert.equal(referenceDisplayName('Fox','2026-10-29T00:01:00Z',0,'image/jpeg','Fox-TMC-2026-02-30-1.jpg'),'Fox-TMC-2026-10-29-1.jpg');
 h.unmount();
});
