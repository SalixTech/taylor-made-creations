import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes} from './owner-ui-harness.mjs';
import {readFileSync} from 'node:fs';
test('Contact trash icon is a named themed action and confirms removal of only the selected contact',()=>{
 const h=harness(),draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();let confirm=null,writes=0;
 const Editor=h.load('src/owner/OwnerSocialLinksEditor.tsx').OwnerSocialLinksEditor;
 h.render(Editor,{content:draft,onEdit:fn=>{writes++;fn(draft);},onRemove:(title,description,action)=>{confirm={title,description,action};}});
 const list=h.find(n=>n.type?.name==='OwnerPriceReorderList'),first=list.props.items[0],card=list.props.children(first,null);
 const button=nodes(card).find(n=>n.type==='button'&&n.props['aria-label']===`Delete ${first.label} card`);assert.ok(button);assert.equal(button.props['data-owner-button'],true);assert.match(button.props.className,/button/);assert.match(button.props.className,/secondary/);assert.match(button.props.className,/icon/);assert.equal(button.props.title,'Delete card');assert.ok(nodes(button).some(n=>n.type?.name==='TrashIcon'));
 button.props.onClick();assert.match(confirm.title,/Delete.*card/);assert.equal(writes,0);confirm.action();assert.equal(writes,1);assert.equal(draft.site.socialLinks.some(item=>item.id===first.id),false);assert.equal(draft.site.socialLinks.length,list.props.items.length-1);h.unmount();
});
test('File Hub move toolbar keeps cancel aligned and readable without changing folder data',()=>{
 const css=readFileSync(new URL('../src/owner/CloudFileHub.module.css',import.meta.url),'utf8');assert.match(css,/\.moveStatus\{[^}]*justify-content:space-between/);assert.match(css,/\.moveStatus>button\{[^}]*flex:0 0 auto/);assert.match(css,/\.breadcrumbs\{justify-content:flex-start/);
 const rules=readFileSync(new URL('../firebase/firestore.rules',import.meta.url),'utf8');assert.match(rules,/data\.folders\['00000000-0000-4000-8000-000000000001'\] == \{'name': 'Fonts', 'parentId': 'root', 'trashedAt': null\}/);
});
