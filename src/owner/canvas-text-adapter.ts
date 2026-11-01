import type {OwnerContent,OwnerPage} from './model';
import {TEXT_FIELDS,LINK_FIELDS,getTemplateText,getTemplateLink} from './site-design';
import {templateSupportsInlineLinks} from './inline-links';
import {getInlineTextSource} from './rich-text';
export type CanvasTextField={inputKind?:'money';value:string;label:string;links:boolean;styleKey?:string;appearance:'style'|'page'|'block';blockId?:string;write:(draft:OwnerContent,value:string)=>boolean};
/** Accept exact USD notation; never round invalid precision or coerce empty input. */
export function parseCanvasPrice(value:string):number|null{const text=value.trim();if(!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))return null;const amount=Number(text.replace(/[$,]/g,''));return Number.isFinite(amount)&&amount>=0&&amount<=1_000_000?amount:null;}
/** Explicit model paths only. Never infer writable content from arbitrary DOM text. */
export function canvasTextField(content:OwnerContent,page:OwnerPage,target:string|null):CanvasTextField|null{
 if(!target)return null;
 const field=(value:string,label:string,links:boolean,write:CanvasTextField['write'],styleKey?:string,appearance:CanvasTextField['appearance']='style',blockId?:string):CanvasTextField=>({value,label,links,write,styleKey,appearance,blockId});
 const priceTarget=target.match(/^canvas:layout\.price-(group|item|parts|extras):([^:]+):(title|note|name|detail|amount)$/);
 if(priceTarget){
  if(page.builtinKey!=='prices')return null;
  const [,family,id,property]=priceTarget;
  const locate=(draft:OwnerContent)=>family==='group'?draft.prices.groups.find(item=>item.id===id):family==='item'?draft.prices.groups.flatMap(group=>group.items).find(item=>item.id===id):draft.prices[family as 'parts'|'extras'].find(item=>item.id===id);
  const record=locate(content);if(!record)return null;const key=property==='amount'?'price':property;if(!(key in record))return null;
  const current=(record as unknown as Record<string,unknown>)[key];
  if(property==='amount'&&typeof current==='number')return {...field(String(current),'Price in USD',false,(draft,value)=>{const amount=parseCanvasPrice(value),record=locate(draft);if(amount===null||!record||!('price'in record))return false;record.price=amount;return true;},target.slice(7)),inputKind:'money'};
  if(typeof current!=='string')return null;
  const max=family==='group'?(property==='title'?120:500):property==='name'?150:1000,required=property==='title'||property==='name';
  return field(current,`Price ${property}`,false,(draft,value)=>{const record=locate(draft);if(!record||value.length>max||(required&&!value.trim()))return false;(record as unknown as Record<string,unknown>)[key]=value;return true;},target.slice(7));
 }
 if(target==='page-title')return field(page.title,'Page title',getInlineTextSource(content,`page:${page.id}:title`)?.links??true,(draft,value)=>{const p=draft.pages.find(p=>p.id===page.id);if(!p)return false;p.title=value;return true;},undefined,'page');
 if(target.startsWith('core-text:')){const key=target.slice(10);if(['home.title','home.eyebrow','home.description','home.caption'].includes(key)){const property=key.slice(5) as 'title'|'eyebrow'|'description'|'caption';return field(content.home[property],property,true,(draft,value)=>{draft.home[property]=value;return true;},key);}if(key==='prices.intro')return field(content.prices.intro,'Prices introduction',true,(draft,value)=>{draft.prices.intro=value;return true;},key);}
 if(target.startsWith('template-text:')){const key=target.slice(14),entry=TEXT_FIELDS.find(f=>f.key===key);if(!entry||/\{[^}]+\}/.test(getTemplateText(content,key)))return null;return field(getTemplateText(content,key),entry.label,getInlineTextSource(content,`template:${key}`)?.links??templateSupportsInlineLinks(key),(draft,value)=>{draft.contentOverrides??={};draft.contentOverrides.text??={};draft.contentOverrides.text[key]=value;return true;},key);}
 const linkKey=target.startsWith('template-link:')?target.slice(14):target==='canvas:layout.home.pricesCardTitle'?'home.pricesCard':target==='canvas:layout.home.careCardTitle'?'home.careCard':null;
 if(target.startsWith('template-link:')&&['home.pricesCard','home.careCard'].includes(linkKey??''))return null;
 if(linkKey&&LINK_FIELDS.some(f=>f.key===linkKey)){const link=getTemplateLink(content,linkKey);return field(link.label,'Button text',false,(draft,value)=>{draft.contentOverrides??={};draft.contentOverrides.links??={};draft.contentOverrides.links[linkKey]={...getTemplateLink(draft,linkKey),label:value};return true;},target.startsWith('canvas:')?target.slice(7):linkKey);}
 const match=target.match(/^canvas:layout\.block:([^:]+):([^:]+):(heading|body|caption|link|status-label|status-note|status-action|status-action-label)$/),id=match?.[2]??(target.startsWith('block:')?target.slice(6):null),footer=id?content.footerBlocks?.find(b=>b.id===id):undefined,block=footer??(id?page.blocks.find(b=>b.id===id):undefined);
 if(!block||match&&match[1]!==page.id&&!(footer&&match[1]==='shared-footer'))return null;
 const statusProperty=block.type==='commission-status'?({'status-label':'label','status-note':'note','status-action':'actionLabel','status-action-label':'actionLabel'} as Record<string,string>)[match?.[3]??'']:undefined;
 const property=statusProperty??(match?.[3]==='link'&&block.type==='link'?'label':match?.[3]??(block.type==='heading'?'text':block.type==='link'?'label':null));
 if(!property||!(property in block)||typeof (block as unknown as Record<string,unknown>)[property]!=='string')return null;
 const links=['body','caption','heading','text','note'].includes(property),key=match?target.slice(7):undefined;
 return field((block as unknown as Record<string,string>)[property],property,links,(draft,value)=>{const current=footer?draft.footerBlocks?.find(b=>b.id===id):draft.pages.find(p=>p.id===page.id)?.blocks.find(b=>b.id===id);if(!current||current.type!==block.type||!(property in current))return false;(current as unknown as Record<string,unknown>)[property]=value;return true;},key,key?'style':'block',id??undefined);
}
export function changeCanvasText(content:OwnerContent,pageId:string,target:string,expected:string,value:string):boolean{const shared=pageId==='shared-footer'&&(target.startsWith('canvas:layout.block:shared-footer:')||target.startsWith('block:')&&content.footerBlocks?.some(b=>target===`block:${b.id}`)),page=content.pages.find(p=>p.id===pageId)??(shared?content.pages[0]:undefined),field=page&&canvasTextField(content,page,target);return !!field&&field.value===expected&&field.write(content,value);}
