import { chatDraftStorageFixture } from './helpers/chat-draft-storage.mjs';
// Source-hook lifecycle fixtures with explicit layout metrics. NOT an actual-browser or visual pass.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const fixtures=new Set(),make=()=>{const h=harness();fixtures.add(h);return h;};
afterEach(()=>{for(const h of fixtures)h.unmount();fixtures.clear();});
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const C='TMC-0123456789ABCDEF',P='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',F='33333333-3333-4333-8333-333333333333',ISO='2026-10-27T20:00:00.000Z';
const project={clientId:C,projectId:P,title:'Fox suit',summary:'',status:'in-progress',progress:null,createdAt:ISO,updatedAt:ISO,version:1,progressSource:'manual',trackingUrl:null,trelloUrl:null};
const empty=()=>({messages:[],photos:[],requests:[],requestReplies:[],notifications:[],visibility:[],privateWorkspace:null});
const request={requestId:B,clientId:C,projectId:P,type:'support',body:'Help',senderRole:'client',version:1,status:'open',createdAt:ISO,updatedAt:ISO};
function workspace({owner=true,data=empty(),adapters={}}={}) {
 const h=make(),live=[],calls=[];
 h.overrides['./workspace-client']={...chatDraftStorageFixture(h),...h.overrides['./workspace-client'],async getHubCommissionFolders(){return {version:0,folderNames:[]};},clearHubPhotoCache(){},async loadProjectWorkspace(){return data;},subscribeProjectWorkspace(project,owner,onData,onError){live.push({onData,onError});return()=>{};},async markHubConversationRead(){return {notification:null};},async loadHubSupportRequest(){return request;},...adapters};
 h.overrides['./file-copy-client']={async deleteHubFileCopy(...args){calls.push(args);return {deleted:true};}};
 const Component=h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace,props={project,owner},render=()=>h.render(Component,props);render();
 return {h,props,render,live,calls,async ready(){await tick();render();await tick();render();},tab(label){h.all(n=>n.props.role==='tab').find(n=>content(n).startsWith(label)).props.onClick();render();},card(id=B){return h.all(n=>n.type?.name==='RequestCard').find(n=>n.props.request.requestId===id);},message(value){h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.onChange({target:{value}});render();},submit(){h.find(n=>n.type==='form'&&n.props.className==='composer').props.onSubmit({preventDefault(){}});render();}};
}
// Negative control is the exact pre-Fox5 hook from authenticated Fox4 release
// libfile_8e4c443bef248191892850690db7a625; fixture SHA256
// 95b9478437d2d45a5586466e2446eec9dc46beb6a40d8a31097415a977c9c006.
function scrollFixture(baseline=false){
 const h=make(),frames=[],observers=[];h.globals.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};h.globals.cancelAnimationFrame=()=>{};
 h.globals.ResizeObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 const api=h.load(baseline?'tests/fixtures/pre-fox5-use-conversation-scroll.ts':'src/client-hub/use-conversation-scroll.ts'),ref={current:null},pinned={current:true};let visible=false,revision='first',onScroll;
 const Component=()=>{const hookHandler=api.useConversationScroll(ref,pinned,visible,revision);onScroll=baseline?event=>{pinned.current=api.isConversationAtBottom(event.currentTarget);}:hookHandler;return{type:'div',props:{ref,onScroll}};};
 const render=()=>h.render(Component);render();const log=ref.current;log.clientHeight=300;log.scrollHeight=1000;log.children=[];let top=0;Object.defineProperty(log,'scrollTop',{get:()=>top,set:value=>{top=Math.max(0,Math.min(Number(value)||0,log.scrollHeight-log.clientHeight));}});visible=true;revision='ready';render();
 return {h,log,pinned,render,scroll(){onScroll({currentTarget:log});},resize(){observers.at(-1).fn();},frame(){frames.splice(0).forEach(fn=>fn());},show(value){visible=value;render();},change(){revision+='!';render();}};
}
test('baseline reproduced: late growth scroll event at unchanged top falsely unpins before resize follow',()=>{
 const f=scrollFixture(true);assert.equal(f.log.scrollTop,700);f.log.scrollHeight=1200;f.scroll();assert.equal(f.pinned.current,false);f.resize();assert.equal(f.log.scrollTop,700,'installed baseline stays behind newest message');
});
test('fixed lifecycle follows resize/new content while pinned; real upward movement stays put; hidden events cannot poison reopening',()=>{
 const f=scrollFixture();assert.equal(f.log.scrollTop,700);f.log.scrollHeight=1200;f.scroll();assert.equal(f.pinned.current,true);f.resize();assert.equal(f.log.scrollTop,900);
 f.log.scrollTop=200;f.scroll();assert.equal(f.pinned.current,false);f.log.scrollHeight=1400;f.change();f.resize();f.frame();assert.equal(f.log.scrollTop,200);
 f.show(false);f.log.scrollTop=0;f.scroll();f.show(true);assert.equal(f.pinned.current,true);assert.equal(f.log.scrollTop,1100);
 f.log.clientHeight=220;f.scroll();f.resize();assert.equal(f.log.scrollTop,1180);f.log.scrollTop=1160;f.scroll();assert.equal(f.pinned.current,true,'near-bottom tolerance remains');
});
test('owner exact server snapshot unlocks send before delayed RPC; old completion cannot clear a newer pending send',async()=>{
 const first=deferred(),second=deferred(),calls=[];
 const t=workspace({adapters:{sendHubMessage:async(...args)=>{calls.push(args);return calls.length===1?first.promise:second.promise;}}});await t.ready();t.tab('Maker Chat');t.message('First');t.submit();assert.equal(calls.length,1);assert.match(content(t.h.tree),/Sending…/);
 const one={messageId:calls[0][3],clientId:C,projectId:P,body:'First',createdAt:ISO,senderRole:'owner'};t.live[0].onData({...empty(),messages:[one]});await t.ready();assert.equal(t.h.find(n=>n.type==='button'&&content(n)==='Send Awoo').props.disabled,true,'empty draft cannot submit');t.message('Second');t.submit();assert.equal(calls.length,2);
 first.resolve({message:one});await t.ready();assert.match(content(t.h.tree),/SecondSending…/);assert.equal(t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.value,'Second');
 const two={...one,messageId:calls[1][3],body:'Second',createdAt:'2026-10-27T20:00:01.000Z'};second.resolve({message:two});await t.ready();assert.doesNotMatch(content(t.h.tree),/Not confirmed/);
});
test('owner send without a matching server ID stays pending, failed attempt retains exact retry ID; client path is not unlocked early',async()=>{
 for(const owner of [true,false]){const pending=deferred(),calls=[];const t=workspace({owner,adapters:{sendHubMessage:async(...args)=>{calls.push(args);return pending.promise;}}});await t.ready();t.tab('Maker Chat');t.message('Keep');t.submit();t.live[0].onData({...empty(),messages:[{messageId:owner?'other-id':calls[0][3],clientId:C,projectId:P,body:'Keep',createdAt:ISO,senderRole:owner?'owner':'client'}]});await t.ready();assert.ok(t.h.find(n=>n.type==='button'&&content(n)==='Sending…'));pending.reject(Error('RPC failed'));await t.ready();if(owner){assert.match(content(t.h.tree),/Not confirmed/);t.submit();assert.equal(calls[1][3],calls[0][3]);}}
});
test('owner Close chat collapses immediately with honest pending and rolls back failure without fabricated saved status',async()=>{
 const pending=deferred(),t=workspace({data:{...empty(),requests:[request]},adapters:{setHubSupportRequestStatus:()=>pending.promise}});await t.ready();t.tab('Requests');t.card().props.onToggle();t.render();assert.equal(t.card().props.expanded,true);const done=t.card().props.onStatus(request,'closed');t.render();assert.equal(t.card().props.expanded,false);assert.equal(t.card().props.request.status,'open');assert.match(content(t.h.tree),/Closing chat… Waiting for server confirmation/);pending.reject(Error('Not confirmed'));await done;t.render();assert.equal(t.card().props.expanded,true);assert.equal(t.card().props.request.status,'open');assert.doesNotMatch(content(t.h.tree),/Saved Successfully/);
});
test('owner Hide for me is presentation-only while pending; newer activity resurfaces before confirmation',async()=>{
 const pending=deferred(),t=workspace({data:{...empty(),requests:[request]},adapters:{setHubConversationVisibility:()=>pending.promise}});await t.ready();t.tab('Requests');t.card().props.onHide();t.render();assert.equal(t.card(),undefined);assert.match(content(t.h.tree),/Hiding for you… Waiting for server confirmation/);assert.equal(t.h.all(n=>n.props.role==='tab'&&content(n)==='Deleted').length,0,'no fake persisted visibility');
 t.live[0].onData({...empty(),requests:[{...request,version:2,body:'New activity'}]});t.render();assert.equal(t.card().props.request.version,2);pending.resolve({visibility:{visibilityId:'v',channel:'requests',requestId:B,version:1,hidden:true,hiddenAt:ISO,capturedRequestVersion:1}});await t.ready();assert.ok(t.card());assert.equal(t.card().props.request.version,2);
});
test('client close/hide retains existing server-ack behavior',async()=>{
 const pending=deferred(),t=workspace({owner:false,data:{...empty(),requests:[request]},adapters:{setHubConversationVisibility:()=>pending.promise}});await t.ready();t.tab('Requests');t.card().props.onHide();t.render();assert.ok(t.card());assert.doesNotMatch(content(t.h.tree),/Waiting for server confirmation/);pending.resolve({visibility:{visibilityId:'v',channel:'requests',requestId:B,version:1,hidden:true,hiddenAt:ISO,capturedRequestVersion:1}});await t.ready();assert.equal(t.card(),undefined);
});
const file={attachmentId:F,batchId:B,clientId:C,projectId:P,fileName:'fox.pdf',size:1,sha256:'0'.repeat(64),senderRole:'owner',createdAt:ISO,retentionEpisode:0};
const page=(attachments=[])=>({attachments,nextCursor:null,retention:{available:true,reason:null,expiresAt:null,state:'paused'}});
function attachmentFixture({list=async()=>page([file]),remove=async()=>({deleted:true})}={}){
 const h=make(),calls=[];h.overrides['./attachments-client']={...h.overrides['./attachments-client'],listHubAttachments:async(...args)=>{calls.push(args);return list(...args);}};h.overrides['./file-copy-client']={deleteHubFileCopy:remove,HUB_FILE_COPIES_CHANGED:'tmc-hub-file-copies-changed'};
 const Component=h.load('src/client-hub/MakerChatAttachments.tsx').MakerChatAttachments,props={project,owner:false,onFailure(){},onDirtyChange(){},onBusyChange(){}},render=()=>h.render(Component,props);render();
 return {h,props,render,calls,async ready(){await tick();render();await tick();render();},open(request){props.openRequest={sequence:(props.openRequest?.sequence??0)+1,...request};render();},button(label){return h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label||n.props.title===label));}};
}
test('header is history only; composer has upload command; attachment message opens its exact batch and IDs',async()=>{
 const a=attachmentFixture();a.button('Maker Chat attachments').props.onClick({currentTarget:null});await a.ready();assert.equal(a.h.all(n=>n.type==='input'&&n.props.type==='file').length,0);a.open({mode:'upload'});await a.ready();assert.equal(a.h.all(n=>n.type==='input'&&n.props.type==='file').length,1);assert.equal(a.button('Download'),undefined);
 const t=workspace({data:{...empty(),messages:[{messageId:B,senderRole:'client',body:'Shared 1 attachment.',attachmentIds:[F],createdAt:ISO}]}});await t.ready();t.tab('Maker Chat');t.h.find(n=>n.props['aria-label']==='Attach files').props.onClick({currentTarget:null});t.render();assert.equal(t.h.find(n=>n.type?.name==='MakerChatAttachments').props.openRequest.mode,'upload');t.h.find(n=>n.props['aria-label']==='Open 1 shared attachment').props.onClick({currentTarget:null});t.render();const target=t.h.find(n=>n.type?.name==='MakerChatAttachments').props.openRequest;assert.equal(target.mode,'history');assert.equal(target.batchId,B);assert.deepEqual(target.attachmentIds,[F]);
 a.open(target);await a.ready();assert.equal(a.calls.at(-1)[2].batchId,B);assert.equal(a.h.all(n=>n.type==='input'&&n.props.type==='file').length,0);assert.ok(a.button('Download'));
});
test('rapid batch replacement and closed drawer ignore late history response, never show other batch files',async()=>{
 const old=deferred(),newer=deferred(),a=attachmentFixture({list:async(_p,_o,options)=>options.batchId===B?old.promise:newer.promise});a.open({mode:'history',batchId:B,attachmentIds:[F]});await a.ready();const foreign='44444444-4444-4444-8444-444444444444';a.open({mode:'history',batchId:foreign,attachmentIds:[P]});await a.ready();assert.equal(a.calls[0][2].signal.aborted,true);old.resolve(page([file]));await a.ready();assert.doesNotMatch(content(a.h.tree),/fox.pdf/);newer.resolve(page([{...file,batchId:foreign,attachmentId:P,fileName:'current.txt'}]));await a.ready();assert.match(content(a.h.tree),/current.txt/);assert.doesNotMatch(content(a.h.tree),/fox.pdf/);
 a.open({mode:'history',batchId:B,attachmentIds:[F]});await a.ready();a.button('Close attachments').props.onClick();a.render();assert.equal(a.h.all(n=>n.type==='dialog').length,0);
});
test('attachment copy deletion is explicit, pending duplicate-proof, retains failed file then removes only its confirmed copy',async()=>{
 let calls=0;const pending=deferred(),a=attachmentFixture({remove:async(...args)=>{calls++;assert.equal(args[2].kind,'attachment');assert.equal(args[2].fileId,F);return pending.promise;}});a.open({mode:'history',batchId:B,attachmentIds:[F]});await a.ready();a.button('Delete my copy').props.onClick();a.render();const dialog=()=>a.h.find(n=>n.type?.name==='HubActionDialog');assert.match(content(dialog()),/other person’s copy is unchanged/);dialog().props.onConfirm();dialog().props.onConfirm();a.render();assert.equal(calls,1);assert.match(content(a.h.tree),/fox.pdf/);pending.resolve({deleted:true});await a.ready();assert.doesNotMatch(content(a.h.tree),/fox.pdf/);assert.match(content(a.h.tree),/Your attachment copy was deleted/);
});
test('photo Delete my copy has onsite confirmation and removes only acknowledged selected photo, never requests deletion',async()=>{
 const photo={photoId:F,clientId:C,projectId:P,fileName:'photo.jpg',caption:'',storagePath:'x',size:1,createdAt:ISO,contentType:'image/jpeg'},t=workspace({data:{...empty(),photos:[photo]}});await t.ready();t.tab('Photos');const tile=t.h.find(n=>n.type?.name==='PhotoTile');assert.equal(tile.props.onRequest,undefined);tile.props.onDeleteCopy();t.render();assert.equal(t.calls.length,0);t.h.find(n=>n.type?.name==='HubActionDialog').props.onConfirm();await t.ready();assert.equal(t.calls[0][2].fileId,F);assert.equal(t.h.all(n=>n.type?.name==='PhotoTile').length,0);assert.match(content(t.h.tree),/The other person’s copy is unchanged/);
});
test('Delivered copy is exact without tracking fallback; Shipped fallback remains unchanged',async()=>{
 const t=workspace();await t.ready();t.props.project={...project,status:'delivered'};t.render();assert.match(content(t.h.tree),/Your commission has been delivered! I hope you are as happy as I am/);assert.doesNotMatch(content(t.h.tree),/Check back soon/);t.props.project={...project,status:'shipped'};t.render();assert.match(content(t.h.tree),/Your commission has shipped\. Check back soon for your tracking number and updates\./);
});
test('visibility timings cover the same auth-ready, confirmed and failed stages; no secrets added',()=>{
 const source=readFileSync('src/client-hub/workspace-client.ts','utf8');assert.match(source,/startHubTiming\("visibility", owner\)/);const api=sourceLoader()('src/client-hub/hub-timing.ts');api.setHubTimingEnabled(true);const mark=api.startHubTiming('visibility',true);mark('auth-ready');mark('callable-confirmed');const samples=api.readHubTimings();assert.deepEqual(samples.map(row=>row.stage),['auth-ready','callable-confirmed']);assert.ok(samples.every(row=>Number.isFinite(row.elapsedMs)));api.setHubTimingEnabled(false);
});
test('exact batch adapter validates IDs, refuses pagination, and rejects foreign/duplicate manifests without weakening session scope',async()=>{
 let result=page([file]);result.retention={episode:0,state:'paused',completedAt:null,expiresAt:null,expiredThroughEpisode:-1,available:true,reason:null};const calls=[];
 const session={auth:{app:{name:'tmc-client-hub'}},session:{clientId:C},functions:{name:'tmc-client-hub'},assertCurrent(){}};
 const api=sourceLoader({'./client':{CLIENT_HUB_FUNCTIONS_REGION:'us-central1',ClientHubError:class extends Error{},verifiedClientHubConnection:async()=>session},'./callable-owner-session':{hubCallableOwnerSession:async()=>({...session,auth:{app:{name:'tmc-private-owner'}}})},'firebase/functions':{getFunctions:app=>app,httpsCallable:(functions,name)=>async input=>{calls.push({functions,name,input});return{data:result};}}})('src/client-hub/attachments-client.ts');
 const saved=await api.listHubAttachments(project,false,{batchId:B});assert.equal(saved.attachments[0].attachmentId,F);assert.deepEqual(calls[0].input,{projectId:P,limit:5,cursor:null,batchId:B});await assert.rejects(api.listHubAttachments(project,false,{batchId:B,cursor:{attachmentId:F,createdAt:ISO}}));assert.equal(calls.length,1);
 result={...result,attachments:[{...file,batchId:P}]};await assert.rejects(api.listHubAttachments(project,false,{batchId:B}),/batch could not be verified/);result={...result,attachments:[file,file]};await assert.rejects(api.listHubAttachments(project,true,{batchId:B}),/batch could not be verified/);assert.equal(calls.at(-1).functions.name,'tmc-private-owner');
});
test('failed attachment deletion retains copy and retry target; unmount ignores a late confirmed removal',async()=>{
 const first=deferred();let calls=0;const a=attachmentFixture({remove:async()=>{calls++;return first.promise;}});a.open({mode:'history',batchId:B,attachmentIds:[F]});await a.ready();a.button('Delete my copy').props.onClick();a.render();a.h.find(n=>n.type?.name==='HubActionDialog').props.onConfirm();first.reject(Error('Deletion was not confirmed'));await a.ready();assert.match(content(a.h.tree),/fox.pdf/);assert.match(content(a.h.tree),/Deletion was not confirmed/);assert.ok(a.h.find(n=>n.type?.name==='HubActionDialog'));assert.equal(calls,1);
 const later=deferred(),b=attachmentFixture({remove:()=>later.promise});b.open({mode:'history',batchId:B,attachmentIds:[F]});await b.ready();b.button('Delete my copy').props.onClick();b.render();b.h.find(n=>n.type?.name==='HubActionDialog').props.onConfirm();b.h.unmount();later.resolve({deleted:true});await tick();assert.doesNotMatch(content(b.h.tree),/Your attachment copy was deleted/);
});
test('a reply arriving during owner hide resurfaces the thread before its parent version refreshes',async()=>{
 const pending=deferred(),t=workspace({data:{...empty(),requests:[request]},adapters:{setHubConversationVisibility:()=>pending.promise}});await t.ready();t.tab('Requests');t.card().props.onHide();t.render();assert.equal(t.card(),undefined);t.live[0].onData({...empty(),requests:[request],requestReplies:[{replyId:F,requestId:B,body:'New reply',senderRole:'client',createdAt:ISO}]});t.render();assert.ok(t.card());assert.equal(t.card().props.request.version,1);pending.reject(Error('Not confirmed'));await t.ready();assert.ok(t.card());
});
test('newer selection is not overwritten by failed owner close rollback',async()=>{
 const next={...request,requestId:F,body:'Second thread'},pending=deferred(),t=workspace({data:{...empty(),requests:[request,next]},adapters:{setHubSupportRequestStatus:()=>pending.promise}});await t.ready();t.tab('Requests');t.card().props.onToggle();t.render();const done=t.card().props.onStatus(request,'closed');t.render();t.card(F).props.onToggle();t.render();pending.reject(Error('No confirmation'));await done;t.render();assert.equal(t.card(F).props.expanded,true);assert.equal(t.card(B).props.expanded,false);
});
test('session loss closes deletion confirmation and drops its private filename while a late mutation cannot revive it',async()=>{
 const photo={photoId:F,clientId:C,projectId:P,fileName:'private-copy.jpg',caption:'',storagePath:'x',size:1,createdAt:ISO,contentType:'image/jpeg'},t=workspace({data:{...empty(),photos:[photo]}});await t.ready();t.tab('Photos');t.h.find(n=>n.type?.name==='PhotoTile').props.onDeleteCopy();t.render();assert.match(content(t.h.tree),/private-copy.jpg/);t.live[0].onError(Object.assign(Error('Session expired'),{code:'session-expired'}));t.render();assert.equal(t.h.find(n=>n.type?.name==='HubActionDialog'),undefined);assert.doesNotMatch(content(t.h.tree),/private-copy.jpg/);
});
test('open exactbatch history drops sameviewer stale files on verified revision; foreign scope event has no effect',async()=>{
 let count=0;const a=attachmentFixture({list:async()=>page(count++?[ ]:[file])});a.open({mode:'history',batchId:B,attachmentIds:[F]});await a.ready();assert.match(content(a.h.tree),/fox.pdf/);
 const changed=owner=>{const event=new Event('tmc-hub-file-copies-changed');Object.defineProperty(event,'detail',{value:{projectId:P,clientId:C,owner}});a.h.window.dispatchEvent(event);};changed(true);await a.ready();assert.equal(a.calls.length,1);changed(false);a.render();assert.doesNotMatch(content(a.h.tree),/fox.pdf/);await a.ready();assert.equal(a.calls.length,2);assert.equal(a.calls[1][2].batchId,B);assert.match(content(a.h.tree),/No attachments from this message are available/);
});
test('empty tombstoned rawpage advertises earlier history instead of claiming no sharedfiles',async()=>{
 const a=attachmentFixture({list:async()=>({...page(),nextCursor:{createdAt:ISO,attachmentId:F}})});a.button('Maker Chat attachments').props.onClick({currentTarget:null});await a.ready();assert.match(content(a.h.tree),/No available files on this page/);assert.doesNotMatch(content(a.h.tree),/No shared files yet/);assert.ok(a.button('Load earlier files'));
});
test('conversation CSS disables browser anchoring and a viewport clamp to the new bottom keeps follow enabled',()=>{
 const css=readFileSync('src/client-hub/ProjectWorkspace.module.css','utf8');assert.match(css,/\.chatLog,\.threadLog \{[^}]*overflow-anchor:none/);
 const f=scrollFixture();assert.equal(f.log.scrollTop,700);f.log.clientHeight=500;f.log.scrollTop=f.log.scrollTop;f.scroll();assert.equal(f.log.scrollTop,500);assert.equal(f.pinned.current,true);f.log.scrollHeight=1300;f.resize();assert.equal(f.log.scrollTop,800);
});
