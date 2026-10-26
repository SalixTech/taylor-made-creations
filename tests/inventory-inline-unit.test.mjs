import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(save=async()=>true,choiceLabel="unit"){
 const h=harness();h.window.innerWidth=900;h.window.innerHeight=700;
 const Select=h.load('src/components/SiteSelect.tsx').default;let selected='pieces';
 const inlineCreate={active:false,name:'',label:`New ${choiceLabel}`,maxLength:30,busy:false,onStart(){this.active=true;},onCancel(){this.active=false;this.name='';},onNameChange(value){this.name=value;},onSubmit:save};
 const props={id:'unit',value:'pieces',options:[{value:'pieces',label:'pieces'},{value:'__create__',label:`+ Create ${choiceLabel}`}],onChange:v=>selected=v,inlineCreate};
 const render=()=>h.render(Select,props);render();
 const combo=()=>h.find(n=>n.props.role==='combobox');combo().props.onClick();render();
 const create=()=>{h.find(n=>n.props.role==='option'&&content(n)===`+ Create ${choiceLabel}`).props.onClick();render();};
 return{h,render,create,inlineCreate,combo,get selected(){return selected;}};
}
test('unit creation stays inside the dropdown and never selects the sentinel',async()=>{
 const t=setup();t.create();assert.equal(t.combo().props['aria-expanded'],true);assert.equal(t.selected,'pieces');
 assert.ok(t.h.find(n=>n.props['data-select-create']));const input=t.h.find(n=>n.props.id==='unit-create');assert.equal(input.props.maxLength,30);
 input.props.onChange({target:{value:'rolls'}});t.render();const add=t.h.find(n=>n.type==='button'&&content(n)==='Add');assert.equal(add.props.disabled,false);
 add.props.onClick();await flush();t.render();assert.equal(t.combo().props['aria-expanded'],false);assert.equal(t.h.focusLog.at(-1),'unit');t.h.unmount();
});
test('unit failure preserves the dropdown draft and Escape cancels without changing current unit',async()=>{
 const t=setup(async()=>false);t.create();t.h.find(n=>n.props.id==='unit-create').props.onChange({target:{value:'yards'}});t.render();
 t.h.find(n=>n.type==='button'&&content(n)==='Add').props.onClick();await flush();t.render();assert.equal(t.combo().props['aria-expanded'],true);assert.equal(t.inlineCreate.name,'yards');
 t.inlineCreate.error='Already exists';t.render();assert.equal(content(t.h.find(n=>n.props.role==='alert')),'Already exists');
 t.h.find(n=>n.props['data-select-create']).props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.inlineCreate.active,false);assert.equal(t.selected,'pieces');assert.equal(t.h.focusLog.at(-1),'unit');t.h.unmount();
});
test('fixed confirmation dialog has no move handle, pointer drag or keyboard move actions',()=>{
 const h=harness(),Dialog=h.load('src/owner/OwnerDialog.tsx').Dialog;h.render(Dialog,{title:'Discard?',draggable:false,onClose(){},actions:null});
 assert.equal(h.all(n=>n.props['data-move-handle']).length,0);const dialog=h.find(n=>n.type==='dialog');assert.equal(dialog.props.style,undefined);assert.equal(dialog.props['data-moving'],false);h.unmount();
});

test('Escape during pending choice save keeps its draft and late failure inside the dropdown',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes);const t=setup(()=>pending);t.create();
 t.h.find(n=>n.props.id==='unit-create').props.onChange({target:{value:'rolls'}});t.render();
 t.h.find(n=>n.type==='button'&&content(n)==='Add').props.onClick();t.inlineCreate.busy=true;t.render();
 const focusCount=t.h.focusLog.length;let prevented=false,stopped=false;
 t.h.find(n=>n.props['data-select-create']).props.onKeyDown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});t.render();
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(t.inlineCreate.active,true);assert.equal(t.inlineCreate.name,'rolls');assert.equal(t.h.focusLog.length,focusCount);
 resolve(false);await flush();t.inlineCreate.busy=false;t.inlineCreate.error='Unable to save choice';t.render();
 assert.equal(t.combo().props['aria-expanded'],true);assert.equal(t.inlineCreate.active,true);assert.equal(t.inlineCreate.name,'rolls');assert.equal(content(t.h.find(n=>n.props.role==='alert')),'Unable to save choice');assert.equal(t.selected,'pieces');
 t.h.find(n=>n.props['data-select-create']).props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.inlineCreate.active,false);assert.equal(t.h.focusLog.at(-1),'unit');t.h.unmount();
});

for(const choiceLabel of ['unit','category','item type']) for(const result of [true,false]) test(`pending ${choiceLabel} creation blocks option and cancel clicks until ${result?'success':'failure'}`,async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes);const t=setup(()=>pending,choiceLabel);t.create();t.h.find(n=>n.props.id==='unit-create').props.onChange({target:{value:'rolls'}});t.render();
 t.h.find(n=>n.type==='button'&&content(n)==='Add').props.onClick();t.inlineCreate.busy=true;t.render();const focusCount=t.h.focusLog.length;
 for(const option of t.h.all(n=>n.props.role==='option')){assert.equal(option.props['aria-disabled'],true);option.props.onClick();t.render();}
 t.h.find(n=>n.props['aria-label']==='Cancel new option').props.onClick();t.render();
 t.combo().props.onKeyDown({key:'Enter',preventDefault(){},stopPropagation(){}});t.render();
 assert.equal(t.inlineCreate.active,true);assert.equal(t.inlineCreate.name,'rolls');assert.equal(t.selected,'pieces');assert.equal(t.h.focusLog.length,focusCount);
 resolve(result);await flush();t.inlineCreate.busy=false;t.render();assert.equal(t.combo().props['aria-expanded'],!result);if(!result)assert.equal(t.inlineCreate.name,'rolls');t.h.unmount();
});
