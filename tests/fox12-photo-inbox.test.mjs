import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './owner-ui-harness.mjs';
import {cascade,element} from './helpers/css-cascade.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('approved request creation fields carry autofill hints without altering input values or owner action guards',async()=>{
 const h=harness();let creates=0;
 h.overrides['./intake-client']={callOwnerIntake:async()=>{throw Error('No intake mutation authorized');},referenceDisplayName:()=>''};
 h.overrides['./taylor-services-client']={taylorOwnerSession:async()=>({db:{},assertCurrent(){}}),serviceReadError:e=>e.message};
 h.overrides['firebase/firestore/lite']={doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>({answers:[],references:[]})})};
 h.overrides['./client-hub-client']={listClients:async()=>[],createClient:async()=>{creates++;throw Error('No creation authorized');},getClientDetail:async()=>({projects:[]}),resetClientLoginCode:async()=>{throw Error('No reset authorized');}};
 const Component=h.load('src/owner/IntakeInbox.tsx').IntakeHubAction;
 const props={request:{id:'request',name:'Fox',email:'fox@example.test',status:'approved',version:1},onSaved(){}};
 const render=()=>h.render(Component,props);render();h.find(n=>n.type==='button').props.onClick();await flush();render();
 const inputs=h.all(n=>n.type==='input');assert.equal(inputs.length,3);
 for(const input of inputs){assert.equal(input.props.autoComplete,'off');assert.equal(input.props['data-lpignore'],'true');assert.equal(input.props['data-1p-ignore'],'true');}
 const email=inputs.find(n=>n.props.type==='email');assert.equal(email.props.value,'fox@example.test');assert.equal(email.props.maxLength,254);assert.equal(creates,0);
 email.props.onChange({target:{value:'updated@example.test'}});render();assert.equal(h.find(n=>n.type==='input'&&n.props.type==='email').props.value,'updated@example.test');assert.equal(creates,0);h.unmount();
});
test('inbox layout creates neighboring independent desktop panels and stacks narrow viewports',()=>{
 const css=readFileSync('src/owner/CommissionRequests.module.css','utf8');
 for(const width of [390,800,1050,1280,1920]){
  const compute=cascade([css],width),grid=element('div',{class:'inboxColumns'}),panel=element('section',{class:'inboxPanel'},grid);
  assert.equal(compute(grid).display,'grid');assert.equal(compute(grid)['grid-template-columns'],width<=1050?'minmax(0,1fr)':'repeat(2,minmax(0,1fr))');assert.equal(compute(grid)['align-items'],'stretch');assert.equal(compute(panel)['min-width'],'0');
 }
});
