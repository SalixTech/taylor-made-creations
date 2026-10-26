import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { model as m, defaults as d, preview as p } from './owner-test-modules.mjs';

const source = readFileSync(new URL('../src/server/published-site.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const reader = {};
new Function('require', 'exports', compiled)(name => name === 'react' ? { cache: fn => fn } : name === '../owner/model' ? m : (() => { throw new Error(`Unexpected module ${name}`); })(), reader);
const snapshot = content => m.createPublishedOwnerSnapshot(content, 1, '2026-10-25T12:00:00.000Z');
const rest = publication => ({ name: 'projects/test-project/databases/(default)/documents/site/published', fields: { schemaVersion: { integerValue: '1' }, revision: { integerValue: String(publication.revision) }, payload: { stringValue: JSON.stringify(publication) } } });
const respond = (value, status = 200) => async () => new Response(JSON.stringify(value), { status });

test('unconfigured public reader preserves original baseline without any request', async () => {
  assert.deepEqual(await reader.readPublishedSite({ projectId: '', fetcher: () => { throw new Error('Must not fetch'); } }), { status: 'baseline', reason: 'unconfigured' });
});
test('public reader performs only an unauthenticated, uncached exact public document GET', async () => {
  let call;
  const result = await reader.readPublishedSite({ projectId: 'test-project', fetcher: async (url, options) => { call = { url, options }; return new Response(JSON.stringify(rest(snapshot(d.createDefaultOwnerContent())))); } });
  assert.equal(result.status, 'published');
  assert.equal(call.url, 'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/site/published');
  assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.method, 'GET');
  assert.deepEqual(call.options.headers, { Accept: 'application/json' });
});
test('only a confirmed missing document permits the initial baseline; service errors fail closed', async () => {
  assert.deepEqual(await reader.readPublishedSite({ projectId: 'test-project', fetcher: respond({ error: { status: 'NOT_FOUND', message: 'Document projects/test-project/databases/(default)/documents/site/published not found.' } }, 404) }), { status: 'baseline', reason: 'not-published' });
  for (const [status, value] of [[403, { error: { status: 'PERMISSION_DENIED' } }], [404, { error: { status: 'NOT_FOUND', message: 'Database not found.' } }], [503, {}], [200, { fields: {} }]]) {
    const result = await reader.readPublishedSite({ projectId: 'test-project', fetcher: respond(value, status) });
    assert.equal(result.status, 'error');
  }
  assert.equal((await reader.readPublishedSite({ projectId: 'test-project', fetcher: async () => { throw new Error('offline'); } })).status, 'error');
});
test('removed pages and premades switch remain unavailable rather than resurrecting bundled content', () => {
  let content = d.createDefaultOwnerContent();
  content = m.trashPage(content, 'builtin-terms'); content.site.showPremades = false;
  const decoded = reader.decodePublishedRestDocument(rest(snapshot(content)));
  const normalized = m.publicContentToOwnerContent(decoded.content);
  assert.equal(p.getPreviewPage(normalized, ['terms']), undefined);
  assert.equal(p.getPreviewPage(normalized, ['premades']), undefined);
  assert.equal(p.resolveSiteDestination(normalized, '/terms', 'public'), null);
  assert.equal(p.resolveSiteDestination(normalized, '/gallery', 'public').href, '/gallery');
});
test('public REST decoding rejects private fields, revision mismatches, scripts, and oversized payloads', () => {
  const good = rest(snapshot(d.createDefaultOwnerContent()));
  for (const mutate of [
    value => { value.fields.ownerWorkspace = { stringValue: 'private' }; },
    value => { value.fields.revision.integerValue = '2'; },
    value => { value.fields.payload.stringValue = 'x'.repeat(700001); },
    value => { const payload = JSON.parse(value.fields.payload.stringValue); payload.content.pages[0].blocks.push({ id: 'bad', type: 'link', label: 'Unsafe', href: 'javascript:alert(1)' }); value.fields.payload.stringValue = JSON.stringify(payload); },
  ]) { const value = structuredClone(good); mutate(value); assert.throws(() => reader.decodePublishedRestDocument(value)); }
});
