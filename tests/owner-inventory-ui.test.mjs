import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const item={id:'11111111-1111-4111-8111-111111111111',schemaVersion:1,revision:1,name:'Red fur',kind:'material',categoryId:'',barcode:'FUR-001',tags:['red'],quantity:0,unit:'yards',lowStock:2,notes:'',archived:false,createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z',history:[]};
async function setup(options={}) {
  const h=harness(),calls=[],dirty=[],busy=[];
  h.overrides['./inventory-client']={readInventory:async()=>({items:options.items??[structuredClone(item)],categories:{schemaVersion:1,revision:0,categories:[]}}),generateAvailableInventoryBarcode:options.generate??(async()=>"GENERATED"),saveInventoryCategories:options.saveCategories??(async(previous,categories,choices={})=>({...previous,...choices,schemaVersion:1,revision:previous.revision+1,categories})),trashInventoryItem:options.trash??(async previous=>({...previous,trashedAt:"2026-10-26T20:00:00Z",revision:previous.revision+1})),restoreInventoryItem:options.restore??(async previous=>({...previous,trashedAt:null,revision:previous.revision+1})),saveInventoryItem:async(previous,edit,note,saveOptions)=>{calls.push({previous,edit,note,options:saveOptions});if(options.save)return options.save(previous,edit,note);return {...item,...edit,revision:(previous?.revision??0)+1};}};
  const C=h.load('src/owner/OwnerInventory.tsx').OwnerInventory;
  const props={onDirtyChange:v=>dirty.push(v),onBusyChange:v=>busy.push(v)};
  const render=()=>h.render(C,props);render();await flush();render();
  return {h,render,calls,dirty,busy,button:label=>h.find(n=>n.type==='button'&&(content(n)===label || n.props.title===label)),dialog:()=>h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Edit inventory item'),action:label=>{const dialog=h.find(n=>n.type?.name==='Dialog');return nodes(dialog.props.actions).find(n=>n.type==='button'&&(content(n)===label || n.props.title===label));}};
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
  select.props.inlineCreate.onStart();t.render();
  const current=()=>t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label===label&&n.props.inlineCreate);
  current().props.inlineCreate.onNameChange(name);t.render();
  assert.equal(t.action('Save item').props.disabled,true);
  assert.equal(t.button('Create and select'),undefined);
  await current().props.inlineCreate.onSubmit();t.render();
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

function printWindow() {
 const node=tag=>({tag,style:{},children:[],attributes:{},textContent:'',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];this.textContent='';},setAttribute(key,value){this.attributes[key]=value;}});
 const popup={closed:false,prints:0,document:{body:node('body'),createElement:node,createElementNS:(_,tag)=>node(tag)},focus(){},print(){this.prints++;},close(){this.closed=true;}};
 return popup;
}
test('save and print waits for cloud acknowledgment and prints returned persisted data once',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes);const t=await setup({save:()=>pending});const popup=printWindow();let opens=0;t.h.window.open=()=>{opens++;return popup;};
 t.button('Add item').props.onClick();t.render();const save=t.button('Save item and print');save.props.onClick();save.props.onClick();t.render();
 assert.equal(opens,1);assert.equal(t.calls.length,1);assert.equal(popup.prints,0);assert.equal(popup.document.body.children.length,0);assert.equal(t.button('Save item and print').props.disabled,true);
 resolve({...item,name:'Cloud acknowledged',barcode:'ACK-001'});await flush();t.render();
 assert.equal(popup.prints,1);assert.equal(popup.document.body.children[0].textContent,'Cloud acknowledged');assert.equal(popup.document.body.children[1].children.at(-1).textContent,'ACK-001');assert.equal(t.dirty.at(-1),false);t.h.unmount();
});
test('failed save never prints and retains edits while closing the waiting window',async()=>{
 const t=await setup({save:async()=>{throw Error('Save not confirmed');}});const popup=printWindow();t.h.window.open=()=>popup;t.button('Edit / update stock').props.onClick();t.render();
 t.button('Save item and print').props.onClick();await flush();t.render();assert.equal(popup.prints,0);assert.equal(popup.closed,true);assert.ok(t.dialog());assert.match(content(t.dialog()),/Save not confirmed/);t.h.unmount();
});
test('blocked save-and-print window still saves and offers a fresh user-initiated print',async()=>{
 const t=await setup();t.h.window.open=()=>null;t.button('Add item').props.onClick();t.render();t.button('Save item and print').props.onClick();await flush();t.render();
 assert.equal(t.calls.length,1);const label=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Barcode label');assert.match(content(label),/Item saved/);
 const popup=printWindow();t.h.window.open=()=>popup;nodes(label.props.actions).find(n=>n.type==='button'&&content(n)==='Print label').props.onClick();assert.equal(popup.prints,1);t.h.unmount();
});
test('leaving during save or closing waiting window does not print unexpectedly',async()=>{
 for(const unmount of [true,false]) {
  let resolve;const pending=new Promise(yes=>resolve=yes);const t=await setup({save:()=>pending});const popup=printWindow();t.h.window.open=()=>popup;t.button('Add item').props.onClick();t.render();t.button('Save item and print').props.onClick();
  if(unmount)t.h.unmount();else popup.close();resolve(item);await flush();assert.equal(popup.prints,0);assert.equal(popup.closed,true);
  if(!unmount){t.render();assert.match(content(t.h.tree),/Item saved/);t.h.unmount();}
 }
});

