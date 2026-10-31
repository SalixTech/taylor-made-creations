/** Advisory screen-space guides only: never snap, clamp or persist geometry. */
export type AlignmentRect = {left:number;top:number;width:number;height:number};
export type AlignmentGuide = {axis:'x'|'y';position:number;start:number;end:number;proximity:'near'|'far'};
export function boxAlignmentGuides(selected:AlignmentRect, others:AlignmentRect[], tolerance=5):AlignmentGuide[]{
 const valid=(r:AlignmentRect)=>Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0;
 if(!valid(selected)||!Number.isFinite(tolerance)||tolerance<0)return [];
 const result:AlignmentGuide[]=[];
 for(const axis of ['x','y'] as const){
  const horizontal=axis==='x',origin=horizontal?'left':'top',size=horizontal?'width':'height',cross=horizontal?'top':'left',crossSize=horizontal?'height':'width';
  // Keep one useful reference per selected edge/centre, not only one per axis:
  // a text box can align both edges with a nearby button at the same time.
  for(const fraction of [0,.5,1]){
   let best:{distance:number;gap:number;guide:AlignmentGuide}|undefined;
   for(const other of others.filter(valid))for(const reference of [0,.5,1]){
    const position=other[origin]+other[size]*reference,distance=Math.abs(selected[origin]+selected[size]*fraction-position);
    const start=Math.min(selected[cross],other[cross]),end=Math.max(selected[cross]+selected[crossSize],other[cross]+other[crossSize]);
    const gap=Math.max(0,other[cross]-(selected[cross]+selected[crossSize]),selected[cross]-(other[cross]+other[crossSize]));
    if([position,start,end,distance,gap].every(Number.isFinite)&&distance<=tolerance&&(!best||gap<best.gap||gap===best.gap&&distance<best.distance))best={distance,gap,guide:{axis,position,start,end,proximity:gap<=80?'near':'far'}};
   }
   if(best&&!result.some(g=>g.axis===axis&&g.position===best.guide.position))result.push(best.guide);
  }
 }
 return result;
}
