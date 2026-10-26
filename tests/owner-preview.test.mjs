import {test} from 'node:test';
import assert from 'node:assert/strict';
import {model as m, defaults as d, preview as p} from './owner-test-modules.mjs';

test('preview URLs stay scoped, including home, builtin and custom pages',()=>{
  const content=m.createCustomPage(d.createDefaultOwnerContent(),{title:'About Taylor',slug:'about-taylor'});
  for(const page of content.pages) {
    const href=p.previewPageHref(page);
    assert.ok(href==='/taylor/preview'||href.startsWith('/taylor/preview/'));
    assert.equal(p.getPreviewPage(content,page.slug?[page.slug]:[]).id,page.id);
  }
  assert.equal(p.previewBuiltinHref(content,'home'),'/taylor/preview');
  assert.equal(p.previewBuiltinHref(content,'gallery'),'/taylor/preview/gallery');
});

test('hidden menu pages remain addressable; trash disables both direct routes and links',()=>{
  let content=m.createCustomPage(d.createDefaultOwnerContent(),{title:'About',slug:'about',showInNav:false});
  const id=content.pages.at(-1).id;
  assert.ok(p.getPreviewPage(content,['about']));
  assert.equal(m.getVisibleNavigation(content).some(page=>page.id===id),false);
  assert.equal(p.resolvePreviewDestination(content,'/about').href,'/taylor/preview/about');
  content=m.trashPage(content,id);
  assert.equal(p.getPreviewPage(content,['about']),undefined);
  assert.equal(p.resolvePreviewDestination(content,'/about'),null);
  assert.ok(p.getPreviewPage(content,['terms']));
  content=m.trashPage(content,'builtin-terms');
  assert.equal(p.previewBuiltinHref(content,'terms'),null);
  assert.equal(p.getPreviewPage(content,['terms']),undefined);
});

test('premades off disables its direct preview and unknown/nested routes stay unavailable',()=>{
  const content=d.createDefaultOwnerContent();content.site.showPremades=false;
  assert.equal(p.getPreviewPage(content,['premades']),undefined);
  assert.equal(p.previewBuiltinHref(content,'premades'),null);
  for(const slug of [['missing'],['gallery','extra'],['commissions','request'],['owner'],['admin'],['../contact']])assert.equal(p.getPreviewPage(content,slug),undefined);
});

test('internal links are rewritten without escaping to public or administrative routes',()=>{
  const content=d.createDefaultOwnerContent();
  for(const [source,href] of [['/','/taylor/preview'],['/contact','/taylor/preview/contact'],['/gallery/','/taylor/preview/gallery'],['/examples?view=all#heads','/taylor/preview/examples?view=all#heads'],['/taylor/preview/prices','/taylor/preview/prices'],['/taylor/preview','/taylor/preview']])assert.deepEqual(p.resolvePreviewDestination(content,source),{href,kind:'page'});
  for(const href of ['/owner','/api/private','/commissions/request','/no-page','//evil.test','/\\evil.test','javascript:alert(1)','data:text/html,<script>','http://evil.test','/contact%2f..%2fowner','/images/logo.png'])assert.equal(p.resolvePreviewDestination(content,href),null,href);
});

test('safe external links, anchors and the supplied care PDF remain explicit non-page destinations',()=>{
  const content=d.createDefaultOwnerContent();
  for(const href of ['https://example.com/about','mailto:hello@example.com'])assert.deepEqual(p.resolvePreviewDestination(content,href),{href,kind:'external'});
  assert.deepEqual(p.resolvePreviewDestination(content,'#care'),{href:'#care',kind:'anchor'});
  assert.deepEqual(p.resolvePreviewDestination(content,'/downloads/taylor-made-creations-care.pdf'),{href:'/downloads/taylor-made-creations-care.pdf',kind:'download'});
  assert.equal(p.resolvePreviewDestination(content,'/downloads/unknown.pdf'),null);
});

test('legacy owner preview links resolve into the canonical Taylor preview',()=>{
  const content=d.createDefaultOwnerContent();
  assert.equal(p.resolvePreviewDestination(content,'/owner/preview/gallery').href,'/taylor/preview/gallery');
});
