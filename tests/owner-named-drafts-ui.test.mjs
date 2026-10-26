import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content, nodes } from './owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ failedRead = false, dirty = false, savedCount = 1 } = {}) {
  const h = harness(); h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  let failRead = failedRead, failSaveCurrent = false, closeCount = 0;
  const loaded = [], calls = [], trash = [];
  let list = Array.from({ length: savedCount }, (_, i) => ({ id: `named-${i}`, name: `Draft ${i + 1}`, revision: 1, createdAt: '2026-10-25T18:00:00.000Z', updatedAt: '2026-10-25T18:00:00.000Z' }));
  const store = {
    async listNamedDrafts() { if (failRead) throw Error('Cloud draft index unavailable'); return structuredClone(list); },
    async listTrashedNamedDrafts() { return structuredClone(trash); },
    async loadNamedDraft(id) { calls.push(['load', id]); return { ...list.find(d => d.id === id), content: structuredClone(value) }; },
    async saveNamedDraft(name, data, options) { calls.push(['save', name, options]); const saved = { id: options?.id ?? `named-new-${list.length}`, name, revision: options ? options.expectedRevision + 1 : 1, createdAt: '2026-10-25T18:00:00.000Z', updatedAt: '2026-10-25T18:00:00.000Z' }; list = [saved, ...list.filter(d => d.id !== saved.id)]; return { ...saved, content: structuredClone(data) }; },
    async renameNamedDraft(id, name, revision) { calls.push(['rename', id, name, revision]); const old = list.find(d => d.id === id); Object.assign(old, { name, revision: revision + 1 }); return { ...old, content: structuredClone(value) }; },
    async deleteNamedDraft(id, revision) { calls.push(['archive', id, revision]); trash.push(list.find(d => d.id === id)); list = list.filter(d => d.id !== id); },
    async restoreNamedDraft(id, name) { calls.push(['restore', id, name]); const saved = { ...trash.find(d => d.id === id), id: `${id}-restored`, name, revision: 1 }; list.push(saved); return { ...saved, content: structuredClone(value) }; },
  };
  const Dialog = h.load('src/owner/NamedDraftsDialog.tsx').NamedDraftsDialog;
  const props = { store, content: value, dirty, onLoad(data, name) { loaded.push([data, name]); }, async onSaveCurrent() { calls.push(['save-current']); return !failSaveCurrent; }, onClose() { closeCount++; } };
  const render = () => h.render(Dialog, props);
  const button = label => [...nodes(h.tree), ...nodes(h.tree.props.actions)].find(n => n.type === 'button' && content(n).trim() === label);
  const field = label => h.find(n => typeof n.type === 'function' && n.type.name === 'Field' && n.props.label === label);
  render();
  return { h, props, render, button, field, loaded, calls, get list() { return list; }, get closeCount() { return closeCount; }, set failRead(v) { failRead = v; }, set failSaveCurrent(v) { failSaveCurrent = v; } };
}

async function open(options) { const t = setup(options); await flush(); t.render(); return t; }

test('failed initial cloud read cannot masquerade as an empty library or enable creation', async () => {
  const t = await open({ failedRead: true });
  t.field('Name this version').props.onChange('My idea'); t.render();
  assert.equal(t.button('Save as new draft').props.disabled, true);
  assert.match(content(t.h.tree), /Cloud draft index unavailable/);
  assert.doesNotMatch(content(t.h.tree), /A little room for your ideas|0\/10/);
  t.failRead = false; t.button('Refresh').props.onClick(); await flush(); t.render();
  assert.equal(t.button('Save as new draft').props.disabled, false); assert.match(content(t.h.tree), /1\/10/);
});

test('named draft removal requires confirmation and is restorable without loading or publishing', async () => {
  const t = await open();
  t.button('Remove').props.onClick(); t.render(); assert.equal(t.calls.length, 0);
  t.button('Cancel').props.onClick(); t.render(); assert.equal(t.calls.length, 0);
  t.button('Remove').props.onClick(); t.render(); t.button('Remove saved draft').props.onClick(); await flush(); t.render();
  assert.deepEqual(t.calls[0], ['archive', 'named-0', 1]); assert.equal(t.list.length, 0);
  const archived = [...nodes(t.h.tree)].find(n => n.type === 'button' && content(n).startsWith('Archived'));
  archived.props.onClick(); t.render(); t.button('Restore').props.onClick(); t.render();
  t.field('Restored draft name').props.onChange('Recovered idea'); t.render();
  t.button('Restore draft').props.onClick(); await flush(); t.render();
  assert.equal(t.list[0].name, 'Recovered idea'); assert.equal(t.loaded.length, 0);
});

test('dirty draft load preserves edits when saving fails and needs explicit discard alternative', async () => {
  const t = await open({ dirty: true }); t.failSaveCurrent = true;
  t.button('Load').props.onClick(); t.render(); assert.equal(t.calls.length, 0);
  t.button('Save current work & load').props.onClick(); await flush(); t.render();
  assert.deepEqual(t.calls, [['save-current']]); assert.equal(t.loaded.length, 0); assert.equal(t.closeCount, 0);
  assert.match(content(t.h.tree), /Nothing has been loaded or replaced/);
  t.button('Load without saving').props.onClick(); await flush(); t.render();
  assert.deepEqual(t.calls.at(-1), ['load', 'named-0']); assert.equal(t.loaded.length, 1); assert.equal(t.closeCount, 1);
});

test('ten-slot UI blocks new saves but explicit replacement carries the revision and locks duplicates', async () => {
  const t = await open({ savedCount: 10 });
  t.field('Name this version').props.onChange('Eleventh draft'); t.render();
  assert.equal(t.button('Save as new draft').props.disabled, true);
  t.button('Save here').props.onClick(); t.render(); assert.equal(t.calls.length, 0);
  const replace = t.button('Replace saved draft').props.onClick; replace(); replace(); await flush(); t.render();
  assert.equal(t.calls.filter(c => c[0] === 'save').length, 1);
  assert.deepEqual(t.calls[0], ['save', 'Draft 1', { id: 'named-0', expectedRevision: 1 }]);
});
