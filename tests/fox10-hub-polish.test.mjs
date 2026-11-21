import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './owner-ui-harness.mjs';
const src = path => readFileSync(new URL(`../src/${path}`, import.meta.url),'utf8');
test('custom confirmation cancels on dismissal and never approves the superseded action', async () => {
  const h = harness(); const { useConfirmAction } = h.load('src/client-hub/use-confirm-action.tsx'); let result;
  function Fixture() { result = useConfirmAction(); return result.confirmation; }
  h.render(Fixture); const first = result.confirm('First draft'); h.render(Fixture); const second = result.confirm('Newer draft'); h.render(Fixture);
  assert.equal(await first, false); h.tree.props.onClose(); h.render(Fixture); assert.equal(await second, false);
  const third = result.confirm('Keep?'); h.render(Fixture); h.tree.props.onConfirm(); assert.equal(await third, true);
  const fourth = result.confirm('Unmount'); h.unmount(); assert.equal(await fourth, false);
});
test('manual tags sort by chosen hierarchy without mutating stored tags', () => {
  const h = harness(), { InformationTags } = h.load('src/client-hub/InformationTags.tsx'); const tags=['paid-partial','dtd-needed','custom:Ready'];
  h.render(InformationTags,{ tags, order:['custom:Ready','dtd-needed','paid-partial'] });
  assert.deepEqual(h.all(n=>n.type==='li').map(n=>n.props['data-information-tag']), ['custom:Ready','dtd-needed','paid-partial']);
  assert.deepEqual(tags,['paid-partial','dtd-needed','custom:Ready']); h.unmount();
});
test('Hub UI keeps lifecycle explicit, private attachment scope and reusable folder semantics', () => {
  const owner = src('owner/OwnerClientHub.tsx'), workspace = src('client-hub/ProjectWorkspace.tsx'), files=src('client-hub/MakerChatAttachments.tsx');
  assert.ok(owner.includes('trackingEnabled: draft.trackingEnabled'));
  assert.doesNotMatch(owner,/activeMilestoneId: node\?\.id \?\? null, status:/);
  assert.doesNotMatch(owner,/window\.confirm/);
  assert.match(workspace,/project\.trackingEnabled !== false/);
  assert.match(workspace,/key = folderName/);
  assert.match(workspace,/getHubCommissionFolders\(stableProject\)/);
  assert.doesNotMatch(workspace,/Support attachments are also shared in Maker Chat|aria-label="Attach files to support/);
  assert.match(workspace,/attachmentIds: requestAttachments/);
  assert.match(workspace,/replyHubSupportRequest\(request, owner, body, operationId, attachmentIds\)/);
  assert.match(files,/Your copy was renamed\./); assert.doesNotMatch(files,/The other person’s name is unchanged/);
  assert.match(files,/fileName.length > 42/);
});
test('photo queue has local preview and explicit default save, not a preference write per override', () => {
  const queue = src('client-hub/ProgressPhotoQueue.tsx');
  assert.match(queue,/PrivateImageLightbox/); assert.match(queue,/URL.revokeObjectURL/);
  assert.match(queue,/Numbers continue across uploads for this commission; they do not restart with each batch/);
  assert.match(queue,/Make this my default/); assert.match(queue,/saveStudioSettings\(\{ photoNamingMode: chosen \}\)/);
  assert.match(queue,/function changeMode\(next:[\s\S]*?setMode\(next\); onChange\(files/);
  assert.match(queue,/Remove \$\{file.name\}/); assert.match(queue,/aria-label=\{`Replace \$\{file.name\}`\}/);
});
