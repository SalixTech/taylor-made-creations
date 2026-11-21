import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {harness,content} from './owner-ui-harness.mjs';
function setup(guarded=true){
 const h=harness(),values=new Map();let now=1000,writes=0;h.window.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes++;values.set(k,v);}};
 const policy=h.load('src/components/owner-light-guard.ts');h.overrides['./owner-light-guard']={...policy,ownerLightGuarded:scope=>guarded&&scope==='owner'};
 h.globals.Date=class extends Date{static now(){return now;}};h.globals.setTimeout=()=>1;h.globals.clearTimeout=()=>{};
 const C=h.load('src/components/ColorMode.tsx').ColorModeToggle,render=scope=>h.render(C,{scope:scope??'owner'}),button=()=>h.find(n=>n.props['data-theme-toggle']!==undefined),fox=()=>h.find(n=>n.type?.name==='LightSideFox');render();render();return{h,render,button,fox,values,get writes(){return writes;},setNow:n=>now=n};
}
test('owner fox intercepts light attempt without theme/account writes; dismiss remains available without a roll',()=>{
 const f=setup();f.button().props.onClick();f.render();assert.ok(f.fox());assert.equal(f.fox().props.encounter,0);f.fox().props.onClose();f.render();assert.equal(f.fox(),undefined);assert.equal(f.writes,0);assert.equal(f.button().props['data-theme-mode'],'dark');f.h.unmount();
});
test('each guarded opening rotates the encounter with no cooldown and a fresh stable opening identity',()=>{
 const f=setup();for(let i=0;i<4;i++){f.button().props.onClick();f.render();assert.equal(f.fox().props.encounter,i);assert.equal(f.fox().props.onClaim,undefined);assert.match(f.fox().props.opening.id,/^[0-9a-f-]{36}$/);f.fox().props.onClose();f.render();assert.notEqual(f.button().props['aria-disabled'],true);}assert.equal(f.writes,0);f.h.unmount();
});
test('drag gestures and Alt-key reposition remain available without accidentally opening fox',()=>{
 const f=setup();f.h.window.innerWidth=500;f.h.window.innerHeight=800;
 const fire=(type,props)=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);f.h.window.dispatchEvent(e);};
 f.button().props.onPointerDown({button:0,pointerId:1,clientX:300,clientY:600,currentTarget:{getBoundingClientRect:()=>({left:290,top:590})}});fire('pointermove',{pointerId:1,clientX:200,clientY:500});fire('pointerup',{pointerId:1});f.button().props.onClick();f.render();assert.equal(f.fox(),undefined);assert.ok(f.button().props.style);
 assert.match(f.button().props['aria-keyshortcuts'],/Alt\+ArrowLeft/);f.h.unmount();
});
test('unguarded development behavior and public/client theme scopes keep ordinary preference toggle',()=>{
 for(const [guarded,scope]of [[false,'owner'],[true,'public'],[true,'hub']]){const f=setup(guarded);f.render(scope);f.button().props.onClick();f.render(scope);assert.equal(f.fox(),undefined);assert.ok(f.writes>0);f.h.unmount();}
});
test('fox dialog keeps original photo and X while omitting footer/actions and delegating verified outcome copy',()=>{
 const h=harness(),C=h.load('src/components/LightSideFox.tsx').LightSideFox,opening=h.load('src/components/fox-gold-bank.ts').createFoxOpening('12345678-1234-4123-8123-123456789012');let closed=0;h.render(C,{opening,encounter:0,onClose(){closed++;}});const dialog=h.find(n=>n.type?.name==='Dialog');assert.equal(dialog.props.title,'You have encountered a fox');assert.equal(dialog.props.actions,null);dialog.props.onClose();assert.equal(closed,1);const image=h.find(n=>n.type==='Image');assert.equal(image.props.src,'/images/light-side-fox.jpg');assert.equal(image.props.width,2040);assert.equal(image.props.height,2048);const game=h.find(n=>n.type?.name==='FoxGoldGame');assert.equal(game.props.mode,'owner');assert.equal(game.props.opening,opening);assert.doesNotMatch(content(dialog),/Just a little fox gift|Close|Claim 20|not money|cooldown/);const css=readFileSync('src/components/LightSideFox.module.css','utf8');assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/animation:none/);assert.match(css,/height:auto/);h.unmount();
});
test('asset bytes match the authorized original fox upload',()=>{const bytes=readFileSync('public/images/light-side-fox.jpg');assert.equal(createHash('sha256').update(bytes).digest('hex'),'dcf81154a77587cf4a5f07fdc1cc04e270f4f89cb062c5858ab9fb93ab3ee681');});
test('production owner gate is dark even for saved light; development and other scopes retain saved preferences',()=>{
 for(const env of ['production','development']){const h=harness();h.process.env.NODE_ENV=env;h.window.localStorage={getItem:k=>k==='tmc-display-areas-v1'?JSON.stringify({owner:'light',public:'light',hub:'light'}):null};const theme=h.load('src/components/ColorMode.tsx');assert.equal(theme.readColorMode('owner'),env==='production'?'dark':'light');assert.equal(theme.readColorMode('public'),'light');assert.equal(theme.readColorMode('hub'),'light');h.unmount();}
});
test('production bootstrap initial paint uses dark only on Taylor owner routes without writing preferences',()=>{
 for(const env of ['production','development'])for(const pathname of ['/taylor','/taylor/photos','/owner','/client-hub','/']){
  const h=harness();h.process.env.NODE_ENV=env;const {themeBootstrap}=h.load('src/components/theme-bootstrap.ts'),{initialThemeDefaults}=h.load('src/components/theme-settings.ts');const script=themeBootstrap(initialThemeDefaults(),{owner:'light',public:'light',hub:'light'});const root={style:{},dataset:{}};
  const storage={getItem:()=>null,setItem(){assert.fail('bootstrap must not write a preference');}};
  new Function('location','localStorage','sessionStorage','document','setTimeout',script)({pathname},storage,storage,{documentElement:root},()=>1);
  assert.equal(root.style.colorScheme,env==='production'&&/^\/(taylor|owner)(\/|$)/.test(pathname)?'dark':'light');h.unmount();
 }
});
test('later owner account hydration and theme defaults cannot reapply light to production owner gate',()=>{
 const h=harness();h.process.env.NODE_ENV='production';h.window.localStorage={getItem:()=>null};const runtime=h.load('src/components/theme-runtime.ts'),Gate=h.load('src/owner/OwnerGateFrame.tsx').OwnerGateFrame;let writes=0;
 const light={schemaVersion:1,revision:1,modes:{owner:'light',public:'light',hub:'light'}};
 const binding=runtime.bindThemeAccount('owner','synthetic-owner',null,async()=>{writes++;return light;});h.render(Gate,{});assert.equal(h.tree.props['data-color-mode'],'dark');binding.update(light);runtime.applySiteThemeDefaults({...light,defaultMode:'light'});h.render(Gate,{});assert.equal(h.tree.props['data-color-mode'],'dark');assert.equal(writes,0);binding.close();h.unmount();
});

test('queued owner launcher activations cannot create another opening before actual close',()=>{const f=setup();const click=f.button().props.onClick;click();click();f.render();const opening=f.fox().props.opening;click();f.render();assert.equal(f.fox().props.opening,opening);assert.equal(f.fox().props.encounter,0);f.fox().props.onClose();f.render();click();f.render();assert.notEqual(f.fox().props.opening,opening);assert.equal(f.fox().props.encounter,1);f.h.unmount();});
