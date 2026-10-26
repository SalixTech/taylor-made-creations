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
const compiled=await postcss([local(),scope({generateScopedName:name=>`Hub_${name}`})]).process(read('src/owner/CloudFileHub.module.css'),{from:'CloudFileHub.module.css'});
const buttons=await postcss([local(),scope({generateScopedName:name=>`Button_${name}`})]).process(read('src/owner/OwnerButton.module.css'),{from:'OwnerButton.module.css'});
// Source-level cascade regression, not browser pixel verification.
test('open desktop folder rail stretches with the file pane while mobile and collapsed remain compact',()=>{
 const hub=element('section',{class:'Hub_hub Hub_manager'}),explorer=element('div',{class:'Hub_explorer'},hub);
 const rail=element('details',{class:'Hub_folderSidebar',open:''},explorer),nav=element('nav',{},rail);
 for(const width of [701,1050,1440]){const computed=cascade([compiled.css],width);assert.equal(computed(rail)['align-self'],'stretch');assert.equal(computed(explorer)['grid-template-columns'],'minmax(165px,210px) minmax(0,1fr)');}
 for(const width of [375,650,700]){const computed=cascade([compiled.css],width);assert.equal(computed(rail)['align-self'],'start');assert.equal(computed(explorer)['grid-template-columns'],'minmax(0,1fr)');assert.equal(computed(nav)['max-height'],'230px');}
 delete rail.attrs.open;assert.notEqual(cascade([compiled.css],1440)(rail)['align-self'],'stretch');
});
test('header action group keeps Trash compact and selected view visibly distinct',()=>{
 const portal=element('div',{'data-owner-portal':''}),hub=element('section',{class:'Hub_hub'},portal),actions=element('div',{class:'Hub_headingActions'},hub),trash=element('button',{class:'Hub_trashView Button_button Button_secondary Button_compact','data-owner-button':'','aria-pressed':'true'},actions);
 for(const sheets of [[compiled.css,buttons.css],[buttons.css,compiled.css]]){const computed=cascade(sheets);assert.equal(computed(actions).display,'flex');assert.equal(computed(actions).gap,'8px');assert.equal(computed(trash).width,'36px');assert.match(computed(trash).outline,/^2px solid /);assert.equal(computed(trash).padding,'8px');}
});
