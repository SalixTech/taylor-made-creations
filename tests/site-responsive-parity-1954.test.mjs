import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import {cascade,element} from './helpers/css-cascade.mjs';
const require=createRequire(import.meta.url),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>readFileSync(p,'utf8');
const globals=read('src/app/globals.css');
const compile=async path=>(await postcss([local(),scope({generateScopedName:key=>key})]).process(read(path),{from:path})).css;
const [preview,gallery,form,terms,shop,credits]=await Promise.all(['src/owner/OwnerSitePreview.module.css','src/components/FursuitGallery.module.css','src/components/CommissionForm.module.css','src/components/Terms.module.css','src/components/PremadeShopPreview.module.css','src/components/FooterCredits.module.css'].map(compile));
// Resolve named-container conditions against the actual site width, independently
// of browser media width. This is a CSS source cascade test, not browser geometry.
function atWidth(css,width,hasSite=true){const root=postcss.parse(css);root.walkAtRules('container',at=>{assert.match(at.params,/^site-viewport /);const min=at.params.match(/min-width:\s*(\d+)px/),max=at.params.match(/max-width:\s*(\d+)px/);if(!hasSite||(min&&width<+min[1])||(max&&width>+max[1]))at.remove();else at.replaceWith(...at.nodes)});return root.toString();}
function fixture(mode){const root=element('div',mode==='public'?{class:'selected-design public-site-frame','data-theme-scope':'public'}:{class:`selected-design ${mode==='editor'?'editorFrame':''}`,'data-site-render-mode':mode});const header=element('header',{class:'site-header'},root),inner=element('div',{class:'header-inner'},header),nav=element('nav',{},inner),intro=element('section',{class:'home-intro'},root),title=element('h1',{},intro),page=element('main',{class:'page-shell'},root),prices=element('div',{class:'price-grid'},page),grid=element('div',{class:'grid'},page),feature=element('div',{class:'feature'},page);return{root,inner,nav,title,page,prices,grid,feature};}
for(const width of [390,800,1024,1440])test(`same ${width}px website width has equal public, beta preview and editor styles despite different browser widths`,()=>{
 const result=[];for(const [mode,browserWidth] of [['public',width],['private-preview',width],['editor',1920]]){const f=fixture(mode),get=cascade([globals,preview,gallery].map(css=>atWidth(css,width,mode!=='public')),browserWidth);result.push(Object.fromEntries(['inner','nav','title','page','prices','grid','feature'].map(key=>[key,get(f[key])])));}
 // Editing affordances/background don't change these shared website dimensions.
 for(const key of Object.keys(result[0]))for(const property of ['font-size','padding','padding-top','gap','flex-direction','grid-template-columns','margin']){const normalize=value=>value?.replace(/([\d.]+)(?:vw|cqw)\b/g,(_,number)=>`${Number(number)*width/100}px`);assert.equal(normalize(result[1][key][property]),normalize(result[0][key][property]),`preview ${key}/${property}`);assert.equal(normalize(result[2][key][property]),normalize(result[0][key][property]),`editor ${key}/${property}`);}
});
test('main owner shell is not a site container and keeps viewport-based global typography',()=>{const owner=element('div',{class:'selected-design public-site-frame'}),title=element('h1',{},owner),get=cascade([atWidth(globals,390,false)],1440);assert.equal(get(owner)['container-name'],undefined);assert.equal(get(title)['font-size'],'clamp(42px,5.5vw,76px)');});
test('inline gallery responds to site container but modal remains browser-sized',()=>{const root=postcss.parse(gallery);let inline=0,modal=0;root.walkAtRules('container',at=>{at.walkRules(rule=>{assert.doesNotMatch(rule.selector,/dialog|toolbar|control|help/);inline++})});root.walkRules(rule=>{if(rule.selector==='.dialog'&&rule.parent.type==='root'){assert.ok(rule.nodes.some(d=>d.prop==='width'&&d.value==='100vw'));modal++}});assert.ok(inline>=2);assert.ok(modal);assert.doesNotMatch(preview,/site-editor/);});
test('shared component styles compile and use the same named website container',()=>{for(const css of [form,shop,credits])assert.match(css,/@container site-viewport/);assert.match(terms,/4cqw/);});

test('public root never establishes new containment or replaces its canonical viewport typography',()=>{const root=postcss.parse(globals);root.walkDecls('container-type',decl=>{assert.equal(decl.parent.selector,':where(.selected-design[data-site-render-mode])');});const f=fixture('public'),get=cascade([atWidth(globals,1024,false)],1024);assert.equal(get(f.root)['container-type'],undefined);assert.equal(get(f.title)['font-size'],'clamp(26px,3.7vw,52px)');});
