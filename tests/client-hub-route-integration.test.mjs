import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('canonical Client Hub is a private authentication entry independent of storefront construction', () => {
  const h = harness();
  const route = h.load('src/app/client-hub/page.tsx');
  const entry = route.default();
  assert.equal(entry.type.name, 'ClientHub');
  assert.deepEqual(entry.props, {});
  assert.deepEqual(route.metadata.robots, { index: false, follow: false });
  assert.equal(route.dynamic, 'force-dynamic');
});

test('construction entry offers only owner access without serializing private records', () => {
  const h = harness();
  const Component = h.load('src/components/UnderConstruction.tsx').UnderConstruction;
  h.render(Component);
  assert.ok(h.find(node => node.props.href === '/taylor'));
  assert.equal(h.find(node => node.props.href === '/client-hub'), undefined);
  assert.match(content(h.tree), /Pardon the fluff/);
  assert.doesNotMatch(content(h.tree), /signInCode|authVersion/);
});

test('Client Hub unsaved or one-time credentials guard navigation, refresh and owner sign-out', async () => {
  const h = harness(); h.window.location.href = '/taylor/client-hub';
  for (const name of ['HelpButton', 'TaylorServices', 'CommissionRequests']) h.overrides[`./${name}`] = { [name]: () => null };
  const saved = h.load('src/owner/defaults.ts').createInitialOwnerWorkspace();
  let signouts = 0;
  const props = { store: { load: async () => structuredClone(saved), subscribe: () => () => {} }, mode: 'cloud', userEmail: 'owner@example.test', initialSection: 'clients', onSignOut: async () => { signouts++; } };
  const Portal = h.load('src/owner/OwnerPortal.tsx').default;
  const render = () => h.render(Portal, props);
  render(); await flush(); render();
  const hub = () => h.find(node => node.type?.name === 'OwnerClientHub');
  assert.ok(hub());
  const leave = () => h.find(node => node.type === 'a' && node.props.href === '/taylor/inventory').props.onClick({ button: 0, preventDefault() {} });
  for (const flag of ['onDirtyChange', 'onBusyChange']) {
    hub().props[flag](true); leave(); render();
    assert.equal(h.window.location.href, '/taylor/client-hub');
    assert.match(content(h.tree), /Finish or cancel your Client Hub or integration changes/);
    const warning = h.find(node => node.type?.name === 'Dialog' && node.props.title === 'Stay here for a moment');
    assert.ok(warning, 'blocked navigation opens a viewport dialog rather than an offscreen success notice');
    warning.props.onClose(); render();
    assert.equal(h.window.location.href, '/taylor/client-hub');
    assert.equal(signouts, 0);
    const unload = new Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
    const signout = h.find(node => node.type === 'button' && content(node).trim() === 'Sign out');
    assert.ok(signout); signout.props.onClick(); render(); assert.equal(signouts, 0);
    hub().props[flag](false);
  }
  leave(); render(); assert.equal(h.window.location.href, '/taylor/inventory'); h.unmount();
});
