import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { sourceLoader, appRequire } from './scout-source-loader.mjs';

const sharp = appRequire('sharp'), load = sourceLoader(), media = load('src/server/dev-media.ts'), fonts = load('src/server/dev-fonts.ts'), auth = load('src/server/taylor-auth.ts');
const keys = ['NODE_ENV', 'VERCEL', 'TMC_DEV_MEDIA_ENABLED', 'TMC_DEV_MEDIA_DIR'], initial = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let folder, avif, png;
before(async () => { folder = await mkdtemp(join(tmpdir(), 'tmc-full-notes-media-')); const image = sharp({ create: { width: 7, height: 5, channels: 4, background: { r: 120, g: 22, b: 44, alpha: 1 } } }); png = await image.png().toBuffer(); avif = await sharp(png).avif().toBuffer(); });
beforeEach(() => { process.env.NODE_ENV = 'development'; delete process.env.VERCEL; delete process.env.TMC_DEV_MEDIA_ENABLED; process.env.TMC_DEV_MEDIA_DIR = join(folder, randomUUID()); });
after(async () => { for (const key of keys) if (initial[key] === undefined) delete process.env[key]; else process.env[key] = initial[key]; await rm(folder, { recursive: true, force: true }); });

test('full notes: AVIF really decodes to private WebP with dimensions intact; 12 MB current limit is unchanged', async () => {
  assert.equal(media.MAX_MEDIA_BYTES, 12 * 1024 * 1024);
  const normalized = await media.normalizeMedia(avif, 'image/avif');
  const metadata = await sharp(normalized.data).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 7); assert.equal(metadata.height, 5);
  const saved = await media.storeDevelopmentMedia(avif, 'image/avif', 'My AVIF photo.avif');
  assert.equal((await stat(join(process.env.TMC_DEV_MEDIA_DIR, `${saved.id}.webp`))).mode & 0o777, 0o600);
  assert.equal((await sharp(await media.readDevelopmentMedia(saved.id)).metadata()).format, 'webp');
});
for (const [label, bytes, type] of [['PNG called AVIF', () => png, 'image/avif'], ['AVIF called PNG', () => avif, 'image/png'], ['truncated AVIF', () => avif.subarray(0, 32), 'image/avif'], ['fake AVIF container', () => { const value = Buffer.alloc(40); value.writeUInt32BE(32); value.write('ftypavif', 4); return value; }, 'image/avif']]) test(`full notes: rejects ${label} rather than trusting extension/MIME`, async () => assert.rejects(media.normalizeMedia(bytes(), type), error => [413, 415].includes(error.status)));

test('full notes: staged photo records persist separately and listing does not delete files or mutate content', async () => {
  const saved = await media.storeDevelopmentMedia(png, 'image/png', 'new\u0000 long photo.png'), directory = process.env.TMC_DEV_MEDIA_DIR;
  const bytesBefore = await readFile(join(directory, `${saved.id}.webp`));
  const records = await media.listDevelopmentMedia();
  assert.equal(records.length, 1); assert.equal(records[0].src, saved.src); assert.doesNotMatch(records[0].name, /\u0000/);
  const marker = join(directory, `${randomUUID()}.photo.json`); await writeFile(marker, '{broken');
  const external = join(folder, `${randomUUID()}.json`); await writeFile(external, 'untouched'); await symlink(external, join(directory, `${randomUUID()}.photo.json`));
  assert.equal((await media.listDevelopmentMedia()).length, 1);
  assert.deepEqual(await readFile(join(directory, `${saved.id}.webp`)), bytesBefore);
  assert.equal(await readFile(marker, 'utf8'), '{broken'); assert.equal(await readFile(external, 'utf8'), 'untouched');
});

