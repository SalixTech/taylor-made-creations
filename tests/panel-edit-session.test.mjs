import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './owner-ui-harness.mjs';

test('popup positions are copied, session-local, finite and late cleanup cannot erase a newer session', () => {
  const h=harness(), api=h.load('src/owner/panel-edit-session.ts');
  assert.equal(api.panelEditSessionToken(),null);
  const first=api.beginPanelEditSession();
  const point={x:63,y:94};api.savePanelPosition(first,'section-editor',point);point.x=900;
  assert.deepEqual(api.readPanelPosition(first,'section-editor'),{x:63,y:94});
  const read=api.readPanelPosition(first,'section-editor');read.y=900;
  assert.equal(api.readPanelPosition(first,'section-editor').y,94);
  api.savePanelPosition(first,'section-editor',{x:Infinity,y:3});
  assert.equal(api.readPanelPosition(first,'section-editor').x,63);
  const second=api.beginPanelEditSession();
  assert.equal(api.readPanelPosition(second,'section-editor'),undefined);
  api.savePanelPosition(first,'section-editor',{x:8,y:8});
  api.endPanelEditSession(first);assert.equal(api.panelEditSessionToken(),second);
  api.savePanelPosition(second,'other-dialog',{x:10,y:20});
  assert.equal(api.readPanelPosition(second,'section-editor'),undefined);
  api.endPanelEditSession(second);assert.equal(api.panelEditSessionToken(),null);
  assert.equal(api.readPanelPosition(second,'other-dialog'),undefined);
});

test('closing and reopening restores viewport position; a new edit session resets to default', async () => {
  const h=harness();h.window.innerWidth=1200;h.window.innerHeight=800;
  const api=h.load('src/owner/panel-edit-session.ts');const {useMovablePanel}=h.load('src/owner/use-movable-panel.ts');
  let session=api.beginPanelEditSession();let state;let disabled=false;const ref={current:null};
  function Panel(){state=useMovablePanel(ref,disabled,{memoryKey:'section-editor',defaultPosition:{x:55,y:90}});return {type:'aside',props:{ref}};}
  const render=()=>{h.render(Panel);ref.current.getBoundingClientRect=()=>{const values=state.style?.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);return {left:200+Number(values?.[1]??0),top:100+Number(values?.[2]??0),width:400,height:400};};};
  render();await new Promise(r=>setTimeout(r,5));render();
  assert.equal(state.style.transform,'translate(-145px, -10px)');
  const header={};state.handleProps.onKeyDown({target:header,currentTarget:header,key:'ArrowRight',shiftKey:true,preventDefault(){},stopPropagation(){}});render();
  assert.deepEqual(api.readPanelPosition(session,'section-editor'),{x:87,y:90});
  disabled=true;render();disabled=false;render();await new Promise(r=>setTimeout(r,5));render();
  assert.equal(state.style.transform,'translate(-113px, -10px)');
  api.endPanelEditSession(session);session=api.beginPanelEditSession();render();await new Promise(r=>setTimeout(r,5));render();
  assert.equal(state.style.transform,'translate(-145px, -10px)');
  h.unmount();api.endPanelEditSession(session);
});

test('dialog header actions remain clickable and edit-session dragging never captures buttons', () => {
  const h=harness();h.window.innerWidth=1200;h.window.innerHeight=800;
  const api=h.load('src/owner/panel-edit-session.ts');const token=api.beginPanelEditSession();
  const {Dialog}=h.load('src/owner/OwnerDialog.tsx');let refreshed=0,closed=0;
  const action={type:'button',props:{'aria-label':'Refresh invoice',onClick:()=>refreshed++}};
  h.render(Dialog,{title:'Invoice',headingActions:action,onClose:()=>closed++,actions:null,children:'Read only'});
  const refresh=h.find(n=>n.props?.['aria-label']==='Refresh invoice');assert.ok(refresh);refresh.props.onClick();assert.equal(refreshed,1);
  const header=h.find(n=>n.props?.['data-move-handle']);assert.ok(header);
  header.props.onPointerDown({button:0,isPrimary:true,pointerId:1,target:{closest:()=>({tagName:'BUTTON'})},currentTarget:{focus(){throw Error('button must not become drag');}}});
  assert.equal(h.find(n=>n.type==='dialog').props['data-moving'],false);
  h.find(n=>n.props?.['aria-label']==='Close dialog').props.onClick();assert.equal(closed,1);
  h.unmount();api.endPanelEditSession(token);
});
