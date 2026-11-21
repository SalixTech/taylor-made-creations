import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
import { harness } from './owner-ui-harness.mjs';
const load = sourceLoader({}), model = load('src/client-hub/model.ts'), code = load('src/client-hub/code-input.ts');

test('compact codes normalize without damaging original case-sensitive legacy secrets', () => {
  const legacy = 'TMC-' + 'Ab_0'.repeat(8);
  assert.equal(model.normalizeClientHubCode(' a47-tes-621-rv '), 'A47-TES-621-RV');
  assert.equal(model.normalizeClientHubCode(legacy), legacy);
  assert.equal(model.isClientHubCode(legacy), true); assert.equal(model.isClientHubCode('A47-TES-621-RV'), true);
  for (const bad of ['TMC-0123456789ABCDEF', 'A47-TES-62-RV', 'A47-TE1-621-RV', 'A47-TES-621-R1']) assert.equal(model.isClientHubCode(bad), false);
  assert.deepEqual(code.pastedSignInCode('a47tes621rv'), { kind: 'compact', value: 'A47-TES-621-RV' });
  assert.deepEqual(code.pastedSignInCode(legacy), { kind: 'legacy', value: legacy });
  assert.equal(code.pastedSignInCode('https://example.com/?code=A47-TES-621-RV'), null);
});

test('segment parsing preserves fixed positions and constrains each field correctly', () => {
  assert.deepEqual(code.codeSegments('A47-TES-621-RV'), ['A47', 'TES', '621', 'RV']);
  assert.deepEqual(code.codeSegments('-t-9-'), ['', 'T', '9', '']);
  assert.equal(code.cleanCodeSegment('a4?', 0), 'A4'); assert.equal(code.cleanCodeSegment('1t.e', 1), 'TE');
  assert.equal(code.cleanCodeSegment('a123', 2), '123'); assert.equal(code.cleanCodeSegment('1rv', 3), 'RV');
  assert.equal(code.joinCodeSegments(['', '', '', '']), ''); assert.equal(code.joinCodeSegments(['A', '', '', '']), 'A---');
});

function fixture(value = '') {
  const h = harness(), changes = [], inputRef = { current: null };
  const Component = h.load('src/client-hub/SignInCodeFields.tsx').SignInCodeFields;
  const props = { value, onChange(next) { changes.push(next); props.value = next; }, disabled: false, show: false, invalid: false, inputRef, describedBy: 'help' };
  const render = () => h.render(Component, props); render();
  return { h, props, changes, render, inputs: () => h.all(n => n.type === 'input') };
}

test('four accessible code fields uppercase, advance, backspace, and paste a full code', () => {
  const t = fixture(); assert.equal(t.inputs().length, 4);
  t.inputs().forEach((input, i) => { assert.equal(input.props.required, true); assert.ok(input.props['aria-label']); assert.equal(input.props.maxLength, i === 3 ? 2 : 3); });
  let focus = 0;
  // Invoke callback refs explicitly; this source-hook harness does not mount React child refs.
  t.inputs().forEach((input, i) => input.props.ref({ focus() { focus = i; }, select() {} }));
  t.inputs()[0].props.onChange({ target: { value: 'a47' } }); assert.equal(t.changes.at(-1), 'A47---'); assert.equal(focus, 1);
  t.render(); t.inputs().forEach((input, i) => input.props.ref({ focus() { focus = i; }, select() {} }));
  t.inputs()[1].props.onKeyDown({ key: 'Backspace', preventDefault() {} }); assert.equal(t.changes.at(-1), 'A4---'); assert.equal(focus, 0);
  t.inputs()[0].props.onPaste({ clipboardData: { getData: () => 'a47-tes-621-rv' }, preventDefault() {} }); t.render();
  assert.deepEqual(t.inputs().map(input => input.props.value), ['A47','TES','621','RV']); t.h.unmount();
});

test('valid legacy paste retains original bytes without exposing an obsolete mode toggle', () => {
  const t = fixture(), legacy = 'TMC-' + 'Ab_0'.repeat(8);
  t.inputs()[0].props.onPaste({ clipboardData: { getData: () => legacy }, preventDefault() {} }); t.render();
  assert.equal(t.inputs().length, 1); assert.equal(t.inputs()[0].props.value, legacy); assert.equal(t.inputs()[0].props.autoCapitalize, 'none');
  assert.equal(t.h.all(n => n.type === 'button').length, 0);
  t.props.value = ''; t.render(); assert.equal(t.inputs().length, 4); assert.deepEqual(t.inputs().map(n => n.props.placeholder), ['GDT','TSE','621','FC']); t.h.unmount();
});
