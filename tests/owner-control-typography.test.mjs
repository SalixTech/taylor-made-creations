import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element,contrast} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url), local=require('next/dist/compiled/postcss-modules-local-by-default'), scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function compile(folder,name){return (await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(`src/${folder}/${name}.module.css`),{from:`${name}.module.css`})).css;}
const globals=read('src/app/globals.css'),modes=read('src/app/color-modes.css'),owner=await compile('owner','OwnerPortal'),buttons=await compile('owner','OwnerButton'),select=await compile('components','SiteSelect');
const sheetOrders=[[globals,modes,owner,buttons,select],[select,buttons,owner,globals,modes]];
for(const mode of ['light','dark']) test(`owner ${mode} action typography is bold clean UI chrome, never site branding`,()=>{
 for(const sheets of sheetOrders){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),compute=cascade(sheets);
  for(const className of ['OwnerButton_button OwnerButton_secondary','OwnerPortal_primary','OwnerPortal_secondary']){
   const action=element('button',{class:className,'data-owner-button':''},root),style=compute(action);
   assert.equal(style['font-weight'],'700');assert.match(style['font-family'],/^Inter,ui-sans-serif,system-ui/);assert.equal(style['text-shadow'],'none');assert.equal(style['font-synthesis'],'none');assert.equal(style['border-radius'],'10px');
  }
  const canvas=element('div',{'data-site-render-mode':'preview'},root),publicButton=element('button',{class:'saved-brand'},canvas),ownStyle='.saved-brand { font-family:Georgia; font-weight:400; color:#345678; text-shadow:none; }';
  const untouched=cascade([...sheets,ownStyle])(publicButton);assert.equal(untouched['font-family'],'Georgia');assert.equal(untouched['font-weight'],'400');assert.equal(untouched.color,'#345678');
 }
});
for(const mode of ['light','dark']) test(`owner ${mode} fields use neutral borders and visible keyboard focus while invalid stays distinct`,()=>{
 for(const sheets of sheetOrders){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode,class:'OwnerPortal_portal'}),field=element('div',{class:'OwnerPortal_field OwnerPortal_ownerSelect'},root),selectRoot=element('div',{class:'SiteSelect_root'},field),compute=cascade(sheets);
  for(const kind of ['input','textarea','select','button'])for(const state of ['idle','hover','focus-visible']){
   const control=element(kind,{...(kind==='button'?{role:'combobox',class:'SiteSelect_control'}:{})},selectRoot);if(state!=='idle')control.states.add(state);
   const style=compute(control);assert.equal(style['border-color'],mode==='dark'?'#85858c':'#c5c5ca');assert.equal(style['box-shadow'],'none');
   if(state==='focus-visible'){assert.equal(style['outline-color'],mode==='dark'?'#a1a1aa':'#64748b');assert.ok(contrast(style['outline-color'],mode==='dark'?'#242426':'#fff')>=3);}
   control.attrs['aria-invalid']='true';assert.equal(compute(control)['border-color'],mode==='dark'?'#d46c80':'#a30e2a');
  }
  const canvas=element('div',{'data-site-render-mode':'preview'},root),publicField=element('input',{class:'saved-field'},canvas);publicField.states.add('focus-visible');
  const untouched=cascade([...sheets,'.saved-field { border-color:#123456; outline:2px solid #456789; }'])(publicField);assert.equal(untouched['border-color'],'#123456');assert.equal(untouched['outline-color'],'#456789');
 }
});
