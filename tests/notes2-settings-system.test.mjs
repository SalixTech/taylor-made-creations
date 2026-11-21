import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, nodes, content } from './owner-ui-harness.mjs';
import { cascade, element } from './helpers/css-cascade.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
import { whimsyAccountFixture as fixture } from './whimsy-account-fixture.mjs';
test('built-ins are immutable and custom words are validated, unique, bounded and separate from OFF', async () => {
  const f = fixture(), builtins = [...f.api.WHIMSICAL_CLIENT_WORDS];
  assert.equal(Object.isFrozen(f.api.WHIMSICAL_CLIENT_WORDS), true);
  assert.throws(() => f.api.WHIMSICAL_CLIENT_WORDS.push('Changed'));
  for (const word of builtins) assert.ok((await (await f.api.removeOwnerWhimsyTerm(word))).error);
  for (const bad of ['', '<script>', 'a@b.test', 'https://wolf.test', '123', 'Wolf\nPhone', 'x'.repeat(33), {}, null]) assert.ok((await (await f.api.addOwnerWhimsyTerm(bad))).error);
  await f.api.setOwnerWhimsy(false);
  assert.equal((await f.api.addOwnerWhimsyTerm(' Snow   leopard ')).saved, true);
  assert.ok((await f.api.addOwnerWhimsyTerm('snow leopard')).error);
  assert.ok((await f.api.addOwnerWhimsyTerm('FLOOF')).error);
  assert.deepEqual(f.api.readOwnerWhimsyTerms(), ['Snow leopard']);
  assert.equal(f.api.chooseWhimsicalClientWord(() => 1), 'Snow leopard');
  assert.equal(f.api.readOwnerWhimsy(), false);
  assert.deepEqual(fixture(new Map(),structuredClone(f.state.settings)).api.readOwnerWhimsyTerms(), ['Snow leopard']);
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVW') assert.equal((await f.api.addOwnerWhimsyTerm(`Wolf ${c}`)).saved, true);
  assert.equal(f.api.readOwnerWhimsyTerms().length, 24);
  assert.ok((await f.api.addOwnerWhimsyTerm('Fox')).error);
  assert.equal((await f.api.removeOwnerWhimsyTerm('Snow leopard')).saved, true);
  assert.equal((await f.api.addOwnerWhimsyTerm('Fox')).saved, true);
  assert.deepEqual(f.api.WHIMSICAL_CLIENT_WORDS, builtins);
});

test('legacy browser values are sanitized and never silently overwrite account preferences',async()=>{
 const key='tmc-owner-whimsy:a4ARjp0z8ZOByKlC2AfGzmMRj843:terms:v1',f=fixture();f.storage.set(key,'{not json');assert.deepEqual(f.api.readLocalOwnerWhimsyTerms(),[]);
 f.storage.set(key,JSON.stringify(['Floof','Fox','fox','a@b.test',null,{}]));assert.deepEqual(f.api.readLocalOwnerWhimsyTerms(),['Fox']);assert.deepEqual(f.api.readOwnerWhimsyTerms(),[]);
 f.storage.set(key,'x'.repeat(4001));assert.deepEqual(f.api.readLocalOwnerWhimsyTerms(),[]);f.storage.set(key,'["Otter"]');f.storage.set('tmc-owner-whimsy:a4ARjp0z8ZOByKlC2AfGzmMRj843','off');assert.equal(await f.api.importLocalWhimsy(),true);assert.equal(f.api.readOwnerWhimsy(),false);assert.deepEqual(f.api.readOwnerWhimsyTerms(),['Otter']);assert.equal(f.writes.length,1);
});

