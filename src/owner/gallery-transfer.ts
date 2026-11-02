import {assertOwnerContent,type OwnerContent,type PublicOwnerContent} from './model';
import {createDefaultOwnerContent} from './defaults';
import {pruneElementLinks} from './canvas-hyperlinks';
import {reconcileInlineTextStyles} from './rich-text';
import {reconcileCanvasLayouts} from './canvas-layout';
import {cloudReferencedAssetIds} from './cloud-files-model';

/** A valid transfer shell; unrelated public page omissions never block photo copying.
 * Only gallery/settings are consumed by mergeLiveGallery, never this shell's design.
 */
export function galleryTransferContent(published:PublicOwnerContent):OwnerContent{
 const shell=createDefaultOwnerContent();
 shell.gallery=published.gallery.map(photo=>({...structuredClone(photo),visible:true}));
 if(published.gallerySettings!==undefined)shell.gallerySettings=structuredClone(published.gallerySettings);
 else delete shell.gallerySettings;
 assertOwnerContent(shell);return shell;
}
/** Gallery photos only: names and other design assets are not transfer inputs. */
export function galleryTransferAssetIds(content:OwnerContent):string[]{
 return cloudReferencedAssetIds(content.gallery.map(photo=>photo.src));
}
export function remapGalleryTransfer(content:OwnerContent,mapping:ReadonlyMap<string,string>):OwnerContent{
 const ids=galleryTransferAssetIds(content),destinations=new Set(mapping.values());
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 if(ids.length!==mapping.size||ids.some(id=>!mapping.has(id))||destinations.size!==mapping.size||[...mapping].some(([from,to])=>!uuid.test(from)||!uuid.test(to)||from===to))throw Error('Every gallery photo must finish copying before the gallery can be refreshed.');
 const next=structuredClone(content);
 for(const photo of next.gallery){const match=photo.src.match(/^\/api\/cloud-media\/([a-f0-9-]+)$/);if(match){const id=mapping.get(match[1]);if(!id)throw Error('A gallery photo could not be copied.');photo.src=`/api/cloud-media/${id}`;}}
 assertOwnerContent(next);return next;
}
/** Never replace unsaved page, layout, pricing, text, or other design changes. */
export function mergeLiveGallery(current:OwnerContent,imported:OwnerContent):OwnerContent{
 const next=structuredClone(current);next.gallery=structuredClone(imported.gallery);
 if(imported.gallerySettings===undefined)delete next.gallerySettings;
 else next.gallerySettings=structuredClone(imported.gallerySettings);
 if(next.contentOverrides?.styles)for(const key of Object.keys(next.contentOverrides.styles)){const match=/^layout\.gallery:([^:]+)/.exec(key);if(match&&!next.gallery.some(photo=>photo.id===match[1]))delete next.contentOverrides.styles[key];}
 pruneElementLinks(next);reconcileInlineTextStyles(current,next);
 const issues=reconcileCanvasLayouts(current,next);if(issues.length)throw Error(issues[0].message);
 assertOwnerContent(next);return next;
}
