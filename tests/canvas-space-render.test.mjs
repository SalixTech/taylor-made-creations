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
const placement=()=>({matrix:{a:1,b:0,c:0,d:1,e:19,f:31},widthPx:320,heightPx:80});
// Parse actual generated tag ancestry, not a regex that can span siblings.
function nodes(html){const stack=[],out=[];for(const m of html.matchAll(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g)){const tag=m[1],close=m[0][1]==='/';if(close){let at=stack.length-1;while(at>=0&&stack[at].tag!==tag)at--;if(at>=0){stack[at].end=m.index+m[0].length;stack.length=at;}continue;}const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]));const node={tag,attrs,ancestors:[...stack],start:m.index};out.push(node);if(!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)&&!m[0].endsWith('/>'))stack.push(node);}return out;}
test('blank Canvas Space is a true rectangle with exactly one selectable frame and public/mobile parity',()=>{
 const content=defaults.createDefaultOwnerContent(),page=content.pages.find(p=>p.builtinKey==='prices');page.blocks=[{id:'blank-space',type:'canvas-space',widthPx:320,heightPx:180}];
 const bare=nodes(render(content,page));assert.equal(bare.filter(n=>n.attrs['data-owner-layout-id']==='block:blank-space').length,1);assert.ok(bare.some(n=>n.attrs['data-owner-canvas-space']==='true'&&n.attrs.style.includes('height:180px')));
 const desktop={matrix:{a:1,b:0,c:0,d:1,e:-20,f:100},widthPx:480,heightPx:220},mobile={matrix:{a:1,b:0,c:0,d:1,e:5,f:20},widthPx:250,heightPx:110};graph.assignCanvasParent(content,page,'block:blank-space',null,false,desktop);graph.assignCanvasParent(content,page,'block:blank-space',null,true,mobile);
 content.design={...content.design,mobileLayoutEnabled:true};for(const [mobileLayout,expected] of [[false,desktop],[true,mobile]]){const html=render(content,page,{layoutViewport:mobileLayout?"mobile":"desktop"}),tree=nodes(html),frame=tree.filter(n=>n.attrs['data-owner-layout-id']==='block:blank-space');assert.equal(frame.length,1);assert.ok(frame[0].attrs.style.includes(`width:${expected.widthPx}px`));assert.ok(frame[0].attrs.style.includes(`height:${expected.heightPx}px`));const pub=model.createPublicContentSnapshot(content),published=render(pub,pub.pages.find(p=>p.id===page.id),{layoutViewport:mobileLayout?"mobile":"desktop",mode:'public',editable:false});assert.ok(published.includes(`height:${expected.heightPx}px`));assert.ok(!published.includes('data-owner-layout-id'));}
});
test('Canvas Space may contain a real heading without duplicate child rendering or fake content',()=>{
 const content=defaults.createDefaultOwnerContent(),page=content.pages.find(p=>p.builtinKey==='home');page.blocks=[{id:'blank-space',type:'canvas-space',widthPx:320,heightPx:180}];graph.assignCanvasParent(content,page,'block:blank-space',null,false,placement());graph.assignCanvasParent(content,page,'core-text:home.title','block:blank-space',false,placement());const tree=nodes(render(content,page)),heading=tree.filter(n=>n.attrs['data-owner-layout-id']==='core-text:home.title');assert.equal(heading.length,1);assert.ok(heading[0].ancestors.some(n=>n.attrs['data-owner-layout-slot']==='block:blank-space'));
});
