import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('federated File Hub root and client controls opt into shared owner button styling',async()=>{
 const h=harness(), client={clientId:'TMC-0000000000001111',displayName:'Synthetic client',status:'active'};
 h.overrides['./client-hub-client']={listClients:async()=>[client],getClientDetail:async()=>({client,projects:[]}),clientHubErrorMessage:String};
 h.overrides['@/client-hub/workspace-client']={};
 h.overrides['@/client-hub/attachments-client']={};
 h.overrides['@/client-hub/file-copy-client']={};
 h.overrides['@/client-hub/PhotoLightbox']={PhotoLightbox:()=>null};
 const Component=h.load('src/owner/CommissionFileHub.tsx').CommissionFileHub, render=()=>h.render(Component,{onBack(){}});
 try{render();await flush();render();let controls=h.all(n=>n.type==='button');assert.ok(controls.length>=2);for(const control of controls)assert.equal(control.props['data-owner-button'],true);
 const open=h.find(n=>n.type==='button'&&content(n)==='Open client');assert.ok(open);await open.props.onClick();await flush();render();controls=h.all(n=>n.type==='button');for(const control of controls)assert.equal(control.props['data-owner-button'],true);
 }finally{h.unmount();}
});
