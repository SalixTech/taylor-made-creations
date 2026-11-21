import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,content,nodes} from './owner-ui-harness.mjs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('shared refresh exposes SS7 clockwise icon with a circular accessible button',()=>{const h=harness();let clicked=0;const {RefreshButton}=h.load('src/components/RefreshButton.tsx');h.render(RefreshButton,{label:'Refresh exact view',busy:false,onClick(){clicked++;}});assert.equal(h.tree.props['aria-label'],'Refresh exact view');assert.equal(h.tree.props.title,'Refresh exact view');assert.equal(h.tree.props.disabled,false);h.tree.props.onClick();assert.equal(clicked,1);h.render(RefreshButton,{label:'Refresh exact view',busy:true});assert.equal(h.tree.props.disabled,true);assert.equal(h.tree.props['aria-busy'],true);const {RefreshIcon}=h.load('src/components/RefreshIcon.tsx');h.render(RefreshIcon);assert.equal(h.tree.props['aria-hidden'],'true');assert.equal(h.find(n=>n.type==='path').props.d,'M19 8a8 8 0 1 0 1 7M19 3v5h-5');assert.match(source('src/components/RefreshButton.module.css'),/border-radius:50%/);h.unmount();});
test('service disclosure uses one solid triangle and children have no misleading collapse affordance',()=>{const h=harness();const {ServiceDisclosure}=h.load('src/owner/ServiceDisclosure.tsx');h.render(ServiceDisclosure,{title:'Studio connections',children:'Contents'});assert.equal(h.tree.type,'details');assert.match(content(h.tree),/▶/);assert.equal(nodes(h.tree).filter(n=>n.type==='summary').length,1);const text=source('src/owner/StudioConnections.tsx');assert.doesNotMatch(text,/<details|<summary/);assert.doesNotMatch(source('src/owner/TaylorServices.module.css'),/\.statusCard \.serviceHeading::after/);h.unmount();});
test('File Hub keeps keyboard placement accessible without the removed positional menu',async()=>{
 const h=harness(),calls=[];
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const file={id,schemaVersion:1,revision:1,kind:'photo',name:'First',parentId:'root',contentType:'image/png',bytes:10,width:10,height:10,status:'ready',trashedAt:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};
 const folders={schemaVersion:1,revision:0,folders:{}};
 h.overrides['./PhotoUpload']={UploadActivity:{}};
 h.overrides['./use-cloud-files']={useCloudFiles:()=>({files:[file,{...file,id:other,name:'Second'}],folders,loading:false,ready:true,error:'',async refresh(){}})};
 h.overrides['./cloud-files-client']={pendingWebsiteUploads(){return [];},async readCloudFileOrder(){return{schemaVersion:1,revision:0,keys:[]};},async readCloudGallery(){return null;},async ensureCloudSystemFolders(){return folders;},async readCloudCleanupStatus(){return{available:true,automaticCleanupEnabled:false,lastRunAt:null,message:'Ready'};},async saveCloudFileOrder(...args){calls.push(args);}};
 h.overrides['./media-client']={useOwnerMediaSource:()=>({src:'blob:synthetic',error:null})};
 const Hub=h.load('src/owner/CloudFileHub.tsx').CloudFileHub,render=()=>h.render(Hub,{manager:true});
 try{render();await new Promise(r=>setImmediate(r));render();
 const placement=h.find(n=>n.type==='button'&&n.props['aria-label']==='Keyboard placement: First');assert.ok(placement);assert.equal(placement.props.disabled,false);assert.equal(h.find(n=>n.type==='summary'&&n.props.title?.includes('keyboard move')),undefined);
 placement.props.onClick();render();const before=h.find(n=>n.type==='button'&&content(n)==='Place before');const after=h.find(n=>n.type==='button'&&content(n)==='Place after');assert.ok(before);assert.ok(after);assert.equal(calls.length,0);
 after.props.onClick();await new Promise(r=>setImmediate(r));render();assert.equal(calls.length,1);assert.equal(calls[0][0],'root');assert.equal(calls[0].at(-1),true);
 }finally{h.unmount();}
});
