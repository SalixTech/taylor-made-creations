import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const C='TMC-0011223344556677',P='11111111-1111-4111-8111-111111111111',Q='22222222-2222-4222-8222-222222222222';
const active=new Set();afterEach(()=>{for(const h of active)h.unmount();active.clear();});
function fixture(options={}){
 const h=harness();active.add(h);h.document.visibilityState='visible';
 const model=h.load('src/client-hub/label-presentation.ts');let server={...model.emptyLabelPresentation(),revision:3},valid=true,state;const calls=[],reads=[],watchers=[];
 const transport={watchLabelPresentationSession:async(owner,project,invalidate)=>{const record={owner,project,invalidate,closed:false};watchers.push(record);return {assertCurrent(){if(!valid)throw Object.assign(Error('session expired'),{code:'session-expired'});},close(){record.closed=true;}};},getOwnerLabelPresentation:async()=>{reads.push('owner');return options.read?options.read('owner'):structuredClone(server);},getClientLabelPresentation:async project=>{reads.push(project.projectId);return options.read?options.read(project.projectId):structuredClone(server);},saveOwnerLabelPresentation:async input=>{calls.push(structuredClone(input));return options.save?options.save(input):{...structuredClone(input),schemaVersion:1,revision:input.expectedRevision+1,updatedAt:null};}};
 h.overrides['./label-presentation-client']=transport;
 const api=h.load('src/client-hub/LabelPresentationContext.tsx'),InformationTags=h.load('src/client-hub/InformationTags.tsx').InformationTags;
 const props={owner:options.owner??true,project:{clientId:C,projectId:P,informationTags:['paid-100']}};
 function Component(props){state=api.useLabelPresentationController(props.owner,props.project);h.currentContext=state.presentation;return {type:'div',props:{children:[InformationTags({tags:props.project.informationTags}),api.PresentedStatus({status:'in-progress'})]}};}
 const render=()=>h.render(Component,props);render();
 return {h,props,render,calls,reads,watchers,model,get state(){return state;},set server(value){server=value;},get server(){return server;},invalidate(){valid=false;watchers.at(-1).invalidate();render();},async settle(){await tick();render();await tick();render();},async poll(){h.window.dispatchEvent(new Event('focus'));await tick();render();}};
}
test('controller poll advances live presentation but save uses captured editor revision, not rebased latest',async()=>{
 const t=fixture();await t.settle();const baseline=structuredClone(t.state.presentation),draft={entries:structuredClone(baseline.entries),order:[...baseline.order]};draft.entries['paid-100'].name='Paid in full';
 t.server={...structuredClone(t.server),revision:8};t.server.entries.status.name='Newest status display';await t.poll();assert.equal(t.state.presentation.revision,8);
 await t.state.save(draft,baseline.revision);t.render();assert.equal(t.calls.length,1);assert.equal(t.calls[0].expectedRevision,3);assert.equal(t.calls[0].entries['paid-100'].name,'Paid in full');assert.equal(t.calls[0].entries.status.name,'Commission status');
});
test('confirmed save updates actual rendered card labels without mutating assignments or canonical status',async()=>{
 const t=fixture();await t.settle();const assignments=structuredClone(t.props.project.informationTags),baseline=t.state.presentation;
 assert.match(content(t.h.tree),/100% paid/);assert.match(content(t.h.tree),/In Progress/);
 const draft={entries:structuredClone(baseline.entries),order:[...baseline.order]};draft.entries['paid-100']={...draft.entries['paid-100'],name:'All settled',color:'#1266CC'};draft.entries.status={...draft.entries.status,name:'In the workshop'};
 assert.equal(await t.state.save(draft,baseline.revision),true);t.render();assert.match(content(t.h.tree),/All settled/);assert.match(content(t.h.tree),/In the workshop/);assert.deepEqual(t.props.project.informationTags,assignments);
 const status=t.h.find(n=>n.props['data-status']);assert.equal(status.props['data-status'],'in-progress');assert.match(status.props.title,/In Progress/);
 const badge=t.h.find(n=>n.props['data-information-tag']==='paid-100');assert.equal(badge.props.style.background,'#1266CC');
});
test('explicit auth invalidation clears projected aliases and blocks further saves',async()=>{
 const t=fixture();t.server.entries['paid-100'].name='Private alias';await t.settle();assert.match(content(t.h.tree),/Private alias/);const draft=t.state.presentation;
 t.invalidate();assert.equal(t.state.presentation,null);assert.doesNotMatch(content(t.h.tree),/Private alias/);assert.match(t.state.error,/Sign in again/);assert.equal(await t.state.save(draft,3),false);assert.equal(t.calls.length,0);
});
test('permission denied during poll clears projection rather than retaining private labels',async()=>{
 let denied=false;const t=fixture({read:async()=>{if(denied)throw Object.assign(Error('forbidden'),{code:'functions/permission-denied'});return {...t.model.emptyLabelPresentation(),revision:3};}});await t.settle();assert.ok(t.state.presentation);denied=true;await t.poll();assert.equal(t.state.presentation,null);assert.match(t.state.error,/Sign in again/);
});
test('late prior-project read never replaces current verified project projection',async()=>{
 const first=deferred(),second=deferred(),t=fixture({owner:false,read:id=>id===P?first.promise:second.promise});await t.settle();assert.deepEqual(t.reads,[P]);
 t.props.project={clientId:C,projectId:Q,informationTags:['dtd-needed']};t.render();assert.equal(t.state.presentation,null);await t.settle();assert.deepEqual(t.reads,[P,Q]);
 const next={...t.model.emptyLabelPresentation(),revision:9};next.entries['dtd-needed'].name='Current project';second.resolve(next);await t.settle();assert.match(content(t.h.tree),/Current project/);
 const stale={...t.model.emptyLabelPresentation(),revision:20};stale.entries['dtd-needed'].name='Wrong prior project';first.resolve(stale);await t.settle();assert.match(content(t.h.tree),/Current project/);assert.doesNotMatch(content(t.h.tree),/Wrong prior project/);assert.equal(t.state.presentation.revision,9);assert.equal(t.watchers[0].closed,true);
});
test('uncertain retry keeps identical operation ID and payload, with no poll rebase or duplicate submission',async()=>{
 const gate=deferred();let n=0;const t=fixture({save:async input=>{if(++n===1)return gate.promise;return {...t.model.emptyLabelPresentation(),entries:input.entries,order:input.order,revision:4};}});await t.settle();const draft={entries:structuredClone(t.state.presentation.entries),order:[...t.state.presentation.order]};draft.entries.status.name='In workshop';
 const first=t.state.save(draft,3,{legacyProjectId:P,adoptLegacyKeys:[]});const duplicate=t.state.save(draft,3);assert.equal(await duplicate,false);assert.equal(t.calls.length,1);t.render();assert.equal(t.state.busy,true);
 draft.entries.status.name='Changed after submit';gate.reject(Error('response lost'));assert.equal(await first,false);t.render();assert.equal(t.state.retry,true);const reads=t.reads.length;await t.poll();assert.equal(t.reads.length,reads);
 const retrying=t.state.retrySave();assert.equal(await t.state.retrySave(),false);assert.equal(await retrying,true);t.render();assert.equal(t.calls.length,2);assert.deepEqual(t.calls[1],t.calls[0]);assert.equal(t.calls[1].entries.status.name,'In workshop');assert.equal(t.state.retry,false);
});
test('late save acknowledgement after auth invalidation cannot revive aliases',async()=>{
 const gate=deferred(),t=fixture({save:()=>gate.promise});await t.settle();const old=t.state.presentation,pending=t.state.save(old,3);t.invalidate();gate.resolve({...old,revision:4});assert.equal(await pending,false);t.render();assert.equal(t.state.presentation,null);assert.match(t.state.error,/Sign in again/);
});

