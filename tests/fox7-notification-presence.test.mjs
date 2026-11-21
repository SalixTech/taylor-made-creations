import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './owner-ui-harness.mjs';
const item = { recipientRole:'owner',clientId:'client-one',projectId:'project-one',channel:'chat' };
function setup() {
  const h=harness(), stored=new Map(), events=new EventTarget();
  h.document.visibilityState='visible';h.document.hasFocus=()=>true;
  h.document.addEventListener=events.addEventListener.bind(events);h.document.removeEventListener=events.removeEventListener.bind(events);
  h.window.localStorage={get length(){return stored.size;},key:i=>[...stored.keys()][i],getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  h.overrides['./window-session']={activeHubWindowUid:()=> 'owner-uid'};
  return {h,stored,events,api:h.load('src/client-hub/notification-presence.ts')};
}
test('attention matches exact account, role, commission, channel and request, with bounded lease',()=>{
  const {api}=setup(),now=Date.now(),presence={uid:'owner-uid',role:'owner',clientId:item.clientId,projectId:item.projectId,channel:'chat',expires:now+10000};
  assert.equal(api.presenceMatches(presence,item,'owner-uid',now),true);
  for(const changed of [{clientId:'other'},{projectId:'other'},{recipientRole:'client'},{channel:'photos'}]) assert.equal(api.presenceMatches(presence,{...item,...changed},'owner-uid',now),false);
  assert.equal(api.presenceMatches(presence,item,'other-uid',now),false);
  assert.equal(api.presenceMatches({...presence,expires:now-1},item,'owner-uid',now),false);
  assert.equal(api.presenceMatches({...presence,expires:now+60000},item,'owner-uid',now),false);
  const request={...item,channel:'requests',requestId:'r1'},view={...presence,channel:'requests',requestId:'r1'};
  assert.equal(api.presenceMatches(view,request,'owner-uid',now),true);
  assert.equal(api.presenceMatches(view,{...request,requestId:'r2'},'owner-uid',now),false);
});
test('visible focused view publishes and cleans a peer-readable lease; other areas still alert',t=>{
  const {api,h,stored,events}=setup(),stop=api.watchHubAreaPresence({role:'owner',clientId:item.clientId,projectId:item.projectId,channel:'chat'},{isConnected:true});t.after(stop);
  assert.equal(stored.size,1);assert.equal(api.notificationAreaIsActive(item),true);assert.equal(api.notificationAreaIsActive({...item,channel:'photos'}),false);
  h.window.dispatchEvent(new Event('blur'));assert.equal(stored.size,0);assert.equal(api.notificationAreaIsActive(item),false);
  h.document.visibilityState='hidden';events.dispatchEvent(new Event('visibilitychange'));assert.equal(stored.size,0);
  h.document.visibilityState='visible';h.window.dispatchEvent(new Event('focus'));assert.equal(stored.size,1);
  stop();assert.equal(stored.size,0);
});
test('another window can suppress only matching activity and expired or malformed hints do not suppress',()=>{
  const {api,stored}=setup();const key='tmc-hub-attention-v1:peer';
  stored.set(key,JSON.stringify({uid:'owner-uid',role:'owner',clientId:item.clientId,projectId:item.projectId,channel:'chat',expires:Date.now()+12000}));
  assert.equal(api.notificationAreaIsActive(item),true);assert.equal(api.notificationAreaIsActive({...item,projectId:'other'}),false);
  stored.set(key,JSON.stringify({uid:'owner-uid',role:'owner',clientId:item.clientId,projectId:item.projectId,channel:'chat',expires:Date.now()-1}));assert.equal(api.notificationAreaIsActive(item),false);
  stored.set(key,'not json');assert.equal(api.notificationAreaIsActive(item),false);
});
test('attention observes the whole supplied workspace region, not its offscreen heading, and clears when the region leaves view',t=>{
  const h=harness(),stored=new Map(),workspace={isConnected:true},header={isConnected:true};let observed,notify;
  h.document.visibilityState='visible';h.document.hasFocus=()=>true;
  h.window.localStorage={get length(){return stored.size;},key:i=>[...stored.keys()][i],getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  h.overrides['./window-session']={activeHubWindowUid:()=> 'owner-uid'};
  h.globals.IntersectionObserver=class {constructor(fn){notify=fn;}observe(target){observed=target;}disconnect(){}};
  const api=h.load('src/client-hub/notification-presence.ts'),stop=api.watchHubAreaPresence({role:'owner',clientId:item.clientId,projectId:item.projectId,channel:'chat'},workspace);t.after(stop);
  assert.equal(observed,workspace);assert.notEqual(observed,header);
  notify([{target:workspace,isIntersecting:true}]);assert.equal(api.notificationAreaIsActive(item),true,'visible chat/composer keeps its workspace active even when its header is above viewport');
  notify([{target:workspace,isIntersecting:false}]);assert.equal(api.notificationAreaIsActive(item),false);
});
