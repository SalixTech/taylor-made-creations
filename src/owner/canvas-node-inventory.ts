import {isSafeImageSource} from './model';
import type {CanvasNodeDescriptor,CanvasContent,CanvasScope} from './canvas-layout';
import {TEXT_FIELDS,LINK_FIELDS,IMAGE_FIELDS,getTemplateText} from './site-design';
import {getOwnerSocialLinks} from './social-links';
import {getHeaderNavigation} from './header-navigation';
import type {OwnerContent} from './model';
import {canvasTargetLabel} from './canvas-target-registry';
/** Layout identity is an entity/semantic slot, not a CSS selector or DOM index. */
export function canvasInstanceId(target:string,ancestors:readonly string[]=[]):string{
 const nearest=(prefix:string)=>[...ancestors].reverse().find(id=>id.startsWith(prefix));
 if(target==='template-text:prices.startingAt'){const owner=nearest('canvas:layout.price-item:');if(owner)return `${target}@price-item:${owner.split(':')[2]}`;}
 if(target==='template-text:prices.exampleLabel'){const owner=nearest('canvas:layout.price-group:');if(owner)return `${target}@price-group:${owner.split(':')[2]}`;}
 if(target==='template-link:examples.pricesLink'){const owner=nearest('canvas:layout.examples.');if(owner)return `${target}@example:${owner.slice('canvas:layout.examples.'.length)}`;}
 return target;
}
export function getCanvasNodes(content:CanvasContent,page:CanvasScope):CanvasNodeDescriptor[]{
 const nodes:CanvasNodeDescriptor[]=[],seen=new Set<string>();
 const add=(id:string,parent:string|null=null,label?:string,styleTarget=id)=>{if(seen.has(id))throw Error(`Duplicate canvas layout identity: ${id}`);seen.add(id);nodes.push({id,styleTarget,defaultParentId:parent,defaultOrder:nodes.length,canContain:true,movable:true,label:label??(id.startsWith('canvas:')?canvasTargetLabel(id.slice(7)):id.replace(/^[^:]+:/,'').replaceAll('.',' '))});return id;};
 const friendly=(key:string)=>{
  const parts=key.split(':'),kind=parts[0],entity=parts[1],part=parts.slice(2).join(' ');
  let name:string|undefined;
  if(kind==='layout.page')name=content.pages.find(p=>p.id===entity)?.title;
  if(kind==='layout.price-group')name=content.prices.groups.find(g=>g.id===entity)?.title;
  if(kind==='layout.price-item')name=content.prices.groups.flatMap(g=>g.items).find(i=>i.id===entity)?.name;
  if(kind==='layout.price-parts'||kind==='layout.price-extras')name=content.prices[kind==='layout.price-parts'?'parts':'extras'].find(i=>i.id===entity)?.name;
  if(kind==='layout.gallery')name=content.gallery.find(p=>p.id===entity)?.name;
  if(kind==='layout.premade')name=content.premades.find(p=>p.id===entity)?.name;
  if(kind==='layout.navigation')name=getHeaderNavigation(content as OwnerContent).main.concat(getHeaderNavigation(content as OwnerContent).more).find(i=>i.id===entity)?.label;
  if(kind==='layout.contact-row')name=getOwnerSocialLinks(content as OwnerContent).find(i=>i.id===entity)?.label;
  if(kind==='layout.block')return `Content ${parts.at(-1)?.replace(/faq-.+-(question|answer)/,'$1').replace(/list-\d+/, 'list item')??'part'}`;
  return name?`${name}${part?' · '+part:''}`:parts.length>1?'Content':canvasTargetLabel(key);
 };
 const canvas=(key:string,parent:string|null=null)=>add(`canvas:${key}`,parent,friendly(key));
 const text=(key:string,parent:string|null)=>add(`template-text:${key}`,parent,TEXT_FIELDS.find(f=>f.key===key)?.label);
 const link=(key:string,parent:string|null)=>add(`template-link:${key}`,parent,LINK_FIELDS.find(f=>f.key===key)?.label);
 const core=(key:string,parent:string|null)=>add(`core-text:${key}`,parent);
 if(page==='chrome'){
  const header=canvas('layout.site.header'),brand=canvas('layout.site.headerBrand',header);void brand;
  text('site.headerTagline',header);const nav=canvas('layout.site.navigation',header);
  const navigation=getHeaderNavigation(content as OwnerContent);for(const item of navigation.main)canvas(`layout.navigation:${item.id}`,nav);if(content.site.moreEnabled&&navigation.more.length){const more=canvas('layout.site.more',nav);for(const item of navigation.more)canvas(`layout.navigation:${item.id}`,more);}
  const footer=canvas('layout.site.footer');canvas('layout.site.footerBrand',footer);text('site.footerTagline',footer);link('site.footerTerms',footer);link('site.footerContact',footer);for(const block of content.footerBlocks??[]){const root=add(`block:${block.id}`,footer,block.type==='link'?block.label:block.type==='heading'?block.text:block.heading||'Footer text');const part=(name:string)=>canvas(`layout.block:shared-footer:${block.id}:${name}`,root);if(block.type==='text'){if(block.heading)part('heading');if(block.body)part('body');}if(block.type==='link')part('link');}for(const node of nodes)if(node.id.startsWith('template-text:')||node.id.startsWith('template-link:'))node.canContain=false;return nodes;
 }
 const key=page.builtinKey, shell=key==='home'?null:canvas(`layout.page:${page.id}:shell`),intro=key==='home'?null:canvas(`layout.page:${page.id}:intro`,shell);
 if(key!=='home'){if(key)text(`${key}.eyebrow`,intro);add('page-title',intro,'Page title');}
 const blocks=(parent:string|null)=>{for(const [blockIndex,block] of page.blocks.entries()){const root=add(`block:${block.id}`,block.parentId?`block:${block.parentId}`:parent,('heading'in block&&block.heading)||('text'in block&&block.text)||`${block.type==='canvas-space'?'Canvas Space':block.type[0].toUpperCase()+block.type.slice(1)} ${blockIndex+1}`);const part=(name:string)=>canvas(`layout.block:${page.id}:${block.id}:${name}`,root);
  if(block.type==='commission-status'){for(const name of ['status-label','status-value','status-note','status-action']){part(name);nodes[nodes.length-1].parentLocked=true;nodes[nodes.length-1].canContain=false;}const action=`canvas:layout.block:${page.id}:${block.id}:status-action`;canvas(`layout.block:${page.id}:${block.id}:status-action-label`,action);nodes[nodes.length-1].movable=false;nodes[nodes.length-1].canContain=false;}
  if(block.type==='feature')part('photo');if('heading'in block&&block.heading&&block.id!=='terms-agreement')part('heading');if(block.type==='feature'||block.type==='text'&&block.id!=='terms-agreement'&&(block.body||key==='suitcare'))part('body');if(block.type==='image')part('photo');if(block.type==='image'&&block.caption)part('caption');if(block.type==='link')part('link');if(block.type==='list')block.items.forEach((_,i)=>{part(`list-${i}`);nodes[nodes.length-1].movable=false;nodes[nodes.length-1].canContain=false;});if(block.type==='faq')for(const item of block.items){for(const name of [`faq-${item.id}-question`,`faq-${item.id}-answer`]){part(name);nodes[nodes.length-1].movable=false;nodes[nodes.length-1].canContain=false;}}
 }};
 if(key==='home'){
  const home=canvas('layout.home.intro');for(const field of ['eyebrow','title','description'])core(`home.${field}`,home);const actions=canvas('layout.home.actions',home);link('home.galleryButton',actions);link('home.pricesButton',actions);
  const image=add('home-image',null,'Main photo + caption');if(content.home.caption.trim())core('home.caption',image);if(getTemplateText(content as OwnerContent,'home.photoCredit').trim())text('home.photoCredit',image);
  const strip=canvas('layout.home.commissionStrip');for(const field of ['stripEyebrow','stripTitle','stripBody'])text(`home.${field}`,strip);link('home.commissionsButton',strip);
  const cards=canvas('layout.home.linkCards');for(const kind of ['prices','care']){const card=link(`home.${kind}Card`,cards);text(`home.${kind}Eyebrow`,card);canvas(`layout.home.${kind}CardTitle`,card);text(`home.${kind}Body`,card);}blocks(null);
 }else if(key==='prices'){
  core('prices.intro',intro);const grid=canvas('layout.prices.grid',shell);
  for(const group of content.prices.groups){const card=canvas(`layout.price-group:${group.id}`,grid);for(const part of ['number','title','note'])canvas(`layout.price-group:${group.id}:${part}`,card);if(content.pages.some(p=>p.builtinKey==='examples'&&!('trashedAt'in p&&p.trashedAt))){const examples=canvas(`layout.price-group:${group.id}:examples`,card);add(`template-text:prices.exampleLabel@price-group:${group.id}`,examples,'Example link label','template-text:prices.exampleLabel');}for(const item of group.items){const row=canvas(`layout.price-item:${item.id}`,card);for(const part of ['name','detail'])canvas(`layout.price-item:${item.id}:${part}`,row);const amount=canvas(`layout.price-item:${item.id}:amount`,row);add(`template-text:prices.startingAt@price-item:${item.id}`,amount,'Starting price label','template-text:prices.startingAt');}}
  for(const kind of ['parts','extras'] as const){const area=canvas(`layout.prices.${kind}`,shell);text(`prices.${kind}Title`,area);for(const item of content.prices[kind]){const row=canvas(`layout.price-${kind}:${item.id}`,area);canvas(`layout.price-${kind}:${item.id}:name`,row);canvas(`layout.price-${kind}:${item.id}:amount`,row);}}
  blocks(shell);const end=canvas('layout.prices.end',shell);text('prices.endTitle',end);text('prices.endBody',end);link('prices.commissionsButton',end);
 }else if(key==='gallery'){
  text('gallery.intro',intro);const grid=canvas('layout.gallery.grid',shell);for(const photo of content.gallery.filter(p=>isSafeImageSource(p.src))){const card=canvas(`layout.gallery:${photo.id}`,grid);canvas(`layout.gallery:${photo.id}:photo`,card);canvas(`layout.gallery:${photo.id}:caption`,card);}if(!content.gallery.some(p=>isSafeImageSource(p.src))){text('gallery.emptyTitle',shell);text('gallery.emptyBody',shell);}blocks(shell);const end=canvas('layout.gallery.end',shell);text('gallery.endTitle',end);link('gallery.commissionsButton',end);
 }else if(key==='premades'){
  const grid=content.premades.length?canvas('layout.premades.grid',shell):shell;for(const item of content.premades){const card=canvas(`layout.premade:${item.id}`,grid);for(const part of ['photo','title','body','tags','purchase'])canvas(`layout.premade:${item.id}:${part}`,card);if(item.price!==null)canvas(`layout.premade:${item.id}:price`,card);}text('premades.intro',intro);if(!content.premades.length){text('premades.emptyTitle',shell);text('premades.emptyBody',shell);link('premades.galleryLink',shell);}blocks(shell);
 }else if(key==='examples'){
  text('examples.intro',intro);for(const kind of ['heads','partials','fullsuits']){const area=canvas(`layout.examples.${kind}`,shell);text(`examples.${kind}Title`,area);add(`template-image:examples.${kind}`,area,IMAGE_FIELDS.find(f=>f.key===`examples.${kind}`)?.label);add(`template-link:examples.pricesLink@example:${kind}`,area,'Prices link','template-link:examples.pricesLink');}blocks(shell);link('examples.galleryButton',shell);
 }else if(key==='commissions'){
  text('commissions.intro',intro);const status=canvas('layout.commissions.status',shell);text('commissions.statusLabel',status);canvas('layout.commissions.statusValue',status);canvas('layout.commissions.statusNote',status);if(content.site.commissionStatus==='Open!'){const request=canvas('layout.commissions.requestButton',status);text('commissions.requestButton',request);}
  const columns=canvas('layout.commissions.columns',shell),steps=canvas('layout.commissions.steps',columns);text('commissions.stepsTitle',steps);for(const [i,name] of ['One','Two','Three'].entries()){const step=canvas(`layout.commissions.step${i+1}`,steps);text(`commissions.step${name}Title`,step);text(`commissions.step${name}Body`,step);if(i===1)link('commissions.pricesLink',step);if(i===2)link('commissions.termsLink',step);}const form=canvas('layout.commissions.form',columns);for(const part of ['Eyebrow','Title','Body'])text(`commissions.form${part}`,form);const button=canvas('layout.commissions.formButton',form);text('commissions.formButton',button);blocks(shell);
 }else if(key==='contact'){
  text('contact.intro',intro);const columns=canvas('layout.contact.columns',shell),details=canvas('layout.contact.details',columns);text('contact.detailsTitle',details);if(content.site.telegram)text('contact.detailsBody',details);const contacts=getOwnerSocialLinks(content as OwnerContent).filter(c=>c.value);for(const contact of contacts){const row=canvas(`layout.contact-row:${contact.id}`,details),label=canvas(`layout.contact-row:${contact.id}:label`,row);canvas(`layout.contact-row:${contact.id}:value`,row);if(!content.site.socialLinks)text(`contact.${contact.id}Label`,label);}const form=canvas('layout.contact.form',columns);for(const field of ['formTitle','nameLabel','emailFieldLabel','messageLabel'])text(`contact.${field}`,form);blocks(shell);
 }else{blocks(shell);if(!page.blocks.length){text('site.emptyTitle',shell);text('site.emptyBody',shell);}}
 for(const node of nodes){
  const parent=nodes.find(p=>p.id===node.defaultParentId);
  if(['template-text:contact.nameLabel','template-text:contact.emailFieldLabel','template-text:contact.messageLabel','template-text:commissions.requestButton','template-text:commissions.formButton'].includes(node.id)||node.id.startsWith('template-text:prices.exampleLabel@')){node.movable=false;node.canContain=false;}
  if(node.id.startsWith('template-link:')&&!['template-link:home.pricesCard','template-link:home.careCard'].includes(node.id))node.canContain=false;
  if(node.id.startsWith('template-text:')||node.id.startsWith('core-text:')||node.id==='page-title'||/:(name|detail|amount|number|title|note|label|value|heading|body|caption|price|tags|purchase|question|answer)$/.test(node.id))node.canContain=false;
  if(parent&&(parent.id.startsWith('template-link:')||/layout\.(contact-row:|navigation:|commissions\.(requestButton|formButton))/.test(parent.id)||parent.id.endsWith(':examples')))node.canContain=false;
  if(node.id.startsWith('template-text:prices.startingAt@'))node.canContain=false;
 }
 return nodes;
}
