import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, nodes } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
import { cascade, element } from './helpers/css-cascade.mjs';
const path='src/owner/owner-whimsy.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
import { whimsyAccountFixture as fixture } from './whimsy-account-fixture.mjs';
test('Whimsy account defaults on; confirmed OFF persists across another signed-in view without draft writes',async()=>{
 const f=fixture();assert.equal(f.api.readOwnerWhimsy(),true);assert.equal(await f.api.setOwnerWhimsy(false),true);assert.equal(f.api.readOwnerWhimsy(),false);
 assert.equal(fixture(new Map(),structuredClone(f.state.settings)).api.readOwnerWhimsy(),false);assert.equal(f.storage.size,0);assert.deepEqual(f.writes,[{whimsyEnabled:false}]);
});
test('cloud OFF wins over browser ON and failed account saves never invent confirmation',async()=>{
 const f=fixture(new Map([['tmc-owner-whimsy:a4ARjp0z8ZOByKlC2AfGzmMRj843','on']]));f.state.settings.whimsyEnabled=false;assert.equal(f.api.readOwnerWhimsy(),false);f.state.retry=true;assert.equal(await f.api.setOwnerWhimsy(true),false);assert.equal(f.api.readOwnerWhimsy(),false);assert.equal(f.writes.length,0);
});
test('playful label is hydration-stable, randomizes once, and never shuffles across repeated renders or toggle',async()=>{
 const f=fixture(),label=()=>f.api.useAddClientLabel();assert.equal(f.h.render(label),'Add Floof');await tick();const chosen=f.h.render(label);
 assert.match(chosen,/^Add (Floof|Scales|Feathers|Fluff|Fuzz|Paws)$/);for(let i=0;i<30;i++)assert.equal(f.h.render(label),chosen);
 await f.api.setOwnerWhimsy(false);assert.equal(f.h.render(label),'Add Client');await f.api.setOwnerWhimsy(true);await tick();assert.equal(f.h.render(label),chosen);f.h.unmount();
 let serverReads=0;const server=sourceLoader({'./use-studio-settings':{useStudioSettings:()=>({settings:null}),readStudioSettings:()=>null},react:{useSyncExternalStore(_subscribe,_client,serverSnapshot){serverReads++;return serverSnapshot();}}})(path);assert.equal(server.useOwnerWhimsy(),true);assert.equal(serverReads,1);
});
test('random word selection remains finite and allowlisted for every boundary',()=>{
 const {api}=fixture();for(const value of [-10,0,.5,.9999,1,100,NaN,Infinity])assert.ok(api.WHIMSICAL_CLIENT_WORDS.includes(api.chooseWhimsicalClientWord(()=>value)));
});
test('settings toggle saves cosmetic account preference without changing site draft',async()=>{
 const f=fixture(),component=f.h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager,draft=f.h.load('src/owner/defaults.ts').createDefaultOwnerContent();let writes=0;
 const props={content:draft,onEdit(){writes++;},onRemove(){},userEmail:'owner@example.test',onSync(){}};f.h.render(component,props);
 f.h.find(node=>node.props.label==='Whimsy').props.onChange(false);await tick();f.h.render(component,props);assert.equal(f.h.find(node=>node.props.label==='Whimsy').props.checked,false);assert.equal(writes,0);assert.deepEqual(f.writes,[{whimsyEnabled:false}]);assert.ok(f.h.find(node=>node.type?.name==='StudioPreferenceStatus'));f.h.unmount();
});
test('Add client sits with Refresh and keeps an accessible non-whimsical action name',()=>{
 const source=readFileSync(new URL('../src/owner/OwnerClientHub.tsx',import.meta.url),'utf8');assert.match(source,/directoryActions[\s\S]*?aria-label="Add client"[\s\S]*?Refresh/);
 assert.match(source,/Dismiss client notification[\s\S]*?<svg/);
});
test('connection status badges stay in card heading and every file picker gets shared theme',()=>{
 const h=harness();delete h.overrides['./StudioConnections'];h.overrides['firebase/functions']={getFunctions(){},httpsCallable(){}};h.overrides['./taylor-services-client']={serviceReadError(){},taylorOwnerSession(){throw Error('not called');}};h.render(h.load('src/owner/StudioConnections.tsx').StudioConnections);
 const articles=h.all(node=>node.type==='article');assert.equal(articles.length,4);for(const article of articles){const heading=nodes(article).find(node=>node.props.className==='serviceHeading');assert.ok(nodes(heading).some(node=>node.type==='h3'));assert.ok(nodes(heading).some(node=>node.props['data-service-status']==='waiting'));}
 const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');assert.match(css,/input\[type="file"\]::file-selector-button/);assert.match(css,/prefers-reduced-motion:\s*reduce/);
});
test('static CSS cascade skips standard and prefixed keyframes without treating offsets as selectors',()=>{
 const rule=cascade(['p{color:#000000}@keyframes fade{0%,94%{opacity:1}100%{opacity:0}}@-webkit-keyframes slide{from{left:0}to{left:10px}}']);assert.equal(rule(element('p')).color,'#000000');
});
