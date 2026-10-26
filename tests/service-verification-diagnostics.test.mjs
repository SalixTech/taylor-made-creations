import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';
const jose = appRequire('jose');
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const project = 'taylor-made-creations', owner = 'a4ARjp0z8ZOByKlC2AfGzmMRj843';
async function signed(changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: owner, iat: now, auth_time: now, exp: now + 600, ...changes })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(pair.privateKey);
}
const request = token => new Request('https://tmc.example/api/taylor/services', { headers: { Authorization: `Bearer ${token}` } });
function setup(t, overrides = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ fixture: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----' }, { headers: { 'Cache-Control': 'max-age=0' } });
  t.after(() => { globalThis.fetch = original; });
  return sourceLoader({ jose: { ...jose, importX509: async () => pair.publicKey, ...overrides } })('src/server/taylor-auth.ts');
}
test('certificate import/runtime failure is unavailable, never blamed on owner credentials', async t => {
  const auth = setup(t, { importX509: async () => { throw new Error('sensitive runtime detail'); } });
  await assert.rejects(auth.verifyTaylorOwner(request(await signed())), error => {
    assert.equal(error.status, 503); assert.equal(error.code, 'verification-key-unavailable');
    assert.doesNotMatch(error.message, /Sign in again|sensitive runtime/); return true;
  });
});
test('unknown verification exception stays fail-closed and is classified as service unavailable', async t => {
  const auth = setup(t, { jwtVerify: async () => { throw new TypeError('private internal stack'); } });
  await assert.rejects(auth.verifyTaylorOwner(request(await signed())), error => error.status === 503 && error.code === 'verification-unavailable');
});
test('small remote minting clock skew succeeds but materially future tokens are rejected', async t => {
  const auth = setup(t), now = Math.floor(Date.now() / 1000);
  assert.deepEqual(await auth.verifyTaylorOwner(request(await signed({ iat: now + 3, auth_time: now + 3 }))), { uid: owner });
  for (const changes of [{ iat: now + 120 }, { auth_time: now + 120 }]) {
    await assert.rejects(auth.verifyTaylorOwner(request(await signed(changes))), error => error.status === 401 && error.code === 'session-invalid');
  }
});
test('expired and invalid tokens have different safe codes, neither grants access', async t => {
  const auth = setup(t), now = Math.floor(Date.now() / 1000);
  await assert.rejects(auth.verifyTaylorOwner(request(await signed({ exp: now - 60 }))), error => error.status === 401 && error.code === 'session-expired');
  await assert.rejects(auth.verifyTaylorOwner(request(await signed({ aud: 'other-project' }))), error => error.status === 401 && error.code === 'session-invalid');
});
test('API error diagnostic preserves status, excludes raw exception/token and remains private', async t => {
  const auth = setup(t);
  const response = auth.apiErrorResponse(new auth.TaylorApiError(503, 'Verification unavailable.', undefined, 'verification-unavailable'));
  assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual(await response.json(), { ok: false, message: 'Verification unavailable.', code: 'verification-unavailable' });
  const unknown = await auth.apiErrorResponse(new Error('secret token content')).json();
  assert.doesNotMatch(JSON.stringify(unknown), /secret token/);
});
test('client preserves typed safe service diagnostics instead of converting them into generic connection errors', async () => {
  const client = sourceLoader({ './firebase-client': {} })('src/owner/taylor-services-client.ts');
  let caught;
  try { await client.responseObject(Response.json({ ok: false, code: 'verification-unavailable', message: 'Server check unavailable.' }, { status: 503 })); } catch (error) { caught = error; }
  assert.equal(caught.status, 503); assert.equal(caught.code, 'verification-unavailable');
  assert.equal(client.serviceReadError(caught, 'Owner verification'), 'Server check unavailable.');
});
test('dark status combinations retain readable contrast and dedicated semantic marker', () => {
  const css = readFileSync('src/owner/TaylorServices.module.css', 'utf8');
  const ui = readFileSync('src/owner/TaylorServices.tsx', 'utf8');
  assert.match(ui, /data-service-status=/);
  const linear = hex => {
    const rgb = hex.match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  for (const [background, foreground] of [['193d2b', 'a9edc4'], ['423216', 'f9d58b'], ['30303a', 'e4dff1']]) {
    assert.ok((linear(foreground) + .05) / (linear(background) + .05) >= 4.5);
    assert.ok(css.includes(`#${background}`) && css.includes(`#${foreground}`));
  }
});
