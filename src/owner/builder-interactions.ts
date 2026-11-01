import {initializeInlineTextMobile} from "./rich-text";
import {initializeCanvasMobileLayouts} from "./canvas-layout";
/** Safe editor operations: stable identities and bounded values, never arbitrary CSS. */
export function normalizeHexColor(value: string): string | null {
  const input = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(input)) return `#${[...input].map(char => char + char).join("").toLowerCase()}`;
  return /^[0-9a-f]{6}$/i.test(input) ? `#${input.toLowerCase()}` : null;
}
export function boundedNumber(value: string, min: number, max: number): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}
export function reorderById<T extends { id: string }>(items: T[], sourceId: string, targetId: string, after = false): boolean {
  if (sourceId === targetId) return false;
  const from = items.findIndex(item => item.id === sourceId);
  const target = items.findIndex(item => item.id === targetId);
  if (from < 0 || target < 0) return false;
  const insertion = target + (after ? 1 : 0) - (from < target ? 1 : 0);
  if (insertion === from) return false;
  const [item] = items.splice(from, 1);
  items.splice(insertion, 0, item);
  return true;
}
export function resizePercent(start: number, deltaPixels: number, basisPixels: number, min: number, max: number): number {
  if (!Number.isFinite(basisPixels) || basisPixels <= 0 || !Number.isFinite(deltaPixels)) return start;
  return Math.min(max, Math.max(min, Math.round(start + deltaPixels / basisPixels * 100)));
}

