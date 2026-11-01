import type {OwnerContent} from './model';
import {resolveElementAppearance,setElementAppearanceForLayout,type ElementAppearance} from './appearance';
import {elementToScreen,layoutSize} from './box-affine';
import {getCanvasNodes,resolveCanvasLayout,updateCanvasPlacement} from './canvas-layout';
import {validElementBox,transformPoint} from './box-geometry';
import type {CapturedCanvasFrame} from './canvas-placement-geometry';

export type CanvasShoveContext={source:OwnerContent;pageId:string;mobile:boolean;id:string;scope:'page'|'chrome';sessionKey?:string};
export type CanvasShoveResult<T>={ok:true;value:T}|{ok:false;notice:string};
export type CanvasShoveAnchor={id:string;styleKey:string;target?:string;top:number;left:number;right:number;previousBottom:number;scaleY:number;marginTop:number;previousMarginBottom:number;sourceCarry:boolean;blocked:boolean};
export type CanvasShoveCapture={context:CanvasShoveContext;sourceTarget:string;sourceScaleY:number;sourceResponsiveScale:number;sourceBounds?:number[];anchors:CanvasShoveAnchor[]};
export type CanvasShovePlan={anchorId:string;deltaPx:number;marginTopPx:number;sourceCarryPx:number};
const failure=<T>(notice:string):CanvasShoveResult<T>=>({ok:false,notice});
const finite=(...n:number[])=>n.every(Number.isFinite);
const pixels=(value:string)=>/^[-+]?(?:\d+\.?\d*|\.\d+)px$/.test(value)?Number.parseFloat(value):NaN;
const axis=(m:ReturnType<typeof elementToScreen>)=>!!m&&finite(m.a,m.b,m.c,m.d,m.e,m.f)&&m.a>0&&m.d>0&&Math.abs(m.b)<1e-7&&Math.abs(m.c)<1e-7;
function appearance(content:OwnerContent,pageId:string,target:string):ElementAppearance|undefined{
 const page=content.pages.find(p=>p.id===pageId);if(target.startsWith('block:'))return page?.blocks.find(b=>`block:${b.id}`===target)?.appearance;
 if(target==='page-title')return page?.titleAppearance??content.contentOverrides?.styles?.[`${page?.builtinKey}.title`];
 return content.contentOverrides?.styles?.[target.slice(target.indexOf(':')+1)];
}
function writeAppearance(content:OwnerContent,pageId:string,target:string,value:ElementAppearance){
 const page=content.pages.find(p=>p.id===pageId);if(!page)return false;
 if(target.startsWith('block:')){const block=page.blocks.find(b=>`block:${b.id}`===target);if(!block)return false;block.appearance=value;}
 else if(target==='page-title'&&page.kind==='custom')page.titleAppearance=value;
 else{const key=target==='page-title'?`${page.builtinKey}.title`:target.slice(target.indexOf(':')+1);content.contentOverrides??={};content.contentOverrides.styles??={};content.contentOverrides.styles[key]=value;}
 return true;
}
/** Capture only native full-row boundaries. No DOM/style mutation, reordering,
 * materialization, or reconstruction of the site's semantic wrappers. */
