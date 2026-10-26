import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const appRequire=createRequire(new URL('../package.json', import.meta.url));
const ts=appRequire('typescript');
export const root=fileURLToPath(new URL('../',import.meta.url));
export function sourceLoader(overrides={}) {
  const cache=new Map();
  function load(path) {
    path=resolve(root,path);
    if(!extname(path)) path=['.ts','.tsx','.js'].map(ext=>path+ext).find(existsSync);
    if(!path)throw Error('Source not found');
    if(cache.has(path))return cache.get(path).exports;
    const compiledModule={exports:{}};cache.set(path,compiledModule);
    const source=readFileSync(path,'utf8');if(path.endsWith('.json')){compiledModule.exports=JSON.parse(source);return compiledModule.exports;}
    const output=ts.transpileModule(source,{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const customRequire=name=>Object.hasOwn(overrides,name)?overrides[name]:name==='server-only'?{}:name.startsWith('.')?load(resolve(dirname(path),name)):name.startsWith('@/')?load('src/'+name.slice(2)):appRequire(name);
    new Function('require','module','exports',output)(customRequire,compiledModule,compiledModule.exports);return compiledModule.exports;
  }
  return load;
}
