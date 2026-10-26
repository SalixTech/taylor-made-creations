// Focused source-hook mocks, not a browser/React integration runner.
// These exercise async handlers and returned element props without contacting Firebase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
function nodes(n) { return !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function content(n) { if (n == null || typeof n === 'boolean') return ''; if (Array.isArray(n)) return n.map(content).join(''); return typeof n === 'object' ? content(n.props?.children) : String(n); }
class FakeHTMLElement {}
function harness() {
  const h = {hooks: [], cursor: 0, pending: [], pathname: '/premades', tree: null, refs: new Map(), byId: new Map(), cache: new Map(), overrides: {}, globals: {}, focusLog: [], currentContext: null, process: { env: { ...process.env } }};
  // Default cloud adapters are explicit no-network failures. Feature tests replace
  // these with focused fixtures; importing a UI must never initialize live Firebase.
  const cloudUnavailable = async () => { throw new Error('Cloud files are not configured in this UI fixture.'); };
  h.overrides['./inventory-client'] = { readInventory: cloudUnavailable, saveInventoryCategories: cloudUnavailable, saveInventoryItem: cloudUnavailable };
  h.overrides['./cloud-files-client'] = { CLOUD_FILES_EVENT: 'cloud-files', readCloudFiles: cloudUnavailable, checkCloudStorage: cloudUnavailable, uploadCloudFile: cloudUnavailable, changeCloudFile: cloudUnavailable, changeCloudFolder: cloudUnavailable, confirmCloudUpload: cloudUnavailable, downloadCloudFile: cloudUnavailable };
  h.overrides['./use-cloud-files'] = { useCloudFiles: () => ({ files: [], folders: { schemaVersion: 1, revision: 0, folders: {} }, loading: false, ready: false, error: 'Cloud files are not configured in this UI fixture.', refresh: cloudUnavailable }) };
  const entries = [{ state: {}, url: '' }]; let historyIndex = 0;
  const history = {
    get state() { return entries[historyIndex].state; },
    get length() { return entries.length; },
    replaceState(state, title, url) { entries[historyIndex] = { state, url: String(url ?? h.window.location.href) }; h.window.location.href = entries[historyIndex].url; },
    pushState(state, title, url) { entries.splice(historyIndex + 1); entries.push({ state, url: String(url) }); historyIndex++; h.window.location.href = String(url); },
    go(delta) { Promise.resolve().then(() => { const target = historyIndex + delta; if (target < 0 || target >= entries.length || !delta) return; historyIndex = target; h.window.location.href = entries[target].url; const event = new Event('popstate'); Object.defineProperty(event, 'state', { value: entries[target].state }); h.window.dispatchEvent(event); }); },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  h.window = Object.assign(new EventTarget(), {scrollY:20,scrollTo(){},setTimeout,history,location:{href:'',assign(url){this.href=url;}},confirm(){return true;},open(){}});
  h.document = {body: {style: {overflow: 'auto', position: '', top: '', width: ''}}, activeElement: null, getElementById: id => h.byId.get(id), addEventListener(){}, removeEventListener(){}};
  function node(n) {return Object.assign(new FakeHTMLElement(), {__node:n, open:false, value:'', scrollTop:0, isConnected:true, contains(x){return this === x;}, focus(){h.document.activeElement=this;h.focusLog.push(this.__node.props.id || this.__node.props['aria-label'] || content(this.__node));},showModal(){if(this.open)throw Error('duplicate showModal');this.open=true;},close(){if(!this.open)return;this.open=false;this.__node.props.onClose?.({target:this,currentTarget:this});},querySelectorAll(){return []},querySelector(){return null}});}
  const react = {
    useState(init){const i=h.cursor++;if(!(i in h.hooks))h.hooks[i]=typeof init==='function'?init():init;return [h.hooks[i],v=>h.hooks[i]=typeof v==='function'?v(h.hooks[i]):v];},
    useReducer(fn,init){const i=h.cursor++;if(!(i in h.hooks))h.hooks[i]=init;return [h.hooks[i],a=>h.hooks[i]=fn(h.hooks[i],a)];},
    useRef(init){const i=h.cursor++;if(!(i in h.hooks))h.hooks[i]={current:init};return h.hooks[i];},
    useId(){const i=h.cursor++;if(!(i in h.hooks))h.hooks[i]=`test-id-${i}`;return h.hooks[i];},
    useEffect(fn,deps){const i=h.cursor++;const prev=h.hooks[i];if(!prev||!deps||deps.some((x,j)=>!Object.is(x,prev.deps?.[j]))){h.pending.push(()=>{prev?.cleanup?.();h.hooks[i]={deps,cleanup:fn()};});}},
    useMemo(fn,deps){const i=h.cursor++;const prev=h.hooks[i];if(!prev||!deps||deps.some((x,j)=>!Object.is(x,prev.deps?.[j])))h.hooks[i]={deps,value:fn()};return h.hooks[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps)},
    useSyncExternalStore(subscribe,getSnapshot){react.useEffect(()=>subscribe(()=>{}),[subscribe]);return getSnapshot();},
    createContext(){return {Provider:'Provider'}},useContext(){return h.currentContext;},
  };react.useLayoutEffect=react.useEffect;
  const jsx=(type,props,key)=>({type,props:props||{},key});
  h.load=function(file){
    file=path.resolve(root,file);if(h.cache.has(file))return h.cache.get(file).exports;
    const compiled={exports:{}};h.cache.set(file,compiled);
    const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
    const req=n=>{
      if(n in h.overrides)return h.overrides[n];
      if(n==='react')return react;if(n==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
      if(n==='next/link')return {__esModule:true,default:'Link'};
      if(n==='next/image')return {__esModule:true,default:'Image'};
      if(n==='next/navigation')return {notFound(){throw new Error("MOCK_NOT_FOUND_404");},usePathname:()=>h.pathname,useRouter:()=>({push:(url)=>h.window.location.href=url})};
      if(n.endsWith('.css'))return {__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})};
      if(n==='./SiteSelect'||n==='./CountryPicker')return {__esModule:true,default:n.slice(2)};
      let target=n.startsWith('@/')?path.join(root,'src',n.slice(2)):path.resolve(path.dirname(file),n);
      if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));
      if(!fs.existsSync(target)){target=['.tsx','.ts','.js'].map(e=>target+e).find(fs.existsSync);}
      if(!target)throw Error('Unresolved '+n+' from '+file);
      return h.load(target);
    };
    const globals={require:req,exports:compiled.exports,module:compiled,console,process:h.process,structuredClone,Event,EventTarget,DOMException,document:h.document,window:h.window,requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){},setTimeout,clearTimeout,Uint8Array,DataView,ArrayBuffer,TextEncoder,TextDecoder,File,Blob,crypto:globalThis.crypto,HTMLElement:FakeHTMLElement,URL,Date,Promise,...h.globals};
    new Function(...Object.keys(globals),src+'\n//# sourceURL='+file)(...Object.values(globals));return compiled.exports;
  };
  h.render=function(Component,props={}){h.cursor=0;h.pending=[];h.tree=Component(props);const seen=new Set();h.byId.clear();for(const n of nodes(h.tree)){if(n.type==='Provider')h.currentContext=n.props.value;if(n.props.ref){let dom=h.refs.get(n.props.ref);if(!dom){dom=node(n);h.refs.set(n.props.ref,dom);}dom.__node=n;dom.isConnected=true;n.props.ref.current=dom;seen.add(n.props.ref);if(n.props.id)h.byId.set(n.props.id,dom);}}for(const [ref,dom] of h.refs)if(!seen.has(ref)){ref.current=null;dom.isConnected=false;}h.pending.forEach(fn=>fn());return h.tree;};
  h.unmount=function(){for(const slot of h.hooks)slot?.cleanup?.();};
  h.find=predicate=>nodes(h.tree).find(predicate);h.all=predicate=>nodes(h.tree).filter(predicate);
  return h;
}
export { harness, nodes, content, root };
