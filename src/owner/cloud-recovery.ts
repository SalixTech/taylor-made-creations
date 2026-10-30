import { assertOwnerContent, type OwnerContent } from './model';
export type CloudRecoveryEntry={id:string;kind:'draft'|'published';createdAt:string;expiresAt:string;cloudRevision:number;branchId:string};
export type CloudRecoveryPort={checkpointDraft(input:{operationId:string;branchId:string;expectedRevision:number;content:OwnerContent;reason?:'saved-draft'}):Promise<CloudRecoveryEntry>;listRecovery():Promise<CloudRecoveryEntry[]>;readRecovery(id:string,expectedRevision:number):Promise<OwnerContent>;dismissRecovery(id:string):Promise<void>};
export function decodeCloudRecoveryEntry(value:unknown):CloudRecoveryEntry {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Cloud recovery could not be read safely.');
 const e=value as CloudRecoveryEntry;
 if(typeof e.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(e.id)||!['draft','published'].includes(e.kind)||!Number.isSafeInteger(e.cloudRevision)||e.cloudRevision<0||typeof e.branchId!=='string'||typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt))||typeof e.expiresAt!=='string'||!Number.isFinite(Date.parse(e.expiresAt)))throw new Error('Cloud recovery metadata is invalid.');
 return {id:e.id,kind:e.kind,createdAt:e.createdAt,expiresAt:e.expiresAt,cloudRevision:e.cloudRevision,branchId:e.branchId};
}
export function decodeCloudRecoveryContent(value:unknown):OwnerContent{assertOwnerContent(value);return structuredClone(value);}
