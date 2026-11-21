import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element } from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
async function compile(path,prefix){return (await postcss([local(),scope({generateScopedName:name=>`${prefix}_${name}`})]).process(read(path),{from:path})).css;}
const attachment=await compile('src/client-hub/MakerChatAttachments.module.css','Attachment'),workspace=await compile('src/client-hub/ProjectWorkspace.module.css','Workspace'),global=read('src/app/color-modes.css');
test('attachment close blends with its header despite actual owner workspace button cascade in either stylesheet order',()=>{
 const owner=element('div',{'data-owner-portal':'true','data-color-mode':'dark'}), work=element('section',{class:'Workspace_workspace'},owner),dialog=element('dialog',{class:'Attachment_dialog'},work),header=element('header',{},dialog),close=element('button',{class:'Attachment_close','aria-label':'Close attachments'},header);
 for(const sheets of [[attachment,workspace,global],[global,workspace,attachment]])for(const width of [390,1440]){const value=cascade(sheets,width)(close);assert.equal(value['background-color'],'transparent');assert.equal(value['box-shadow'],'none');assert.equal(value['border-radius'],'0');}
});
