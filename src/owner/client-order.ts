export type ClientOrder = {schemaVersion:1;revision:number;updatedAt:string|null;clientIds:string[]};
export type SaveClientOrderInput = {expectedRevision:number;operationId:string;clientIds:string[]};
export function decodeClientOrder(value:unknown):ClientOrder {
 const v=value as ClientOrder;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(key=>!['schemaVersion','revision','updatedAt','clientIds'].includes(key))||v.schemaVersion!==1||!Number.isSafeInteger(v.revision)||v.revision<0||v.revision>=Number.MAX_SAFE_INTEGER||!(v.updatedAt===null||typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt)))||!Array.isArray(v.clientIds)||v.clientIds.length>2000||v.clientIds.some(id=>typeof id!=='string'||!/^TMC-[A-F0-9]{16}$/.test(id))||new Set(v.clientIds).size!==v.clientIds.length)throw Error('Client order could not be verified. Refresh before saving.');
 return{schemaVersion:1,revision:v.revision,updatedAt:v.updatedAt,clientIds:[...v.clientIds]};
}
export function orderClients<T extends {clientId:string;createdAt:string}>(clients:T[],savedIds:readonly string[]):T[]{
 const rank=new Map(savedIds.map((id,index)=>[id,index]));return [...clients].sort((a,b)=>{const ar=rank.get(a.clientId),br=rank.get(b.clientId);if(ar!==undefined&&br!==undefined)return ar-br;if(ar!==undefined)return 1;if(br!==undefined)return -1;return b.createdAt.localeCompare(a.createdAt)||a.clientId.localeCompare(b.clientId);});
}
export function spliceVisibleClientOrder(fullIds:readonly string[],visibleIds:readonly string[],nextVisibleIds:readonly string[]):string[]{
 const visible=new Set(visibleIds);if(new Set(fullIds).size!==fullIds.length||visible.size!==visibleIds.length||nextVisibleIds.length!==visibleIds.length||new Set(nextVisibleIds).size!==visible.size||visibleIds.some(id=>!fullIds.includes(id))||nextVisibleIds.some(id=>!visible.has(id)))throw Error('The visible client list changed. Refresh before reordering.');let cursor=0;return fullIds.map(id=>visible.has(id)?nextVisibleIds[cursor++]:id);
}
