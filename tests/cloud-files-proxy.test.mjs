import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('cloud proxy never grants private reads, forwards no public token, bounds streams and fails closed',async()=>{
 const originalFetch=globalThis.fetch, bucket=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, project=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
 const realAuth=sourceLoader()('src/server/taylor-auth.ts');
 let fetches=0,seen,mode='ok',canceled=false;
 const {readCloudFileResponse:read}=sourceLoader({'./taylor-auth':{...realAuth,verifyTaylorOwner:async req=>{if(req.headers.get('authorization')!=='Bearer fixture')throw new realAuth.TaylorApiError(403,'Denied');return {uid:realAuth.TAYLOR_OWNER_UID};}}})('src/server/cloud-files.ts');
 const request=(auth)=>new Request('https://site.example/api/cloud-media/'+id,{headers:auth?{Authorization:auth}:{}});
 try {
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='taylor-made-creations.firebasestorage.app';process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID='taylor-made-creations';
  globalThis.fetch=async(url,opts)=>{fetches++;seen={url,opts};const body=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));if(mode==='over')c.enqueue(new Uint8Array([4]));c.close();},cancel(){canceled=true;}});return new Response(body,{status:mode==='denied'?403:200,headers:{'content-type':mode==='wrong-type'?'text/html':'image/webp','content-length':mode==='missing-length'?'':mode==='huge'?'999999999':mode==='short'?'4':'3'}});};
  assert.equal((await read(request(),'../private','photo')).status,404);
  assert.equal((await read(request(),id,'pdf')).status,403);
  assert.equal((await read(request('Bearer wrong'),id,'photo')).status,403);assert.equal(fetches,0);
  let response=await read(request(),id,'photo');assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,3);
  assert.deepEqual(seen.opts.headers,{});assert.equal(seen.opts.redirect,'error');assert.equal(seen.opts.cache,'no-store');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(response.headers.get('access-control-allow-origin'),null);assert.match(response.headers.get('cache-control'),/no-store/);
  response=await read(request('Bearer fixture'),id,'photo');assert.equal(response.status,200);await response.arrayBuffer();assert.deepEqual(seen.opts.headers,{Authorization:'Firebase fixture'});assert.doesNotMatch(seen.url,/fixture|token=/);assert.equal(response.headers.get('authorization'),null);
  for(const failure of ['denied','wrong-type','missing-length','huge']){mode=failure;canceled=false;response=await read(request(),id,'photo');assert.equal(response.status,failure==='denied'?404:502);assert.equal(canceled,true);}
  for(const failure of ['over','short']){mode=failure;response=await read(request(),id,'photo');await assert.rejects(()=>response.arrayBuffer());}
  const before=fetches;delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;assert.equal((await read(request(),id,'photo')).status,503);assert.equal(fetches,before);
 }finally {globalThis.fetch=originalFetch;if(bucket===undefined)delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;else process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bucket;if(project===undefined)delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID=project;}
});
