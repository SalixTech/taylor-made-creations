import type {OwnerContent,OwnerPage,PublicOwnerContent,ValidationIssue} from './model';
import {getCanvasNodes} from './canvas-node-inventory';
export {getCanvasNodes} from './canvas-node-inventory';
export type CanvasNodeDescriptor={id:string;styleTarget:string;defaultParentId:string|null;defaultOrder:number;canContain:boolean;movable:boolean;parentLocked?:boolean;label:string};
export type CanvasPlacement={matrix:{a:number;b:number;c:number;d:number;e:number;f:number};widthPx:number;heightPx:number;aspectLocked?:boolean;contentOffset?:{xPx:number;yPx:number}};
export type CanvasNodeEntry={parentId:string|null;order:number;placement?:CanvasPlacement;label?:string;removed?:boolean};
export type CanvasNodeMap=Record<string,CanvasNodeEntry>;
export type CanvasLayout={desktop:CanvasNodeMap;mobile?:CanvasNodeMap;mobileInitialized?:boolean};
export type CanvasScope=OwnerPage|Omit<OwnerPage,'trashedAt'>|'chrome';
export type CanvasContent=OwnerContent|PublicOwnerContent;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function validCanvasPlacement(value:unknown):value is CanvasPlacement{
 if(!plain(value)||!exact(value,['matrix','widthPx','heightPx','aspectLocked','contentOffset'])||!finite(value.widthPx)||value.widthPx<=0||!finite(value.heightPx)||value.heightPx<=0||!plain(value.matrix)||!exact(value.matrix,['a','b','c','d','e','f']))return false;
 if(Object.hasOwn(value,'aspectLocked')&&typeof value.aspectLocked!=='boolean')return false;
 if(Object.hasOwn(value,'contentOffset')&&(!plain(value.contentOffset)||!exact(value.contentOffset,['xPx','yPx'])||!finite(value.contentOffset.xPx)||!finite(value.contentOffset.yPx)))return false;
 const m=value.matrix;if(!['a','b','c','d','e','f'].every(key=>finite(m[key])))return false;
 const {a,b,c,d,e,f}=m as CanvasPlacement['matrix'],det=a*d-b*c;
 if(!Number.isFinite(det)||det===0)return false;
 if(![d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det].every(Number.isFinite))return false;
 if(value.contentOffset){const o=value.contentOffset as {xPx:number;yPx:number};if(![a*o.xPx+c*o.yPx,b*o.xPx+d*o.yPx,o.xPx+value.widthPx,o.yPx+value.heightPx].every(Number.isFinite))return false;}
 return [{x:0,y:0},{x:value.widthPx,y:0},{x:0,y:value.heightPx},{x:value.widthPx,y:value.heightPx}].every(p=>Number.isFinite(a*p.x+c*p.y+e)&&Number.isFinite(b*p.x+d*p.y+f));
}
function storedLayout(content:CanvasContent,scope:CanvasScope):CanvasLayout|undefined{return scope==='chrome'?content.chromeLayout:scope.canvasLayout;}
export function defaultCanvasLayout(content:CanvasContent,scope:CanvasScope,mobile=false):CanvasNodeMap{
 const map=Object.fromEntries(getCanvasNodes(content,scope).map(node=>[node.id,{parentId:node.defaultParentId,order:node.defaultOrder}])) as CanvasNodeMap;
 if(mobile&&scope!=='chrome')for(const block of scope.blocks){const entry=map[`block:${block.id}`];if(entry){if(block.mobileParentId!==undefined)entry.parentId=block.mobileParentId===null?null:`block:${block.mobileParentId}`;if(block.mobileOrder!==undefined)entry.order=block.mobileOrder;}}
 return map;
}
/** Saved assignments are authoritative. Defaults only introduce new/legacy nodes. */
export function resolveCanvasLayout(content:CanvasContent,scope:CanvasScope,mobile=false):CanvasNodeMap{
 const layout=storedLayout(content,scope),defaults=defaultCanvasLayout(content,scope,mobile);
 const saved=mobile?layout?.mobile:layout?.desktop;
 for(const [id,entry] of Object.entries(saved??{}))if(Object.hasOwn(defaults,id))defaults[id]=structuredClone(entry);
 return defaults;
}
export function validateCanvasLayout(value:unknown,nodes:CanvasNodeDescriptor[],path='canvasLayout',mobileNodes:CanvasNodeDescriptor[]=nodes):ValidationIssue[]{
 const issues:ValidationIssue[]=[],issue=(suffix:string,message:string)=>issues.push({path:`${path}${suffix}`,message});
 if(!plain(value)||!exact(value,['desktop','mobile','mobileInitialized'])||!Object.hasOwn(value,'desktop')){issue('','Use the supported desktop/mobile layout structure.');return issues;}
 if(Object.hasOwn(value,'mobileInitialized')&&typeof value.mobileInitialized!=='boolean')issue('.mobileInitialized','Choose whether this independent layout was initialized.');
 for(const mode of ['desktop','mobile'] as const){
  if(mode==='mobile'&&!Object.hasOwn(value,mode))continue;const map=value[mode];const activeNodes=mode==='mobile'?mobileNodes:nodes,byId=new Map(activeNodes.map(node=>[node.id,node]));
  if(!plain(map)){issue(`.${mode}`,'Use a map of saved canvas nodes.');continue;}
  if(Object.keys(map).length>nodes.length){issue(`.${mode}`,'The layout contains unknown canvas nodes.');continue;}
  const parents=new Map(activeNodes.map(node=>[node.id,node.defaultParentId]));
  for(const [id,entry] of Object.entries(map)){
   const node=byId.get(id),at=`.${mode}.${id}`;
   if(!node){issue(at,'This canvas item no longer exists in this scope.');continue;}
   if(!plain(entry)||!exact(entry,['parentId','order','placement','label','removed'])||!Object.hasOwn(entry,'parentId')||!Number.isSafeInteger(entry.order)||Number(entry.order)<0){issue(at,'Use an explicit parent, safe order and optional finite placement.');continue;}
   if(entry.label!==undefined&&(typeof entry.label!=='string'||!entry.label.trim()||entry.label.length>120))issue(`${at}.label`,'Use a name of 1 to 120 characters.');
   if(entry.removed!==undefined&&typeof entry.removed!=='boolean')issue(`${at}.removed`,'Choose whether this piece is removed from the canvas.');
   if(entry.removed!==true&&typeof entry.parentId==='string'&&plain(map[entry.parentId])&&(map[entry.parentId] as Record<string,unknown>).removed===true)issue(`${at}.parentId`,'Move surviving contents out before removing their box.');
   if(entry.parentId!==null&&(typeof entry.parentId!=='string'||!byId.has(entry.parentId)||!byId.get(entry.parentId)?.canContain&&entry.parentId!==node.defaultParentId)){issue(`${at}.parentId`,'Choose an existing box in this same scope, or the canvas.');continue;}
   if(entry.parentId===id){issue(`${at}.parentId`,'A box cannot contain itself.');continue;}
   if(!node.movable&&entry.removed===true&&(typeof entry.parentId!=='string'||!plain(map[entry.parentId])||(map[entry.parentId] as Record<string,unknown>).removed!==true))issue(`${at}.removed`,'This functional piece can only be removed with its containing unit.');
   if(node.parentLocked&&entry.parentId!==node.defaultParentId){issue(`${at}.parentId`,'This functional piece stays with its containing unit.');continue;}
   if(node.parentLocked&&entry.removed===true&&(typeof entry.parentId!=='string'||!plain(map[entry.parentId])||(map[entry.parentId] as Record<string,unknown>).removed!==true))issue(`${at}.removed`,'Remove this functional piece with its containing unit.');
   if(!node.movable&&entry.placement!==undefined)issue(`${at}.placement`,'This functional item must keep its original semantic slot; edit its appearance instead.');
   if(!node.movable&&entry.parentId!==node.defaultParentId){issue(`${at}.parentId`,'This functional item must stay in its semantic container.');continue;}
   if(entry.placement!==undefined&&entry.parentId!==null&&typeof entry.parentId==='string'&&!byId.get(entry.parentId)?.canContain&&!(node.parentLocked&&entry.parentId===node.defaultParentId))issue(`${at}.placement`,'Move this item into a container or the canvas before using detached placement. Its original semantic slot must remain unplaced.');
   if(entry.placement!==undefined&&!validCanvasPlacement(entry.placement))issue(`${at}.placement`,'Placement must contain finite, invertible two-dimensional geometry.');
   parents.set(id,entry.parentId as string|null);
  }
  for(const id of byId.keys()){const parent=parents.get(id),entry=map[id];if(parent&&plain(map[parent])&&(map[parent] as Record<string,unknown>).removed===true&&(!plain(entry)||entry.removed!==true))issue(`.${mode}.${id}.parentId`,'Move surviving contents out before removing their box.');}
  for(const id of byId.keys()){const seen=new Set([id]);let parent=parents.get(id);while(parent!==null&&parent!==undefined){if(seen.has(parent)){issue(`.${mode}.${id}.parentId`,'Canvas nesting cannot contain a cycle.');break;}seen.add(parent);if(!byId.has(parent)){issue(`.${mode}.${id}.parentId`,'The assigned parent is unavailable.');break;}parent=parents.get(parent);}}
 }
 return issues;
}
export function validateContentCanvasLayout(content:CanvasContent,scope:CanvasScope,value:unknown,path='canvasLayout'):ValidationIssue[]{
 const nodes=getCanvasNodes(content,scope),mobile=defaultCanvasLayout(content,scope,true);
 return validateCanvasLayout(value,nodes,path,nodes.map(node=>({...node,defaultParentId:mobile[node.id].parentId,defaultOrder:mobile[node.id].order})));
}
export function canAssignCanvasParent(content:CanvasContent,scope:CanvasScope,id:string,parentId:string|null,mobile=false):boolean{
 const nodes=getCanvasNodes(content,scope),node=nodes.find(node=>node.id===id);if(!node?.movable||id===parentId||parentId!==null&&!nodes.some(node=>node.id===parentId&&node.canContain))return false;
 const map=resolveCanvasLayout(content,scope,mobile);if(map[id]?.removed||parentId&&map[parentId]?.removed)return false;map[id]={...map[id],parentId};return validateCanvasLayout({desktop:map},nodes).length===0;
}
/** Migrate topology only on an explicit layout action, after both effective
 * layouts have been fully captured. Dormant legacy edges cannot delete a moved child. */
