import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const ID='TMC-0123456789ABCDEF',OTHER='TMC-ABCDEF0123456789',PID='11111111-1111-4111-8111-111111111111',MID='22222222-2222-4222-8222-222222222222',ISO='2026-10-26T21:00:00.000Z';
const project={clientId:ID,projectId:PID,title:'Fox',summary:'',status:'queued',progress:null,progressSource:'manual',trackingUrl:null,requestId:null,version:1,createdAt:ISO,updatedAt:ISO};
const message={messageId:MID,clientId:ID,projectId:PID,senderRole:'client',body:'Hello Taylor',createdAt:ISO};
const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
const photo={photoId:MID,clientId:ID,projectId:PID,storagePath:`hub-progress/${ID}/${PID}/${MID}`,contentType:'image/png',fileName:'progress.png',caption:'First progress',size:bytes.length,createdAt:ISO};
const request={requestId:MID,projectId:PID,clientId:ID,type:'support',body:'Need help',photoId:null,status:'open',response:'',createdAt:ISO,updatedAt:ISO,version:1};
const privateWorkspace={projectId:PID,clientId:ID,notes:'Owner only',materials:[],version:1,updatedAt:ISO};
const model=sourceLoader({})('src/client-hub/model.ts');
function fixture(){
 const calls=[],reads=[],storage=[],listeners=new Set();let signOuts=0;let valid=true,ownerCalls=0,clientId=ID,hook=null;
 const data={hubMessages:[message],hubPhotos:[photo],hubSupportRequests:[request],hubSupportReplies:[],hubNotifications:[],hubConversationVisibility:[]};
 const db={},auth={app:{name:'fixture'},currentUser:{uid:'fixture-client'}};
 function assertCurrent(){if(!valid)throw new Error('Session changed');}
 const session={db,auth,functions:{},session:{clientId:ID,authVersion:1},assertCurrent};
 const overrides={
  './client':{CLIENT_HUB_FUNCTIONS_REGION:'us-central1',ClientHubError:class extends Error{constructor(code,message){super(message);this.code=code;}},captureClientHubSessionOwnership:()=>()=>true,verifiedClientHubConnection:async()=>({...session,session:{clientId,authVersion:1}}),isClientHubSessionError:e=>e.code==='session-expired',signOutClient:async()=>{signOuts++;}},
  './callable-owner-session':{hubCallableOwnerSession:async()=>{ownerCalls++;return session;}},
  '@/owner/taylor-services-client':{taylorOwnerSession:async()=>{ownerCalls++;return session;}},
  'firebase/firestore':{getFirestore:()=>db,onSnapshot:(target,_options,callback,error)=>{const listener={target,callback,error};listeners.add(listener);queueMicrotask(()=>{if(!listeners.has(listener))return;const values=data[target.path];callback(values?{metadata:{fromCache:false},docs:values.map(value=>({id:value.messageId??value.photoId??value.replyId??value.requestId??value.notificationId,data:()=>value}))}:{metadata:{fromCache:false},exists:()=>!target.path.startsWith('hubFileCopyRevisions/'),data:()=>target.path.startsWith('hubClients/')?{clientId:ID,displayName:'Client',status:'active',authVersion:1,createdAt:ISO,updatedAt:ISO}:privateWorkspace});});return()=>listeners.delete(listener);},documentId:()=> '__name__',startAfter:(...values)=>({kind:'startAfter',values}),collection:(_db,path)=>({path}),doc:(_db,...parts)=>({path:parts.join('/')}),where:(field,op,value)=>({kind:'where',field,op,value}),orderBy:(field,order)=>({kind:'orderBy',field,order}),limit:count=>({kind:'limit',count}),query:(target,...filters)=>({...target,filters}),getDocsFromServer:async q=>{reads.push(q);await hook?.('read',q);return{size:data[q.path].length,docs:data[q.path].map(value=>({id:value.messageId??value.photoId??value.replyId??value.requestId,data:()=>value}))};},getDocFromServer:async q=>{reads.push(q);return {exists:()=>true,data:()=>q.path.startsWith('hubProjects/') ? project : q.path.startsWith('hubSupportRequests/') ? data.hubSupportRequests.find(item=>q.path.endsWith('/'+item.requestId)) : privateWorkspace};}},
  'firebase/auth':{onIdTokenChanged:(_auth,callback)=>{queueMicrotask(()=>callback(auth.currentUser));return()=>{};}},
  'firebase/functions':{getFunctions:()=>({}),httpsCallable:(_fn,name)=>async input=>{calls.push({name,input});const result=await hook?.('call',{name,input});return{data:result??(name==='tmcHubListPhotos'?{photos:data.hubPhotos,nextCursor:null}:name==='tmcHubReadPhoto'?{photoId:MID,base64:bytes.toString('base64'),contentType:'image/png',fileName:'progress.png',size:bytes.length}:name==='tmcHubSendMessage'?{message}:name==='tmcHubCreateSupportRequest'?{request}:{workspace:{...privateWorkspace,version:input.expectedVersion+1}})};}},
  'firebase/storage':{getStorage:()=>({}),ref:(_s,path)=>({path}),getBlob:async()=>{storage.push('getBlob');return new Blob([bytes],{type:'image/png'});},getMetadata:async()=>{storage.push('getMetadata');return{};},uploadBytes:async()=>{storage.push('uploadBytes');}},
 };
 const api=sourceLoader(overrides)('src/client-hub/workspace-client.ts');
 return {api,calls,reads,storage,data,storageApi:overrides['firebase/storage'],expire:()=>{valid=false;},clientId:value=>{clientId=value;},hook:value=>{hook=value;},owners:()=>ownerCalls,listeners:()=>listeners.size,signOuts:()=>signOuts,emitRecord:(path,value)=>{for(const l of listeners)if(l.target.path===path)l.callback({metadata:{fromCache:false},exists:()=>true,data:()=>value});},emit:(name,values,fromCache=false)=>{for(const l of listeners)if(l.target.path===name)l.callback({metadata:{fromCache},docs:values.map(value=>({id:value.messageId??value.photoId??value.replyId??value.requestId??value.notificationId,data:()=>value}))});}};
}

