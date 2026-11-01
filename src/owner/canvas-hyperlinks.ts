import {isSafeLink,type OwnerContent,type PublicOwnerContent,type OwnerPage} from './model';
import {TEXT_FIELDS,IMAGE_FIELDS,LINK_FIELDS,getTemplateLink} from './site-design';
import {getInlineTextId,getInlineTextSource} from './rich-text';
import {getOwnerSocialLinks} from './social-links';
import {resolveCanvasLayout,getCanvasNodes} from './canvas-layout';
import {templateSupportsInlineLinks} from './inline-links';
import {getHeaderNavigation} from './header-navigation';
import {canvasStyleKeyIsPublic} from './canvas-target-registry';

type Content=OwnerContent|PublicOwnerContent;
export type CanvasHyperlinkTarget={kind:'inline';textId:string}|{kind:'destination';key:string;href:string;defaultHref?:string;source:'template'|'block'|'social'|'element'};
const active=(c:Content,key:string)=>key==='site'||c.pages.some(p=>p.builtinKey===key&&!( 'trashedAt'in p&&p.trashedAt)&&p.availability!=='hidden');
/** Semantic identities only. Arbitrary selectors, structural containers and form controls cannot become links. */
export function isElementLinkKey(c:Content,key:string):boolean{try{return knownElementLinkKey(c,key);}catch{return false;}}
function knownElementLinkKey(c:Content,key:string):boolean{
 if(!c||!Array.isArray(c.pages)||!Array.isArray(c.gallery)||!Array.isArray(c.premades)||!c.prices||!Array.isArray(c.prices.groups)||!Array.isArray(c.prices.parts)||!Array.isArray(c.prices.extras)||typeof key!=='string'||key.length>320)return false;
 if(key==='site.brand')return true;
 if(key==='home.image')return c.pages.some(p=>p.builtinKey==='home');
 if(IMAGE_FIELDS.some(f=>f.key===key&&key!=='site.logo'))return true;
 if(key.startsWith('template:'))return TEXT_FIELDS.some(f=>`template:${f.key}`===key&&templateSupportsInlineLinks(f.key));
 if(/^core:(home\.(title|eyebrow|description|caption)|prices\.intro)$/.test(key))return true;
 const title=/^page:([^:]+):title$/.exec(key);if(title)return c.pages.some(p=>p.id===title[1]);
 const block=/^layout\.block:([^:]+):([^:]+):(.+)$/.exec(key);
 if(block){const b=(block[1]==='shared-footer'?c.footerBlocks:c.pages.find(p=>p.id===block[1])?.blocks)?.find(b=>b.id===block[2]);if(!b)return false;const part=block[3];if(part==='photo')return b.type==='image'||b.type==='feature';if(part==='heading')return 'heading'in b;if(part==='body')return b.type==='text'||b.type==='feature';if(part==='caption')return b.type==='image';if(part==='text')return b.type==='heading';if(part==='status-value'||part==='status-label'||part==='status-note'||part==='status-action')return b.type==='commission-status';if(/^list-\d+$/.test(part))return b.type==='list'&&Number(part.slice(5))<b.items.length;if(/^faq-.+-(question|answer)$/.test(part))return b.type==='faq'&&b.items.some(i=>part===`faq-${i.id}-question`||part===`faq-${i.id}-answer`);return false;}
 const gallery=/^layout\.gallery:([^:]+):(photo|caption)$/.exec(key);if(gallery)return c.gallery.some(p=>p.id===gallery[1]);
 const premade=/^layout\.premade:([^:]+):(destination|body|price|tags)$/.exec(key);if(premade)return c.premades.some(p=>p.id===premade[1]);
 const price=/^layout\.price-(group|item|parts|extras):([^:]+):(number|title|note|name|detail|amount|examples)$/.exec(key);if(price){const[,family,id,part]=price;return family==='group'?['number','title','note','examples'].includes(part)&&c.prices.groups.some(g=>g.id===id):family==='item'?['name','detail','amount'].includes(part)&&c.prices.groups.some(g=>g.items.some(i=>i.id===id)):['name','amount'].includes(part)&&c.prices[family as 'parts'|'extras'].some(i=>i.id===id);}
 const nav=/^layout\.navigation:([^:]+)$/.exec(key);if(nav)return nav[1]==='trello-board'||c.pages.some(p=>p.id===nav[1]);
 return ['layout.commissions.statusValue','layout.commissions.statusNote','layout.commissions.requestButton','layout.commissions.formButton'].includes(key);
}
export function elementLinkKeyIsPublic(c:Content,key:string):boolean{
 if(!isElementLinkKey(c,key))return false;
 if(key==='site.brand')return true;
 if(key.startsWith('template:'))return active(c,TEXT_FIELDS.find(f=>`template:${f.key}`===key)!.group);
 if(key.startsWith('core:'))return active(c,key.slice(5).split('.')[0]);
 if(key.startsWith('page:'))return c.pages.some(p=>`page:${p.id}:title`===key&&!( 'trashedAt'in p&&p.trashedAt)&&p.availability!=='hidden');
 if(key==='home.image'||IMAGE_FIELDS.some(f=>f.key===key))return active(c,key.split('.')[0]);
 const premade=/^layout\.premade:([^:]+):destination$/.exec(key);if(premade)return canvasStyleKeyIsPublic(`layout.premade:${premade[1]}:photo`,c);
 const heading=/^(layout\.block:[^:]+:[^:]+):text$/.exec(key);if(heading)return canvasStyleKeyIsPublic(`${heading[1]}:heading`,c);
 return canvasStyleKeyIsPublic(key,c);
}
export function getElementHref(c:Content,key:string,fallback?:string):string|undefined{const href=c.contentOverrides?.elementLinks?.[key];return typeof href==='string'&&isSafeLink(href)&&isElementLinkKey(c,key)?href:fallback;}
/** Canonical containing-item identity is shared by its text, artwork and photo children. */
export function getCanvasHyperlinkKey(c:OwnerContent,page:OwnerPage,target:string,instanceId?:string,mobile=false):string{
 const instance=instanceId??target,key=target.replace(/^canvas:/,'');
 // Scene ancestry, not visual placement or DOM order, owns an existing link.
 // Respect the independently authored mobile parent graph.
 const scope=getCanvasNodes(c,'chrome').some(n=>n.id===instance)?'chrome':page;
 const map=resolveCanvasLayout(c,scope,mobile),seen=new Set<string>();let parent=map[instance]?.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);if(parent.startsWith('template-link:'))return parent;if(/^canvas:layout\.navigation:/.test(parent))return parent.slice(7);if(parent==='canvas:layout.site.headerBrand'||parent==='canvas:layout.site.footerBrand')return 'site.brand';const b=/^block:(.+)$/.exec(parent);if(b){const found=page.blocks.find(x=>x.id===b[1])??c.footerBlocks?.find(x=>x.id===b[1]);if(found?.type==='link')return `layout.block:${c.footerBlocks?.some(x=>x===found)?'shared-footer':page.id}:${found.id}:link`;}parent=map[parent]?.parentId;}

 if(target==='home-image')return 'home.image';
 const action=/^template-text:commissions\.(requestButton|formButton)$/.exec(target);if(action)return `layout.commissions.${action[1]}`;
 if(/^layout\.block:[^:]+:[^:]+:status-action-label$/.test(key))return key.replace(/:status-action-label$/,':status-action');
 if(target==='status'||key==='layout.commissions.status')return 'layout.commissions.statusValue';
 if(target.startsWith('nav:'))return `layout.navigation:${target.slice(4)}`;
 if(target==='site'||target==='template-image:site.logo'||key==='layout.site.headerBrand'||key==='layout.site.footerBrand'||target==='core-text:site.brand')return 'site.brand';
 if(target.startsWith('template-image:'))return target.slice(15);
 const home=/^(?:template-text:home\.(prices|care)(?:Eyebrow|Body)|canvas:layout\.home\.(prices|care)CardTitle)$/.exec(target);if(home)return `template-link:home.${home[1]??home[2]}Card`;
 if(target==='template-text:prices.exampleLabel'&&instance.includes('@price-group:'))return `layout.price-group:${instance.split('@price-group:')[1]}:examples`;
 const contact=/^(?:canvas:)?layout\.contact-row:([^:]+)(?::(?:label|value))?$/.exec(target);if(contact)return `social:${contact[1]}`;
 const legacy=/^template-text:contact\.(telegram|discord|tiktok|twitch|email)Label$/.exec(target);if(legacy)return `social:${legacy[1]}`;
 const premade=/^layout\.premade:([^:]+):(photo|title|purchase)$/.exec(key);if(premade)return `layout.premade:${premade[1]}:destination`;
 if(target.startsWith('gallery:'))return `layout.gallery:${target.slice(8)}:photo`;
 if(target.startsWith('premade:'))return `layout.premade:${target.slice(8)}:destination`;
 if(target==='page-title')return `page:${page.id}:title`;
 if(target.startsWith('core-text:'))return `core:${target.slice(10)}`;
 if(target.startsWith('template-text:'))return `template:${target.slice(14)}`;
 if(target.startsWith('block:')){const id=target.slice(6),footer=c.footerBlocks?.find(b=>b.id===id),b=footer??page.blocks.find(b=>b.id===id);if(b)return `layout.block:${footer?'shared-footer':page.id}:${id}:${b.type==='link'?'link':b.type==='heading'?'text':b.type==='commission-status'?'status-value':b.type==='image'||b.type==='feature'?'photo':'heading'}`;}
 return key;
}
export function canvasHyperlinkTarget(c:OwnerContent,page:OwnerPage,target:string|null,instanceId?:string,mobile=false):CanvasHyperlinkTarget|null{
 if(!target)return null;
 const key=getCanvasHyperlinkKey(c,page,target,instanceId,mobile);
 const scoped=/^layout\.block:([^:]+):/.exec(key);if(scoped&&scoped[1]!==page.id&&scoped[1]!=='shared-footer')return null;
 if(/^layout\.price-/.test(key)&&page.builtinKey!=='prices')return null;
 if(key.startsWith('template-link:')){const id=key.slice(14);if(!LINK_FIELDS.some(f=>f.key===id))return null;return{kind:'destination',key,href:getTemplateLink(c,id).href,source:'template'};}
 const link=/^layout\.block:([^:]+):([^:]+):link$/.exec(key);if(link){const b=(link[1]==='shared-footer'?c.footerBlocks:c.pages.find(p=>p.id===link[1])?.blocks)?.find(b=>b.id===link[2]);return b?.type==='link'?{kind:'destination',key,href:b.href,source:'block'}:null;}
 if(key.startsWith('social:')){const row=getOwnerSocialLinks(c).find(r=>r.id===key.slice(7));return row?{kind:'destination',key,href:row.url??'',source:'social'}:null;}
 // Real containing links take precedence over a child text field.
 const textId=getInlineTextId(c,page.id,target),source=textId?getInlineTextSource(c,textId):null;
 if(textId&&source?.links)return {kind:'inline',textId};
 if(!isElementLinkKey(c,key))return null;
 let defaultHref:string|undefined;
 if(key==='site.brand')defaultHref='/';
 if(['layout.commissions.requestButton','layout.commissions.formButton'].includes(key)||/^layout\.block:[^:]+:[^:]+:status-action$/.test(key)){const request=c.pages.find(p=>p.builtinKey==='commissions'&&!p.trashedAt&&p.availability!=='hidden');if(request)defaultHref=`/${encodeURIComponent(request.slug)}/request`;}
 const listing=/^layout\.premade:([^:]+):destination$/.exec(key);if(listing){const item=c.premades.find(i=>i.id===listing[1]),p=c.pages.find(p=>p.builtinKey==='premades'&&!p.trashedAt);if(item&&p)defaultHref=!c.site.catalogMode&&item.soldChannel==='third-party'&&item.externalUrl&&isSafeLink(item.externalUrl)?item.externalUrl:`/${p.slug}/${encodeURIComponent(item.id)}`;}
 if(key.startsWith('layout.navigation:'))defaultHref=[...getHeaderNavigation(c).main,...getHeaderNavigation(c).more].find(n=>`layout.navigation:${n.id}`===key)?.href;
 const examples=/^layout\.price-group:([^:]+):examples$/.exec(key);if(examples){const p=c.pages.find(p=>p.builtinKey==='examples'&&!p.trashedAt),g=c.prices.groups.find(g=>g.id===examples[1]);if(p&&g)defaultHref=`/${p.slug}#${encodeURIComponent(g.title.toLowerCase())}`;}
 return{kind:'destination',key,href:getElementHref(c,key,defaultHref)??'',defaultHref,source:'element'};
}
/** Destination-only mutations. Inline range editing remains in the linked-text editor. */
export function applyCanvasHyperlink(c:OwnerContent,pageId:string,target:string,href:string|null,instanceId?:string,mobile=false):boolean{
 const page=c.pages.find(p=>p.id===pageId);if(!page||href!==null&&!isSafeLink(href))return false;
 const dest=canvasHyperlinkTarget(c,page,target,instanceId,mobile);if(!dest||dest.kind!=='destination')return false;
 if(dest.source==='template'){const id=dest.key.slice(14);c.contentOverrides??={};c.contentOverrides.links??={};if(href===null){const original=LINK_FIELDS.find(f=>f.key===id)!;c.contentOverrides.links[id]={...getTemplateLink(c,id),href:original.defaultValue.href};}else c.contentOverrides.links[id]={...getTemplateLink(c,id),href};return true;}
 if(dest.source==='block'){if(href===null)return false;const[,scope,id]=/^layout\.block:([^:]+):([^:]+):link$/.exec(dest.key)!;const b=(scope==='shared-footer'?c.footerBlocks:c.pages.find(p=>p.id===scope)?.blocks)?.find(b=>b.id===id);if(b?.type!=='link')return false;b.href=href;return true;}
 if(dest.source==='social'){if(href!==null&&!/^(https:\/\/|mailto:)/i.test(href))return false;c.site.socialLinks??=getOwnerSocialLinks(c);const row=c.site.socialLinks.find(r=>r.id===dest.key.slice(7));if(!row)return false;row.url=href??'';return true;}
 c.contentOverrides??={};c.contentOverrides.elementLinks??={};if(href===null)delete c.contentOverrides.elementLinks[dest.key];else c.contentOverrides.elementLinks[dest.key]=href;return true;
}
export function pruneElementLinks(c:OwnerContent):void{if(c.contentOverrides?.elementLinks)for(const key of Object.keys(c.contentOverrides.elementLinks))if(!isElementLinkKey(c,key))delete c.contentOverrides.elementLinks[key];}
/** Called after copy has installed entities: maps exact identity segments, never URL text. */
export function remapElementLinks(c:OwnerContent,source:Record<string,string>|undefined,idMap:Record<string,string>):void{if(!source)return;for(const[key,href]of Object.entries(source)){const parts=key.split(':');let changed=false;const next=parts.map(p=>Object.hasOwn(idMap,p)?(changed=true,idMap[p]):p).join(':');if(changed&&isElementLinkKey(c,next)){c.contentOverrides??={};c.contentOverrides.elementLinks??={};c.contentOverrides.elementLinks[next]=href;}}}
