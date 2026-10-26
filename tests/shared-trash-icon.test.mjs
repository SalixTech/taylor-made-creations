import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element,contrast} from './helpers/css-cascade.mjs';
import {harness} from './owner-ui-harness.mjs';
const require=createRequire(import.meta.url), local=require('next/dist/compiled/postcss-modules-local-by-default'), scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const icon=(await postcss([local(),scope({generateScopedName:key=>`TrashIcon_${key}`})]).process(read('src/owner/TrashIcon.module.css'),{from:'TrashIcon.module.css'})).css;
test('shared trash glyph stays red and contrastful in either theme and stylesheet order',()=>{
 for(const mode of ['light','dark'])for(const sheets of [[read('src/app/color-modes.css'),icon],[icon,read('src/app/color-modes.css')]]){
  const root=element('div',{'data-owner-portal':'','data-color-mode':mode}),button=element('button',{'data-owner-button':''},root),svg=element('svg',{class:'TrashIcon_icon'},button),style=cascade(sheets)(svg);
  assert.equal(style.color,mode==='dark'?'#f27889':'#b42338');assert.ok(contrast(style.color,mode==='dark'?'#303034':'#fff')>=3);assert.equal(style['pointer-events'],'none');
 }
});
test('shared trash icon is decorative so the enclosing action owns the accessible name',()=>{
 const h=harness(),Icon=h.load('src/owner/TrashIcon.tsx').TrashIcon;h.render(Icon,{});assert.equal(h.tree.type,'svg');assert.equal(h.tree.props['aria-hidden'],'true');assert.equal(h.tree.props.focusable,'false');assert.equal(h.tree.props.width,'18');assert.equal(h.tree.props.stroke,'currentColor');h.unmount();
});