test('workspace decoders whitelist shared fields, bind all records to selected project, and keep private notes separate',()=>{
 assert.deepEqual(model.decodeHubMessage({...message,email:'secret',notes:'private'},MID,project),message);
 for(const decode of [model.decodeHubMessage,model.decodeHubPhoto,model.decodeHubSupportRequest]){
  const value=decode===model.decodeHubMessage?message:decode===model.decodeHubPhoto?photo:request;
  assert.throws(()=>decode({...value,clientId:OTHER},MID,project),/different commission/);
 }
 assert.deepEqual(model.decodeHubPrivateWorkspace(privateWorkspace,PID,project),privateWorkspace);
 assert.throws(()=>model.decodeHubPhoto({...photo,storagePath:'https://example.test/public.png'},MID,project));
 assert.throws(()=>model.decodeHubSupportRequest({...request,type:'photo-deletion'},MID,project));
});
test('private material estimates accept existing non-v4 UUIDs and preserve exact IDs',()=>{
 const id='AABBCCDD-1122-1333-8444-AABBCCDDEEFF';
 assert.deepEqual(model.validateHubMaterials([{inventoryItemId:id,requiredQuantity:1.125}]),[{inventoryItemId:id,requiredQuantity:1.125}]);
 for(const quantity of [0,-1,Infinity,1.0001])assert.throws(()=>model.validateHubMaterials([{inventoryItemId:id,requiredQuantity:quantity}]));
 assert.throws(()=>model.validateHubMaterials(Array.from({length:51},()=>({inventoryItemId:id,requiredQuantity:1}))));
});
test('Trello links are optional, exact card URLs only, and never imply synchronization',()=>{
 assert.equal(model.safeClientHubTrelloUrl(undefined),null);
 assert.equal(model.safeClientHubTrelloUrl('https://trello.com/c/Ab12Cd34/fox'),'https://trello.com/c/Ab12Cd34/fox');
 for(const url of ['https://trello.com/b/Ab12Cd34/board','https://evil.test/c/Ab12Cd34','https://trello.com.evil.test/c/Ab12Cd34','https://trello.com/c/Ab12Cd34?token=secret','https://trello.com/c/Ab12Cd34#secret'])assert.throws(()=>model.safeClientHubTrelloUrl(url));
});
test('client queries are bounded by both identities and newest200; owner-only notes are never fetched for client',async()=>{
 const f=fixture(), result=await f.api.loadProjectWorkspace(project,false);
 assert.equal(result.messages.length,1);assert.equal(result.privateWorkspace,null);assert.equal(f.owners(),0);
 assert.deepEqual(f.reads.find(q=>q.path==='hubConversationVisibility').filters,[{kind:'where',field:'viewerUid',op:'==',value:'fixture-client'},{kind:'where',field:'clientId',op:'==',value:ID},{kind:'where',field:'projectId',op:'==',value:PID}]);
 assert.deepEqual(f.reads.map(q=>q.path),['hubMessages','hubSupportRequests','hubSupportReplies','hubNotifications','hubConversationVisibility']);
 for(const q of f.reads.filter(q=>!['hubNotifications','hubConversationVisibility'].includes(q.path)))assert.deepEqual(q.filters,[{kind:'where',field:'clientId',op:'==',value:ID},{kind:'where',field:'projectId',op:'==',value:PID},{kind:'orderBy',field:'createdAt',order:'desc'},{kind:'limit',count:200}]);
});
test('owner reads private workspace separately and cross-client/changed-session data fails closed',async()=>{
 const owner=fixture();assert.equal((await owner.api.loadProjectWorkspace(project,true)).privateWorkspace.notes,'Owner only');assert.equal(owner.owners(),1);
 const cross=fixture();cross.clientId(OTHER);await assert.rejects(cross.api.loadProjectWorkspace(project,false));assert.equal(cross.reads.length,0);
 const stale=fixture();stale.hook(()=>stale.expire());await assert.rejects(stale.api.loadProjectWorkspace(project,false),/Session changed/);
 const corrupt=fixture();corrupt.data.hubMessages=[{...message,clientId:OTHER}];await assert.rejects(corrupt.api.loadProjectWorkspace(project,false),/different commission/);
});
test('messages retain operation IDs and are validated before network access',async()=>{
 const f=fixture();await f.api.sendHubMessage(project,false,' Hello Taylor ',MID);
 assert.deepEqual(f.calls,[{name:'tmcHubSendMessage',input:{operationId:MID,projectId:PID,body:'Hello Taylor'}}]);
 for(const body of ['', 'x'.repeat(4001),'bad\0'])await assert.rejects(f.api.sendHubMessage(project,false,body,MID));
 assert.equal(f.calls.length,1);
});
test('photo reads use authenticated byte callable only, not direct Storage or token URLs',async()=>{
 const f=fixture(),blob=await f.api.loadHubPhotoBlob(photo,false);
 assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 assert.deepEqual(f.calls,[{name:'tmcHubReadPhoto',input:{photoId:MID}}]);assert.deepEqual(f.storage,[]);
});
test('malformed/mismatched byte responses and expired sessions never produce a Blob',async()=>{
 const good={photoId:MID,base64:bytes.toString('base64'),contentType:'image/png',fileName:'progress.png',size:bytes.length};
 for(const patch of [{photoId:PID},{contentType:'text/html'},{size:1},{base64:'<script>'},{fileName:'wrong.png'}]){const f=fixture();f.hook(()=>({...good,...patch}));await assert.rejects(f.api.loadHubPhotoBlob(photo,false));}
 const f=fixture();f.hook(()=>{f.expire();return good;});await assert.rejects(f.api.loadHubPhotoBlob(photo,false),/Session changed/);
});
test('photo byte transfers are capped at two and queued canceled requests never call server',async()=>{
 const f=fixture(), releases=[];let active=0,max=0;
 f.hook(async(_kind,{input})=>{active++;max=Math.max(max,active);await new Promise(resolve=>releases.push(resolve));active--;return {photoId:input.photoId,base64:bytes.toString('base64'),contentType:photo.contentType,fileName:photo.fileName,size:photo.size};});
 const secondId='33333333-3333-4333-8333-333333333333', thirdId='44444444-4444-4444-8444-444444444444';
 const distinct=id=>({...photo,photoId:id,storagePath:`hub-progress/${ID}/${PID}/${id}`});
 const a=f.api.loadHubPhotoBlob(photo,false),b=f.api.loadHubPhotoBlob(distinct(secondId),false),cancel=new AbortController();
 const c=f.api.loadHubPhotoBlob(distinct(thirdId),false,cancel.signal);cancel.abort();await assert.rejects(c,e=>e.name==='AbortError');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,2);assert.equal(max,2);
 releases.splice(0).forEach(resolve=>resolve());await Promise.all([a,b]);assert.equal(f.calls.length,2);
});
test('canceled workspace requests do not load, support photo binding and response versions are strict',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.api.loadProjectWorkspace(project,false,controller.signal),e=>e.name==='AbortError');assert.equal(f.reads.length,0);
 await assert.rejects(f.api.createHubSupportRequest(project,false,{operationId:MID,type:'support',body:'Hello',photoId:MID}));assert.equal(f.calls.length,0);
 const invalid=fixture();invalid.hook(()=>({request:{...request,status:'resolved',response:'Done',version:1}}));await assert.rejects(invalid.api.resolveHubSupportRequest(request,'Done'),/not confirmed/);
});
test('photo upload rejects false MIME and unsupported payload before owner authentication',async()=>{
 const f=fixture();for(const file of [new File(['<html>'],'bad.png',{type:'image/png'}),new File(['svg'],'bad.svg',{type:'image/svg+xml'}),new File([],'empty.jpg',{type:'image/jpeg'})])await assert.rejects(f.api.uploadHubPhoto(project,file,'',MID));
 assert.equal(f.owners(),0);assert.equal(f.storage.length,0);
});


