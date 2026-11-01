"use client";
import {doc,getDoc} from "firebase/firestore/lite";
import {WEBSITE_WORKSPACE,workspaceDocument} from "./website-workspace-config";
import {taylorOwnerSession} from "./taylor-services-client";
import {betaAssetMetadata} from "./beta-assets-client";
import {assertActiveFolder,assertCloudId,decodeCloudFolders,emptyCloudFolders} from "./cloud-files-model";

/** Read-only preflight. Never creates files, download tokens, folders or copies. */
export async function verifyFrameClipboardAssets(sources:readonly string[],signal?:AbortSignal):Promise<{assertCurrent:()=>void}>{
  if(WEBSITE_WORKSPACE!=="beta")throw new Error("Copy website boxes in the full-screen builder.");
  if(!Array.isArray(sources)||sources.length>100)throw new Error("This box contains too many website assets to verify safely.");
  const expected=new Map<string,"photo"|"font"|"document">();
  for(const source of sources){
    const match=typeof source==="string"?source.match(/^\/api\/(cloud-media|cloud-fonts|cloud-documents)\/([a-f0-9-]+)$/):null;
    if(!match)throw new Error("This box contains an unverified website asset reference.");
    const id=match[2];assertCloudId(id);const kind=match[1]==="cloud-media"?"photo":match[1]==="cloud-fonts"?"font":"document";
    if(expected.has(id)&&expected.get(id)!==kind)throw new Error("This box uses a website asset as incompatible file types.");expected.set(id,kind);
  }
  const unique=[...expected.keys()];signal?.throwIfAborted();
  const session=await taylorOwnerSession();session.assertCurrent();signal?.throwIfAborted();
  const assertCurrent=()=>{session.assertCurrent();signal?.throwIfAborted();};
  if(!unique.length)return{assertCurrent};
  const saved=await getDoc(doc(session.db,workspaceDocument("ownerFileFolders/current")));
  session.assertCurrent();signal?.throwIfAborted();
  const folders=saved.exists()?decodeCloudFolders(saved.data()):emptyCloudFolders();
  for(let index=0;index<unique.length;index+=4){
    await Promise.all(unique.slice(index,index+4).map(async id=>{
      session.assertCurrent();signal?.throwIfAborted();
      const {file}=await betaAssetMetadata(id,session,signal);
      session.assertCurrent();signal?.throwIfAborted();
      if(file.kind!==expected.get(id))throw new Error("A copied website asset no longer matches its image, font or PDF reference.");
      assertActiveFolder(folders,file.parentId);
    }));
  }
  session.assertCurrent();signal?.throwIfAborted();
  return{assertCurrent};
}
