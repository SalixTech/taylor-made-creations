import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element, contrast } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=async name=>(await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/owner/${name}.module.css`),{from:`${name}.module.css`})).css;
const [portal,settings,construction,status]=await Promise.all(['OwnerPortal','OwnerTemplateManagers','ConstructionModeSettings','TaylorServices'].map(compile));
const base=[read('src/app/globals.css'),read('src/app/color-modes.css'),portal];

test('compiled Settings geometry stays compact and responsive, independent of global/module order',()=>{
 for(const width of [375,700,900,1280])for(const sheets of [[...base,settings],[settings,...base]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':'dark',class:'OwnerPortal_portal'}),pair=element('div',{class:'OwnerTemplateManagers_settingsTop'},root),details=element('div',{class:'OwnerTemplateManagers_settingsDetails'},root),card=element('section',{class:'OwnerPortal_card'},pair),get=cascade(sheets,width);
  assert.equal(get(pair)['grid-template-columns'],width<=850?'1fr':'repeat(2,minmax(0,1fr))');assert.equal(get(pair)['align-items'],'stretch');assert.equal(get(details)['align-items'],'stretch');assert.equal(get(card).padding,'20px');
  if(width>850){assert.equal(get(pair)['grid-template-rows'],'auto 1fr');assert.equal(get(card)['grid-template-rows'],'subgrid');assert.equal(get(card)['grid-row'],'span 2');const header=element('div',{class:'OwnerPortal_cardHeading'},card);assert.equal(get(header)['margin-bottom'],'0');}
 }
});

test('compiled status and construction semantic colors survive full theme selectors in either order',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[...base,construction,status],[construction,status,...base]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),card=element('section',{class:'TaylorServices_card TaylorServices_statusCard'},root),live=element('p',{class:'ConstructionModeSettings_liveStatus'},card),get=cascade(sheets),bg=get(card)['background-color'];
  for(const state of ['on','off']){const value=get(element('strong',{'data-live-mode':state},live));assert.equal(value.color,mode==='dark'?(state==='on'?'#a9edc4':'#ffb1c1'):(state==='on'?'#236b3c':'#a31c3c'));assert.ok(contrast(value.color,bg)>=4.5);}
  for(const tone of ['good','waiting','unknown']){const value=get(element('span',{class:`TaylorServices_badge TaylorServices_${tone}`,'data-service-status':tone},card));assert.equal(value['background-color'],'transparent');assert.equal(value.padding,'2px 7px');assert.ok(contrast(value.color,bg)>=4.5);}
 }
});
