import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const active=new Set(); afterEach(()=>{for(const h of active)h.unmount();active.clear();});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const project={clientId:'TMC-0123456789ABCDEF',projectId:'11111111-1111-4111-8111-111111111111',title:'Fox',status:'in-progress',version:1};
async function fixture(upload){
 const h=harness();active.add(h);const calls=[],busy=[],dirty=[],failures=[];
 h.overrides['./client']={clientHubErrorMessage:error=>error.message,isClientHubSessionError:error=>error.code==='session-expired'};
 h.overrides['./attachments-client']={async listHubAttachments(){return{attachments:[],nextCursor:null,retention:{available:true,state:'paused',expiresAt:null}};},async uploadHubAttachments(...args){calls.push(args);return upload(...args);},async cancelHubAttachmentBatch(){return{status:'cancelled'};}};
 const Component=h.load('src/client-hub/MakerChatAttachments.tsx').MakerChatAttachments;
 const props={project,owner:true,onFailure:error=>failures.push(error),onDirtyChange:value=>dirty.push(value),onBusyChange:value=>busy.push(value),openRequest:{sequence:1,mode:'upload'}};
 const render=()=>h.render(Component,props),settle=async()=>{await tick();render();await tick();render();};render();await settle();
 const button=label=>h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label));
 return{h,calls,busy,dirty,failures,render,settle,button,choose(files){const target={files,value:'C:\\fakepath\\old'};h.find(n=>n.type==='input'&&n.props.type==='file'&&!n.props.hidden).props.onChange({target});render();assert.equal(target.value,'');},send(){h.find(n=>n.type==='form'&&n.props.className==='upload').props.onSubmit({preventDefault(){}});render();}};
}
test('pending attachments allow individual replacement/removal and clear native chooser count',async()=>{
 const f=await fixture(async()=>({attachments:[]})),a=new File(['a'],'one.txt'),b=new File(['b'],'two.txt');f.choose([a,b]);
 f.button('Remove one.txt').props.onClick();f.render();assert.equal(f.button('Remove one.txt'),undefined);assert.ok(f.button('Remove two.txt'));
 const target={files:[a],value:'old'};f.h.find(n=>n.type==='input'&&n.props.hidden).props.onChange({target});f.render();assert.equal(target.value,'');assert.ok(f.button('Remove one.txt'));f.send();await f.settle();assert.deepEqual(f.calls[0][2],[a]);assert.match(content(f.h.tree),/Sent Successfully/);
});
test('background upload retains busy ownership; uncertain failure reopens same attempt without false success',async()=>{
 let reject;const f=await fixture(()=>new Promise((_,no)=>{reject=no;})),file=new File(['a'],'fox.txt');f.choose([file]);f.send();
 assert.equal(f.h.find(n=>n.type==='dialog'),undefined);assert.equal(f.busy.at(-1),true);assert.equal(f.dirty.at(-1),true);assert.ok(f.button('View upload'));const first=f.calls[0][3];first.onProgress({phase:'uploading',fileName:'fox.txt',uploadedBytes:0,totalBytes:1,index:0,totalFiles:1,attachmentId:first.attachmentIds[0]});
 reject(Error('Response uncertain'));await f.settle();assert.ok(f.h.find(n=>n.type==='dialog'));assert.match(content(f.h.tree),/Response uncertain/);assert.match(content(f.h.tree),/Paused — check the error/);assert.doesNotMatch(content(f.h.tree),/Sent Successfully/);assert.equal(f.button('Replace fox.txt').props.disabled,true);assert.equal(f.button('Remove fox.txt').props.disabled,true);assert.equal(f.button('Rename fox.txt').props.disabled,true);
 f.send();assert.equal(f.calls[1][3].batchId,first.batchId);assert.deepEqual(f.calls[1][3].attachmentIds,first.attachmentIds);assert.equal(f.calls[1][2][0],file);reject(Error('Still uncertain'));await f.settle();
});
test('support cards retain stored content but expose no attachment access or upload control',()=>{
 const h=harness();active.add(h);const Request=h.load('src/client-hub/ProjectWorkspace.tsx').RequestCard;let sends=0;
 h.render(Request,{request:{requestId:'r',type:'support',body:'Please help',status:'open',createdAt:'2026-10-28T00:00:00Z',attachmentIds:['old']},replies:[{replyId:'reply',body:'Stored reply',attachmentIds:['old2'],senderRole:'owner',createdAt:'2026-10-28T00:00:00Z'}],owner:true,busy:false,onReply:async()=>{sends++;return true;},onStatus(){},onDraftChange(){},onAttach(){assert.fail('Removed support upload');},onViewAttachments(){assert.fail('Removed support access');}});
 assert.match(content(h.tree),/Please help/);assert.match(content(h.tree),/Stored reply/);assert.equal(h.all(n=>n.type==='button'&&/attach|shared files/i.test((n.props['aria-label']??'')+content(n))).length,0);assert.equal(sends,0);
});

