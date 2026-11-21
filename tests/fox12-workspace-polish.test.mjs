import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const active=new Set(); afterEach(()=>{for(const h of active)h.unmount();active.clear();});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const project={clientId:'TMC-0123456789ABCDEF',projectId:'11111111-1111-4111-8111-111111111111',title:'Fox',status:'in-progress',version:1};
async function fixture(upload){
 const h=harness();active.add(h);const calls=[],busy=[],dirty=[],failures=[];
 h.overrides['./client']={clientHubErrorMessage:error=>error.message,isClientHubSessionError:error=>error.code==='session-expired'};
 h.overrides['./attachments-client']={async listHubAttachments(){return{attachments:[],nextCursor:null,retention:{available:true,state:'paused',expiresAt:null}};},async uploadHubAttachments(...args){calls.push(args);return upload(...args);},async cancelHubAttachmentBatch(){return{status:'cancelled'};}};
 const Component=h.load('src/client-hub/MakerChatAttachments.tsx').MakerChatAttachments;
 const props={project,owner:true,onFailure:error=>failures.push(error),onDirtyChange:value=>dirty.push(value),onBusyChange:value=>busy.push(value),openRequest:{sequence:1,mode:'upload'}};
 const render=()=>h.render(Component,props),settle=async()=>{await tick();render();await tick();render();};render();await settle();
 const button=label=>h.find(n=>n.type==='button'&&(content(n)===label||n.props['aria-label']===label));
 return{h,calls,busy,dirty,failures,render,settle,button,choose(files){const target={files,value:'C:\\fakepath\\old'};h.find(n=>n.type==='input'&&n.props.type==='file'&&!n.props.hidden).props.onChange({target});render();assert.equal(target.value,'');},send(){h.find(n=>n.type==='form'&&n.props.className==='upload').props.onSubmit({preventDefault(){}});render();}};
}
test('staged rename preserves bytes/type/extension and sends the chosen name only after save',async()=>{
 const f=await fixture(async()=>({attachments:[]})),file=new File(['private pixels'],'original.png',{type:'image/png',lastModified:123});f.choose([file]);
 f.button('Rename original.png').props.onClick();f.render();assert.equal(f.button('Send files').props.disabled,true);
 const name=()=>f.h.find(n=>n.type==='input'&&n.props['aria-label']==='Name for original.png');name().props.onChange({target:{value:'new name'}});f.render();f.button('Save name for original.png').props.onClick();f.render();assert.equal(f.button('Send files').props.disabled,false);f.send();await f.settle();const renamed=f.calls[0][2][0];assert.equal(renamed.name,'new name.png');assert.equal(renamed.type,file.type);assert.equal(renamed.lastModified,123);assert.equal(await renamed.text(),'private pixels');
});
test('staged rename rejects oversized names without starting a batch or losing staged content',async()=>{
 const f=await fixture(async()=>({attachments:[]}));f.choose([new File(['x'],'file.pdf')]);f.button('Rename file.pdf').props.onClick();f.render();f.h.find(n=>n.type==='input'&&n.props['aria-label']==='Name for file.pdf').props.onChange({target:{value:'x'.repeat(42)}});f.render();f.button('Save name for file.pdf').props.onClick();f.render();assert.match(content(f.h.tree),/42 characters/);assert.equal(f.calls.length,0);assert.equal(f.button('Send files').props.disabled,true);assert.ok(f.button('Remove file.pdf'));
});
test('staged raster gallery excludes SVG/HTML and retains proper preview identity',async()=>{
 const f=await fixture(async()=>({attachments:[]}));const image=new File(['a'],'fox.png',{type:'image/png'});f.choose([image,new File(['<svg/>'],'unsafe.svg',{type:'image/svg+xml'}),new File(['html'],'page.html',{type:'text/html'})]);
 const previews=f.h.all(n=>n.type?.name==='StagedThumbnail');assert.equal(previews.length,3);previews[0].props.onOpen();f.render();const gallery=f.h.find(n=>n.type?.name==='StagedGallery');assert.deepEqual(gallery.props.files,[image]);gallery.props.onClose();f.render();assert.equal(f.h.find(n=>n.type?.name==='StagedGallery'),undefined);
 const hidden=f.h.all(n=>n.type==='input'&&n.props.hidden);assert.equal(hidden.length,3);for(const input of hidden)assert.equal(input.props.style.display,'none');
});
test('authenticated preview download rechecks copy ownership, fences duplicate clicks and aborts on navigation',async()=>{
 const h=harness();active.add(h);const reads=[],checks=[],clicked=[];let resolve;
 h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};
 h.document.createElement=()=>({click(){clicked.push(this.download);}});
 h.overrides['./workspace-client']={loadHubPhotoBlob:async(photo,owner,signal)=>{reads.push({photo,owner,signal});return reads.length===1?new Blob(['image']):new Promise(yes=>{resolve=yes;});}};
 h.overrides['./file-copy-client']={verifyHubFileCopies:async(...args)=>{checks.push(args);}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'fox.png',storagePath:'private/path',caption:''};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:true,onChange(){},onClose(){},onFailure(){},trigger:{current:null}};const render=()=>h.render(C,props);render();await tick();render();const download=h.find(n=>n.props['aria-label']==='Download fox.png').props.onClick;download();download();render();assert.equal(reads.length,2);props.activeId=null;render();assert.equal(reads[1].signal.aborted,true);resolve(new Blob(['file']));await tick();render();assert.equal(clicked.length,0);
});
test('authenticated preview download requires viewer-copy confirmation and uses no public URL',async()=>{
 const h=harness();active.add(h);const clicks=[],checks=[],failures=[];let deny=true;
 h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){clicks.push({href:this.href,name:this.download});}});
 h.overrides['./workspace-client']={loadHubPhotoBlob:async()=>new Blob(['image'])};h.overrides['./file-copy-client']={verifyHubFileCopies:async(...args)=>{checks.push(args);if(deny)throw Error('Copy no longer available');}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'fox.png',storagePath:'private/path',caption:''};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:false,onChange(){},onClose(){},onFailure:error=>failures.push(error),trigger:{current:null}};const render=()=>h.render(C,props),download=()=>h.find(n=>n.props['aria-label']==='Download fox.png').props.onClick();render();await tick();render();download();await tick();render();assert.equal(clicks.length,0);assert.equal(failures.length,1);assert.match(content(h.tree),/Download could not be confirmed/);deny=false;download();await tick();render();assert.deepEqual(clicks,[{href:'blob:private',name:'fox.png'}]);assert.equal(checks[1][0],project);assert.equal(checks[1][1],false);assert.deepEqual(checks[1][2],[{kind:'photo',fileId:photo.photoId}]);
});
test('live same-ID photo rename updates preview download metadata instead of retaining an old filename',async()=>{
 const h=harness();active.add(h);const downloads=[];h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){downloads.push(this.download);}});h.overrides['./workspace-client']={loadHubPhotoBlob:async()=>new Blob(['image'])};h.overrides['./file-copy-client']={verifyHubFileCopies:async()=>{}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'old.png',caption:'',storagePath:'private/path'};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:true,onChange(){},onClose(){},onFailure(){},trigger:{current:null}},render=()=>h.render(C,props);render();await tick();render();props.photos=[{...photo,fileName:'new.png'}];render();await tick();render();assert.equal(h.find(n=>n.props['aria-label']==='Download old.png'),undefined);h.find(n=>n.props['aria-label']==='Download new.png').props.onClick();await tick();render();assert.deepEqual(downloads,['new.png']);
});
test('live rename while authenticated download is awaiting bytes aborts the old-name transfer',async()=>{
 const h=harness();active.add(h);const downloads=[],reads=[];let resolve;h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){downloads.push(this.download);}});h.overrides['./workspace-client']={loadHubPhotoBlob:async(p,o,signal)=>{reads.push(signal);return reads.length===2?new Promise(yes=>{resolve=yes;}):new Blob(['image']);}};h.overrides['./file-copy-client']={verifyHubFileCopies:async()=>{}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'old.png',caption:'',contentType:'image/png',size:5,storagePath:'private/path'};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:true,onChange(){},onClose(){},onFailure(){},trigger:{current:null}},render=()=>h.render(C,props);render();await tick();render();h.find(n=>n.props['aria-label']==='Download old.png').props.onClick();props.photos=[{...photo,fileName:'new.png'}];render();assert.equal(reads[1].aborted,true);resolve(new Blob(['image']));await tick();render();assert.deepEqual(downloads,[]);h.find(n=>n.props['aria-label']==='Download new.png').props.onClick();await tick();render();assert.deepEqual(downloads,['new.png']);
});