test('live workspace scopes all four sections and emits updates without polling or read writes',async()=>{
 const f=fixture(),data=[],errors=[];const stop=f.api.subscribeProjectWorkspace(project,false,x=>data.push(x),e=>errors.push(e));await new Promise(r=>setImmediate(r));
 assert.equal(data.length,1);assert.equal(data[0].messages.length,1);assert.equal(f.listeners(),7);assert.ok(f.calls.length>=1);assert.ok(f.calls.every(call=>call.name==='tmcHubListPhotos'));
 f.emit('hubMessages',[{...message,body:'Cached'}],true);assert.equal(data.length,1);
 f.emit('hubMessages',[{...message,body:'Live'}]);assert.equal(data.at(-1).messages[0].body,'Live');
 stop();assert.equal(f.listeners(),0);f.emit('hubMessages',[message]);assert.equal(data.at(-1).messages[0].body,'Live');assert.deepEqual(errors,[]);
});
test('live workspace unsubscribe before async setup and session loss suppress stale snapshots',async()=>{
 const f=fixture(),data=[];const stop=f.api.subscribeProjectWorkspace(project,false,x=>data.push(x),()=>{});stop();await new Promise(r=>setImmediate(r));assert.equal(f.listeners(),0);assert.deepEqual(data,[]);
 const g=fixture(),errors=[],values=[];const close=g.api.subscribeProjectWorkspace(project,false,x=>values.push(x),e=>errors.push(e));await new Promise(r=>setImmediate(r));g.expire();g.emit('hubMessages',[{...message,body:'Secret late result'}]);assert.equal(values.length,1);assert.equal(errors.length,1);assert.equal(g.listeners(),0);close();
});
test('new receipt and thread decoders reject forged thread identifiers and preserve legacy requests',()=>{
 const notice={notificationId:`${PID}-owner-requests-${MID}`,clientId:ID,projectId:PID,recipientRole:'owner',channel:'requests',requestId:MID,latestItemId:MID,latestAt:ISO,version:1,readVersion:0,readAt:null,throughItemId:null,throughCreatedAt:null};
 assert.equal(model.decodeHubNotification(notice).requestId,MID);
 for(const patch of [{notificationId:`${PID}-owner-requests`},{requestId:undefined},{readVersion:2},{readVersion:1}])assert.throws(()=>model.decodeHubNotification({...notice,...patch}));
 assert.equal(model.decodeHubSupportRequest({...request,status:'resolved',response:'Old owner response'}).response,'Old owner response');
 for(const status of ['open','resolved','closed','cancelled'])assert.equal(model.decodeHubSupportRequest({...request,status}).status,status);
});


