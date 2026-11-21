import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';

const load=sourceLoader(), g=load('src/owner/box-geometry.ts'), affine=load('src/owner/box-affine.ts');
test('SS25 resting selection uses actual rotated screen corners, not canonical horizontal bounds',()=>{
  for(const angle of [-180,-90,-33,0,45,90,180]){
    const rotation=g.rotationAffine(angle), matrix=g.multiplyAffine({a:.9,b:0,c:0,d:.9,e:20,f:80}, {...rotation,e:240,f:30});
    const measured={width:527.375,height:40.125,nodeToCanvas:matrix,parentWidth:900,origin:{x:0,y:0}};
    const frame=affine.measuredCanvasFrame(measured);
    assert.equal(frame.width,527.375);assert.equal(frame.height,40.125);assert.deepEqual(frame.matrix,matrix);
    for(const p of [{x:0,y:0},{x:frame.width,y:0},{x:frame.width,y:frame.height},{x:0,y:frame.height}])assert.deepEqual(g.transformPoint(frame.matrix,p),g.transformPoint(matrix,p));
    if(Math.abs(angle)===90){const a=g.transformPoint(frame.matrix,{x:0,y:0}),b=g.transformPoint(frame.matrix,{x:frame.width,y:0});assert.ok(Math.abs(a.x-b.x)<1e-8);assert.ok(Math.abs(a.y-b.y)>400);}
  }
});
test('Done closes fields but retains selected geometry and resolves current replacement frame before focus',()=>{
  const h=harness();h.overrides['./PhotoUpload']={PhotoUpload:'PhotoUpload',OwnerUploadProvider:'OwnerUploadProvider'};
  const value=h.load('src/owner/defaults.ts').createDefaultOwnerContent(), C=h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  const writes=[],props={content:value,page:value.pages[0],browsing:false,onBrowsingChange(v){props.browsing=v},onEdit(){writes.push('edit')},onPageChange(){},onManagePages(){},onAddPage(){},onPrices(){},onRemove(){}};
  const render=()=>h.render(C,props),button=label=>h.find(n=>n.type==='button'&&content(n).trim()===label),tools=()=>h.find(n=>n.type?.name==='OwnerCanvasBoxTools');render();
  const canvas=()=>h.find(n=>n.props.onClickCapture),dom=canvas().props.ref.current;dom.dataset={ownerEdit:'template-text:home.stripTitle'};dom.closest=s=>s==='[data-owner-edit]'?dom:null;
  canvas().props.onClickCapture({target:dom,preventDefault(){},stopPropagation(){}});render();assert.ok(tools());assert.ok(button('Done'));
  let focused=0;const replacement={dataset:{ownerEdit:'template-text:home.stripTitle'},closest(){return null},focus(){focused++}};dom.querySelectorAll=()=>[replacement];
  button('Done').props.onClick();render();assert.equal(button('Done'),undefined);assert.ok(tools());assert.equal(focused,1);assert.equal(writes.length,0);
  canvas().props.onClickCapture({target:dom,preventDefault(){},stopPropagation(){}});render();assert.ok(button('Done'));button('Done').props.onClick();render();
  canvas().props.onKeyDownCapture({target:dom,key:'Escape',nativeEvent:{},preventDefault(){},stopPropagation(){}});render();assert.equal(tools(),undefined);assert.equal(writes.length,0);h.unmount();
});
function documentFixture(){
  const styles=[],attributes=new Map();
  return { title:'',head:{querySelectorAll(){return styles},appendChild(node){styles.push(node)}},documentElement:{className:'',style:{cssText:''},getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)},body:{},styles};
}
function pinFixture({supported=true}={}){
  const host=Object.assign(new EventTarget(),{isSecureContext:true,document:documentFixture()});host.top=host;
  const opened=Object.assign(new EventTarget(),{closed:false,document:documentFixture(),close(){this.closed=true;this.dispatchEvent(new Event('pagehide'))},focus(){this.focused=true}});
  let resolve,reject,requests=0,current=true;const changes=[],errors=[];
  if(supported)host.documentPictureInPicture={requestWindow(){requests++;return new Promise((yes,no)=>{resolve=yes;reject=no})}};
  const api=load('src/owner/document-pip-preview.ts'),controller=api.createPinnedPreviewController(host,()=>{if(!current)throw Error('revoked')},v=>changes.push(v),v=>errors.push(v));
  return {host,opened,controller,changes,errors,api,resolve(){resolve(opened)},reject(){reject(Error('blocked'))},revoke(){current=false},get requests(){return requests}};
}
test('Pin is secure top-level capability gated and requestWindow is called only by explicit open',async()=>{
  const t=pinFixture();assert.equal(t.requests,0);const pending=t.controller.open();assert.equal(t.requests,1);await t.controller.open();assert.equal(t.requests,1);t.resolve();await pending;assert.equal(t.changes[0],t.opened);assert.equal(t.opened.document.title,'Private builder preview');t.controller.close();assert.equal(t.opened.closed,true);assert.equal(t.changes.at(-1),null);t.controller.dispose();
  const no=pinFixture({supported:false});await no.controller.open();assert.equal(no.requests,0);assert.match(no.errors[0],/regular preview stays open/);no.controller.dispose();
  const nested=pinFixture();nested.host.top={};assert.equal(nested.api.canPinPreview(nested.host),false);nested.host.top=nested.host;nested.host.isSecureContext=false;assert.equal(nested.api.canPinPreview(nested.host),false);nested.controller.dispose();
});
test('late PiP result cannot resurrect after close, opener pagehide, disposal or session revocation',async()=>{
  for(const ending of ['close','pagehide','dispose','revoke']){const t=pinFixture(),pending=t.controller.open();if(ending==='pagehide')t.host.dispatchEvent(new Event('pagehide'));else if(ending==='revoke')t.revoke();else t.controller[ending]();t.resolve();await pending;assert.equal(t.opened.closed,true,ending);assert.equal(t.changes.includes(t.opened),false,ending);t.controller.dispose();}
});
test('PiP denial keeps normal preview and reports actionable error; native close restores normal rendering',async()=>{
  const denied=pinFixture(),pending=denied.controller.open();denied.reject();await pending;assert.match(denied.errors[0],/Use the regular preview|try Pin preview/);denied.controller.dispose();
  const t=pinFixture(),open=t.controller.open();t.resolve();await open;t.opened.close();assert.equal(t.changes.at(-1),null);t.controller.dispose();
});
test('preview capability never navigates, changes Auth or invokes draft/publication writes',()=>{
  const helper=readFileSync('src/owner/document-pip-preview.ts','utf8');assert.doesNotMatch(helper,/firebase|signOut|signIn|localStorage|sessionStorage|window\.open|location\s*=|location\.(?:assign|replace)|history\./);
  const ui=readFileSync('src/owner/OwnerLivePreview.tsx','utf8');assert.match(ui,/createPortal\(preview, pinnedWindow.document.body\)/);assert.match(ui,/<FirebaseOwnerGate>/);assert.match(ui,/pinController.current\?\.close\(\); setSnapshot\(null\)/);
});
