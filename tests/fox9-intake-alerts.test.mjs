import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const item=(id,readAt=null)=>({notificationId:'commission-request-'+id,kind:'commission-request',requestId:id,createdAt:'2026-10-28T18:00:00.000Z',readAt});
function setup(t,{enabled=true,owner=true}={}){
 const h=harness(),feed=[],alerts=[],audio=[],acks=[],navigated=[];h.window.localStorage={getItem:()=>JSON.stringify({desktop:enabled}),setItem(){}};
 h.globals.Notification=class{static permission='granted';constructor(title,options){alerts.push({title,options});}close(){}};
 h.globals.Audio=class{constructor(){audio.push(this);this.plays=0;}canPlayType(){return'probably';}play(){this.plays++;return Promise.resolve();}pause(){}};
 h.overrides['./workspace-client']={subscribeHubNotifications:()=>()=>{}};h.overrides['./notification-client']={loadHubNotificationLabels:async()=>({}),changeHubNotifications:async()=>[]};
 h.overrides['@/owner/owner-intake-notifications']={watchOwnerIntakeNotifications(value,error){const sub={value,error,stopped:false};feed.push(sub);return()=>{sub.stopped=true;};},markOwnerIntakeNotificationRead:async row=>{acks.push(row.notificationId);}};
 const Bell=h.load('src/client-hub/HubNotificationBell.tsx').HubNotificationBell,props={owner,accountKey:'owner-test',onNavigateIntake:row=>{navigated.push(row);return h.allowNavigate!==false;}};const render=()=>h.render(Bell,props);render();t.after(()=>h.unmount());
 return{h,feed,alerts,audio,acks,navigated,props,render,async ready(){await flush();render();},open(){h.find(n=>n.props.title==='Notifications').props.onClick();render();}};
}
test('intake alerts suppress initial backlog and honor notification-off while preserving bell updates',async t=>{
 const f=setup(t);await f.ready();f.feed[0].value([item('old')]);assert.equal(f.alerts.length,0);f.feed[0].value([item('new'),item('old')]);f.render();assert.equal(f.alerts.length,1);assert.equal(f.audio[0].plays,1);assert.equal(f.alerts[0].options.body,'A new private request is waiting in your studio inbox.');assert.doesNotMatch(JSON.stringify(f.alerts),/email|clientId|requestId|commission-request-new/);
 const off=setup(t,{enabled:false});await off.ready();off.feed[0].value([]);off.feed[0].value([item('new')]);off.render();assert.equal(off.alerts.length,0);assert.equal(off.audio.length,0);assert.match(off.h.find(n=>n.props.title==='Notifications').props['aria-label'],/1 unread/);
});
test('request alert navigation does not clear an alert when unsaved work blocks navigation',async t=>{
 const f=setup(t);await f.ready();f.feed[0].value([item('new')]);f.open();const find=()=>f.h.find(n=>n.type==='button'&&content(n).includes('New commission request'));f.h.allowNavigate=false;find().props.onClick();await f.ready();assert.equal(f.acks.length,0);assert.ok(f.h.find(n=>n.props['aria-label']==='Notifications'&&n.props.role==='region'));f.h.allowNavigate=true;find().props.onClick();await f.ready();assert.equal(f.acks.length,1);assert.equal(f.navigated.length,2);
});
test('client never subscribes to the owner intake stream; stale owner stream cannot populate new account',async t=>{
 const client=setup(t,{owner:false});await client.ready();assert.equal(client.feed.length,0);
 const f=setup(t);await f.ready();f.feed[0].value([item('old')]);f.props.accountKey='next-owner';f.render();await f.ready();assert.equal(f.feed[0].stopped,true);f.feed[0].value([item('stale')]);f.open();assert.doesNotMatch(content(f.h.tree),/New commission request/);assert.equal(f.alerts.length,0);
});
