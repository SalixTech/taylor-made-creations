import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,nodes,content} from './owner-ui-harness.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
async function fixture(t){
 const h=harness();t.after(()=>h.unmount());h.process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE='beta';
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const saved=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace(),gate=deferred();let calls=0;
 const store={load:async()=>structuredClone(saved),subscribe:()=>()=>{},readLiveShopVisibility:async()=>false,publishLive:async()=>{calls++;return gate.promise}};
 const Portal=h.load('src/owner/OwnerPortal.tsx').default,props={store,mode:'cloud',fullPageBuilder:true,userEmail:'owner@test.invalid',onSignOut:async()=>{}};
 const render=()=>h.render(Portal,props),dialog=()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Save your changes');render();await tick();render();await tick();render();h.find(n=>n.type==='button'&&content(n)==='Save').props.onClick();render();
 return{h,render,dialog,gate,saved,get calls(){return calls}};
}
for(const success of [true,false])test(`publish progress reflects only the pending request and ${success?'shows a persistent confirmation':'retains a visible error on failure'}`,async t=>{
 const f=await fixture(t),initial=f.dialog(),publish=nodes(initial.props.actions).find(n=>content(n)==='Publish to beta');assert.ok(publish);assert.doesNotMatch(content(initial),/Publishing…/);
 publish.props.onClick();publish.props.onClick();f.render();assert.equal(f.calls,1,'synchronous operation guard prevents duplicate publish');
 const pending=f.dialog();assert.equal(pending.props.dismissDisabled,true);assert.ok(nodes(pending).some(n=>n.props.role==='status'&&content(n).includes('Publishing…')));
 const actions=nodes(pending.props.actions).filter(n=>n.type==='button');assert.ok(actions.every(n=>n.props.disabled));assert.ok(actions.some(n=>content(n)==='Publishing…'));pending.props.onClose();f.render();assert.ok(f.dialog(),'pending dialog cannot close');
 if(success)f.gate.resolve({...f.saved,revision:f.saved.revision+1});else f.gate.reject(Error('Publish result could not be confirmed'));
 await tick();f.render();await tick();f.render();
 if(success){assert.ok(f.dialog());assert.match(content(f.dialog()),/Published!/);assert.equal(f.dialog().props.dismissDisabled,false);const close=nodes(f.dialog().props.actions).find(n=>content(n)==='Close');assert.ok(close);close.props.onClick();f.render();assert.equal(f.dialog(),undefined);f.h.find(n=>n.type==='button'&&content(n)==='Save').props.onClick();f.render();assert.doesNotMatch(content(f.dialog()),/Published!/);}else{assert.ok(f.dialog());assert.doesNotMatch(content(f.dialog()),/Publishing…/);assert.match(content(f.dialog()),/Publish result could not be confirmed/);assert.equal(f.dialog().props.dismissDisabled,false);}
 assert.equal(f.calls,1);
});
test('beta preview Reload Page is explicit, requires current owner and refuses retained upload bytes',async t=>{
 const h=harness();t.after(()=>h.unmount());let current=true,retained=[],reloads=0,reads=0;
 h.overrides['./FirebaseOwnerGate']={FirebaseOwnerGate:function FirebaseOwnerGate(){return null}};
 h.overrides['./cloud-files-client']={pendingWebsiteUploads:()=>retained};
 const assertCurrent=()=>{if(!current)throw Error('Session changed')};const session={recoveryIdentity:{assertCurrent},signOut:async()=>{}};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({token:'fixture',assertCurrent})};
 const snapshot=h.load('src/owner/model.ts').createPublishedOwnerSnapshot(h.load('src/owner/defaults.ts').createDefaultOwnerContent(),1);
 h.globals.fetch=async()=>{reads++;return{ok:true,json:async()=>({snapshot})}};h.window.location.reload=()=>reloads++;
 const Entry=h.load('src/owner/BetaWebsiteEntry.tsx').BetaWebsiteEntry,preview=Entry({pathname:'/'}).props.children(session),render=()=>h.render(preview.type,preview.props);render();await tick();render();
 const reload=h.find(n=>n.type==='button'&&content(n)==='Reload Page');assert.ok(reload);assert.equal(reloads,0);reload.props.onClick();assert.equal(reloads,1);retained=[{id:'same-upload'}];reload.props.onClick();render();assert.equal(reloads,1);assert.match(content(h.tree),/upload is still retained/);retained=[];current=false;reload.props.onClick();render();assert.equal(reloads,1);assert.match(content(h.tree),/Session changed/);assert.equal(reads,1);
});
test('More menu closes on outside pointer and Escape but not an inside click',async t=>{
 const h=harness();t.after(()=>h.unmount());const events=new Map();h.document.querySelector=()=>null;h.document.addEventListener=(name,fn)=>events.set(name,fn);h.document.removeEventListener=(name,fn)=>{if(events.get(name)===fn)events.delete(name)};class Node{}h.globals.Node=Node;
 const initial=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const C=h.load('src/owner/OwnerPortal.tsx').default,props={store:{load:async()=>initial,subscribe:()=>()=>{}},mode:'cloud',fullPageBuilder:true,onSignOut:async()=>{}};h.render(C,props);await tick();h.render(C,props);
 const menu=h.find(n=>n.type==='details'&&n.props.className==='builderMore'),inside=new Node(),outside=new Node();assert.ok(menu);menu.props.ref.current={open:true,contains:node=>node===inside};events.get('pointerdown')({target:inside});assert.equal(menu.props.ref.current.open,true);events.get('pointerdown')({target:outside});assert.equal(menu.props.ref.current.open,false);menu.props.ref.current.open=true;let prevented=0,stopped=0;const escape={key:'Escape',preventDefault(){prevented++},stopPropagation(){stopped++}};events.get('keydown')(escape);assert.equal(menu.props.ref.current.open,false);assert.equal(prevented,1);assert.equal(stopped,1);events.get('keydown')(escape);assert.equal(prevented,1,'closed More leaves canvas Escape unchanged');assert.equal(stopped,1);menu.props.ref.current.open=true;h.document.querySelector=()=>({});events.get('keydown')(escape);assert.equal(prevented,1,'open dialog owns Escape');assert.equal(stopped,1);assert.equal(menu.props.ref.current.open,true);
});

test('help placeholder is visibly inactive and publication animation retains reduced-motion feedback',()=>{
 const source=readFileSync('src/owner/OwnerPortal.tsx','utf8'),css=readFileSync('src/owner/OwnerPortal.module.css','utf8');
 assert.match(source,/<span aria-disabled="true">Ask Salix for Help<\/span><small>Email help coming soon<\/small>/);
 assert.match(css,/publishSpinner[\s\S]*border-right-color:transparent/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.publishSpinner,\.publishCheck\{animation:none\}\}/);
 assert.match(source,/role="status" aria-live="polite"/);assert.match(source,/<strong>Published!<\/strong>/);
});
