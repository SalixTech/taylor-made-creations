import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
function fixture() {
  const h=harness(); let live={schemaVersion:1,revision:0,constructionMode:true};
  let reads=0,writes=[],begins=0,ends=0,notifications=0,readError=null,writeGate=null,readGate=null,begin=true;
  h.overrides['@/components/PublicSiteContext']={notifyPublicSitePublished(){notifications++;}};
  const store={
    async readLiveSiteAccess(){reads++; if(readGate)return readGate.promise; if(readError)throw readError; return structuredClone(live);},
    async updateConstructionMode(mode,revision){writes.push({mode,revision});if(writeGate)await writeGate.promise;live={schemaVersion:1,revision:revision+1,constructionMode:mode};return structuredClone(live);},
  };
  const props={store,disabled:false,beginUpdate(){begins++;return begin;},endUpdate(){ends++;}};
  const Component=h.load('src/owner/ConstructionModeSettings.tsx').ConstructionModeSettings;
  const render=()=>h.render(Component,props);
  const button=label=>h.find(n=>n.type==='button'&&content(n)===label);
  const toggle=()=>h.find(n=>n.type?.name==='Toggle');
  const dialog=()=>h.find(n=>n.type?.name==='Dialog');
  const action=label=>nodes(dialog()?.props.actions).find(n=>n.type==='button'&&content(n)===label);
  const stage=mode=>{toggle().props.onChange(mode);render();button('Update live').props.onClick();render();};
  return {h,props,render,button,toggle,dialog,action,stage,async open(){render();await flush();render();},get writes(){return writes;},get reads(){return reads;},get begins(){return begins;},get ends(){return ends;},get notifications(){return notifications;},set live(v){live=v;},set readError(v){readError=v;},set writeGate(v){writeGate=v;},set readGate(v){readGate=v;},set begin(v){begin=v;}};
}