/** Stable, layout-scoped section topology. Never mutates rendered DOM as data. */
import type { OwnerContent, PageBlock } from "./model";
import { resolveSiteDesign, setSiteDesignForLayout } from "./site-design";
import { resolveElementAppearance, setElementAppearanceForLayout } from "./appearance";
export function blockParent(block:PageBlock,mobile=false):string|null{return mobile&&block.mobileParentId!==undefined?block.mobileParentId:block.parentId??null;}
export function blockSiblings(blocks:PageBlock[],parentId:string|null,mobile=false):PageBlock[]{return blocks.filter(block=>blockParent(block,mobile)===parentId).sort((a,b)=>mobile?(a.mobileOrder??blocks.indexOf(a))-(b.mobileOrder??blocks.indexOf(b)):blocks.indexOf(a)-blocks.indexOf(b));}
function topologyValid(blocks:PageBlock[],mobile:boolean){const byId=new Map(blocks.map(block=>[block.id,block]));return blocks.every(block=>{const seen=new Set([block.id]);let parent=blockParent(block,mobile);while(parent){const node=byId.get(parent);if(!node||node.type!=="section"||seen.has(parent))return false;seen.add(parent);parent=blockParent(node,mobile);}return true;});}
export function canReparentBlock(blocks:PageBlock[],id:string,parentId:string|null,mobile=false):boolean{const next=structuredClone(blocks),block=next.find(item=>item.id===id);if(!block)return false;if(mobile)block.mobileParentId=parentId;else if(parentId)block.parentId=parentId;else delete block.parentId;return topologyValid(next,false)&&topologyValid(next,true);}
export function reparentBlock(blocks:PageBlock[],id:string,parentId:string|null,mobile=false):boolean{if(!canReparentBlock(blocks,id,parentId,mobile))return false;const block=blocks.find(item=>item.id===id)!;if(blockParent(block,mobile)===parentId)return false;if(mobile){block.mobileParentId=parentId;block.mobileOrder=Math.max(-1,...blocks.map((item,index)=>item.mobileOrder??index))+1;}else{if(parentId)block.parentId=parentId;else delete block.parentId;}return true;}
export function reorderBlock(blocks:PageBlock[],id:string,targetId:string,after=false,mobile=false):boolean{const source=blocks.find(item=>item.id===id),target=blocks.find(item=>item.id===targetId);if(!source||!target||id===targetId||blockParent(source,mobile)!==blockParent(target,mobile))return false;if(!mobile)return reorderById(blocks,id,targetId,after);const siblings=blockSiblings(blocks,blockParent(source,mobile),true);if(!reorderById(siblings,id,targetId,after))return false;siblings.forEach((block,index)=>{block.mobileOrder=index;});return true;}
export function stepBlock(blocks:PageBlock[],id:string,direction:-1|1,mobile=false):boolean{const block=blocks.find(item=>item.id===id);if(!block)return false;const siblings=blockSiblings(blocks,blockParent(block,mobile),mobile),index=siblings.findIndex(item=>item.id===id),target=siblings[index+direction];return !!target&&reorderBlock(blocks,id,target.id,direction>0,mobile);}
/** Remove descendants from BOTH layouts so deletion never leaves an orphan. */
export function removeBlockTree(blocks:PageBlock[],id:string):PageBlock[]{const removed=new Set([id]);let changed=true;while(changed){changed=false;for(const block of blocks)if(!removed.has(block.id)&&[block.parentId,block.mobileParentId].some(parent=>parent&&removed.has(parent))){removed.add(block.id);changed=true;}}return blocks.filter(block=>!removed.has(block.id));}
export function contentForLayout(content:OwnerContent,mobile:boolean):OwnerContent{const result=structuredClone(content);result.design=resolveSiteDesign(content.design,mobile);for(const page of result.pages){if(page.titleAppearance)page.titleAppearance=resolveElementAppearance(page.titleAppearance,mobile);for(const block of page.blocks)if(block.appearance)block.appearance=resolveElementAppearance(block.appearance,mobile);}for(const block of result.footerBlocks??[])if(block.appearance)block.appearance=resolveElementAppearance(block.appearance,mobile);for(const key of Object.keys(result.contentOverrides?.styles??{}))result.contentOverrides!.styles![key]=resolveElementAppearance(result.contentOverrides!.styles![key],mobile)!;return result;}
/** Existing panels edit one projected layout; shared copy/pricing remains shared. */
export function editContentForLayout(draft:OwnerContent,change:(draft:OwnerContent)=>void,mobile:boolean){const before=contentForLayout(draft,mobile),next=structuredClone(before);change(next);const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);for(const block of next.footerBlocks??[]){const old=draft.footerBlocks?.find(b=>b.id===block.id),view=before.footerBlocks?.find(b=>b.id===block.id);if(old&&view)block.appearance=equal(block.appearance,view.appearance)?old.appearance:setElementAppearanceForLayout(old.appearance,block.appearance,mobile);else if(mobile&&block.appearance)block.appearance=setElementAppearanceForLayout(undefined,block.appearance,true);}for(const page of next.pages){const original=draft.pages.find(item=>item.id===page.id),projected=before.pages.find(item=>item.id===page.id);if(original&&projected)page.titleAppearance=equal(page.titleAppearance,projected.titleAppearance)?original.titleAppearance:setElementAppearanceForLayout(original.titleAppearance,page.titleAppearance,mobile);for(const block of page.blocks){const old=original?.blocks.find(item=>item.id===block.id),view=projected?.blocks.find(item=>item.id===block.id);if(!old&&draft.design?.mobileLayoutEnabled){block.mobileParentId??=block.parentId??null;block.mobileOrder??=page.blocks.indexOf(block);}if(!old&&mobile&&block.appearance)block.appearance=setElementAppearanceForLayout(undefined,block.appearance,true);else if(old&&view)block.appearance=equal(block.appearance,view.appearance)?old.appearance:setElementAppearanceForLayout(old.appearance,block.appearance,mobile);}}
 const stylesRemoved=next.contentOverrides?.styles===undefined;const keys=new Set([...Object.keys(draft.contentOverrides?.styles??{}),...Object.keys(next.contentOverrides?.styles??{})]);for(const key of keys){const original=draft.contentOverrides?.styles?.[key],prior=before.contentOverrides?.styles?.[key],value=next.contentOverrides?.styles?.[key];if(equal(value,prior)){if(original){next.contentOverrides??={};next.contentOverrides.styles??={};next.contentOverrides.styles[key]=original;}}else{next.contentOverrides??={};next.contentOverrides.styles??={};const combined=setElementAppearanceForLayout(original,value,mobile);if(combined)next.contentOverrides.styles[key]=combined;else delete next.contentOverrides.styles[key];}}
 if(stylesRemoved&&next.contentOverrides?.styles&&Object.keys(next.contentOverrides.styles).length===0)delete next.contentOverrides.styles;
 next.design=equal(next.design,before.design)?draft.design:setSiteDesignForLayout(draft.design,next.design,mobile);
 for(const key of Object.keys(draft) as (keyof OwnerContent)[])delete draft[key];Object.assign(draft,next);
}

/** Snapshot both layout dimensions once; re-enabling never erases a saved mobile layout. */
export function initializeMobileLayout(content:OwnerContent){
 initializeCanvasMobileLayouts(content);
 initializeInlineTextMobile(content);
 if(content.design?.mobileDesign!==undefined){content.design.mobileLayoutEnabled=true;return;}
 const snapshot=(value:import("./appearance").ElementAppearance|undefined)=>value?.mobile!==undefined?value:{...value,mobile:structuredClone(resolveElementAppearance(value,false)??{})};
 for(const page of content.pages){page.titleAppearance=snapshot(page.titleAppearance);page.blocks.forEach((block,index)=>{block.appearance=snapshot(block.appearance);if(block.mobileParentId===undefined)block.mobileParentId=block.parentId??null;if(block.mobileOrder===undefined)block.mobileOrder=index;});}
 for(const block of content.footerBlocks??[])block.appearance=snapshot(block.appearance);
 for(const key of Object.keys(content.contentOverrides?.styles??{}))content.contentOverrides!.styles![key]=snapshot(content.contentOverrides!.styles![key]);
 content.design??={};content.design.mobileDesign??=structuredClone(resolveSiteDesign(content.design,false)??{});content.design.mobileLayoutEnabled=true;
}
