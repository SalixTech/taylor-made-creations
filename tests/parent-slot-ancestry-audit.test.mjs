// Real React SSR of storefront components, not a browser visual test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {sourceLoader,root} from './scout-source-loader.mjs';
const overrides={'next/image':{__esModule:true,default:({unoptimized,priority,fill,...props})=>{void unoptimized;void priority;void fill;return React.createElement('img',props);}},'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},'@/owner/media-client':{useOwnerMediaSource:src=>({src}),useOwnerMediaSources:()=>({})},'./SiteFontLoader':{SiteFontLoader:()=>null},'@/components/CommissionForm':{CommissionForm:()=>null}};
function css(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())css(p);else if(/\.tsx?$/.test(p))for(const match of readFileSync(p,'utf8').matchAll(/from\s+["']([^"']+\.css)["']/g))overrides[match[1]]={__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};}}css(join(root,'src'));
const load=sourceLoader(overrides),defaults=load('src/owner/defaults.ts'),graph=load('src/owner/canvas-layout.ts'),model=load('src/owner/model.ts'),{ContentPage}=load('src/components/SiteContent.tsx');
const render=(content,page,extra={})=>renderToStaticMarkup(React.createElement(ContentPage,{content,page,mode:'editor',editable:true,...extra}));
// Parse actual generated tag ancestry, not a regex that can span siblings.
function nodes(html){const stack=[],out=[];for(const m of html.matchAll(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g)){const tag=m[1],close=m[0][1]==='/';if(close){let at=stack.length-1;while(at>=0&&stack[at].tag!==tag)at--;if(at>=0)stack.length=at;continue;}const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]));const node={tag,attrs,ancestors:[...stack]};out.push(node);if(!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)&&!m[0].endsWith('/>'))stack.push(node);}return out;}

// Independent audit regression: saved sibling order must move semantic envelopes,
// never inject a heading into an eyebrow span or nest interactive elements.
test('audit: every home card sibling permutation preserves valid semantic ancestry',()=>{
 const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 for(const card of ['prices','care'])for(const order of permutations){
  const c=defaults.createDefaultOwnerContent(),p=c.pages.find(page=>page.builtinKey==='home');graph.initializeCanvasMobileLayouts(c);
  const ids=[`template-text:home.${card}Eyebrow`,`canvas:layout.home.${card}CardTitle`,`template-text:home.${card}Body`];
  ids.forEach((id,index)=>{p.canvasLayout.desktop[id].order=order[index];});
  assert.equal(model.validateOwnerContent(c).valid,true);
  const actual=nodes(render(c,p));
  for(const node of actual){
   if(['h1','h2','h3','h4','h5','h6','p','div','section'].includes(node.tag))assert.ok(!node.ancestors.some(a=>['span','p','strong','small'].includes(a.tag)),`${card}/${order}: ${node.tag} inside ${node.ancestors.map(a=>a.tag).join('>')}`);
   if(node.tag==='a')assert.ok(!node.ancestors.some(a=>a.tag==='a'),`${card}/${order}: nested anchors`);
   if(node.tag==='button')assert.ok(!node.ancestors.some(a=>['a','button'].includes(a.tag)),`${card}/${order}: nested interactive controls`);
  }
 }
});

test('audit: detached image caption keeps a valid figure envelope',()=>{
 const c=defaults.createDefaultOwnerContent(),p=c.pages.find(page=>page.builtinKey==='home');
 p.blocks=[{id:'audit-photo',type:'image',src:c.home.image.src,alt:'Audit photo',caption:'Caption kept with valid semantics'}];
 const id=`canvas:layout.block:${p.id}:audit-photo:caption`;
 const placement={matrix:{a:1,b:0,c:0,d:1,e:19,f:31},widthPx:320,heightPx:80};
 assert.equal(graph.assignCanvasParent(c,p,id,null,false,placement),true);
 assert.equal(model.validateOwnerContent(c).valid,true);
 const actual=nodes(render(c,p)),captions=actual.filter(node=>node.tag==='figcaption');
 for(const caption of captions)assert.equal(caption.ancestors.at(-1)?.tag,'figure','Detached figcaption must retain a figure parent or be normalized to standalone semantics');
 assert.ok(render(c,p).includes('Caption kept with valid semantics'));
});

test('audit: detached price definition fields retain text without orphan dt/dd semantics',()=>{
 for(const part of ['name','amount']){
  const c=defaults.createDefaultOwnerContent(),p=c.pages.find(page=>page.builtinKey==='prices'),item=c.prices.parts[0];
  const id=`canvas:layout.price-parts:${item.id}:${part}`;
  assert.equal(graph.assignCanvasParent(c,p,id,null,false,{matrix:{a:1,b:0,c:0,d:1,e:19,f:31},widthPx:320,heightPx:80}),true);
  assert.equal(model.validateOwnerContent(c).valid,true);
  const html=render(c,p),actual=nodes(html);
  for(const node of actual.filter(n=>['dt','dd'].includes(n.tag)))assert.ok(node.ancestors.some(a=>a.tag==='dl'),'Detached definition must retain dl or normalize to standalone semantics');
  assert.ok(html.includes(item.name));
 }
});

test('audit: contact field internals stay disabled while the complete form card can move',()=>{
 const c=defaults.createDefaultOwnerContent(),p=c.pages.find(page=>page.builtinKey==='contact');
 const placement={matrix:{a:1,b:0,c:0,d:1,e:19,f:31},widthPx:320,heightPx:400};
 for(const field of ['nameLabel','emailFieldLabel','messageLabel'])assert.equal(graph.assignCanvasParent(c,p,`template-text:contact.${field}`,null,false,placement),false);
 assert.equal(graph.assignCanvasParent(c,p,'canvas:layout.contact.form',null,false,placement),true);
 assert.equal(model.validateOwnerContent(c).valid,true);
 const fields=nodes(render(c,p)).filter(node=>['input','textarea'].includes(node.tag));assert.ok(fields.length>=3);
 for(const field of fields)assert.ok(field.ancestors.some(a=>a.tag==='fieldset'&&Object.hasOwn(a.attrs,'disabled')),'Moving the whole card must preserve disabled field ownership');
});

test('audit: sole functional control labels cannot be detached from their clickable owners',()=>{
 const c=defaults.createDefaultOwnerContent(),commission=c.pages.find(page=>page.builtinKey==='commissions'),prices=c.pages.find(page=>page.builtinKey==='prices');c.site.commissionStatus='Open!';
 const placement={matrix:{a:1,b:0,c:0,d:1,e:19,f:31},widthPx:200,heightPx:40};
 const cases=[[commission,'template-text:commissions.requestButton'],[commission,'template-text:commissions.formButton'],[prices,`template-text:prices.exampleLabel@price-group:${c.prices.groups[0].id}`]];
 for(const [page,id] of cases){assert.equal(graph.assignCanvasParent(c,page,id,null,false,placement),false);const actual=nodes(render(c,page)),label=actual.find(n=>n.attrs['data-owner-layout-id']===id);assert.ok(label,`${id}: still rendered`);assert.ok(label.ancestors.some(n=>['a','button'].includes(n.tag)),`${id}: accessible label must stay in original clickable control`);}
});
