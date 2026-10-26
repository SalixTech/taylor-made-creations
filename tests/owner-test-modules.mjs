// Compile only this pure TypeScript boundary for Node's test runner; Next's
// extensionless imports and JSON modules then behave exactly as bundled code.
import ts from 'typescript';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
const directory=mkdtempSync(join(tmpdir(),'tmc-owner-tests-'));
const root=new URL('../',import.meta.url);
for(const path of ['components/commission-options.ts','components/commission-form-config.ts','owner/model.ts','owner/site-design.ts','owner/appearance.ts','owner/defaults.ts','owner/storage.ts','owner/settings-cards.ts','owner/preview-model.ts','content/site.ts','content/fursuit-gallery.ts']){
  const source=readFileSync(new URL(`src/${path}`,root),'utf8');
  const output=join(directory,path.replace(/\.ts$/,'.js'));
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText);
}
for(const path of ['terms-of-service.json','care-instructions.json']){
  mkdirSync(join(directory,'data'),{recursive:true});
  copyFileSync(new URL(`src/data/${path}`,root),join(directory,'data',path));
}
process.on('exit',()=>rmSync(directory,{recursive:true,force:true}));
const require=createRequire(import.meta.url);
export const model=require(join(directory,'owner/model.js'));
export const defaults=require(join(directory,'owner/defaults.js'));
export const storage=require(join(directory,'owner/storage.js'));
export const preview=require(join(directory,'owner/preview-model.js'));
export function memoryAdapter(initial=null){
  let raw=structuredClone(initial);
  return {read:async()=>structuredClone(raw),update:async transform=>{const next=transform(structuredClone(raw));raw=structuredClone(next);return structuredClone(next);},peek:()=>structuredClone(raw)};
}