async function ownerHubFixture(options={}){
 const h=harness();active.add(h);h.document.visibilityState='visible';
 const model=h.load('src/client-hub/label-presentation.ts');let server={...model.emptyLabelPresentation(),revision:3};const saves=[],contexts=[];
 const client={clientId:C,displayName:'Owner fixture',status:'active',authVersion:1,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};
 const projects=[P,Q].map(projectId=>({projectId,clientId:C,title:projectId,status:'in-progress',informationTags:['paid-100'],summary:'',progress:25,progressSource:'manual',trackingUrl:null,requestId:null,version:1,createdAt:client.createdAt,updatedAt:client.updatedAt}));
 const transport={watchLabelPresentationSession:async()=>({assertCurrent(){},close(){}}),getOwnerLabelPresentation:async()=>structuredClone(server),getOwnerLabelPresentationContext:async id=>{contexts.push(id);return options.context?options.context(id):{presentation:structuredClone(server),legacyCandidates:{}};},saveOwnerLabelPresentation:async input=>{saves.push(structuredClone(input));if(options.strictRevision && input.expectedRevision!==server.revision)throw Object.assign(Error("Labels changed in another window"),{code:"functions/aborted"});return {...model.emptyLabelPresentation(),entries:structuredClone(input.entries),order:[...input.order],revision:input.expectedRevision+1};}};
 h.overrides['./label-presentation-client']=transport;h.overrides['@/client-hub/label-presentation-client']=transport;
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({assertCurrent(){},auth:{onAuthStateChanged(){return()=>{};}}})};
 h.overrides['./client-hub-client']={clientHubErrorMessage:e=>e.message,listClients:async()=>[client],subscribeClients(){return()=>{};},getClientDetail:async()=>({client,projects,email:''}),subscribeClientDetail(){return()=>{};}};
 const Component=h.load('src/owner/OwnerClientHub.tsx').OwnerClientHub,render=()=>h.render(Component,{}),button=label=>h.find(n=>n.type==='button'&&content(n)===label);
 const settle=async()=>{await tick();render();await tick();render();};render();await settle();h.find(n=>n.type==='button'&&n.props.className==='clientRow').props.onClick();await settle();
 return {h,render,settle,button,saves,contexts,projects,model,get server(){return server;},set server(v){server=v;},dialog:()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Card label hierarchy'),workspace:()=>h.find(n=>n.type?.name==='HubWorkspaceWindow')};
}
test('actual owner label editor keeps captured baseline and local draft when polling reveals concurrent changes',async()=>{
 const t=await ownerHubFixture({strictRevision:true});assert.ok(t.button('Label order'));t.button('Label order').props.onClick();await t.settle();assert.ok(t.dialog());
 const editor=t.h.find(n=>n.type?.name==='LabelPresentationEditor'),draft=structuredClone(editor.props.value);draft.entries['paid-100'].name='Cleared balance';editor.props.onChange(draft);t.render();
 t.server={...structuredClone(t.server),revision:12};t.h.window.dispatchEvent(new Event('focus'));await t.settle();
 assert.equal(t.h.tree.props.value.revision,12);assert.equal(t.h.find(n=>n.type?.name==='LabelPresentationEditor').props.value.entries['paid-100'].name,'Cleared balance');
 const save=nodes(t.dialog().props.actions).find(n=>n.type==='button'&&content(n)==='Save default');await save.props.onClick();await t.settle();assert.equal(t.saves.length,1);assert.equal(t.saves[0].expectedRevision,3);assert.ok(t.dialog());assert.match(content(t.dialog()),/changed in another window/);assert.equal(t.h.find(n=>n.type?.name==='LabelPresentationEditor').props.value.entries['paid-100'].name,'Cleared balance');assert.deepEqual(t.projects[0].informationTags,['paid-100']);assert.equal(t.projects[0].status,'in-progress');
});
test('delayed owner label-manager context cannot open for the previously selected commission',async()=>{
 const gate=deferred(),t=await ownerHubFixture({context:()=>gate.promise});t.button('Label order').props.onClick();t.render();assert.deepEqual(t.contexts,[P]);
 await t.workspace().props.onProjectSelect(Q);t.render();gate.resolve({presentation:t.server,legacyCandidates:{'custom:Old':{name:'Old',color:null,hidden:false,deleted:false}}});await t.settle();
 assert.equal(t.workspace().props.project.projectId,Q);assert.equal(t.dialog(),undefined);assert.ok(t.button('Label order'));
});

