import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
function setup({native=false,top=110,bottom=153,viewport=700}={}) {
 const h=harness();h.window.innerWidth=1000;h.window.innerHeight=viewport;
 const Select=h.load('src/components/SiteSelect.tsx').default;let chosen=null;
 const props={id:'choice',value:'a',options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}],onChange:value=>{chosen=value;}};
 const render=()=>h.render(Select,props);render();const control=h.byId.get('choice');
 control.getBoundingClientRect=()=>({top,bottom,left:30,width:300,height:bottom-top});
 const prototype=Object.getPrototypeOf(control);let opened=0,closed=0;
 if(native){prototype.showPopover=function(){opened++;};prototype.hidePopover=function(){closed++;};}
 const open=()=>{h.find(n=>n.props.role==='combobox').props.onClick();render();};
 return{h,props,render,open,get chosen(){return chosen;},get opened(){return opened;},get closed(){return closed;},list:()=>h.find(n=>n.props['data-site-select-menu']),close(){h.unmount();delete prototype.showPopover;delete prototype.hidePopover;}};
}
test('modern dropdown opens below control in top layer, never above/clipped by a short card',()=>{
 const t=setup({native:true});t.open();assert.equal(t.list().props['data-floating'],true);assert.equal(t.list().props.style.top,159);assert.equal(t.list().props.style.bottom,'auto');assert.equal(t.list().props.popover,'manual');assert.equal(t.opened,1);
 t.h.find(n=>n.props.role==='option'&&content(n)==='Beta').props.onClick();t.render();assert.equal(t.chosen,'b');assert.equal(t.list(),undefined);assert.equal(t.closed,1);t.close();
});
test('bottom-edge and older-browser fallback expand below in document flow instead of becoming a dropup',()=>{
 for(const options of [{native:true,top:640,bottom:683},{native:false}]){const t=setup(options);t.open();assert.equal(t.list().props['data-floating'],false);assert.equal(t.list().props.style.position,'relative');assert.equal(t.list().props.style.bottom,'auto');assert.equal(t.list().props.popover,undefined);t.close();}
});
test('dropdown keyboard selection, Escape and repeated trigger retain predictable close behavior',()=>{
 const t=setup();const key=value=>{t.h.find(n=>n.props.role==='combobox').props.onKeyDown({key:value,preventDefault(){},stopPropagation(){}});t.render();};
 key('ArrowDown');key('ArrowDown');key('Enter');assert.equal(t.chosen,'b');assert.equal(t.list(),undefined);t.open();key('Escape');assert.equal(t.list(),undefined);t.open();t.h.find(n=>n.props.role==='combobox').props.onClick();t.render();assert.equal(t.list(),undefined);t.close();
});
