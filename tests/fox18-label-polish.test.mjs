import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{harness,content}from'./owner-ui-harness.mjs';
const read=p=>readFileSync(new URL('../src/owner/'+p,import.meta.url),'utf8');
test('TH12 default appearance renders actual hex and matching swatch without writes',()=>{
 const h=harness();const {labelAppearanceFields,initialLabelAppearance}=h.load('src/owner/label-appearance-fields.tsx');let changes=0;
 h.render(()=>labelAppearanceFields(initialLabelAppearance('Fox'),false,()=>changes++,'Only this commission.'));
 assert.match(content(h.tree),/Default color #7F0011/);assert.ok(h.all(n=>n.props.style?.backgroundColor==='#7f0011').length);assert.equal(changes,0);h.unmount();
});
test('TH2/8/9/10 scoped polish retains labels and standard trash semantics',()=>{
 const css=read('OwnerClientHub.module.css'),labels=read('LabelPresentationEditor.tsx'),style=read('LabelPresentationEditor.module.css');
 assert.match(css,/detail:has\(\.detailContent\[data-empty=true\]\)[^}]*align-items:center/);
 assert.match(css,/clientOrderHelp[^}]*border-top:1px solid #f0f0f0/);
 assert.match(css,/grid-template-rows:24px 52px auto/);
 assert.match(css,/modalNotice \{ border-left-color:#43b581/);
 assert.match(labels,/isBuiltinLabel\(key\) \? "Hide" : "Delete"/);assert.match(labels,/<TrashIcon \/>/);
 assert.match(style,/\.row \.trash[^}]*background:#2c2c2d!important/);
});