function materializeCanvasLayout(content:OwnerContent,scope:OwnerPage|'chrome'):CanvasLayout{
 const previous=storedLayout(content,scope),desktop=resolveCanvasLayout(content,scope,false),mobile=resolveCanvasLayout(content,scope,true);
 const initialized=previous?.mobileInitialized||content.design?.mobileLayoutEnabled||content.design?.mobileDesign!==undefined||scope!=='chrome'&&scope.blocks.some(block=>block.mobileParentId!==undefined||block.mobileOrder!==undefined);
 const layout:CanvasLayout={desktop,mobile,...(initialized?{mobileInitialized:true}:{})};
 if(scope==='chrome')content.chromeLayout=layout;else{scope.canvasLayout=layout;for(const block of scope.blocks){delete block.parentId;delete block.mobileParentId;delete block.mobileOrder;}}
 // Existing independent maps are cloned, never aliased or replaced with desktop.
 return layout;
}
/** One caller-owned draft/history transaction. No save, publication or provider action. */
export function assignCanvasParent(content:OwnerContent,scope:OwnerPage|'chrome',id:string,parentId:string|null,mobile=false,placement?:CanvasPlacement):boolean{
 if(!canAssignCanvasParent(content,scope,id,parentId,mobile)||placement!==undefined&&!validCanvasPlacement(placement))return false;
 const resolved=resolveCanvasLayout(content,scope,mobile),previous=resolved[id];if(previous.parentId===parentId&&!placement)return false;
 const order=Math.max(-1,...Object.values(resolved).filter(entry=>entry.parentId===parentId).map(entry=>entry.order))+1;if(!Number.isSafeInteger(order))return false;
 const layout=materializeCanvasLayout(content,scope);
 const map=mobile?layout.mobile!:layout.desktop;if(mobile)layout.mobileInitialized=true;
 map[id]={...previous,parentId,order,...(placement?{placement:structuredClone(placement)}:previous.placement?{placement:structuredClone(previous.placement)}:{})};if(!mobile&&!layout.mobileInitialized)layout.mobile=structuredClone(layout.desktop);return true;
}
/** Geometry-only update: parent and sibling order never change. Undefined explicitly clears placement. */
export function updateCanvasPlacement(content:OwnerContent,scope:OwnerPage|'chrome',id:string,mobile:boolean,placement:CanvasPlacement|undefined):boolean{
 const nodes=getCanvasNodes(content,scope);if(!nodes.some(node=>node.id===id)||placement!==undefined&&!validCanvasPlacement(placement))return false;
 const resolved=resolveCanvasLayout(content,scope,mobile),previous=resolved[id];
 if(previous.removed)return false;
 if(JSON.stringify(previous.placement)===JSON.stringify(placement))return false;
 const next={...previous};if(placement===undefined)delete next.placement;else next.placement=structuredClone(placement);
 const candidate={...resolved,[id]:next};if(validateCanvasLayout({desktop:candidate},nodes).length)return false;
 const layout=materializeCanvasLayout(content,scope);
 if(mobile)layout.mobileInitialized=true;
 (mobile?layout.mobile!:layout.desktop)[id]=next;if(!mobile&&!layout.mobileInitialized)layout.mobile=structuredClone(layout.desktop);return true;
}
/** Reorder siblings in the active saved graph; keep membership and placement. */
export function stepCanvasNode(content:OwnerContent,scope:OwnerPage|'chrome',id:string,direction:-1|1,mobile=false):boolean{
 if(direction!==-1&&direction!==1)return false;
 const nodes=getCanvasNodes(content,scope),resolved=resolveCanvasLayout(content,scope,mobile),entry=resolved[id];if(!entry||entry.removed||!nodes.find(node=>node.id===id)?.movable)return false;
 const siblings=nodes.filter(node=>node.movable&&!node.parentLocked&&!resolved[node.id].removed&&resolved[node.id].parentId===entry.parentId).sort((a,b)=>resolved[a.id].order-resolved[b.id].order||a.defaultOrder-b.defaultOrder),index=siblings.findIndex(node=>node.id===id),to=index+direction;if(index<0||to<0||to>=siblings.length)return false;
 [siblings[index],siblings[to]]=[siblings[to],siblings[index]];const candidate=structuredClone(resolved);siblings.forEach((node,order)=>{candidate[node.id].order=order;});if(validateCanvasLayout({desktop:candidate},nodes).length)return false;
 const layout=materializeCanvasLayout(content,scope);
 if(mobile){layout.mobile=candidate;layout.mobileInitialized=true;}else{layout.desktop=candidate;if(!layout.mobileInitialized)layout.mobile=structuredClone(layout.desktop);}return true;
}
export function initializeCanvasMobileLayouts(content:OwnerContent){
 for(const scope of [...content.pages,'chrome' as const]){
  const layout=materializeCanvasLayout(content,scope);
  if(!layout.mobileInitialized)layout.mobile=structuredClone(layout.desktop);layout.mobileInitialized=true;
 }
}
/** Reconcile legitimate entity edits before committing a candidate draft. Only
 * identities present in the prior inventory may be removed automatically. A
 * surviving child of a removed parent is an actionable error, never reparented. */