test('inventory trash is confirmed, recoverable, and removed from active totals and editing',async()=>{
 const t=await setup();t.h.find(n=>n.props?.['aria-label']==='Move Red fur to Trash').props.onClick();t.render();
 const dialog=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Move inventory item to Trash?');assert.equal(dialog.props.draggable,false);assert.match(content(dialog),/60 days/);
 nodes(dialog.props.actions).find(n=>n.type==='button'&&content(n)==='Move to Trash').props.onClick();await flush();t.render();assert.equal(t.button('Edit / update stock'),undefined);
 t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.onChange('trash');t.render();assert.ok(t.button('Restore item'));assert.equal(t.button('Print barcode'),undefined);
 t.button('Restore item').props.onClick();await flush();t.render();assert.equal(t.button('Restore item'),undefined);
 t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.onChange('all');t.render();assert.ok(t.button('Edit / update stock'));t.h.unmount();
});
test('trash failure stays in its confirmation and repeated clicks submit once',async()=>{
 let reject,calls=0;const pending=new Promise((_,no)=>reject=no);const t=await setup({trash:()=>{calls++;return pending;}});
 t.h.find(n=>n.props?.['aria-label']==='Move Red fur to Trash').props.onClick();t.render();const dialog=t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Move inventory item to Trash?');const action=nodes(dialog.props.actions).find(n=>n.type==='button'&&content(n)==='Move to Trash');action.props.onClick();action.props.onClick();assert.equal(calls,1);reject(Error('Trash not confirmed'));await flush();t.render();assert.equal(t.h.all(n=>n.props?.role==='alert').length,1);assert.match(content(t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Move inventory item to Trash?')),/Trash not confirmed/);t.h.unmount();
});
test('restore barcode conflict does not hide or overwrite the trashed record',async()=>{
 const t=await setup({items:[{...item,trashedAt:'2026-10-26T20:00:00Z'}],restore:async()=>{throw Error('Barcode is now assigned elsewhere');}});t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.onChange('trash');t.render();t.button('Restore item').props.onClick();await flush();t.render();assert.ok(t.button('Restore item'));assert.match(content(t.h.tree),/Barcode is now assigned elsewhere/);t.h.unmount();
});
test('scanning ignores trashed barcode history in favor of the current live item',async()=>{
 const t=await setup({items:[{...item,name:'Old item',trashedAt:'2026-10-26T20:00:00Z'},{...item,id:'22222222-2222-4222-8222-222222222222',name:'Current item'}]});
 t.h.find(n=>n.type==='input'&&n.props.placeholder==='Name, tag or barcode').props.onChange({target:{value:'FUR-001'}});t.render();t.h.find(n=>n.type==='input'&&n.props.placeholder==='Name, tag or barcode').props.onKeyDown({key:'Enter',preventDefault(){}});t.render();assert.equal(t.h.find(n=>n.props?.id==='inventory-name').props.value,'Current item');t.h.unmount();
});
test('generated barcode provenance is preserved until the field is manually changed or scanned',async()=>{
 for(const manual of [false,true]) {
  const t=await setup();t.button('Edit / update stock').props.onClick();t.render();t.button('Generate').props.onClick();await flush();t.render();
  if(manual){t.h.find(n=>n.props?.id==='inventory-barcode').props.onChange({target:{value:'RETIRED-001'}});t.render();}
  t.action('Save item').props.onClick();await flush();assert.equal(t.calls[0].options.barcodeAssignment,manual?'manual':'generated');t.h.unmount();
 }
 const t=await setup();t.button('Add item').props.onClick();t.render();t.action('Save item').props.onClick();await flush();assert.equal(t.calls[0].options.barcodeAssignment,'generated');t.h.unmount();
});

test('new items have only save-and-print; existing print controls share a compact group',async()=>{
 const t=await setup();t.button('Add item').props.onClick();t.render();
 assert.equal(t.button('Print saved barcode'),undefined);assert.ok(t.button('Save item and print'));
 const group=t.h.find(n=>n.props.className==='printActions');assert.deepEqual(nodes(group).filter(n=>n.type==='button').map(content),['Save item and print']);
 t.h.unmount();const saved=await setup();saved.button('Edit / update stock').props.onClick();saved.render();
 assert.deepEqual(nodes(saved.h.find(n=>n.props.className==='printActions')).filter(n=>n.type==='button').map(content),['Save item and print','Print saved barcode']);saved.h.unmount();
});
for(const label of ['Item type','Category','Unit']) test(`${label} creation failure stays inline and cancel preserves selected value`,async()=>{
 const t=await setup({saveCategories:async()=>{throw Error('Unable to save choice');}});t.button('Edit / update stock').props.onClick();t.render();
 const select=()=>t.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label===label&&n.props.inlineCreate);const previous=select().props.value;
 select().props.inlineCreate.onStart();t.render();select().props.inlineCreate.onNameChange('Test choice');t.render();
 const focusCount=t.h.focusLog.length;assert.equal(await select().props.inlineCreate.onSubmit(),false);t.render();
 assert.equal(select().props.inlineCreate.name,'Test choice');assert.equal(select().props.inlineCreate.error,'Unable to save choice');assert.equal(select().props.value,previous);
 assert.equal(t.h.focusLog.length,focusCount,'parent error must not steal inline input focus');assert.equal(t.h.all(n=>n.props.id==='inventory-dialog-error').length,0);
 select().props.inlineCreate.onCancel();t.render();assert.equal(select().props.inlineCreate.active,false);assert.equal(select().props.value,previous);assert.equal(select().props.inlineCreate.error,'');t.h.unmount();
});

