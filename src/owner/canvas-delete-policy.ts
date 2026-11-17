import type {PageBlock} from './model';
/** Authored content items are one unit. Explicit container/frame types keep the
 * existing frame-only deletion behavior unless the owner chooses contents too. */
export function deleteItemWithContents(blocks:readonly PageBlock[],id:string):boolean {
  const block=blocks.find(item=>`block:${item.id}`===id);
  return !!block&&block.type!=='section'&&block.type!=='canvas-space';
}
