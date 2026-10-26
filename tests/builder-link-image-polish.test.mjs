import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';

const pure = harness();
const { parseInlineLinks, makeInlineLink } = pure.load('src/owner/inline-links.ts');
const { getImageFrameStyle } = pure.load('src/owner/appearance.ts');

test('inline hyperlinks support safe internal, external, email and anchor destinations without HTML', () => {
  assert.deepEqual(parseInlineLinks('See [prices](/prices) or [email](mailto:maker@example.com).'), [{text:'See '},{text:'prices',href:'/prices'},{text:' or '},{text:'email',href:'mailto:maker@example.com'},{text:'.'}]);
  for (const href of ['javascript:alert(1)','data:text/html,test','//evil.invalid','https://user:pass@example.com','/\\evil','https://a.invalid/\nscript']) {
    assert.equal(makeInlineLink('Click',href),null);
    assert.ok(parseInlineLinks(`[Click](${href})`).every(part=>!part.href));
  }
  assert.deepEqual(parseInlineLinks('<img src=x onerror=alert(1)>'),[{text:'<img src=x onerror=alert(1)>'}]);
  assert.equal(makeInlineLink('Example','https://example.com/a(b)'), '[Example](https://example.com/a%28b%29)');
  assert.equal(makeInlineLink('Invalid]name','/prices'),null);
  assert.equal(makeInlineLink('Section','#care'), '[Section](#care)');
});

test('image frame dimensions are bounded independently of image fit and section layout', () => {
  assert.deepEqual(getImageFrameStyle({imageWidthPercent:50,imageHeightPx:320}),{width:'50%',maxWidth:'100%',marginInline:'auto',height:'320px',minHeight:0,aspectRatio:'auto'});
  assert.deepEqual(getImageFrameStyle(),{});
  for(const value of [NaN,Infinity,-1,0,'50',null,101]) assert.deepEqual(getImageFrameStyle({imageWidthPercent:value}),{});
  for(const value of [NaN,Infinity,-1,0,'50',null,2001]) assert.deepEqual(getImageFrameStyle({imageHeightPx:value}),{});
  assert.deepEqual(getImageFrameStyle({widthPercent:40,heightPercent:80,imageFit:'cover'}),{});
});

test('image dimension edits validate and survive public projection without changing old drafts', () => {
  const {createDefaultOwnerContent}=pure.load('src/owner/defaults.ts');
  const model=pure.load('src/owner/model.ts');
  const value=createDefaultOwnerContent(); value.contentOverrides={styles:{'home.image':{imageWidthPercent:55,imageHeightPx:410}}};
  assert.equal(model.validateOwnerContent(value).valid,true);
  const project=model.createPublicContentSnapshot;
  assert.ok(project,'public projection is available');
  assert.deepEqual(project(value).contentOverrides.styles['home.image'],{imageWidthPercent:55,imageHeightPx:410});
  value.contentOverrides.styles['home.image'].imageWidthPercent=1000;
  assert.equal(model.validateOwnerContent(value).valid,false);
});

test('hyperlink insertion replaces a selection and protects against a stale changed field', () => {
  const h=harness(), {OwnerLinkedTextField}=h.load('src/owner/OwnerLinkedTextField.tsx');
  const props={label:'Text',value:'See prices today',onChange(value){props.value=value;},multiline:true};
  const render=()=>h.render(OwnerLinkedTextField,props); render();
  const field=h.find(n=>n.type==='textarea').props.ref;
  // Callback refs are populated by React in the browser; this focused fixture sets it explicitly.
  field({selectionStart:4,selectionEnd:10,focus(){}});
  const click=text=>h.find(n=>n.type==='button'&&content(n).includes(text)).props.onClick();
  click('Add hyperlink');render();
  let inputs=h.all(n=>n.type==='input'); assert.equal(inputs[0].props.value,'prices');
  inputs[1].props.onChange({target:{value:'/prices'}});render();click('Insert link');
  assert.equal(props.value,'See [prices](/prices) today');render();
  field({selectionStart:0,selectionEnd:3,focus(){}});click('Add hyperlink');render();
  inputs=h.all(n=>n.type==='input');inputs[0].props.onChange({target:{value:'Contact'}});inputs[1].props.onChange({target:{value:'/contact'}});render();
  props.value='Updated elsewhere';render();click('Insert link');
  assert.equal(props.value,'Updated elsewhere [Contact](/contact)');
});

