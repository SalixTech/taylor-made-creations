import type {OwnerContent,PublicOwnerContent,OwnerPage} from './model';
import {getOwnerSocialLinks} from './social-links';
type Content=OwnerContent|PublicOwnerContent;
export type AuthorTextField={id:string;value:string;label:string;links:boolean;max:number;required:boolean;write:(draft:OwnerContent,value:string)=>boolean};
/** Finite semantic fields only: selection metadata is never a property path. */
export function authorTextField(content:Content,page:OwnerPage|PublicOwnerContent['pages'][number],target:string):AuthorTextField|null{
 const make=(key:string,value:string,label:string,max:number,required:boolean,write:AuthorTextField['write'],links=false):AuthorTextField=>({id:`author:${key}`,value,label,max,required,links,write:(draft,next)=>next.length<=max&&(!required||!!next.trim())&&write(draft,next)});
 if(['site','core-text:site.brand','canvas:layout.site.headerBrand','canvas:layout.site.footerBrand'].includes(target))return make('site:name',content.site.name,'Business name',120,true,(d,v)=>{d.site.name=v;return true;});
 if(target==='canvas:layout.commissions.statusNote')return make('site:statusNote',content.site.statusNote,'Commission status note',1000,false,(d,v)=>{d.site.statusNote=v;return true;},true);
 const nav=/^(?:canvas:layout\.navigation:|nav:)([^:]+)$/.exec(target);
 if(nav){const p=content.pages.find(p=>p.id===nav[1]);if(!p)return null;return make(`navigation:${p.id}`,p.navLabel==='Terms of service'&&p.builtinKey==='terms'?'TOS':p.navLabel,'Navigation label',80,true,(d,v)=>{const p=d.pages.find(p=>p.id===nav[1]);if(!p)return false;p.navLabel=v;return true;});}
 const gallery=/^canvas:layout\.gallery:([^:]+):(caption|name)$/.exec(target);
 if(gallery&&page.builtinKey==='gallery'){const item=content.gallery.find(p=>p.id===gallery[1]);if(!item)return null;if(gallery[2]==='name')return make(`galleryName:${item.id}`,item.name,'Gallery name',150,true,(d,v)=>{const p=d.gallery.find(p=>p.id===item.id);if(!p)return false;p.name=v;return true;});return make(`gallery:${item.id}`,item.displayNumber?.trim()||String(content.gallery.length-content.gallery.findIndex(p=>p.id===item.id)).padStart(2,'0'),'Gallery display number',24,false,(d,v)=>{const p=d.gallery.find(p=>p.id===item.id);if(!p)return false;p.displayNumber=v;return true;});}
 const photoCaption=/^canvas:layout\.premade:([^:]+):photo-caption:([^:]+)$/.exec(target);if(photoCaption&&page.builtinKey==='premades'){const item=content.premades.find(i=>i.id===photoCaption[1]),photo=item?.photos?.find(p=>p.id===photoCaption[2]),legacy=item&&!item.photos?.length&&photoCaption[2]===(`legacy-${item.id}`.length<=96?`legacy-${item.id}`:'legacy-photo');if(!item||!photo&&!legacy)return null;return make(`premadePhoto:${item.id}:${photoCaption[2]}`,photo?.alt??item.alt,'Photo description',500,true,(d,v)=>{const i=d.premades.find(i=>i.id===item.id);if(!i)return false;const p=i.photos?.find(p=>p.id===photoCaption[2]);if(p){p.alt=v;if(i.coverPhotoId===p.id)i.alt=v;}else if(!i.photos?.length&&legacy)i.alt=v;else return false;return true;});}
 const tag=/^canvas:layout\.premade:([^:]+):tag-(\d+)$/.exec(target);
 if(tag&&page.builtinKey==='premades'){const item=content.premades.find(p=>p.id===tag[1]),index=Number(tag[2]);if(!item||!Number.isSafeInteger(index))return null;const values=item.tags??(item.badge?.trim()?[item.badge]:[]);if(index>=values.length)return null;return make(`premadeTag:${item.id}:${index}`,values[index],'Listing tag',80,true,(d,v)=>{const p=d.premades.find(p=>p.id===item.id);if(!p)return false;if(p.tags){if(index>=p.tags.length||v!==v.trim()||v.includes(',')||p.tags.some((tag,i)=>i!==index&&tag.toLocaleLowerCase('en-US')===v.toLocaleLowerCase('en-US')))return false;p.tags[index]=v;}else{if(index!==0)return false;p.badge=v;}return true;});}
 const premade=/^canvas:layout\.premade:([^:]+):(title|body)$/.exec(target);
 if(premade&&page.builtinKey==='premades'){const item=content.premades.find(p=>p.id===premade[1]),prop=premade[2]==='title'?'name':'description';if(!item)return null;return make(`premade:${item.id}:${prop}`,item[prop],prop==='name'?'Listing title':'Listing description',prop==='name'?150:5000,prop==='name',(d,v)=>{const p=d.premades.find(p=>p.id===item.id);if(!p)return false;p[prop]=v;return true;},prop==='description');}
 const contact=/^canvas:layout\.contact-row:([^:]+):(label|value)$/.exec(target);
 if(contact&&page.builtinKey==='contact'){const row=getOwnerSocialLinks(content as OwnerContent).find(r=>r.id===contact[1]),prop=contact[2] as 'label'|'value';if(!row)return null;return make(`contact:${row.id}:${prop}`,row[prop],`Contact ${prop}`,prop==='label'?80:254,true,(d,v)=>{d.site.socialLinks??=getOwnerSocialLinks(d);const r=d.site.socialLinks.find(r=>r.id===row.id);if(!r)return false;r[prop]=v;return true;});}
 const nested=/^canvas:layout\.block:([^:]+):([^:]+):(list-(\d+)|faq-(.+)-(question|answer))$/.exec(target);
 if(nested){const[,scope,id,part,index,faqId,property]=nested;if(scope!==page.id&&scope!=='shared-footer')return null;const block=(scope==='shared-footer'?content.footerBlocks:page.blocks)?.find(b=>b.id===id);if(!block)return null;
  if(block.type==='list'&&index!==undefined){const i=Number(index);if(!Number.isSafeInteger(i)||i<0||i>=block.items.length)return null;return make(`block:${scope}:${id}:${part}`,block.items[i],'List item',2000,true,(d,v)=>{const b=(scope==='shared-footer'?d.footerBlocks:d.pages.find(p=>p.id===scope)?.blocks)?.find(b=>b.id===id);if(b?.type!=='list'||i>=b.items.length)return false;b.items[i]=v;return true;},true);}
  if(block.type==='faq'&&faqId&&['question','answer'].includes(property)){const prop=property as 'question'|'answer',item=block.items.find(i=>i.id===faqId);if(!item)return null;return make(`block:${scope}:${id}:${part}`,item[prop],`FAQ ${prop}`,prop==='question'?200:10000,prop==='question',(d,v)=>{const b=(scope==='shared-footer'?d.footerBlocks:d.pages.find(p=>p.id===scope)?.blocks)?.find(b=>b.id===id),item=b?.type==='faq'?b.items.find(i=>i.id===faqId):null;if(!item)return false;item[prop]=v;return true;},true);}
 }
 return null;
}
export function authorTextSource(content:Content,id:string):AuthorTextField|null{
 if(!id.startsWith('author:'))return null;const key=id.slice(7),parts=key.split(':');let target:string|undefined,page=content.pages[0];
 if(key==='site:name')target='site';else if(key==='site:statusNote')target='canvas:layout.commissions.statusNote';
 else if(parts[0]==='navigation'&&parts.length===2)target=`nav:${parts[1]}`;
 else if(parts[0]==='galleryName'&&parts.length===2){target=`canvas:layout.gallery:${parts[1]}:name`;page=content.pages.find(p=>p.builtinKey==='gallery')!;}
 else if(parts[0]==='gallery'&&parts.length===2){target=`canvas:layout.gallery:${parts[1]}:caption`;page=content.pages.find(p=>p.builtinKey==='gallery')!;}
 else if(parts[0]==='premadePhoto'&&parts.length===3){target=`canvas:layout.premade:${parts[1]}:photo-caption:${parts[2]}`;page=content.pages.find(p=>p.builtinKey==='premades')!;}
 else if(parts[0]==='premadeTag'&&parts.length===3){target=`canvas:layout.premade:${parts[1]}:tag-${parts[2]}`;page=content.pages.find(p=>p.builtinKey==='premades')!;}
 else if(parts[0]==='premade'&&parts.length===3&&['name','description'].includes(parts[2])){target=`canvas:layout.premade:${parts[1]}:${parts[2]==='name'?'title':'body'}`;page=content.pages.find(p=>p.builtinKey==='premades')!;}
 else if(parts[0]==='contact'&&parts.length===3){target=`canvas:layout.contact-row:${parts[1]}:${parts[2]}`;page=content.pages.find(p=>p.builtinKey==='contact')!;}
 else if(parts[0]==='block'&&parts.length===4){target=`canvas:layout.${key}`;page=parts[1]==='shared-footer'?content.pages[0]:content.pages.find(p=>p.id===parts[1])!;}
 const result=page&&target?authorTextField(content,page,target):null;return result?.id===id?result:null;
}
