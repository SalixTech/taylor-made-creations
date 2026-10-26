import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const id = '11111111-1111-4111-8111-111111111111';
const font = { id, src:`/api/fonts/${id}`, name:'Test display name', format:'woff2' };
const photo = { id, src:`/api/media/${id}`, name:'Private staged image', width:10, height:20, bytes:30, contentType:'image/webp', storage:'development-disk', createdAt:'2026-10-25T00:00:00.000Z' };

test('builder ImagePicker delegates upload to staged library and only explicit Use photo changes the source', () => {
  const h = harness(), choices=[];
  const Picker = h.load('src/owner/OwnerFields.tsx').ImagePicker;
  h.render(Picker, { src:'/images/old.webp', alt:'old', onSource:source=>choices.push(source), onAlt(){} });
  const library = h.find(n=>typeof n.type==='function'&&n.type.name==='AssetLibrary');
  assert.ok(library); assert.equal(library.props.selected,'/images/old.webp');
  assert.equal(h.find(n=>typeof n.type==='function'&&n.type.name==='PhotoUpload'),undefined);
  h.unmount();
  const second=harness(),assets=[];
  second.overrides['./asset-library-client']={usePrivateAssetLibrary:()=>({assets,add:value=>assets.push(value),loading:false,error:'',refresh(){}})};
  const AssetLibrary=second.load('src/owner/AssetLibrary.tsx').LegacyAssetLibrary;
  const render=()=>second.render(AssetLibrary,library.props);render();
  const upload=second.find(n=>typeof n.type==='function'&&n.type.name==='PhotoUpload');
  assert.equal(upload.props.staged,true);assert.equal(upload.props.multiple,true);
  upload.props.onUploaded([{media:photo,name:'New staged photo'}]);render();
  assert.deepEqual(choices,[]);assert.equal(assets.length,1);
  assert.match(content(second.tree),/does not replace the current image or publish/);
  second.find(n=>n.type==='button'&&n.props['aria-label']==='Use photo: New staged photo').props.onClick();
  assert.deepEqual(choices,[photo.src]);second.unmount();
});
test('staged library has no arbitrary count cap and failed library reads keep existing photo untouched',()=>{
  const h=harness(),choices=[],assets=Array.from({length:251},(_,n)=>({...photo,id:String(n),name:`Photo ${n}`}));
  h.overrides['./asset-library-client']={usePrivateAssetLibrary:()=>({assets,add(){},loading:false,error:'Upload server unavailable',refresh(){}})};
  const Library=h.load('src/owner/AssetLibrary.tsx').LegacyAssetLibrary;h.render(Library,{selected:'/images/old.webp',onSelect:value=>choices.push(value)});
  assert.equal(h.all(n=>n.type==='li').length,251);assert.deepEqual(choices,[]);assert.match(content(h.tree),/Upload server unavailable/);h.unmount();
});
function libraryHarness(response){
  const h=harness();let valid=true,authChanged;const requests=[];
  h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({token:'private-token',assertCurrent(){if(!valid)throw Error('Session changed');},auth:{onAuthStateChanged(fn){authChanged=fn;return()=>{authChanged=undefined;};}}}),responseObject:async response=>{if(!response.ok)throw Error('Denied');return response.json();}};
  h.globals.fetch=async(url,options)=>{requests.push({url,options});return response;};
  const hook=h.load('src/owner/asset-library-client.ts').usePrivateAssetLibrary;
  const validate=value=>!!value&&typeof value.id==='string';let result;
  const Probe=()=>{result=hook('/api/taylor/media','photos',validate);return null;};
  return {h,requests,render(){h.render(Probe);return result;},get result(){return result;},invalidate(){valid=false;authChanged?.();}};
}
test('private asset metadata is authenticated/no-store, clears immediately on session loss and ignores late results',async()=>{
  const t=libraryHarness(new Response(JSON.stringify({ok:true,photos:[photo]})));t.render();await flush();t.render();
  assert.equal(t.result.assets.length,1);assert.equal(t.requests[0].options.headers.Authorization,'Bearer private-token');assert.equal(t.requests[0].options.cache,'no-store');
  t.invalidate();t.render();assert.deepEqual(t.result.assets,[]);assert.match(t.result.error,/Sign in again/);t.h.unmount();
  const late=deferred(),u=libraryHarness(late.promise);u.render();await flush();u.invalidate();late.resolve(new Response(JSON.stringify({ok:true,photos:[photo]})));await flush();u.render();assert.deepEqual(u.result.assets,[]);u.h.unmount();
});
test('font upload is available without checkbox and only changes draft after server confirmation; repeat/cancel is safe',async()=>{
  const h=harness(),gate=deferred(),received=[];let calls=0,signal,begun=0,ended=0;
  h.currentContext={begin(){begun++;return()=>ended++;}};
  h.overrides['./font-client']={FONT_UPLOAD_ACCEPT:'.woff2',uploadOwnerFont:async(file,s)=>{calls++;signal=s;return gate.promise;}};
  const FontUpload=h.load('src/owner/FontUpload.tsx').FontUpload,render=()=>h.render(FontUpload,{onUploaded:font=>received.push(font)});render();
  assert.equal(h.find(n=>n.type==='input'&&n.props.type==='file').props.disabled,false);
  assert.equal(h.find(n=>n.type==='input'&&n.props.type==='checkbox'),undefined);
  const file=new File(['fixture'],'test.woff2');const choose=()=>h.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});
  choose();choose();render();assert.equal(calls,1);assert.equal(begun,1);assert.deepEqual(received,[]);
  h.find(n=>n.type==='button'&&content(n)==='Stop upload').props.onClick();gate.resolve(font);await flush();render();
  assert.equal(signal.aborted,true);assert.deepEqual(received,[]);assert.equal(ended,1);assert.match(content(h.tree),/selected fonts have not changed/);h.unmount();
});
test('cloud font library adds only reference metadata and never automatically selects a font or deletes earlier uploads',()=>{
  const h=harness(),changed=[];
  const record={id,kind:'font',name:'Custom font.woff2',contentType:'font/woff2',status:'ready',parentId:'root',trashedAt:null};
  h.overrides['./use-cloud-files']={useCloudFiles:()=>({files:[record,{...record,id:'22222222-2222-4222-8222-222222222222',trashedAt:'2026-10-26T00:00:00.000Z'}],folders:{schemaVersion:1,revision:0,folders:{}},loading:false,ready:true,error:'',refresh(){}})};
  const Library=h.load('src/owner/FontUpload.tsx').OwnerFontLibrary;h.render(Library,{fonts:[],onChange:value=>changed.push(value)});
  assert.doesNotMatch(content(h.tree),/development.server|Previously uploaded on this server/);
  assert.equal(h.all(n=>n.type==='button'&&content(n)==='Add to draft').length,1);
  h.find(n=>n.type==='button'&&content(n)==='Add to draft').props.onClick();assert.equal(changed[0][0].id,id);assert.equal(changed[0][0].src,`/api/cloud-fonts/${id}`);assert.deepEqual(Object.keys(changed[0][0]).sort(),['format','id','name','src']);assert.equal(h.all(n=>n.type==='button'&&/Remove|Delete/.test(content(n))).length,0);h.unmount();
});
function loaderHarness(privateFonts,fetcher){
  const h=harness(),created=[],added=[],deleted=[],requests=[];let valid=true,authChanged,authCalls=0;
  h.document.fonts={add:face=>added.push(face),delete:face=>deleted.push(face)};
  h.globals.FontFace=class{constructor(family,source,options){Object.assign(this,{family,source,options});created.push(this);}async load(){return this;}};
  h.globals.fetch=async(url,options)=>{requests.push({url,options});return fetcher?fetcher():new Response('font-bytes',{headers:{'content-type':'font/woff2'}});};
  h.overrides['@/owner/taylor-services-client']={taylorOwnerSession:async()=>{authCalls++;return{token:'private-font-token',assertCurrent(){if(!valid)throw Error('Session changed');},auth:{onAuthStateChanged(fn){authChanged=fn;return()=>{authChanged=undefined;};}}};}};
  const Loader=h.load('src/components/SiteFontLoader.tsx').SiteFontLoader;
  return{h,created,added,deleted,requests,get authCalls(){return authCalls;},render(fonts=[font]){h.render(Loader,{fonts,privateFonts});},invalidate(){valid=false;authChanged?.();}};
}
test('public font registration uses generated family and only strict font URLs; no owner auth, style text or global variables',async()=>{
  const t=loaderHarness(false);t.render();await flush();assert.equal(t.authCalls,0);assert.equal(t.requests.length,0);assert.equal(t.added.length,1);
  assert.equal(t.created[0].family,`TMCFont_${id}`);assert.equal(t.created[0].source,`url("${font.src}")`);assert.equal(t.h.tree,null);t.h.unmount();assert.deepEqual(t.deleted,t.added);
  const invalid=loaderHarness(false);invalid.render([{...font,src:'https://evil.example/font.woff2'},{...font,id:'bad");body{color:red}'}]);await flush();assert.equal(invalid.created.length,0);invalid.h.unmount();
});
test('private font preview uses authorized in-memory bytes, removes faces on session loss and never falls back to public URL',async()=>{
  const t=loaderHarness(true);t.render();await flush();assert.equal(t.requests[0].url,font.src);assert.equal(t.requests[0].options.headers.Authorization,'Bearer private-font-token');assert.equal(t.requests[0].options.cache,'no-store');
  assert.equal(t.created[0].source instanceof ArrayBuffer,true);assert.equal(t.added.length,1);t.invalidate();assert.deepEqual(t.deleted,t.added);t.h.unmount();
  const denied=loaderHarness(true,()=>new Response('Denied',{status:403}));denied.render();await flush();assert.equal(denied.requests.length,1);assert.equal(denied.created.length,0);denied.h.unmount();
});
test('private font preview cannot register late bytes after unmount',async()=>{
  const gate=deferred(),t=loaderHarness(true,()=>gate.promise);t.render();await flush();t.h.unmount();gate.resolve(new Response('private-font',{headers:{'content-type':'font/woff2'}}));await flush();assert.equal(t.created.length,0);assert.equal(t.added.length,0);
});

test('font library refresh is an accessible icon-only button and indicates refresh activity',()=>{
  const h=harness();let calls=0;const library={files:[],folders:{schemaVersion:1,revision:0,folders:{}},loading:false,ready:true,error:'',refresh(){calls++;}};
  h.overrides['./use-cloud-files']={useCloudFiles:()=>library};
  const Library=h.load('src/owner/FontUpload.tsx').OwnerFontLibrary;const render=()=>h.render(Library,{fonts:[],onChange(){}});render();
  const button=()=>h.find(n=>n.type==='button'&&n.props['aria-label']==='Refresh fonts');
  assert.ok(button());assert.equal(content(button()),'');assert.equal(button().props.title,'Refresh fonts');assert.ok(h.find(n=>n.type==='svg'&&n.props['aria-hidden']==='true'));
  button().props.onClick();assert.equal(calls,1);library.loading=true;render();assert.equal(button().props.disabled,true);assert.equal(button().props['aria-busy'],true);h.unmount();
});
