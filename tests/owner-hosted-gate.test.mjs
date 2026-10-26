import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';

// Source-hook tests only: the real gate/config/session verifier use mocked SDK
// boundaries. No Firebase request, real credential, browser login or cloud write.
const flush = () => new Promise(resolve => setImmediate(resolve));
const ownerUid = 'a4ARjp0z8ZOByKlC2AfGzmMRj843';
const environment = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'taylor-made-creations.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'taylor-made-creations',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'taylor-made-creations.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '419542649730',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:419542649730:web:44fcea3e91247c36429d9b',
  NEXT_PUBLIC_OWNER_UID: ownerUid,
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(settings = environment) {
  const h = harness();
  h.process.env = { NODE_ENV: 'production', ...settings };
  const auth = { currentUser: null }, db = {}, stores = [];
  const calls = { app: 0, auth: 0, listeners: 0, children: 0, signIn: 0, signOut: 0, reload: 0, token: 0 };
  let observer, signInResult = Promise.resolve(), signOutResult = Promise.resolve();
  h.overrides['firebase/app'] = {
    getApps: () => [],
    initializeApp: (options, name) => { calls.app++; return { options, name }; },
  };
  h.overrides['firebase/auth'] = {
    browserSessionPersistence: { type: 'SESSION' },
    initializeAuth: (_app, options) => { calls.auth++; assert.equal(options.persistence.type, 'SESSION'); return auth; },
    onAuthStateChanged: (actual, callback) => {
      assert.equal(actual, auth); calls.listeners++; observer = callback;
      return () => { calls.listeners--; observer = undefined; };
    },
    signInWithEmailAndPassword: async (actual, email, password) => {
      assert.equal(actual, auth); assert.equal(email, 'owner@example.test'); assert.equal(password, 'test-only-input');
      calls.signIn++; await signInResult;
    },
    signOut: async actual => { assert.equal(actual, auth); calls.signOut++; await signOutResult; },
  };
  h.overrides['firebase/firestore/lite'] = { getFirestore: () => db };
  h.overrides['./firebase-store'] = {
    createFirebaseOwnerStore: client => {
      assert.equal(client.auth, auth); assert.equal(client.db, db); assert.equal(client.ownerUid, ownerUid);
      const store = { disposed: false, dispose() { this.disposed = true; } }; stores.push(store); return store;
    },
  };
  h.overrides['./OwnerBrandLogo'] = { OwnerBrandLogo: () => null };
  h.overrides['./OwnerGateFrame'] = { OwnerGateFrame: () => null };
  const Gate = h.load('src/owner/FirebaseOwnerGate.tsx').FirebaseOwnerGate;
  const children = session => { calls.children++; return { type: 'private-workspace', props: { children: 'PRIVATE DRAFT', session } }; };
  const render = () => h.render(Gate, { children });
  const session = () => h.tree.type?.name === 'SessionContent' ? h.tree.props : null;
  const owner = () => ({
    uid: ownerUid, email: 'owner@example.test',
    reload: async () => { calls.reload++; },
    getIdToken: async force => { assert.equal(force, true); calls.token++; return 'mock-token'; },
  });
  const emit = user => { assert.ok(observer); auth.currentUser = user; observer(user); };
  const locked = () => {
    assert.equal(session(), null); assert.equal(calls.children, 0);
    assert.doesNotMatch(content(h.tree), /PRIVATE DRAFT/);
  };
  return {
    h, auth, calls, stores, render, session, owner, emit, locked,
    async start() { render(); await flush(); render(); },
    set signInResult(value) { signInResult = value; },
    set signOutResult(value) { signOutResult = value; },
  };
}

