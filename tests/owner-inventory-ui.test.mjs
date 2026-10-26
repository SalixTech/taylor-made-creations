import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const item={id:'11111111-1111-4111-8111-111111111111',schemaVersion:1,revision:1,name:'Red fur',kind:'material',categoryId:'',barcode:'FUR-001',tags:['red'],quantity:0,unit:'yards',lowStock:2,notes:'',archived:false,createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z',history:[]};
async function setup(options={}) {
  const h=harness(),calls=[],dirty=[],busy=[];
  h.overrides['./inventory-client']={readInventory:async()=>({items:[structuredClone(item)],categories:{schemaVersion:1,revision:0,categories:[]}}),generateAvailableInventoryBarcode:options.generate??(async()=>"GENERATED"),saveInventoryCategories:async(previous,categories,choices={})=>({...previous,...choices,schemaVersion:1,revision:previous.revision+1,categories}),saveInventoryItem:async(previous,edit,note)=>{calls.push({previous,edit,note});if(options.save)return options.save(previous,edit,note);return {...item,...edit,revision:(previous?.revision??0)+1};}};
  const C=h.load('src/owner/OwnerInventory.tsx').OwnerInventory;
  const props={onDirtyChange:v=>dirty.push(v),onBusyChange:v=>busy.push(v)};
  const render=()=>h.render(C,props);render();await flush();render();
  return {h,render,calls,dirty,busy,button:label=>h.find(n=>n.type==='button'&&content(n)===label),dialog:()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Edit inventory item'),action:label=>{const dialog=h.find(n=>n.type?.name==='Dialog');return nodes(dialog.props.actions).find(n=>n.type==='button'&&content(n)===label);}};
}
test('inventory shows stock alerts, scan field, filters and real edit modal',async()=>{
 const t=await setup();assert.match(content(t.h.tree),/Out of stock · needs ordering/);assert.ok(t.button('Add item'));assert.ok(t.button('Refresh inventory'));
 const search=t.h.find(n=>n.type==='input'&&n.props.placeholder==='Name, tag or barcode');search.props.onChange({target:{value:'FUR-001'}});t.render();t.h.find(n=>n.type==='input'&&n.props.placeholder==='Name, tag or barcode').props.onKeyDown({key:'Enter',preventDefault(){}});t.render();assert.ok(t.dialog());assert.equal(t.calls.length,0);t.h.unmount();
});
test('unsaved inventory changes require discard and keep-editing preserves them',async()=>{
 const t=await setup();t.button('Edit / update stock').props.onClick();t.render();
 const name=t.h.find(n=>n.type==='input'&&n.props.value==='Red fur');name.props.onChange({target:{value:'Blue fur'}});t.render();assert.equal(t.dirty.at(-1),true);
 t.dialog().props.onClose();t.render();const discard=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Discard unsaved inventory changes?');assert.ok(discard);
 nodes(discard.props.actions).find(n=>content(n)==='Keep editing'&&n.type==='button').props.onClick();t.render();assert.equal(t.h.find(n=>n.type==='input'&&n.props.value==='Blue fur').props.value,'Blue fur');t.h.unmount();assert.equal(t.dirty.at(-1),false);
});
test('save disables repeated operations and reports failure without closing editor',async()=>{
 let reject;const pending=new Promise((_,no)=>reject=no);const t=await setup({save:()=>pending});t.button('Edit / update stock').props.onClick();t.render();t.action('Save item').props.onClick();t.action('Save item').props.onClick();t.render();assert.equal(t.calls.length,1);assert.equal(t.action('Saving…').props.disabled,true);assert.equal(t.busy.at(-1),true);
 reject(Error('Not confirmed'));await flush();t.render();assert.ok(t.dialog());assert.match(content(t.dialog()),/Not confirmed/);assert.equal(t.action('Save item').props.disabled,false);t.h.unmount();
});
test('confirmed save updates card and clears dirty state',async()=>{
 const t=await setup();t.button('Edit / update stock').props.onClick();t.render();t.h.find(n=>n.type==='input'&&n.props.value==='Red fur').props.onChange({target:{value:'Blue fur'}});t.render();t.action('Save item').props.onClick();await flush();t.render();assert.equal(t.dialog(),undefined);assert.match(content(t.h.tree),/Blue fur/);assert.equal(t.dirty.at(-1),false);t.h.unmount();
});

test('late save completion after unmount does not update the discarded view',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes);const t=await setup({save:()=>pending});t.button('Edit / update stock').props.onClick();t.render();t.action('Save item').props.onClick();t.render();const before=structuredClone(t.h.hooks[0]);t.h.unmount();resolve({...item,name:'Late change',revision:2});await flush();assert.deepEqual(t.h.hooks[0],before);assert.equal(t.busy.at(-1),false);
});

