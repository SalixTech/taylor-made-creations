import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';

// Source-hook tests only. Every Firebase and HTTP operation below is mocked.
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(t, component, options = {}) {
  const h = harness(); let reads = 0, sessions = 0, requests = [], ownerActive = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return options.fetch ? options.fetch(url, init) : Response.json({ ok: true, auth: 'verified', email: { configured: false, delivery: 'not-verified' } }); };
  t.after(() => { h.unmount(); globalThis.fetch = originalFetch; });
  h.overrides['./taylor-services-client'] = {
    async taylorOwnerSession() { sessions++; if (options.session) await options.session(); return { db: {}, token: 'mock-id-token', assertCurrent() { if (!ownerActive) throw new Error('Your owner session changed.'); } }; },
    serviceReadError(error, feature) { return error?.code === 'permission-denied' ? `${feature} is not connected for this account yet. Check deployed Firestore rules.` : error.message; },
    async responseObject(response) { const result = await response.json(); if (!response.ok || result.ok !== true) throw new Error(result.message || 'Not confirmed'); return result; },
  };
  h.overrides['./cloud-files-client'] = { async checkCloudStorage() { if (options.storageCheck) return options.storageCheck(); throw new Error('Storage read was not accepted.'); } };
  h.overrides['./firebase-store'] = { OWNER_CLOUD_DOCUMENT: 'ownerWorkspace/current' };
  h.overrides['firebase/firestore/lite'] = {
    doc(_db, path) { assert.equal(path, 'ownerWorkspace/current'); return path; },
    async getDoc() { reads++; if (options.read) return options.read(); return { exists: () => true }; },
    collection(_db, name) { assert.equal(name, 'commissionRequests'); return name; },
    limit(value) { assert.equal(value, 50); return value; }, query(...args) { return args; },
    async getDocs() { reads++; if (options.read) return options.read(); return { docs: [] }; },
  };
  const Component = h.load(`src/owner/${component}.tsx`)[component];
  const render = (props = {}) => h.render(Component, props);
  const button = label => h.find(node => node.type === 'button' && content(node).trim().endsWith(label));
  return { h, render, button, options, get reads() { return reads; }, get sessions() { return sessions; }, get requests() { return requests; }, endSession() { ownerActive = false; } };
}

test('service refresh checks real mocked auth/read evidence and never sends a test email', async t => {
  const view = setup(t, 'TaylorServices'); view.render(); await flush(); view.render();
  assert.equal(view.reads, 1); assert.equal(view.requests.length, 1);
  assert.equal(view.requests[0].url, '/api/taylor/services');
  assert.equal(view.requests[0].init.method, undefined);
  assert.equal(view.requests[0].init.headers.Authorization, 'Bearer mock-id-token');
  assert.match(content(view.h.tree), /Session verified/); assert.match(content(view.h.tree), /Read confirmed/);
  assert.match(content(view.h.tree), /Needs attention/); assert.match(content(view.h.tree), /Setup needed/);
  assert.doesNotMatch(content(view.h.tree), /Operational|All systems/);
});

test('configured email is not called healthy or delivery verified', async t => {
  const view = setup(t, 'TaylorServices', { fetch: async () => Response.json({ ok: true, auth: 'verified', email: { configured: true, delivery: 'not-verified' } }) });
  view.render(); await flush(); view.render();
  assert.match(content(view.h.tree), /Configured · unverified/);
  assert.match(content(view.h.tree), /Provider availability and inbox delivery have not been verified/);
  assert.equal(view.requests.length, 1);
});

test('failed refresh replaces old green read state and preserves uncertainty', async t => {
  const view = setup(t, 'TaylorServices'); view.render(); await flush(); view.render();
  view.options.read = async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); };
  view.options.fetch = async () => Response.json({ ok: false, message: 'Owner verification unavailable' }, { status: 503 });
  view.button('Check again').props.onClick(); await flush(); view.render();
  assert.doesNotMatch(content(view.h.tree), /Read confirmed|Session verified/);
  assert.match(content(view.h.tree), /Not connected/); assert.match(content(view.h.tree), /Could not verify/);
});

test('inbox empty means a confirmed read, not a missing collection permission', async t => {
  const view = setup(t, 'CommissionRequests'); view.render(); await flush(); view.render();
  assert.equal(view.reads, 1); assert.match(content(view.h.tree), /No requests yet/); assert.match(content(view.h.tree), /read successfully and is empty/);
  assert.match(content(view.h.tree), /Public request submission is not connected yet/);
  view.options.read = async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); };
  view.button('Refresh inbox').props.onClick(); await flush(); view.render();
  assert.doesNotMatch(content(view.h.tree), /No requests yet/);
  assert.match(content(view.h.tree), /Inbox not connected/); assert.match(content(view.h.tree), /not a confirmed empty inbox/);
});

test('inbox displays only returned records, treats HTML as text, and does not reply or write', async t => {
  const view = setup(t, 'CommissionRequests', { read: async () => ({ docs: [{ id: 'real-doc', data: () => ({ name: '<script>test</script>', email: 'customer@example.test', description: 'A blue wolf.', createdAt: '2026-10-01T12:00:00Z' }) }] }) });
  view.render(); await flush(); view.render();
  assert.match(content(view.h.tree), /<script>test<\/script>/); assert.match(content(view.h.tree), /A blue wolf/); assert.match(content(view.h.tree), /real-doc/);
  assert.equal(view.requests.length, 0); assert.equal(view.h.all(node => node.props?.dangerouslySetInnerHTML).length, 0);
  assert.equal(view.h.all(node => node.type === 'button').length, 5);
  assert.ok(view.button('Approve')); assert.ok(view.button('Deny')); assert.ok(view.button('Waitlist'));
  assert.match(content(view.h.tree), /do not send replies, create contracts, or charge customers/);
});