export function reconcileCanvasLayouts(before:OwnerContent,next:OwnerContent):ValidationIssue[]{
 const issues:ValidationIssue[]=[],pending:Array<{scope:OwnerPage|'chrome';layout:CanvasLayout}>=[];
 for(const scope of [...next.pages,'chrome' as const]){
  const layout=storedLayout(next,scope);if(!layout)continue;
  const previousScope=scope==='chrome'?'chrome':before.pages.find(page=>page.id===scope.id);
  const oldIds=new Set(previousScope?getCanvasNodes(before,previousScope).map(node=>node.id):[]),nodes=getCanvasNodes(next,scope),ids=new Set(nodes.map(node=>node.id)),candidate=structuredClone(layout);
  for(const mode of ['desktop','mobile'] as const){const map=candidate[mode];if(!map)continue;
   for(const id of Object.keys(map))if(oldIds.has(id)&&!ids.has(id))delete map[id];
   const defaults=defaultCanvasLayout(next,scope,mode==='mobile');for(const node of nodes)if(!oldIds.has(node.id)&&!Object.hasOwn(map,node.id))map[node.id]=defaults[node.id];
  }
  if(!candidate.mobileInitialized&&candidate.mobile)candidate.mobile=structuredClone(candidate.desktop);
  const path=scope==='chrome'?'chromeLayout':`pages.${scope.id}.canvasLayout`;
  const found=validateContentCanvasLayout(next,scope,candidate,path);if(found.length)issues.push(...found.map(issue=>({...issue,message:`Move the affected item to another box or the canvas before removing its parent. ${issue.message}`})));else pending.push({scope,layout:candidate});
 }
 if(issues.length)return issues;
 for(const item of pending)if(item.scope==='chrome')next.chromeLayout=item.layout;else item.scope.canvasLayout=item.layout;
 return [];
}
/** Exclude unavailable/private identities, but never guess a new parent for a retained child. */
export function projectCanvasLayout(layout:CanvasLayout,nodes:CanvasNodeDescriptor[],mobileNodes:CanvasNodeDescriptor[]=nodes):CanvasLayout{
 const ids=new Set(nodes.map(node=>node.id)),result:CanvasLayout={desktop:{},...(layout.mobileInitialized!==undefined?{mobileInitialized:layout.mobileInitialized}:{})};
 for(const mode of ['desktop','mobile'] as const){const source=layout[mode];if(!source)continue;const map=Object.fromEntries(Object.entries(source).filter(([id])=>ids.has(id)).map(([id,entry])=>[id,structuredClone(entry)]));if(mode==='desktop')result.desktop=map;else result.mobile=map;}
 const issues=validateCanvasLayout(result,nodes,'canvasLayout',mobileNodes);if(issues.length)throw new Error(`Move the affected canvas item into an available box before publishing: ${issues[0].message}`);return result;
}
export function projectCanvasLayouts(content:PublicOwnerContent):void{
 if(content.chromeLayout)content.chromeLayout=projectCanvasLayout(content.chromeLayout,getCanvasNodes(content,'chrome'));
 for(const page of content.pages)if(page.canvasLayout){const nodes=getCanvasNodes(content,page),mobile=defaultCanvasLayout(content,page,true);page.canvasLayout=projectCanvasLayout(page.canvasLayout,nodes,nodes.map(node=>({...node,defaultParentId:mobile[node.id].parentId,defaultOrder:mobile[node.id].order})));}
}
/** Presentation deletion, never a file/data-store delete. Captured child placements
 * are mandatory when keeping contents; all changes commit in one draft edit. */
