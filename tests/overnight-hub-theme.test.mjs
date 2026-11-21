import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element, contrast } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function css(name,folder='client-hub'){const output=await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/${folder}/${name}.module.css`),{from:name+'.module.css'});output.root.walkAtRules('keyframes',rule=>rule.remove());return output.root.toString();}
const withoutAnimation=text=>{const root=postcss.parse(text);root.walkAtRules('keyframes',rule=>rule.remove());return root.toString();};
const global=[read('src/app/globals.css'),read('src/app/color-modes.css')].map(withoutAnimation),hub=await css('ClientHub'),work=await css('ProjectWorkspace'),owner=await css('OwnerPortal','owner');
function fixture(mode,own=false){const theme=element('div',own?{'data-owner-portal':'','data-color-mode':mode}:{'data-theme-scope':'public','data-color-mode':mode});const h=element('div',{class:'ClientHub_hub','data-client-hub':'','data-gate':'login'},theme);const w=element('section',{class:'ProjectWorkspace_workspace','data-active-tab':'chat'},own?theme:h);return {theme,h,w};}
test('dark forms blend with parent in both CSS orders rather than retaining global gray islands',()=>{
 for(const own of [false,true])for(const mode of ['light','dark'])for(const sheets of [[...global,owner,hub,work],[hub,work,owner,...global]]){const t=fixture(mode,own),compute=cascade(sheets);for(const cls of ['composer','form','resolveForm'])assert.equal(compute(element('form',{class:`ProjectWorkspace_${cls}`},t.w))['background-color'],'transparent',`${mode}/${own}/${cls}`);if(!own)for(const cls of ['loginForm','nicknameForm'])assert.equal(compute(element('form',{class:`ClientHub_${cls}`},t.h))['background-color'],'transparent');}
});
test('login centers on viewport without fixed height clipping and constrained chat has a single scrolling history',()=>{
 for(const width of [320,375,540,768,1280,1920]){const t=fixture('dark'),compute=cascade([...global,owner,hub,work],width);assert.equal(compute(t.h).display,'flex');assert.equal(compute(t.h)['align-items'],'center');assert.equal(compute(t.h)['justify-content'],'center');assert.equal(compute(t.h)['min-height'],'100dvh');assert.equal(compute(t.h).height,undefined);
 const panel=element('div',{class:'ProjectWorkspace_panel ProjectWorkspace_chatPanel'},t.w),log=element('div',{class:'ProjectWorkspace_chatLog'},panel),composer=element('form',{class:'ProjectWorkspace_composer'},panel),hidden=element('div',{class:'ProjectWorkspace_panel ProjectWorkspace_chatPanel',hidden:''},t.w);
 assert.equal(compute(t.w).display,'flex');assert.equal(compute(panel).display,'flex');assert.equal(compute(panel)['min-height'],'0');assert.equal(compute(panel).overflow,'hidden');assert.equal(compute(log).overflow,'auto');assert.equal(compute(log)['max-height'],'none');assert.equal(compute(composer).flex,'0 0 auto');assert.equal(compute(hidden).display,'none');}
});
test('photo actions remain above the full-card native opener; status/progress colors stay readable',()=>{
 for(const own of [false,true])for(const mode of ['light','dark']){const t=fixture(mode,own),compute=cascade([...global,owner,hub,work]);const card=element('article',{class:'ProjectWorkspace_photoCard'},t.w),open=element('button',{class:'ProjectWorkspace_photoOpen'},card),info=element('div',{class:'ProjectWorkspace_photoInfo'},card),actions=element('div',{class:'ProjectWorkspace_photoActions'},info);assert.equal(compute(open).position,'absolute');assert.equal(compute(open)['background-color'],'transparent');assert.equal(compute(open)['z-index'],'1');assert.equal(compute(actions)['z-index'],'2');const badge=element('span',{class:'ProjectWorkspace_badge','data-status':'in-progress'},t.w);assert.ok(contrast(compute(badge).color,compute(badge)['background-color'])>=4.5);}
});

test('expanded support reserves reply and explicit action space while only history shrinks',()=>{
 const t=fixture('dark'),compute=cascade([...global,hub,work],390),body=element('div',{class:'ProjectWorkspace_threadBody'},t.w),log=element('div',{class:'ProjectWorkspace_threadLog'},body),reply=element('form',{class:'ProjectWorkspace_resolveForm'},body),actions=element('div',{class:'ProjectWorkspace_threadActions'},body),hidden=element('div',{class:'ProjectWorkspace_threadBody',hidden:''},t.w);
 assert.equal(compute(body).display,'flex');assert.ok(compute(body)['max-height'].includes('dvh'));assert.equal(compute(log).flex,'1 1 auto');assert.equal(compute(log).overflow,'auto');assert.equal(compute(reply).flex,'0 0 auto');assert.equal(compute(actions).flex,'0 0 auto');assert.equal(compute(hidden).display,'none');
});

const information=await css('InformationTags'),bell=await css('HubNotificationBell');
test('NOTES2 uses confirmed blue/yellow status mapping and three readable manual label colors',()=>{
 for(const own of [false,true])for(const mode of ['light','dark'])for(const sheets of [[...global,owner,hub,work,information],[work,information,owner,hub,...global]]){
  const t=fixture(mode,own),compute=cascade(sheets);
  for(const [attrs,color] of [[{'data-status':'in-progress'},'#d8efff'],[{'data-status':'shipped'},'#fff0a3'],[{'data-state':'open'},'#d8efff']]){const badge=element('span',{class:'ProjectWorkspace_badge',...attrs},t.w),style=compute(badge);assert.equal(style['background-color'],color);assert.ok(contrast(style.color,color)>=4.5);}
  const list=element('ul',{class:'InformationTags_tags'},t.w);
  for(const [tag,color] of [['paid-100','#ceedd7'],['paid-partial','#fff0a3'],['dtd-needed','#ead8ff']]){const style=compute(element('li',{'data-information-tag':tag},list));assert.equal(style['background-color'],color);assert.ok(contrast(style.color,color)>=4.5,`${mode}/${own}/${tag}: ${style.color} on ${color}`);}
  const input=compute(element('textarea',{},t.w));assert.equal(input['background-color'],compute(t.w)['background-color'],'fields match their containing workspace');
 }
});
test('NOTES2 notification dismiss is positioned within its card and action surfaces stay transparent',()=>{
 for(const own of [false,true])for(const mode of ['light','dark']){
  const t=fixture(mode,own),root=element('div',{class:'HubNotificationBell_root'},t.w),panel=element('div',{class:'HubNotificationBell_panel'},root),list=element('ul',{},panel),card=element('li',{class:'HubNotificationBell_notificationCard'},list),open=element('button',{class:'HubNotificationBell_openNotification'},card),dismiss=element('button',{class:'HubNotificationBell_dismiss'},card),compute=cascade([...global,owner,hub,work,bell]);
  assert.equal(compute(card).position,'relative');assert.equal(compute(card)['border-radius'],'12px');assert.equal(compute(dismiss).position,'absolute');assert.equal(compute(open)['background-color'],'transparent');assert.equal(compute(dismiss)['background-color'],'transparent');assert.equal(compute(open).padding,'13px 43px 13px 12px');
 }
});
