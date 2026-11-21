import {test} from 'node:test';import assert from 'node:assert/strict';
import {sourceLoader} from './scout-source-loader.mjs';
const load=sourceLoader(),m=load('src/owner/model.ts'),defaults=load('src/owner/defaults.ts'),transfer=load('src/owner/website-transfer.ts');
const photo='11111111-1111-4111-8111-111111111111',photoCopy='22222222-2222-4222-8222-222222222222';
test('public-only import preserves design and remaps immutable assets without touching source',()=>{
 const draft=defaults.createDefaultOwnerContent();draft.home.image.src=`/api/cloud-media/${photo}`;
 const published=m.createPublishedOwnerSnapshot(draft,7,new Date().toISOString()).content,before=structuredClone(published);
 const plan=transfer.prepareWebsiteImport(published);assert.deepEqual(plan.assetIds,[photo]);
 const next=transfer.remapWebsiteImport(plan.content,new Map([[photo,photoCopy]]));
 assert.equal(next.home.image.src,`/api/cloud-media/${photoCopy}`);assert.deepEqual(published,before);m.assertOwnerContent(next);
 assert.equal(plan.content.home.image.src,`/api/cloud-media/${photo}`);
});
test('missing, duplicate or unchanged destination identity refuses whole import',()=>{
 const draft=defaults.createDefaultOwnerContent();draft.home.image.src=`/api/cloud-media/${photo}`;
 assert.throws(()=>transfer.remapWebsiteImport(draft,new Map()),/Every website asset/);
 assert.throws(()=>transfer.remapWebsiteImport(draft,new Map([[photo,photo]])),/identities/);
 assert.throws(()=>transfer.remapWebsiteImport(draft,new Map([[photo,'not-an-id']])),/identities/);
});
test('global and individual desktop/mobile font identities remap alongside font source',()=>{
 const draft=defaults.createDefaultOwnerContent(),font='33333333-3333-4333-8333-333333333333',copy='44444444-4444-4444-8444-444444444444';
 draft.fonts=[{id:font,name:'Website font',src:`/api/cloud-fonts/${font}`,format:'woff2'}];
 draft.design={bodyFontId:font,headingFontId:font,mobileLayoutEnabled:true,mobileDesign:{bodyFontId:font,headingFontId:font}};
 draft.pages[0].titleAppearance={fontId:font,mobile:{fontId:font}};
 const published=m.createPublishedOwnerSnapshot(draft,7,new Date().toISOString()).content;
 const plan=transfer.prepareWebsiteImport(published),next=transfer.remapWebsiteImport(plan.content,new Map([[font,copy]]));
 assert.equal(next.fonts[0].id,copy);assert.equal(next.fonts[0].src,`/api/cloud-fonts/${copy}`);
 for(const design of[next.design,next.design.mobileDesign]){assert.equal(design.bodyFontId,copy);assert.equal(design.headingFontId,copy);}
 assert.equal(next.pages[0].titleAppearance.fontId,copy);assert.equal(next.pages[0].titleAppearance.mobile.fontId,copy);m.assertOwnerContent(next);
});
