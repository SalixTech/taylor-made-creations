import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL(`../src/owner/${name}`,import.meta.url),'utf8');
test('page Trash action and view use named shared glyph while confirmation remains explicit',()=>{
 const source=read('OwnerPortal.tsx');
 assert.match(source,/aria-label={`Move page to Trash: \$\{page.title\}`}/);
 assert.match(source,/title={`Move page to Trash: \$\{page.title\}`}/);
 assert.match(source,/"Move to trash"\)}><TrashIcon \/><\/button>/);
 assert.match(source,/aria-label={`View page Trash \(\$\{trashedPages.length\}\)`}/);
 assert.doesNotMatch(source,/>Trash<\/button>/);
});
test('temporary photo view keeps count accessible and deletion still opens recoverable confirmation',()=>{
 const source=read('AssetLibrary.tsx');
 assert.match(source,/aria-label={`Trash \(\$\{library.assets.filter\(photo => photo.trashedAt\).length\}\)`}/);
 assert.match(source,/setDeleting\(photo\); }}><TrashIcon \/><\/button>/);
 assert.match(source,/title="Move photo to Trash\?"/);
 assert.match(source,/>Empty Trash<\/button>/);
 assert.match(source,/Permanently remove \$\{emptying.length\}/);
});