test('standalone account notification subscription watches current epoch and tears down even without dashboard',async()=>{
 const f=fixture(),values=[],errors=[];const stop=f.api.subscribeHubNotifications(false,x=>values.push(x),e=>errors.push(e));await new Promise(r=>setImmediate(r));
 assert.equal(f.listeners(),2);assert.equal(values.length,1);
 f.emitRecord(`hubClients/${ID}`,{clientId:ID,displayName:'Client',status:'suspended',authVersion:2,createdAt:ISO,updatedAt:ISO});
 assert.equal(errors.length,1);assert.equal(f.listeners(),0);assert.equal(f.signOuts(),1);stop();
});

test('memory photo reuse is server-validated by generation and old backends never receive conditions',async()=>{
 const f=fixture();let count=0;f.hook((kind,{name,input})=>{if(kind==='call'&&name==='tmcHubReadPhoto'){count++;assert.deepEqual(input,count===1?{photoId:MID}:{photoId:MID,knownGeneration:'7'});return {photoId:MID,generation:'7',...(count===1?{base64:bytes.toString('base64')}:{notModified:true}),contentType:'image/png',fileName:'progress.png',size:bytes.length};}});
 const first=await f.api.loadHubPhotoBlob(photo,false),second=await f.api.loadHubPhotoBlob(photo,false);assert.equal(first,second);assert.equal(count,2);f.api.clearHubPhotoCache();
 const legacy=fixture();await legacy.api.loadHubPhotoBlob(photo,false);await legacy.api.loadHubPhotoBlob(photo,false);assert.ok(legacy.calls.every(call=>!('knownGeneration'in call.input)));legacy.api.clearHubPhotoCache();
});
test('conditional photo mismatch, missing cached blob and validation failure do not return private bytes',async()=>{
 const f=fixture();f.hook((kind)=>kind==='call'?{photoId:MID,generation:'7',notModified:true,contentType:'image/png',fileName:'progress.png',size:bytes.length}:undefined);await assert.rejects(f.api.loadHubPhotoBlob(photo,false),/cached photo could not be verified/);f.api.clearHubPhotoCache();
 const g=fixture();let count=0;g.hook(kind=>{if(kind==='call')return {photoId:MID,generation:++count===1?'7':'8',...(count===1?{base64:bytes.toString('base64')}:{notModified:true}),contentType:'image/png',fileName:'progress.png',size:bytes.length};});await g.api.loadHubPhotoBlob(photo,false);await assert.rejects(g.api.loadHubPhotoBlob(photo,false),/cached photo could not be verified/);g.api.clearHubPhotoCache();
});


