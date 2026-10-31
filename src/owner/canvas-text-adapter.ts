import type {OwnerContent,OwnerPage} from './model';
import {TEXT_FIELDS,LINK_FIELDS,getTemplateText,getTemplateLink} from './site-design';
import {templateSupportsInlineLinks} from './inline-links';
export type CanvasTextField={value:string;label:string;links:boolean;styleKey?:string;appearance:'style'|'page'|'block';blockId?:string;write:(draft:OwnerContent,value:string)=>boolean};
/** Explicit model paths only. Never infer writable content from arbitrary DOM text. */
export function canvasTextField(content:OwnerContent,page:OwnerPage,target:string|null):CanvasTextField|null{
 if(!target)return null;
 const field=(value:string,label:string,links:boolean,write:CanvasTextField['write'],styleKey?:string,appearance:CanvasTextField['appearance']='style',blockId?:string):CanvasTextField=>({value,label,links,write,styleKey,appearance,blockId});
 if(target==='page-title')return field(page.title,'Page title',false,(draft,value)=>{const p=draft.pages.find(p=>p.id===page.id);if(!p)return false;p.title=value;return true;},undefined,'page');
 if(target.startsWith('core-text:')){const key=target.slice(10);if(['home.title','home.eyebrow','home.description','home.caption'].includes(key)){const property=key.slice(5) as 'title'|'eyebrow'|'description'|'caption';return field(content.home[property],property,true,(draft,value)=>{draft.home[property]=value;return true;},key);}if(key==='prices.intro')return field(content.prices.intro,'Prices introduction',true,(draft,value)=>{draft.prices.intro=value;return true;},key);}
 if(target.startsWith('template-text:')){const key=target.slice(14),entry=TEXT_FIELDS.find(f=>f.key===key);if(!entry||/\{[^}]+\}/.test(getTemplateText(content,key)))return null;return field(getTemplateText(content,key),entry.label,templateSupportsInlineLinks(key),(draft,value)=>{draft.contentOverrides??={};draft.contentOverrides.text??={};draft.contentOverrides.text[key]=value;return true;},key);}
 const linkKey=target.startsWith('template-link:')?target.slice(14):target==='canvas:layout.home.pricesCardTitle'?'home.pricesCard':target==='canvas:layout.home.careCardTitle'?'home.careCard':null;
 if(target.startsWith('template-link:')&&['home.pricesCard','home.careCard'].includes(linkKey??''))return null;
 if(linkKey&&LINK_FIELDS.some(f=>f.key===linkKey)){const link=getTemplateLink(content,linkKey);return field(link.label,'Button text',false,(draft,value)=>{draft.contentOverrides??={};draft.contentOverrides.links??={};draft.contentOverrides.links[linkKey]={...getTemplateLink(draft,linkKey),label:value};return true;},target.startsWith('canvas:')?target.slice(7):linkKey);}
 const match=target.match(/^canvas:layout\.block:([^:]+):([^:]+):(heading|body|caption)$/),id=match?.[2]??(target.startsWith('block:')?target.slice(6):null),block=id?page.blocks.find(b=>b.id===id):undefined;
 if(!block||match&&match[1]!==page.id)return null;
 const property=match?.[3]??(block.type==='heading'?'text':null);
 if(!property||!(property in block)||typeof (block as unknown as Record<string,unknown>)[property]!=='string')return null;
 const links=['body','caption','heading','text'].includes(property),key=match?target.slice(7):undefined;
 return field((block as unknown as Record<string,string>)[property],property,links,(draft,value)=>{const current=draft.pages.find(p=>p.id===page.id)?.blocks.find(b=>b.id===id);if(!current||current.type!==block.type||!(property in current))return false;(current as unknown as Record<string,unknown>)[property]=value;return true;},key,key?'style':'block',id??undefined);
}
export function changeCanvasText(content:OwnerContent,pageId:string,target:string,expected:string,value:string):boolean{const page=content.pages.find(p=>p.id===pageId),field=page&&canvasTextField(content,page,target);return !!field&&field.value===expected&&field.write(content,value);}
