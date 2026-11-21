// Source-hook tests and CSS contracts, not real-browser visual verification.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
const fixtures = new Set();
afterEach(() => { for (const h of fixtures) h.unmount(); fixtures.clear(); });
const tick = () => new Promise(resolve => setImmediate(resolve));
const project = { clientId:'TMC-0123456789ABCDEF', projectId:'11111111-1111-4111-8111-111111111111', title:'Fox', summary:'', status:'completed', progress:null, createdAt:'2026-10-27T20:00:00.000Z', updatedAt:'2026-10-27T20:00:00.000Z', version:1 };
const attachment = { attachmentId:'22222222-2222-4222-8222-222222222222', fileName:'fox.pdf', size:1, senderRole:'owner', createdAt:project.createdAt, available:true };
function fixture({ owner = false, mode = 'upload', available = true, reason = null, rename = null } = {}) {
 const h = harness(); fixtures.add(h); const calls = [];
 h.overrides['./attachments-client'] = {
  async listHubAttachments() { return { attachments:[{...attachment,available,unavailableReason:reason}], nextCursor:null, retention:{state:'legacy-needs-date',available,reason,expiresAt:null} }; },
  async uploadHubAttachments(...args) { calls.push(['upload',...args]); return {attachments:[attachment]}; },
  async downloadHubAttachment(...args) { calls.push(['download',...args]); },
  async establishHubLegacyCompletion(...args) { calls.push(['completion',...args]); },
  async renameHubAttachment(...args) { calls.push(['rename',...args]); return rename ? rename(...args) : {...args[2],fileName:args[3]}; },
 };
 const Component = h.load('src/client-hub/MakerChatAttachments.tsx').MakerChatAttachments;
 const props = { project,owner,onFailure(){},onDirtyChange(){},onBusyChange(){},openRequest:{sequence:1,mode} };
 const render = () => h.render(Component,props); render();
 return { h,calls,render,props, async ready(){ await tick(); render(); await tick(); render(); }, button(label){return h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label||n.props.title===label));} };
}
test('both roles send undated completed-commission files without submitting an optional date', async () => {
 for (const owner of [false,true]) {
  const f = fixture({owner}); await f.ready();
  const input = f.h.find(n=>n.type==='input'&&n.props.type==='file'); assert.equal(input.props.disabled,false);
  assert.doesNotMatch(content(f.h.tree),/needs to confirm|needs an explicit date before/);
  input.props.onChange({target:{files:[new File(['x'],'fox.pdf')]}}); f.render();
  assert.equal(f.button('Send files').props.disabled,false);
  await f.h.find(n=>n.type==='form'&&n.props.className==='upload').props.onSubmit({preventDefault(){}}); await f.ready();
  assert.deepEqual(f.calls.map(c=>c[0]),['upload']); assert.match(content(f.h.tree),/Sent Successfully/);
  // Sending now closes the drawer but leaves the mounted transfer/status owner alive.
  f.props.openRequest={sequence:2,mode:'history'}; f.render(); await f.ready();
  const details = f.h.find(n=>n.type==='details'); assert.equal(!!details,owner);
  if(owner) { assert.equal(details.props.open,undefined); assert.match(content(details),/optional/); assert.equal(f.h.find(n=>n.type==='input'&&n.props.type==='datetime-local').props.value,''); }
 }
});
test('undated attachment history downloads for both roles while known expired access remains blocked', async () => {
 for (const owner of [false,true]) {
  const f=fixture({owner,mode:'history'}); await f.ready(); assert.equal(f.button('Download').props.disabled,false); await f.button('Download').props.onClick(); await f.ready(); assert.deepEqual(f.calls.map(c=>c[0]),['download']);
  const expired=fixture({owner,mode:'history',available:false,reason:'expired'}); await expired.ready(); assert.equal(expired.button('Download').props.disabled,true); assert.match(content(expired.h.tree),/Attachments expired/);
 }
 const expired=fixture({available:false,reason:'expired'});await expired.ready();assert.equal(expired.h.find(n=>n.type==='input'&&n.props.type==='file'),undefined);
});
test('legacy response from an older backend is not falsely presented as an authorized upload', async () => {
 const f=fixture({available:false,reason:'legacy-needs-date'});await f.ready();assert.equal(f.h.find(n=>n.type==='input'&&n.props.type==='file'),undefined);assert.match(content(f.h.tree),/access could not be confirmed/);assert.equal(f.calls.length,0);
});
test('optional completion layout resets inherited checkbox width and styles the actual datetime input', () => {
 const css=readFileSync('src/client-hub/MakerChatAttachments.module.css','utf8');
 assert.match(css,/\.dialog \.legacy input\[type=checkbox\] \{[^}]*width:16px;[^}]*min-width:16px;[^}]*padding:0;[^}]*margin:3px 0 0;/);
 assert.match(css,/input\[type=datetime-local\]/);assert.doesNotMatch(css,/input\[type=date\]/);assert.match(css,/\.legacy \.check \{[^}]*gap:10px;[^}]*overflow-wrap:anywhere/);
});
test('upload paperclip sits immediately after Send while Maker Chat retains attachment access', async () => {
 const h=harness();fixtures.add(h);const empty={messages:[],photos:[],requests:[],requestReplies:[],notifications:[],visibility:[],privateWorkspace:null};
 h.overrides['./workspace-client']={...h.overrides['./workspace-client'],async loadProjectWorkspace(){return empty;},subscribeProjectWorkspace(){return()=>{};},clearHubPhotoCache(){}};
 const Component=h.load('src/client-hub/ProjectWorkspace.tsx').ProjectWorkspace;const props={project,owner:false};const render=()=>h.render(Component,props);render();await tick();render();
 const wrapper=h.find(n=>n.type==='div'&&n.props.className==='composerInput');assert.ok(wrapper);
 const children=[wrapper.props.children].flat();assert.equal(children[0].type,'textarea');assert.equal(children.length,1);
 const actions=h.find(n=>n.type==='div'&&n.props.className==='composerActions'); const actionChildren=[actions.props.children].flat(); assert.equal(actionChildren[1].props['aria-label'],'Attach files'); assert.equal(actionChildren[1].props.type,'button'); assert.equal(actionChildren[0].props.type,'submit');
 assert.equal(children[0].props.onKeyDown.name,'submitComposerOnEnter');
 const footer=h.find(n=>n.type==='div'&&n.props.className==='formFooter');assert.doesNotMatch(content(footer),/Attach files/);
 actionChildren[1].props.onClick({currentTarget:{isConnected:true}});render();const drawer=h.find(n=>n.type?.name==='MakerChatAttachments');assert.equal(drawer.props.openRequest.mode,'upload');
 const css=readFileSync('src/client-hub/ProjectWorkspace.module.css','utf8');assert.match(css,/\.composerActions \{ display:flex; align-items:center;/);assert.match(css,/\.workspace \.composerInput textarea \{[^}]*width:100%/);
});

test('Fox9 rename my copy is cancelable, retains extension and changes only confirmed display', async()=>{
 const f=fixture({owner:true,mode:'history'}); await f.ready();
 f.button('Rename my copy').props.onClick(); f.render();
 let dialog=f.h.find(n=>n.type?.name==='HubActionDialog'); assert.match(dialog.props.title,/Rename your/); dialog.props.onClose(); f.render(); assert.equal(f.calls.length,0);
 f.button('Rename my copy').props.onClick(); f.render(); f.h.find(n=>n.type==='input'&&n.props.autoFocus).props.onChange({target:{value:'Fitting reference'}}); f.render();
 dialog=f.h.find(n=>n.type?.name==='HubActionDialog'); dialog.props.onConfirm(); dialog.props.onConfirm(); await f.ready();
 assert.equal(f.calls.filter(c=>c[0]==='rename').length,1); assert.equal(f.calls[0][4],'Fitting reference.pdf'); assert.match(content(f.h.tree),/Fitting reference.pdf/); assert.match(content(f.h.tree),/Your copy was renamed\./);
 const expired=fixture({owner:true,mode:'history',available:false,reason:'expired'}); await expired.ready(); assert.equal(expired.button('Rename my copy').props.disabled,true);
});


test('Fox9 delayed rename locks duplicate actions and failure preserves the original name and edit', async()=>{
 let reject; const gate=new Promise((_yes,no)=>{reject=no;});
 const f=fixture({owner:true,mode:'history',rename:()=>gate}); await f.ready();
 f.button('Rename my copy').props.onClick(); f.render();
 f.h.find(n=>n.type==='input'&&n.props.autoFocus).props.onChange({target:{value:'Pending edit'}}); f.render();
 let dialog=f.h.find(n=>n.type?.name==='HubActionDialog'); dialog.props.onConfirm(); dialog.props.onConfirm(); f.render();
 dialog=f.h.find(n=>n.type?.name==='HubActionDialog'); assert.equal(dialog.props.busy,true);
 assert.equal(f.calls.filter(c=>c[0]==='rename').length,1); assert.match(content(f.h.tree),/fox.pdf/); assert.doesNotMatch(content(f.h.tree),/Your copy was renamed/);
 reject(new Error('Network response lost')); await f.ready();
 assert.equal(f.h.find(n=>n.type==='input'&&n.props.autoFocus).props.value,'Pending edit');
 assert.match(content(f.h.tree),/fox.pdf/); assert.doesNotMatch(content(f.h.tree),/Your copy was renamed/);
 f.h.find(n=>n.type?.name==='HubActionDialog').props.onClose(); f.render(); assert.equal(f.calls.length,1);
});
