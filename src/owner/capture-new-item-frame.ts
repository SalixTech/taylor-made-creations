import {COMMISSION_STATUSES,type PageBlock} from './model';
import {captureCanvasFrame,type CapturedCanvasFrame} from './canvas-placement-geometry';
/** New status items reserve the largest actual Hub state. No saved placement,
 * ordinary box or legacy banner is resized. Failed measurements retain the
 * original full-width frame instead of guessing an undersized text box. */
export function captureNewItemFrame(frame:HTMLElement,block:PageBlock,samples?:HTMLElement|null):CapturedCanvasFrame|null {
  const capture=captureCanvasFrame(frame);
  if(capture&&(block.type==="text"||block.type==="heading")&&frame.ownerDocument){
    const doc=frame.ownerDocument,range=doc.createRange(),walker=doc.createTreeWalker(frame,4);
    let width=0;
    while(walker.nextNode()){
      if(!walker.currentNode.textContent?.trim())continue;
      range.selectNodeContents(walker.currentNode);
      for(const rect of range.getClientRects())width=Math.max(width,rect.width);
    }
    const scale=Math.abs(capture.screenMatrix.a)||1;
    if(width>0)return {...capture,widthPx:Math.min(capture.widthPx,Math.ceil(width/scale)+12)};
  }
  if(!capture||block.type!=='commission-status'||!block.textOnly)return capture;
  const widths:number[]=[],heights:number[]=[];
  for(const status of COMMISSION_STATUSES){
    const sample=Array.from(samples?.querySelectorAll<HTMLElement>('[data-owner-status-size]')??[]).find(node=>node.dataset.ownerStatusSize===status);
    const text=sample?.querySelector<HTMLElement>('[data-owner-status-value="true"]');
    const heading=text?.closest<HTMLElement>('h2');
    const measured=text?captureCanvasFrame(text):null,box=heading?captureCanvasFrame(heading):null;
    if(!measured||!box)return capture;
    // Computed CSS sizes are rounded separately from DOMRects. Match the
    // existing geometry tolerance so harmless fractional rounding does not
    // masquerade as a transformed leaf and retain the full-width frame.
    // Genuine independent transforms still keep their existing frame.
    if([measured,box].some(value=>(['a','b','c','d'] as const).some(key=>Math.abs(value.screenMatrix[key]-capture.screenMatrix[key])>1e-4)))return capture;
    widths.push(Math.max(measured.widthPx,box.widthPx));heights.push(box.heightPx);
  }
  return {...capture,widthPx:Math.max(1,Math.ceil(Math.max(...widths))),heightPx:Math.max(capture.heightPx,Math.ceil(Math.max(...heights)))};
}
