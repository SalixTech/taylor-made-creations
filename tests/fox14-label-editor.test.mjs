import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,content} from './owner-ui-harness.mjs';
function setup(){
 const h=harness(),model=h.load('src/client-hub/label-presentation.ts'),C=h.load('src/owner/LabelPresentationEditor.tsx').LabelPresentationEditor;
 const original=model.emptyLabelPresentation();original.entries['custom:RAWR']={name:'RAWR',color:'#123456',hidden:false,deleted:false};original.order.push('custom:RAWR');
 const capture=[];
 let value={entries:structuredClone(original.entries),order:[...original.order]},changes=[];
 const props={value,baselineEntries:structuredClone(original.entries),onChange(next){value=next;props.value=next;changes.push(structuredClone(next));},disabled:false};
 const geometry=()=>value.order.filter(k=>!value.entries[k].deleted).map((key,index)=>({dataset:{labelKey:key},getBoundingClientRect:()=>({left:0,right:500,top:index*70,bottom:(index+1)*70,width:500,height:70}),animate(){}}));
 const render=()=>{h.render(C,props);h.find(n=>n.props.role==='list').props.ref.current={querySelectorAll:geometry,setPointerCapture(id){capture.push(id);}};};
 const button=label=>h.find(n=>n.type==='button'&&(n.props['aria-label']===label||content(n)===label));
 const dialog=()=>h.find(n=>n.type?.name==='Dialog');
 const action=label=>nodes(dialog().props.actions).find(n=>n.type==='button'&&content(n)===label);
 const input=label=>nodes(h.find(n=>n.type==='label'&&content(n).startsWith(label))).find(n=>n.type==='input');
 const target={parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:500,height:70})},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}};
 const pointer=y=>({button:0,pointerId:1,clientX:70,clientY:y,currentTarget:target});
 render();return{h,model,props,render,button,dialog,action,input,pointer,changes,capture,list:()=>h.find(n=>n.props.role==='list'),get value(){return value;}};
}
const key=(value)=>({key:value,preventDefault(){},stopPropagation(){}});
test('one uniform list includes built-ins/custom once with left ordinal and right edit/trash controls',()=>{
 const f=setup();const rows=f.h.all(n=>n.props.role==='listitem');assert.equal(rows.length,7);assert.equal(rows.filter(n=>n.props['data-label-key']==='custom:RAWR').length,1);
 const row=rows[0],children=nodes(row);assert.equal(children.find(n=>n.type==='span').props.children[0]??children.find(n=>n.type==='span').props.children,1);
 assert.deepEqual(children.filter(n=>n.type==='button').map(n=>n.props['aria-label']),['Reorder Commission status','Edit Commission status','Hide Commission status']);assert.equal(f.changes.length,0);f.h.unmount();
});
test('edit cancel is staged; accepted custom rename/recolor retains immutable assignment key',()=>{
 const f=setup();f.button('Edit RAWR').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'Bright fox'}});f.render();f.input('Hex color').props.onChange({target:{value:'#aa00ff'}});f.render();assert.equal(f.changes.length,0);
 f.action('Cancel').props.onClick();f.render();assert.equal(f.value.entries['custom:RAWR'].name,'RAWR');
 f.button('Edit RAWR').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'Bright fox'}});f.render();f.input('Hex color').props.onChange({target:{value:'#aa00ff'}});f.render();const save=f.action('Save label').props.onClick;save();save();f.render();
 assert.equal(f.changes.length,1);assert.deepEqual(f.value.entries['custom:RAWR'],{name:'Bright fox',color:'#AA00FF',hidden:false,deleted:false});assert.ok(f.value.order.includes('custom:RAWR'));f.h.unmount();
});
test('RGB/hex/color-picker changes synchronize, invalid values cannot save and default restores null',()=>{
 const f=setup();f.button('Edit RAWR').props.onClick();f.render();
 f.input('Red').props.onChange({target:{value:'256'}});f.render();assert.equal(f.action('Save label').props.disabled,true);f.action('Save label').props.onClick();assert.equal(f.changes.length,0);
 f.input('Red').props.onChange({target:{value:'255'}});f.render();assert.equal(f.input('Hex color').props.value,'#FF3456');
 f.input('Hex color').props.onChange({target:{value:'#12'}});f.render();assert.equal(f.action('Save label').props.disabled,true);
 f.input('Color picker').props.onChange({target:{value:'#010203'}});f.render();assert.deepEqual(['Red','Green','Blue'].map(name=>f.input(name).props.value),['1','2','3']);
 f.button('Use default color').props.onClick();f.render();f.action('Save label').props.onClick();f.render();assert.equal(f.value.entries['custom:RAWR'].color,null);f.h.unmount();
});
test('custom delete confirms and retains tombstone/order/last appearance; built-in hide remains reversible',()=>{
 const f=setup(),before=structuredClone(f.value.entries['custom:RAWR']);f.button('Delete RAWR').props.onClick();f.render();assert.match(content(f.dialog()),/last saved name and color/);f.action('Cancel').props.onClick();f.render();assert.deepEqual(f.value.entries['custom:RAWR'],before);
 f.button('Delete RAWR').props.onClick();f.render();const remove=f.action('Delete label').props.onClick;remove();remove();f.render();assert.deepEqual(f.value.entries['custom:RAWR'],{...before,deleted:true});assert.ok(f.value.order.includes('custom:RAWR'));assert.equal(f.button('Edit RAWR'),undefined);
 f.button('Hide Commission status').props.onClick();f.render();assert.equal(f.value.entries.status.hidden,true);assert.equal(f.value.entries.status.deleted,false);f.button('Show Commission status').props.onClick();f.render();assert.equal(f.value.entries.status.hidden,false);assert.equal(f.changes.length,3);f.h.unmount();
});
test('new labels acquire an opaque key only on explicit Save label, cancel/repeat cannot duplicate',()=>{
 const f=setup();f.button('Add label').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'New fox'}});f.render();assert.equal(f.value.order.length,7);f.action('Cancel').props.onClick();f.render();assert.equal(f.value.order.length,7);
 f.button('Add label').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'New fox'}});f.render();const save=f.action('Save label').props.onClick;save();save();f.render();assert.equal(f.value.order.length,8);const id=f.value.order.at(-1);assert.match(id,/^custom:id_[a-f0-9]{32}$/);assert.equal(f.value.entries[id].name,'New fox');assert.equal(f.changes.length,1);f.h.unmount();
});
test('keyboard reorder moves live, Space drops and Escape restores original complete order',()=>{
 const f=setup(),before=[...f.value.order];f.button('Reorder Commission status').props.onKeyDown(key(' '));f.render();f.button('Reorder Commission status').props.onKeyDown(key('ArrowDown'));f.render();assert.equal(f.value.order[1],'status');f.button('Reorder Commission status').props.onKeyDown(key('Escape'));f.render();assert.deepEqual(f.value.order,before);
 f.button('Reorder Commission status').props.onKeyDown(key(' '));f.render();f.button('Reorder Commission status').props.onKeyDown(key('ArrowDown'));f.render();f.button('Reorder Commission status').props.onKeyDown(key(' '));f.render();assert.equal(f.value.order[1],'status');assert.equal(f.button('Reorder Commission status').props['aria-pressed'],false);f.h.unmount();
});
test('pointer drag uses full-row ghost and live reflow before drop; cancellation restores original order',()=>{
 const f=setup(),before=[...f.value.order];f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));f.list().props.onPointerMove(f.pointer(160));f.render();assert.equal(f.value.order[2],'status');
 const ghost=f.h.find(n=>n.props['aria-hidden']==='true'&&n.props.style?.width===500);assert.ok(ghost);assert.equal(ghost.props.style.height,70);assert.ok(nodes(ghost).some(n=>n.type?.name==='TrashIcon'));
 f.list().props.onPointerCancel();f.render();assert.deepEqual(f.value.order,before);
 f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));f.list().props.onPointerMove(f.pointer(90));f.render();f.list().props.onPointerUp(f.pointer(90));f.render();assert.equal(f.value.order[1],'status');assert.equal(f.h.find(n=>n.props.style?.width===500),undefined);f.h.unmount();
});
test('pending parent state disables edit/delete/add/reorder and ignores retained event handlers',()=>{
 const f=setup(),before=structuredClone(f.value);f.props.disabled=true;f.render();assert.equal(f.button('Edit RAWR').props.disabled,true);f.button('Edit RAWR').props.onClick();f.button('Delete RAWR').props.onClick();f.button('Hide Commission status').props.onClick();f.button('Reorder Commission status').props.onKeyDown(key(' '));f.render();assert.equal(f.dialog(),undefined);assert.deepEqual(f.value,before);assert.equal(f.changes.length,0);f.h.unmount();
});