test('request/reply history cursors are bounded, authenticated, tie-safe and scope validated',async()=>{
 const f=fixture(), id=n=>`${String(n).padStart(8,'0')}-3333-4333-8333-333333333333`;
 f.data.hubSupportRequests=Array.from({length:51},(_,i)=>({...request,requestId:id(100-i),status:'resolved'}));
 const page=await f.api.loadHubSupportRequestPage(project,false);assert.equal(page.items.length,50);assert.deepEqual(page.next,{createdAt:ISO,id:id(51)});
 const q=f.reads.at(-1);assert.deepEqual(q.filters.slice(0,2),[{kind:'where',field:'clientId',op:'==',value:ID},{kind:'where',field:'projectId',op:'==',value:PID}]);assert.ok(q.filters.some(x=>x.kind==='orderBy'&&x.field==='__name__'&&x.order==='desc'));assert.equal(q.filters.at(-1).count,51);
 f.data.hubSupportRequests=[{...request,requestId:id(50)}];const last=await f.api.loadHubSupportRequestPage(project,false,page.next);assert.equal(last.next,null);assert.deepEqual(f.reads.at(-1).filters.find(x=>x.kind==='startAfter').values,[ISO,id(51)]);
 const found=await f.api.loadHubSupportRequest(project,false,id(50));assert.equal(found.requestId,id(50));
 f.data.hubSupportReplies=[{replyId:id(49),requestId:id(50),clientId:ID,projectId:PID,senderRole:'owner',body:'Earlier response',createdAt:ISO}];const replies=await f.api.loadHubSupportReplyPage(project,false);assert.equal(replies.items[0].replyId,id(49));assert.equal(replies.next,null);
 const bad=fixture();for(const cursor of [{createdAt:'not-a-date',id:MID},{createdAt:ISO,id:'../secret'}])await assert.rejects(bad.api.loadHubSupportRequestPage(project,false,cursor));assert.equal(bad.reads.length,0);
 const cross=fixture();cross.clientId(OTHER);await assert.rejects(cross.api.loadHubSupportRequestPage(project,false));assert.equal(cross.reads.length,0);
 const stale=fixture();stale.hook(()=>stale.expire());await assert.rejects(stale.api.loadHubSupportRequestPage(project,false),/Session changed/);
 const mismatch=fixture();mismatch.data.hubSupportRequests=[{...request,clientId:OTHER}];await assert.rejects(mismatch.api.loadHubSupportRequestPage(project,false),/different commission/);
 const cancelled=fixture(), controller=new AbortController();controller.abort();await assert.rejects(cancelled.api.loadHubSupportRequestPage(project,false,null,controller.signal),e=>e.name==='AbortError');assert.equal(cancelled.reads.length,0);
});

