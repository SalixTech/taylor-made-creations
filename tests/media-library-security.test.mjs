import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';
const load=sourceLoader(),media=load('src/server/dev-media.ts'),auth=load('src/server/taylor-auth.ts'),sharp=appRequire('sharp');
const keys=['NODE_ENV','VERCEL','TMC_DEV_MEDIA_ENABLED','TMC_DEV_MEDIA_DIR'];
const initial=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
let root,png;
before(async()=>{root=await mkdtemp(resolve('trash-fixture-'));png=await sharp({create:{width:4,height:3,channels:3,background:'#3a4587'}}).png().toBuffer();});
beforeEach(()=>{process.env.NODE_ENV='development';delete process.env.VERCEL;delete process.env.TMC_DEV_MEDIA_ENABLED;process.env.TMC_DEV_MEDIA_DIR=join(root,randomUUID());});
after(async()=>{for(const key of keys)if(initial[key]===undefined)delete process.env[key];else process.env[key]=initial[key];await rm(root,{recursive:true,force:true});});
const patch=(body,headers={},url='http://localhost/api/taylor/media')=>new Request(url,{method:'PATCH',headers:{'content-type':'application/json',origin:'http://localhost',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
function routes(verify=async()=>({uid:auth.TAYLOR_OWNER_UID}),adapter=media,published=async()=>({status:'baseline',reason:'not-published'})){
 const l=sourceLoader({'@/server/taylor-auth':{...auth,verifyTaylorOwner:verify},'@/server/dev-media':adapter,'@/server/published-site':{readPublishedSite:published}});
 return {library:l('src/app/api/taylor/media/route.ts'),image:l('src/app/api/media/[id]/route.ts')};
}
const save=()=>media.storeDevelopmentMedia(png,'image/png','Private staged photo');
const metadata=id=>join(process.env.TMC_DEV_MEDIA_DIR,`${id}.photo.json`);

test('Trash is metadata-only, default list hides it, all view recovers it, and repeated trash/restore is idempotent',async()=>{
 const saved=await save(),bytes=await media.readDevelopmentMedia(saved.id),r=routes();
 const response=await r.library.PATCH(patch({id:saved.id,action:'trash'}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
 const body=await response.json();assert.equal(body.media.id,saved.id);assert.ok(body.media.trashedAt);assert.equal(body.media.src,saved.src);
 assert.deepEqual(await media.listDevelopmentMedia(),[]);assert.equal((await media.listDevelopmentMedia(true))[0].trashedAt,body.media.trashedAt);
 const again=await media.setDevelopmentMediaTrash(saved.id,'trash');assert.equal(again.trashedAt,body.media.trashedAt);
 assert.deepEqual(await media.readDevelopmentMedia(saved.id),bytes);
 assert.equal((await stat(metadata(saved.id))).mode&0o777,0o600);
 const restored=await media.setDevelopmentMediaTrash(saved.id.toUpperCase(),'restore');assert.equal(restored.trashedAt,null);assert.equal((await media.listDevelopmentMedia())[0].id,saved.id);
 assert.equal((await media.setDevelopmentMediaTrash(saved.id,'restore')).trashedAt,null);
 assert.deepEqual((await readdir(process.env.TMC_DEV_MEDIA_DIR)).sort(),[`${saved.id}.photo.json`,`${saved.id}.webp`].sort());
});
test('default GET active only and ?trash=1 includes recoverable records, all authenticated/no-store',async()=>{
 const a=await save(),b=await save();await media.setDevelopmentMediaTrash(a.id,'trash');const r=routes();
 const active=await r.library.GET(new Request('http://localhost/api/taylor/media'));assert.equal(active.status,200);assert.deepEqual((await active.json()).photos.map(p=>p.id),[b.id]);
 const all=await r.library.GET(new Request('http://localhost/api/taylor/media?trash=1'));assert.equal(all.status,200);assert.equal((await all.json()).photos.length,2);assert.match(all.headers.get('cache-control'),/private, no-store/);
 for(const query of ['trash=0','trash=true','trash=1&trash=1','path=../../etc/passwd','trash=1&extra=1'])assert.equal((await r.library.GET(new Request(`http://localhost/api/taylor/media?${query}`))).status,400);
});
test('Trash preserves draft object, published reference authorization, private reads, and gallery entries',async()=>{
 const saved=await save(),defaults=load('src/owner/defaults.ts'),model=load('src/owner/model.ts'),draft=defaults.createDefaultOwnerContent();
 draft.home.image.src=saved.src;draft.gallery[0].src=saved.src;const before=JSON.stringify(draft),snapshot=model.createPublishedOwnerSnapshot(draft,1),snapshotBefore=JSON.stringify(snapshot);
 const r=routes(undefined,media,async()=>({status:'published',snapshot}));
 await media.setDevelopmentMediaTrash(saved.id,'trash');assert.equal(JSON.stringify(draft),before);assert.equal(JSON.stringify(snapshot),snapshotBefore);assert.equal(media.publicContentReferencesMedia(snapshot.content,saved.src),true);
 for(const headers of [{},{authorization:'Bearer owner-fixture'}]){const response=await r.image.GET(new Request(`http://localhost${saved.src}`,{headers}),{params:Promise.resolve({id:saved.id})});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await media.readDevelopmentMedia(saved.id));}
});
for(const change of [()=>process.env.NODE_ENV='production',()=>process.env.NODE_ENV='test',()=>process.env.VERCEL='1',()=>process.env.TMC_DEV_MEDIA_ENABLED='false'])test('disabled storage rejects mutation before reading request and remains unavailable',async()=>{
 change();let reads=0,writes=0;const r=routes(undefined,{...media,readMediaTrashRequest:async()=>{reads++;},setDevelopmentMediaTrash:async()=>{writes++;}});
 assert.equal((await r.library.PATCH(patch({id:randomUUID(),action:'trash'}))).status,503);assert.equal(reads,0);assert.equal(writes,0);
 await assert.rejects(media.setDevelopmentMediaTrash(randomUUID(),'trash'),e=>e.status===503);
 const response=await r.library.GET(new Request('http://localhost/api/taylor/media?trash=1'));const body=await response.json();assert.equal(body.available,false);assert.equal(body.storage,null);assert.deepEqual(body.photos,[]);
});
for(const status of [401,403])test(`unauthorized ${status} is rejected before query, body, disk or mutation`,async()=>{
 let touched=0;const r=routes(async()=>{throw new auth.TaylorApiError(status,'Denied');},{...media,listDevelopmentMedia:async()=>{touched++;},readMediaTrashRequest:async()=>{touched++;},setDevelopmentMediaTrash:async()=>{touched++;}});
 for(const response of [await r.library.PATCH(patch('not json')),await r.library.GET(new Request('http://localhost/api/taylor/media?bad=query'))]){assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/private, no-store/);}assert.equal(touched,0);
});
test('real JWT signature gate denies wrong UID, accepts exact owner; certificate fetch is mocked locally',async()=>{
 const jose=appRequire('jose'),pair=generateKeyPairSync('rsa',{modulusLength:2048});const jwtAuth=sourceLoader({jose:{...jose,importX509:async()=>pair.publicKey}})('src/server/taylor-auth.ts');
 const now=Math.floor(Date.now()/1000),jwt=uid=>new jose.SignJWT({aud:jwtAuth.TAYLOR_PROJECT_ID,iss:`https://securetoken.google.com/${jwtAuth.TAYLOR_PROJECT_ID}`,sub:uid,iat:now-10,auth_time:now-20,exp:now+300}).setProtectedHeader({alg:'RS256',kid:'local-trash-test'}).sign(pair.privateKey);
 const saved=await save(),route=sourceLoader({'@/server/taylor-auth':jwtAuth,'@/server/dev-media':media})('src/app/api/taylor/media/route.ts'),original=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(url,'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');return Response.json({'local-trash-test':'-----BEGIN CERTIFICATE-----\nlocal-test-only\n-----END CERTIFICATE-----'},{headers:{'cache-control':'max-age=0'}});};
 try{assert.equal((await route.PATCH(patch({id:saved.id,action:'trash'}))).status,401);assert.equal((await route.PATCH(patch({id:saved.id,action:'trash'},{authorization:`Bearer ${await jwt('wrong-owner')}`}))).status,403);assert.equal((await media.listDevelopmentMedia()).length,1);assert.equal((await route.PATCH(patch({id:saved.id,action:'trash'},{authorization:`Bearer ${await jwt(jwtAuth.TAYLOR_OWNER_UID)}`}))).status,200);assert.equal((await media.listDevelopmentMedia()).length,0);}finally{globalThis.fetch=original;}
});
test('request validation rejects traversal, extra metadata, purge and malformed types without changing stored photos',async()=>{
 const saved=await save(),r=routes(),before=await readFile(metadata(saved.id));
 const invalid=[null,[],{},'bad json',{id:saved.id,action:'purge'},{id:saved.id,action:'delete'},{id:'../secret',action:'trash'},{id:'../../etc/passwd',action:'restore'},{id:`${saved.id}.photo.json`,action:'trash'},{id:saved.id,action:'trash',trashedAt:null},{id:saved.id,action:'trash',src:'/api/media/else'},{id:saved.id,action:'trash',path:'../../outside'},{id:42,action:'trash'}];
 for(const body of invalid)assert.equal((await r.library.PATCH(patch(body))).status,400,JSON.stringify(body));
 assert.equal((await r.library.PATCH(patch({id:saved.id,action:'trash'},{origin:'https://evil.example'}))).status,403);
 assert.equal((await r.library.PATCH(patch({id:saved.id,action:'trash'},{'content-type':'text/plain'}))).status,415);
 assert.deepEqual(await readFile(metadata(saved.id)),before);
 for(const id of ['../secret','',`${saved.id}.webp`])await assert.rejects(media.setDevelopmentMediaTrash(id,'trash'),e=>e.status===400);
 await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'purge'),e=>e.status===400);
});
test('mutation body enforces actual byte bound, content-length validity, completion and stream cancellation',async()=>{
 for(const length of ['-1','NaN','1.2','513','999999999999999999999'])await assert.rejects(media.readMediaTrashRequest(patch({id:randomUUID(),action:'trash'},{'content-length':length})),e=>e.status===413);
 await assert.rejects(media.readMediaTrashRequest(patch({id:randomUUID(),action:'trash'},{'content-length':'1'})),e=>e.status===400);
 await assert.rejects(media.readMediaTrashRequest(new Request('http://localhost/api/taylor/media',{method:'PATCH',headers:{'content-type':'application/json'}})),e=>e.status===400);
 let canceled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(512));c.enqueue(new Uint8Array(1));},cancel(){canceled=true;}});
 await assert.rejects(media.readMediaTrashRequest(new Request('http://localhost/api/taylor/media',{method:'PATCH',duplex:'half',headers:{'content-type':'application/json','content-length':'1'},body})),e=>e.status===413);assert.equal(canceled,true);
});
test('metadata projection strips extra private fields; mutation never accepts or persists arbitrary metadata',async()=>{
 const saved=await save();await writeFile(metadata(saved.id),JSON.stringify({...saved,privateSecret:'NEVER_RETURN',draft:{secret:'NO'},__protoValue:'hidden'}));
 const listed=await media.listDevelopmentMedia();assert.deepEqual(listed,[saved]);assert.ok(!JSON.stringify(listed).includes('NEVER_RETURN'));
 const changed=await media.setDevelopmentMediaTrash(saved.id,'trash');assert.ok(!JSON.stringify(changed).includes('NEVER_RETURN'));assert.ok(!(await readFile(metadata(saved.id),'utf8')).includes('NEVER_RETURN'));
});
test('invalid sidecars and missing bytes fail closed; normal list skips them without leaking contents',async()=>{
 const saved=await save();for(const changes of [{trashedAt:'yesterday'},{trashedAt:12},{createdAt:'invalid'},{width:-1},{height:20001},{bytes:1.5},{id:randomUUID()},{src:'/secret'},{name:'a'.repeat(151)}]){await writeFile(metadata(saved.id),JSON.stringify({...saved,...changes}));assert.deepEqual(await media.listDevelopmentMedia(true),[]);await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===404);}
 await writeFile(metadata(saved.id),'x'.repeat(4097));assert.deepEqual(await media.listDevelopmentMedia(true),[]);await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===404);
 await writeFile(metadata(saved.id),JSON.stringify(saved));await rm(join(process.env.TMC_DEV_MEDIA_DIR,`${saved.id}.webp`));await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===404);
});
test('sidecar and bytes symlinks are rejected without modifying outside files',async()=>{
 const saved=await save(),outside=join(root,randomUUID());await writeFile(outside,JSON.stringify(saved));await rm(metadata(saved.id));await symlink(outside,metadata(saved.id));
 await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===404);assert.equal(await readFile(outside,'utf8'),JSON.stringify(saved));assert.deepEqual(await media.listDevelopmentMedia(true),[]);
 await rm(metadata(saved.id));await writeFile(metadata(saved.id),JSON.stringify(saved));const bytes=join(process.env.TMC_DEV_MEDIA_DIR,`${saved.id}.webp`),original=await readFile(bytes),outsideBytes=join(root,randomUUID());await writeFile(outsideBytes,original);await rm(bytes);await symlink(outsideBytes,bytes);
 await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===404);assert.deepEqual(await readFile(outsideBytes),original);
});
test('same-photo concurrent actions serialize, lists see complete records, and bytes never change',async()=>{
 const saved=await save(),bytes=await media.readDevelopmentMedia(saved.id);const jobs=Array.from({length:20},(_,n)=>media.setDevelopmentMediaTrash(saved.id,n%2?'restore':'trash'));
 const reads=Promise.all(Array.from({length:20},async()=>{assert.equal((await media.listDevelopmentMedia(true)).length,1);assert.equal(JSON.parse(await readFile(metadata(saved.id),'utf8')).id,saved.id);}));
 const responses=await Promise.all(jobs);await reads;for(let n=0;n<responses.length;n++)assert.equal(!!responses[n].trashedAt,n%2===0);
 await media.setDevelopmentMediaTrash(saved.id,'restore');assert.equal((await media.listDevelopmentMedia()).length,1);assert.deepEqual(await media.readDevelopmentMedia(saved.id),bytes);assert.equal((await readdir(process.env.TMC_DEV_MEDIA_DIR)).length,2);
});
test('a second process cannot race an existing private lock or follow its symlink',async()=>{
 const saved=await save(),lock=join(process.env.TMC_DEV_MEDIA_DIR,`${saved.id}.photo.lock`),outside=join(root,randomUUID());await writeFile(outside,'keep');await symlink(outside,lock);
 await assert.rejects(media.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===409);assert.equal(await readFile(outside,'utf8'),'keep');assert.equal((await fs.lstat(lock)).isSymbolicLink(),true);assert.equal((await media.listDevelopmentMedia()).length,1);
 await rm(lock);let release,entered;const seen=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const slow=sourceLoader({'node:fs/promises':{...fs,rename:async(...args)=>{entered();await gate;return fs.rename(...args);}}})('src/server/dev-media.ts');
 const first=slow.setDevelopmentMediaTrash(saved.id,'trash');await seen;const otherProcess=sourceLoader()('src/server/dev-media.ts');await assert.rejects(otherProcess.setDevelopmentMediaTrash(saved.id,'restore'),e=>e.status===409);assert.equal((await media.listDevelopmentMedia()).length,1);release();await first;await otherProcess.setDevelopmentMediaTrash(saved.id,'restore');assert.equal((await media.listDevelopmentMedia()).length,1);
});
test('failed atomic metadata replace retains prior record and bytes, cleans temp/lock, and can retry',async()=>{
 const saved=await save(),before=await readFile(metadata(saved.id)),bytes=await media.readDevelopmentMedia(saved.id);
 const failed=sourceLoader({'node:fs/promises':{...fs,rename:async()=>{throw Error('simulated disk replace failure');}}})('src/server/dev-media.ts');
 await assert.rejects(failed.setDevelopmentMediaTrash(saved.id,'trash'),e=>e.status===503);assert.deepEqual(await readFile(metadata(saved.id)),before);assert.deepEqual(await media.readDevelopmentMedia(saved.id),bytes);assert.equal((await readdir(process.env.TMC_DEV_MEDIA_DIR)).length,2);await media.setDevelopmentMediaTrash(saved.id,'trash');assert.equal((await media.listDevelopmentMedia()).length,0);
});
