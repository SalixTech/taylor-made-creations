import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './owner-ui-harness.mjs';

function setup() {
  const h=harness();h.window.innerWidth=1200;h.window.innerHeight=800;
  const {useMovablePanel,constrainPanelOffset}=h.load('src/owner/use-movable-panel.ts');
  const ref={current:null};let state;const props={disabled:false};
  function Panel(){state=useMovablePanel(ref,props.disabled);return {type:'aside',props:{ref,style:state.style,children:{type:'header',props:state.handleProps}}};}
  const render=()=>{h.render(Panel);ref.current.getBoundingClientRect=()=>({left:200,top:100,width:400,height:400});};
  render();
  function start(extra={}){state.handleProps.onPointerDown({button:0,isPrimary:true,pointerId:1,clientX:220,clientY:120,target:{closest(){return null;}},currentTarget:{focus(){}},preventDefault(){},...extra});render();}
  function dispatch(type,props={}){const event=new Event(type,{cancelable:true});Object.assign(event,props);h.window.dispatchEvent(event);render();return event;}
  return {h,ref,props,render,start,dispatch,constrainPanelOffset,get state(){return state;}};
}

test('whole panel stays inside the viewport and oversized header remains reachable',()=>{
  const t=setup();assert.deepEqual(t.constrainPanelOffset({x:-1000,y:1000},{left:200,top:100,width:400,height:400},{width:1200,height:800}),{x:-192,y:292});
  assert.deepEqual(t.constrainPanelOffset({x:99,y:99},{left:0,top:0,width:2000,height:1000},{width:375,height:650}),{x:8,y:8});t.h.unmount();
});
test('mouse/touch/pen pointer moves commit on release but cancel and blur restore prior position',()=>{
  const t=setup(); t.start();assert.equal(t.state.moving,true);
  t.dispatch('pointermove',{pointerId:1,clientX:320,clientY:170});assert.equal(t.state.style.transform,'translate(100px, 50px)');
  t.dispatch('pointerup',{pointerId:1});assert.equal(t.state.moving,false);
  t.start();t.dispatch('pointermove',{pointerId:1,clientX:240,clientY:140});assert.equal(t.state.style.transform,'translate(120px, 70px)');
  t.dispatch('pointercancel',{pointerId:1});assert.equal(t.state.style.transform,'translate(100px, 50px)');
  t.start();t.dispatch('pointermove',{pointerId:1,clientX:300,clientY:200});t.dispatch('blur');assert.equal(t.state.style.transform,'translate(100px, 50px)');
  t.h.unmount();
});
test('Escape cancels a drag before dialog dismissal and foreign pointers cannot move it',()=>{
  const t=setup();t.start();t.dispatch('pointermove',{pointerId:8,clientX:500,clientY:500});assert.equal(t.state.style.transform,'translate(0px, 0px)');
  t.dispatch('pointermove',{pointerId:1,clientX:320,clientY:200});const event=t.dispatch('keydown',{key:'Escape'});assert.equal(event.defaultPrevented,true);assert.equal(t.state.style.transform,'translate(0px, 0px)');assert.equal(t.state.moving,false);t.h.unmount();
});
test('close-button SVG paths do not start dragging; keyboard movement and Home remain available',()=>{
  const t=setup();t.start({target:{closest(){return {tagName:'BUTTON'};}}});assert.equal(t.state.moving,false);
  const handle={};t.state.handleProps.onKeyDown({target:handle,currentTarget:handle,key:'ArrowRight',shiftKey:true,preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.state.style.transform,'translate(32px, 0px)');
  t.state.handleProps.onKeyDown({target:handle,currentTarget:handle,key:'Home',preventDefault(){},stopPropagation(){}});t.render();assert.equal(t.state.style.transform,'translate(0px, 0px)');t.h.unmount();
});
test('maximizing/disabling cancels an in-flight gesture and unmount removes listeners',()=>{
  const t=setup();t.start();t.dispatch('pointermove',{pointerId:1,clientX:300,clientY:200});t.props.disabled=true;t.render();assert.equal(t.state.style,undefined);t.props.disabled=false;t.render();assert.equal(t.state.moving,false);assert.equal(t.state.style.transform,'translate(0px, 0px)');
  t.start();t.h.unmount();t.dispatch('pointermove',{pointerId:1,clientX:600,clientY:600});assert.equal(t.state.style.transform,'translate(0px, 0px)');
});
