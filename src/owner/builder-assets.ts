import {assertOwnerContent,type OwnerContent,type OwnerPage} from "./model";
import {rebaseInlineTextSpans} from "./rich-text";
import {inlinePlainText} from "./inline-text-editing";
import {captureFrameClipboard,pasteFrameClipboard,updatedAssetSources,type FrameClipboard} from "./frame-clipboard";
import {resolveCanvasLayout,type CanvasPlacement} from "./canvas-layout";

export type BuilderAsset={id:string;name:string;clip:Omit<FrameClipboard,"sourceBinding">};
export function changeAssetField(asset:BuilderAsset,index:number,key:string,value:string){
 const next=structuredClone(asset),b=next.clip.blocks[index];
 if(!b||!Object.hasOwn(b,key)||!["label","heading","text","body","caption","note","actionLabel","alt","href"].includes(key))return asset;
 Object.assign(b,{[key]:value});
 const record=next.clip.inlineStyles[`block:${next.clip.pageId}:${b.id}:${key}`];
 if(record){
  const plain=["label","actionLabel"].includes(key)?value:inlinePlainText(value);
  record.spans=rebaseInlineTextSpans(record.text,plain,record.spans);
  if(record.mobile)record.mobile=rebaseInlineTextSpans(record.text,plain,record.mobile);
  record.text=plain;
 }
 next.clip.assets=updatedAssetSources(next.clip);
 return next;
}

const placement=(widthPx:number,heightPx:number):CanvasPlacement=>({matrix:{a:1,b:0,c:0,d:1,e:0,f:0},widthPx,heightPx});

/** A reusable multi-selection has a real section root in both layout graphs. */
export function groupedAssetClip(source:BuilderAsset["clip"]){
 const clip=structuredClone(source),rootIds=(mode:"desktop"|"mobile")=>Object.entries(clip[mode]).filter(([id,e])=>id.startsWith("block:")&&(!e.parentId||!Object.hasOwn(clip[mode],e.parentId)));
 if((["desktop","mobile"] as const).every(mode=>rootIds(mode).length===1&&rootIds(mode)[0][0]===clip.rootId))return clip;
 let id="asset-group";while(clip.blocks.some(b=>b.id===id))id+="-g";
 const root="block:"+id;
 for(const mode of ["desktop","mobile"] as const){
  const entries=rootIds(mode),positions=entries.flatMap(([,e])=>e.placement?[e.placement]:[]);
  const left=positions.length?Math.min(...positions.map(p=>p.matrix.e)):0,top=positions.length?Math.min(...positions.map(p=>p.matrix.f)):0;
  const width=Math.max(1,...positions.map(p=>p.matrix.e-left+Math.abs(p.matrix.a*p.widthPx)+Math.abs(p.matrix.c*p.heightPx)));
  const height=Math.max(1,...positions.map(p=>p.matrix.f-top+Math.abs(p.matrix.b*p.widthPx)+Math.abs(p.matrix.d*p.heightPx)));
  clip[mode][root]={parentId:null,order:0,...(positions.length?{placement:placement(width,height)}:{})};
  entries.forEach(([,e],order)=>{e.parentId=root;e.order=order;if(e.placement){e.placement.matrix.e-=left;e.placement.matrix.f-=top;}});
 }
 clip.blocks.unshift({id,type:"section",heading:""});clip.rootId=root;return clip;
}

export function linkedAssetId(blockId:string){return /^sa_([^_]+)_.+$/.exec(blockId)?.[1];}

export function placeAsset(content:OwnerContent,pageId:string,asset:BuilderAsset,newId:()=>string,verifiedAssets:ReadonlySet<string>,existingRoot?:string,reuseDesigns?:ReadonlySet<string>){
 const clip={...groupedAssetClip(asset.clip),sourceBinding:JSON.stringify(content)};
 const rootIndex=clip.blocks.findIndex(b=>"block:"+b.id===clip.rootId);
 let index=0;
 return pasteFrameClipboard(content,pageId,clip,{newId:()=>index++===rootIndex?(existingRoot??`sa_${asset.id}_${newId().replace(/^item-/,"")}`):newId(),verifiedAssets,preserveRelativePlacement:true,reuseDesigns});
}

export function assetRoot(content:OwnerContent,page:OwnerPage,mobile:boolean,id:string){
 const map=resolveCanvasLayout(content,page,mobile);
 for(let key:string|null=id;key;key=map[key]?.parentId??null){
  const block=page.blocks.find(b=>"block:"+b.id===key);
  if(block&&linkedAssetId(block.id))return block;
 }
}

/** Replace each linked subtree atomically, keeping its outer identity, slot,
 * location and independent mobile placement. Content outside it stays intact. */
export function replaceAssetCopies(source:OwnerContent,asset:BuilderAsset,newId:()=>string,verified:ReadonlySet<string>,variant?:{pageId:string;id:string}){
 let content=structuredClone(source);
 const copies=variant?[variant]:source.pages.flatMap(page=>page.blocks.filter(b=>linkedAssetId(b.id)===asset.id&&!page.trashedAt).map(b=>({pageId:page.id,id:b.id})));
 for(const {pageId,id} of copies){
  const page=content.pages.find(p=>p.id===pageId)!,root="block:"+id;
  const desktop=resolveCanvasLayout(content,page),mobile=resolveCanvasLayout(content,page,true);
  if(desktop[root]?.removed&&mobile[root]?.removed)continue;
  const old=captureFrameClipboard(content,pageId,root);
  const ids=new Set(old.blocks.map(b=>b.id));
  if(old.blocks.some(b=>b.id!==id&&linkedAssetId(b.id)))throw Error("Move the nested linked asset outside this group before updating copies.");
  page.blocks=page.blocks.filter(b=>!ids.has(b.id));
  const overrides=content.contentOverrides;
  for(const [dict,keys] of [[overrides?.styles,old.styles],[overrides?.inlineStyles,old.inlineStyles],[overrides?.elementLinks,old.elementLinks??{}]] as const)
   if(dict)for(const key of Object.keys(keys))delete dict[key];
  const result=placeAsset(content,pageId,asset,newId,verified,variant?undefined:id,new Set(old.buttonDesigns.map(d=>d.id)));
  content=result.content;
  const target=content.pages.find(p=>p.id===pageId)!;
  for(const mode of ["desktop","mobile"] as const){
   const map=target.canvasLayout![mode]!,previous=(mode==="desktop"?desktop:mobile)[root];
   const newRoot=result.rootId;
   map[newRoot]={...map[newRoot],parentId:previous.parentId,order:previous.order,removed:!!previous.removed,...(previous.placement?{placement:structuredClone(previous.placement)}:{})};
   if(!previous.placement)delete map[newRoot].placement;
   if(previous.removed){const pending=[newRoot];while(pending.length){const parent=pending.pop();for(const [key,e] of Object.entries(map))if(e.parentId===parent){e.removed=true;pending.push(key);}}}
  }
  assertOwnerContent(content);
 }
 return content;
}
