import {projectInlineTextStyles,reconcileInlineTextStyles,getInlineTextSource} from "./rich-text";
import {projectCanvasLayouts} from "./canvas-layout";
import { isCanvasStyleKey, canvasStyleKeyIsPublic } from "./canvas-target-registry";
import { createPublicContentSnapshot, assertPublicOwnerContent, type OwnerContent, type PublicOwnerContent } from "./model";

/** Website structure, navigation, overrides and fonts are one dependency group. */
const WEBSITE_KEYS = ["site", "home", "pages", "design", "fonts", "contentOverrides", "commissionForm", "chromeLayout", "buttonDesigns", "gallerySettings", "footerBlocks"] as const;
export type PublicationChange = { key: string; title: string; summary: string; kind: "add" | "edit" | "remove" | "order"; before: string; after: string; fields?: {path: string; before: string; after: string}[] };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const website = (value: PublicOwnerContent) => Object.fromEntries(WEBSITE_KEYS.map(key => [key, key === "site" ? Object.fromEntries(Object.entries(value.site).filter(([field]) => !["showPremades", "catalogMode"].includes(field))) : value[key]]));
const shop = (value: PublicOwnerContent) => ({ showPremades:value.site.showPremades, catalogMode:value.site.catalogMode, premades:value.premades });
const names = (items: { name: string }[]) => items.map(item => item.name).join(", ") || "None";
export function publicationChanges(draft: OwnerContent, live: PublicOwnerContent | null): PublicationChange[] {
  const next = createPublicContentSnapshot(draft), changes: PublicationChange[] = [];
  if (!live || !same(website(live), website(next))) changes.push({ key: "website", title: "Website structure & design", kind: live ? "edit" : "add", summary: "Pages, navigation, home, site settings, form, design and their fonts publish together.", before: live ? `${live.pages.length} pages · ${live.site.name}` : "Not published", after: `${next.pages.length} pages · ${next.site.name}` });
  if (!live || !same(live.prices, next.prices)) changes.push({ key: "prices", title: "Prices & options", kind: live ? "edit" : "add", summary: "Publish the complete price tables and their option labels together.", before: live ? `${live.prices.groups.length} groups · ${live.prices.parts.length} parts · ${live.prices.extras.length} extras` : "Not published", after: `${next.prices.groups.length} groups · ${next.prices.parts.length} parts · ${next.prices.extras.length} extras` });
  if (!live || !same(shop(live), shop(next))) changes.push({ key: "premades", title: "Premade shop & catalog", kind: live ? "edit" : "add", summary: "Shop visibility, catalog mode, visible listings and their photos publish together. Saved private listing drafts stay private.", before: live ? `${live.site.showPremades ? "Shop on" : "Shop off"} · ${names(live.premades)}` : "Not published", after: `${next.site.showPremades ? "Shop on" : "Shop off"} · ${names(next.premades)}` });
  const previous = live?.gallery ?? [];
  for (const id of [...new Set([...previous.map(item => item.id), ...next.gallery.map(item => item.id)])]) {
    const before = previous.find(item => item.id === id), after = next.gallery.find(item => item.id === id);
    if (same(before, after)) continue;
    const kind = !before ? "add" : !after ? "remove" : "edit";
    changes.push({ key: `gallery:${id}`, title: `${kind === "add" ? "Add" : kind === "remove" ? "Remove" : "Update"} photo: ${after?.name ?? before?.name ?? id}`, kind, summary: "This photo, its caption, image and number are one change.", before: before ? `${before.name} · ${before.displayNumber || "Automatic number"}` : "Not live", after: after ? `${after.name} · ${after.displayNumber || "Automatic number"}` : "Removed from live gallery" });
  }
  const common = new Set(previous.filter(a => next.gallery.some(b => b.id === a.id)).map(item => item.id));
  if (!same(previous.filter(item => common.has(item.id)).map(item => item.id), next.gallery.filter(item => common.has(item.id)).map(item => item.id))) changes.push({ key: "gallery-order", title: "Gallery order", kind: "order", summary: "Reorder photos already live or selected above. Unchecked removals remain live at the end; unchecked additions stay private.", before: names(previous), after: names(next.gallery) });
  return changes.map(change => {
    let before: unknown, after: unknown;
    if (change.key === "website") { before = live ? website(live) : undefined; after = website(next); }
    else if (change.key === "prices") { before = live?.prices; after = next.prices; }
    else if (change.key === "premades") { before = live ? shop(live) : undefined; after = shop(next); }
    else if (change.key.startsWith("gallery:")) { const id = change.key.slice(8); before = previous.find(item => item.id === id); after = next.gallery.find(item => item.id === id); }
    const fields: {path:string;before:string;after:string}[] = [];
    const display = (value: unknown) => value === undefined ? "Not present" : typeof value === "string" ? value || "(blank)" : JSON.stringify(value);
    function visit(a: unknown, b: unknown, path: string) {
      if (same(a,b)) return;
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
        const first = a as Record<string,unknown>, second = b as Record<string,unknown>;
        for (const key of new Set([...Object.keys(first),...Object.keys(second)])) visit(first[key],second[key],path ? `${path}.${key}` : key);
      } else if (Array.isArray(a) && Array.isArray(b)) {
        for (let index=0;index<Math.max(a.length,b.length);index++) visit(a[index],b[index],`${path}[${index+1}]`);
      } else fields.push({path:path || change.title,before:display(a),after:display(b)});
    }
    if (change.key !== "gallery-order") visit(before,after,"");
    return {...change,fields};
  });
}

