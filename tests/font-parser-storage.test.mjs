import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sourceLoader } from './scout-source-loader.mjs';
const font = sourceLoader()('src/server/dev-fonts.ts');
const keys = ['NODE_ENV', 'VERCEL', 'TMC_DEV_MEDIA_ENABLED', 'TMC_DEV_MEDIA_DIR'];
const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
let root;
const fixture = extension => readFile(new URL(`./fixtures/fonts/geometric.${extension}`, import.meta.url));
before(async () => { root = await mkdtemp(resolve('font-fixture-')); });
beforeEach(() => { process.env.NODE_ENV = 'development'; delete process.env.VERCEL; delete process.env.TMC_DEV_MEDIA_ENABLED; process.env.TMC_DEV_MEDIA_DIR = join(root, randomUUID()); });
after(async () => { for (const key of keys) if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; await rm(root, { recursive: true, force: true }); });
for (const extension of ['ttf', 'otf', 'woff', 'woff2']) test(`real fontkit worker validates generated ${extension} outlines; private disk/list/read preserves bytes`, async () => {
  const bytes = await fixture(extension);
  assert.deepEqual(await font.validateFont(bytes, `font/${extension}`), { format: extension, name: 'TMC Generated Fixture' });
  const result = await font.storeDevelopmentFont(bytes, `font/${extension}`);
  assert.equal(result.name, 'TMC Generated Fixture'); assert.equal(result.format, extension); assert.equal(result.bytes, bytes.length);
  assert.match(result.src, /^\/api\/fonts\/[a-f0-9-]{36}$/); assert.equal(result.storage, 'development-disk');
  const file = join(process.env.TMC_DEV_MEDIA_DIR, `${result.id}.${extension}`);
  assert.equal((await stat(file)).mode & 0o777, 0o600); assert.equal((await stat(process.env.TMC_DEV_MEDIA_DIR)).mode & 0o777, 0o700);
  assert.deepEqual((await font.readDevelopmentFont(result.id.toUpperCase())).bytes, bytes);
  assert.deepEqual(await font.listDevelopmentFonts(), [result]);
});
test('font parser rejects executable, archive, SVG, collections, MIME mismatch, truncated tables and appended payloads', async () => {
  const ttf = await fixture('ttf');
  const cases = [Buffer.from('MZ'+ 'x'.repeat(100)), Buffer.from('PK\x03\x04'+'x'.repeat(100)), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('ttcf'+'x'.repeat(100)), ttf.subarray(0, 30), Buffer.concat([ttf, Buffer.from('<script>alert(1)</script>')])];
  for (const bytes of cases) await assert.rejects(font.validateFont(bytes, 'font/ttf'), error => error.status === 415);
  await assert.rejects(font.validateFont(ttf, 'font/woff'), error => error.status === 415);
  await assert.rejects(font.validateFont(Buffer.alloc(0), 'font/ttf'), error => error.status === 400);
  await assert.rejects(font.validateFont(Buffer.alloc(font.MAX_FONT_BYTES + 1), 'font/ttf'), error => error.status === 413);
});
test('SFNT table checksums reject modified glyph/name payloads before parsing', async () => {
  const bytes = await fixture('ttf');
  for (const tag of ['glyf','name']) {
    const broken = Buffer.from(bytes), count = broken.readUInt16BE(4);
    for (let i=0; i<count; i++) if (broken.toString('ascii',12+i*16,16+i*16)===tag) {
      const offset = broken.readUInt32BE(20+i*16), length = broken.readUInt32BE(24+i*16);
      broken.fill(255, offset, offset+length);
    }
    await assert.rejects(font.validateFont(broken, 'font/ttf'), error => error.status === 415);
  }
});
test('WOFF and WOFF2 reject size mismatch, collection flavors, extreme expansions and corrupted compressed content', async () => {
  for (const ext of ['woff','woff2']) {
    const original = await fixture(ext);
    for (const mutate of [bytes => bytes.writeUInt32BE(0x7fffffff,16), bytes => bytes.writeUInt32BE(bytes.length+1,8), bytes => bytes.write('ttcf',4), bytes => bytes.fill(255, Math.floor(bytes.length/2))]) {
      const bytes = Buffer.from(original); mutate(bytes);
      await assert.rejects(font.validateFont(bytes, `font/${ext}`), error => error.status === 415);
    }
  }
});
test('font container table bounds, overlaps, duplicate and embedded SVG tags are rejected before parser', async () => {
  const original = await fixture('ttf');
  for (const mutate of [bytes => bytes.write('SVG ',12), bytes => bytes.writeUInt32BE(bytes.length+5,20), bytes => bytes.writeUInt32BE(1,20), bytes => bytes.copy(bytes,28,12,16), bytes => bytes.writeUInt32BE(bytes.readUInt32BE(20),36)]) {
    const bytes = Buffer.from(original); mutate(bytes);
    assert.throws(() => font.inspectFontHeader(bytes, 'font/ttf'), error => error.status === 415);
  }
});
test('stored font and metadata symlinks, changed files, invalid IDs and malformed records are denied', async () => {
  const stored = await font.storeDevelopmentFont(await fixture('ttf'), 'font/ttf'), dir = process.env.TMC_DEV_MEDIA_DIR;
  const filename = join(dir, `${stored.id}.ttf`), metadata = join(dir, `${stored.id}.font.json`);
  await rm(filename); const outside = join(root, randomUUID()); await writeFile(outside, await fixture('ttf')); await symlink(outside, filename);
  await assert.rejects(font.readDevelopmentFont(stored.id), error => error.status === 404); assert.deepEqual(await font.listDevelopmentFonts(), []);
  await rm(filename); await writeFile(filename, await fixture('ttf')); await rm(metadata); await symlink(outside, metadata);
  await assert.rejects(font.readDevelopmentFont(stored.id), error => error.status === 404); assert.deepEqual(await font.listDevelopmentFonts(), []);
  for (const id of ['../secret', `${stored.id}.ttf`, '', 'a'.repeat(1000)]) await assert.rejects(font.readDevelopmentFont(id), error => error.status === 404);
  await rm(metadata); await writeFile(metadata, JSON.stringify({...stored, format:'../../secret'}));
  assert.deepEqual(await font.listDevelopmentFonts(), []);
});
test('font storage never overwrites an existing UUID collision or deletes original bytes', async () => {
  const id=randomUUID(), dir=process.env.TMC_DEV_MEDIA_DIR; await mkdir(dir);
  const marker=Buffer.from('existing upload must not change'); await writeFile(join(dir,`${id}.ttf`),marker);
  const collision=sourceLoader({'node:crypto':{randomUUID:()=>id}})('src/server/dev-fonts.ts');
  await assert.rejects(collision.storeDevelopmentFont(await fixture('ttf'),'font/ttf'),error=>error.status===503);
  assert.deepEqual(await readFile(join(dir,`${id}.ttf`)),marker);
});
test('font stream enforces actual and declared size, aborts oversized stream, rejects multipart and incomplete bodies',async()=>{
  let canceled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(font.MAX_FONT_BYTES));c.enqueue(new Uint8Array(1));},cancel(){canceled=true;}});
  const request=new Request('http://localhost/api/taylor/fonts',{method:'POST',duplex:'half',headers:{'content-type':'font/ttf','content-length':'1'},body:stream});
  await assert.rejects(font.readFontBody(request),e=>e.status===413);assert.equal(canceled,true);
  for(const type of ['application/octet-stream','image/svg+xml','multipart/form-data','font/ttf; charset=utf-8'])await assert.rejects(font.readFontBody(new Request('http://localhost',{method:'POST',headers:{'content-type':type},body:'abc'})),e=>e.status===415);
  await assert.rejects(font.readFontBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'font/ttf','content-length':'2'},body:'abc'})),e=>e.status===400);
});
