import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes} from './owner-ui-harness.mjs';
import fs from 'node:fs';
const live=[];afterEach(()=>live.splice(0).forEach(h=>h.unmount()));
test('photo library opens its own guarded modal; every close path respects synchronous busy state',()=>{
 const h=harness();live.push(h);h.overrides['./CloudFileHub']={CloudFileHub:function CloudFileHub(){return null}};
 const C=h.load('src/owner/AssetLibrary.tsx').CloudFileDialog;let closes=0;const selected=[];const props={onClose:()=>closes++,onSelect:src=>selected.push(src)};const render=()=>h.render(C,props);render();
 const hub=()=>nodes(h.tree).find(n=>n.type.name==='CloudFileHub');const dialog=()=>nodes(h.tree).find(n=>n.type.name==='Dialog');const staleClose=dialog().props.onClose;let stopped=false;h.tree.props.onKeyDown({key:'Escape',stopPropagation(){stopped=true}});assert.equal(stopped,true);
 hub().props.onBusyChange(true);staleClose();assert.equal(closes,0);render();assert.equal(dialog().props.dismissDisabled,true);hub().props.onSelect('/api/cloud-media/id');assert.deepEqual(selected,[]);
 hub().props.onBusyChange(false);render();hub().props.onSelect('/api/cloud-media/id');assert.deepEqual(selected,['/api/cloud-media/id']);assert.equal(closes,1);
});
test('beta login fox resolves verified anonymous/account state, main owner entry remains explicit owner game',()=>{
 for(const workspace of ['main','beta']){
  const h=harness();live.push(h);h.process.env.NODE_ENV='production';h.process.env.NEXT_PUBLIC_TMC_WEBSITE_WORKSPACE=workspace;
  h.overrides['./theme-toggle-position']={useThemeTogglePosition:()=>({position:null,dragging:false,consumeDragClick:()=>false})};
  h.overrides['./ThemeDefaultsProvider']={useThemeDefaults:()=>({defaults:{},initialModes:{owner:'dark'}})};
  h.overrides['./theme-runtime']={themeSubscribe:()=>()=>{},effectiveTheme:()=> 'dark',themeSaveState:()=>'',chooseTheme:()=>{throw Error('No theme write')}};
  const C=h.load('src/components/ColorMode.tsx').ColorModeToggle;h.render(C,{scope:'owner'});const toggle=h.find(n=>n.type==='button'&&n.props['data-theme-toggle']);toggle.props.onClick();h.render(C,{scope:'owner'});
  const fox=h.find(n=>n.type.name==='LightSideFox');assert.ok(fox);assert.equal(typeof fox.props.renderGame,workspace==='beta'?'function':'undefined');
  if(workspace==='beta'){const body=fox.props.renderGame('image',()=>{});assert.equal(body.type.name,'ConstructionFoxGame');assert.equal(body.props.anonymousMemory.read(),null);assert.equal(body.props.opening,fox.props.opening);}
 }
});
test('beta toolbar uses measured offset for feedback and lays out title before sign-out',()=>{
 const css=fs.readFileSync('src/owner/OwnerPortal.module.css','utf8'),source=fs.readFileSync('src/owner/OwnerPortal.tsx','utf8');
 assert.match(source,/new ResizeObserver\(measure\)/);assert.match(source,/--owner-toolbar-height/);assert.match(css,/content>\.successNotice.*content>\.errorNotice\{position:sticky;top:calc\(var\(--owner-toolbar-height\)/);assert.match(source,/workspaceBrand}>Beta builder/);assert.match(source,/builderSignOut/);
});