export function captureCanvasShove(canvas:HTMLElement,context:CanvasShoveContext,sourceFrame:HTMLElement):CanvasShoveResult<CanvasShoveCapture>{
 const page=context.source.pages.find(p=>p.id===context.pageId);
 if(context.scope!=='page'||!page)return failure('Shove works between sections on this page. Turn Shove off to move shared header or footer pieces.');
 const nodes=getCanvasNodes(context.source,page),source=nodes.find(n=>n.id===context.id),map=resolveCanvasLayout(context.source,page,context.mobile);
 const matrix=elementToScreen(sourceFrame),sourceRect=sourceFrame.getBoundingClientRect();
 if(!finite(sourceRect.left,sourceRect.top,sourceRect.width,sourceRect.height)||sourceRect.width<=0||sourceRect.height<=0||!source||map[context.id]?.removed||sourceFrame.dataset.ownerLayoutId!==context.id||sourceFrame.dataset.ownerLayoutScope!==context.scope||!axis(matrix)||!canvas.contains(sourceFrame))return failure('Shove cannot measure this box safely. Turn Shove off for free placement.');
 const box=resolveElementAppearance(appearance(context.source,page.id,source.styleTarget),context.mobile)?.box;
 const responsive=box?layoutSize(sourceFrame,'width')/(box.referenceParentPx*box.widthPercent/100):1;
 if(!(responsive>0)||!Number.isFinite(responsive))return failure('Shove cannot measure this box safely.');
 const anchors:CanvasShoveAnchor[]=[];
 for(const node of Array.from(canvas.querySelectorAll<HTMLElement>('[data-owner-layout-id]'))){
  const id=node.dataset.ownerLayoutId,descriptor=nodes.find(n=>n.id===id);
  if(!id||!descriptor||!['canvas:','block:'].some(prefix=>descriptor.styleTarget.startsWith(prefix))||node.dataset.ownerLayoutScope!=='page'||sourceFrame.contains(node)||node.contains(sourceFrame)||node.hasAttribute('data-owner-geometry')||map[id]?.placement||map[id]?.removed)continue;
  const parent=node.parentElement,previous=node.previousElementSibling as HTMLElement|null;
  if(!parent||!previous||previous===sourceFrame||sourceFrame.contains(previous))continue;
  const css=getComputedStyle(node),pcss=getComputedStyle(parent),prevCss=getComputedStyle(previous),m=elementToScreen(parent),nm=elementToScreen(node);
  if(!axis(m)||!axis(nm)||!['block','flow-root'].includes(pcss.display)||!['block','grid','flex','flow-root'].includes(css.display)||!['static','relative'].includes(css.position)||!['static','relative'].includes(prevCss.position)||css.float!=='none'||prevCss.float!=='none'||css.clear!=='none')continue;
  // Relative visual offsets or transforms would decouple the visual gap from flow.
  if(css.transform!=='none'||prevCss.transform!=='none'||(css.position==='relative'&&css.top!=='auto'&&css.top!=='0px')||(prevCss.position==='relative'&&prevCss.top!=='auto'&&prevCss.top!=='0px'))continue;
  const r=node.getBoundingClientRect(),pr=previous.getBoundingClientRect(),parentRect=parent.getBoundingClientRect();
  const mt=pixels(css.marginTop),mb=pixels(prevCss.marginBottom),pl=pixels(pcss.paddingLeft)+pixels(pcss.borderLeftWidth),right=pixels(pcss.paddingRight)+pixels(pcss.borderRightWidth);
  if(!finite(mt,mb,pl,right,r.top,r.bottom,pr.bottom)||mt<0||mb<0||r.height<=0||pr.height<=0||Math.abs(r.left-(parentRect.left+pl*m!.a))>1||Math.abs(r.right-(parentRect.right-right*m!.a))>1||Math.abs((r.top-pr.bottom)/m!.d-Math.max(mt,mb))>1)continue;
  let sourceRoot:HTMLElement|null=sourceFrame;while(sourceRoot&&sourceRoot.parentElement!==parent)sourceRoot=sourceRoot.parentElement;
  let sourceSlot=sourceFrame.parentElement;while(sourceSlot&&sourceSlot!==canvas&&!sourceSlot.dataset.ownerLayoutSlot&&!sourceSlot.dataset.ownerLayoutId)sourceSlot=sourceSlot.parentElement;
  const rootPlacement=map[context.id]?.parentId===null&&sourceSlot?.dataset.ownerLayoutSlot==='__root'&&sourceSlot.dataset.ownerLayoutScope==='page'&&getComputedStyle(sourceSlot).position==='absolute'&&sourceSlot.parentElement?.contains(parent);
  if(!sourceRoot&&!rootPlacement)continue;
  const siblings=Array.from(parent.children),sourceIndex=sourceRoot?siblings.indexOf(sourceRoot):-1,anchorIndex=siblings.indexOf(node);
  const sourceCarry=!!sourceRoot&&sourceIndex>anchorIndex&&['static','relative'].includes(getComputedStyle(sourceRoot).position);
  // Unknown absolute lower roots are not globally shifted. Refuse rather than
  // silently leave them overlapping, or move unrelated canvas content.
  const blocked=[...new Set([...canvas.querySelectorAll<HTMLElement>('[data-owner-layout-id]'),...canvas.querySelectorAll<HTMLElement>('[data-owner-layout-placed]')])].some(other=>{if(other===sourceFrame||sourceFrame.contains(other)||node.contains(other))return false;let root:HTMLElement|null=other;while(root&&root.parentElement!==parent)root=root.parentElement;let otherSlot=other.parentElement;while(otherSlot&&otherSlot!==canvas&&!otherSlot.dataset.ownerLayoutSlot&&!otherSlot.dataset.ownerLayoutId)otherSlot=otherSlot.parentElement;const isRoot=otherSlot?.dataset.ownerLayoutSlot==='__root'&&otherSlot.dataset.ownerLayoutScope==='page'&&getComputedStyle(otherSlot).position==='absolute'&&otherSlot.parentElement?.contains(parent);if(!root&&!isRoot)return false;const detached=isRoot||root&&!['static','relative'].includes(getComputedStyle(root).position);const rect=other.getBoundingClientRect();return !!detached&&rect.bottom>r.top&&rect.right>r.left&&rect.left<r.right;});
  anchors.push({id,styleKey:descriptor.styleTarget.slice(7),target:descriptor.styleTarget,top:r.top,left:r.left,right:r.right,previousBottom:pr.bottom,scaleY:m!.d,marginTop:mt,previousMarginBottom:mb,sourceCarry,blocked});
 }
 if(!anchors.length)return failure('Shove needs a clear gap above a full-width section. Turn Shove off for free placement inside cards or columns.');
 const sourceParentMatrix=map[context.id]?.placement&&sourceFrame.parentElement?elementToScreen(sourceFrame.parentElement):matrix;if(!axis(sourceParentMatrix))return failure('Shove cannot safely move this transformed box. Turn Shove off for free placement.');
 return {ok:true,value:{context,sourceTarget:source.styleTarget,sourceScaleY:sourceParentMatrix!.d,sourceResponsiveScale:responsive,sourceBounds:[sourceRect.left,sourceRect.top,sourceRect.width,sourceRect.height],anchors}};
}
export function canvasShoveCaptureCurrent(canvas:HTMLElement,capture:CanvasShoveCapture,sourceFrame:HTMLElement):boolean{
 const current=captureCanvasShove(canvas,capture.context,sourceFrame);if(!current.ok)return false;
 const geometry=(value:CanvasShoveCapture)=>[value.sourceTarget,value.sourceScaleY,value.sourceResponsiveScale,value.sourceBounds,value.anchors];
 return JSON.stringify(geometry(current.value))===JSON.stringify(geometry(capture));
}
/** Frozen numeric geometry: repeated previews never add to previous previews. */
export function planCanvasShove(capture:CanvasShoveCapture,snapshot:CapturedCanvasFrame):CanvasShoveResult<CanvasShovePlan>{
 const m=snapshot.screenMatrix;if(!axis(m)||!finite(snapshot.widthPx,snapshot.heightPx)||snapshot.widthPx<=0||snapshot.heightPx<=0)return failure('Shove needs an unrotated box. Turn Shove off for free placement.');
 const top=m.f,bottom=transformPoint(m,{x:0,y:snapshot.heightPx}).y,left=m.e,right=transformPoint(m,{x:snapshot.widthPx,y:0}).x;
 const anchor=capture.anchors.filter(a=>top>=a.previousBottom-1&&top<=a.top+1&&right>a.left&&left<a.right).sort((a,b)=>a.top-b.top)[0];
 if(!anchor)return failure('Drop in the gap above a full-width section, or turn Shove off for free placement.');
 if(anchor.blocked)return failure('Another freely placed box overlaps the lower section. Move it clear or turn Shove off first.');
 const deltaPx=Math.max(0,(bottom-anchor.top)/anchor.scaleY),marginTopPx=deltaPx?Math.max(anchor.marginTop,anchor.previousMarginBottom)+deltaPx:anchor.marginTop;
 const sourceCarryPx=anchor.sourceCarry?deltaPx*anchor.scaleY/capture.sourceScaleY:0;
 if(!finite(deltaPx,marginTopPx,sourceCarryPx))return failure('This move is too large to measure safely. Nothing changed.');
 return {ok:true,value:{anchorId:anchor.id,deltaPx,marginTopPx,sourceCarryPx}};
}
/** Caller owns one candidate/history transaction and fences the source revision.
 * Normal movement has already been applied. Commit this candidate only on true. */
