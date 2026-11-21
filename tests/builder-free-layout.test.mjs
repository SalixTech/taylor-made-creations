import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {sourceLoader} from './scout-source-loader.mjs';
import {harness} from './owner-ui-harness.mjs';
const load=sourceLoader(),g=load('src/owner/box-geometry.ts'),a=load('src/owner/appearance.ts'),m=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts');
const box=()=>g.initialElementBox({width:400,height:100,parentWidth:800,xPercent:0});
test('latest authorized layout permits negative/outside position and oversized dimensions, not arbitrary CSS or nonfinite math',()=>{
 const original=box(),moved=g.moveElementBox(original,-250,-4000);assert.equal(moved.xPercent,-250);assert.equal(moved.yPx,-4000);assert.equal(g.validElementBox(moved),true);
 const expanded=g.resizeElementBox({...moved,aspectLocked:false},350,25000);assert.equal(expanded.widthPercent,350);assert.equal(expanded.heightPx,25000);assert.equal(g.validElementBox(expanded),true);
 for(const invalid of [NaN,Infinity,-Infinity]){assert.deepEqual(g.moveElementBox(original,invalid,0),original);assert.deepEqual(g.resizeElementBox(original,10,invalid),original);assert.equal(g.validElementBox({...original,yPx:invalid}),false);}
 for(const bad of [{...original,widthPercent:0},{...original,heightPx:-1},{...original,css:'position:fixed'},{...original,layout:'javascript:alert(1)'},{...original,referenceParentPx:Number.MIN_VALUE}])assert.equal(g.validElementBox(bad),false);
 const legacy={...original};delete legacy.layout;assert.equal(g.validElementBox(legacy),true);assert.equal(original.layout,'reflow');
});
test('all eight anchored resize handles can cross former section bounds without moving opposite anchors',()=>{
 for(const handle of ['nw','n','ne','e','se','s','sw','w']){const start={...box(),aspectLocked:false,rotationDeg:27};const next=g.resizeElementBoxFromHandle(start,handle,handle.includes('w')?-300:300,handle.includes('n')?-200:200,false);assert.equal(g.validElementBox(next),true);const point=(b)=>{const width=b.widthPercent/100*b.referenceParentPx,height=b.heightPx,local={x:handle.includes('w')?width:handle.includes('e')?0:width/2,y:handle.includes('n')?height:handle.includes('s')?0:height/2};const rel=g.transformPoint(g.rotationAffine(b.rotationDeg),{x:local.x-width/2,y:local.y-height/2});return{x:b.xPercent/100*b.referenceParentPx+width/2+rel.x,y:b.yPx+height/2+rel.y};};const p=point(start),q=point(next);assert.ok(Math.abs(p.x-q.x)<1e-8,handle);assert.ok(Math.abs(p.y-q.y)<1e-8,handle);}
});
test('mobile appearance is an independent complete snapshot; desktop reset preserves it and mutations do not alias',()=>{
 const original={textColor:'#123456',box:box(),marginTopPx:-40};const mobile=a.setElementAppearanceForLayout(original,{textColor:'#abcdef',box:{...box(),xPercent:-10}},true);assert.equal(a.resolveElementAppearance(mobile,false).textColor,'#123456');assert.equal(a.resolveElementAppearance(mobile,true).textColor,'#abcdef');const reset=a.setElementAppearanceForLayout(mobile,undefined,true);assert.deepEqual(a.resolveElementAppearance(reset,true),{});assert.equal(a.resolveElementAppearance(reset,false).textColor,'#123456');const desktopReset=a.setElementAppearanceForLayout(mobile,undefined,false);assert.equal(desktopReset.box,undefined);assert.equal(desktopReset.mobile.textColor,'#abcdef');a.resolveElementAppearance(mobile,true).box.xPercent=900;assert.equal(mobile.mobile.box.xPercent,-10);assert.equal(original.mobile,undefined);
});
test('section trees and mobile relationships validate independently and roundtrip public snapshots without aliasing',()=>{
 const value=defaults.createDefaultOwnerContent();value.design={mobileLayoutEnabled:true};value.pages[0].blocks=[{id:'section-a',type:'section',heading:'Outer'},{id:'section-b',type:'section',heading:'Inner',parentId:'section-a',mobileParentId:null,mobileOrder:0},{id:'text-a',type:'text',heading:'',body:'Readable text',parentId:'section-b',mobileParentId:'section-a',mobileOrder:1,appearance:{box:g.moveElementBox(box(),-120,-500),mobile:{box:g.resizeElementBox({...box(),aspectLocked:false},180,400),marginLeftPx:-80}}}];assert.equal(m.validateOwnerContent(value).valid,true,JSON.stringify(m.validateOwnerContent(value).issues));const published=m.createPublicContentSnapshot(value);assert.equal(published.design.mobileLayoutEnabled,true);assert.equal(published.pages[0].blocks[2].parentId,'section-b');assert.equal(published.pages[0].blocks[1].mobileParentId,null);published.pages[0].blocks[2].appearance.mobile.box.xPercent=999;assert.notEqual(value.pages[0].blocks[2].appearance.mobile.box.xPercent,999);
 for(const mutate of [v=>v.pages[0].blocks[0].parentId='section-b',v=>v.pages[0].blocks[0].mobileParentId='text-a',v=>v.pages[0].blocks[2].parentId='missing',v=>v.pages[0].blocks[2].appearance.mobile.mobile={},v=>v.design.mobileLayoutEnabled='true']){const bad=structuredClone(value);mutate(bad);assert.equal(m.validateOwnerContent(bad).valid,false);}
});
test('mobile-only fonts survive publication and a nested mobile unknown/script property is rejected',()=>{
 const value=defaults.createDefaultOwnerContent();value.fonts=[{id:'mobilefont',name:'Mobile',format:'woff2',src:'/api/fonts/11111111-1111-4111-8111-111111111111'}];value.contentOverrides={styles:{'home.title':{mobile:{fontId:'mobilefont',fontSize:210,marginTopPx:-12}}}};assert.equal(m.validateOwnerContent(value).valid,true);const published=m.createPublicContentSnapshot(value);assert.equal(published.fonts[0].id,'mobilefont');assert.equal(published.contentOverrides.styles['home.title'].mobile.fontSize,210);value.contentOverrides.styles['home.title'].mobile.style='color:red';assert.equal(m.validateOwnerContent(value).valid,false);
});
test('legacy and new text boxes render real React reflow markup without anisotropic scaling or clipped overflow',()=>{
 const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsxRuntime;const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 for(const legacy of [true,false]){const value={...box(),widthPercent:20,heightPx:500,xPercent:-30,yPx:-100};if(legacy)delete value.layout;const html=renderToStaticMarkup(React.createElement(C,{box:value,appearance:{marginLeftPx:-40}},React.createElement('h2',null,'Words wrap naturally at the chosen width.')));assert.match(html,/data-owner-layout="reflow"/);assert.doesNotMatch(html,/scale\(/);assert.match(html,/min-height:500px/);assert.match(html,/left:-30%/);assert.match(html,/top:-100px/);assert.match(html,/margin-left:-40px/);}
 const css=readFileSync(new URL('../src/components/GeometryBox.module.css',import.meta.url),'utf8');assert.match(css,/overflow:visible/);assert.doesNotMatch(css,/overflow-x:clip|transform:\s*scale/);
});
test('extreme finite inputs never become nonfinite affine matrices, dimensions or flow CSS',()=>{
 for(const angle of [1e308,-1e308,Number.MAX_VALUE])assert.ok(Object.values(g.rotationAffine(angle)).every(Number.isFinite));
 const large={...box(),referenceParentPx:1e307,widthPercent:100,baseWidthPx:1e307};assert.equal(g.validElementBox(large),true);assert.ok(Number.isFinite(g.elementBoxDimensions(large).width));
 const overflow={...box(),xPercent:1e308,flow:{xPercent:-1e308,marginTopPx:0,marginRightPx:0,marginBottomPx:0,marginLeftPx:0}};assert.equal(g.validElementBox(overflow),false);
 for(const value of [{...box(),referenceParentPx:Number.MIN_VALUE},{...box(),widthPercent:Number.MIN_VALUE,referenceParentPx:Number.MIN_VALUE},{...box(),baseWidthPx:Number.MIN_VALUE,flow:{xPercent:0,marginTopPx:0,marginRightPx:0,marginBottomPx:0,marginLeftPx:0}}])assert.equal(g.validElementBox(value),false);
});

test('boxed signed margins override captured flow spacing on the outer slot, not the reset inner content',()=>{
 const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsxRuntime;const C=h.load('src/components/GeometryBox.tsx').GeometryBox;
 const value={...box(),flow:{xPercent:0,marginTopPx:20,marginRightPx:4,marginBottomPx:12,marginLeftPx:8}};
 const html=renderToStaticMarkup(React.createElement(C,{box:value,appearance:{marginTopPx:-30,marginRightPx:50,marginBottomPx:-2,marginLeftPx:-40}},React.createElement('h2',null,'Text')));
 const slot=html.slice(0,html.indexOf('><')+1);assert.match(slot,/data-owner-flow-slot="true"/);for(const css of ['margin-top:-30px','margin-right:50px','margin-bottom:-2px','margin-left:-40px'])assert.ok(slot.includes(css));assert.doesNotMatch(slot,/margin-top:20px/);
});
test('mobile global design is independent, strictly validated and retains mobile-only fonts on publish',()=>{
 const d=load('src/owner/site-design.ts'),value=defaults.createDefaultOwnerContent();value.fonts=[{id:'mobilefont',name:'Mobile',format:'woff2',src:'/api/fonts/11111111-1111-4111-8111-111111111111'}];value.design={headingFontSize:320,mobileLayoutEnabled:true,mobileDesign:{headingFontSize:800,headingFontId:'mobilefont',colors:{priceText:'#abcdef'}}};
 assert.equal(m.validateOwnerContent(value).valid,true,JSON.stringify(m.validateOwnerContent(value).issues));assert.equal(d.getSiteThemeAttributes({design:value.design})['data-site-heading-font-size'],'true');assert.equal(d.resolveSiteDesign(value.design,true).headingFontSize,800);assert.equal(d.resolveSiteDesign(value.design,false).headingFontSize,320);const pub=m.createPublicContentSnapshot(value);assert.equal(pub.fonts[0].id,'mobilefont');assert.equal(pub.design.mobileDesign.headingFontSize,800);pub.design.mobileDesign.headingFontSize=1;assert.equal(value.design.mobileDesign.headingFontSize,800);
 for(const extra of [{mobileDesign:{}},{mobileLayoutEnabled:true},{headingFontSize:Infinity},{headingFontId:'missing'}]){const bad=structuredClone(value);Object.assign(bad.design.mobileDesign,extra);assert.equal(m.validateOwnerContent(bad).valid,false);}
});
