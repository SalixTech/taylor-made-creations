import {test} from "node:test";
import assert from "node:assert/strict";
import {sourceLoader} from "./scout-source-loader.mjs";
const load=sourceLoader();
const {createDefaultOwnerContent}=load("src/owner/defaults.ts");
const {assertOwnerContent}=load("src/owner/model.ts");
const {resolveCanvasLayout}=load("src/owner/canvas-layout.ts");
const {captureFrameClipboard,pasteFrameClipboard}=load("src/owner/frame-clipboard.ts");
const {placeAsset,replaceAssetCopies}=load("src/owner/builder-assets.ts");
const {shovePlacedSiblings,restoreShifts}=load("src/owner/placed-shove.ts");
function fixture(){
 const site=createDefaultOwnerContent(),page=site.pages.find(p=>p.builtinKey==="home");
 page.blocks=["one","two","three","aside"].map(id=>({id,type:"heading",text:id,level:2}));
 page.canvasLayout={desktop:resolveCanvasLayout(site,page),mobile:resolveCanvasLayout(site,page,true),mobileInitialized:true};
 for(const mode of ["desktop","mobile"])page.blocks.forEach(({id},i)=>{
  page.canvasLayout[mode]["block:"+id].placement={widthPx:80,heightPx:30,matrix:{a:1,b:0,c:0,d:1,e:i===3?120:0,f:[10,30,62,18][i]}};
 });
 let i=0;return {site,page,newId:()=>"fresh-"+(++i)};
}
test("Shove cascades only within the touched column, preserves mobile, and restores untouched placements",()=>{
 const {site,page}=fixture();
 const shifts=shovePlacedSiblings(site,page,false,"block:one",1);
 assert.deepEqual(shifts.map(s=>[s.id,s.after]),[["block:two",40],["block:three",70]]);
 assert.equal(page.canvasLayout.mobile["block:two"].placement.matrix.f,30);
 page.canvasLayout.desktop["block:three"].placement.matrix.f=100;
 restoreShifts(site,page,false,shifts);
 assert.equal(page.canvasLayout.desktop["block:two"].placement.matrix.f,30);
 assert.equal(page.canvasLayout.desktop["block:three"].placement.matrix.f,100);
 page.canvasLayout.desktop["block:one"].placement.matrix.f=45;
 assert.equal(shovePlacedSiblings(site,page,false,"block:one",-1)[0].after,15);
 assertOwnerContent(site);
});
test("A multi-box asset moves as one, and updates across pages retain each instance's position",()=>{
 const {site,page,newId}=fixture(),target=site.pages.find(p=>p.builtinKey==="gallery");
 const asset={name:"pair",id:"saved-pair",clip:captureFrameClipboard(site,page.id,"block:one",["block:two"])};
 const first=placeAsset(site,page.id,asset,newId,new Set()),second=placeAsset(first.content,target.id,asset,newId,new Set());
 const gallery=second.content.pages.find(p=>p.id===target.id),root=second.rootId;
 assert.equal(Object.values(gallery.canvasLayout.desktop).filter(e=>e.parentId===root).length,2);
 gallery.canvasLayout.desktop[root].placement.matrix.e=250;
 const revision=structuredClone(asset);revision.clip.blocks[0].text="Edited heading";
 const changed=replaceAssetCopies(second.content,revision,newId,new Set());
 for(const id of [page.id,target.id])assert.equal(changed.pages.find(p=>p.id===id).blocks.filter(b=>b.text==="Edited heading").length,1);
 assert.equal(changed.pages.find(p=>p.id===target.id).canvasLayout.desktop[root].placement.matrix.e,250);
 assert.equal(second.content.pages.find(p=>p.id===target.id).blocks.some(b=>b.text==="Edited heading"),false);
 assertOwnerContent(changed);
});
test("Heading and live availability copy independently",()=>{
 const {site,newId}=fixture(),page=site.pages.find(p=>p.builtinKey==="commissions");
 for(const [id,type] of [["template-text:commissions.statusLabel","heading"],["canvas:layout.commissions.statusValue","commission-status"]]){
  const clip=captureFrameClipboard(site,page.id,id),result=pasteFrameClipboard(site,page.id,clip,{newId,verifiedAssets:new Set()});
  assert.equal(clip.blocks[0].type,type);assert.equal(clip.blocks[0].textOnly,type==="commission-status"?true:undefined);
  assertOwnerContent(result.content);
 }
});

