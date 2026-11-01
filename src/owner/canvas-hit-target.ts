import type {OwnerContent,OwnerPage} from './model';
import {canvasTextField} from './canvas-text-adapter';
import {getCanvasNodes} from './canvas-layout';
/** Functional values retain their model binding. Clicking an unwritable locked
 * part selects its real containing unit rather than opening a dead text editor.
 * Editable words remain the nearest target, including locked action labels. */
export function resolveCanvasClickTarget(content:OwnerContent,page:OwnerPage,canvas:HTMLElement,target:HTMLElement):HTMLElement{
 const edit=target.dataset.ownerEdit;if(!edit||!canvas.contains(target)||canvasTextField(content,page,edit))return target;
 // Only the dynamic commission-status value is a known nontext unit control.
 if(edit!=='canvas:layout.commissions.statusValue'&&!/^canvas:layout\.block:[^:]+:[^:]+:status-value$/.test(edit))return target;
 const frame=target.closest<HTMLElement>('[data-owner-layout-id]');if(!frame)return target;
 const scope=frame.dataset.ownerLayoutScope==='chrome'?'chrome':'page';
 const nodes=getCanvasNodes(content,scope==='chrome'?'chrome':page),node=nodes.find(n=>n.id===frame.dataset.ownerLayoutId);
 if(!node)return target;
 for(let ancestor=frame.parentElement;ancestor&&canvas.contains(ancestor);ancestor=ancestor.parentElement){
  if(ancestor.dataset.ownerLayoutScope!==scope||!ancestor.dataset.ownerLayoutId)continue;
  const owner=nodes.find(n=>n.id===ancestor.dataset.ownerLayoutId);
  if(!owner||owner.parentLocked||owner.movable===false)continue;
  if(ancestor.dataset.ownerEdit)return ancestor;
  const candidate=Array.from(ancestor.querySelectorAll<HTMLElement>('[data-owner-edit]')).find(n=>n.dataset.ownerEdit===owner.styleTarget&&n.closest('[data-owner-layout-id]')===ancestor);
  if(candidate)return candidate;
 }
 return target;
}