test('photo callable fills newest visible gallery across empty tombstone pages and folder exports never stop at an empty page',async()=>{
 const f=fixture();let page=0;f.hook((kind,{name})=>{if(kind==='call'&&name==='tmcHubListPhotos'){page++;return page===1?{photos:[],nextCursor:{createdAt:ISO,photoId:MID}}:{photos:[{...photo,createdAt:'2026-10-25T20:00:00.000Z'}],nextCursor:null};}});
 assert.equal((await f.api.loadProjectWorkspace(project,false)).photos.length,1);assert.equal(page,2);assert.equal(f.reads.some(read=>read.path==='hubPhotos'),false);
 const g=fixture();let calls=0;g.hook((kind,{name,input})=>{if(kind==='call'&&name==='tmcHubListPhotos'){assert.equal(input.uploadDate,undefined,'reusable folders include every upload date');assert.equal(input.folderName,'');calls++;return calls===1?{photos:[],nextCursor:{createdAt:ISO,photoId:MID}}:{photos:[{...photo,createdAt:'2026-10-25T20:00:00.000Z'}],nextCursor:null};}});
 assert.equal((await g.api.listHubPhotoFolder(project,false,{folderName:'',uploadDate:'2026-10-26'})).length,1);assert.equal(calls,2);
});
test('photo summary refresh reaches both roles promptly while unrelated chat does not refetch photos',async()=>{
 for(const owner of [false,true]){
  const f=fixture(),data=[],errors=[];const close=f.api.subscribeProjectWorkspace(project,owner,x=>data.push(x),e=>errors.push(e));await new Promise(r=>setImmediate(r));
  const baseline=f.calls.filter(call=>call.name==='tmcHubListPhotos').length;
  const notice=channel=>({notificationId:`${PID}-client-${channel}`,clientId:ID,projectId:PID,recipientRole:'client',channel,latestItemId:MID,latestAt:ISO,version:1,readVersion:0,readAt:null,throughItemId:null,throughCreatedAt:null});
  f.emit('hubNotifications',[notice('chat')]);await new Promise(r=>setImmediate(r));assert.equal(f.calls.filter(call=>call.name==='tmcHubListPhotos').length,baseline);
  f.emit('hubNotifications',[notice('chat'),notice('photos')]);await new Promise(r=>setImmediate(r));assert.equal(f.calls.filter(call=>call.name==='tmcHubListPhotos').length,baseline+1);assert.deepEqual(errors,[]);assert.equal(data.at(-1).photos.length,1);close();
 }
});
test('own-copy rejection evicts conditional cached bytes without signing out an otherwise valid session',async()=>{
 const f=fixture();let reads=0;f.hook((kind,{name,input})=>{if(kind==='call'&&name==='tmcHubReadPhoto'){reads++;if(reads===2){assert.equal(input.knownGeneration,'9');throw Object.assign(new Error('You deleted your copy of this file.'),{code:'functions/failed-precondition'});}assert.equal(input.knownGeneration,undefined);return{photoId:MID,generation:'9',base64:bytes.toString('base64'),contentType:photo.contentType,fileName:photo.fileName,size:photo.size};}});
 await f.api.loadHubPhotoBlob(photo,false);await assert.rejects(f.api.loadHubPhotoBlob(photo,false),{code:'functions/failed-precondition'});await f.api.loadHubPhotoBlob(photo,false);assert.equal(f.signOuts(),0);
});