test('inbox repeated refresh is locked and session changes fail closed', async t => {
  const gate = deferred(); const view = setup(t, 'CommissionRequests', { read: () => gate.promise });
  view.render(); await flush(); const refresh = view.button('Checking…').props.onClick; refresh(); refresh();
  assert.equal(view.reads, 1); view.endSession(); gate.resolve({ docs: [{ id: 'late', data: () => ({ name: 'SHOULD NOT SHOW' }) }] });
  await flush(); view.render(); assert.doesNotMatch(content(view.h.tree), /SHOULD NOT SHOW/); assert.match(content(view.h.tree), /session changed/);
});

test('help button is explicit, double-click locked, minimal, and reports acceptance not delivery', async t => {
  const gate = deferred(); const view = setup(t, 'HelpButton', { fetch: () => gate.promise });
  view.render(); assert.equal(view.requests.length, 0);
  const click = view.button('Ask Salix For Help').props.onClick; click(); click(); await flush(); view.render();
  assert.equal(view.requests.length, 1); assert.equal(view.button('Asking Salix…').props.disabled, true);
  const request = view.requests[0]; assert.equal(request.url, '/api/taylor/help'); assert.equal(request.init.method, 'POST');
  assert.deepEqual(Object.keys(JSON.parse(request.init.body)), ['requestId']);
  assert.equal(request.init.headers.Authorization, 'Bearer mock-id-token');
  gate.resolve(Response.json({ ok: true, status: 'accepted' })); await flush(); view.render();
  assert.match(content(view.h.tree), /accepted for sending/); assert.match(content(view.h.tree), /delivery is not yet confirmed/);
});

test('help provider error does not show success and retry keeps its request ID', async t => {
  const view = setup(t, 'HelpButton', { fetch: async () => Response.json({ ok: false, message: 'Email not connected. No email has been sent.' }, { status: 503 }) });
  view.render(); view.button('Ask Salix For Help').props.onClick(); await flush(); view.render();
  assert.match(content(view.h.tree), /No email has been sent/); assert.doesNotMatch(content(view.h.tree), /accepted for sending/);
  view.button('Ask Salix For Help').props.onClick(); await flush(); view.render();
  assert.equal(view.requests.length, 2);
  assert.equal(JSON.parse(view.requests[0].init.body).requestId, JSON.parse(view.requests[1].init.body).requestId);
});

test('help makes no outbound request when session fails or component unmounts before verification', async t => {
  const gate = deferred(); const view = setup(t, 'HelpButton', { session: () => gate.promise });
  view.render(); view.button('Ask Salix For Help').props.onClick(); view.h.unmount(); gate.resolve();
  await flush(); assert.equal(view.requests.length, 0);
});

test('help refuses malformed success receipts', async t => {
  const view = setup(t, 'HelpButton', { fetch: async () => Response.json({ ok: true, status: 'unknown' }) });
  view.render(); view.button('Ask Salix For Help').props.onClick(); await flush(); view.render();
  assert.match(content(view.h.tree), /did not confirm/); assert.doesNotMatch(content(view.h.tree), /accepted for sending/);
});


test('cloud read checks do not claim a completed upload or connected backup', async t => {
  const view = setup(t, 'TaylorServices', { storageCheck: async () => 'Firestore file-list read and Storage read probe succeeded. Upload writing is confirmed only after a successful upload. Backups are not configured by this patch.', fetch: async () => Response.json({ ok: true, auth: 'verified', files: 'development-disk', email: { configured: false } }) });
  view.render(); await flush(); view.render();
  assert.match(content(view.h.tree), /Read checks passed/);
  assert.match(content(view.h.tree), /Upload writing is confirmed only after a successful upload/);
  assert.match(content(view.h.tree), /Backups are not configured/);
  assert.equal(view.requests.length, 1);
  assert.equal(view.requests[0].init.method, undefined);
});


test('help feedback goes to the workspace callback instead of stretching the sidebar', async t => {
  const feedback = []; const props = { onFeedback: value => feedback.push(value) };
  const view = setup(t, 'HelpButton', { fetch: async () => Response.json({ok:false,message:'Help email is not connected yet.'}, {status:503}) });
  view.render(props); view.button('Ask Salix For Help').props.onClick(); await flush(); view.render(props);
  assert.deepEqual(feedback, [{kind:'error',message:'Help email is not connected yet.'}]);
  assert.doesNotMatch(content(view.h.tree), /Help email is not connected yet/);
  assert.equal(view.h.all(node => node.props?.role === 'alert').length, 0);
});

test('browser sign-in and private database can pass while server verification explicitly fails', async t => {
  const view = setup(t, 'TaylorServices', { fetch: async () => Response.json({ ok: false, code: 'verification-unavailable', message: 'Server verification is unavailable.' }, { status: 503 }) });
  view.render(); await flush(); view.render();
  assert.match(content(view.h.tree), /Owner sign-inSigned in/);
  assert.match(content(view.h.tree), /Server verificationCould not verify/);
  assert.match(content(view.h.tree), /Cloud workspaceRead confirmed/);
  assert.doesNotMatch(content(view.h.tree), /Session verified/);
  assert.match(content(view.h.tree), /Email configuration could not be checked while server verification is unavailable/);
});
