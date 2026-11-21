import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=async name=>(await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/owner/${name}.module.css`),{from:`${name}.module.css`})).css;
const [portal,outcome]=await Promise.all(['OwnerPortal','OutcomeNotice'].map(compile));
for(const mode of ['light','dark'])test(`integrated ${mode} notice X has no raised control island in either stylesheet order`,()=>{
 const base=[read('src/app/globals.css'),read('src/app/color-modes.css')];
 for(const sheets of [[...base,portal,outcome],[outcome,portal,...base]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),get=cascade(sheets);
  for(const css of ['successNotice','errorNotice']){const notice=element('div',{class:`OwnerPortal_${css}`,role:css==='errorNotice'?'alert':'status'},root),button=element('button',{class:'OwnerPortal_dismissNotice','aria-label':'Dismiss notification'},notice);assert.equal(get(button)['background-color'],'transparent');assert.equal(get(button)['border-color'],'transparent');assert.equal(get(button).width,'32px');}
  const notice=element('div',{class:'OutcomeNotice_message',role:'status'},root),button=element('button',{class:'OutcomeNotice_close','aria-label':'Dismiss notification'},notice);assert.equal(get(button)['background-color'],'transparent');assert.equal(get(button)['border-color'],'transparent');
 }
});
