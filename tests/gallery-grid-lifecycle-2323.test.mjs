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
test('deleting last photo retains the gallery box and unrelated assigned content in desktop/mobile and public render',()=>{
 const c=defaults.createDefaultOwnerContent(),p=c.pages.find(p=>p.builtinKey==='gallery');c.gallery=c.gallery.slice(0,1);p.blocks=[{id:'keep-gallery-text',type:'text',heading:'Keep my gallery note',body:'Independent content'}];
 const grid='canvas:layout.gallery.grid';assert.equal(graph.assignCanvasParent(c,p,'block:keep-gallery-text',grid),true);graph.initializeCanvasMobileLayouts(c);
 const before=structuredClone(c),next=structuredClone(c);next.gallery=[];
 assert.deepEqual(graph.reconcileCanvasLayouts(before,next),[]);
 const {OwnerDraftHistory}=load('src/owner/draft-history.ts'),history=new OwnerDraftHistory();history.reset(before);history.record(next);assert.deepEqual(history.undo(),before);assert.deepEqual(history.redo(),next);
 const page=next.pages.find(p=>p.builtinKey==='gallery');
 for(const mobile of [false,true]){assert.equal(graph.resolveCanvasLayout(next,page,mobile)['block:keep-gallery-text'].parentId,grid);const html=render(next,page,{layoutViewport:mobile?'mobile':'desktop'});assert.match(html,/Keep my gallery note/);assert.match(html,/data-owner-layout-id="canvas:layout.gallery.grid"/);}
 assert.deepEqual(model.validateOwnerContent(next).issues,[]);
 const snapshot=model.createPublicContentSnapshot(next),publicPage=snapshot.pages.find(p=>p.builtinKey==='gallery');assert.ok(publicPage.canvasLayout.desktop[grid]);
 assert.match(render(snapshot,publicPage,{mode:'public',editable:false}),/Keep my gallery note/);
});