test('deleting an edited existing label retains its last saved appearance, never unsaved edits',()=>{
 const f=setup(),saved=structuredClone(f.value.entries['custom:RAWR']);
 f.button('Edit RAWR').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'Unsaved rename'}});f.render();f.input('Hex color').props.onChange({target:{value:'#ABCDEF'}});f.render();f.action('Save label').props.onClick();f.render();
 f.button('Delete Unsaved rename').props.onClick();f.render();f.action('Delete label').props.onClick();f.render();assert.deepEqual(f.value.entries['custom:RAWR'],{...saved,deleted:true});assert.ok(f.value.order.includes('custom:RAWR'));f.h.unmount();
});
test('deleting a new staged label removes its unsaved identity rather than creating a server-invalid tombstone',()=>{
 const f=setup(),before=structuredClone(f.value);f.button('Add label').props.onClick();f.render();f.input('Label name').props.onChange({target:{value:'Never saved to cloud'}});f.render();f.action('Save label').props.onClick();f.render();assert.equal(f.value.order.length,before.order.length+1);
 f.button('Delete Never saved to cloud').props.onClick();f.render();f.action('Delete label').props.onClick();f.render();assert.deepEqual(f.value,before);f.h.unmount();
});

test('pointer hit testing uses live layout slots rather than animated old positions',()=>{
 const f=setup(),original=[...f.value.order];
 const geometry={setPointerCapture(){},scrollTop:0,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>f.value.order.map((key,index)=>({dataset:{labelKey:key},offsetParent:geometry,offsetTop:index*70,offsetHeight:70,getBoundingClientRect:()=>({left:0,right:500,top:original.indexOf(key)*70,bottom:(original.indexOf(key)+1)*70}),animate(){}}))};
 const install=()=>{f.h.find(n=>n.props.role==='list').props.ref.current=geometry;};install();
 f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));f.list().props.onPointerMove(f.pointer(160));f.render();install();assert.equal(f.value.order[2],'status');
 f.list().props.onPointerMove(f.pointer(160));f.render();assert.equal(f.value.order[2],'status');assert.equal(f.changes.length,1,'stationary pointer must not swap back during reflow animation');f.h.unmount();
});

