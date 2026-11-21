import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(), paths=load('src/owner/website-workspace.ts'), {websiteDeployment}=load('src/server/website-deployment.ts');
test('fixed workspace names preserve legacy paths and reject foreign business data or path injection',()=>{
 for(const path of ['ownerWorkspace/current','site/published','ownerDrafts/example','ownerFiles/example','ownerRecoveryVersions/example']){assert.equal(paths.websiteDocumentPath('main',path),path);assert.equal(paths.websiteDocumentPath('beta',path),'websiteWorkspaces/beta/'+path);}
 for(const path of ['hubProjects/x','paypalInvoices/x','site/theme','../ownerWorkspace/current','site/published?workspace=main','websiteWorkspaces/main/site/published','/ownerFiles/x'])assert.throws(()=>paths.websiteDocumentPath('beta',path));
 for(const scope of [undefined,null,'Beta','main/../beta','production'])assert.throws(()=>paths.requireWebsiteWorkspace(scope));
 assert.equal(paths.websiteStoragePath('beta','photos/abc.webp'),'website-workspaces/beta/photos/abc.webp');assert.throws(()=>paths.websiteStoragePath('beta','hub/x'));
});
test('exact host/deployment agreement fails closed and does not grant auth',()=>{
 for(const host of ['beta.taylormadecreations.dog','build.taylormadecreations.dog']){assert.throws(()=>websiteDeployment(host,'main','main'));assert.throws(()=>websiteDeployment(host,'beta','main'));assert.equal(websiteDeployment(host,'beta','beta').workspace,'beta');}
 for(const host of [null,'localhost:3000','sitebuilder.taylormadecreations.dog','beta.taylormadecreations.dog.evil','beta.taylormadecreations.dog:443','taylormadecreations.dog'])assert.throws(()=>websiteDeployment(host,'beta','beta'));
 assert.equal(websiteDeployment('taylormadecreations.dog','main','main').workspace,'main');
});
test('beta proxy rewrites nested and RSC pages before legacy loaders and denies unrelated APIs/optimizer',()=>{
 const responses={next:()=>({next:true}),rewrite:(url,options)=>({url:url.toString(),options})};
 class FakeResponse{constructor(body,options){Object.assign(this,{body,...options})}static next=responses.next;static rewrite=responses.rewrite;}
 const {proxy}=sourceLoader({'next/server':{NextResponse:FakeResponse},'./server/website-deployment':{websiteDeployment:()=>({workspace:'beta',builder:false})}})('src/proxy.ts');
 const request=path=>({headers:new Headers({host:'beta.taylormadecreations.dog',RSC:'1'}),nextUrl:Object.assign(new URL('https://beta.taylormadecreations.dog'+path),{clone(){return new URL(this)}})});
 for(const path of ['/','/client-hub','/taylor/services','/prices?_rsc=abc'])assert.match(proxy(request(path)).url,/\/website-workspace-entry/);
 for(const path of ['/api/media/x','/api/fonts/x','/api/site-published','/api/site-theme','/api/taylor/services','/api/dev-preview/product-image','/_next/image'])assert.equal(proxy(request(path)).status,404,path);
 assert.deepEqual(proxy(request('/api/beta-publication')),{next:true});
});
test('beta server publication never reads main data without bearer owner verification',async()=>{
 const original=globalThis.fetch;let fetches=0;
 const real=load('src/server/taylor-auth.ts');
 const server=sourceLoader({'./website-deployment':{websiteDeployment:()=>({workspace:'beta'})},'./taylor-auth':{...real,verifyTaylorOwner:async()=>{throw new real.TaylorApiError(401,'Sign in')}}})('src/server/beta-publication.ts');
 try{globalThis.fetch=async()=>{fetches++;throw Error('unexpected')};const result=await server.readBetaPublication(new Request('https://beta.taylormadecreations.dog/api/beta-publication'));assert.equal(result.status,401);assert.equal(fetches,0);assert.match(result.headers.get('cache-control'),/no-store/);}finally{globalThis.fetch=original;}
});
test('beta legacy media proxy denies all reads before direct Storage, including authenticated callers',async()=>{
 const original=globalThis.fetch;let reads=0;
 const server=sourceLoader({'./website-deployment':{websiteDeployment:()=>({workspace:'beta'})}})('src/server/cloud-files.ts');
 const id='11111111-1111-4111-8111-111111111111';
 try{globalThis.fetch=async()=>{reads++;throw Error('no direct Storage')};for(const authorization of [undefined,'Bearer fixture']){const request=new Request('https://beta.taylormadecreations.dog/api/cloud-media/'+id,{headers:authorization?{authorization}:{}});assert.equal((await server.readCloudFileResponse(request,id,'photo')).status,403);}assert.equal(reads,0);}finally{globalThis.fetch=original;}
});
test('beta browser persistence, recovery and events do not collide with main and invalid env fails closed',()=>{
 const key='NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE',old=process.env[key];
 try{
  delete process.env[key];const main=sourceLoader(),mainConfig=main('src/owner/website-workspace-config.ts'),identity={projectId:'taylor-made-creations',ownerUid:'a4ARjp0z8ZOByKlC2AfGzmMRj843'};
  const mainPrefix=main('src/owner/draft-recovery.ts').recoveryPrefix(identity);
  assert.equal(mainConfig.workspaceBrowserKey('legacy-key'),'legacy-key');assert.deepEqual(mainConfig.workspaceCallableInput({value:1}),{value:1});assert.throws(()=>mainConfig.assertBrowserWorkspaceHost('beta.taylormadecreations.dog'));
  process.env[key]='beta';const beta=sourceLoader(),config=beta('src/owner/website-workspace-config.ts');assert.equal(config.workspaceDocument('ownerWorkspace/current'),'websiteWorkspaces/beta/ownerWorkspace/current');assert.deepEqual(config.workspaceCallableInput({value:1}),{value:1,workspace:'beta'});
  assert.notEqual(beta('src/owner/draft-recovery.ts').recoveryPrefix(identity),mainPrefix);assert.equal(beta('src/owner/storage.ts').OWNER_DATABASE_NAME,'tmc-beta:tmc-owner-local-preview-v1');assert.throws(()=>config.assertBrowserWorkspaceHost('taylormadecreations.dog'));config.assertBrowserWorkspaceHost('build.taylormadecreations.dog');
  process.env[key]='unknown';assert.throws(()=>sourceLoader()('src/owner/website-workspace-config.ts'));
 }finally{if(old===undefined)delete process.env[key];else process.env[key]=old;}
});
test('temporary Vercel preview accepts only explicit exact distinct configured hosts',()=>{
 const {websiteHostRole}=load('src/owner/website-hosts.ts');
 assert.equal(websiteHostRole('tmc-beta-test.vercel.app','tmc-beta-test.vercel.app','tmc-build-test.vercel.app'),'beta');
 assert.equal(websiteHostRole('tmc-build-test.vercel.app','tmc-beta-test.vercel.app','tmc-build-test.vercel.app'),'build');
 assert.equal(websiteHostRole('attacker.vercel.app','tmc-beta-test.vercel.app','tmc-build-test.vercel.app'),null);
 for(const invalid of ['*.vercel.app','https://tmc.vercel.app','tmc.vercel.app/path','tmc.vercel.app:443','taylormadecreations.dog','beta.taylormadecreations.dog'])assert.throws(()=>websiteHostRole('example',invalid,''));
 assert.throws(()=>websiteHostRole('same.vercel.app','same.vercel.app','same.vercel.app'));
});
test('authorized beta publication reads only the projected beta document and returns private authenticated response',async()=>{
 const original=globalThis.fetch;let seen,verified=0;
 const snapshot=load('src/owner/model.ts').createPublishedOwnerSnapshot(load('src/owner/defaults.ts').createDefaultOwnerContent(),1);
 const encoded={fields:{schemaVersion:{integerValue:'1'},revision:{integerValue:'1'},payload:{stringValue:JSON.stringify(snapshot)}}};
 const real=load('src/server/taylor-auth.ts');
 const api=sourceLoader({'./website-deployment':{websiteDeployment:()=>({workspace:'beta'})},'./taylor-auth':{...real,verifyTaylorOwner:async()=>{verified++}}})('src/server/beta-publication.ts');
 try{globalThis.fetch=async(url,options)=>{assert.equal(verified,1);seen={url,options};return Response.json(encoded)};const response=await api.readBetaPublication(new Request('https://beta.taylormadecreations.dog/api/beta-publication',{headers:{authorization:'Bearer fixture'}}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{snapshot});assert.match(seen.url,/\/websiteWorkspaces\/beta\/site\/published$/);assert.equal(seen.options.headers.Authorization,'Bearer fixture');assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.redirect,'error');assert.match(response.headers.get('vary'),/Authorization/);assert.match(response.headers.get('cache-control'),/private, no-store/);}finally{globalThis.fetch=original;}
});
test('beta SSR readers never fetch or substitute main publication, theme, or bundled baseline',async()=>{
 const server=process.env.TMC_WEBSITE_WORKSPACE,browser=process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE;let calls=0;const fetcher=async()=>{calls++;throw Error('must not read main')};
 try{process.env.TMC_WEBSITE_WORKSPACE='beta';process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE='beta';const site=load('src/server/published-site.ts');assert.deepEqual(await site.readPublishedSite({projectId:'taylor-made-creations',fetcher}),{status:'locked'});const theme=load('src/server/site-theme.ts');await theme.readPublicTheme({projectId:'taylor-made-creations',fetcher});assert.equal(calls,0);}finally{for(const [key,value]of [['TMC_WEBSITE_WORKSPACE',server],['NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE',browser]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('actual beta Firebase store reads and recovery callables are scoped while legacy main remains unchanged',async()=>{
 const key='NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE',old=process.env[key];
 try{for(const workspace of ['main','beta']){process.env[key]=workspace;const refs=[],calls=[],db={},user={uid:'a4ARjp0z8ZOByKlC2AfGzmMRj843',getIdToken:async()=> 'fixture'},auth={currentUser:null,app:{}};auth.currentUser=user;
 const modules=sourceLoader({'firebase/firestore/lite':{doc:(_db,...parts)=>{const path=parts.join('/');refs.push(path);return {path}},getDoc:async()=>({exists:()=>false}),collection:()=>({}),getDocs:async()=>({docs:[]}),runTransaction:async()=>{throw Error('No test writes')}},'firebase/functions':{getFunctions:()=>({}),httpsCallable:(_f,name)=>async input=>{calls.push({name,input});return {data:{entries:[]}}}}});
 const store=modules('src/owner/firebase-store.ts').createFirebaseOwnerStore({db,auth,ownerUid:'a4ARjp0z8ZOByKlC2AfGzmMRj843'});await store.load();await store.recovery.listRecovery();store.dispose();assert.equal(refs[0],workspace==='beta'?'websiteWorkspaces/beta/ownerWorkspace/current':'ownerWorkspace/current');assert.deepEqual(calls,[{name:'tmcOwnerListRecovery',input:workspace==='beta'?{workspace:'beta'}:{}}]);
 }}finally{if(old===undefined)delete process.env[key];else process.env[key]=old;}
});
test('server and bundled optional preview hosts must agree before any workspace is selected',()=>{
 const keys=['TMC_BETA_PREVIEW_HOST','NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST','TMC_BUILD_PREVIEW_HOST','NEXT_PUBLIC_TMC_BUILD_PREVIEW_HOST'],previous=keys.map(key=>process.env[key]);
 try{for(const key of keys)delete process.env[key];process.env.TMC_BETA_PREVIEW_HOST='temporary-beta.vercel.app';assert.throws(()=>websiteDeployment('temporary-beta.vercel.app','beta','beta'),/does not match/);process.env.NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST='temporary-beta.vercel.app';assert.deepEqual(websiteDeployment('temporary-beta.vercel.app','beta','beta'),{workspace:'beta',builder:false});assert.throws(()=>websiteDeployment('temporary-beta.vercel.app','main','main'));assert.throws(()=>websiteDeployment('other.vercel.app','beta','beta'));}finally{keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index]})}
});
test('beta storage diagnostic confirms only Firestore read, never attempts denied direct Storage or claims gateway success',async()=>{
 const calls=[],session={db:{},auth:{app:{options:{storageBucket:'taylor-made-creations.firebasestorage.app'}}},assertCurrent(){}};
 const config={WEBSITE_WORKSPACE:'beta',workspaceDocument:path=>'websiteWorkspaces/beta/'+path,workspaceObject:path=>'website-workspaces/beta/'+path,workspaceBrowserKey:key=>'beta:'+key,workspaceCallableInput:input=>({...input,workspace:'beta'})};
 const api=sourceLoader({'./website-workspace-config':config,'./taylor-services-client':{taylorOwnerSession:async()=>session},'./asset-library-client':{notifyPrivateAssetLibraryChanged(){}},'firebase/firestore/lite':{collection:(_db,path)=>({path}),getDocs:async ref=>{calls.push(ref.path);return {docs:[]}}},'firebase/storage':{getStorage:()=>({}),ref:()=>{throw Error('Direct Storage must not be attempted')}}})('src/owner/cloud-files-client.ts');
 const result=await api.checkCloudStorage();assert.deepEqual(calls,['websiteWorkspaces/beta/ownerFiles']);assert.match(result,/file-list read succeeded/i);assert.match(result,/direct Storage.*disabled/i);assert.match(result,/gateway.*(?:only|unverified)|only.*gateway/i);assert.doesNotMatch(result,/gateway (?:read|upload|download) succeeded/i);
});