test('hidden upload keeps duplicate-submit lock and unmount aborts without late success',async()=>{
 let resolve;const f=await fixture(()=>new Promise(yes=>{resolve=yes;}));f.choose([new File(['a'],'fox.txt')]);
 const submit=f.h.find(n=>n.type==='form'&&n.props.className==='upload').props.onSubmit;submit({preventDefault(){}});f.render();assert.equal(f.h.find(n=>n.type==='dialog'),undefined);submit({preventDefault(){}});assert.equal(f.calls.length,1);
 const signal=f.calls[0][3].signal;assert.equal(signal.aborted,false);f.h.unmount();assert.equal(signal.aborted,true);resolve({attachments:[{attachmentId:'saved'}]});await tick();assert.doesNotMatch(content(f.h.tree),/Sent Successfully/);assert.equal(f.busy.at(-1),false);
});
test('hidden upload session failure reports to enclosing gate and never announces success',async()=>{
 let reject;const f=await fixture(()=>new Promise((_,no)=>{reject=no;}));
 // The real transport fences credentials on every chunk; this exercises its terminal session error handoff.
 f.choose([new File(['a'],'fox.txt')]);f.send();reject(Object.assign(Error('Session expired'),{code:'session-expired'}));await f.settle();assert.match(content(f.h.tree),/Session expired|expired/i);assert.equal(f.failures.length,1);assert.equal(f.failures[0].code,'session-expired');assert.doesNotMatch(content(f.h.tree),/Sent Successfully/);
 const retry=f.button('Retry upload');assert.ok(retry);f.h.unmount();assert.equal(f.busy.at(-1),false);
});

test('long photo name uses timed inline error without a popup or discarding the queue',async()=>{
 const h=harness();active.add(h);const timers=[];h.globals.window={setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){}};
 h.overrides['@/owner/use-studio-settings']={useStudioSettings:()=>({settings:{photoNamingMode:'automatic'},busy:false}),saveStudioSettings:async()=>{},retryStudioSettings:async()=>{}};
 const Queue=h.load('src/client-hub/ProgressPhotoQueue.tsx').ProgressPhotoQueue;
 const file=new File(['x'],'fox.png',{type:'image/png'});const props={files:[file],names:['x'.repeat(45)],disabled:false,onChange(files,names){props.files=files;props.names=names}};const render=()=>h.render(Queue,props);
 render();await tick();render();h.find(n=>n.type==='button'&&n.props['aria-label']==='Rename fox.png').props.onClick();render();h.find(n=>n.type==='button'&&n.props['aria-label']==='Save name for fox.png').props.onClick();render();
 const popup=()=>h.find(n=>n.type?.name==='HubActionDialog');assert.equal(popup(),undefined);assert.match(content(h.find(n=>n.props.role==='alert')),/42 characters/);assert.deepEqual(props.names,['x'.repeat(45)]);assert.equal(props.files[0],file);
 assert.equal(timers.at(-1).ms,5000);timers.at(-1).fn();render();assert.equal(popup(),undefined);assert.ok(h.find(n=>n.type==='input'&&n.props['aria-label']==='Name for fox.png'));assert.deepEqual(props.names,['x'.repeat(45)]);
});
