import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sourceLoader } from "./scout-source-loader.mjs";
const C = "TMC-0000000000000001", P = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002", F = "00000000-0000-4000-8000-000000000003", ISO = "2026-10-27T10:00:00.000Z", CHUNK = 256 * 1024;
const project = { projectId: P, clientId: C, title: "Test", summary: "", status: "in-progress", progress: null, progressSource: "manual", trackingUrl: null, requestId: null, version: 1, createdAt: ISO, updatedAt: ISO };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(bytes = Buffer.from("<html>save only</html>"), fileName = "arbitrary.html") {
  const watchers = [], calls = [], progress = [], file = new File([bytes], fileName, { type: "text/html" }); let hook, valid = true, generation = 0, receivedBytes = 0, clientId = C;
  const attachment = { attachmentId: F, batchId: B, clientId: C, projectId: P, fileName: file.name, size: file.size, sha256: hash(bytes), senderRole: "client", createdAt: ISO, retentionEpisode: 0 };
  const session = (name, signal) => { const captured = generation; return ({ auth: { app: { name }, onAuthStateChanged(callback) { watchers.push(callback); return () => { const index = watchers.indexOf(callback); if (index >= 0) watchers.splice(index,1); }; } }, functions: { name }, session: { clientId }, assertCurrent: () => { if (signal?.aborted) throw new DOMException("cancelled", "AbortError"); if (!valid || generation !== captured) throw new Error("session changed"); } }); };
  const api = sourceLoader({
    "./client": { CLIENT_HUB_FUNCTIONS_REGION: "us-central1", ClientHubError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, verifiedClientHubConnection: async signal => session("tmc-client-hub", signal) },
    "./callable-owner-session": { hubCallableOwnerSession: async () => session("tmc-private-owner") },
    "firebase/functions": { getFunctions: app => ({ name: app.name }), httpsCallable: (functions, name, options) => async input => {
      calls.push({ functions, name, options, input }); const override = await hook?.(name, input); if (override !== undefined) return { data: override };
      if (name === "tmcHubBeginAttachmentBatch") return { data: { batchId: B, status: "staging", chunkBytes: CHUNK, files: [{ attachmentId: F, size: bytes.length, receivedBytes }] } };
      if (name === "tmcHubUploadAttachmentChunk") { receivedBytes = input.offset + Buffer.from(input.base64, "base64").length; return { data: { attachmentId: F, index: input.index, receivedBytes } }; }
      if (name === "tmcHubCommitAttachmentBatch") return { data: { batchId: B, attachments: [attachment] } };
      if (name === "tmcHubCancelAttachmentBatch") return { data: { batchId: B, status: "cancelled" } };
      if (name === "tmcHubDownloadAttachmentChunk") { const chunk = bytes.subarray(input.index * CHUNK, (input.index + 1) * CHUNK); return { data: { attachmentId: F, index: input.index, offset: input.index * CHUNK, size: bytes.length, fileName: file.name, contentType: "application/octet-stream", contentDisposition: "attachment", sha256: hash(chunk), fileSha256: hash(bytes), base64: chunk.toString("base64") } }; }
      return { data: { attachments: [attachment], nextCursor: null, retention: { episode: 0, state: "paused", completedAt: null, expiresAt: null, expiredThroughEpisode: -1, available: true, reason: null } } };
    } },
  })("src/client-hub/attachments-client.ts");
  return { api, file, attachment, calls, progress, watchers, options: { batchId: B, attachmentIds: [F], onProgress: value => progress.push(value) }, hook: value => { hook = value; }, expire: () => { valid = false; }, rotate: () => { generation++; }, clientId: value => { clientId = value; }, resume: value => { receivedBytes = value; } };
}
test("attachment frontend serially transfers bounded chunks, exact IDs and save-only arbitrary types", async () => {
  const f = fixture(Buffer.alloc(CHUNK + 7, 42)); const result = await f.api.uploadHubAttachments(project, false, [f.file], f.options);
  assert.equal(result.attachments[0].attachmentId, F); assert.deepEqual(f.calls.map(call => call.name), ["tmcHubBeginAttachmentBatch", "tmcHubUploadAttachmentChunk", "tmcHubUploadAttachmentChunk", "tmcHubCommitAttachmentBatch"]);
  const chunks = f.calls.filter(call => call.name === "tmcHubUploadAttachmentChunk"); assert.deepEqual(chunks.map(call => [call.input.index, call.input.offset]), [[0, 0], [1, CHUNK]]); assert.ok(chunks.every(call => Buffer.from(call.input.base64, "base64").length <= CHUNK));
  assert.ok(f.calls.every(call => call.functions.name === "tmc-client-hub")); assert.equal(f.progress.at(-1).phase, "complete");
  const owner = fixture(); await owner.api.listHubAttachments(project, true); assert.equal(owner.calls[0].functions.name, "tmc-private-owner");
});
test("attachment frontend resumes acknowledged chunks with the same manifest and never sends fullfile bodies", async () => {
  const f = fixture(Buffer.alloc(CHUNK + 7)); f.resume(CHUNK); await f.api.uploadHubAttachments(project, false, [f.file], f.options);
  const chunks = f.calls.filter(call => call.name === "tmcHubUploadAttachmentChunk"); assert.equal(chunks.length, 1); assert.equal(chunks[0].input.index, 1); assert.equal(f.calls[0].input.batchId, B); assert.equal("base64" in f.calls[0].input, false);
});
test("abort cancels the unpublished batch, but late abort cannot withdraw a send already committing", async () => {
  const f = fixture(Buffer.alloc(CHUNK + 7)), controller = new AbortController(); f.hook(name => { if (name === "tmcHubUploadAttachmentChunk") controller.abort(); });
  await assert.rejects(f.api.uploadHubAttachments(project, false, [f.file], { ...f.options, signal: controller.signal }), error => error.name === "AbortError");
  assert.equal(f.calls.at(-1).name, "tmcHubCancelAttachmentBatch"); assert.equal(f.calls.some(call => call.name === "tmcHubCommitAttachmentBatch"), false); assert.equal(f.progress.at(-1).phase, "cancelled");
  const g = fixture(), late = new AbortController(); g.hook(name => { if (name === "tmcHubCommitAttachmentBatch") late.abort(); });
  assert.ok(await g.api.uploadHubAttachments(project, false, [g.file], { ...g.options, signal: late.signal })); assert.equal(g.progress.at(-1).phase, "complete");
});
test("uncertain upload failure is not silently cancelled, enabling exact same-ID retry", async () => {
  const f = fixture(); f.hook(name => { if (name === "tmcHubUploadAttachmentChunk") throw new Error("network uncertain"); });
  await assert.rejects(f.api.uploadHubAttachments(project, false, [f.file], f.options), /network uncertain/); assert.equal(f.calls.some(call => call.name === "tmcHubCancelAttachmentBatch"), false);
  f.hook(undefined); await f.api.uploadHubAttachments(project, false, [f.file], f.options); assert.equal(f.calls.filter(call => call.name === "tmcHubBeginAttachmentBatch").every(call => call.input.batchId === B), true);
});
test("invalid counts/sizes, foreign sessions and stale response ownership fail without publishing", async () => {
  const f = fixture(); for (const files of [[], Array(6).fill(f.file), [new File([], "empty")], [new File([new Uint8Array(20 * 1024 * 1024 + 1)], "huge")]]) await assert.rejects(f.api.uploadHubAttachments(project, false, files, f.options)); assert.equal(f.calls.length, 0);
  f.clientId("TMC-0000000000000002"); await assert.rejects(f.api.listHubAttachments(project, false)); assert.equal(f.calls.length, 0);
  const g = fixture(); g.hook(() => { g.expire(); }); await assert.rejects(g.api.listHubAttachments(project, false), /session changed/);
});
test("attachment download verifies hashes/content policy then creates only a short-lived forced-download Blob", async t => {
  const f = fixture(Buffer.alloc(CHUNK + 3)); const created = [], revoked = [], clicks = [], nodes = [];
  const previous = globalThis.document; globalThis.document = { body: { appendChild: node => nodes.push(node) }, createElement: () => ({ style: {}, click() { clicks.push({ href: this.href, download: this.download }); }, remove() {} }) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  t.mock.method(URL, "createObjectURL", blob => { created.push(blob); return "blob:fixture"; }); t.mock.method(URL, "revokeObjectURL", value => revoked.push(value)); t.mock.method(globalThis, "setTimeout", callback => { callback(); return 1; });
  await f.api.downloadHubAttachment(project, false, f.attachment);
  assert.equal(created.length, 1); assert.equal(created[0].type, "application/octet-stream"); assert.deepEqual(clicks, [{ href: "blob:fixture", download: "arbitrary.html" }]); assert.deepEqual(revoked, ["blob:fixture"]); assert.equal(nodes.length, 1);
  assert.equal(f.calls.length, 3); assert.deepEqual(f.calls.map(call => call.input.index), [0, 1, 0]); assert.ok(f.calls.every(call => call.name === "tmcHubDownloadAttachmentChunk"));
});
test("invalid or cancelled download bytes never become a Blob or inline preview", async t => {
  let creates = 0; t.mock.method(URL, "createObjectURL", () => { creates++; return "blob:never"; });
  for (const patch of [{ contentType: "text/html" }, { contentDisposition: "inline" }, { sha256: "bad" }, { base64: "<html>" }, { attachmentId: P }]) { const f = fixture(); f.hook(name => name === "tmcHubDownloadAttachmentChunk" ? { attachmentId: F, index: 0, offset: 0, size: f.file.size, fileName: f.file.name, contentType: "application/octet-stream", contentDisposition: "attachment", fileSha256: f.attachment.sha256, sha256: f.attachment.sha256, base64: Buffer.from("<html>save only</html>").toString("base64"), ...patch } : undefined); await assert.rejects(f.api.downloadHubAttachment(project, false, f.attachment)); }
  assert.equal(creates, 0);
});

test("a same-account re-login between chunks never adopts a newer session or publishes a stale transfer", async () => {
  const f = fixture(Buffer.alloc(CHUNK + 7));
  await assert.rejects(f.api.uploadHubAttachments(project, false, [f.file], { ...f.options, onProgress: value => { if (value.phase === "uploading" && value.uploadedBytes === CHUNK) f.rotate(); } }), /session changed/);
  assert.equal(f.calls.filter(call => call.name === "tmcHubUploadAttachmentChunk").length, 1);
  assert.equal(f.calls.some(call => call.name === "tmcHubCommitAttachmentBatch"), false);
});

test("final authoritative attachment check after hashing can deny expiry/reset before any save-only Blob", async t => {
  const f = fixture(); let downloads = 0, creates = 0; t.mock.method(URL, "createObjectURL", () => { creates++; return "blob:never"; });
  f.hook(name => { if (name === "tmcHubDownloadAttachmentChunk" && ++downloads === 2) throw Object.assign(new Error("Attachment expired during hashing"), { code: "functions/failed-precondition" }); });
  await assert.rejects(f.api.downloadHubAttachment(project, false, f.attachment), /expired during hashing/); assert.equal(downloads, 2); assert.equal(creates, 0);
});

test("Fox9 rename binds the active copy, expected name and immutable descriptor", async () => {
  const f = fixture();
  f.hook((name, input) => name === "tmcHubRenameAttachment" ? { attachment: { ...f.attachment, fileName: input.fileName } } : undefined);
  const result = await f.api.renameHubAttachment(project, true, f.attachment, "My reference.html");
  assert.equal(result.fileName, "My reference.html");
  assert.deepEqual(f.calls[0].input, { projectId: P, attachmentId: F, expectedFileName: "arbitrary.html", fileName: "My reference.html" });
  assert.equal(f.calls[0].functions.name, "tmc-private-owner");
  const bad = fixture(); bad.hook(name => name === "tmcHubRenameAttachment" ? { attachment: { ...bad.attachment, fileName: "Wrong.html" } } : undefined);
  await assert.rejects(bad.api.renameHubAttachment(project, false, bad.attachment, "Expected.html"), /not confirmed/);
  const invalid = fixture(); await assert.rejects(invalid.api.renameHubAttachment(project, false, invalid.attachment, "../wrong.html")); assert.equal(invalid.calls.length, 0);
  const stale = fixture(); stale.hook(() => { stale.rotate(); }); await assert.rejects(stale.api.renameHubAttachment(project, false, stale.attachment, "New.html"), /session changed/);
});

test('saved attachment raster previews reuse hash/auth/final expiry verification and never create download anchors',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);const f=fixture(png,'fox.png');const blob=await f.api.loadHubAttachmentPreview(project,false,f.attachment);assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),png);assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.name==='tmcHubDownloadAttachmentChunk'));
 const bad=fixture(Buffer.from('<html>not png</html>'),'fox.png');await assert.rejects(bad.api.loadHubAttachmentPreview(project,false,bad.attachment),/supported raster/);
 for(const name of ['fox.svg','fox.html','fox.pdf']) {const x=fixture(png,name);await assert.rejects(x.api.loadHubAttachmentPreview(project,false,x.attachment),/no available image preview/);assert.equal(x.calls.length,0);}
});
test('raster preview rejects altered hashes, post-read access denial, expired copies and session rotation',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const expired=fixture(png,'fox.png');await assert.rejects(expired.api.loadHubAttachmentPreview(project,false,{...expired.attachment,expiresAt:'2020-01-01T00:00:00.000Z'}));assert.equal(expired.calls.length,0);
 const bad=fixture(png,'fox.png');bad.hook(name=>name==='tmcHubDownloadAttachmentChunk'?{sha256:'wrong'}:undefined);await assert.rejects(bad.api.loadHubAttachmentPreview(project,false,bad.attachment));
 const denied=fixture(png,'fox.png');let reads=0;denied.hook(name=>{if(name==='tmcHubDownloadAttachmentChunk'&&++reads===2)throw Error('Copy expired or deleted');});await assert.rejects(denied.api.loadHubAttachmentPreview(project,false,denied.attachment),/expired or deleted/);
 const changed=fixture(png,'fox.png');changed.hook(name=>{if(name==='tmcHubDownloadAttachmentChunk')changed.rotate();});await assert.rejects(changed.api.loadHubAttachmentPreview(project,false,changed.attachment),/session changed/);
});
test('displayed preview auth watcher invalidates on both owner and client session rotation and releases its listener',async()=>{
 for(const owner of [true,false]){const f=fixture();let invalid=0;const stop=await f.api.watchHubFileSession(project,owner,()=>invalid++);assert.equal(f.watchers.length,1);f.watchers[0]();assert.equal(invalid,0);f.rotate();f.watchers[0]();assert.equal(invalid,1);stop();assert.equal(f.watchers.length,0);}
});