test('inventory print group uses a compact gap instead of spacing its actions apart',()=>{
 const css=readFileSync(new URL('../src/owner/OwnerInventory.module.css',import.meta.url),'utf8');
 const actions=css.match(/\.printActions\s*\{([^}]+)\}/)?.[1];assert.match(actions,/display:flex/);assert.match(actions,/gap:8px/);assert.doesNotMatch(actions,/space-between/);
 assert.doesNotMatch(css,/\.createChoice/,'removed below-form choice card has no leftover styles');
});

test('inventory compact icons keep distinct actions while blank card opens the item',async()=>{
 const t=await setup();const card=()=>t.h.find(n=>n.type==='article');
 assert.equal(card().props.role,undefined);assert.equal(card().props.tabIndex,0);
 const edit=t.h.find(n=>n.props?.['aria-label']==='Edit Red fur');
 const print=t.h.find(n=>n.props?.['aria-label']==='Print barcode for Red fur');
 assert.ok(edit);assert.ok(print);assert.equal(content(edit),'');assert.equal(content(print),'');
 assert.equal(nodes(card()).filter(n=>n.type==='button').length,3);
 print.props.onClick();t.render();assert.equal(t.dialog(),undefined);assert.ok(t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Barcode label'));
 t.h.find(n=>n.type?.name==='Dialog'&&n.props.title==='Barcode label').props.onClose();t.render();
 card().props.onClick({button:0,target:{closest:()=>null},clientX:0,clientY:0});t.render();assert.ok(t.dialog());t.h.unmount();
});

test('inventory blank-card activation respects controls, barcode copying, selection and drag gestures',async()=>{
 const t=await setup();const card=()=>t.h.find(n=>n.type==='article');
 const click={button:0,target:{closest:()=>null},clientX:0,clientY:0};
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{button:1},{defaultPrevented:true},{target:{closest:()=>({})}}]) {card().props.onClick({...click,...extra});t.render();assert.equal(t.dialog(),undefined);}
 let selector='';card().props.onClick({...click,target:{closest:s=>{selector=s;return {};}}});assert.match(selector,/button/);assert.match(selector,/code/);assert.match(selector,/input/);
 t.h.window.getSelection=()=>({toString:()=> 'FUR-001'});card().props.onClick(click);t.render();assert.equal(t.dialog(),undefined);
 t.h.window.getSelection=()=>({toString:()=>''});card().props.onPointerDown({clientX:0,clientY:0});card().props.onClick({...click,clientX:40});t.render();assert.equal(t.dialog(),undefined);t.h.unmount();
});

test('inventory card Enter and Space open only the focused card, never child controls',async()=>{
 for(const key of ['Enter',' ']) {
  const t=await setup();const card=()=>t.h.find(n=>n.type==='article');const target={};let prevented=0;
  card().props.onKeyDown({key,target:{},currentTarget:target,preventDefault(){prevented++;}});t.render();assert.equal(t.dialog(),undefined);assert.equal(prevented,0);
  card().props.onKeyDown({key,target,currentTarget:target,preventDefault(){prevented++;}});t.render();assert.ok(t.dialog());assert.equal(prevented,1);t.h.unmount();
 }
});

test('busy and trashed inventory cards cannot be activated and Trash offers only restore',async()=>{
 let resolve;const t=await setup({save:()=>new Promise(r=>resolve=r)});t.button('Edit / update stock').props.onClick();t.render();t.action('Save item').props.onClick();t.render();
 const card=t.h.find(n=>n.type==='article');assert.equal(card.props.tabIndex,undefined);assert.ok(nodes(card).filter(n=>n.type==='button').every(n=>n.props.disabled));
 resolve({...item,revision:2});await flush();t.h.unmount();
 const trash=await setup({items:[{...item,trashedAt:'2026-10-26T20:00:00Z'}]});trash.h.find(n=>n.type?.name==='OwnerSelect'&&n.props.label==='Show').props.onChange('trash');trash.render();const trashed=trash.h.find(n=>n.type==='article');assert.equal(trashed.props.tabIndex,undefined);assert.deepEqual(nodes(trashed).filter(n=>n.type==='button').map(content),['Restore item']);
 trashed.props.onClick({button:0,target:{closest:()=>null}});trash.render();assert.equal(trash.dialog(),undefined);trash.h.unmount();
});