test('interrupted published photo retry avoids direct Storage GET and does not republish, but checks exact existing bytes',async()=>{
 const f=fixture(),failure=Object.assign(new Error('create-only already uploaded'),{code:'storage/unauthorized'});f.storageApi.uploadBytes=async()=>{throw failure;};
 f.hook((kind,{name,input})=>{if(kind==='call'&&name==='tmcHubPublishPhoto'){assert.equal(input.replayOnly,true);return{photo};}});
 const file=new File([bytes],'progress.png',{type:'image/png'});assert.equal((await f.api.uploadHubPhoto(project,file,'',MID)).photo.photoId,MID);
 assert.deepEqual(f.storage,[]);assert.deepEqual(f.calls.map(call=>call.name),['tmcHubPublishPhoto','tmcHubReadPhoto']);
 const g=fixture();g.storageApi.uploadBytes=async()=>{throw failure;};g.hook((kind,{name})=>{if(kind==='call'&&name==='tmcHubPublishPhoto')return{photo};});
 const changed=new File([Buffer.concat([bytes,Buffer.from([1])])],'progress.png',{type:'image/png'});await assert.rejects(g.api.uploadHubPhoto(project,changed,'',MID),error=>error===failure);assert.equal(g.calls.filter(call=>call.name==='tmcHubPublishPhoto'&&!call.input.replayOnly).length,0);
});

test('Fox9 custom photo names are validated before Storage side effects', async()=>{
 const f=fixture(), file=new File([bytes],'progress.png',{type:'image/png'});
 for(const name of ['../bad','a/b','a\\b','.', '..','x'.repeat(151),'bad\u0000name']) await assert.rejects(f.api.uploadHubPhoto(project,file,'',MID,'',name));
 assert.equal(f.storage.length,0); assert.equal(f.calls.length,0);
 f.hook((kind,{name})=>kind==='call'&&name==='tmcHubPublishPhoto'?{photo:{...photo,fileName:'First fitting.png'}}:undefined);
 const result=await f.api.uploadHubPhoto(project,file,'',MID,'','First fitting');
 assert.equal(result.photo.fileName,'First fitting.png'); assert.equal(f.calls.at(-1).input.nameStem,'First fitting');
});

test('Fox13 client archive transport sends only its project/version, verifies returned owner state and discards late sessions',async()=>{
 const f=fixture(),before={...project,status:'completed',ownerArchived:false};f.hook(async(kind,{name})=>kind==='call'&&name==='tmcHubSetClientProjectArchived'?{project:{...before,clientArchived:true,version:2}}:undefined);
 assert.equal((await f.api.setClientProjectArchived(before,true)).clientArchived,true);assert.equal(f.owners(),0);assert.deepEqual(f.calls[0],{name:'tmcHubSetClientProjectArchived',input:{projectId:PID,expectedVersion:1,archived:true}});
 f.hook(async()=>({project:{...before,clientArchived:true,ownerArchived:true,version:2}}));await assert.rejects(f.api.setClientProjectArchived(before,true),/confirm/);
 const late=fixture();late.hook(async()=>{late.expire();return{project:{...before,clientArchived:true,version:2}};});await assert.rejects(late.api.setClientProjectArchived(before,true),/Session changed/);
 const cross=fixture();cross.clientId(OTHER);await assert.rejects(cross.api.setClientProjectArchived(before,true),/not part/);assert.equal(cross.calls.length,0);
});
test('Fox13 owner photo rename transport preserves scope/extension and rejects mismatched results',async()=>{
 const f=fixture();f.hook(async()=>({photo:{...photo,fileName:'My photo.png'}}));assert.equal((await f.api.renameHubPhoto(project,photo,'My photo.png')).fileName,'My photo.png');assert.equal(f.owners(),1);assert.deepEqual(f.calls[0].input,{projectId:PID,photoId:MID,fileName:'My photo.png',expectedFileName:'progress.png'});
 for(const name of ['Wrong.jpg','a'.repeat(40)+'.png','bad/name.png'])await assert.rejects(f.api.renameHubPhoto(project,photo,name));
 f.hook(async()=>({photo:{...photo,fileName:'My photo.png',caption:'Changed'}}));await assert.rejects(f.api.renameHubPhoto(project,photo,'My photo.png'),/confirm/);
 const late=fixture();late.hook(async()=>{late.expire();return{photo:{...photo,fileName:'My photo.png'}};});await assert.rejects(late.api.renameHubPhoto(project,photo,'My photo.png'),/Session changed/);
});

