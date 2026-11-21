import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url);
const local=require('next/dist/compiled/postcss-modules-local-by-default');
const scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function compiled(folder,name){return (await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/${folder}/${name}.module.css`),{from:`${name}.module.css`})).css;}
const inventory=await compiled('owner','OwnerInventory'),owner=await compiled('owner','OwnerPortal'),select=await compiled('components','SiteSelect');
const base=[read('src/app/globals.css'),read('src/app/color-modes.css'),owner,select];
test('compiled inventory styles remove inherited label and field margins in either theme/order',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[...base,inventory],[inventory,...base]]){
 const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),filters=element('div',{class:'OwnerInventory_filters'},root);
 const searchLabel=element('label',{},filters),search=element('input',{},searchLabel),field=element('div',{class:'OwnerPortal_field OwnerPortal_ownerSelect'},filters),caption=element('label',{},field),selectRoot=element('div',{class:'SiteSelect_root'},field),wrap=element('div',{},selectRoot),control=element('button',{role:'combobox',class:'SiteSelect_control'},wrap);
 const compute=cascade(sheets);
 for(const target of [searchLabel,field,caption])assert.equal(compute(target)['margin'],'0',`${mode} field spacing`);
 assert.equal(compute(search).height,'40px');assert.equal(compute(control).height,'40px');assert.equal(compute(control)['text-align'],'center');
 const form=element('fieldset',{class:'OwnerInventory_form'},root),label=element('label',{},form),input=element('input',{},label);
 assert.equal(compute(label)['margin'],'0');assert.equal(compute(label)['margin'],'0');assert.equal(compute(input).height,'38px');
 assert.equal(cascade(sheets,1280)(form)['grid-template-columns'],'repeat(4,minmax(0,1fr))');assert.equal(cascade(sheets,375)(form)['grid-template-columns'],'1fr');
 }
});

test('inventory action toolbar has no extra surface strip in either theme or stylesheet order',()=>{for(const mode of ['light','dark'])for(const sheets of [[...base,inventory],[inventory,...base]]){const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),inventoryRoot=element('div',{class:'OwnerInventory_root'},root),toolbar=element('div',{class:'OwnerInventory_toolbar'},inventoryRoot);assert.equal(cascade(sheets)(toolbar)['background-color'],'transparent');}});

test('inventory refresh uses remaining right space without changing wrapping or action order',()=>{
 for(const mode of ['light','dark'])for(const width of [320,390,768,1176,1440])for(const sheets of [[...base,inventory],[inventory,...base]]){
  const portal=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),root=element('div',{class:'OwnerInventory_root'},portal),toolbar=element('div',{class:'OwnerInventory_toolbar'},root),refresh=element('button',{class:'OwnerInventory_toolbarRefresh'},toolbar),action=element('button',{},toolbar),get=cascade(sheets,width);
  assert.equal(get(refresh)['margin-left'],'auto');assert.equal(get(toolbar)['flex-wrap'],'wrap');assert.notEqual(get(action)['margin-left'],'auto');assert.equal(get(refresh).order,undefined);
 }
});
