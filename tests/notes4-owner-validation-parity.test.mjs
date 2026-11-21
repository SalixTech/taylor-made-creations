import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileOwnerValidation} from '../scripts/build-owner-validation.mjs';
test('deployed owner validation is exactly compiled from canonical source',()=>{for(const {path,output}of compileOwnerValidation())assert.equal(readFileSync(new URL(`../firebase/functions/owner-validation/${path.replace(/\.ts$/,'.mjs')}`,import.meta.url),'utf8'),output,path);});
