import type {OwnerContent} from './model';
import {resolveElementAppearance,setElementAppearanceForLayout} from './appearance';
import {applyInlineTextStyle} from './rich-text';
/** One guarded caller mutation / Undo step. No monetary value, link or other layout changes. */
export function applyAllPriceColors(content:OwnerContent,color:string,mobile=false):boolean{
 if(!/^#[0-9a-f]{6}$/i.test(color))return false;
 const before=JSON.stringify(content.contentOverrides??{}),next=structuredClone(content),page=next.pages.find(p=>p.builtinKey==='prices');
 const targets:[string,number][]=[];
 for(const group of next.prices.groups)for(const item of group.items)targets.push([`layout.price-item:${item.id}:amount`,item.price]);
 for(const kind of ['parts','extras']as const)for(const item of next.prices[kind])targets.push([`layout.price-${kind}:${item.id}:amount`,item.price]);
 for(const item of next.premades)if(item.price!==null)targets.push([`layout.premade:${item.id}:price`,item.price]);
 for(const[key,value]of targets){next.contentOverrides??={};next.contentOverrides.styles??={};const old=next.contentOverrides.styles[key];next.contentOverrides.styles[key]=setElementAppearanceForLayout(old,{...resolveElementAppearance(old,mobile),textColor:color},mobile)!;
  if(page&&key.startsWith('layout.price-'))applyInlineTextStyle(next,page.id,`canvas:${key}`,{start:0,end:String(value).length,value:String(value)},{color},mobile);
 }
 if(JSON.stringify(next.contentOverrides??{})===before)return false;
 content.contentOverrides=next.contentOverrides;return true;
}
