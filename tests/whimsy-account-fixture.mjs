import { harness } from './owner-ui-harness.mjs';
/** No-network account persistence fixture, distinct from legacy localStorage. */
export function whimsyAccountFixture(storage = new Map(), saved) {
 const h=harness(),writes=[];
 h.window.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const state={settings:saved??{schemaVersion:1,revision:0,whimsyEnabled:true,whimsyTerms:[],updateRequestCooldownDays:7,updateRequestCooldownResetAt:null,updatedAt:null},loading:false,busy:false,error:'',retry:false};
 h.overrides['./use-studio-settings']={useStudioSettings:()=>state,readStudioSettings:()=>state.settings,async saveStudioSettings(patch){if(state.busy||state.retry||!state.settings)return false;writes.push(structuredClone(patch));state.settings={...state.settings,...structuredClone(patch),revision:state.settings.revision+1};return true;},refreshStudioSettings(){},async retryStudioSettings(){return false;}};
 return {h,storage,state,writes,api:h.load('src/owner/owner-whimsy.ts')};
}
