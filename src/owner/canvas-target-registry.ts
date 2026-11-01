import type { OwnerContent, PublicOwnerContent } from "./model";
/** Explicit semantic layout identities, never CSS selectors or arbitrary paths. */
export const CANVAS_FIXED_TARGETS = {
  "layout.site.headerBrand":"Header brand", "layout.site.footerBrand":"Footer brand", "layout.site.more":"More navigation",
  "layout.site.header": "Header", "layout.site.navigation": "Navigation", "layout.site.footer": "Footer",
  "layout.home.intro": "Home introduction", "layout.home.actions": "Home action buttons", "layout.home.commissionStrip": "Commission information section", "layout.home.linkCards": "Prices and care cards",
  "layout.prices.grid": "Price groups", "layout.prices.parts": "Additional parts section", "layout.prices.extras": "Extras section", "layout.prices.end": "Prices closing section",
  "layout.gallery.grid": "Gallery cards", "layout.gallery.end": "Gallery closing section",
  "layout.commissions.status": "Commission status card", "layout.commissions.steps": "Commission steps", "layout.commissions.form": "Commission form card", "layout.commissions.columns": "Commission information columns",
  "layout.contact.details": "Contact details card", "layout.contact.form": "Contact form card", "layout.contact.columns": "Contact columns",
  "layout.premades.grid": "Premade cards",
  "layout.examples.heads": "Head examples section", "layout.examples.partials": "Partial examples section", "layout.examples.fullsuits": "Fullsuit examples section",
} as const;
const id = "[A-Za-z0-9][A-Za-z0-9_-]{0,95}";
const patterns = [
  new RegExp(`^layout\\.page:(${id}):(intro|shell|empty)$`),
  new RegExp(`^layout\\.price-group:(${id})(?::(number|title|note|examples))?$`),
  new RegExp(`^layout\\.price-item:(${id})(?::(name|detail|amount))?$`),
  new RegExp(`^layout\\.price-(parts|extras):(${id})(?::(name|amount))?$`),
  new RegExp(`^layout\\.block:(${id}):(${id}):(heading|body|photo|caption|link|status-label|status-value|status-note|status-action|status-action-label|list-\\d{1,3}|faq-${id}-(?:question|answer))$`),
  new RegExp(`^layout\\.premade:(${id})(?::(photo|title|body|price|tags|purchase))?$`),
  new RegExp(`^layout\\.gallery:(${id})(?::(photo|caption))?$`),
  new RegExp(`^layout\\.contact-row:(${id})(?::(label|value))?$`),
  new RegExp(`^layout\\.navigation:(${id})$`),
  /^layout\.commissions\.(step[123]|requestButton|formButton|statusValue|statusNote)$/,
  /^layout\.home\.(pricesCardTitle|careCardTitle)$/,
];
export function isCanvasStyleKey(key: string): boolean {
  return typeof key === "string" && key.length <= 260 && (Object.hasOwn(CANVAS_FIXED_TARGETS,key) || patterns.some(pattern=>pattern.test(key)));
}
export function canvasTargetLabel(key: string): string {
  return CANVAS_FIXED_TARGETS[key as keyof typeof CANVAS_FIXED_TARGETS] ?? key.replace(/^layout\./, "").replaceAll(":", " · ").replaceAll("-", " ");
}
/** Orphaned draft styles are harmless and retained for undo; public projection
 * includes only identities still present in the already-filtered public model. */
export function canvasStyleKeyIsPublic(key: string, content: OwnerContent | PublicOwnerContent): boolean {
  if (!isCanvasStyleKey(key)) return false;
  const pages=content.pages.filter(page=>!("trashedAt" in page && page.trashedAt)&&page.availability!=="hidden");
  const active=(group:string)=>group==="site"||pages.some(page=>page.builtinKey===group);
  const fixed=/^layout\.([a-z]+)\./.exec(key);
  if(fixed)return active(fixed[1]);
  const page=/^layout\.page:([^:]+):/.exec(key);if(page)return pages.some(p=>p.id===page[1]);
  const block=/^layout\.block:([^:]+):([^:]+):/.exec(key);if(block)return block[1]==="shared-footer"?!!content.footerBlocks?.some(b=>b.id===block[2]):pages.some(p=>p.id===block[1]&&p.blocks.some(b=>b.id===block[2]));
  const group=/^layout\.price-group:([^:]+)/.exec(key);if(group)return active("prices")&&content.prices.groups.some(g=>g.id===group[1]);
  const item=/^layout\.price-item:([^:]+)/.exec(key);if(item)return active("prices")&&content.prices.groups.some(g=>g.items.some(i=>i.id===item[1]));
  const part=/^layout\.price-(parts|extras):([^:]+)/.exec(key);if(part)return active("prices")&&content.prices[part[1] as "parts"|"extras"].some(i=>i.id===part[2]);
  const premade=/^layout\.premade:([^:]+)/.exec(key);if(premade)return active("premades")&&content.premades.some(p=>p.id===premade[1]&&(!("visible" in p)||p.visible)&&!("isDraft" in p&&p.isDraft));
  const gallery=/^layout\.gallery:([^:]+)/.exec(key);if(gallery)return active("gallery")&&content.gallery.some(p=>p.id===gallery[1]&&(!("visible" in p)||p.visible));
  const navigation=/^layout\.navigation:([^:]+)/.exec(key);if(navigation)return navigation[1]==="trello-board"||pages.some(p=>p.id===navigation[1]);
  const contact=/^layout\.contact-row:([^:]+)/.exec(key);if(contact)return active("contact")&&(content.site.socialLinks?.some(row=>row.id===contact[1])??["telegram","discord","tiktok","twitch","email"].includes(contact[1]));
  return false;
}
