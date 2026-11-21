import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=(await postcss([local(),scope({generateScopedName:n=>'Hub_'+n})]).process(read('src/owner/OwnerClientHub.module.css'),{from:undefined})).css;
const global=read('src/app/color-modes.css');
test('TH1 selected owner metric has blue-only border and inset in either stylesheet order',()=>{
 for(const sheets of [[css,global],[global,css]]) {
  const portal=element('div',{'data-owner-portal':'','data-color-mode':'dark'}),root=element('div',{class:'Hub_root'},portal),stats=element('div',{class:'Hub_studioStats'},root),metric=element('button',{'aria-pressed':'true'},stats),get=cascade(sheets);
  assert.equal(get(metric)['border-color'],'#00b1f5');assert.equal(get(metric)['box-shadow'],'inset 0 0 0 1px #00b1f5');
 }
});
test('TH7 card actions retain bottom-right layout and transparent hover with keyboard focus',()=>{
 const s=read('src/owner/OwnerClientHub.module.css');
 assert.match(s,/projectFooter>\.projectActions[^}]*margin-left:auto/);
 assert.match(s,/button:is\(\.editPencil,\.cardArchive\):hover[^}]*background:transparent!important/);
 assert.match(s,/button:is\(\.editPencil,\.cardArchive\):focus-visible[^}]*outline:2px solid #00b1f5/);
});
test('TH3, TH28 and TH29 scope compact controls and links separator without hiding order recovery',()=>{
 const s=read('src/owner/OwnerClientHub.tsx'),css=read('src/owner/OwnerClientHub.module.css');
 assert.match(s,/\$\{buttons.compact\} \$\{styles.archiveButton\}/);
 assert.match(s,/styles.linksStart/);assert.match(css,/\.linksStart[^}]*border-top:1px solid #f0f0f0/);
 assert.match(css,/\.stageSelectors \{ display:grid; align-items:start; gap:10px; margin:0/);
 assert.match(s,/Check saved order/);assert.match(s,/onDragStart/);
});
