import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,content} from './owner-ui-harness.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,{pending=null,saveFails=false}={}){
 const h=harness();t.after(()=>h.unmount());h.process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE='beta';let current=true,saves=0,publishes=0;
 h.overrides['./website-promotion-client']={readPendingWebsitePromotion:()=>pending};
 h.overrides['./use-draft-recovery']={useDraftRecovery:()=>({flush:()=>true,stop(){},cloud:{enabled:false,stop(){},checkpointSaved:async()=>{},acknowledgePublication(){}},candidates:[],unavailable:[]})};
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 let saved=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();saved.revision=5;
 const request=async()=>assert.fail('Entry must not commit or prepare on its own');
 const store={load:async()=>structuredClone(saved),subscribe:()=>()=>{},websitePromotion:request,saveDraft:async(draft,revision,version)=>{saves++;assert.equal(revision,saved.revision);assert.ok(version.id);await tick();if(saveFails)throw Error('Save not confirmed');saved={...saved,revision:revision+1,draft:structuredClone(draft)};return structuredClone(saved);},publishLive:async()=>{publishes++;return saved;}};
 const props={store,recoveryIdentity:{projectId:'taylor-made-creations',ownerUid:'VhnIFsEQFqRtS8u98mP921wim4J3',assertCurrent(){if(!current)throw Error('Session ended');}},mode:'cloud',fullPageBuilder:true,userEmail:'owner@example.invalid',onSignOut:async()=>{}};
 const Portal=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(Portal,props),settle=async()=>{await tick();render();await tick();render();};render();await settle();h.find(n=>n.type==='button'&&content(n)==='Save').props.onClick();render();
 const dialog=()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Save your changes'),promotion=()=>h.find(n=>n.type?.name==='WebsitePromotionDialog');
 return{h,render,settle,dialog,promotion,request,get saves(){return saves},get publishes(){return publishes},expire(){current=false}};
}
test('Live choice saves exact beta draft once, then opens review without publishing either destination',async t=>{
 const f=await fixture(t),actions=nodes(f.dialog().props.actions),live=actions.find(n=>content(n)==='Publish Live…');assert.ok(live);assert.ok(actions.some(n=>content(n)==='Publish to beta'));
 const first=live.props.onClick();live.props.onClick();await first;await f.settle();assert.equal(f.saves,1);assert.equal(f.publishes,0);assert.equal(f.dialog(),undefined);const p=f.promotion();assert.ok(p);assert.equal(p.props.revisedSource,6);assert.equal(p.props.request,f.request);assert.doesNotThrow(()=>p.props.assertSourceCurrent(6));assert.throws(()=>p.props.assertSourceCurrent(5));
 f.expire();assert.throws(()=>p.props.assertSourceCurrent(6),/Session ended/);p.props.onClose();f.render();assert.equal(f.promotion(),undefined);
});
test('unknown saved operation resumes before any new draft revision or publish',async t=>{
 const f=await fixture(t,{pending:{sourceRevision:3}});nodes(f.dialog().props.actions).find(n=>content(n)==='Publish Live…').props.onClick();await f.settle();assert.equal(f.saves,0);assert.equal(f.publishes,0);const p=f.promotion();assert.equal(p.props.revisedSource,3);assert.throws(()=>p.props.assertSourceCurrent(3),/draft changed/,'status may resolve receipt, but stale source cannot commit');
});
test('unconfirmed private save never starts live review',async t=>{
 const f=await fixture(t,{saveFails:true});nodes(f.dialog().props.actions).find(n=>content(n)==='Publish Live…').props.onClick();await f.settle();assert.equal(f.saves,1);assert.equal(f.publishes,0);assert.equal(f.promotion(),undefined);assert.match(content(f.dialog()),/Save not confirmed/);
});