test('pointer capture belongs to stable list; descendant lost capture cannot roll back the staged move',()=>{
 const f=setup();f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));assert.deepEqual(f.capture,[1]);
 f.list().props.onPointerMove(f.pointer(160));f.render();assert.equal(f.value.order[2],'status');
 f.list().props.onLostPointerCapture({pointerId:1,target:{},currentTarget:{}});f.render();assert.equal(f.value.order[2],'status');
 f.list().props.onPointerUp(f.pointer(160));f.render();assert.equal(f.value.order[2],'status');f.h.unmount();
});

test('unexpected stable-list capture loss restores original order while normal pointer release keeps drop',()=>{
 const f=setup(),original=[...f.value.order],listTarget={};
 f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));f.list().props.onPointerMove(f.pointer(160));f.render();
 f.list().props.onLostPointerCapture({pointerId:1,target:listTarget,currentTarget:listTarget});f.render();assert.deepEqual(f.value.order,original);
 f.button('Reorder Commission status').props.onPointerDown(f.pointer(20));f.list().props.onPointerMove(f.pointer(160));f.render();f.list().props.onPointerUp(f.pointer(160));f.render();
 f.list().props.onLostPointerCapture({pointerId:1,target:listTarget,currentTarget:listTarget});f.render();assert.equal(f.value.order[2],'status');f.h.unmount();
});