test('same-version project scope replacement aborts download even while old photos remain',async()=>{
 const h=harness();active.add(h);const downloads=[],reads=[];let resolve;h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};h.document.createElement=()=>({click(){downloads.push(this.download);}});h.overrides['./workspace-client']={loadHubPhotoBlob:async(p,o,signal)=>{reads.push(signal);return reads.length===2?new Promise(yes=>{resolve=yes;}):new Blob(['image']);}};h.overrides['./file-copy-client']={verifyHubFileCopies:async()=>{}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'old.png',caption:'',contentType:'image/png',size:5,storagePath:'private/path'};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:true,onChange(){},onClose(){},onFailure(){},trigger:{current:null}},render=()=>h.render(C,props);render();await tick();render();h.find(n=>n.props['aria-label']==='Download old.png').props.onClick();props.project={...project,projectId:'33333333-3333-4333-8333-333333333333'};render();assert.equal(reads[1].aborted,true);resolve(new Blob(['image']));await tick();render();assert.deepEqual(downloads,[]);assert.equal(h.find(n=>n.props['aria-label']==='Download old.png'),undefined);
});
test('oversized original filename is rejected before immutable attempt creation so Rename remains usable',async()=>{
 const f=await fixture(async()=>({attachments:[]}));const name='x'.repeat(43)+'.png';f.choose([new File(['x'],name,{type:'image/png'})]);f.send();await f.settle();assert.equal(f.calls.length,0);assert.ok(f.h.find(n=>n.type==='dialog'));assert.equal(f.button(`Rename ${name}`).props.disabled,false);assert.equal(f.button('Cancel upload'),undefined);assert.match(content(f.h.tree),/Rename files/);
});
test('preview retry after live rename uses current verified metadata, while unchanged snapshots reuse bytes',async()=>{
 const h=harness();active.add(h);const reads=[];let failed=false;h.globals.URL={createObjectURL:()=> 'blob:private',revokeObjectURL(){}};
 h.overrides['./workspace-client']={loadHubPhotoBlob:async(photo)=>{reads.push(photo.fileName);if(photo.fileName==='new.png'&&!failed){failed=true;throw Error('temporary');}return new Blob(['image']);}};
 const photo={...project,photoId:'22222222-2222-4222-8222-222222222222',fileName:'old.png',caption:'',contentType:'image/png',size:5,storagePath:'private/path'};const C=h.load('src/client-hub/PhotoLightbox.tsx').PhotoLightbox,props={project,photos:[photo],activeId:photo.photoId,owner:true,onChange(){},onClose(){},onFailure(){},trigger:{current:null}},render=()=>h.render(C,props);render();await tick();render();props.photos=[{...photo}];render();await tick();assert.deepEqual(reads,['old.png']);props.photos=[{...photo,fileName:'new.png'}];render();await tick();render();h.find(n=>n.type==='button'&&content(n)==='Retry photo').props.onClick();render();await tick();render();assert.deepEqual(reads,['old.png','new.png','new.png']);assert.ok(h.find(n=>n.type==='img'));
});