test('commission chat color defaults and DTO allow only strict normalized hex',()=>{
 assert.equal(model.DEFAULT_REF_SHEET_CHAT_COLOR,'#DEDDD8');
 assert.equal(model.decodeClientHubProject(project).refSheetChatColor,undefined);
 assert.equal(model.decodeClientHubProject({...project,refSheetChatColor:'#abcdef'}).refSheetChatColor,'#ABCDEF');
 for(const color of ['red','#fff','#12345678',' #123456','url(x)',null]) assert.throws(()=>model.decodeClientHubProject({...project,refSheetChatColor:color}));
});
test('shared chat color API sends exact project CAS for both roles and verifies result',async()=>{
 for(const owner of [false,true]) {
  const f=fixture();f.hook(()=>({project:{...project,version:2,refSheetChatColor:'#ABCDEF'}}));
  assert.equal((await f.api.setHubRefSheetChatColor(project,owner,'#abcdef')).refSheetChatColor,'#ABCDEF');
  assert.deepEqual(f.calls,[{name:'tmcHubSetRefSheetChatColor',input:{projectId:PID,expectedVersion:1,color:'#ABCDEF'}}]);
  assert.equal(f.storage.length,0);
 }
});
test('chat color response cannot outlive session or switch commission; invalid inputs never send',async()=>{
 const expired=fixture();expired.hook(()=>{expired.expire();return{project:{...project,version:2,refSheetChatColor:'#ABCDEF'}};});
 await assert.rejects(expired.api.setHubRefSheetChatColor(project,false,'#ABCDEF'),/Session changed/);
 for(const patch of [{clientId:OTHER},{projectId:MID},{version:1},{refSheetChatColor:'#000000'}]) {
  const f=fixture();f.hook(()=>({project:{...project,version:2,refSheetChatColor:'#ABCDEF',...patch}}));
  await assert.rejects(f.api.setHubRefSheetChatColor(project,false,'#ABCDEF'));
 }
 const f=fixture();await assert.rejects(f.api.setHubRefSheetChatColor(project,false,'url(x)'));assert.equal(f.calls.length,0);
 const aborted=fixture(),controller=new AbortController();controller.abort();await assert.rejects(aborted.api.setHubRefSheetChatColor(project,true,'#ABCDEF',controller.signal));assert.equal(aborted.calls.length,0);
});

test('unknown chat color save reconciles by authoritative project read without retrying writes',async()=>{
 const f=fixture();assert.equal((await f.api.readHubRefSheetChatColor(project,false)).projectId,PID);
 assert.deepEqual(f.reads,[{path:`hubProjects/${PID}`}]);assert.equal(f.calls.length,0);
 const expired=fixture();expired.expire();await assert.rejects(expired.api.readHubRefSheetChatColor(project,false),/Session changed/);
 await assert.rejects(f.api.readHubRefSheetChatColor({...project,version:2},false),/changed/);
});
test('0331 reserved Taylor color is rejected before transport, while saved legacy data still decodes',async()=>{const f=fixture();for(const color of ['#7F0011','#7f0011'])await assert.rejects(f.api.setHubRefSheetChatColor(project,false,color),/reserved for Taylor/);assert.equal(f.calls.length,0);assert.equal(model.validateRefSheetChatColor('#7f0011'),'#7F0011');assert.equal(model.decodeClientHubProject({...project,refSheetChatColor:'#7F0011'}).refSheetChatColor,'#7F0011');});