test('Fox15 foreground preview bypasses a held background RPC, preserving final confirmation and two-transfer bound',async()=>{
 const png=Buffer.alloc(CHUNK+8);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 const f=fixture(png,'fox.png');let release,entered;const holding=new Promise(r=>release=r),started=new Promise(r=>entered=r);let first=true;
 f.hook(async name=>{if(name==='tmcHubDownloadAttachmentChunk'&&first){first=false;entered();await holding;}});
 const background=f.api.loadHubAttachmentPreview(project,false,f.attachment,undefined,'background');await started;
 const foreground=await f.api.loadHubAttachmentPreview(project,false,f.attachment);
 assert.equal(foreground.size,png.length);assert.equal(f.calls.length,4,'held background first call + foreground chunks0,1 and final0');
 release();await background;assert.equal(f.calls.length,6);
});
test('Fox15 queued original rechecks captured auth and abort before allocating or reading',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]),f=fixture(png,'fox.png');let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);let first=true;
 f.hook(async()=>{if(first){first=false;entered();await gate;}});
 const firstRead=f.api.loadHubAttachmentPreview(project,false,f.attachment,undefined,'background');await start;
 const abort=new AbortController(),queued=f.api.loadHubAttachmentPreview(project,false,f.attachment,abort.signal,'background');
 await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(queued,{name:'AbortError'});assert.equal(f.calls.length,1);
 f.rotate();release();await assert.rejects(firstRead,/session changed/);assert.equal(f.calls.length,1);
});
test('Fox15 non-aborted queued preview cannot adopt a new login when its reserved lane opens',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]),f=fixture(png,'fox.png');let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);let first=true;
 f.hook(async()=>{if(first){first=false;entered();await gate;}});
 const a=f.api.loadHubAttachmentPreview(project,false,f.attachment,undefined,'background');await start;
 const b=f.api.loadHubAttachmentPreview(project,false,f.attachment,undefined,'background');
 const deniedA=assert.rejects(a,/session changed/),deniedB=assert.rejects(b,/session changed/);
 await new Promise(r=>setImmediate(r));f.rotate();release();await Promise.all([deniedA,deniedB]);assert.equal(f.calls.length,1);
});
