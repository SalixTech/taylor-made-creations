import {test} from "node:test";
import assert from "node:assert/strict";
import {sourceLoader} from "./scout-source-loader.mjs";

const load=sourceLoader();
const {createDefaultOwnerContent}=load("src/owner/defaults.ts");
const {resolveCanvasLayout}=load("src/owner/canvas-layout.ts");
const {captureFrameClipboard,pasteFrameClipboard}=load("src/owner/frame-clipboard.ts");
const {captureAssetBox,groupedAssetClip,placeAsset}=load("src/owner/builder-assets.ts");
const {mergeShifts,shoveShiftCurrent}=load("src/owner/placed-shove.ts");
const {isCommissionLabelHeading}=load("src/owner/commission-status-block.ts");
const placement=(widthPx,heightPx,x,y)=>({widthPx,heightPx,matrix:{a:1,b:0,c:0,d:1,e:x,f:y}});
function fixture(){
 const site=createDefaultOwnerContent(),page=site.pages.find(p=>p.builtinKey==="commissions");
 page.canvasLayout={desktop:resolveCanvasLayout(site,page),mobile:resolveCanvasLayout(site,page,true),mobileInitialized:true};
 let n=0;return {site,page,newId:()=>"test-"+(++n)};
}
test("Independent commission label keeps its presentation and dimensions across a paste and a second copy",()=>{
 const {site,page,newId}=fixture(),source="template-text:commissions.statusLabel";
 page.canvasLayout.desktop[source].placement=placement(192,28,70,90);
 page.canvasLayout.mobile[source].placement=placement(110,46,20,25);
 site.contentOverrides??={};site.contentOverrides.styles={"commissions.statusLabel":{textColor:"#781122",mobile:{fontSize:17}}};
 const first=captureFrameClipboard(site,page.id,source);
 const pasted=pasteFrameClipboard(site,page.id,first,{newId,verifiedAssets:new Set()});
 const clip=captureFrameClipboard(pasted.content,page.id,pasted.rootId);
 assert.ok(isCommissionLabelHeading(clip.blocks[0].id));
 assert.equal(clip.desktop[clip.rootId].placement.widthPx,192);
 assert.equal(clip.mobile[clip.rootId].placement.heightPx,46);
 assert.equal(clip.blocks[0].appearance.mobile.fontSize,17);
 const asset=placeAsset(pasted.content,page.id,{id:"sign",name:"Sign",clip},newId,new Set());
 assert.ok(asset.rootId.startsWith("block:sa_sign_"));
 assert.ok(isCommissionLabelHeading(asset.rootId));
});
test("Stale, reversed and removed Shove shifts do not prompt to restore spacing",()=>{
 const {site,page}=fixture(),id="canvas:layout.commissions.statusValue",entry=page.canvasLayout.desktop[id];
 entry.placement=placement(90,30,0,48);
 const shift={id,parentId:entry.parentId,before:20,after:48};
 assert.ok(shoveShiftCurrent(site,page,false,shift));
 assert.deepEqual(mergeShifts([shift],[{...shift,before:48,after:20}]),[]);
 entry.placement.matrix.f=75;assert.equal(shoveShiftCurrent(site,page,false,shift),false);
 entry.placement.matrix.f=48;entry.removed=true;assert.equal(shoveShiftCurrent(site,page,false,shift),false);
});
test("An asset group encloses rotated and reflected boxes without changing their spacing",()=>{
 const {site,page}=fixture();
 page.blocks.push(...["one","two"].map(id=>({id,type:"heading",text:id,level:2})));
 for(const mode of ["desktop","mobile"]){
  const map=resolveCanvasLayout(site,page,mode==="mobile");page.canvasLayout[mode]=map;
  map["block:one"].placement={widthPx:40,heightPx:20,matrix:{a:0,b:1,c:-1,d:0,e:80,f:60}};
  map["block:two"].placement={widthPx:30,heightPx:10,matrix:{a:-1,b:0,c:0,d:1,e:120,f:20}};
 }
 const clip=groupedAssetClip(captureFrameClipboard(site,page.id,"block:one",["block:two"]));
 for(const mode of ["desktop","mobile"]){
  assert.equal(clip[mode][clip.rootId].placement.widthPx,60);
  assert.equal(clip[mode][clip.rootId].placement.heightPx,80);
  assert.equal(clip[mode]["block:one"].placement.matrix.e,20);
 }
});
test("A template paragraph saved as an asset keeps its text, inline formatting and link destination",()=>{
 const {site,page,newId}=fixture(),prices=site.pages.find(p=>p.builtinKey==="prices");
 site.prices.intro="[Quote](/commissions) for custom work.";
 site.contentOverrides??={};site.contentOverrides.inlineStyles={"core:prices.intro":{text:"Quote for custom work.",spans:[{start:0,end:5,style:{bold:true}}]}};
 const clip=captureAssetBox(site,prices,"core-text:prices.intro",newId);
 const result=pasteFrameClipboard(site,page.id,clip,{newId,verifiedAssets:new Set()});
 const id=result.rootId.slice(6);
 assert.equal(result.content.pages.find(p=>p.id===page.id).blocks.find(b=>b.id===id).body,site.prices.intro);
 assert.equal(result.content.contentOverrides.inlineStyles[`block:${page.id}:${id}:body`].spans[0].style.bold,true);
});

test("A saved commission label with production UUIDs inserts twice and remains linked",()=>{
 const {site,page}=fixture();
 const {newOwnerId}=load("src/owner/model.ts");
 const asset={id:newOwnerId(),name:"Commission Status",clip:captureFrameClipboard(site,page.id,"template-text:commissions.statusLabel")};
 const first=placeAsset(site,page.id,asset,newOwnerId,new Set());
 const second=placeAsset(first.content,page.id,asset,newOwnerId,new Set());
 for(const result of [first,second]){
  const id=result.rootId.slice(6);
  assert.ok(isCommissionLabelHeading(id));
  assert.ok(id.length<=96);
  assert.equal(load("src/owner/builder-assets.ts").linkedAssetId(id),asset.id);
 }
 assert.notEqual(first.rootId,second.rootId);
});
test("Dropping a native box on a free-standing box shoves its neighbor in page coordinates",()=>{
 const {site,page}=fixture(),source="canvas:layout.commissions.statusValue";
 page.blocks.push({id:"neighbor",type:"heading",text:"Next",level:2});
 const map=resolveCanvasLayout(site,page);page.canvasLayout.desktop=map;
 map["block:neighbor"]={parentId:null,order:200,placement:placement(80,30,20,85)};
 const {shovePlacedSiblings}=load("src/owner/placed-shove.ts");
 const result=shovePlacedSiblings(site,page,false,source,1,undefined,{parentId:null,placement:placement(100,40,10,60)});
 assert.deepEqual(result.map(({id,after})=>[id,after]),[["block:neighbor",100]]);
 assert.equal(map[source].placement,undefined);
});
