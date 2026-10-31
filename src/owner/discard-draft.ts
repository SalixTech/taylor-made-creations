import {assertOwnerContent, assertPublishedOwnerSnapshot, publicContentToOwnerContent, type OwnerContent, type PublishedOwnerSnapshot} from './model';

/** Stage the public website locally; never save, publish, or resurrect omitted private content. */
export function draftFromPublication(saved:OwnerContent, publication:PublishedOwnerSnapshot, at=new Date().toISOString()):OwnerContent {
 assertOwnerContent(saved); assertPublishedOwnerSnapshot(publication);
 const next=publicContentToOwnerContent(publication.content);
 // Private drafts must retain built-in identities. Publicly absent built-ins stay
 // absent from the website as empty trashed records, not restored defaults.
 for(const page of saved.pages)if(page.kind==='builtin'&&!next.pages.some(item=>item.builtinKey===page.builtinKey)){
  next.pages.push({id:page.id,kind:'builtin',builtinKey:page.builtinKey,slug:page.slug,title:page.title,navLabel:page.navLabel,showInNav:false,navPlacement:'unlisted',availability:'hidden',order:page.order,trashedAt:at,blocks:[]});
 }
 assertOwnerContent(next); return next;
}
