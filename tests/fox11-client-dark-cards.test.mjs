import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './owner-ui-harness.mjs';

test('Client Hub and its window force dark without changing ordinary public or owner theme preferences', () => {
  const h = harness(); const calls = [];
  h.overrides['./ColorMode'] = { useColorMode(scope) { calls.push(scope); return 'light'; }, ColorModeToggle: function ColorModeToggle() {} };
  h.overrides['./PublicSiteContext'] = { usePublicOwnerContent: () => null };
  const { PublicSiteFrame } = h.load('src/components/PublicSiteFrame.tsx');
  for (const path of ['/client-hub', '/client-hub/anything', '/hub-window']) {
    h.pathname = path; h.render(PublicSiteFrame, { children: 'Hub' });
    assert.equal(h.tree.props['data-color-mode'], 'dark', path);
    assert.equal(h.all(node => node.type?.name === 'ColorModeToggle').length, 0, path);
  }
  h.pathname = '/gallery'; h.render(PublicSiteFrame, { children: 'Public' });
  assert.equal(h.tree.props['data-color-mode'], 'light');
  assert.equal(h.all(node => node.type?.name === 'ColorModeToggle').length, 1);
  h.pathname = '/taylor'; h.render(PublicSiteFrame, { children: 'Owner' });
  assert.equal(h.tree.props['data-color-mode'], undefined);
  assert.deepEqual(calls, ['hub','hub','hub','public','public']);
  h.unmount();
});

test('wrapping commission choices retain stable newest-first ordering, selection and disabled guard', () => {
  const h=harness(), {ProjectChoiceBar}=h.load('src/client-hub/ProjectChoiceBar.tsx'), selected=[];
  const projects=[{projectId:'old',title:'Old',status:'queued',createdAt:'2026-01-01'}, {projectId:'new',title:'New',status:'completed',createdAt:'2026-02-01'}];
  h.render(ProjectChoiceBar,{projects,selectedId:'old',onSelect:id=>selected.push(id),controls:'workspace'});
  const buttons=h.all(n=>n.type==='button'); assert.deepEqual(buttons.map(n=>n.props['aria-pressed']),[false,true]);
  buttons[0].props.onClick(); assert.deepEqual(selected,['new']);
  assert.deepEqual(projects.map(p=>p.projectId),['old','new']);
  h.render(ProjectChoiceBar,{projects,selectedId:'old',disabled:true,onSelect:id=>selected.push(id)});
  assert.ok(h.all(n=>n.type==='button').every(n=>n.props.disabled)); h.unmount();
});
