import {resolveCanvasLayout, updateCanvasPlacement, type CanvasPlacement} from "./canvas-layout";
import type {OwnerContent,OwnerPage} from "./model";

import {restoreShoveMargin} from "./canvas-shove";

export type ShoveShift={margin?:boolean;bottom?:boolean;unset?:boolean;id:string;parentId:string|null;before:number;after:number};

function bounds(p:CanvasPlacement){
 const m=p.matrix, xs=[0,m.a*p.widthPx,m.c*p.heightPx,m.a*p.widthPx+m.c*p.heightPx],ys=[0,m.b*p.widthPx,m.d*p.heightPx,m.b*p.widthPx+m.d*p.heightPx];
 return {left:m.e+Math.min(...xs),right:m.e+Math.max(...xs),top:m.f+Math.min(...ys),bottom:m.f+Math.max(...ys)};
}

/** Move overlapping siblings in their common parent's coordinates. Cascading
 * contact follows only displaced boxes, so unrelated columns stay put. */
export function shovePlacedSiblings(content:OwnerContent,page:OwnerPage,mobile:boolean,id:string,direction:1|-1|0,half?:1|-1):ShoveShift[]{
 const map=resolveCanvasLayout(content,page,mobile),root=map[id];
 if(!root?.placement)return [];
 if(direction===0)return [...shovePlacedSiblings(content,page,mobile,id,-1,-1),...shovePlacedSiblings(content,page,mobile,id,1,1)];
 const area=bounds(root.placement),frontier=[area],shifts:ShoveShift[]=[];
 const middle=(area.top+area.bottom)/2;
 const siblings=Object.entries(map).filter(([key,e])=>key!==id&&!e.removed&&e.parentId===root.parentId&&e.placement)
  .map(([key,e])=>({id:key,placement:e.placement!,rect:bounds(e.placement!)}))
  .sort((a,b)=>direction===1?a.rect.top-b.rect.top:b.rect.bottom-a.rect.bottom);
 for(const item of siblings){
  const r=item.rect;
  if(half&&((r.top+r.bottom)/2<middle?-1:1)!==half)continue;
  const contacts=frontier.filter(f=>r.left<f.right&&r.right>f.left&&r.top<f.bottom&&r.bottom>f.top);
  if(!contacts.length)continue;
  const delta=direction===1?Math.max(...contacts.map(f=>f.bottom))-r.top:Math.min(...contacts.map(f=>f.top))-r.bottom;
  const before=item.placement.matrix.f,after=before+delta;
  if(!updateCanvasPlacement(content,page,item.id,mobile,{...item.placement,matrix:{...item.placement.matrix,f:after}}))throw Error("Could not make space between these boxes.");
  shifts.push({id:item.id,parentId:root.parentId,before,after});
  frontier.push({...r,top:r.top+delta,bottom:r.bottom+delta});
 }
 return shifts;
}

export function restoreShifts(content:OwnerContent,page:OwnerPage,mobile:boolean,shifts:ShoveShift[]){
 for(const shift of shifts){
  if(shift.margin){restoreShoveMargin(content,page.id,mobile,shift.id,shift.before,shift.after,shift.bottom,shift.unset);continue;}
  const entry=resolveCanvasLayout(content,page,mobile)[shift.id],p=entry?.placement;
  if(!entry?.removed&&p&&entry.parentId===shift.parentId&&p.matrix.f===shift.after)
   updateCanvasPlacement(content,page,shift.id,mobile,{...p,matrix:{...p.matrix,f:shift.before}});
 }
}

export function mergeShifts(previous:ShoveShift[],added:ShoveShift[]){
 const key=(s:ShoveShift)=>JSON.stringify([s.id,s.margin??false,s.bottom??false]);
 const merged=new Map(previous.map(s=>[key(s),s]));
 for(const shift of added){
  const old=merged.get(key(shift));
  merged.set(key(shift),old?.after===shift.before?{...old,after:shift.after}:shift);
 }
 return [...merged.values()];
}
