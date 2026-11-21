import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {harness} from './owner-ui-harness.mjs';
function setup(){
 const h=harness();let content=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),mobile=false,status='published';
 h.overrides.react=React;h.overrides['react/jsx-runtime']=jsxRuntime;
 h.overrides['next/link']={__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 h.overrides['next/image']={__esModule:true,default:incoming=>{const props={...incoming};delete props.unoptimized;delete props.fill;return React.createElement('img',props);}};
 h.overrides['@/owner/media-client']={useOwnerMediaSource:src=>({src,error:null})};
 h.overrides['@/owner/use-mobile-site-layout']={useMobileSiteLayout:()=>mobile};
 h.overrides['./PublicSiteContext']={usePublicOwnerContent:()=>content,usePublicSiteState:()=>({status})};
 const {PublicChromeLayout}=h.load('src/components/PublicChrome.tsx'),graph=h.load('src/owner/canvas-layout.ts');
 const render=()=>renderToStaticMarkup(React.createElement(PublicChromeLayout,null,React.createElement('main',{id:'main'},'Route content unchanged')));
 return {h,content,graph,render,set mobile(v){mobile=v;},set status(v){status=v;}};
}
const placement={matrix:{a:1,b:0,c:.2,d:1,e:31,f:-17},widthPx:180,heightPx:30,aspectLocked:false,contentOffset:{xPx:3,yPx:2}};
test('public header and footer share actual chrome graph; moved tagline renders once in footer',()=>{
 const t=setup();t.content.contentOverrides={text:{'site.headerTagline':'UNIQUE HEADER TAGLINE'}};
 assert.equal(t.graph.assignCanvasParent(t.content,'chrome','template-text:site.headerTagline','canvas:layout.site.footer',false,placement),true);
 const before=JSON.stringify(t.content),html=t.render(),header=html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
 assert.ok(header);assert.doesNotMatch(header,/UNIQUE HEADER TAGLINE/);assert.equal(html.split('UNIQUE HEADER TAGLINE').length-1,1);assert.match(html,/matrix\(1,0,0.2,1,31,-17\)/);assert.match(html,/<main id="main">Route content unchanged<\/main>/);assert.equal(JSON.stringify(t.content),before);
});
test('mobile chrome override independently moves a navigation item and preserves safe link behavior',()=>{
 const t=setup();t.content.design={...t.content.design,mobileLayoutEnabled:true};
 assert.equal(t.graph.assignCanvasParent(t.content,'chrome','canvas:layout.navigation:trello-board','canvas:layout.site.footer',true,placement),true);
 const desktop=t.render();assert.match(desktop.match(/<header\b[\s\S]*?<\/header>/)[0],/trello.com/);
 t.mobile=true;const mobile=t.render();assert.doesNotMatch(mobile.match(/<header\b[\s\S]*?<\/header>/)[0],/trello.com/);assert.equal(mobile.split('href="https://trello.com/b/mjEvvCqI/"').length-1,1);assert.match(mobile,/href="https:\/\/trello.com\/b\/mjEvvCqI\/" target="_blank" rel="noopener noreferrer"/);
});
test('locked and failed publication never renders saved chrome while main remains independent',()=>{
 const t=setup();t.content.contentOverrides={text:{'site.headerTagline':'DO NOT EXPOSE'}};
 for(const state of ['locked','error']){t.status=state;const html=t.render();assert.doesNotMatch(html,/DO NOT EXPOSE|trello.com|<footer/);assert.match(html,/Route content unchanged/);if(state==='error')assert.match(html,/Website temporarily unavailable/);}
});