test('production setup fails closed with project ID only and lists all six missing public settings', async () => {
  const t = fixture({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  await t.start(); t.locked();
  assert.match(content(t.h.tree), /A little setup first/);
  for (const name of Object.keys(environment).filter(name => name !== 'NEXT_PUBLIC_FIREBASE_PROJECT_ID')) assert.ok(content(t.h.tree).includes(name), name);
  assert.equal(t.calls.app, 0); assert.equal(t.calls.auth, 0); assert.equal(t.stores.length, 0);
  t.h.unmount();
});

test('production anonymous session opens sign-in only, never a private store or child', async () => {
  const t = fixture(); await t.start(); t.locked();
  assert.match(content(t.h.tree), /Checking your owner sign-in/);
  t.emit(null); t.render(); t.locked();
  const form = t.h.find(node => node.type === 'form');
  assert.equal(typeof form.props.onSubmit, 'function'); // Native form submission includes Enter.
  assert.match(content(t.h.tree), /Head Floof Email/);
  assert.match(content(t.h.tree), /Pawsword/);
  assert.doesNotMatch(content(t.h.tree), /Sign in to edit your site|Only your approved owner account/);
  const email = t.h.find(node => node.type === 'input' && node.props.type === 'email');
  const password = t.h.find(node => node.type === 'input' && node.props.type === 'password');
  assert.equal(email.props.autoComplete, 'username'); assert.equal(email.props.required, true);
  assert.equal(password.props.autoComplete, 'current-password'); assert.equal(password.props.required, true);
  assert.equal(t.h.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  assert.equal(t.stores.length, 0); assert.equal(t.calls.reload, 0); assert.equal(t.calls.token, 0);
  t.h.unmount(); assert.equal(t.calls.listeners, 0);
});

test('production wrong UID is denied before fresh token checks or opening private storage', async () => {
  const t = fixture(); await t.start();
  t.emit({ ...t.owner(), uid: 'another-user' }); await flush(); t.render(); t.locked();
  assert.match(content(t.h.tree), /Owner access only/);
  assert.equal(t.calls.reload, 0); assert.equal(t.calls.token, 0); assert.equal(t.stores.length, 0);
  t.h.unmount();
});

test('approved UID opens private child only after reload and a forced fresh token succeed', async () => {
  const t = fixture(); await t.start();
  const reload = deferred(), token = deferred(), user = t.owner();
  user.reload = () => { t.calls.reload++; return reload.promise; };
  user.getIdToken = force => { assert.equal(force, true); t.calls.token++; return token.promise; };
  t.emit(user); t.render(); t.locked(); assert.equal(t.stores.length, 0); assert.equal(t.calls.token, 0);
  reload.resolve(); await flush(); t.render(); t.locked(); assert.equal(t.calls.token, 1); assert.equal(t.stores.length, 0);
  token.resolve('mock-token'); await flush(); t.render();
  assert.equal(t.stores.length, 1); assert.equal(t.session().store, t.stores[0]);
  assert.equal(t.session().userEmail, user.email);
  assert.match(content(t.h.tree.type(t.h.tree.props)), /PRIVATE DRAFT/);
  assert.equal(t.calls.children, 1);
  t.h.unmount(); assert.equal(t.stores[0].disposed, true); assert.equal(t.calls.listeners, 0);
});

test('auth changes and unmount prevent pending successful verification from opening a private workspace', async () => {
  for (const ending of ['signed-out', 'wrong-user', 'unmounted']) {
    const t = fixture(); await t.start(); const token = deferred(), user = t.owner();
    user.getIdToken = () => token.promise;
    t.emit(user); await flush(); t.render(); t.locked();
    if (ending === 'unmounted') t.h.unmount();
    else t.emit(ending === 'signed-out' ? null : { ...t.owner(), uid: 'another-user' });
    token.resolve('mock-token'); await flush();
    if (ending !== 'unmounted') { t.render(); t.locked(); t.h.unmount(); }
    assert.equal(t.stores.length, 0, ending); assert.equal(t.calls.children, 0, ending); assert.equal(t.calls.listeners, 0, ending);
  }
});

test('token or account verification failure stays locked without creating a private store', async () => {
  for (const method of ['reload', 'getIdToken']) {
    const t = fixture(); await t.start(); const user = t.owner();
    user[method] = async () => { throw Error('Mock verification unavailable'); };
    t.emit(user); await flush(); t.render(); t.locked();
    assert.match(content(t.h.tree), /private workspace is locked/); assert.equal(t.stores.length, 0);
    t.h.unmount();
  }
});

test('sign-out immediately disposes private storage, deduplicates clicks and stays locked on failure', async () => {
  for (const failure of [false, true]) {
    const t = fixture(); await t.start(); t.emit(t.owner()); await flush(); t.render();
    const pending = deferred(); t.signOutResult = pending.promise;
    const signOut = t.session().signOut, first = signOut(), duplicate = signOut();
    t.render(); t.locked();
    assert.equal(t.stores[0].disposed, true); assert.equal(t.calls.signOut, 1);
    assert.match(content(t.h.tree), /Signing out and locking/);
    if (failure) pending.reject(Error('Mock network unavailable')); else pending.resolve();
    await Promise.all([first, duplicate]); t.render(); t.locked();
    assert.match(content(t.h.tree), failure ? /Sign-out could not be confirmed/ : /Sign in to Taylor’s Space/);
    assert.equal(t.stores.length, 1);
    t.h.unmount();
  }
});

test('repeated sign-in is locked while pending and input password clears without exposing a workspace', async () => {
  const t = fixture(); await t.start(); t.emit(null); t.render();
  t.h.find(node => node.type === 'input' && node.props.type === 'email').props.onChange({ target: { value: ' owner@example.test ' } });
  t.h.find(node => node.type === 'input' && node.props.type === 'password').props.onChange({ target: { value: 'test-only-input' } });
  t.render();
  const pending = deferred(); t.signInResult = pending.promise;
  const submit = t.h.find(node => node.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} }), duplicate = submit({ preventDefault() {} });
  t.render(); t.locked();
  assert.equal(t.calls.signIn, 1); assert.equal(t.h.find(node => node.type === 'input' && node.props.type === 'password').props.value, '');
  assert.equal(t.h.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
  pending.reject({ code: 'auth/network-request-failed' }); await Promise.all([first, duplicate]); t.render(); t.locked();
  assert.match(content(t.h.tree), /Could not reach sign-in/); assert.equal(t.stores.length, 0);
  t.h.unmount();
});
