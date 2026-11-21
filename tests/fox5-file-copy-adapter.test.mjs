import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const C='TMC-0000000000000001',P='00000000-0000-4000-8000-000000000001',F='00000000-0000-4000-8000-000000000002',ISO='2026-10-28T00:00:00.000Z',project={clientId:C,projectId:P};
function fixture(){let valid=true,clears=0,response,hook;const calls=[],session={auth:{app:{}},session:{clientId:C},assertCurrent(){if(!valid)throw Error('Session changed');}};
 const load=sourceLoader({'./client':{CLIENT_HUB_FUNCTIONS_REGION:'us-central1',ClientHubError:class extends Error{},verifiedClientHubConnection:async()=>session},'./callable-owner-session':{hubCallableOwnerSession:async()=>session},'./private-photo-cache':{clearHubPhotoCache(){clears++;}},'firebase/functions':{getFunctions:()=>({}),httpsCallable:(_functions,name)=>async input=>{calls.push({name,input});await hook?.();return{data:response??(name==='tmcHubDeleteFileCopy'?{...input,deleted:true,deletedAt:ISO,cleanupEligible:false,physicalCleanupEnabled:false}:{verified:true,files:input.files})};}}});
 return{api:load('src/client-hub/file-copy-client.ts'),calls,clears:()=>clears,response:value=>{response=value;},hook:value=>{hook=value;},expire:()=>{valid=false;}};
}
test('delete adapter submits only own-file scope and clears cached photos only after verified non-purge acknowledgement',async()=>{
 const f=fixture();const result=await f.api.deleteHubFileCopy(project,false,{kind:'photo',fileId:F,role:'owner',clientId:'forged'});
 assert.deepEqual(f.calls,[{name:'tmcHubDeleteFileCopy',input:{projectId:P,kind:'photo',fileId:F}}]);assert.equal(result.deleted,true);assert.equal(f.clears(),1);
 for(const patch of [{fileId:P},{kind:'attachment'},{deleted:false},{deletedAt:'yesterday'},{physicalCleanupEnabled:true}]){const g=fixture();g.response({kind:'photo',fileId:F,deleted:true,deletedAt:ISO,cleanupEligible:false,physicalCleanupEnabled:false,...patch});await assert.rejects(g.api.deleteHubFileCopy(project,false,{kind:'photo',fileId:F}));assert.equal(g.clears(),0);}
});
test('final verifier binds every returned file and rejects cancelled or superseded preparation',async()=>{
 const files=[{kind:'photo',fileId:F}],f=fixture();await f.api.verifyHubFileCopies(project,false,files);assert.deepEqual(f.calls[0].input,{projectId:P,files});
 const mismatch=fixture();mismatch.response({verified:true,files:[{kind:'photo',fileId:P}]});await assert.rejects(mismatch.api.verifyHubFileCopies(project,false,files));
 const expired=fixture();expired.hook(()=>expired.expire());await assert.rejects(expired.api.verifyHubFileCopies(project,true,files),/Session changed/);
 const cancelled=fixture(),controller=new AbortController();cancelled.hook(()=>controller.abort());await assert.rejects(cancelled.api.verifyHubFileCopies(project,false,files,controller.signal),{name:'AbortError'});
});
