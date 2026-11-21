import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, content, nodes } from './owner-ui-harness.mjs';
import { sourceLoader } from './scout-source-loader.mjs';
const { DEFAULT_HUB_MILESTONES, validateHubMilestones } = sourceLoader()('src/client-hub/model.ts');

test('Fox9 saved node removal asks in-app before changing draft, cancel keeps it; new nodes remove directly', () => {
  const h = harness(), Editor = h.load('src/owner/HubMilestoneEditor.tsx').HubMilestoneEditor;
  let value = DEFAULT_HUB_MILESTONES.map(node => ({ ...node }));
  const render = () => h.render(Editor, { value, savedIds: DEFAULT_HUB_MILESTONES.map(node => node.id), onChange: next => { value = next; } });
  render();
  h.find(node => node.props['aria-label'] === 'Remove Making').props.onClick(); render();
  assert.equal(value.length, 5);
  let dialog = h.find(node => node.props.title === 'Remove this milestone?'); assert.ok(dialog);
  dialog.props.onClose(); render(); assert.equal(value.length, 5);
  h.find(node => node.props['aria-label'] === 'Remove Making').props.onClick(); render();
  dialog = h.find(node => node.props.title === 'Remove this milestone?');
  nodes(dialog.props.actions).find(node => content(node) === 'Remove milestone' && node.type === 'button').props.onClick(); render();
  assert.equal(value.some(node => node.id === 'making'), false); validateHubMilestones(value);
  h.find(node => node.type === 'button' && content(node) === 'Add milestone').props.onClick(); render();
  h.find(node => node.props['aria-label'] === 'Remove New milestone').props.onClick(); render();
  assert.equal(value.some(node => node.label === 'New milestone'), false); assert.equal(h.find(node => node.props.title === 'Remove this milestone?'), undefined); h.unmount();
});

test('Fox9 custom stages use inline creation and persist category separately from lifecycle', async () => {
  const h = harness(), Editor = h.load('src/owner/HubMilestoneEditor.tsx').HubMilestoneEditor;
  let value = DEFAULT_HUB_MILESTONES.map(node => ({ ...node })); const render = () => h.render(Editor, { value, onChange: next => { value = next; } });
  const selects = () => h.all(node => node.props.label === 'Stage');
  render(); assert.equal(selects().length, 5);
  assert.ok(selects()[2].props.options.some(option => option.value === 'completed')); assert.ok(selects()[2].props.options.some(option => option.value === '__create__'), 'all display labels may be changed independently of lifecycle');
  selects()[1].props.inlineCreate.onStart(); render();
  selects()[1].props.inlineCreate.onNameChange('Fur cutting'); render();
  assert.equal(await selects()[1].props.inlineCreate.onSubmit(), true); render();
  assert.equal(value[1].stageLabel, 'Fur cutting'); assert.equal(value[1].status, 'in-progress'); validateHubMilestones(value);
  assert.ok(selects()[0].props.options.some(option => option.value === 'custom:Fur cutting'));
  selects()[1].props.onChange('on-hold'); render(); assert.equal(value[1].stageLabel, undefined); assert.equal(value[1].status, 'on-hold');
  selects()[1].props.inlineCreate.onStart(); render(); selects()[1].props.inlineCreate.onNameChange('Completed'); render();
  assert.equal(await selects()[1].props.inlineCreate.onSubmit(), false); render(); assert.match(selects()[1].props.inlineCreate.error, /standard stage/);
  for (const invalid of ['', ' padded ', 'bad\nname', 'a'.repeat(61)]) assert.throws(() => validateHubMilestones(value.map(node => node.id === 'making' ? { ...node, stageLabel: invalid } : node)));
  assert.throws(() => validateHubMilestones(value.map(node => node.id === 'completed' ? { ...node, stageLabel: 'New lifecycle' } : node))); h.unmount();
});

test('Fox9 card and defaults source preserve owner controls while removing decorative pills and browser defaults confirms', () => {
  const source = readFileSync('src/owner/OwnerClientHub.tsx','utf8'), css = readFileSync('src/owner/OwnerClientHub.module.css','utf8');
  assert.doesNotMatch(source, /View workspace<|Open Client Hub features|window\.confirm\("Discard (?:unsaved milestone|local milestone)/);
  assert.match(source, /className=\{styles\.projectOpen\}/); assert.match(source, /aria-label=\{`Open workspace:/);
  assert.match(source, /A little home for every dream/); assert.match(source, /title="Discard milestone changes\?"/);
  assert.match(css, /\.clientRow:disabled \{[^}]*background:transparent!important/);
  assert.match(css, /\.projectTags > ul \{[^}]*flex-direction:column/);
  assert.match(css, /\.project \.projectOpen:focus-visible/);
});

test('Fox9 restored studio card keeps its sentence break at compact widths',()=>{
 const css=readFileSync('src/owner/OwnerClientHub.module.css','utf8');
 assert.match(css,/\.root \.studioStats \.studioCallout > p br \{ display:initial; \}/);
});
