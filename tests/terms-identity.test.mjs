import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { model as m, defaults as d } from './owner-test-modules.mjs';
const compiled = ts.transpileModule(readFileSync(new URL('../src/content/terms-identity.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const terms = {};
new Function('require', 'exports', compiled)(path => { assert.equal(path, '../data/terms-of-service.json'); return JSON.parse(readFileSync(new URL('../src/data/terms-of-service.json', import.meta.url), 'utf8')); }, terms);
const published = (content, revision = 1) => ({ status: 'published', snapshot: m.createPublishedOwnerSnapshot(content, revision, '2026-10-25T12:00:00.000Z') });

test('untouched first publication and unrelated published changes do not revoke terms consent', () => {
  const content = d.createDefaultOwnerContent();
  const original = terms.currentTermsIdentity({ status: 'baseline', reason: 'unconfigured' });
  assert.equal(terms.currentTermsIdentity(published(content)), original);
  content.home.title = 'New home'; content.gallery[0].displayNumber = '101'; content.prices.groups[0].items[0].price += 1;
  assert.equal(terms.currentTermsIdentity(published(content, 2)), original);
});
test('terms edits, removal, empty terms and unavailable publication revoke consent', () => {
  let content = d.createDefaultOwnerContent();
  const original = terms.currentTermsIdentity(published(content));
  content.pages.find(page => page.builtinKey === 'terms').blocks[0].body = 'Revised terms';
  assert.notEqual(terms.currentTermsIdentity(published(content, 2)), original);
  content = m.trashPage(content, 'builtin-terms');
  assert.equal(terms.currentTermsIdentity(published(content, 3)), null);
  assert.equal(terms.currentTermsIdentity({ status: 'error', message: 'Unavailable' }), null);
  content = d.createDefaultOwnerContent();content.pages.find(page => page.builtinKey === 'terms').blocks = [];
  assert.equal(terms.currentTermsIdentity(published(content)), null);
});
test('initial blank and explicit No choices remain unchanged; stale Yes is not preselected as No', () => {
  for (const tos of ['', 'No']) assert.deepEqual(terms.withCurrentTermsConsent({ tos, tosAgreed: false, character: 'Fox' }, null, 'current'), { tos, tosAgreed: false, character: 'Fox' });
  assert.deepEqual(terms.withCurrentTermsConsent({ tos: 'Yes', tosAgreed: true }, 'old', 'new'), { tos: '', tosAgreed: false });
  assert.deepEqual(terms.withCurrentTermsConsent({ tos: 'Yes', tosAgreed: true }, 'current', null), { tos: '', tosAgreed: false });
  const valid = { tos: 'Yes', tosAgreed: true };assert.equal(terms.withCurrentTermsConsent(valid, 'current', 'current'), valid);
});
