import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element,contrast} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function compile(name){return (await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/components/${name}.module.css`),{from:`${name}.module.css`})).css;}
const globals=read('src/app/globals.css'),modes=read('src/app/color-modes.css'),terms=await compile('TermsAgreement'),select=await compile('SiteSelect');
for(const mode of ['light','dark'])for(const context of ['owner','public'])test(`${context} ${mode}: entire TOS footer and native popover use their component palette in either stylesheet order`,()=>{
 for(const sheets of [[globals,modes,terms,select],[terms,select,globals,modes]]){
  const compute=cascade(sheets),root=element('div',context==='owner'?{'data-owner-portal':'','data-color-mode':mode}:{'data-theme-scope':'public','data-color-mode':mode});
  const dialog=element('dialog',{class:'TermsAgreement_dialog','data-terms-dialog':''},root),footer=element('footer',{class:'TermsAgreement_actions'},dialog),cancel=element('button',{class:'TermsAgreement_cancel'},footer),agree=element('button',{class:'TermsAgreement_agree'},footer);
  assert.equal(compute(footer)['background-color'],mode==='dark'?'#242426':'#fff');
  assert.equal(compute(cancel)['background-color'],mode==='dark'?'#303034':'#f4f3f4');
  assert.equal(compute(agree)['background-color'],'#800014');assert.equal(compute(agree).color,'#fff');
  for(const button of [cancel,agree]){assert.equal(compute(button)['border-radius'],'10px');assert.ok(contrast(compute(button).color,compute(button)['background-color'])>=4.5);}
  const selectRoot=element('div',{class:'SiteSelect_root'},root),popup=element('div',{class:'SiteSelect_list','data-site-select-menu':'','data-floating':'true',popover:'manual'},selectRoot),list=element('div',{role:'listbox'},popup),option=element('div',{role:'option',class:'SiteSelect_option','aria-selected':'true','data-active':'false'},list);
  assert.equal(compute(popup)['background-color'],mode==='dark'?'#303034':'#fff');assert.equal(compute(popup)['border-radius'],'10px');
  assert.equal(compute(option)['background-color'],mode==='dark'?'#3b3b42':'#f1f1f4');assert.equal(compute(option)['font-weight'],'500');
  option.attrs['data-active']='true';assert.equal(compute(option)['background-color'],mode==='dark'?'#484850':'#e4e4eb');assert.ok(contrast(compute(option).color,compute(option)['background-color'])>=4.5);
 }
});
