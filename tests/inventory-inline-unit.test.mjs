import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(save=async()=>true){
 const h=harness();h.window.innerWidth=900;h.window.innerHeight=700;
 const Select=h.load('src/components/SiteSelect.tsx').default;let selected='pieces';
 const inlineCreate={active:false,name:'',label:'New unit',maxLength:30,busy:false,onStart(){this.active=true;},onCancel(){this.active=false;this.name='';},onNameChange(value){this.name=value;},onSubmit:save};
 const props={id:'unit',value:'pieces',options:[{value:'pieces',label:'pieces'},{value:'__create__',label:'+ Create unit'}],onChange:v=>selected=v,inlineCreate};
 const render=()=>h.render(Select,props);render();
 const combo=()=>h.find(n=>n.props.role==='combobox');combo().props.onClick();render();
 const create=()=>{h.find(n=>n.props.role==='option'&&content(n)==='+ Create unit').props.onClick();render();};
 return{h,render,create,inlineCreate,combo,get selected(){return selected;}};
}
test('unit creation stays inside the dropdown and never selects the sentinel',async()=>{
 const t=setup();t.create();assert.equal(t.combo().props['aria-expanded'],true);assert.equal(t.selected,'pieces');
 assert.ok(t.h.find(n=>n.props['data-select-create']));const input=t.h.find(n=>n.props.id==='unit-create');assert.equal(input.props.maxLength,30);
 input.props.onChange({target:{value:'rolls'}});t.render();const add=t.h.find(n=>n.type==='button'&&content(n)==='Add');assert.equal(add.props.disabled,false);
 add.props.onClick();await flush();t.render();assert.equal(t.combo().props['aria-expanded'],false);t.h.unmount();
});
test('unit failure preserves the dropdown draft and Escape cancels without changing current unit',async()=>{
 const t=setup(async()=>false);t.create();t.h.find(n=>n.props.id==='unit-create').props.onChange({target:{value:'yards'}});t.render();
 t.h.find(n=>n.type==='button'&&content(n)==='Add').props.onClick();await flush();t.render();assert.equal(t.combo().props['aria-expanded'],true);assert.equal(t.inlineCreate.name,'yards');
 t.inlineCreate.error='Already exists';t.render();assert.equal(content(t.h.find(n=>n.props.role==='alert')),'Already exists');
 t.h.find(n=>n.props['data-select-create']).props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.inlineCreate.active,false);assert.equal(t.selected,'pieces');t.h.unmount();
});
test('fixed confirmation dialog has no move handle, pointer drag or keyboard move actions',()=>{
 const h=harness(),Dialog=h.load('src/owner/OwnerDialog.tsx').Dialog;h.render(Dialog,{title:'Discard?',draggable:false,onClose(){},actions:null});
 assert.equal(h.all(n=>n.props['data-move-handle']).length,0);const dialog=h.find(n=>n.type==='dialog');assert.equal(dialog.props.style,undefined);assert.equal(dialog.props['data-moving'],false);h.unmount();
});