test("Pasting onto an empty custom page removes the empty-page placeholders in both layouts",()=>{
 const {site,page,newId}=fixture(),dest={...page,id:"empty-preview",kind:"custom",slug:"empty-preview",order:99,title:"Empty",blocks:[]};
 delete dest.builtinKey;delete dest.canvasLayout;site.pages.push(dest);
 const asset={id:"saved-heading",name:"Heading",clip:captureFrameClipboard(site,page.id,"block:one")};
 const result=placeAsset(site,dest.id,asset,newId,new Set());
 assertOwnerContent(result.content);
 for(const mode of ["desktop","mobile"])assert.equal(result.content.pages.at(-1).canvasLayout[mode]["template-text:site.emptyTitle"],undefined);
});

test("Saving a placed variant updates only that instance and keeps it independent on the next overwrite",()=>{
 const {site,page,newId}=fixture();
 const asset={id:"saved-one",name:"Original",clip:captureFrameClipboard(site,page.id,"block:one")};
 const first=placeAsset(site,page.id,asset,newId,new Set()),second=placeAsset(first.content,page.id,asset,newId,new Set());
 const variant=structuredClone(asset);variant.id="saved-variant";variant.clip.blocks[0].text="Variant";
 const revised=replaceAssetCopies(second.content,variant,newId,new Set(),{pageId:page.id,id:first.rootId.slice(6)});
 asset.clip.blocks[0].text="Updated original";
 const final=replaceAssetCopies(revised,asset,newId,new Set()),blocks=final.pages.find(p=>p.id===page.id).blocks;
 assert.equal(blocks.find(b=>"block:"+b.id===second.rootId).text,"Updated original");
 assert.equal(blocks.filter(b=>b.text==="Variant").length,1);
 assertOwnerContent(final);
});

test("Editing saved asset wording rebases rich text and records new cloud document references",()=>{
 const {site,page}=fixture(),asset={id:"saved",name:"Saved",clip:captureFrameClipboard(site,page.id,"block:one")};
 const field=`block:${page.id}:one:text`;
 asset.clip.inlineStyles[field]={text:"one",spans:[{start:0,end:3,style:{bold:true}}]};
 const {changeAssetField}=load("src/owner/builder-assets.ts"),changed=changeAssetField(asset,0,"text","one more");
 assert.equal(changed.clip.inlineStyles[field].text,"one more");
 assert.equal(asset.clip.inlineStyles[field].text,"one");
 const href="/api/cloud-documents/11111111-1111-4111-8111-111111111111";
 assert.ok(changeAssetField(changed,0,"text","[Download]("+href+")").clip.assets.includes(href));
});

test("A renamed page and linked asset survive the existing public snapshot validator",()=>{
 const {site,page,newId}=fixture(),{renameCanvasNode}=load("src/owner/canvas-layout.ts");
 const {createPublicContentSnapshot,assertPublicOwnerContent}=load("src/owner/model.ts");
 const originalTitle=page.title;
 assert.equal(renameCanvasNode(site,page,"canvas:layout.home.intro",false,"Shop front"),true);
 const asset={id:"saved-sign",name:"Sign",clip:captureFrameClipboard(site,page.id,"block:one")};
 const result=placeAsset(site,page.id,asset,newId,new Set());
 const published=createPublicContentSnapshot(result.content);assertPublicOwnerContent(published);
 const saved=published.pages.find(p=>p.id===page.id);
 assert.equal(saved.title,originalTitle);
 assert.equal(saved.canvasLayout.desktop["canvas:layout.home.intro"].label,"Shop front");
 assert.ok(saved.blocks.some(b=>"block:"+b.id===result.rootId));
});

test("Repeated asset updates reuse a placed button's unchanged design",()=>{
 const {site,page,newId}=fixture();
 site.buttonDesigns=[{id:"brand",name:"Brand",preset:"pill"}];
 page.blocks.push({id:"action",type:"link",label:"Book",href:"/contact",buttonDesignId:"brand"});
 const asset={id:"saved-action",name:"Call to action",clip:captureFrameClipboard(site,page.id,"block:action")};
 let result=placeAsset(site,page.id,asset,newId,new Set()).content;
 const expected=result.buttonDesigns.length;
 for(const label of ["Contact us","Get in touch"]){
  asset.clip.blocks[0].label=label;result=replaceAssetCopies(result,asset,newId,new Set());
  assert.equal(result.buttonDesigns.length,expected);
 }
 assertOwnerContent(result);
});
