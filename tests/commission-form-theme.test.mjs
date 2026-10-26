import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, contrast, element } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
async function compile(path,name){const output=await postcss([local(),scope({generateScopedName:key=>`${name}_${key}`})]).process(read(path),{from:path});const classes={};output.root.walkRules(':export',rule=>rule.walkDecls(decl=>classes[decl.prop]=decl.value));return {css:output.css,classes};}
const form=await compile('src/components/CommissionForm.module.css','CommissionForm'),editor=await compile('src/owner/CommissionFormEditor.module.css','CommissionFormEditor'),portal=await compile('src/owner/OwnerPortal.module.css','OwnerPortal');
const sheets=[read('src/app/globals.css'),read('src/app/color-modes.css'),portal.css,form.css,editor.css];
function fixture(mode,owner){const root=element('html'),body=element('body',{},root),frame=element('div',owner?{class:portal.classes.portal,'data-owner-portal':'','data-color-mode':mode}:{'data-theme-scope':'public','data-color-mode':mode},body);const section=element('section',{class:form.classes.form},frame),heading=element('h2',{},section),extras=element('div',{class:form.classes.additionalParts},section),item=element('div',{class:form.classes.additionalPart},extras),choice=element('label',{class:form.classes.partChoice},item),quantity=element('label',{class:form.classes.partQuantity},item),input=element('input',{type:'number'},quantity);return {frame,section,heading,extras,choice,quantity,input};}
// Real compiled selectors and theme cascade. This is not browser screenshot QA.
test('Additional Parts and its quantity controls remain legible in public/owner light and dark modes',()=>{
  for(const mode of ['light','dark'])for(const owner of [false,true]){
    const t=fixture(mode,owner),computed=cascade(sheets),surface=computed(t.section)['background-color'];
    assert.ok(contrast(computed(t.heading).color,surface)>=4.5,`${mode}/${owner}: heading`);
    assert.ok(contrast(computed(t.choice).color,surface)>=4.5,`${mode}/${owner}: checkbox label`);
    assert.ok(contrast(computed(t.input).color,computed(t.input)['background-color'])>=4.5,`${mode}/${owner}: quantity input`);
    assert.equal(computed(t.input).width,'78px');assert.equal(computed(t.input)['min-height'],'42px');
  }
});
test('Additional Parts collapses to one column on narrow screens and editor labels wrap without fixed-width overflow',()=>{
  const t=fixture('light',false);assert.equal(cascade(sheets,375)(t.extras)['grid-template-columns'],'1fr');assert.equal(cascade(sheets,1280)(t.extras)['grid-template-columns'],'repeat(2,minmax(0,1fr))');
  const owner=fixture('dark',true),box=element('div',{class:editor.classes.editor},owner.frame),columns=element('div',{class:editor.classes.columns},box),tools=element('div',{class:editor.classes.canvasTools},columns),button=element('button',{},tools),computed=cascade(sheets,375);
  assert.equal(computed(columns)['grid-template-columns'],'minmax(0,1fr)');assert.equal(computed(button)['overflow-wrap'],'anywhere');
});

test('disabled Choose Files preview remains readable in both owner themes and stylesheet orders',()=>{
 for(const mode of ['light','dark'])for(const css of [sheets,[form.css,editor.css,...sheets.slice(0,3)]]){
  const t=fixture(mode,true),picker=element('div',{class:form.classes.filePicker},t.section);
  element('input',{class:form.classes.fileInput,type:'file',disabled:''},picker);
  const label=element('label',{class:form.classes.fileButton},picker),computed=cascade(css)(label);
  assert.ok(contrast(computed.color,computed['background-color'])>=4.5,`${mode}: disabled upload contrast`);
  assert.equal(computed.cursor,'not-allowed');
 }
});

test('commission toolbar uses actual shared button classes for complete dark/light styling',async()=>{
 const buttons=await compile('src/owner/OwnerButton.module.css','OwnerButton');
 for(const mode of ['light','dark']){
  const t=fixture(mode,true),toolbar=element('header',{class:editor.classes.toolbar},t.frame);
  for(const variant of ['primary','secondary']){
   const button=element('button',{'data-owner-button':variant,class:`${buttons.classes.button} ${buttons.classes[variant]}`},toolbar);
   const computed=cascade([...sheets,buttons.css])(button);
   assert.equal(computed.display,'inline-flex');assert.ok(contrast(computed.color,computed['background-color'])>=4.5);
  }
  assert.equal(cascade(sheets)(toolbar).padding,'16px');
 }
});


test('question pencil shares native label row without blank heading space at narrow and desktop widths',()=>{
 const owner=element('div',{'data-owner-portal':''}),parent=element('div',{class:editor.classes.questionCanvas},owner),tools=element('div',{class:editor.classes.canvasTools},parent),button=element('button',{class:editor.classes.editPencil,'data-owner-button':''},tools),surface=element('div',{class:editor.classes.questionSurface},parent),fields=element('fieldset',{class:editor.classes.inlineFields},parent);
 for(const width of [375,1280]) {const computed=cascade(sheets,width);assert.equal(computed(parent).display,'grid');assert.equal(computed(parent)['grid-template-columns'],'minmax(0,1fr) 32px');assert.notEqual(computed(parent)['padding-top'],'60px');assert.notEqual(computed(tools).position,'absolute');assert.equal(computed(tools)['grid-row'],'1');assert.equal(computed(surface)['grid-row'],'1');assert.equal(computed(fields)['grid-row'],'2');assert.equal(computed(button).width,'32px');}
});

test('Choose Files and secondary form actions use rounded non-glowing labels in both themes',()=>{
 for(const mode of ['light','dark']){const t=fixture(mode,true),picker=element('div',{class:form.classes.filePicker},t.section),label=element('label',{class:form.classes.fileButton},picker),computed=cascade(sheets)(label);assert.equal(computed['border-radius'],'10px');assert.equal(computed['text-shadow'],'none');assert.equal(computed['font-synthesis'],'none');assert.equal(computed['font-weight'],'500');}
});
