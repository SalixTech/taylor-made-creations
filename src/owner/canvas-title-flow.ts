import type {OwnerContent} from './model';
import {getCanvasNodes,resolveCanvasLayout,validateContentCanvasLayout,type CanvasPlacement} from './canvas-layout';
/** Explicit per-layout operation. No sibling, other page or other saved map changes. */
export function setStatusTitleFlow(content:OwnerContent,pageId:string,id:string,mobile:boolean,follow:boolean,detached?:CanvasPlacement):boolean {
 const page=content.pages.find(p=>p.id===pageId),node=page&&getCanvasNodes(content,page).find(n=>n.id===id);
 if(!page||!node?.supportsTitleFlow||(!follow&&!detached))return false;
 const resolved=resolveCanvasLayout(content,page,mobile),entry=resolved[id];if(!entry||entry.removed)return false;
 if(follow&&entry.flowAttachment||!follow&&!entry.flowAttachment)return false;
 const candidate=structuredClone(content),target=candidate.pages.find(p=>p.id===pageId)!;
 target.canvasLayout??={desktop:{}};
 if(mobile){target.canvasLayout.mobile??=structuredClone(resolved);target.canvasLayout.mobileInitialized=true;}
 const map=mobile?target.canvasLayout.mobile!:target.canvasLayout.desktop;
 const next={...entry,parentId:null};
 if(follow){delete next.placement;next.flowAttachment='after-page-title';}
 else {delete next.flowAttachment;next.placement=structuredClone(detached!);}
 map[id]=next;
 if(validateContentCanvasLayout(candidate,target,target.canvasLayout).length)return false;
 Object.assign(content,candidate);return true;
}
