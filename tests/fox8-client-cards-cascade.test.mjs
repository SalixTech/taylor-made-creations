import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element, contrast } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
async function css(folder,name){return(await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/${folder}/${name}.module.css`),{from:name+'.module.css'})).css;}
const global=[read('src/app/globals.css'),read('src/app/color-modes.css')];
const portal=await css('owner','OwnerPortal'),cards=await css('owner','OwnerClientHub'),button=await css('owner','OwnerButton'),milestones=await css('owner','HubMilestoneEditor'),select=await css('components','SiteSelect'),choices=await css('client-hub','ProjectChoiceBar');
const windowCss=await css('client-hub','HubWorkspaceWindow'),work=await css('client-hub','ProjectWorkspace');
const modules=[portal,cards,button,milestones,select,choices,windowCss,work];
const orders=[[...global,...modules],[...modules,...global]];
function fixture(mode){const html=element('html'),frame=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'},html),root=element('section',{class:'OwnerClientHub_root'},frame);return{frame,root};}

test('Fox8 identity cards retain selected styling and hierarchy through either dark CSS load order',()=>{
 for(const sheets of orders)for(const mode of ['light','dark']){
  const t=fixture(mode),compute=cascade(sheets),row=element('button',{class:'OwnerClientHub_clientRow','aria-pressed':'true','data-owner-button':''},t.root),name=element('span',{class:'OwnerClientHub_clientName'},row),strong=element('strong',{},name),code=element('code',{},name);
  assert.match(compute(row).background,/linear-gradient/);assert.notEqual(compute(row)['border-color'],mode==='dark'?'#f4f1f2':'#7f0011');
  assert.equal(compute(strong)['font-size'],'13px');assert.equal(compute(code)['font-size'],'11px');
  const project=element('article',{class:'OwnerClientHub_project','data-selected':'true'},t.root),secondary=element('span',{class:'OwnerClientHub_projectClientName'},project);
  assert.equal(compute(secondary).color,'#d0d0d0');
 }
});

test('Fox8 shared popup and inline selector rail is not flattened by generic dark button rules',()=>{
 for(const sheets of orders)for(const mode of ['light','dark']){
  const t=fixture(mode),compute=cascade(sheets),root=element('div',{class:'ProjectChoiceBar_root'},t.frame),list=element('ul',{class:'ProjectChoiceBar_choices'},root),li=element('li',{},list),btn=element('button',{'data-owner-button':'','aria-pressed':'true'},li),identity=element('span',{class:'ProjectChoiceBar_identity'},btn),small=element('small',{},identity),selected=element('span',{class:'ProjectChoiceBar_selected'},btn);
  assert.match(compute(btn).background,/linear-gradient/);assert.equal(compute(btn)['min-height'],'104px');
  assert.equal(compute(small).color,'#d0d0d0');assert.equal(compute(selected).color,'#d0d0d0');
  assert.ok(contrast(compute(small).color,'#950020')>=4.5);
 }
});

test('Fox8 default and per-commission milestone fields keep theme and aligned control sizes',()=>{
 for(const sheets of orders)for(const mode of ['light','dark'])for(const nested of [false,true]){
  const t=fixture(mode),compute=cascade(sheets),dialog=element('dialog',{class:'OwnerPortal_dialog'},t.root),body=element('div',{class:'OwnerPortal_dialogBody'},dialog),outer=nested?element('fieldset',{class:'OwnerClientHub_form'},body):body,editor=element('fieldset',{class:'HubMilestoneEditor_editor'},outer),rows=element('div',{class:'HubMilestoneEditor_rows'},editor),row=element('div',{class:'HubMilestoneEditor_row'},rows),name=element('label',{class:'HubMilestoneEditor_name'},row),input=element('input',{},name),stage=element('div',{class:'HubMilestoneEditor_stage'},row),field=element('div',{class:'OwnerPortal_field OwnerPortal_ownerSelect'},stage),label=element('label',{},field),site=element('div',{class:'SiteSelect_root'},field),combo=element('button',{role:'combobox',class:'SiteSelect_control'},site),remove=element('button',{'data-owner-button':'',class:'OwnerButton_button OwnerButton_secondary HubMilestoneEditor_remove'},row);
  assert.equal(compute(row)['align-items'],'end');assert.equal(compute(field).margin,'0');assert.equal(compute(label).margin,'0');
  assert.equal(compute(input).height,'44px');assert.equal(compute(combo).height,'44px');assert.equal(compute(remove)['min-height'],'44px');assert.equal(compute(input)['border-radius'],'10px');
  if(mode==='dark'){assert.equal(compute(stage)['background-color'],'transparent');assert.equal(compute(input)['background-color'],'#2c2c2d');assert.equal(compute(combo)['background-color'],'#2c2c2d');}
  assert.equal(compute(remove)['border-radius'],'10px');assert.equal(compute(remove).appearance,'none');
 }
});

test('Fox9 archive icon keeps a full hit target and selected appearance',()=>{
 const source=read('src/owner/OwnerClientHub.tsx'); assert.match(source,/aria-label=\{`Show archived commissions/); assert.match(source,/aria-pressed=\{showArchived\}/);
 for(const sheets of orders)for(const width of [320,375,768,1440]){
  const t=fixture('dark'),compute=cascade(sheets,width),heading=element('div',{class:'OwnerClientHub_commissionsHeading'},t.root),button=element('button',{class:'OwnerClientHub_archiveButton','data-owner-button':''},heading);
  assert.equal(compute(button)['min-width'],'44px');
 }
});


