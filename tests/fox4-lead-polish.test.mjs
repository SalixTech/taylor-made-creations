import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sourceLoader } from './scout-source-loader.mjs';
const load=sourceLoader();
const themes=load('src/components/theme-settings.ts');
test('theme settings exact schemas and independently inherited area modes',()=>{
 const defaults=themes.decodeThemePreferences({schemaVersion:1,revision:1,defaultMode:'dark',modes:{public:'inherit',owner:'light',hub:'inherit'}},true);
 assert.equal(themes.resolveThemeMode('hub',defaults),'dark');assert.equal(themes.resolveThemeMode('owner',defaults),'light');
 assert.equal(themes.resolveThemeMode('hub',defaults,{hub:'light'}),'light');
 for(const bad of [{...defaults,token:'secret'},{...defaults,revision:NaN},{...defaults,modes:{public:'dark',owner:'light'}},{...defaults,modes:{public:'dark',owner:'light',hub:'url(javascript:x)'}}])assert.throws(()=>themes.decodeThemePreferences(bad,true));
 assert.throws(()=>themes.decodeThemePreferences(defaults));
});
test('prepaint bootstrap respects area preference without auth or untrusted script text',()=>{
 const {themeBootstrap}=load('src/components/theme-bootstrap.ts');const script=themeBootstrap(themes.initialThemeDefaults(),{}),root={dataset:{},style:{}};let expiry;
 vm.runInNewContext(script,{location:{pathname:'/client-hub'},document:{documentElement:root},localStorage:{getItem:k=>k==='tmc-display-areas-v1'?'{"hub":"dark","public":"light"}':null},setTimeout:fn=>{expiry=fn;}});
 assert.equal(root.style.backgroundColor,'#18181b');assert.equal(root.dataset.tmcThemePending,'dark');expiry();assert.equal(root.dataset.tmcThemePending,undefined);
 assert.doesNotMatch(script,/signIn|signOut|Firebase|token|fetch\(/);
});
test('owner media cache always reauthorizes, deduplicates bytes, and refuses stale/offline reuse',async t=>{
 const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original; api.clearOwnerMediaCache();});
 const api=sourceLoader()('src/owner/private-media-cache.ts');let valid=true,generation='123',byteReads=0,metadataReads=0,fail=false;
 const user={uid:'owner'},session={token:'test',auth:{currentUser:user,onAuthStateChanged(){return()=>{};}},assertCurrent(){if(!valid)throw Error('changed');}};
 globalThis.fetch=async url=>{if(String(url).includes('cloud-media-check')){metadataReads++;if(fail)return new Response('{}',{status:403});return Response.json({ok:true,generation,bytes:3,contentType:'image/webp'});}byteReads++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});};
 const src='/api/cloud-media/11111111-1111-4111-8111-111111111111', signal=new AbortController().signal;
 await api.loadOwnerPrivateMedia(src,session,signal);assert.equal(byteReads,1);assert.equal(metadataReads,2);
 await api.loadOwnerPrivateMedia(src,session,signal);assert.equal(byteReads,1);assert.equal(metadataReads,3);
 generation='124';await api.loadOwnerPrivateMedia(src,session,signal);assert.equal(byteReads,2);
 fail=true;await assert.rejects(api.loadOwnerPrivateMedia(src,session,signal));assert.equal(byteReads,2);
 valid=false;await assert.rejects(api.loadOwnerPrivateMedia(src,session,signal));
});
test('private media endpoint returns only bounded generation descriptor, never raw token metadata',async t=>{
 const old=globalThis.fetch, oldProject=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,oldBucket=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
 t.after(()=>{globalThis.fetch=old;if(oldProject===undefined)delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID=oldProject;if(oldBucket===undefined)delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;else process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=oldBucket;});
 process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID='taylor-made-creations';process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='taylor-made-creations.firebasestorage.app';
 const real=sourceLoader()('src/server/taylor-auth.ts');let allowed=true,mode='ok',calls=0;
 const {readOwnerCloudPhotoMetadata:read}=sourceLoader({'./taylor-auth':{...real,verifyTaylorOwner:async()=>{if(!allowed)throw new real.TaylorApiError(403,'Denied');}}})('src/server/cloud-files.ts');
 const id='11111111-1111-4111-8111-111111111111';globalThis.fetch=async()=>{calls++;return Response.json({name:`photos/${id}.webp`,bucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,generation:'123',size:'3',contentType:mode==='wrong'?'text/html':'image/webp',downloadTokens:'NEVERRETURN',metadata:{fileId:id,firebaseStorageDownloadTokens:'NEVERRETURN'}});};
 const req=()=>new Request(`https://example.com/api/taylor/cloud-media-check/${id}`,{headers:{Authorization:'Bearer fixture'}});
 let result=await read(req(),id);assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true,generation:'123',bytes:3,contentType:'image/webp'});
 mode='wrong';assert.equal((await read(req(),id)).status,502);allowed=false;const prior=calls;assert.equal((await read(req(),id)).status,403);assert.equal(calls,prior);
});
test('inventory scan separates read-only finder from explicit Add Inventory editing',()=>{
 const s=fs.readFileSync(new URL('../src/owner/OwnerInventory.tsx',import.meta.url),'utf8');
 assert.match(s,/finderOpen && finderMode === "add"/);assert.match(s,/setHighlightId\(match.id\)/);assert.match(s,/scrollIntoView/);assert.match(s,/>Add Inventory</);assert.match(s,/title="Barcode not found"/);assert.match(s,/>Add Item</);assert.match(s,/Manage inventory choices/);
});
const later=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('owner media concurrent reads share bytes, isolate consumer aborts and recheck final generation',async t=>{
 const original=globalThis.fetch,api=sourceLoader()('src/owner/private-media-cache.ts');t.after(()=>{globalThis.fetch=original;api.clearOwnerMediaCache();});
 const user={uid:'owner'},session={token:'fixture',auth:{currentUser:user,onAuthStateChanged(){return()=>{};}},assertCurrent(){assert.equal(this.auth.currentUser,user);}};
 let bytes=0,generation='10';const gate=deferred();globalThis.fetch=async url=>{if(String(url).includes('check'))return Response.json({ok:true,generation,bytes:3,contentType:'image/webp'});bytes++;await gate.promise;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});};
 const src='/api/cloud-media/11111111-1111-4111-8111-111111111111',a=new AbortController(),b=new AbortController();
 const one=api.loadOwnerPrivateMedia(src,session,a.signal),two=api.loadOwnerPrivateMedia(src,session,b.signal);const rejected=assert.rejects(one,{name:'AbortError'});await later();assert.equal(bytes,1);a.abort();gate.resolve();await rejected;assert.equal((await two).size,3);assert.equal(bytes,1);
 generation='11';const changed=deferred();globalThis.fetch=async url=>{if(String(url).includes('check'))return Response.json({ok:true,generation,bytes:3,contentType:'image/webp'});await changed.promise;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});};
 const pending=api.loadOwnerPrivateMedia(src,session,b.signal);const fail=assert.rejects(pending,/changed while loading/);await later();generation='12';changed.resolve();await fail;
});
test('owner media old-account rejection cannot purge a newer account cache',async t=>{
 const original=globalThis.fetch,api=sourceLoader()('src/owner/private-media-cache.ts');t.after(()=>{globalThis.fetch=original;api.clearOwnerMediaCache();});
 const oldUser={uid:'same'},newUser={uid:'same'},auth={currentUser:oldUser,onAuthStateChanged(){return()=>{};}},gate=deferred();let byteReads=0;
 const session=user=>({token:user===oldUser?'old':'new',auth,assertCurrent(){if(auth.currentUser!==user)throw Error('changed');}});
 globalThis.fetch=async(url,opts)=>{if(opts.headers.Authorization==='Bearer old'){await gate.promise;throw Error('late denied');}if(String(url).includes('check'))return Response.json({ok:true,generation:'12',bytes:3,contentType:'image/webp'});byteReads++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});};
 const src='/api/cloud-media/11111111-1111-4111-8111-111111111111',signal=new AbortController().signal;const old=api.loadOwnerPrivateMedia(src,session(oldUser),signal);const failure=assert.rejects(old);await later();auth.currentUser=newUser;await api.loadOwnerPrivateMedia(src,session(newUser),signal);gate.resolve();await failure;await api.loadOwnerPrivateMedia(src,session(newUser),signal);assert.equal(byteReads,1);
});
test('owner media bounds distinct in-flight transfers to two without starving queued reads',async t=>{
 const original=globalThis.fetch,api=sourceLoader()('src/owner/private-media-cache.ts');t.after(()=>{globalThis.fetch=original;api.clearOwnerMediaCache();});
 const user={uid:'owner'},session={token:'fixture',auth:{currentUser:user,onAuthStateChanged(){return()=>{};}},assertCurrent(){}},gates=[deferred(),deferred(),deferred()];let active=0,max=0,reads=0;
 globalThis.fetch=async url=>{if(String(url).includes('check'))return Response.json({ok:true,generation:'12',bytes:3,contentType:'image/webp'});const i=reads++;active++;max=Math.max(max,active);await gates[i].promise;active--;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/webp'}});};
 const tasks=[1,2,3].map(n=>api.loadOwnerPrivateMedia(`/api/cloud-media/${n}1111111-1111-4111-8111-111111111111`,session,new AbortController().signal));await later();assert.equal(reads,2);gates[0].resolve();await tasks[0];await later();assert.equal(reads,3);gates[1].resolve();gates[2].resolve();await Promise.all(tasks);assert.equal(max,2);
});
test('display-default editor serializes refresh/save, keeps failed edits and saves exact revision',async t=>{
 const {harness,content,nodes}=await import('./owner-ui-harness.mjs');const h=harness();t.after(()=>h.unmount());let reads=0,writes=[];const readGate=deferred(),saveGate=deferred();let first=true;
 h.overrides['@/components/theme-settings-client']={readSiteTheme:async()=>{reads++;return first?(first=false,themes.initialThemeDefaults()):readGate.promise;},saveSiteTheme:async(before,draft)=>{writes.push({before,draft});return saveGate.promise;}};
 h.overrides['@/components/theme-runtime']={applySiteThemeDefaults(){}};
 const C=h.load('src/owner/StudioThemeSettings.tsx').StudioThemeSettings,render=()=>h.render(C,{});render();await later();render();
 const select=()=>h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Global default'),save=()=>h.find(n=>n.type==='button'&&content(n)==='Save');select().props.onChange('dark');render();
 h.find(n=>n.type?.name==='RefreshButton').props.onClick();save().props.onClick();render();assert.equal(writes.length,0);assert.equal(reads,2);assert.equal(h.find(n=>n.type==='fieldset').props.disabled,true);
 readGate.resolve({...themes.initialThemeDefaults(),revision:3});await later();render();select().props.onChange('dark');render();save().props.onClick();save().props.onClick();render();assert.equal(writes.length,1);assert.equal(writes[0].before.revision,3);assert.equal(writes[0].draft.defaultMode,'dark');
 saveGate.reject(Error('changed elsewhere'));await later();render();assert.match(content(h.tree),/changed elsewhere/);assert.equal(select().props.value,'dark');assert.equal(h.find(n=>n.type==='fieldset').props.disabled,false);assert.equal(nodes(h.tree).filter(n=>n.props?.role==='alert').length,1);
});
test('prepaint account cosmetic hint is role-bound, strict and subordinate to current defaults for inherit',()=>{
 const {themeBootstrap}=load('src/components/theme-bootstrap.ts'),script=themeBootstrap(themes.initialThemeDefaults(),{});
 const run=(pathname,role,modes)=>{const root={dataset:{},style:{}};vm.runInNewContext(script,{location:{pathname},document:{documentElement:root},localStorage:{getItem:()=>null},sessionStorage:{getItem:k=>k.endsWith('role-v1')?role:JSON.stringify({role,modes})},setTimeout(){}});return root.style.colorScheme;};
 const dark={public:'dark',owner:'dark',hub:'dark'};assert.equal(run('/gallery','client',dark),'dark');assert.equal(run('/client-hub','client',dark),'dark');assert.equal(run('/taylor/live-preview','client',{...dark,owner:'light'}),'dark','client theme never changes owner preview');assert.equal(run('/gallery','owner',{...dark,public:'inherit'}),'light');assert.equal(run('/gallery','client',{...dark,token:'unsafe'}),'light');
});