test('a removed custom label is replaced once while retained labels do not shuffle', async () => {
  const f = fixture(); await f.api.addOwnerWhimsyTerm('Dragon');
  const original = Math.random; Math.random = () => .999; try {
    const C = () => f.api.useAddClientLabel(); assert.equal(f.h.render(C), 'Add Floof'); await tick(); assert.equal(f.h.render(C), 'Add Dragon');
    await f.api.addOwnerWhimsyTerm('Otter'); f.h.render(C); await tick(); assert.equal(f.h.render(C), 'Add Dragon');
    await f.api.removeOwnerWhimsyTerm('Dragon'); f.h.render(C); await tick(); assert.equal(f.h.render(C), 'Add Otter'); f.h.unmount();
  } finally { Math.random = original; }
});

test('species extraction rejects forged labels, arbitrary text, inherited fields and malformed values', () => {
  const f = fixture(), { extractWhimsySpeciesSuggestions:extract } = f.h.load('src/owner/owner-whimsy-suggestions.ts');
  const records = [null, [], {species:'Bad'}, {answers:[{label:'Fursona Species',value:'Forged'}]}, {description:'Species: Forged'}, {submitted:[]}, {submitted:{species:['Fox']}}, {submitted:{species:'a@b.test'}}, Object.create({submitted:{species:'Inherited'}}), {submitted:Object.create({species:'Inherited'})}, {submitted:{species:'Wolf'},name:'PRIVATE NAME',email:'private@example.test'}, {submitted:{species:'wolf'}}, {submitted:{species:'Floof'}}, {submitted:{species:'Sea otter'}}];
  assert.deepEqual(extract(records), ['Wolf','Sea otter']);
  assert.deepEqual(extract([...Array(50).fill({}), {submitted:{species:'Too late'}}]), []);
  assert.equal(extract([...Array(50)].map((_,i) => ({submitted:{species:`Wolf ${String.fromCharCode(65+i%26)}`}}))).length,24);
  assert.deepEqual(f.api.readOwnerWhimsyTerms(), []);
});

function speciesFixture(options = {}) {
  const f = fixture(); let verified = false, current = true, reads = 0, sessions = 0, limitValue;
  f.h.overrides['./taylor-services-client'] = { async taylorOwnerSession() { sessions++; if (options.sessionError) throw Error('Revoked'); if (options.sessionGate) await options.sessionGate; verified = true; return {db:{}, assertCurrent(){if(!current)throw Error('Session changed');}}; } };
  f.h.overrides['firebase/firestore/lite'] = { collection(_db,path){assert.equal(verified,true);assert.equal(path,'commissionRequests');return path;},limit(n){limitValue=n;return n;},query(...parts){return parts;},async getDocs(){reads++;if(options.readGate)await options.readGate;return {docs:(options.records??[{submitted:{species:'Wolf'},name:'PRIVATE',email:'private@example.test'}]).map(value=>({data:()=>value}))};} };
  const api = f.h.load('src/owner/owner-whimsy-suggestions-client.ts');
  return {...f, options, api, endSession(){current=false;}, get reads(){return reads;},get sessions(){return sessions;},get limit(){return limitValue;}};
}

test('species review verifies first, reads bounded records, never auto-adds, and requires current owner Add', async () => {
  const f = speciesFixture(), review = await f.api.readOwnerWhimsySpeciesSuggestions();
  assert.equal(f.limit,50);assert.equal(f.reads,1);assert.equal(f.storage.size,0);assert.deepEqual(review.words,['Wolf']);assert.equal(Object.isFrozen(review.words),true);
  await assert.rejects(review.add('Forged'));assert.equal(f.sessions,1);assert.equal(f.storage.size,0);
  assert.equal((await review.add('Wolf')).saved,true);assert.equal(f.sessions,2);
  assert.deepEqual(f.writes,[{whimsyTerms:['Wolf']}]);assert.doesNotMatch(JSON.stringify(f.writes),/PRIVATE|private@example/);
});

