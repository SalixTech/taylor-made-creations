import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
test('Edit website and Discard Edits share native button styling without segmented mode overrides',()=>{
 const h=harness(),value=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),C=h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
 const props={content:value,page:value.pages[0],onEdit(){},onPageChange(){},onManagePages(){},onAddPage(){},onRemove(){},liveShopVisibility:false,canUpdateLiveShop:false,onUpdateLiveShop(){},browsing:true,onBrowsingChange(){},onRequestDiscard(){}};
 h.render(C,props);const edit=h.find(n=>n.type==='button'&&content(n)==='Edit website'),discard=h.find(n=>n.type==='button'&&content(n)==='Discard Edits');
 assert.equal(edit.props.className,discard.props.className);assert.equal(edit.props['data-owner-button'],true);assert.equal(h.find(n=>n.props['aria-label']==='Builder mode').props.className,'editModeSwitch');
 h.render(C,{...props,uploadBusy:true});assert.equal(h.find(n=>n.type==='button'&&content(n)==='Edit website').props.disabled,true);assert.equal(h.find(n=>n.type==='button'&&content(n)==='Discard Edits').props.disabled,true);h.unmount();
});
test('commission card uses concise Edit Form and Preview Form labels',()=>{
 const h=harness(),value=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),C=h.load('src/owner/OwnerTemplateManagers.tsx').ContactSettingsManager;
 h.render(C,{content:value,onEdit(){},onRemove(){},onEditCommissionForm(){}});
 assert.ok(h.find(n=>n.type==='button'&&content(n)==='Edit Form'));assert.ok(h.find(n=>n.type==='button'&&content(n)==='Preview Form'));h.unmount();
});