/** Pure allowlisted merge: unchecked changes never enter the public projection. */
export function selectPublication(draft: OwnerContent, live: PublicOwnerContent | null, selection: readonly string[]): PublicOwnerContent {
  const available = publicationChanges(draft, live), keys = new Set(selection);
  if (!selection.length || keys.size !== selection.length || selection.some(key => !available.some(change => change.key === key))) throw new Error("Choose current changes from the publication review. Refresh the review if they changed.");
  if (!live && ["website", "prices", "premades"].some(key => !keys.has(key))) throw new Error("The first publication needs website structure, prices and catalog together. Photos are optional.");
  const next = createPublicContentSnapshot(draft);
  const output: PublicOwnerContent = live ? structuredClone(live) : { ...structuredClone(next), gallery: [] };
  if (keys.has("website")) for (const key of WEBSITE_KEYS) {
    // Optional groups omitted from the draft must be removed, not retained stale.
    if (next[key] === undefined) delete output[key];
    else if (key === "site") { const oldShop = { showPremades:output.site.showPremades, catalogMode:output.site.catalogMode }; output.site = { ...structuredClone(next.site), showPremades:oldShop.showPremades }; if (oldShop.catalogMode === undefined) delete output.site.catalogMode; else output.site.catalogMode = oldShop.catalogMode; }
    else Object.assign(output, { [key]: structuredClone(next[key]) });
  }
  if (keys.has("prices")) output.prices = structuredClone(next.prices);
  if (keys.has("premades")) { output.premades = structuredClone(next.premades); output.site.showPremades = next.site.showPremades; if(next.site.catalogMode === undefined) delete output.site.catalogMode; else output.site.catalogMode = next.site.catalogMode; }
  for (const key of selection.filter(key => key.startsWith("gallery:"))) {
    const id = key.slice(8), item = next.gallery.find(photo => photo.id === id), index = output.gallery.findIndex(photo => photo.id === id);
    if (!item) { if (index >= 0) output.gallery.splice(index, 1); }
    else if (index >= 0) output.gallery[index] = structuredClone(item);
    else {
      const predecessors = next.gallery.slice(0, next.gallery.findIndex(photo => photo.id === id)).map(photo => photo.id).reverse();
      const previousId = predecessors.find(previous => output.gallery.some(photo => photo.id === previous));
      const insertAt = previousId ? output.gallery.findIndex(photo => photo.id === previousId) + 1 : 0;
      output.gallery.splice(insertAt, 0, structuredClone(item));
    }
  }
  if (keys.has("gallery-order")) {
    const rank = new Map(next.gallery.map((item, index) => [item.id, index]));
    // Photos whose removal is unchecked remain live, after the ordered photos.
    output.gallery.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  // A website-only selection must not publish layout identities belonging to
  // unchecked new/private listings or photos. Resolve after all selected groups.
  if (output.contentOverrides?.styles) output.contentOverrides.styles = Object.fromEntries(Object.entries(output.contentOverrides.styles).filter(([key]) => !isCanvasStyleKey(key) || canvasStyleKeyIsPublic(key,output)));
  if(live){
    reconcileInlineTextStyles(live,output);
    // A website-only formatting record may belong to unchecked new price text.
    // Keep the already-public matching formatting, never that unchecked source.
    for(const [id,record] of Object.entries(output.contentOverrides?.inlineStyles??{})){
      const text=getInlineTextSource(output,id)?.text,prior=live.contentOverrides?.inlineStyles?.[id];
      if(text!==undefined&&prior&&record.text!==text&&prior.text===text){
        output.contentOverrides!.inlineStyles![id]=structuredClone(prior);
        const used=new Set([...prior.spans,...(prior.mobile??[])].map(span=>span.style.fontId));
        for(const font of live.fonts??[])if(used.has(font.id)&&!output.fonts?.some(item=>item.id===font.id)){output.fonts??=[];output.fonts.push(structuredClone(font));}
      }
    }
  }
  projectInlineTextStyles(output);
  assertPublicOwnerContent(output);
  projectCanvasLayouts(output);
  return output;
}

/** Library candidates are independent of the website draft: stage only checked
 * photo changes, leaving existing unchecked website edits exactly as they were. */
export function applyGallerySelectionToDraft(draft: OwnerContent, candidate: OwnerContent["gallery"], selection: readonly string[]): OwnerContent {
 const next = structuredClone(draft);
 for (const key of selection.filter(key => key.startsWith("gallery:"))) {
  const id=key.slice(8), item=candidate.find(photo=>photo.id===id), index=next.gallery.findIndex(photo=>photo.id===id);
  if(!item){if(index>=0)next.gallery.splice(index,1);}
  else if(index>=0)next.gallery[index]=structuredClone(item);
  else {const predecessors=candidate.slice(0,candidate.findIndex(photo=>photo.id===id)).map(photo=>photo.id).reverse(),previousId=predecessors.find(id=>next.gallery.some(photo=>photo.id===id));next.gallery.splice(previousId?next.gallery.findIndex(photo=>photo.id===previousId)+1:0,0,structuredClone(item));}
 }
 if(selection.includes("gallery-order")){const rank=new Map(candidate.map((item,index)=>[item.id,index]));next.gallery.sort((a,b)=>(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER));}
 return next;
}
