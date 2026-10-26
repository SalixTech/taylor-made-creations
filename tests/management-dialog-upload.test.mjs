import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content} from './owner-ui-harness.mjs';
function dialogView(t,disabled=false){
 const h=harness();t.after(()=>h.unmount());let closes=0;
 const {Dialog}=h.load('src/owner/OwnerFields.tsx');
 h.render(Dialog,{title:'Save your changes',children:'Safe content',actions:'Actions',dismissDisabled:disabled,onClose(){closes++;}});
 const node=h.tree,element=node.props.ref.current;
 element.getBoundingClientRect=()=>({left:10,right:110,top:10,bottom:110});
 const event=(x,y,target=element)=>({target,currentTarget:element,clientX:x,clientY:y});
 return{h,node,event,get closes(){return closes;}};
}
test('dialog closes on true outside pointer click, not panel whitespace or drag-out',t=>{
 const v=dialogView(t);
 v.node.props.onPointerDown(v.event(50,50));v.node.props.onClick(v.event(200,200));assert.equal(v.closes,0);
 v.node.props.onPointerDown(v.event(50,50));v.node.props.onClick(v.event(50,50));assert.equal(v.closes,0);
 v.node.props.onPointerDown(v.event(200,200));v.node.props.onClick(v.event(200,200));assert.equal(v.closes,1);
});
test('busy dialog preserves pending operation on outside click or Escape',t=>{
 const v=dialogView(t,true);v.node.props.onPointerDown(v.event(200,200));v.node.props.onClick(v.event(200,200));
 let prevented=false;v.node.props.onCancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(v.closes,0);
 assert.equal(v.h.find(n=>n.type==='button').props.disabled,true);
});
test('dialog title uses its generated accessible identifier',t=>{
 const v=dialogView(t);const title=v.h.find(n=>n.type==='h2');assert.equal(title.props.id,v.node.props['aria-labelledby']);assert.match(content(title),/Save your changes/);
});
test('upload cancellation registry aborts only pending requests and ends busy state once',t=>{
 const h=harness();t.after(()=>h.unmount());const changes=[];let first=0,second=0;
 const {OwnerUploadProvider,OwnerUploadCancel}=h.load('src/owner/PhotoUpload.tsx');
 h.render(OwnerUploadProvider,{children:'content',onBusyChange:value=>changes.push(value)});
 const activity=h.tree.props.value;const finishA=activity.begin(()=>first++),finishB=activity.begin(()=>second++);
 finishA();finishA();activity.cancelAll();assert.equal(first,0);assert.equal(second,1);finishB();assert.equal(changes.at(-1),false);
 h.currentContext={...activity,cancelAll:()=>{second++;}};h.render(OwnerUploadCancel,{className:'secondary'});h.tree.props.onClick();assert.equal(second,2);assert.equal(h.tree.props.disabled,undefined);
});
