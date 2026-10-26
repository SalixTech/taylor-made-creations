import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url);
const local=require('next/dist/compiled/postcss-modules-local-by-default');
const scope=require('next/dist/compiled/postcss-modules-scope');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const compiled=(await postcss([local(),scope({generateScopedName:name=>`Hub_${name}`})]).process(read('src/owner/CloudFileHub.module.css'),{from:'CloudFileHub.module.css'})).css;
test('folder tree has balanced padding and full width despite public header nav selectors in either stylesheet order',()=>{
 const site=element('div',{class:'selected-design'}), hub=element('section',{class:'Hub_hub Hub_manager'},site), explorer=element('div',{class:'Hub_explorer'},hub);
 const rail=element('details',{class:'Hub_folderSidebar',open:''},explorer),nav=element('nav',{'aria-label':'File hierarchy'},rail),branch=element('div',{class:'Hub_folderBranch'},nav),children=element('div',{class:'Hub_folderChildren'},branch);
 const globals=read('src/app/globals.css');
 for(const sheets of [[globals,compiled],[compiled,globals]])for(const width of [375,700,820,1050,1440]){
  const computed=cascade(sheets,width), actual=computed(nav);
  assert.equal(actual.display,'block');assert.equal(actual.width,'100%');assert.equal(actual['box-sizing'],'border-box');
  assert.equal(actual.margin,'0');assert.equal(actual.gap,'0');assert.equal(actual.padding,'4px 10px 12px');assert.equal(actual['justify-content'],'flex-start');
  assert.equal(computed(branch).width,'100%');assert.equal(computed(children)['margin-left'],'12px');
 }
});