test('species review rejects failed verification, revoked/changed sessions and late or canceled Add', async () => {
  const denied = speciesFixture({sessionError:true});await assert.rejects(denied.api.readOwnerWhimsySpeciesSuggestions());assert.equal(denied.reads,0);
  let resolve; const gate = new Promise(yes=>resolve=yes), f = speciesFixture({readGate:gate});const reading=f.api.readOwnerWhimsySpeciesSuggestions();await tick();f.endSession();resolve();await assert.rejects(reading);assert.equal(f.storage.size,0);
  const revoked=speciesFixture(), review=await revoked.api.readOwnerWhimsySpeciesSuggestions();revoked.options.sessionError=true;await assert.rejects(review.add('Wolf'));assert.equal(revoked.storage.size,0);
  const closed=speciesFixture(), closedReview=await closed.api.readOwnerWhimsySpeciesSuggestions();await assert.rejects(closedReview.add('Wolf',()=>false));assert.equal(closed.storage.size,0);
});

test('Settings puts equal-height Whimsy before Construction and business cards do not stretch', () => {
  const f=fixture(), C=f.h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager;
  const props={content:f.h.load('src/owner/defaults.ts').createDefaultOwnerContent(),onEdit(){throw Error('No cloud edits');},onRemove(){},onSync(){},userEmail:'owner@example.test',constructionSettings:{type:'Construction',props:{}}};
  f.h.render(C,props);const row=f.h.find(n=>n.props.className==='settingsTop');assert.equal(row.props.children[0].props.title,'Studio whimsy');assert.equal(row.props.children[1].type,'Construction');
  assert.equal(f.h.find(n=>n.type==='summary'&&content(n)==='Socials').type,'summary');
  const pencil=f.h.find(n=>n.props['aria-label']==='Edit whimsy words')??nodes(row.props.children[0].props.action).find(n=>n.props['aria-label']==='Edit whimsy words');pencil.props.onClick();f.h.render(C,props);assert.ok(f.h.find(n=>n.type?.name==='WhimsyWordsEditor'));
  const css=source('src/owner/OwnerTemplateManagers.module.css');assert.match(css,/\.settingsTop \{ align-items:stretch/);assert.match(css,/\.settingsDetails \{ align-items:start/);f.h.unmount();
});

test('word editor exposes no remove for originals and custom add/remove never modifies a cloud draft', async () => {
  const f=fixture(), C=f.h.load('src/owner/WhimsyWordsEditor.tsx').WhimsyWordsEditor;f.h.render(C,{onClose(){}});
  assert.equal(f.h.all(n=>n.props['aria-label']?.startsWith('Remove custom word')).length,0);
  f.h.find(n=>n.props.id==='owner-whimsy-word').props.onChange({target:{value:'Fox'}});f.h.render(C,{onClose(){}});
  f.h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();f.h.render(C,{onClose(){}});assert.match(content(f.h.tree),/Custom words saved to your owner account/);
  f.h.find(n=>n.props['aria-label']==='Remove custom word Fox').props.onClick();await tick();f.h.render(C,{onClose(){}});assert.deepEqual(f.api.readOwnerWhimsyTerms(),[]);f.h.unmount();
});

test('disclosure leaves dirty provider children mounted when collapsed and reopened (source simulation)', () => {
  const f=fixture();f.h.overrides['firebase/firestore/lite']={};f.h.overrides['firebase/functions']={};f.h.overrides['./taylor-services-client']={};f.h.overrides['./client-hub-client']={};
  const Email=f.h.load('src/owner/EmailStudio.tsx').EmailStudio, dirty=[];const props={onDirtyChange:v=>dirty.push(v)};
  f.h.render(Email,props);f.h.find(n=>n.type==='button'&&content(n)==='New template').props.onClick();f.h.render(Email,props);
  const name=f.h.find(n=>n.type==='input'&&n.props.maxLength===100);name.props.onChange({target:{value:'UNSAVED PROVIDER DRAFT'}});f.h.render(Email,props);assert.equal(dirty.at(-1),true);
  const child=f.h.tree, Disclosure=f.h.load('src/owner/ServiceDisclosure.tsx').ServiceDisclosure;
  for(const open of [false,true,false,true]){const tree=Disclosure({title:'Email studio',children:child,defaultOpen:open});assert.equal(tree.type,'details');assert.equal(tree.props.open,open);assert.equal(tree.props.children[1].props.children,child);assert.ok(nodes(tree).some(n=>n.type==='input'&&n.props.value==='UNSAVED PROVIDER DRAFT'));}
  assert.equal(dirty.at(-1),true);assert.doesNotMatch(source('src/owner/ServiceDisclosure.tsx'),/&&\s*children|hidden\s*\?\s*null/);f.h.unmount();
});

test('Active items summary button restores active filter from Low/Out/Trash without inventory writes', async () => {
  const h=harness();h.overrides['./inventory-client']={async readInventory(){return {items:[],categories:{schemaVersion:1,revision:0,categories:[]}};}};
  const C=h.load('src/owner/OwnerInventory.tsx').OwnerInventory;h.render(C);await tick();h.render(C);
  for(const filter of ['low','out','trash']){h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.onChange(filter);h.render(C);h.find(n=>n.type==='button'&&content(n)==='0Active items').props.onClick();h.render(C);assert.equal(h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.value,'all');assert.equal(h.find(n=>n.type==='button'&&content(n)==='0Active items').props['aria-pressed'],true);}
  h.unmount();
});

function contrast(a,b){const lum=hex=>{const c=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('live mode and thin status chips have readable light/dark foregrounds and explicit text',()=>{
  const construction=source('src/owner/ConstructionModeSettings.module.css').replaceAll(/:global\(([^)]+)\)/g,'$1');const status=source('src/owner/TaylorServices.module.css').replaceAll(/:global\(([^)]+)\)/g,'$1');const get=cascade([construction,status]);
  for(const mode of ['light','dark']){const bg=mode==='dark'?'#222222':'#ffffff',root=element('div',{'data-owner-portal':'','data-color-mode':mode}),live=element('p',{class:'liveStatus'},root),card=element('section',{class:'card statusCard'},root);
    for(const state of ['on','off']){const value=get(element('strong',{'data-live-mode':state},live));assert.ok(contrast(value.color,bg)>=4.5,`${mode} ${state} ${value.color}`);}
    for(const tone of ['good','waiting','unknown']){const value=get(element('span',{class:`badge ${tone}`,'data-service-status':tone},card));assert.equal(value['background-color'],'transparent');assert.equal(value.padding,'2px 7px');assert.ok(contrast(value.color,bg)>=4.5,`${mode} ${tone} ${value.color}`);}
  }
});

test('service headers retain accessible refresh icons; invoice workspace uses the requested accessible arrow-only refresh',()=>{
  for(const file of ['TaylorServices','StudioConnections','TrelloStudio','PayPalStudio','EmailStudio']){
    const text=source(`src/owner/${file}.tsx`);if(file==="PayPalStudio"){assert.match(text,/layout\.loadButton/);assert.match(text,/<button[^>]*aria-label="Refresh PayPal sandbox status"/);assert.match(text,/<RefreshIcon \/>/);assert.doesNotMatch(text,/<span>Load invoice workspace<\/span>/);assert.match(text,/onClick=\{\(\)=>void load\(\)\}/);continue;}if (["TaylorServices", "StudioConnections"].includes(file)) { assert.match(text,/<RefreshButton[^>]*label=/); } else { assert.match(text,/refreshButton/);assert.match(text,/<button[^>]*aria-label=/);assert.match(text,/<RefreshIcon \/>/);assert.match(text,/visuallyHidden/); }
  }
});

test('a closed species review makes no owner-data read after delayed verification',async()=>{
  let resolve;const gate=new Promise(yes=>resolve=yes),f=speciesFixture({sessionGate:gate});let active=true;
  const loading=f.api.readOwnerWhimsySpeciesSuggestions(()=>active);active=false;resolve();await assert.rejects(loading);assert.equal(f.reads,0);assert.equal(f.storage.size,0);
});

test('species editor reads only on Review, never auto-adds, and keeps explicit Add locked while pending',async()=>{
  const f=fixture();let reads=0,adds=[],finishRead,finishAdd;
  f.h.overrides['./owner-whimsy-suggestions-client']={readOwnerWhimsySpeciesSuggestions:async()=>{reads++;await new Promise(resolve=>finishRead=resolve);return {words:['Wolf'],async add(word,isCurrent){adds.push(word);await new Promise(resolve=>finishAdd=resolve);if(!isCurrent())throw Error('closed');return f.api.addOwnerWhimsyTerm(word);}};}};
  const C=f.h.load('src/owner/WhimsyWordsEditor.tsx').WhimsyWordsEditor,props={onClose(){}};f.h.render(C,props);assert.equal(reads,0);
  const click=f.h.find(n=>n.type==='button'&&content(n)==='Review species suggestions').props.onClick;click();click();await tick();f.h.render(C,props);assert.equal(reads,1);assert.equal(f.storage.size,0);assert.equal(f.h.tree.props.dismissDisabled,true);
  finishRead();await tick();f.h.render(C,props);assert.equal(f.storage.size,0);const add=f.h.find(n=>n.props['aria-label']==='Add suggested word Wolf').props.onClick;add();add();await tick();f.h.render(C,props);assert.deepEqual(adds,['Wolf']);assert.equal(f.storage.size,0);assert.equal(f.h.tree.props.dismissDisabled,true);
  finishAdd();await tick();f.h.render(C,props);assert.deepEqual(f.api.readOwnerWhimsyTerms(),['Wolf']);assert.equal(f.h.find(n=>n.props['aria-label']==='Add suggested word Wolf'),undefined);f.h.unmount();
});

test('studio checks keep exact unverified evidence, ignore forged readiness and make no provider sends',async()=>{
  const f=fixture();delete f.h.overrides['./StudioConnections'];let calls=[],deny=false;let responses={tmcStudioIntegrationStatus:{email:{configured:true,delivery:'not-verified'}},tmcPayPalStatus:{mode:'sandbox',invoicingReady:true,liveEnabled:false},tmcTrelloStatus:{ready:true}};
  f.h.overrides['./taylor-services-client']={async taylorOwnerSession(){if(deny)throw Error('Revoked');return {auth:{app:{}},assertCurrent(){}};},serviceReadError:()=> 'Owner verification unavailable.'};
  f.h.overrides['firebase/functions']={getFunctions:()=>({}),httpsCallable:(_functions,name)=>async()=>{calls.push(name);return {data:responses[name]};}};
  const C=f.h.load('src/owner/StudioConnections.tsx').StudioConnections;f.h.render(C);assert.equal(calls.length,0);const button=()=>f.h.find(n=>n.props.label==='Refresh studio connections');button().props.onClick();button().props.onClick();await tick();f.h.render(C);
  assert.deepEqual(calls.sort(),['tmcPayPalStatus','tmcStudioIntegrationStatus','tmcTrelloStatus']);assert.match(content(f.h.tree),/Configured · unverified/);assert.match(content(f.h.tree),/Sandbox configured · unverified/);assert.match(content(f.h.tree),/Sync configured · unverified/);assert.doesNotMatch(content(f.h.tree),/Operational|Healthy/);assert.equal(f.h.all(n=>n.type==='details').length,0);
  responses={tmcStudioIntegrationStatus:{email:{configured:true,delivery:'verified'}},tmcPayPalStatus:{mode:'live',invoicingReady:true,liveEnabled:true},tmcTrelloStatus:{ready:'yes'}};button().props.onClick();await tick();f.h.render(C);assert.doesNotMatch(content(f.h.tree),/configured · unverified|Configured · unverified/);assert.match(content(f.h.tree),/Not checked/);
  deny=true;button().props.onClick();await tick();f.h.render(C);assert.equal(calls.length,6);assert.match(content(f.h.tree),/Owner verification unavailable/);f.h.unmount();
});
