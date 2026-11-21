import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('left Invoice entry opens guarded workspace, dirty/pending invoice blocks navigation and signout',async t=>{
 const h=harness(); t.after(()=>h.unmount());
 for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};
 const saved=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();let writes=0,signouts=0;
 const store={load:async()=>saved,subscribe:()=>()=>{},saveDraft:async()=>{writes++;throw Error('unauthorized')},publishLive:async()=>{writes++;throw Error('unauthorized')}};
 h.window.location.href='/taylor/settings';
 const Portal=h.load('src/owner/OwnerPortal.tsx').default,props={store,mode:'cloud',userEmail:'test@example.test',initialSection:'settings',onSignOut:async()=>{signouts++}};
 const render=()=>h.render(Portal,props);render();await tick();render();await tick();render();
 const button=label=>h.find(n=>n.type==='button'&&content(n).trim()===label);
 const entry=button('Invoice');assert.ok(entry);assert.equal(entry.props['aria-haspopup'],'dialog');
 const nav=h.find(n=>n.type==='nav'&&n.props['aria-label']==='Taylor’s Space');assert.ok(nodes(nav).includes(entry));
 entry.props.onClick();render();let workspace=h.find(n=>n.type?.name==='InvoiceWorkspace');assert.ok(workspace);
 workspace.props.onDirtyChange(true);
 h.find(n=>n.type==='a'&&n.props.href==='/taylor/photos').props.onClick({button:0,preventDefault(){}});render();assert.equal(h.window.location.href,'/taylor/settings');assert.ok(h.find(n=>n.props?.title==='Stay here for a moment'));
 button('Sign out').props.onClick();render();assert.equal(signouts,0);
 workspace.props.onDirtyChange(false);workspace.props.onBusyChange(true);button('Sign out').props.onClick();render();assert.equal(signouts,0);
 workspace.props.onBusyChange(false);workspace.props.onClose();render();assert.equal(h.find(n=>n.type?.name==='InvoiceWorkspace'),undefined);assert.equal(writes,0);
});
test('cloud sync formatter includes actual calendar date and timezone, ignores invalid date',()=>{
 const source=fs.readFileSync('src/owner/OwnerPortal.tsx','utf8');assert.match(source,/Number\.isFinite\(Date\.parse\(date\)\)/);assert.match(source,/toLocaleString\(\[\], \{ year: "numeric", month: "short", day: "numeric"/);assert.match(source,/timeZoneName: "short"/);
});
