import {assertOwnerContent,type OwnerContent,type FooterBlock} from './model';
import {resolveCanvasLayout,getCanvasNodes,validCanvasPlacement,type CanvasPlacement,type CanvasNodeMap} from './canvas-layout';
export const SHARED_FOOTER_PAGE_ID='shared-footer';
export type FooterTransferOptions={pageId:string;blockId:string;newId:string;mobile:boolean;placement:CanvasPlacement};
/** Pure atomic draft transaction; caller confirms all-pages scope and owns
 * current-source/session fences and one Undo entry. Never saves or publishes.
 * Inactive viewport retains its own local geometry, not active coordinates. */
export function transferPageBlockToFooter(content:OwnerContent,options:FooterTransferOptions):{content:OwnerContent;blockId:string}{
 const {pageId,blockId,newId,mobile,placement}=options;assertOwnerContent(content);
 const page=content.pages.find(p=>p.id===pageId),block=page?.blocks.find(b=>b.id===blockId);
 if(!page||!block||!['text','heading','link'].includes(block.type))throw Error('Only custom text, heading and button items can move to the shared footer.');
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(newId)||content.pages.some(p=>p.id===newId||p.blocks.some(b=>b.id===newId))||content.footerBlocks?.some(b=>b.id===newId)||getCanvasNodes(content,'chrome').some(n=>n.id===`block:${newId}`))throw Error('Choose a fresh shared item identity.');
 if(!validCanvasPlacement(placement))throw Error('The footer drop position could not be measured. Nothing was moved.');
 const root=`block:${blockId}`,prefix=`canvas:layout.block:${pageId}:${blockId}:`,owned=new Set(getCanvasNodes(content,page).filter(n=>n.id===root||n.id.startsWith(prefix)).map(n=>n.id));
 const maps={desktop:resolveCanvasLayout(content,page,false),mobile:resolveCanvasLayout(content,page,true)};
 for(const map of Object.values(maps)){
  if(map[root]?.removed)throw Error('Restore this item in both layouts before moving it to the shared footer.');
  for(const[id,entry]of Object.entries(map)){
   if(!owned.has(id)&&entry.parentId&&owned.has(entry.parentId))throw Error('Move other contents out of this item before transferring it to the shared footer.');
   if(owned.has(id)&&id!==root&&(!entry.parentId||!owned.has(entry.parentId)))throw Error('Keep this item’s text and button parts together before moving it to the shared footer.');
  }
 }
 const next=structuredClone(content),nextPage=next.pages.find(p=>p.id===pageId)!;
 const moved=structuredClone(block) as FooterBlock & {parentId?:string;mobileParentId?:string|null;mobileOrder?:number};
 moved.id=newId;delete moved.parentId;delete moved.mobileParentId;delete moved.mobileOrder;
 nextPage.blocks=nextPage.blocks.filter(b=>b.id!==blockId);next.footerBlocks??=[];next.footerBlocks.push(moved);
 const remap=(id:string)=>id===root?`block:${newId}`:id.replace(prefix,`canvas:layout.block:shared-footer:${newId}:`);
 const chrome:{desktop:CanvasNodeMap;mobile:CanvasNodeMap;mobileInitialized:true}={desktop:resolveCanvasLayout(next,'chrome',false),mobile:resolveCanvasLayout(next,'chrome',true),mobileInitialized:true};
 nextPage.canvasLayout={desktop:{},mobile:{},mobileInitialized:true};
 for(const mode of ['desktop','mobile']as const){
  const source=maps[mode],dest=chrome[mode],order=Math.max(-1,...Object.values(dest).filter(e=>e.parentId==='canvas:layout.site.footer').map(e=>e.order))+1;
  for(const[id,entry]of Object.entries(source))if(!owned.has(id))nextPage.canvasLayout[mode]![id]=structuredClone(entry);else{
   const copy=structuredClone(entry);copy.parentId=id===root?'canvas:layout.site.footer':remap(copy.parentId!);
   if(id===root){copy.order=order;if((mode==='mobile')===mobile)copy.placement=structuredClone(placement);}
   dest[remap(id)]=copy;
  }
 }
 next.chromeLayout=chrome;
 const stylePrefix=`layout.block:${pageId}:${blockId}:`,newStylePrefix=`layout.block:shared-footer:${newId}:`;
 for(const[key,value]of Object.entries(next.contentOverrides?.styles??{}))if(key.startsWith(stylePrefix)){next.contentOverrides!.styles![newStylePrefix+key.slice(stylePrefix.length)]=value;delete next.contentOverrides!.styles![key];}
 const textPrefix=`block:${pageId}:${blockId}:`,newTextPrefix=`block:shared-footer:${newId}:`;
 for(const[key,value]of Object.entries(next.contentOverrides?.inlineStyles??{}))if(key.startsWith(textPrefix)){next.contentOverrides!.inlineStyles![newTextPrefix+key.slice(textPrefix.length)]=value;delete next.contentOverrides!.inlineStyles![key];}
 assertOwnerContent(next);return {content:next,blockId:newId};
}
