import {initialElementBox,validElementBox,type ElementBox} from './box-geometry';
import {validCanvasPlacement,type CanvasPlacement} from './canvas-layout';
import {readEditableText,renderEditableRuns} from './editable-text-dom';
import type {InlineTextRun} from './rich-text';
import type {ElementAppearance} from './site-design';
import {measureCanvasBox,type CanvasBoxBounds} from './box-affine';
import {captureCanvasFrame,type CapturedCanvasFrame} from './canvas-placement-geometry';
import {firstBoxMaterializationError} from './box-materialization';

export type HorizontalTextMeasurement={text:string;widthPx:number;naturalHeightPx:number;lineCount:number};
const positive=(value:number)=>Number.isFinite(value)&&value>0;
const typography=['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariant','fontKerning','fontFeatureSettings','fontVariationSettings','letterSpacing','wordSpacing','lineHeight','textTransform','textIndent','tabSize','direction'] as const;
/** Actual browser shaping in local CSS pixels, independent of source rotation/zoom.
 * Only owned plain text/rich runs are rendered; no raw HTML, links or CSS are copied.
 * Prospective runs allow one atomic text+marks+geometry edit before source rerenders.
 */
export function measureHorizontalText(source:HTMLElement,expectedPlain:string,prospectiveRuns?:InlineTextRun[]):HorizontalTextMeasurement|null{
 const doc=source.ownerDocument,view=doc?.defaultView;if(source.isConnected===false||!doc?.body||!view?.getComputedStyle)return null;
 const css=view.getComputedStyle(source);if(css.writingMode&&css.writingMode!=='horizontal-tb')return null;
 if(prospectiveRuns&&prospectiveRuns.map(run=>run.text).join('')!==expectedPlain||!prospectiveRuns&&readEditableText(source)!==expectedPlain)return null;
 const host=doc.createElement('div');host.setAttribute('aria-hidden','true');Object.assign(host.style,{position:'fixed',left:'0',top:'0',width:'0',height:'0',overflow:'hidden',contain:'strict',pointerEvents:'none',visibility:'hidden'});
 const node=doc.createElement('div');node.setAttribute('aria-hidden','true');node.setAttribute('data-site-render-mode','editor-inline');
 Object.assign(node.style,{position:'absolute',left:'0',top:'0',visibility:'hidden',pointerEvents:'none',display:'inline-block',boxSizing:'border-box',width:'max-content',minWidth:'0',maxWidth:'none',height:'auto',minHeight:'0',maxHeight:'none',whiteSpace:'pre',overflowWrap:'normal',wordBreak:'normal',transform:'none',margin:'0',contain:'layout style',zIndex:'-1'});
 for(const key of typography)node.style[key]=css[key];
 for(const side of ['Left','Right','Top','Bottom'] as const){node.style[`padding${side}`]=css[`padding${side}`];node.style[`border${side}Width`]=css[`border${side}Width`];node.style[`border${side}Style`]=css[`border${side}Style`];}
 try{
  if(prospectiveRuns)renderEditableRuns(node,prospectiveRuns);
  else {
   // Copy only text and semantic line breaks, preserving computed typography of
   // owned inline spans. Unknown elements have no active behavior in this clone.
   const copy=(from:Node,to:HTMLElement)=>{for(const child of Array.from(from.childNodes)){if(child.nodeType===3){to.appendChild(doc.createTextNode(child.textContent??''));continue;}if(child.nodeType!==1)continue;const element=child as HTMLElement;if(['SCRIPT','STYLE','IFRAME'].includes(element.tagName))continue;const target=doc.createElement(element.tagName==='BR'?'br':['DIV','P'].includes(element.tagName)?'div':'span');if(element.tagName!=='BR'){const computed=view.getComputedStyle(element);for(const key of typography)target.style[key]=computed[key];Object.assign(target.style,{whiteSpace:'pre',margin:'0',padding:'0',border:'0',width:'auto',minWidth:'0',maxWidth:'none'});copy(element,target);}to.appendChild(target);}};
   copy(source,node);
  }
  if(!expectedPlain||expectedPlain.endsWith('\n'))node.appendChild(doc.createTextNode('\u200b'));
  host.appendChild(node);doc.body.appendChild(host);const measured=view.getComputedStyle(node),raw=measured.width;
  if(!/^\d+(?:\.\d+)?px$/.test(raw))return null;const width=Number.parseFloat(raw);
  // One CSS pixel reserves the native insertion caret; no viewport/page cap.
  const widthPx=width+1;if(!positive(widthPx))return null;
  const naturalHeightPx=Number.parseFloat(measured.height);if(!positive(naturalHeightPx))return null;
  return{text:expectedPlain,widthPx,naturalHeightPx,lineCount:expectedPlain.split('\n').length};
 }catch{return null;}finally{host.remove();}
}
/** Keep the local top-left/world anchor fixed despite legacy center-origin rotation.
 * Height, original flow footprint, content compensation and manual aspect setting
 * are untouched. Typing is not a ratio-locked resize gesture.
 */