for (const [label, bytes, mime] of [['empty', Buffer.alloc(0), 'font/woff2'], ['HTML', Buffer.from('<html><script>do not execute</script></html>'), 'font/woff2'], ['collection', Buffer.concat([Buffer.from('ttcf'), Buffer.alloc(64)]), 'font/ttf'], ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />'), 'image/svg+xml'], ['oversize', Buffer.alloc(4 * 1024 * 1024 + 1), 'font/woff2']]) test(`full notes: ${label} font is rejected at header boundary without executing a font parser`, () => assert.throws(() => fonts.inspectFontHeader(bytes, mime), error => [400, 413, 415].includes(error.status)));

const fontId = '12345678-1234-4234-8234-123456789abc';
const font = { id: 'font-used', name: 'Licensed QA fixture', src: `/api/fonts/${fontId}`, format: 'woff2' };
const fontRequest = (authorization, id = fontId) => new Request(`http://localhost/api/fonts/${id}`, { headers: authorization ? { authorization } : {} });
const fontContext = (id = fontId) => ({ params: Promise.resolve({ id }) });
function routes({ verify = async () => ({ uid: auth.TAYLOR_OWNER_UID }), state = () => ({ status: 'baseline', reason: 'not-published' }), enabled = true } = {}) {
  const calls = { read: 0, body: 0, write: 0, list: 0, public: 0 };
  const overrides = {
    '@/server/taylor-auth': { ...auth, verifyTaylorOwner: verify },
    '@/server/dev-media': { ...media, developmentMediaEnabled: () => enabled, requireDevelopmentMedia() { if (!enabled) throw new auth.TaylorApiError(503, 'Production storage is not connected.'); } },
    '@/server/dev-fonts': { ...fonts, readDevelopmentFont: async () => { calls.read++; return { bytes: Buffer.from('inert fixture, not a parsed font'), contentType: 'font/woff2', format: 'woff2' }; }, readFontBody: async () => { calls.body++; return { bytes: Buffer.from('inert fixture'), contentType: 'font/woff2' }; }, storeDevelopmentFont: async () => { calls.write++; return font; }, listDevelopmentFonts: async () => { calls.list++; return [font]; } },
    '@/server/published-site': { readPublishedSite: async () => { calls.public++; return state(); } },
  };
  const loader = sourceLoader(overrides);
  return { calls, upload: loader('src/app/api/taylor/fonts/route.ts'), read: loader('src/app/api/fonts/[id]/route.ts') };
}
const upload = headers => new Request('http://localhost/api/taylor/fonts', { method: 'POST', headers: { 'content-type': 'font/woff2', ...headers }, body: 'inert' });
test('full notes: font upload requires owner and same-origin before body/storage without a rights checkbox', async () => {
  for (const status of [401, 403]) {
    const r = routes({ verify: async () => { throw new auth.TaylorApiError(status, 'Denied'); } });
    assert.equal((await r.upload.POST(upload({}))).status, status);
    assert.equal((await r.upload.GET(new Request('http://localhost/api/taylor/fonts'))).status, status);
    assert.deepEqual(r.calls, { read: 0, body: 0, write: 0, list: 0, public: 0 });
  }
  const r = routes();
  assert.equal((await r.upload.POST(upload({ origin: 'https://untrusted.example' }))).status, 403);
  assert.equal(r.calls.body, 0); assert.equal(r.calls.write, 0);
  const response = await r.upload.POST(upload({ origin: 'http://localhost' }));
  assert.equal(response.status, 201); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(r.calls.write, 1);
});
test('full notes: public font access requires currently published used font, auth failure never falls back publicly', async () => {
  const value = load('src/owner/defaults.ts').createDefaultOwnerContent(), model = load('src/owner/model.ts');
  value.fonts = [font]; value.design = { bodyFontId: font.id }; let state = { status: 'baseline', reason: 'not-published' };
  const r = routes({ state: () => state });
  assert.equal((await r.read.GET(fontRequest(), fontContext())).status, 404); assert.equal(r.calls.read, 0);
  assert.equal((await r.read.GET(fontRequest('Bearer owner-fixture'), fontContext())).status, 200);
  state = { status: 'published', snapshot: model.createPublishedOwnerSnapshot(value, 1) };
  const publicResponse = await r.read.GET(fontRequest(), fontContext()); assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('content-type'), 'font/woff2'); assert.equal(publicResponse.headers.get('cross-origin-resource-policy'), 'same-origin'); assert.equal(publicResponse.headers.get('x-content-type-options'), 'nosniff');
  state = { status: 'error', message: 'unavailable' }; assert.equal((await r.read.GET(fontRequest(), fontContext())).status, 404);
  delete value.design; state = { status: 'published', snapshot: model.createPublishedOwnerSnapshot(value, 2) }; assert.equal((await r.read.GET(fontRequest(), fontContext())).status, 404);
  const denied = routes({ state: () => state, verify: async () => { throw new auth.TaylorApiError(403, 'Wrong owner'); } });
  assert.equal((await denied.read.GET(fontRequest('Bearer wrong'), fontContext())).status, 403); assert.equal(denied.calls.public, 0); assert.equal(denied.calls.read, 0);
});
test('full notes: production font storage remains off and invalid IDs never touch disk', async () => {
  const blocked = routes({ enabled: false }); assert.equal((await blocked.upload.POST(upload({}))).status, 503); assert.equal(blocked.calls.body, 0);
  assert.equal((await blocked.read.GET(fontRequest('Bearer fixture'), fontContext())).status, 503); assert.equal(blocked.calls.read, 0);
  const r = routes(); for (const id of ['../escape', 'not-an-id', `${fontId}.woff2`, '']) assert.equal((await r.read.GET(fontRequest('Bearer fixture', id), fontContext(id))).status, 404);
  assert.equal(r.calls.read, 0);
});
