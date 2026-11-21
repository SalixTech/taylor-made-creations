import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,nodes,content} from './owner-ui-harness.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){
 const h=harness();t.after(()=>h.unmount());h.process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE='beta';
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const initial=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();let writes=0;
 const store={load:async()=>structuredClone(initial),subscribe:()=>()=>{},readLiveShopVisibility:async()=>false,saveDraft:async()=>{writes++;throw Error('No implicit saves')},publishLive:async()=>{writes++;throw Error('No implicit publish')}};
 const C=h.load('src/owner/OwnerPortal.tsx').default,props={store,mode:'cloud',fullPageBuilder:true,onSignOut:async()=>{}},render=()=>h.render(C,props);render();await tick();render();await tick();render();
 return{h,render,builder:()=>h.find(n=>n.type?.name==='OwnerVisualBuilder'),get writes(){return writes}};
}
test('authenticated full-page builder starts viewing, explicit edit enters, dirty exit still requires confirmation',async t=>{
 const f=await fixture(t);assert.equal(f.builder().props.browsing,true);assert.equal(f.writes,0);
 f.builder().props.onBrowsingChange(false);f.render();assert.equal(f.builder().props.browsing,false);
 f.builder().props.onEdit(d=>{d.home.title='Preserve my edit'});f.render();f.builder().props.onBrowsingChange(true);f.render();assert.equal(f.builder().props.browsing,false);
 const confirm=f.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Leave edit mode?');assert.ok(confirm);nodes(confirm.props.actions).find(n=>content(n)==='Cancel').props.onClick();f.render();assert.equal(f.builder().props.browsing,false);assert.equal(f.builder().props.content.home.title,'Preserve my edit');assert.equal(f.writes,0);
 f.builder().props.onBrowsingChange(true);f.render();const next=f.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Leave edit mode?');nodes(next.props.actions).find(n=>content(n)==='Exit edit mode').props.onClick();f.render();assert.equal(f.builder().props.browsing,true);assert.equal(f.builder().props.content.home.title,'Preserve my edit');assert.equal(f.writes,0);
});
const luminance=hex=>{const rgb=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
test('confirmed publication icon uses theme-specific green with at least 3:1 surface contrast',()=>{
 const css=readFileSync('src/owner/OwnerPortal.module.css','utf8');assert.match(css,/\.portal \.publishCheck\{color:#166534\}/);assert.match(css,/\.portal\[data-color-mode="dark"\] \.publishCheck\{color:#4ade80\}/);
 for(const [green,background] of [['166534','ffffff'],['166534','f4f1eb'],['4ade80','2b2b2b'],['4ade80','18181b']]){const values=[luminance(green),luminance(background)].sort((a,b)=>b-a);assert.ok((values[0]+.05)/(values[1]+.05)>=3);}
});