test('theme toggle is a single labeled circular icon with stable browser preference',()=>{
  const h=harness(); const saved=new Map();h.window.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
  const {ColorModeToggle}=h.load('src/components/ColorMode.tsx');
  const toggle=()=>h.find(n=>n.props?.['data-theme-toggle']!==undefined);
  h.render(ColorModeToggle,{scope:'owner'});assert.equal(toggle().props['aria-pressed'],true);assert.ok(h.find(n=>n.type==='svg'));assert.equal(content(h.tree),'');assert.equal(h.all(n=>n.type==='button').length,1);
  toggle().props.onClick();h.render(ColorModeToggle,{scope:'owner'});assert.equal(toggle().props['aria-pressed'],false);assert.equal(h.find(n=>n.props?.['data-theme-reset']!==undefined),undefined);
  const css=fs.readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8');
  assert.match(css,/\.color-mode-toggle\s*\{[^}]*position:fixed;[^}]*bottom:[^;]+;[^}]*border-radius:50%/);
  assert.doesNotMatch(css,/\[class\*="badge"\]/);
  assert.match(css,/--owner-button-primary-bg:#800014/);
  assert.match(css,/\.site-header \{ background:#800014!important/);
});

test('public and private renderers emit real safe hyperlinks and sized image frames',async()=>{
  const React=await import('react'),jsx=await import('react/jsx-runtime'),{renderToStaticMarkup}=await import('react-dom/server');
  const h=harness();h.overrides.react=React;h.overrides['react/jsx-runtime']=jsx;
  h.overrides['next/link']={__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
  h.overrides['next/image']={__esModule:true,default:({fill,unoptimized,...props})=>{void fill;void unoptimized;return React.createElement('img',props);}};
  h.overrides['@/owner/media-client']={useOwnerMediaSource:src=>({src,error:null})};
  const {SiteContentFrame}=h.load('src/components/SiteContent.tsx');
  const value=h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  value.home.description='Read [prices](/prices) and [our resource](https://example.com).';
  value.contentOverrides={styles:{'home.image':{imageWidthPercent:55,imageHeightPx:410,imageFit:'contain'}}};
  value.pages[0].blocks=[{id:'linked',type:'text',heading:'More',body:'[Unsafe](javascript:alert) <script>bad</script> [Email](mailto:maker@example.com)'}];
  for(const mode of ['public','private-preview','editor']){
    const html=renderToStaticMarkup(React.createElement(SiteContentFrame,{content:value,page:value.pages[0],mode,editable:mode==='editor'}));
    assert.match(html,new RegExp(`href="${mode==='public'?'/prices':'/taylor/preview/prices'}"[^>]*>prices</a>`));
    assert.match(html,/href="https:\/\/example.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(html,/href="mailto:maker@example.com"/);
    assert.doesNotMatch(html,/href="javascript:|<script>/);
    assert.match(html,/\[Unsafe\]\(javascript:alert\)/);
    assert.match(html,/width:55%;max-width:100%;margin-inline:auto;height:410px;min-height:0;aspect-ratio:auto/);
  }
});

test('theme circle keeps exact dimensions through owner mobile toolbar rules in either stylesheet order',async()=>{
  const postcss=(await import('postcss')).default,{createRequire}=await import('node:module');const require=createRequire(import.meta.url);
  const local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
  const css=await postcss([local(),scope({generateScopedName:key=>`OwnerPortal_${key}`})]).process(fs.readFileSync(new URL('../src/owner/OwnerPortal.module.css',import.meta.url),'utf8'),{from:'OwnerPortal.module.css'});
  const modes=fs.readFileSync(new URL('../src/app/color-modes.css',import.meta.url),'utf8');
  const {cascade,element}=await import('./helpers/css-cascade.mjs');
  for(const sheets of [[modes,css.css],[css.css,modes]])for(const width of [375,768,1440]){
    const root=element('div',{'data-owner-portal':'','data-color-mode':'dark'}),bar=element('div',{class:'OwnerPortal_topbarActions'},root),button=element('button',{class:'color-mode-toggle','data-theme-toggle':''},bar);
    const style=cascade(sheets,width)(button);assert.equal(style.width,'44px');assert.equal(style.height,'44px');assert.equal(style['min-height'],'44px');assert.equal(style.padding,'0');assert.equal(style['border-radius'],'50%');assert.equal(style.position,'fixed');
  }
});

test('saved private preview has one website-theme control without changing its cloud draft',async()=>{
  const h=harness();const saved=new Map([['tmc-public-color-mode','dark'],['tmc-owner-color-mode','light']]);
  h.window.localStorage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const value=h.load('src/owner/defaults.ts').createDefaultOwnerContent(),before=structuredClone(value);let writes=0;
  const store={load:async()=>({draft:value,updatedAt:null}),subscribe:()=>()=>{},saveDraft:async()=>{writes++;}};
  const Preview=h.load('src/owner/OwnerSitePreview.tsx').OwnerSitePreview;
  const props={store,mode:'cloud',userEmail:'owner@example.com',onSignOut:async()=>{}};
  h.render(Preview,props);await Promise.resolve();h.render(Preview,props);
  assert.equal(h.tree.props['data-theme-scope'],'public');assert.equal(h.tree.props['data-color-mode'],'dark');
  const toggles=h.all(n=>n.type?.name==='ColorModeToggle');assert.equal(toggles.length,1);assert.equal(toggles[0].props.scope,'public');assert.equal(writes,0);assert.deepEqual(value,before);h.unmount();
});
