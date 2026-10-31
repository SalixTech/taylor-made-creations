import { elementToScreen, layoutSize, type CanvasBoxBounds } from './box-affine';
import { inverseAffine, multiplyAffine, rotationAffine, transformPoint, validElementBox, type Affine, type ElementBox } from './box-geometry';
import { validCanvasPlacement, type CanvasPlacement } from './canvas-layout';

const translation = (x:number,y:number):Affine => ({a:1,b:0,c:0,d:1,e:x,f:y});
export type CapturedCanvasFrame = { screenMatrix:Affine; widthPx:number; heightPx:number; aspectLocked?:boolean; contentOffset?:{xPx:number;yPx:number} };
/** Capture before a temporary destination slot is mounted: mounting may reflow
 * the source. This immutable numeric snapshot holds no DOM references. */
export function captureCanvasFrame(node:HTMLElement,metadata?:ElementBox):CapturedCanvasFrame|null {
  if(node.isConnected===false)return null;
  const matrix=elementToScreen(node);
  if(!matrix)return null;
  const widthPx=layoutSize(node,'width'),heightPx=layoutSize(node,'height');
  const scale=metadata?widthPx/(metadata.referenceParentPx*metadata.widthPercent/100):1;
  const candidate={matrix:{...matrix},widthPx,heightPx,...(metadata?{aspectLocked:metadata.aspectLocked,...(metadata.contentOffset?{contentOffset:{xPx:metadata.contentOffset.xPx*scale,yPx:metadata.contentOffset.yPx*scale}}:{})}:{})};
  if(!validCanvasPlacement(candidate))return null;
  const {matrix:screenMatrix,...rest}=candidate;
  return {screenMatrix,...rest};
}
/** Destination is the zero-border/padding content slot, not decorated frame.
 * Caller fences source revision/page/device between snapshot and commit. */
export function placeCapturedCanvasFrame(snapshot:CapturedCanvasFrame,destination:HTMLElement):CanvasPlacement|null {
  if(destination.isConnected===false)return null;
  const {screenMatrix,...rest}=snapshot;
  if(!validCanvasPlacement({matrix:screenMatrix,...rest}))return null;
  const target=elementToScreen(destination),inverse=target&&inverseAffine(target);
  if(!inverse)return null;
  const result={...rest,...(rest.contentOffset?{contentOffset:{...rest.contentOffset}}:{}),matrix:multiplyAffine(inverse,screenMatrix)};
  return validCanvasPlacement(result)?result:null;
}
export function measureCanvasPlacement(node:HTMLElement,destination:HTMLElement,metadata?:ElementBox):CanvasPlacement|null {
  const snapshot=captureCanvasFrame(node,metadata);
  return snapshot?placeCapturedCanvasFrame(snapshot,destination):null;
}
export type PlacementControlChart = { placement:CanvasPlacement; residual:Affine; box:ElementBox };
/** Factor M=H Q where Q is exactly the rigid transform understood by existing
 * controls. H retains shear/reflection/nonuniform scale. Pointer coordinates and
 * overlays MUST use H as their virtual parent; do not use the DOM parent alone. */
export function placementControlChart(placement:CanvasPlacement, _metadata?:ElementBox):PlacementControlChart|null {
  // Kept in the adapter signature for existing callers; shared appearance must
  // never supply instance metadata after assignment, including after Reset.
  void _metadata;
  if (!validCanvasPlacement(placement)) return null;
  const m=placement.matrix, angle=Math.atan2(m.b,m.a)*180/Math.PI;
  const residual=multiplyAffine({...m,e:0,f:0},rotationAffine(-angle));
  const inverse=inverseAffine(residual);
  if (!inverse) return null;
  const rigid=multiplyAffine(inverse,m), center=transformPoint(rigid,{x:placement.widthPx/2,y:placement.heightPx/2});
  const box:ElementBox={widthPercent:100,heightPx:placement.heightPx,xPercent:(center.x-placement.widthPx/2)/placement.widthPx*100,yPx:center.y-placement.heightPx/2,baseWidthPx:placement.widthPx,baseHeightPx:placement.heightPx,referenceParentPx:placement.widthPx,aspectLocked:placement.aspectLocked??true,rotationDeg:angle,layout:'reflow',...(placement.contentOffset?{contentOffset:{...placement.contentOffset}}:{})};
  return validElementBox(box)?{placement,residual,box}:null;
}
/** Apply the edited virtual box through its ORIGINAL chart. Never rebuild H
 * from an in-progress preview, and never save this box as a second transform. */
export function applyPlacementControl(chart:PlacementControlChart,next:ElementBox):CanvasPlacement|null {
  if (!validElementBox(next) || next.referenceParentPx!==chart.box.referenceParentPx) return null;
  const widthPx=next.widthPercent/100*next.referenceParentPx,heightPx=next.heightPx;
  const rigid=rotationAffine(next.rotationDeg??0), center=transformPoint(rigid,{x:widthPx/2,y:heightPx/2});
  rigid.e=next.xPercent/100*next.referenceParentPx+widthPx/2-center.x;
  rigid.f=next.yPx+heightPx/2-center.y;
  const result={matrix:multiplyAffine(chart.residual,rigid),widthPx,heightPx,aspectLocked:next.aspectLocked,...(next.contentOffset?{contentOffset:{...next.contentOffset}}:{})};
  return validCanvasPlacement(result)?result:null;
}
/** Existing moveElementBoxFrame compensation is exact in this affine chart:
 * inverse(H R) H delta = inverse(R) delta. Retain next.contentOffset separately
 * in the placement metadata; renderer neutralizes legacy box geometry. */
export function measurePlacementControls(canvas:HTMLElement,destination:HTMLElement,placement:CanvasPlacement,metadata?:ElementBox):{chart:PlacementControlChart;bounds:CanvasBoxBounds}|null {
  if(canvas.isConnected===false||destination.isConnected===false)return null;
  const chart=placementControlChart(placement,metadata),target=elementToScreen(destination),canvasMap=elementToScreen(canvas);
  if (!chart || !target || !canvasMap) return null;
  const canvasInverse=inverseAffine(canvasMap);
  if (!canvasInverse) return null;
  const screenToCanvas=multiplyAffine(translation(canvas.scrollLeft-(canvas.clientLeft??0),canvas.scrollTop-(canvas.clientTop??0)),canvasInverse);
  const parentToScreen=multiplyAffine(target,chart.residual),screenToParent=inverseAffine(parentToScreen);
  if (!screenToParent) return null;
  const parentToCanvas=multiplyAffine(screenToCanvas,parentToScreen),nodeToCanvas=multiplyAffine(screenToCanvas,multiplyAffine(target,placement.matrix));
  const {widthPx:width,heightPx:height}=placement;
  const corners=[{x:0,y:0},{x:width,y:0},{x:0,y:height},{x:width,y:height}].map(p=>transformPoint(nodeToCanvas,p));
  const origin={x:chart.box.xPercent/100*width,y:chart.box.yPx};
  const bounds:CanvasBoxBounds={width,height,parentWidth:width,xPercent:chart.box.xPercent,origin,parentToScreen,screenToParent,parentToCanvas,nodeToCanvas,heightFactor:1,left:Math.min(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),canvasWidth:canvas.clientWidth,signature:JSON.stringify([placement,target,canvasMap,canvas.scrollLeft,canvas.scrollTop])};
  return [...corners.flatMap(p=>[p.x,p.y]),bounds.canvasWidth].every(Number.isFinite)?{chart,bounds}:null;
}