export function removeCanvasNode(content:OwnerContent,scope:OwnerPage|'chrome',id:string,mobile:boolean,withContents:boolean,placements:Record<string,CanvasPlacement>={}):boolean{
 const nodes=getCanvasNodes(content,scope),node=nodes.find(n=>n.id===id),map=resolveCanvasLayout(content,scope,mobile);
 if(!node?.movable||!map[id]||map[id].removed)return false;
 const removed=new Set([id]);
 if(withContents){let added=true;while(added){added=false;for(const [key,entry]of Object.entries(map))if(entry.parentId&&removed.has(entry.parentId)&&!removed.has(key)){removed.add(key);added=true;}}}
 const children=Object.entries(map).filter(([key,entry])=>!removed.has(key)&&!entry.removed&&entry.parentId===id);
 if(children.some(([key])=>!nodes.find(n=>n.id===key)?.movable||!validCanvasPlacement(placements[key])))return false;
 if(Object.keys(placements).some(key=>!children.some(([id])=>id===key)))return false;
 const next=structuredClone(map),parent=map[id].parentId;
 for(const key of removed){next[key].removed=true;delete next[key].placement;}
 for(const [key]of children)next[key]={...next[key],parentId:parent,placement:structuredClone(placements[key])};
 if(validateCanvasLayout({desktop:next},nodes).length)return false;
 const layout=materializeCanvasLayout(content,scope);if(mobile){layout.mobile=next;layout.mobileInitialized=true;}else{layout.desktop=next;if(!layout.mobileInitialized)layout.mobile=structuredClone(next);}return true;
}
export function renameCanvasNode(content:OwnerContent,scope:OwnerPage|'chrome',id:string,mobile:boolean,label:string):boolean{
 const name=label.trim(),map=resolveCanvasLayout(content,scope,mobile);if(!name||name.length>120||!map[id]||map[id].removed||map[id].label===name)return false;
 const layout=materializeCanvasLayout(content,scope),next=mobile?layout.mobile!:layout.desktop;next[id]={...next[id],label:name};if(mobile)layout.mobileInitialized=true;else if(!layout.mobileInitialized)layout.mobile=structuredClone(next);return true;
}