test('inventory dropdowns create and select custom types, categories and units inline',async()=>{
 const t=await setup();t.button('Edit / update stock').props.onClick();t.render();
 for(const [label,name] of [['Item type','Packaging'],['Category','Con supplies'],['Unit','rolls']]) {
  const select=t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label===label&&n.props.options.some(o=>o.value==='__create__'));
  assert.ok(select);
  if(label==='Unit'){
   select.props.inlineCreate.onStart();t.render();
   const unit=t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Unit');
   unit.props.inlineCreate.onNameChange(name);t.render();
   assert.equal(t.action('Save item').props.disabled,true);
   await t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Unit').props.inlineCreate.onSubmit();t.render();
  }else{
   select.props.onChange('__create__');t.render();
   const input=t.h.find(n=>n.type==='input'&&n.props.autoFocus);input.props.onChange({target:{value:name}});t.render();
   assert.equal(t.action('Save item').props.disabled,true);
   t.button('Create and select').props.onClick();await flush();t.render();
  }
  const updated=t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label===label&&n.props.options.some(o=>o.label===name)&&n.props.options.some(o=>o.value==='__create__'));
  assert.equal(updated.props.options.find(o=>o.label===name).value,updated.props.value);
 }
 t.action('Save item').props.onClick();await flush();t.render();assert.equal(t.calls[0].edit.unit,'rolls');assert.notEqual(t.calls[0].edit.kind,'material');t.h.unmount();
});
test('inventory threshold uses whole-number stepping; generation and discard use proper controls',async()=>{
 const t=await setup();t.button('Edit / update stock').props.onClick();t.render();
 assert.equal(t.h.find(n=>n.type==='input'&&n.props['aria-describedby']==='inventory-threshold-help').props.step,'1');
 t.button('Generate').props.onClick();await flush();t.render();assert.ok(t.h.find(n=>n.type==='input'&&n.props.value==='GENERATED'));
 t.dialog().props.onClose();t.render();const discard=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Discard unsaved inventory changes?');
 assert.deepEqual(nodes(discard.props.actions).filter(n=>n.type==='button').map(content),['Discard changes','Keep editing']);t.h.unmount();
});

test('inventory save errors are in the dialog first with inline error and focus, not behind it',async()=>{
 const t=await setup({save:()=>{throw Error('Enter an item name of up to 150 characters.');}});
 t.button('Edit / update stock').props.onClick();t.render();
 const getById=t.h.document.getElementById;t.h.document.getElementById=id=>id==='inventory-name'?{focus:()=>t.h.focusLog.push(id),scrollIntoView(){}}:getById(id);
 t.action('Save item').props.onClick();await flush();t.render();
 const alerts=t.h.all(n=>n.props?.role==='alert');assert.equal(alerts.length,1);assert.equal(alerts[0].props.id,'inventory-dialog-error');
 const name=t.h.find(n=>n.props?.id==='inventory-name');assert.equal(name.props['aria-invalid'],true);assert.equal(name.props['aria-describedby'],'inventory-name-error');
 assert.equal(t.h.focusLog.at(-1),'inventory-name');
 assert.equal(t.dialog().props.children.flat().find(n=>n?.props)?.props.role,'alert');
 const focusCount=t.h.focusLog.length;name.props.onChange({target:{value:'Changed'}});t.render();assert.equal(t.h.focusLog.length,focusCount,'typing must not steal focus');
 t.h.unmount();
});
test('inventory print action uses only saved unchanged items, and discard keeps the safe action primary',async()=>{
 const t=await setup();assert.ok(t.button('Print barcode'));t.button('Edit / update stock').props.onClick();t.render();
 assert.equal(t.button('Print saved barcode').props.disabled,false);
 t.h.find(n=>n.props?.id==='inventory-name').props.onChange({target:{value:'Unsaved'}});t.render();assert.equal(t.button('Print saved barcode').props.disabled,true);
 t.dialog().props.onClose();t.render();const discard=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Discard unsaved inventory changes?');
 const keep=nodes(discard.props.actions).find(n=>n.type==='button'&&content(n)==='Keep editing');assert.match(keep.props.className,/primary/);assert.doesNotMatch(keep.props.className,/danger/);assert.equal(discard.props.draggable,false);
 const remove=nodes(discard.props.actions).find(n=>n.type==='button'&&content(n)==='Discard changes');assert.match(remove.props.className,/secondary/);
 t.h.unmount();
});
test('barcode printing reports blocked print windows inside the label dialog only',async()=>{
 const t=await setup();t.h.window.open=()=>null;t.button('Print barcode').props.onClick();t.render();
 const label=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Barcode label');
 nodes(label.props.actions).find(n=>n.type==='button'&&content(n)==='Print label').props.onClick();t.render();
 assert.equal(t.h.all(n=>n.props?.role==='alert').length,1);assert.match(content(t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Barcode label')),/Allow the print window/);t.h.unmount();
});

test('barcode generation visibly stays busy until the availability check completes',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes);const t=await setup({generate:()=>pending});t.button('Edit / update stock').props.onClick();t.render();
 t.button('Generate').props.onClick();t.render();const generating=t.button('Generating…');assert.equal(generating.props['aria-busy'],true);assert.equal(generating.props.disabled,true);assert.ok(nodes(generating).some(n=>n.props?.className==='spinner'));
 resolve('NEWBARCODE');await flush();t.render();assert.equal(t.button('Generate').props['aria-busy'],false);assert.ok(t.h.find(n=>n.props?.value==='NEWBARCODE'));t.h.unmount();
});
test('archive help explains reversible archive and toggles without changing the item',async()=>{
 const t=await setup();t.button('Edit / update stock').props.onClick();t.render();const help=()=>t.h.find(n=>n.props?.['aria-label']==='What does archiving an item do?');
 assert.equal(help().props['aria-expanded'],false);help().props.onClick();t.render();assert.equal(help().props['aria-expanded'],true);assert.match(content(t.h.tree),/quantity, barcode and history are kept/);assert.equal(t.dirty.at(-1),false);help().props.onClick();t.render();assert.equal(help().props['aria-expanded'],false);t.h.unmount();
});