test('Fox8 workspace popup close remains borderless and transparent in both theme modes and CSS orders',()=>{
 assert.match(read('src/client-hub/HubWorkspaceWindow.tsx'),/data-owner-button aria-label="Close workspace popup"/);
 for(const sheets of orders)for(const mode of ['light','dark']){
  const t=fixture(mode),compute=cascade(sheets),host=element('div',{class:'HubWorkspaceWindow_host'},t.frame),dialog=element('dialog',{class:'HubWorkspaceWindow_dialog'},host),head=element('header',{},dialog),close=element('button',{'data-owner-button':'','aria-label':'Close workspace popup'},head);
  assert.equal(compute(close)['background-color'],'transparent');assert.equal(compute(close).border,'0');assert.equal(compute(close)['box-shadow'],'none');
  close.states.add('focus-visible');assert.match(compute(close).outline,/2px solid/);
 }
});

test('Fox9 restored summary cards preserve count filters and red logo card without repeated marketing hero',()=>{
 const source=read('src/owner/OwnerClientHub.tsx');assert.doesNotMatch(source,/A home for every commission\.|MADE FOR YOUR CLIENTS/);assert.match(source,/aria-label="View all clients"/);assert.match(source,/aria-label="View active clients"/);assert.match(source,/A little less wondering/);
 for(const sheets of orders)for(const width of [375,900,1440]){
  const t=fixture('dark'),compute=cascade(sheets,width),stats=element('div',{class:'OwnerClientHub_studioStats'},t.root),count=element('button',{'data-owner-button':''},stats),title=element('span',{},count),number=element('strong',{},count),note=element('div',{class:'OwnerClientHub_studioCallout'},stats);
  assert.equal(compute(stats).display,'grid');assert.equal(compute(count).display,'block');assert.equal(compute(title)['font-size'],'9px');assert.equal(compute(number)['font-size'],'27px');assert.equal(compute(note).display,'flex');assert.equal(compute(note)['min-height'],width<=850?'100px':'110px');
 }
});


test('render-found inline clipping and popup whitespace fixes survive the complete cascade',()=>{
 for(const sheets of orders)for(const width of [320,390,768,1440]){
  const t=fixture('dark'),compute=cascade(sheets,width),workspace=element('div',{class:'ProjectWorkspace_workspace'},t.frame),track=element('div',{class:'ProjectWorkspace_milestones',role:'region',tabindex:'0'},workspace),node=element('div',{},track),label=element('small',{},node),hero=element('div',{class:'ProjectWorkspace_overviewHero'},workspace),identity=element('div',{},hero),tags=element('div',{class:'ProjectWorkspace_informationLabels'},hero),form=element('form',{class:'ProjectWorkspace_uploadForm'},workspace),field=element('label',{},form);
  assert.equal(compute(node).flex,'1 0 56px');assert.equal(compute(node)['min-width'],'56px');assert.equal(compute(track)['overflow-x'],'auto');assert.equal(compute(label)['overflow-wrap'],'anywhere');assert.equal(compute(label)['font-size'],'11px');
  assert.equal(compute(hero)['flex-wrap'],'wrap');assert.equal(compute(identity)['min-width'],'0');assert.equal(compute(tags).margin,'0');assert.equal(compute(field).margin,'0');assert.equal(compute(form).gap,'10px');
 }
});

test('Fox11 card columns, fitted directory logo, current marker and compact label X survive dark cascade order',()=>{
 for(const sheets of orders){
  const t=fixture('dark'),compute=cascade(sheets),project=element('article',{class:'OwnerClientHub_project'},t.root),tags=element('div',{class:'OwnerClientHub_projectTags'},project),marker=element('span',{class:'OwnerClientHub_currentCommission'},project);
  const nav=element('nav',{class:'OwnerPortal_sideNav'},t.frame),active=element('a',{'aria-current':'page'},nav);
  assert.equal(compute(active)['background-color'],'#7f0011');
  assert.equal(compute(project).display,'grid'); assert.equal(compute(tags)['grid-column'],'2'); assert.equal(compute(tags)['align-items'],'flex-end');
  assert.equal(compute(marker).position,'absolute'); assert.equal(compute(marker).background,'#00b1f5');
  const row=element('button',{class:'OwnerClientHub_clientRow','data-owner-button':''},t.root),logo=element('span',{class:'OwnerClientHub_cardSpade'},row);
  assert.equal(compute(logo).background,'transparent'); assert.equal(compute(logo).height,'64px'); assert.equal(compute(logo).width,'64px');
  const labels=element('div',{class:'OwnerClientHub_labelChoices'},t.root),label=element('label',{},labels),remove=element('button',{class:'OwnerClientHub_removeLabel'},label);
  assert.equal(compute(remove)['background-color'],'transparent'); assert.equal(compute(remove).color,'#d0d0d0'); assert.equal(compute(remove).width,'30px');
  const choicesRoot=element('div',{class:'ProjectChoiceBar_root'},t.frame),list=element('ul',{class:'ProjectChoiceBar_choices'},choicesRoot);
  assert.equal(compute(list).display,'grid'); assert.equal(compute(list)['overflow-x'],'visible');
 }
});

const decisionCss=await css('owner','CommissionRequests');
test('Fox11 neutral commission decisions retain readable dark contrast in either cascade order',()=>{
 for(const sheets of [[...global,...modules,decisionCss],[...modules,decisionCss,...global]]){
  const t=fixture('dark'),compute=cascade(sheets);
  for(const state of ['approved','denied','waitlisted']){
   const node=element('button',{class:`CommissionRequests_decisionButton CommissionRequests_${state}`},t.frame),style=compute(node);
   assert.notEqual(style.background,'#fff');assert.ok(contrast(style.color,style.background)>=4.5,`${state}: ${style.color} on ${style.background}`);
  }
 }
});
