import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import { cascade, element } from './helpers/css-cascade.mjs';
import { harness, nodes, content } from './owner-ui-harness.mjs';
const require = createRequire(import.meta.url);
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
async function compile(name) {
  return (await postcss([local(), scope({ generateScopedName:key => `${name}_${key}` })]).process(readFileSync(`src/owner/${name}.module.css`, 'utf8'), {from:`${name}.module.css`})).css;
}
const sheets = await Promise.all(['OwnerPortal', 'OwnerTemplateManagers', 'OwnerPricesManager', 'AssetLibrary'].map(compile));

test('gallery editing opens a compact dialog without expanding grid cards or changing data', () => {
  const h=harness(),Manager=h.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
  const draft=h.load('src/owner/defaults.ts').createDefaultOwnerContent();draft.gallery[0].displayNumber='007';const before=structuredClone(draft.gallery);let saves=0;
  const render=()=>h.render(Manager,{content:draft,onEdit:fn=>fn(draft),onRemove(){},onSavePhotos:()=>saves++});
  const list=()=>h.find(n=>n.type?.name==='OwnerPriceReorderList');
  const edit=id=>nodes(list().props.children(draft.gallery.find(p=>p.id===id),null)).find(n=>n.type==='button'&&content(n)==='Edit photo');
  render();assert.equal(list().props.disabled,false);assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined);
  edit(draft.gallery[0].id).props.onClick();render();assert.equal(list().props.disabled,true);assert.equal(list().props.expandedItemId,undefined);
  let dialog=h.find(n=>n.type?.name==='Dialog');assert.equal(dialog.props.title,'Edit photo');assert.equal(dialog.props.wide,undefined);
  assert.equal(h.find(n=>n.type==='details'&&n.props.className==='galleryChangePhoto').props.open,undefined,'media library is collapsed until requested');
  assert.equal(nodes(list().props.children(draft.gallery[0],null)).some(n=>n.props.className==='galleryImagePicker'),false);
  nodes(dialog.props.actions).find(n=>n.type==='button'&&content(n)==='Save Photo').props.onClick();assert.equal(saves,1);render();assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined,'photo dialog closes before parent save chooser opens');
  dialog.props.onClose();render();assert.equal(h.find(n=>n.type?.name==='Dialog'),undefined);assert.equal(list().props.disabled,false);assert.deepEqual(draft.gallery,before);
  edit(draft.gallery[1].id).props.onClick();render();assert.equal(h.find(n=>n.props['data-gallery-photo-editor']).props['data-gallery-photo-editor'],draft.gallery[1].id);
  h.find(n=>n.type?.name==='Field'&&n.props.label==='Photo name').props.onChange('Updated in draft');render();
  dialog=h.find(n=>n.type?.name==='Dialog');nodes(dialog.props.actions).find(n=>content(n)==='Done').props.onClick();render();assert.equal(draft.gallery[1].name,'Updated in draft');assert.equal(saves,1,'closing keeps edits private without silently publishing or saving');
  assert.equal(draft.gallery.length,before.length);h.unmount();
});

test('compiled photo editor CSS uses a small thumbnail and single-column optional media chooser',()=>{
 for(const width of [375,650,900,1280,1920])for(const css of [sheets,[...sheets].reverse()]){
  const compute=cascade(css,width),editor=element('div',{class:'OwnerTemplateManagers_galleryPhotoEditor'}),summary=element('div',{class:'OwnerTemplateManagers_galleryEditSummary'},editor);
  assert.equal(compute(summary)['grid-template-columns'],width<=500?'80px minmax(0,1fr)':'120px minmax(0,1fr)');
  const wrap=element('div',{class:'OwnerTemplateManagers_galleryImagePicker'},editor),picker=element('div',{class:'OwnerPortal_imagePicker'},wrap),duplicate=element('div',{class:'OwnerPortal_imagePreview'},picker);element('div',{},picker);
  assert.equal(compute(picker)['grid-template-columns'],'minmax(0,1fr)');assert.equal(compute(duplicate).display,'none');
 }
});