test('Construction Mode reads separately, defaults on, and never writes on mount',async()=>{const t=fixture();await t.open();assert.match(content(t.h.tree),/Live Construction Mode: On/);assert.equal(t.toggle().props.checked,true);assert.equal(t.writes.length,0);assert.equal(t.button('Update live').props.disabled,true);assert.equal(t.reads,1);t.h.unmount();});
test('toggle only stages a change; opening requires explicit public-access confirmation',async()=>{const t=fixture();await t.open();t.toggle().props.onChange(false);t.render();assert.equal(t.writes.length,0);assert.equal(t.dialog(),undefined);t.button('Update live').props.onClick();t.render();assert.match(t.dialog().props.title,/Open the published website to visitors/);assert.match(content(t.dialog()),/allows anyone to read your already-published pages/);assert.match(content(t.dialog()),/does not publish any private draft edits/);t.action('Cancel').props.onClick();t.render();assert.equal(t.dialog(),undefined);assert.equal(t.writes.length,0);assert.equal(t.toggle().props.checked,false);t.h.unmount();});
test('confirm updates only requested access revision, duplicate clicks lock, and notification waits for acknowledgement',async()=>{const t=fixture();await t.open();t.stage(false);const gate=deferred();t.writeGate=gate;const click=t.action('Update live').props.onClick;click();click();t.render();assert.deepEqual(t.writes,[{mode:false,revision:0}]);assert.equal(t.begins,1);assert.equal(t.notifications,0);assert.equal(t.button('Updating live…').props.disabled,true);assert.equal(t.dialog(),undefined);gate.resolve();await flush();t.render();assert.equal(t.ends,1);assert.equal(t.notifications,1);assert.match(content(t.h.tree),/Construction Mode is off/);assert.equal(t.toggle().props.checked,false);assert.equal(t.button('Update live').props.disabled,true);t.h.unmount();});
test('closing is also explicit and correctly describes cached/public-asset limits',async()=>{const t=fixture();t.live={schemaVersion:1,revision:4,constructionMode:false};await t.open();t.stage(true);assert.match(t.dialog().props.title,/Turn Construction Mode on/);assert.match(content(t.dialog()),/does not delete your publication or erase previously downloaded content and public assets/);t.action('Update live').props.onClick();await flush();t.render();assert.deepEqual(t.writes,[{mode:true,revision:4}]);assert.match(content(t.h.tree),/Construction Mode is on/);t.h.unmount();});
test('unknown or disconnected live state cannot open the site',async()=>{for(const disconnected of [false,true]){const t=fixture();if(disconnected)t.props.store={};else t.readError=Error('Could not check live');await t.open();assert.equal(t.button('Update live').props.disabled,true);t.toggle().props.onChange(false);t.render();assert.equal(t.toggle().props.checked,true);assert.equal(t.writes.length,0);assert.match(content(t.h.tree),disconnected?/not connected/:/Could not check/);t.h.unmount();}});
test('failed or uncertain write requires readback before retry; selected intent and draft remain untouched',async()=>{const t=fixture();await t.open();t.stage(false);const gate=deferred();t.writeGate=gate;t.action('Update live').props.onClick();gate.reject(Error('Update not confirmed. Check again.'));await flush();t.render();assert.equal(t.notifications,0);assert.equal(t.ends,1);assert.equal(t.toggle().props.checked,false);assert.equal(t.button('Update live').props.disabled,true);assert.match(content(t.h.tree),/Update not confirmed/);t.button('Check again').props.onClick();await flush();t.render();assert.equal(t.button('Update live').props.disabled,false);assert.equal(t.writes.length,1);t.h.unmount();});
test('readback of an uncertain committed update resolves without replaying it',async()=>{const t=fixture();await t.open();t.stage(false);const gate=deferred();t.writeGate=gate;t.action('Update live').props.onClick();t.live={schemaVersion:1,revision:1,constructionMode:false};gate.reject(Error('Ack lost'));await flush();t.render();t.button('Check again').props.onClick();await flush();t.render();assert.equal(t.toggle().props.checked,false);assert.equal(t.button('Update live').props.disabled,true);assert.equal(t.writes.length,1);t.h.unmount();});
test('focus refresh preserves staged intent and updates the expected revision',async()=>{const t=fixture();t.live={schemaVersion:1,revision:1,constructionMode:true};await t.open();t.toggle().props.onChange(false);t.render();t.live={schemaVersion:1,revision:2,constructionMode:true};t.h.window.dispatchEvent(new Event('focus'));await flush();t.render();assert.equal(t.toggle().props.checked,false);t.button('Update live').props.onClick();t.render();t.action('Update live').props.onClick();await flush();assert.deepEqual(t.writes,[{mode:false,revision:2}]);t.h.unmount();});
test('duplicate checks do not overlap; older state cannot replace a known revision',async()=>{const t=fixture();t.live={schemaVersion:1,revision:4,constructionMode:false};await t.open();const gate=deferred();t.readGate=gate;const click=t.button('Check again').props.onClick;click();click();t.h.window.dispatchEvent(new Event('focus'));assert.equal(t.reads,2);gate.resolve({schemaVersion:1,revision:3,constructionMode:true});await flush();t.render();assert.match(content(t.h.tree),/older setting/);assert.equal(t.button('Update live').props.disabled,true);t.h.unmount();});
test('pending focus read cannot overwrite an acknowledged newer change',async()=>{const t=fixture();await t.open();t.stage(false);const gate=deferred();t.readGate=gate;t.h.window.dispatchEvent(new Event('focus'));t.action('Update live').props.onClick();await flush();gate.resolve({schemaVersion:1,revision:0,constructionMode:true});await flush();t.render();assert.equal(t.toggle().props.checked,false);assert.match(content(t.h.tree),/Live Construction Mode: Off/);t.h.unmount();});
test('owner operation lock or disabled state refuses a confirmed write',async()=>{for(const mode of ['busy','blocked']){const t=fixture();await t.open();t.stage(false);if(mode==='busy'){t.props.disabled=true;t.render();}else t.begin=false;t.action('Update live').props.onClick();await flush();assert.equal(t.writes.length,0);assert.equal(t.notifications,0);t.h.unmount();}});
test('unmount ignores pending read/write results and removes focus listener',async()=>{for(const mode of ['read','write']){const t=fixture();const gate=deferred();if(mode==='read'){t.readGate=gate;t.render();}else{await t.open();t.stage(false);t.writeGate=gate;t.action('Update live').props.onClick();}t.h.unmount();const reads=t.reads;gate.resolve({schemaVersion:1,revision:1,constructionMode:false});await flush();t.h.window.dispatchEvent(new Event('focus'));assert.equal(t.reads,reads);assert.equal(t.notifications,0);if(mode==='write')assert.equal(t.ends,1);}});
test('Contacts & Settings receives the independent control, not an OwnerContent field',()=>{const portal=readFileSync(new URL('../src/owner/OwnerPortal.tsx',import.meta.url),'utf8');const managers=readFileSync(new URL('../src/owner/OwnerTemplateManagers.tsx',import.meta.url),'utf8');assert.match(portal,/constructionSettings={<ConstructionModeSettings store={store}/);assert.match(portal,/operationRef\.current = true; \+\+loadRequestRef\.current; setBusy\(true\)/);assert.match(managers,/{constructionSettings}/);assert.doesNotMatch(portal,/draft\.site\.constructionMode|content\.site\.constructionMode/);});
test('portal access update locks other operations without saving, publishing, or replacing unsaved settings',async()=>{
  const h=harness();h.overrides['./HelpButton']={HelpButton:()=>null};h.overrides['./TaylorServices']={TaylorServices:()=>null};h.overrides['./CommissionRequests']={CommissionRequests:()=>null};
  const workspace=h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();let writes=0,publishes=0,signouts=0;
  const base=h.load('src/owner/storage.ts').createOwnerStore({read:async()=>structuredClone(workspace),update:async()=>{writes++;throw Error('No workspace writes permitted');}});
  const props={store:{...base,publishLive:async()=>{publishes++;throw Error('No publication permitted');}},mode:'cloud',userEmail:'owner@example.test',initialSection:'settings',onSignOut:async()=>{signouts++;}};
  const Portal=h.load('src/owner/OwnerPortal.tsx').default;const render=()=>h.render(Portal,props);render();await flush();render();
  const manager=()=>h.find(n=>n.type?.name==='ContactSettingsManager');manager().props.onEdit(d=>{d.site.telegram='UNSAVED';});render();const settings=manager().props.constructionSettings;
  assert.equal(settings.props.beginUpdate(),true);assert.equal(settings.props.beginUpdate(),false);render();assert.equal(manager().props.constructionSettings.props.disabled,true);
  h.find(n=>n.type==='button'&&content(n)==='Sign out').props.onClick();assert.equal(signouts,0);assert.equal(writes,0);assert.equal(publishes,0);assert.equal(manager().props.content.site.telegram,'UNSAVED');
  settings.props.endUpdate();render();assert.equal(manager().props.content.site.telegram,'UNSAVED');assert.equal(manager().props.constructionSettings.props.disabled,false);assert.equal(writes,0);assert.equal(publishes,0);h.unmount();
});
test('compact actions share a wrapping row while the disabled fieldset contains only the staged toggle',async()=>{
  const t=fixture();await t.open();
  const row=t.h.find(n=>n.type==='div'&&n.props.className==='actions');
  assert.deepEqual(nodes(row).filter(n=>n.type==='button').map(content),['Update live','Check again']);
  assert.equal(t.button('Update live').props['data-owner-button'],true);
  assert.match(t.button('Update live').props.className,/button primary/);
  assert.match(t.button('Check again').props.className,/button secondary/);
  const fieldset=t.h.find(n=>n.type==='fieldset');
  assert.equal(nodes(fieldset).some(n=>n.type==='button'),false);
  t.readError=Error('Live setting unavailable');t.button('Check again').props.onClick();await flush();t.render();
  assert.equal(t.h.find(n=>n.type==='fieldset').props.disabled,true);
  assert.equal(t.button('Update live').props.disabled,true);
  assert.equal(t.button('Check again').props.disabled,false);
  assert.equal(t.writes.length,0);t.h.unmount();
});
test('compact card has content-width actions, visible spacing and no replacement focus styles',()=>{
  const css=readFileSync(new URL('../src/owner/ConstructionModeSettings.module.css',import.meta.url),'utf8');
  const src=readFileSync(new URL('../src/owner/ConstructionModeSettings.tsx',import.meta.url),'utf8');
  assert.match(css,/\.controls\s*\{[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*14px 24px/s);
  assert.match(css,/\.actions\s*\{[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*10px/s);
  assert.match(css,/\.actions > button\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*auto/s);
  assert.match(css,/\.setting > label\s*\{\s*margin:\s*0/);
  assert.match(css,/\.content > p\s*\{\s*margin:\s*0/);
  assert.doesNotMatch(css,/outline:\s*(?:none|0)|box-shadow|color:|background/);
  assert.match(src,/It does not save or publish your draft/);
  assert.match(src,/Use Update live to apply/);
});
