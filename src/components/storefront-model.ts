import { isPageAvailable, isSafeLink, pageHref, type OwnerContent, type OwnerPage, type OwnerPremade } from "../owner/model";

/** Only the current, available published shop may expose a product route. */
export function getStorefrontPage(content: OwnerContent): OwnerPage | undefined {
  return content.pages.find(page => page.builtinKey === "premades" && isPageAvailable(content, page));
}
export function premadeHref(page: OwnerPage, item: Pick<OwnerPremade, "id">): string {
  return `${pageHref(page)}/${encodeURIComponent(item.id)}`;
}
export function getPublicPremade(content: OwnerContent, slug: readonly string[]): { page: OwnerPage; item: OwnerPremade } | undefined {
  const page = getStorefrontPage(content);
  if (!page || slug.length !== 2 || slug[0] !== page.slug) return undefined;
  const item = content.premades.find(item => item.id === slug[1] && item.visible && !item.isDraft);
  return item ? { page, item } : undefined;
}
/** A listing URL is owner supplied, not a promise that inventory is still available. */
export function thirdPartyListingUrl(item: OwnerPremade): string | null {
  if (item.soldChannel !== "third-party" || !item.externalUrl || !isSafeLink(item.externalUrl)) return null;
  try {
    const url = new URL(item.externalUrl);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function premadeChannelLabel(item: OwnerPremade): string {
  return item.soldChannel === "third-party" ? "Sold on third party" : item.soldChannel === "con" ? "Sold at con" : "Sold Here";
}
export function canAddPublishedPremade(content: OwnerContent, itemId: string): boolean {
  if (content.site.catalogMode || !getStorefrontPage(content)) return false;
  return content.premades.some(item => item.id === itemId && item.visible && !item.isDraft && (!item.soldChannel || item.soldChannel === "tmc") && item.price !== null && Number.isFinite(item.price) && item.price >= 0);
}
export function getPublicRequestPage(content: OwnerContent, slug: readonly string[]): OwnerPage | undefined {
  if (slug.length !== 2 || slug[1] !== "request") return undefined;
  return content.pages.find(page => page.builtinKey === "commissions" && page.slug === slug[0] && isPageAvailable(content, page));
}
