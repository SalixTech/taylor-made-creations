import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, content } from './owner-ui-harness.mjs';
test('shared loading panel centers clear accessible feedback and remains readable with reduced motion',()=>{const h=harness();const C=h.load('src/components/WorkspaceLoading.tsx').WorkspaceLoading;h.render(C,{title:'Loading invoices',description:'Checking saved invoice information…'});const status=h.find(n=>n.props?.role==='status');assert.equal(status.props['aria-busy'],'true');assert.match(content(status),/Loading invoices/);assert.match(content(status),/Checking saved invoice information/);const css=fs.readFileSync(new URL('../src/components/WorkspaceLoading.module.css',import.meta.url),'utf8');assert.match(css,/place-items:\s*center/);assert.match(css,/prefers-reduced-motion:[\s\S]*animation:\s*none/);assert.doesNotMatch(css,/display:\s*none|visibility:\s*hidden/);h.unmount();});