export function applyCanvasShove(candidate:OwnerContent,capture:CanvasShoveCapture,plan:CanvasShovePlan):boolean{
 const {context}=capture,page=candidate.pages.find(p=>p.id===context.pageId),anchor=capture.anchors.find(a=>a.id===plan.anchorId);
 if(!page||!anchor||!finite(plan.deltaPx,plan.marginTopPx,plan.sourceCarryPx)||plan.deltaPx<0||plan.sourceCarryPx<0)return false;
 const expectedMargin=plan.deltaPx?Math.max(anchor.marginTop,anchor.previousMarginBottom)+plan.deltaPx:anchor.marginTop;
 if(plan.marginTopPx!==expectedMargin||Math.abs(plan.sourceCarryPx-(anchor.sourceCarry?plan.deltaPx*anchor.scaleY/capture.sourceScaleY:0))>1e-7)return false;
 const next=structuredClone(candidate);
 if(plan.sourceCarryPx){
  const scope=next.pages.find(p=>p.id===page.id)!,entry=resolveCanvasLayout(next,scope,context.mobile)[context.id];
  if(entry?.placement){const p=entry.placement;if(!updateCanvasPlacement(next,scope,context.id,context.mobile,{...p,matrix:{...p.matrix,f:p.matrix.f-plan.sourceCarryPx}}))return false;}
  else{const raw=appearance(next,page.id,capture.sourceTarget),active=resolveElementAppearance(raw,context.mobile),box=active?.box;if(!box||!validElementBox(box)||!(capture.sourceResponsiveScale>0))return false;
   const adjusted={...box,yPx:box.yPx-plan.sourceCarryPx/capture.sourceResponsiveScale};if(!validElementBox(adjusted)||!writeAppearance(next,page.id,capture.sourceTarget,setElementAppearanceForLayout(raw,{...active,box:adjusted},context.mobile)!))return false;
  }
 }
 if(plan.deltaPx){const target=anchor.target??`canvas:${anchor.styleKey}`,raw=appearance(next,page.id,target),baseline=appearance(context.source,page.id,target);
  if(JSON.stringify(raw)!==JSON.stringify(baseline))return false;
  const active=resolveElementAppearance(raw,context.mobile);if(!writeAppearance(next,page.id,target,setElementAppearanceForLayout(raw,{...active,marginTopPx:plan.marginTopPx},context.mobile)!))return false;
 }
 Object.assign(candidate,next);return true;
}
