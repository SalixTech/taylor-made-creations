import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness as sourceHarness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
import { readFileSync } from 'node:fs';
const fixtures = new Set(), harness = () => { const h = sourceHarness(); fixtures.add(h); return h; };
afterEach(() => { for (const h of fixtures) h.unmount(); fixtures.clear(); });
const ID='TMC-0123456789ABCDEF', OTHER='TMC-ABCDEF0123456789', PID='11111111-1111-4111-8111-111111111111', SECOND='22222222-2222-4222-8222-222222222222', ISO='2026-10-20T20:00:00.000Z';
const uuid=n=>`${String(n).padStart(8,'0')}-3333-4333-8333-333333333333`;
const project={clientId:ID,projectId:PID,title:'Cloud fox',summary:'',status:'in-progress',progress:35,progressSource:'manual',trackingUrl:null,requestId:null,version:1,createdAt:ISO,updatedAt:ISO};
const empty=()=>({messages:[],photos:[],requests:[],requestReplies:[],notifications:[],privateWorkspace:null});
const request=(n,status='open')=>({requestId:uuid(n),clientId:ID,projectId:PID,type:'support',senderRole:'client',body:`Help ${n}`,photoId:null,status,response:'',createdAt:ISO,updatedAt:ISO,version:1});
const message=n=>({messageId:uuid(n),clientId:ID,projectId:PID,senderRole:'owner',body:`Message ${n}`,createdAt:ISO});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function setup(options={}) {
 const h=harness(), calls=[],live=[];h.document.visibilityState='visible';
 h.overrides['./workspace-client']={
  getHubCommissionFolders:async()=>({version:0,folderNames:[]}),
  loadProjectWorkspace:async()=>options.data??empty(),
  subscribeProjectWorkspace(_p,_o,onData,onError){live.push({onData,onError});return()=>calls.push({type:'unsubscribe'});},
  markHubConversationRead:async(...args)=>{calls.push({type:'read',args});return{notification:null};},
  loadHubSupportRequest:async(...args)=>{calls.push({type:'request',args});return options.lookup?options.lookup(...args):request(1,'resolved');},
  loadHubSupportRequestPage:async(...args)=>{calls.push({type:'history',args});return options.history?options.history(...args):{items:[request(500,'resolved')],next:null};},
  loadHubSupportReplyPage:async(...args)=>{calls.push({type:'replies',args});return {items:[],next:null};},
  setHubSupportRequestStatus:async(r,_o,status)=>({request:{...r,status,version:r.version+1}}),
  replyHubSupportRequest:async(r,_o,body,id)=>({request:{...r,version:r.version+1},reply:{requestId:r.requestId,replyId:id,clientId:ID,projectId:PID,senderRole:'client',body,createdAt:ISO}}),
  clearHubPhotoCache(){},
 };
 const Component=h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace, props={project,owner:!!options.owner,...options.props};
 const render=()=>h.render(Component,props), button=label=>h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label)), cards=()=>h.all(n=>n.type?.name==='RequestCard');
 const tab=name=>{h.find(n=>n.props.role==='tab'&&content(n).startsWith(name)).props.onClick();render();};
 render();return{h,props,calls,live,render,button,cards,tab,async ready(){await flush();render();}};
}
test('manual information tags are bounded, unique, mutually exclusive and backward-compatible',()=>{
 const model=sourceLoader()('src/client-hub/model.ts');assert.deepEqual(model.validateClientHubInformationTags(undefined),[]);
 assert.equal(model.decodeClientHubProject(project).informationTags,undefined);
 assert.deepEqual(model.decodeClientHubProject({...project,informationTags:['dtd-needed','paid-100']}).informationTags,['paid-100','dtd-needed']);
 for(const tags of [null,'paid-100',['paid-100','paid-partial'],['paid-100','paid-100'],['paid-100','dtd-needed','paid-partial'],['paypal-verified'],[{}]]) assert.throws(()=>model.decodeClientHubProject({...project,informationTags:tags}));
});
test('reload navigation is account/epoch scoped; fresh/copied-tab navigation and malformed state fall back',()=>{
 const nav=sourceLoader()('src/client-hub/session-navigation.ts'), values=new Map(), storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}, projects=[project,{...project,projectId:SECOND}];
 nav.saveHubNavigation(ID,1,{projectId:SECOND,tab:'photos'},storage);
 assert.deepEqual(nav.restoreHubNavigation(ID,1,projects,storage,'reload'),{projectId:SECOND,tab:'photos'});
 assert.equal(nav.restoreHubNavigation(ID,2,projects,storage,'reload'),null);assert.equal(nav.restoreHubNavigation(OTHER,1,projects,storage,'reload'),null);
 assert.equal(nav.restoreHubNavigation(ID,1,[project],storage,'reload'),null);
 assert.equal(nav.restoreHubNavigation(ID,1,projects,storage,'navigate'),null);assert.equal(values.size,0);
 nav.saveHubNavigation(ID,1,{projectId:PID,tab:'chat'},storage);nav.clearHubNavigation(ID,1,storage);assert.equal(values.size,0);
 for(const bad of [{projectId:PID,tab:'studio'},{projectId:PID,tab:'photos',code:'secret'},{projectId:'../secret',tab:'chat'}]){values.set(`tmc-hub-navigation-v1:${ID}:1`,JSON.stringify(bad));assert.equal(nav.restoreHubNavigation(ID,1,projects,storage,'reload'),null);}
 assert.doesNotMatch(readFileSync('src/client-hub/session-navigation.ts','utf8'),/localStorage|history\.(?:push|replace)State|location\.(?:hash|search)/);
});
test('dashboard restores a reload, persists repeated project/tab choices and clears on route departure',()=>{
 const h=harness(), values=new Map([['tmc-hub-navigation-v1:'+ID+':1',JSON.stringify({projectId:SECOND,tab:'photos'})]]);
 h.window.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};h.window.performance={getEntriesByType:()=>[{type:'reload'}]};
 const Dashboard=h.load('src/client-hub/ClientDashboard.tsx').ClientDashboard, props={client:{clientId:ID,displayName:'Sky',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO},projects:[project,{...project,projectId:SECOND}],onRefresh(){},onSignOut(){}};
 const render=()=>h.render(Dashboard,props), workspace=()=>h.find(n=>n.type?.name==='HubWorkspaceWindow');render();render();assert.equal(workspace().props.project.projectId,SECOND);assert.equal(workspace().props.navigation.tab,'photos');
 workspace().props.onTabChange('chat');assert.equal(JSON.parse([...values.values()][0]).tab,'chat');
 h.find(n=>n.type?.name==='ClientCommissionCards').props.onSelect(PID);render();assert.equal(workspace().props.project.projectId,PID);assert.equal(workspace().props.navigation.tab,'overview');
 workspace().props.onTabChange('photos');render();assert.equal(JSON.parse([...values.values()][0]).projectId,PID);h.unmount();assert.equal(values.size,0);
});
test('only resolved cases enter archive; both roles explicitly reopen into current list',async()=>{
 for(const owner of [false,true]){const t=setup({owner,data:{...empty(),requests:[request(1,'resolved'),request(2,'closed'),request(3,'cancelled'),request(4)]}});try{await t.ready();t.tab('Requests');assert.deepEqual(t.cards().map(n=>n.props.request.status),['open','cancelled','closed']);t.button('Archive (1)').props.onClick();t.render();const archived=t.cards().find(n=>n.props.request.status==='resolved');assert.ok(archived);await archived.props.onStatus(archived.props.request,'open');t.render();assert.equal(t.h.find(n=>n.type?.name==='SupportArchiveDialog'),undefined);assert.equal(t.cards().find(n=>n.props.request.requestId===uuid(1)).props.request.status,'open');}finally{t.h.unmount();}}
});
test('closed archive and background current cards do not mark hidden threads read',async()=>{
 const resolved=request(1,'resolved'), row={notificationId:'notice',recipientRole:'client',channel:'requests',requestId:resolved.requestId,latestItemId:resolved.requestId,version:1};
 const t=setup({data:{...empty(),requests:[resolved,request(2)],notifications:[row]}});try{await t.ready();t.tab('Requests');t.button('Archive (1)').props.onClick();t.render();t.cards().find(n=>n.props.request.status==='resolved').props.onToggle();await t.ready();assert.equal(t.calls.filter(c=>c.type==='read').length,1);t.h.find(n=>n.type?.name==='SupportArchiveDialog').props.onClose();t.render();t.live[0].onData({...empty(),requests:[resolved,request(2)],notifications:[{...row,version:2}]});await t.ready();assert.equal(t.calls.filter(c=>c.type==='read').length,1);}finally{t.h.unmount();}
});
test('notification navigation loads an older archived request; superseded response cannot reopen it',async()=>{
 const gate=deferred(),t=setup({lookup:()=>gate.promise,props:{navigation:{tab:'support',version:1,requestId:uuid(1)}}});try{await t.ready();t.tab('Photos');gate.resolve(request(1,'resolved'));await t.ready();assert.equal(t.h.find(n=>n.type?.name==='SupportArchiveDialog'),undefined);assert.equal(t.calls.filter(c=>c.type==='read').length,0);}finally{t.h.unmount();}
 const next=setup({props:{navigation:{tab:'support',version:1,requestId:uuid(1)}}});try{await next.ready();await next.ready();assert.ok(next.h.find(n=>n.type?.name==='SupportArchiveDialog'));assert.equal(next.cards().find(n=>n.props.request.requestId===uuid(1)).props.expanded,true);}finally{next.h.unmount();}
});
test('remote resolution/archive close/reopen retains reply text and uncertain retry operation',async()=>{
 const current=request(1),t=setup({data:{...empty(),requests:[current]}});try{await t.ready();t.tab('Requests');let card=t.cards()[0];const attempt={operationId:uuid(99),body:'Original uncertain reply',state:'failed'};card.props.onDraftStateChange(current.requestId,{body:'Original uncertain reply',attempt});t.render();t.live[0].onData({...empty(),requests:[{...current,status:'resolved',version:2}]});t.render();assert.equal(t.cards().length,0);t.live[0].onData(empty());t.render();assert.equal(t.cards().length,0,'a resolved version cannot become open again after leaving the live200');t.button('Archive (1)').props.onClick();t.render();assert.deepEqual(t.cards()[0].props.draftState,{body:attempt.body,attempt});t.h.find(n=>n.type?.name==='SupportArchiveDialog').props.onClose();t.render();t.button('Archive (1)').props.onClick();t.render();card=t.cards()[0];await card.props.onStatus(card.props.request,'open');t.render();assert.deepEqual(t.cards()[0].props.draftState.attempt,attempt);}finally{t.h.unmount();}
});
test('paged archive goes beyond the live200 without duplicates; close/revocation discard late history',async()=>{
 const initial=Array.from({length:200},(_,i)=>request(i+1,'resolved')),t=setup({data:{...empty(),requests:initial}});try{await t.ready();t.tab('Requests');t.button('Archive (200)').props.onClick();t.render();await t.button('Load earlier requests').props.onClick();await t.ready();assert.equal(t.cards().length,201);assert.equal(t.calls.find(c=>c.type==='history').args[2].id,uuid(1));}finally{t.h.unmount();}
 for(const revoke of [false,true]){const gate=deferred(),late=setup({data:{...empty(),requests:initial},history:()=>gate.promise});try{await late.ready();late.tab('Requests');late.button('Archive (200)').props.onClick();late.render();late.button('Load earlier requests').props.onClick();await flush();if(revoke)late.live[0].onError(Object.assign(Error('Revoked'),{code:'session-expired'}));else late.h.find(n=>n.type?.name==='SupportArchiveDialog').props.onClose();late.render();gate.resolve({items:[request(500,'resolved')],next:null});await late.ready();assert.equal(late.h.find(n=>n.type?.name==='SupportArchiveDialog'),undefined);assert.equal(late.cards().some(n=>n.props.request.requestId===uuid(500)),false);if(revoke)assert.equal(late.cards().length,0);}finally{late.h.unmount();}}
});
test('chat measurement is stable while page scrolls; unpinned log is not yanked by arrivals',async()=>{
 const t=setup({owner:true,data:{...empty(),messages:[message(1)]}});try{await t.ready();const root=[...t.h.refs.values()].find(n=>n.__node.props['data-active-tab']);const sizes=[];root.style={setProperty:(name,value)=>sizes.push({name,value})};root.getBoundingClientRect=()=>{throw Error('Position must not be measured');};t.h.window.innerHeight=1000;t.tab('Maker Chat');assert.equal(sizes.at(-1).value,'640px');for(let i=0;i<5;i++)t.h.window.dispatchEvent(new Event('scroll'));assert.equal(sizes.length,1);t.h.window.innerHeight=800;t.h.window.dispatchEvent(new Event('resize'));assert.equal(sizes.at(-1).value,'544px');const log=[...t.h.refs.values()].find(n=>n.__node.props['aria-label']==='Maker Chat messages');Object.assign(log,{scrollTop:40,scrollHeight:1000,clientHeight:300});log.__node.props.onScroll({currentTarget:log});t.live[0].onData({...empty(),messages:[message(1),message(2)]});t.render();assert.equal(log.scrollTop,40);Object.assign(log,{scrollTop:700});log.__node.props.onScroll({currentTarget:log});t.live[0].onData({...empty(),messages:[message(1),message(2),message(3)]});t.render();assert.equal(log.scrollTop,1000);}finally{t.h.unmount();}
});
test('resolved cards require explicit reopen; Enter during IME/repeat never submits',()=>{
 const h=harness(),workspaceExports=h.load('src/client-hub/ProjectWorkspace.tsx');h.render(workspaceExports.RequestCard,{request:request(1,'resolved'),owner:false,busy:false,onDraftChange(){},onStatus(){},onReply(){}});assert.equal(h.find(n=>n.type==='textarea'),undefined);assert.ok(h.find(n=>n.type==='button'&&content(n)==='Reopen chat'));let submits=0;for(const variant of [{nativeEvent:{isComposing:true}},{nativeEvent:{keyCode:229}},{repeat:true},{shiftKey:true}])workspaceExports.submitComposerOnEnter({key:'Enter',preventDefault(){},currentTarget:{form:{querySelector:()=>({disabled:false}),requestSubmit:()=>submits++}},...variant});assert.equal(submits,0);h.unmount();
});
