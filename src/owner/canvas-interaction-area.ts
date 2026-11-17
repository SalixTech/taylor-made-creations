/** The interaction surface must cover visible overflow, not only the canvas's
 * flow box. Detached boxes intentionally may extend beyond that flow box. */
export type InteractionRect={left:number;top:number;right:number;bottom:number};
export function canvasInteractionArea(canvas:InteractionRect,scrollWidth:number,scrollHeight:number,items:readonly InteractionRect[]){
  const finite=items.filter(r=>[r.left,r.top,r.right,r.bottom].every(Number.isFinite));
  const left=Math.min(0,...finite.map(r=>r.left-canvas.left));
  const top=Math.min(0,...finite.map(r=>r.top-canvas.top));
  const right=Math.max(canvas.right-canvas.left,scrollWidth,...finite.map(r=>r.right-canvas.left));
  const bottom=Math.max(canvas.bottom-canvas.top,scrollHeight,...finite.map(r=>r.bottom-canvas.top));
  return {left,top,width:right-left,height:bottom-top};
}
