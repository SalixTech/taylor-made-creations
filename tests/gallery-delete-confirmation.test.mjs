import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,content,nodes} from './owner-ui-harness.mjs';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),defaults=load('src/owner/defaults.ts'),graph=load('src/owner/canvas-layout.ts');
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(t){const h=harness();h.window.location.href='/taylor/photos';h.window.location.origin='https://tmc.test';h.globals.setTimeout=h.window.setTimeout=()=>1;h.globals.clearTimeout=h.window.clearTimeout=()=>{};h.window.setInterval=()=>1;h.window.clearInterval=()=>{};h.overrides['./use-draft-recovery']={useDraftRecovery:()=>({flush:()=>true,stop(){},cloud:{enabled:false,stop(){},checkpointSaved:async()=>{},acknowledgePublication(){}},candidates:[],unavailable:[]})};for(const name of ['HelpButton','TaylorServices','CommissionRequests'])h.overrides[`./${name}`]={[name]:()=>null};const saved=defaults.createInitialOwnerWorkspace(),page=saved.draft.pages.find(p=>p.builtinKey==='home');page.blocks=[{id:'sectionA',type:'section',heading:'Parent'},{id:'textA',type:'text',heading:'Child',body:'Keep me'}];graph.assignCanvasParent(saved.draft,page,'block:textA','block:sectionA');let writes=0;const props={mode:'cloud',userEmail:'owner@example.test',initialSection:'photos',recoveryIdentity:{projectId:'taylor-made-creations',ownerUid:'owner',assertCurrent(){}},onSignOut:async()=>{},store:{load:async()=>structuredClone(saved),subscribe:()=>()=>{},saveDraft:async()=>{writes++;throw Error('No external save allowed');},publishLive:async()=>{writes++;throw Error('No publication allowed');}}};const Portal=h.load('src/owner/OwnerPortal.tsx').default,render=()=>h.render(Portal,props),builder=()=>h.find(n=>n.type?.name==='PhotoGalleryManager');render();await tick();render();await tick();render();t.after(()=>h.unmount());return {h,render,builder,get writes(){return writes;}};}

test('gallery remove requires confirmation, removes only selected draft photo and retains media/live workspace',async t=>{
 const f=await fixture(t),before=structuredClone(f.builder().props.content),photo=before.gallery[0];
 const mh=harness(),Manager=mh.load('src/owner/OwnerTemplateManagers.tsx').PhotoGalleryManager;
 mh.render(Manager,f.builder().props);
 const list=mh.find(n=>n.type?.name==='OwnerPriceReorderList');
 const remove=nodes(list.props.children(photo,null)).find(n=>n.props['aria-label']===`Remove photo: ${photo.name}`);
 remove.props.onClick();f.render();assert.deepEqual(f.builder().props.content,before);
 let dialog=f.h.find(n=>n.type?.name==='Dialog'&&n.props.title.startsWith('Remove “'));
 assert.ok(dialog);assert.match(content(dialog),/original file is not deleted/);
 nodes(dialog.props.actions).find(n=>content(n)==='Cancel').props.onClick();f.render();assert.deepEqual(f.builder().props.content,before);
 remove.props.onClick();f.render();dialog=f.h.find(n=>n.type?.name==='Dialog'&&n.props.title.startsWith('Remove “'));
 nodes(dialog.props.actions).find(n=>content(n)==='Remove').props.onClick();f.render();
 assert.deepEqual(f.builder().props.content.gallery,before.gallery.filter(p=>p.id!==photo.id));
 assert.equal(f.writes,0);mh.unmount();
});
test('gallery reorder pointer gate does not capture or shield a trash button or its SVG child',()=>{
 const h=harness(),List=h.load('src/owner/OwnerPriceReorderList.tsx').OwnerPriceReorderList;let reordered=0,captured=0,blocked=0;
 h.render(List,{items:[{id:'one'},{id:'two'}],label:'Gallery photos',layout:'grid',itemLabel:p=>p.id,onReorder:()=>reordered++,onStep(){},children:()=>null});
 const region=h.find(n=>n.props.onClickCapture),list=h.find(n=>n.props['data-price-sort-list']),card=h.find(n=>n.props['data-price-sort-card']==='one');
 const cardElement={parentElement:list.props.ref.current,setPointerCapture(){captured++;}};
 const target={closest:selector=>selector==='[data-price-sort-card]'?cardElement:{tagName:'BUTTON'}};
 region.props.onPointerDownCapture();card.props.onPointerDown({button:0,isPrimary:true,pointerId:1,pointerType:'mouse',clientX:2,clientY:3,currentTarget:cardElement,target,stopPropagation(){blocked++;}});
 region.props.onClickCapture({detail:1,preventDefault(){blocked++;},stopPropagation(){blocked++;}});
 assert.equal(blocked,0);assert.equal(captured,0);assert.equal(reordered,0);h.unmount();
});
