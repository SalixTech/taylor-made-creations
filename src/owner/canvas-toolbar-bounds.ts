import {elementToScreen} from './box-affine';
import {inverseAffine,transformPoint,type Affine} from './box-geometry';
export type CanvasVisualExtent={left:number;top:number;right:number;bottom:number};
/** Read-only glyph measurement: legacy frame-only offsets may place visible
 * text outside the selection frame. Do not reset those authored offsets. */
export function canvasTextExtent(canvas:HTMLElement,node:HTMLElement):CanvasVisualExtent|null{
 const doc=node.ownerDocument;if(!doc?.createTreeWalker||!doc.createRange)return null;
 const matrix=elementToScreen(canvas),inverse=matrix&&inverseAffine(matrix);if(!inverse)return null;
 const walker=doc.createTreeWalker(node,4),points:{x:number;y:number}[]=[];let text=walker.nextNode();
 while(text){if(text.textContent?.trim()){
  const range=doc.createRange();range.selectNodeContents(text);
  for(const rect of Array.from(range.getClientRects()))if(rect.width>0&&rect.height>0){for(const p of [{x:rect.left,y:rect.top},{x:rect.right,y:rect.top},{x:rect.left,y:rect.bottom},{x:rect.right,y:rect.bottom}]){const mapped=transformPoint(inverse,p);if(Number.isFinite(mapped.x)&&Number.isFinite(mapped.y))points.push(mapped);}}
  range.detach?.();
 }text=walker.nextNode();}
 return points.length?{left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))}:null;
}
export function canvasToolbarPosition(frame:{width:number;height:number;matrix:Affine},text:CanvasVisualExtent|null,toolbar:{width:number;height:number},canvasWidth:number){
 const points=[{x:0,y:0},{x:frame.width,y:0},{x:0,y:frame.height},{x:frame.width,y:frame.height}].map(p=>transformPoint(frame.matrix,p));
 const left=Math.min(...points.map(p=>p.x),text?.left??Infinity),top=Math.min(...points.map(p=>p.y),text?.top??Infinity),bottom=Math.max(...points.map(p=>p.y),text?.bottom??-Infinity);
 return{left:Math.max(0,Math.min(left,canvasWidth-toolbar.width)),top:top>=toolbar.height+44?top-toolbar.height-44:bottom+44};
}
