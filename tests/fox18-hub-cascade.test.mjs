import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import postcss from'postcss';import{cascade,element}from'./helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope'),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function compile(path,prefix){return(await postcss([local(),scope({generateScopedName:n=>prefix+'_'+n})]).process(read(path),{from:path})).css;}
const hub=await compile('src/owner/OwnerClientHub.module.css','Hub'),labels=await compile('src/owner/LabelPresentationEditor.module.css','Label'),trash=await compile('src/owner/TrashIcon.module.css','Trash'),global=read('src/app/color-modes.css');
test('Fox18 owner summary selected copy stays light and label trash SVG overrides old pink in both CSS orders',()=>{
 for(const sheets of [[hub,labels,trash,global],[global,trash,labels,hub]]) {
  const get=cascade(sheets),portal=element('div',{'data-owner-portal':'','data-color-mode':'dark'}),root=element('div',{class:'Hub_root'},portal),stats=element('div',{class:'Hub_studioStats'},root),button=element('button',{'aria-pressed':'true'},stats),count=element('strong',{},button),row=element('div',{class:'Label_row'},portal),del=element('button',{class:'Label_trash','data-owner-button':''},row),svg=element('svg',{class:'Trash_icon'},del);
  assert.equal(get(element('p',{class:'Hub_clientOrderHelp'},root)).padding,'12px 18px 14px');assert.equal(get(button).color,'#d0d0d0');assert.equal(get(count).color,'#d0d0d0');assert.equal(get(svg).color,'#d0d0d0');assert.equal(get(del).background,'#2c2c2d');
 }
});
