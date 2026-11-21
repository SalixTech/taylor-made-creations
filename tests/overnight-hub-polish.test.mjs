import { chatDraftStorageFixture } from './helpers/chat-draft-storage.mjs';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness as sourceHarness, content, nodes } from './owner-ui-harness.mjs';
const fixtures = new Set(), harness = () => { const h = sourceHarness(); fixtures.add(h); return h; };
afterEach(() => { for (const h of fixtures) h.unmount(); fixtures.clear(); });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes;reject=no; });return {promise,resolve,reject}; };
const CLIENT='TMC-0123456789ABCDEF', PROJECT='11111111-1111-4111-8111-111111111111', ISO='2026-10-26T12:00:00.000Z';
const project={ clientId:CLIENT, projectId:PROJECT,title:'Cloud fox',summary:'Made just for you.',status:'in-progress',progress:35,progressSource:'manual',trackingUrl:null,trelloUrl:null,requestId:null,version:1,createdAt:ISO,updatedAt:ISO };
const client={clientId:CLIENT,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO};
const photo={clientId:CLIENT,projectId:PROJECT,photoId:'22222222-2222-4222-8222-222222222222',storagePath:`hub-progress/${CLIENT}/${PROJECT}/photo`,fileName:'ear.png',caption:'Ear fitting',contentType:'image/png',size:100,createdAt:ISO};
const empty=()=>({messages:[],photos:[],requests:[],requestReplies:[],notifications:[],privateWorkspace:null});
function workspace(options={}) {
 const h=harness(),calls=[],live=[],timers=[],cleared=[];
 h.window.setTimeout=(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;};h.window.clearTimeout=timer=>{timer.cancelled=true;};
 h.overrides['./workspace-client']={...chatDraftStorageFixture(h),async getHubCommissionFolders(){return {version:0,folderNames:[]};},
  clearHubPhotoCache(){cleared.push('clear');},
  subscribeProjectWorkspace(p,o,onData,onError){live.push({onData,onError});return ()=>{};},
  async loadProjectWorkspace(){return options.data??empty();},
  async markHubConversationRead(){return {notification:null};},
  async sendHubMessage(...args){calls.push(args);return options.send?options.send(...args):{message:{messageId:args[3],projectId:PROJECT,clientId:CLIENT,senderRole:'client',body:args[2],createdAt:ISO}};},
 };
 const C=h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace,props={project,owner:false};
 const render=()=>h.render(C,props),button=name=>h.find(n=>n.type==='button'&&(content(n)===name||n.props['aria-label']===name));
 render(); return {h,calls,live,timers,cleared,props,render,button,async ready(){await flush();render();},tab(label){h.find(n=>n.props.role==='tab'&&content(n)===label).props.onClick();render();}};
}
function composeEvent(field, overrides={}) {
 let submits=0,prevented=0;
 const submit={disabled:false};
 const event={key:'Enter',nativeEvent:{isComposing:false,keyCode:13},repeat:false,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,preventDefault(){prevented++;},currentTarget:{disabled:false,readOnly:false,form:{querySelector(){return submit;},requestSubmit(){submits++;field?.();}}},...overrides};
 return {event,submit,submits:()=>submits,prevented:()=>prevented};
}
test('Enter sends only a valid local composer; Shift/IME/keyCode 229/modifiers preserve text and repeat cannot submit',()=>{
 const h=harness(),{submitComposerOnEnter,guardFormEnter}=h.load('src/client-hub/ProjectWorkspace.tsx');
 for(const changes of [{shiftKey:true},{altKey:true},{ctrlKey:true},{metaKey:true},{nativeEvent:{isComposing:true}},{nativeEvent:{keyCode:229}},{keyCode:229},{key:'v'}]) {const t=composeEvent(null,changes);submitComposerOnEnter(t.event);assert.equal(t.submits(),0);assert.equal(t.prevented(),0);}
 const normal=composeEvent();submitComposerOnEnter(normal.event);assert.equal(normal.submits(),1);assert.equal(normal.prevented(),1);
 const repeat=composeEvent(null,{repeat:true});submitComposerOnEnter(repeat.event);assert.equal(repeat.submits(),0);assert.equal(repeat.prevented(),1);
 const blocked=composeEvent();blocked.submit.disabled=true;submitComposerOnEnter(blocked.event);assert.equal(blocked.submits(),0);
 const missing=composeEvent();missing.event.currentTarget.form=null;submitComposerOnEnter(missing.event);assert.equal(missing.submits(),0);
 const input=composeEvent(null,{target:{tagName:'INPUT'},nativeEvent:{keyCode:229}});guardFormEnter(input.event);assert.equal(input.prevented(),1);
 const textarea=composeEvent(null,{target:{tagName:'TEXTAREA'},nativeEvent:{isComposing:true}});guardFormEnter(textarea.event);assert.equal(textarea.prevented(),0,'IME candidate confirmation is not cancelled in a multiline composer');h.unmount();
});
test('quick repeated Enter submits are idempotent and pasted multiline draft survives a pending send',async()=>{
 const pending=deferred(),t=workspace({send:()=>pending.promise});await t.ready();t.tab('Maker Chat');
 t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.onChange({target:{value:'Pasted line one\nPasted line two'}});t.render();
 const field=t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')),form=t.h.find(n=>n.type==='form'&&n.props.className==='composer');
 const key=composeEvent(()=>form.props.onSubmit({preventDefault(){}}));field.props.onKeyDown(key.event);field.props.onKeyDown(key.event);t.render();assert.equal(t.calls.length,1);assert.equal(t.calls[0][2],'Pasted line one\nPasted line two');assert.equal(t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.value,'Pasted line one\nPasted line two');
 pending.resolve({message:{messageId:t.calls[0][3],projectId:PROJECT,clientId:CLIENT,senderRole:'client',body:t.calls[0][2],createdAt:ISO}});await t.ready();assert.equal(t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.value,'');t.h.unmount();assert.equal(t.cleared.length,1);
});
test('support replies use Enter locally and remain single-flight even before the parent busy render',async()=>{
 const h=harness(),pending=deferred(),calls=[];const C=h.load('src/client-hub/ProjectWorkspace.tsx').RequestCard;
 const props={request:{requestId:photo.photoId,clientId:CLIENT,projectId:PROJECT,type:'support',body:'A question',status:'open',version:1,createdAt:ISO,updatedAt:ISO},owner:false,busy:false,onDraftChange(){},async onReply(...args){calls.push(args);return pending.promise;},async onStatus(){throw Error('Enter must not close/cancel a request');}};const render=()=>h.render(C,props);render();h.find(n=>n.type==='textarea').props.onChange({target:{value:'Keep this reply'}});render();
 const submit=h.find(n=>n.type==='form').props.onSubmit,key=composeEvent(()=>submit({preventDefault(){}}));h.find(n=>n.type==='textarea').props.onKeyDown(key.event);h.find(n=>n.type==='textarea').props.onKeyDown(key.event);assert.equal(calls.length,1);pending.resolve(true);await flush();render();assert.equal(h.find(n=>n.type==='textarea').props.value,'');h.unmount();
});
test('message success uses its receipt without a duplicate notice; actionable uncertain failures persist alongside retry and validation remains',async()=>{
 let fail=false;const t=workspace({send:async(...args)=>{if(fail)throw Error('Connection interrupted');return {message:{messageId:args[3],projectId:PROJECT,clientId:CLIENT,senderRole:'client',body:args[2],createdAt:ISO}};}});await t.ready();
 const send=async body=>{t.h.find(n=>n.type==='textarea'&&n.props.id?.endsWith('-message')).props.onChange({target:{value:body}});t.render();t.h.find(n=>n.type==='form'&&n.props.className==='composer').props.onSubmit({preventDefault(){}});await t.ready();};
 await send('saved'); await send('saved again'); assert.equal(t.timers.some(x=>x.delay===5000),false); assert.equal(t.h.find(n=>n.props['data-transient']==='notice'),undefined); assert.match(content(t.h.tree),/Sent ·/);
 fail=true;await send('uncertain');assert.equal(t.timers.some(x=>x.delay===8000),false);assert.equal(t.h.find(n=>n.props.role==='alert').props['data-transient'],undefined);assert.ok(t.button('Dismiss workspace error'));assert.match(content(t.h.tree),/Connection interrupted/);assert.match(content(t.h.tree),/Retry message/);t.h.unmount();
 const validation=workspace();validation.props.owner=true;validation.render();await validation.ready();validation.h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[new File(['bad'],'bad.gif',{type:'image/gif'})]}});validation.render();validation.h.find(n=>n.type==='form'&&n.props.className==='uploadForm').props.onSubmit({preventDefault(){}});validation.render();assert.match(content(validation.h.tree),/Choose up to 50 JPG/);assert.equal(validation.h.find(n=>n.props.role==='alert').props['data-transient'],undefined);assert.equal(validation.timers.some(x=>x.delay===8000),false);validation.h.unmount();
});
test('chat uses stable viewport height independent of page position, keeping manual reading position',async()=>{
 const t=workspace();await t.ready();const element=t.h.find(n=>n.type==='section'&&n.props['data-active-tab']).props.ref.current,properties={};element.style={setProperty:(k,v)=>properties[k]=v};element.getBoundingClientRect=()=>({top:280});t.h.window.innerHeight=900;t.tab('Maker Chat');assert.equal(properties['--chat-available-height'],'612px');
 t.h.window.innerHeight=540;t.h.window.dispatchEvent(new Event('resize'));assert.equal(properties['--chat-available-height'],'367px');
 const log=t.h.find(n=>n.props['aria-label']==='Maker Chat messages');log.props.ref.current.scrollHeight=5000;log.props.ref.current.clientHeight=300;log.props.ref.current.scrollIntoView=()=>{throw Error('Never scroll an ancestor');};log.props.onScroll({currentTarget:{scrollHeight:5000,scrollTop:120,clientHeight:300}});log.props.ref.current.scrollTop=120;
 t.live[0].onData({...empty(),messages:[{messageId:'one',clientId:CLIENT,projectId:PROJECT,senderRole:'owner',body:'A'.repeat(4000),createdAt:ISO}]});t.render();assert.equal(log.props.ref.current.scrollTop,120);
 log.props.onScroll({currentTarget:{scrollHeight:5000,scrollTop:4700,clientHeight:300}});t.live[0].onData({...empty(),messages:[1,2].map(i=>({messageId:String(i),clientId:CLIENT,projectId:PROJECT,senderRole:'owner',body:'Hello',createdAt:ISO}))});t.render();assert.equal(log.props.ref.current.scrollTop,5000);t.h.unmount();
});
test('native stretched photo opener cannot swallow download or deletion actions; download revalidates scope',async()=>{
 const h=harness(),opens=[],requests=[],downloads=[],checks=[];h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){downloads.push(this.download);}});h.window.setTimeout=()=>1;
 h.overrides['./workspace-client']={async getHubCommissionFolders(){return {version:0,folderNames:[]};},async loadHubPhotoBlob(){return new Blob(['private']);}};h.overrides['./file-copy-client']={async verifyHubFileCopies(...args){checks.push(args);}};
 const C=h.load('src/client-hub/ProjectWorkspace.tsx').PhotoTile,props={photo,project,owner:false,onFailure(){},onDeleteCopy:()=>requests.push(1),onOpen:el=>opens.push(el)},render=()=>h.render(C,props);render();await flush();render();const card=h.find(n=>n.type==='article');assert.equal(card.props.role,undefined);assert.equal(card.props.onClick,undefined);const opener=h.find(n=>n.props['aria-label']==='Enlarge Ear fitting');assert.equal(opener.type,'button');assert.equal(nodes(opener).filter(n=>n.type==='button').length,1);const trigger={focus(){}};opener.props.onClick({currentTarget:trigger});assert.deepEqual(opens,[trigger]);h.find(n=>n.type==='button'&&content(n)==='Delete my copy').props.onClick();assert.equal(requests.length,1);assert.equal(opens.length,1);h.find(n=>n.type==='button'&&n.props['aria-label']===`Download ${photo.fileName}`).props.onClick();await flush();assert.equal(checks[0][0],project);assert.deepEqual(downloads,['ear.png']);h.unmount();
});
test('revoked single-photo download cannot click a URL after final verification rejects',async()=>{
 const h=harness(),failures=[],downloads=[];h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){downloads.push(1);}});h.overrides['./workspace-client']={async getHubCommissionFolders(){return {version:0,folderNames:[]};},async loadHubPhotoBlob(){return new Blob(['private']);}};h.overrides['./file-copy-client']={async verifyHubFileCopies(){throw Object.assign(Error('Session expired'),{code:'session-expired'});}};
 const C=h.load('src/client-hub/ProjectWorkspace.tsx').PhotoTile;h.render(C,{photo,project,owner:false,onFailure:e=>failures.push(e),onDeleteCopy(){},onOpen(){}});await flush();h.find(n=>n.type==='button'&&n.props['aria-label']===`Download ${photo.fileName}`).props.onClick();await flush();assert.equal(downloads.length,0);assert.equal(failures.length,1);h.unmount();
});
test('help paw opens active Requests without discarding a draft; commission selector keeps pending guard and removes redundant tags',async()=>{
 const h=harness();h.overrides['./HubNotificationBell']={HubNotificationBell:()=>null};const C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client,projects:[project,{...project,projectId:photo.photoId,title:'Second commission'}],onRefresh(){},onSignOut(){}},render=()=>h.render(C,props);render();
 const work=()=>h.find(n=>n.type?.name==='HubWorkspaceWindow'),help=()=>h.find(n=>n.type==='button'&&content(n)==='Need a helping paw?');work().props.onDirtyChange(true);render();h.window.confirm=()=>{throw Error('Same workspace help must retain drafts');};help().props.onClick();render();assert.equal(work().props.navigation.tab,'support');assert.equal(work().props.project.projectId,PROJECT);assert.equal(h.find(n=>n.props.className==='projectStatus'),undefined);assert.equal(h.find(n=>n.props.className==='projectTotal'),undefined);
 work().props.onBusyChange(true);render();assert.equal(help().props.disabled,true);const selector=h.find(n=>n.type?.name==='ClientCommissionCards');assert.equal(selector.props.disabled,true);h.unmount();
});
test('profile settings can explicitly close during active save without allowing commission switch or duplicate save',async()=>{
 const h=harness(),pending=deferred(),leaves=[];h.overrides['./HubNotificationBell']={HubNotificationBell:()=>null};h.overrides['./client']={clientHubErrorMessage:e=>e.message,async updateHubNickname(...args){await pending.promise;return {client:{...args[0],nickname:args[1]}};}};
 const C=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard,props={client,projects:[project,{...project,projectId:photo.photoId,title:'Second commission'}],onRefresh(){leaves.push('refresh');},onSignOut(){leaves.push('out');}},render=()=>h.render(C,props);render();h.find(n=>n.type==='button'&&content(n)==='Edit Profile').props.onClick();render();h.find(n=>n.type==='input'&&n.props.maxLength===60).props.onChange({target:{value:'New name'}});render();h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();for(const name of ['Edit Profile','Sign out'])assert.equal(h.find(n=>n.type==='button'&&content(n)===name).props.disabled,true);h.find(n=>n.type==='button'&&content(n)==='Sign out').props.onClick();assert.deepEqual(leaves,[]);assert.equal(h.find(n=>n.type?.name==='ClientCommissionCards').props.disabled,true);h.find(n=>n.type==='button'&&content(n)==='Close settings').props.onClick();render();assert.equal(h.find(n=>n.type==='section'&&n.props['aria-label']==='Your display settings'),undefined);assert.match(content(h.tree),/still saving in the background/);pending.resolve();await flush();render();assert.match(content(h.tree),/Welcome back, New name/);h.unmount();
});
test('live photo reorder keeps ID selection and a switch never flashes the old photo under a new caption',async()=>{
 const h=harness(),pending=deferred(),reads=[],moves=[],revoked=[];h.globals.URL={createObjectURL:()=>`blob:${reads.length}`,revokeObjectURL:x=>revoked.push(x)};h.overrides['./workspace-client']={async getHubCommissionFolders(){return {version:0,folderNames:[]};},async loadHubPhotoBlob(p){reads.push(p.photoId);return reads.length===1?new Blob(['a']):pending.promise;}};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,second={...photo,photoId:'33333333-3333-4333-8333-333333333333',caption:'Tail',storagePath:photo.storagePath+'tail'},props={photos:[photo,second],activeId:photo.photoId,owner:false,onChange:id=>moves.push(id),onClose(){},onFailure(){},trigger:{current:{focus(){}}}},render=()=>h.render(C,props);render();await flush();render();assert.equal(h.find(n=>n.type==='img').props.alt,'Ear fitting');props.photos=[second,{...photo}];render();await flush();assert.equal(reads.length,1);props.activeId=second.photoId;render();assert.equal(h.find(n=>n.type==='img'),undefined,'previous image must disappear in the same render');pending.resolve(new Blob(['b']));await flush();render();assert.equal(h.find(n=>n.type==='img').props.alt,'Tail');assert.equal(revoked.length,1);h.unmount();
});
test('source contract preserves keyboard isolation, explicit own-copy deletion, dark blending and reduced-motion timing',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),work=read('src/client-hub/ProjectWorkspace.tsx'),css=read('src/client-hub/ProjectWorkspace.module.css'),hub=read('src/client-hub/ClientHub.module.css');
 assert.doesNotMatch(work,/deleteObject|deleteDoc|getDownloadURL/);assert.doesNotMatch(work,/scrollIntoView/);assert.match(work,/function selectTab\(next: Tab\).*setTabFocusIntent/);assert.match(work,/deleteHubFileCopy/);assert.match(work,/The other person’s copy is unchanged/);assert.doesNotMatch(work,/Request Deletion/);assert.match(css,/\.photoOpen \{ position:absolute; inset:0/);assert.match(css,/\.chatPanel \.chatLog \{ flex:1 1 0; min-height:32px; max-height:none/);assert.match(css,/\.workspace \.composer \{ flex:0 0 auto/);assert.doesNotMatch(css,/animation:studio-stripes/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/notice\[data-transient\],\.error\[data-transient\] \{ animation:none/);assert.match(hub,/\.hub\[data-gate=login\] \{ display:flex; align-items:center; justify-content:center/);assert.match(hub,/::file-selector-button/);assert.match(hub,/\.hub \.loginForm.*background-color:transparent!important/s);
});
test('chat tab counts actual unread messages and bell dismissal never fabricates read receipts',async()=>{
 const rows=[{notificationId:'a',clientId:CLIENT,projectId:PROJECT,recipientRole:'client',channel:'chat',version:9,readVersion:3,acknowledgedVersion:9,dismissedVersion:9},{notificationId:'b',clientId:CLIENT,projectId:PROJECT,recipientRole:'owner',channel:'chat',version:20,readVersion:0}];
 const t=workspace({data:{...empty(),notifications:rows}});await t.ready();const tab=t.h.find(n=>n.props.role==='tab'&&content(n).startsWith('Maker Chat'));assert.match(content(tab),/Maker Chat6/);assert.equal(nodes(tab).find(n=>n.type==='small').props['aria-label'],'6 unread messages');t.h.unmount();
});
