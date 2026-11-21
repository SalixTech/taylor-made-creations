import {isStudioOwnerUid,STUDIO_OWNER_UIDS} from '../firebase/functions/studio-owner-identity.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { manualCleanupDeployment } from '../firebase/functions/manual-cleanup-deployment.mjs';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
test('Fox7 manual Empty Trash remains held pending scoped permission review and owner rollout approval', () => {
  assert.equal(manualCleanupDeployment.enabled, false);
  const source = read('../firebase/functions/index.mjs');
  const handler = source.slice(source.indexOf('export const tmcFileMaintenance'), source.indexOf('export const tmcDailyTrashCleanup'));
  assert.match(handler, /available: manualCleanupDeployment.enabled === true/);
  assert.ok(handler.indexOf('if (manualCleanupDeployment.enabled !== true)') < handler.indexOf('await emptyFolders(body.ids'));
  assert.ok(handler.indexOf('if (manualCleanupDeployment.enabled !== true)') < handler.indexOf('await purge(file.id'));
  assert.match(handler, /!isStudioOwnerUid\(token.uid\)/);
  assert.deepEqual(STUDIO_OWNER_UIDS, ['a4ARjp0z8ZOByKlC2AfGzmMRj843','VhnIFsEQFqRtS8u98mP921wim4J3']);
  for(const uid of STUDIO_OWNER_UIDS)assert.equal(isStudioOwnerUid(uid),true);
  for(const uid of [undefined,'','random','hub:client','tobiasonyxwolf@gmail.com'])assert.equal(isStudioOwnerUid(uid),false);
  assert.match(handler,/verifyIdToken\(header.slice\(7\), true\)/);
});
test('Fox7 browser respects server readiness rather than treating any successful health read as delete capability', () => {
  const client = read('../src/owner/cloud-files-client.ts');
  assert.match(client, /available: result.available === true && result.manualDeletionConfigured === true/);
  assert.doesNotMatch(client.slice(client.indexOf('export async function readCloudCleanupStatus'), client.indexOf('export async function permanentDeleteCloudFiles')), /available: true/);
});
