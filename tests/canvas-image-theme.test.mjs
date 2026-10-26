import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element,contrast} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compiled=(await postcss([local(),scope({generateScopedName:key=>'Image_'+key})]).process(read('src/owner/OwnerVisualBuilder.module.css'),{from:'builder.css'})).css;
test('crop overlay remains transparent in dark workspace rather than hiding the photo',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[read('src/app/color-modes.css'),compiled],[compiled,read('src/app/color-modes.css')]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode});
  const overlay=element('button',{class:'Image_cropHandle','data-owner-button':''},root);
  const style=cascade(sheets)(overlay);assert.equal(style['background-color'],'transparent');
  const label=element('span',{},overlay),text=cascade(sheets)(label);assert.ok(contrast(text.color,text['background-color'])>=4.5);
 }
 assert.doesNotMatch(read('src/owner/OwnerCanvasImageTools.tsx'),/<button type=/);
});