export function growHorizontalBox(box:ElementBox,requiredWidthPx:number,currentRenderedWidthPx:number,renderedHeights?:{beforePx:number;afterPx:number}):ElementBox|null{
 if(!validElementBox(box)||!positive(requiredWidthPx)||!positive(currentRenderedWidthPx))return null;
 if(renderedHeights&&(!positive(renderedHeights.beforePx)||!positive(renderedHeights.afterPx)))return null;
 const oldWidth=box.referenceParentPx*(box.widthPercent/100),width=oldWidth*Math.max(1,requiredWidthPx/currentRenderedWidthPx),delta=(width-oldWidth)/2;
 const angle=((box.rotationDeg??0)%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 // Saved height is only a minimum. A caller measuring a reflowing rotated frame
 // must supply actual before/after heights; otherwise its anchor is unknowable.
 if(angle!==0&&!renderedHeights)return null;
 const deltaHeight=renderedHeights?(renderedHeights.afterPx-renderedHeights.beforePx)*(oldWidth/currentRenderedWidthPx)/2:0;
 const next={...structuredClone(box),widthPercent:width/box.referenceParentPx*100,xPercent:box.xPercent-((1-c)*delta+s*deltaHeight)/box.referenceParentPx*100,yPx:box.yPx+s*delta-(1-c)*deltaHeight};
 return validElementBox(next)?next:null;
}
/** Placed frames already use an affine top-left origin; retain the entire matrix. */
export function growHorizontalPlacement(placement:CanvasPlacement,requiredWidthPx:number,currentRenderedWidthPx:number):CanvasPlacement|null{
 if(!validCanvasPlacement(placement)||!positive(requiredWidthPx)||!positive(currentRenderedWidthPx))return null;
 const next={...structuredClone(placement),widthPx:placement.widthPx*Math.max(1,requiredWidthPx/currentRenderedWidthPx)};
 return validCanvasPlacement(next)?next:null;
}

export type HorizontalGrowthContext={source:object;pageId:string;target:string;value:string;mobile:boolean;identity:{id:string;scope:'page'|'chrome'}};
export type HorizontalGrowthCapture={context:HorizontalGrowthContext;canvas:HTMLDivElement;node:HTMLElement;frame:CapturedCanvasFrame;bounds?:CanvasBoxBounds;box?:ElementBox;placement?:CanvasPlacement;appearanceSignature:string;placementSignature:string;materialized:boolean};
export type HorizontalGrowthProposal={kind:'box';box:ElementBox;materialized:boolean}|{kind:'placement';placement:CanvasPlacement};
const serialized=(value:unknown)=>JSON.stringify(value??null);
function exactFrame(canvas:HTMLDivElement,context:HorizontalGrowthContext):HTMLElement|null{
 if(canvas.isConnected===false||!context.identity?.id)return null;
 const frames=Array.from(canvas.querySelectorAll<HTMLElement>('[data-owner-layout-id]')).filter(node=>node.dataset.ownerLayoutId===context.identity.id&&node.dataset.ownerLayoutScope===context.identity.scope);
 if(frames.length!==1||frames[0].isConnected===false)return null;const frame=frames[0];
 const matching=[frame,...Array.from(frame.querySelectorAll<HTMLElement>('[data-owner-edit]'))].filter(node=>node.dataset.ownerEdit===context.target&&node.closest<HTMLElement>('[data-owner-layout-id]')===frame);
 return matching.length?frame:null;
}
/** Capture before changing the canonical draft. No persistent DOM or model writes. */
export function captureHorizontalGrowth(canvas:HTMLDivElement,context:HorizontalGrowthContext,appearance?:ElementAppearance,placement?:CanvasPlacement):HorizontalGrowthCapture|null{
 const node=exactFrame(canvas,context),frame=node&&captureCanvasFrame(node);if(!node||!frame)return null;
 const base={context:{...context,identity:{...context.identity}},canvas,node,frame,appearanceSignature:serialized(appearance),placementSignature:serialized(placement)};
 if(placement){if(!validCanvasPlacement(placement))return null;return{...base,placement:structuredClone(placement),materialized:false};}
 const existing=validElementBox(appearance?.box)?appearance.box:undefined;if(appearance?.box&&!existing)return null;
 const bounds=measureCanvasBox(canvas,node,existing);if(!bounds||firstBoxMaterializationError(node,bounds))return null;
 const box=existing?structuredClone(existing):{...initialElementBox(bounds),...(bounds.flow?{flow:structuredClone(bounds.flow)}:{})};
 if(!validElementBox(box))return null;return{...base,bounds,box,materialized:!existing};
}
/** Fence identity, immutable source, active viewport, source text, model geometry,
 * exact frame object and current native/affine measurement immediately before edit. */
export function horizontalGrowthCaptureCurrent(capture:HorizontalGrowthCapture,current:HorizontalGrowthContext,appearance?:ElementAppearance,placement?:CanvasPlacement):boolean{
 const old=capture.context;if(old.source!==current.source||old.pageId!==current.pageId||old.target!==current.target||old.value!==current.value||old.mobile!==current.mobile||old.identity.id!==current.identity.id||old.identity.scope!==current.identity.scope||capture.appearanceSignature!==serialized(appearance)||capture.placementSignature!==serialized(placement))return false;
 if(exactFrame(capture.canvas,current)!==capture.node)return false;const frame=captureCanvasFrame(capture.node);if(!frame||serialized(frame)!==serialized(capture.frame))return false;
 if(capture.bounds){const bounds=measureCanvasBox(capture.canvas,capture.node,capture.materialized?undefined:capture.box);if(!bounds||bounds.signature!==capture.bounds.signature||bounds.width!==capture.bounds.width||bounds.height!==capture.bounds.height)return false;}
 return true;
}
/** Prospective natural height affects only center-anchor compensation, never the
 * persisted height. Newlines remain explicit; ordinary typing grows horizontally. */
export function proposeHorizontalGrowth(capture:HorizontalGrowthCapture,measurement:HorizontalTextMeasurement):HorizontalGrowthProposal|null{
 if(!positive(measurement.widthPx)||!positive(measurement.naturalHeightPx))return null;
 if(capture.placement){const placement=growHorizontalPlacement(capture.placement,measurement.widthPx,capture.frame.widthPx);return placement?{kind:'placement',placement}:null;}
 const box=capture.box;if(!box)return null;const designWidth=box.referenceParentPx*(box.widthPercent/100),scale=capture.frame.widthPx/designWidth;
 const afterPx=Math.max(box.heightPx*scale,measurement.naturalHeightPx);if(!positive(afterPx))return null;
 const next=growHorizontalBox(box,measurement.widthPx,capture.frame.widthPx,{beforePx:capture.frame.heightPx,afterPx});return next?{kind:'box',box:next,materialized:capture.materialized}:null;
}
