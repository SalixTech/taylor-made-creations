"use client";
import {doc,getDoc} from 'firebase/firestore/lite';
import {taylorOwnerSession} from './taylor-services-client';
import {decodePublishedOwnerSnapshot} from './firebase-store';
import {decodeCloudFile,type CloudFile} from './cloud-files-model';
import {WEBSITE_WORKSPACE} from './website-workspace-config';
import {requestWebsiteAsset} from './beta-assets-client';
import {prepareWebsiteImport,remapWebsiteImport} from './website-transfer';
import type {OwnerContent} from './model';

type Asset={file:CloudFile;generation:string;publicationRevision:number;destinationId:string};
export type WebsiteImportReview={revision:number;assetCount:number;totalBytes:number;pageCount:number;complete:(signal?:AbortSignal)=>Promise<OwnerContent>};
const limit=12*1024*1024;
function decodeAsset(raw:unknown,id:string):{file:CloudFile;generation:string}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Website asset metadata could not be read.');
 const result=raw as {file?:CloudFile;generation?:string};
 if(!result.file||result.file.id!==id||typeof result.generation!=='string'||!/^\d{1,32}$/.test(result.generation))throw Error('Website asset identity could not be verified.');
 const{id:omit,...fields}=result.file;void omit;const file=decodeCloudFile(fields,id);
 if(!['photo','font','document'].includes(file.kind)||file.status!=='ready'||file.trashedAt||file.bytes>limit)throw Error(`“${file.name}” cannot be copied: choose a ready website image, font or PDF no larger than 12 MiB.`);
 return{file,generation:result.generation};
}
/** No read occurs until the owner explicitly requests the main website review. */
export async function reviewMainWebsiteImport(signal?:AbortSignal):Promise<WebsiteImportReview>{
 if(WEBSITE_WORKSPACE!=='beta')throw Error('Design import is only available in the isolated beta builder.');
 const session=await taylorOwnerSession();const current=()=>{signal?.throwIfAborted();session.assertCurrent();};current();
 const sourceRef=doc(session.db,'site/published');const source=await getDoc(sourceRef);current();if(!source.exists())throw Error('The main website has no published design to copy.');
 const published=decodePublishedOwnerSnapshot(source.data());const prepared=prepareWebsiteImport(published.content);
 const assets:Asset[]=[];
 // Preflight EVERY asset before creating any destination bytes. Never silently omit one.
 for(const id of prepared.assetIds){current();const raw=await requestWebsiteAsset({action:'inspectMain',fileId:id},signal,session) as {publicationRevision?:number};const asset=decodeAsset(raw,id);current();if(raw.publicationRevision!==published.revision)throw Error('The main publication changed during asset review. Start a new review.');assets.push({...asset,publicationRevision:published.revision,destinationId:crypto.randomUUID()});}
 const sourcePayload=JSON.stringify(source.data());
 const sourceUnchanged=async()=>{current();const latest=await getDoc(sourceRef);current();if(!latest.exists()||JSON.stringify(latest.data())!==sourcePayload)throw Error('The main published design changed. Start a new review; no beta draft has been replaced.');};
 return{revision:published.revision,assetCount:assets.length,totalBytes:assets.reduce((n,a)=>n+a.file.bytes,0),pageCount:prepared.content.pages.length,async complete(nextSignal){
  nextSignal?.throwIfAborted();await sourceUnchanged();const mapping=new Map<string,string>();
  for(const asset of assets){nextSignal?.throwIfAborted();current();const copied=decodeAsset(await requestWebsiteAsset({action:'copyFromMain',sourceId:asset.file.id,destinationId:asset.destinationId,sourceRevision:asset.file.revision,generation:asset.generation,publicationRevision:asset.publicationRevision},nextSignal??signal,session),asset.destinationId);current();
   if(copied.file.kind!==asset.file.kind||copied.file.bytes!==asset.file.bytes||copied.file.contentType!==asset.file.contentType||copied.file.width!==asset.file.width||copied.file.height!==asset.file.height)throw Error('A copied asset did not match the reviewed design. No beta draft was replaced.');mapping.set(asset.file.id,asset.destinationId);
  }
  await sourceUnchanged();nextSignal?.throwIfAborted();return remapWebsiteImport(prepared.content,mapping);
 }};
}
