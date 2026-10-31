import { assertOwnerContent, publicContentToOwnerContent, type OwnerContent, type PublicOwnerContent } from './model';
import { cloudReferencedAssetIds } from './cloud-files-model';

/** Explicit main-publication import only. No clients, settings documents or private drafts. */
export function prepareWebsiteImport(published: PublicOwnerContent): {content:OwnerContent;assetIds:string[]} {
 const content=publicContentToOwnerContent(published);assertOwnerContent(content);
 const assetIds=cloudReferencedAssetIds(content);if(assetIds.length>100)throw Error('This design has too many website assets to copy in one reviewed import.');
 return {content,assetIds};
}
/** Keep reusable design IDs; remap only exact cloud URLs and custom-font identities. */
export function remapWebsiteImport(content:OwnerContent,mapping:ReadonlyMap<string,string>):OwnerContent {
 const ids=cloudReferencedAssetIds(content);
 if(ids.some(id=>!mapping.has(id))||mapping.size!==ids.length)throw Error('Every website asset must finish copying before this design can be opened.');
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 const destinations=new Set<string>();for(const [from,to] of mapping){if(!uuid.test(from)||!uuid.test(to)||from===to||destinations.has(to))throw Error('Copied website asset identities are not valid.');destinations.add(to);}
 const copy=structuredClone(content);
 const visit=(value:unknown):unknown=>{
  if(typeof value==='string'){const match=value.match(/^(\/api\/(?:cloud-media|cloud-fonts|cloud-documents)\/)([a-f0-9-]+)$/);return match&&mapping.has(match[2])?`${match[1]}${mapping.get(match[2])}`:value;}
  if(Array.isArray(value))return value.map(visit);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,['fontId','bodyFontId','headingFontId'].includes(key)&&typeof entry==='string'&&mapping.has(entry)?mapping.get(entry):visit(entry)]));
  return value;
 };
 const result=visit(copy) as OwnerContent;
 for(const font of result.fonts??[])if(mapping.has(font.id))font.id=mapping.get(font.id)!;
 assertOwnerContent(result);
 if(cloudReferencedAssetIds(result).some(id=>!destinations.has(id)))throw Error('The copied design still refers to an uncopied website asset.');
 return result;
}
