import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, preview } from './owner-test-modules.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const { previewTermsIdentity, currentTermsIdentity } = sourceLoader()('src/content/terms-identity.ts');

test('private commission request route follows the real renamed commissions slug and excludes hidden/trashed pages',()=>{
  const content=defaults.createDefaultOwnerContent();const page=content.pages.find(p=>p.builtinKey==='commissions');page.slug='make-a-suit';
  assert.equal(preview.getPreviewCommissionPage(content,['make-a-suit','request']).id,page.id);
  assert.equal(preview.getPreviewCommissionPage(content,['commissions','request']),undefined);
  assert.equal(preview.getPreviewCommissionPage(content,['make-a-suit','request','x']),undefined);
  assert.equal(preview.resolvePreviewDestination(content,'/make-a-suit/request').href,'/taylor/preview/make-a-suit/request');
  page.availability='hidden';assert.equal(preview.getPreviewCommissionPage(content,['make-a-suit','request']),undefined);
  page.availability='available';page.trashedAt=new Date().toISOString();assert.equal(preview.resolvePreviewDestination(content,'/make-a-suit/request'),null);
});
test('private terms identity works independently of construction lock and changes only when shown terms change',()=>{
  const content=defaults.createDefaultOwnerContent();const identity=previewTermsIdentity(content);assert.ok(identity);
  assert.equal(currentTermsIdentity({status:'locked'}),null);
  content.site.name='Different name';assert.equal(previewTermsIdentity(content),identity);
  const terms=content.pages.find(p=>p.builtinKey==='terms');terms.blocks[0].body+=' New private terms';assert.notEqual(previewTermsIdentity(content),identity);
  terms.availability='hidden';assert.equal(previewTermsIdentity(content),null);
  terms.availability='available';terms.blocks=[];assert.equal(previewTermsIdentity(content),null);
});
test('private request keeps owner gate and passes draft form/terms directly without publication or sending',()=>{
  const route=readFileSync(new URL('../src/owner/OwnerSitePreview.tsx',import.meta.url),'utf8');
  assert.match(route,/getPreviewCommissionPage/);assert.match(route,/previewContent=\{content\}/);assert.match(route,/configuration=\{content\.commissionForm \?\? \{\}\}/);
  const entry=readFileSync(new URL('../src/owner/OwnerPreviewEntry.tsx',import.meta.url),'utf8');assert.match(entry,/FirebaseOwnerGate/);
  const form=readFileSync(new URL('../src/components/CommissionForm.tsx',import.meta.url),'utf8');assert.match(form,/disabled aria-describedby="commission-send-hint"/);
  assert.doesNotMatch(route,/publishLive\(/);
});