test('delayed successful save acknowledgement cannot roll projection back behind a newer in-flight poll',async()=>{
 const poll=deferred(),save=deferred();let reads=0;const t=fixture({read:async()=>++reads===1?{...t.model.emptyLabelPresentation(),revision:3}:poll.promise,save:()=>save.promise});await t.settle();
 const draft={entries:structuredClone(t.state.presentation.entries),order:[...t.state.presentation.order]};draft.entries.status.name='Our saved revision';t.h.window.dispatchEvent(new Event('focus'));
 const committing=t.state.save(draft,3);const newer={...t.model.emptyLabelPresentation(),revision:12};newer.entries.status.name='Newer concurrent revision';poll.resolve(newer);await t.settle();assert.equal(t.state.presentation.revision,12);
 save.resolve({...t.model.emptyLabelPresentation(),entries:draft.entries,order:draft.order,revision:4});assert.equal(await committing,true);t.render();assert.equal(t.state.presentation.revision,12);assert.match(content(t.h.tree),/Newer concurrent revision/);
});

test('explicit permission failure during save clears private projection and uncertain retry state',async()=>{
 const t=fixture({save:async()=>{throw Object.assign(Error('permission revoked'),{code:'functions/permission-denied'});}});await t.settle();const draft=t.state.presentation;assert.equal(await t.state.save(draft,3),false);t.render();assert.equal(t.state.presentation,null);assert.equal(t.state.retry,false);assert.equal(t.state.busy,false);assert.match(t.state.error,/Sign in again/);assert.equal(await t.state.retrySave(),false);assert.equal(t.calls.length,1);
});
