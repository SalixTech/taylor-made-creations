import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './owner-ui-harness.mjs';
const project={clientId:'TMC-0000000000001111',projectId:'11111111-1111-4111-8111-111111111111',version:1};
const file={...project,attachmentId:'22222222-2222-4222-8222-222222222222',fileName:'fox.png',size:10,sha256:'a'.repeat(64),available:true};
test('offscreen tile does not read; visible starts background lane; hiding/opening aborts its transfer',()=>{
 const h=harness(),reads=[];let observe,disconnected=0;
 h.globals.IntersectionObserver=class{constructor(callback){observe=callback;}observe(){}disconnect(){disconnected++;}};
 h.overrides['./attachments-client']={watchHubFileSession:async()=>()=>{},isRasterAttachment:()=>true,loadHubAttachmentPreview:(...args)=>{reads.push(args);return new Promise(()=>{});}};
 const C=h.load('src/client-hub/SavedAttachmentPreview.tsx').SavedAttachmentPreview,render=()=>h.render(C,{project,owner:false,file});
 render();assert.equal(reads.length,0);observe([{isIntersecting:true}]);render();assert.equal(reads.length,1);assert.equal(reads[0][4],'background');
 observe([{isIntersecting:false}]);render();assert.equal(reads[0][3].aborted,true);
 observe([{isIntersecting:true}]);render();assert.equal(reads.length,2);h.find(n=>n.type==='button').props.onClick();render();assert.equal(reads[1][3].aborted,true);
 assert.ok(h.find(n=>n.type?.name==='SavedAttachmentGallery'));h.unmount();assert.equal(disconnected,1);
});
test('without IntersectionObserver tile stays explicit-only, never eager-loading hidden bytes',()=>{
 const h=harness();let reads=0;h.overrides['./attachments-client']={isRasterAttachment:()=>true,loadHubAttachmentPreview:()=>{reads++;throw Error('not visible');}};
 const C=h.load('src/client-hub/SavedAttachmentPreview.tsx').SavedAttachmentPreview;h.render(C,{project,owner:false,file});assert.equal(reads,0);
 h.find(n=>n.type==='button').props.onClick();h.render(C,{project,owner:false,file});assert.ok(h.find(n=>n.type?.name==='SavedAttachmentGallery'));h.unmount();
});
