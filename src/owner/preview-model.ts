import { isPageAvailable, isSafeLink, type BuiltinPageKey, type OwnerContent, type OwnerPage } from "./model";

export const OWNER_PREVIEW_ROOT = "/taylor/preview";
const LEGACY_PREVIEW_ROOT = "/owner/preview";

/** Menu visibility does not disable a page URL; trash and the premades switch do. */
export function isPreviewPageAvailable(content: OwnerContent, page: OwnerPage): boolean {
  return isPageAvailable(content, page);
}
export function getPreviewPage(content: OwnerContent, slug: readonly string[]): OwnerPage | undefined {
  if (slug.length > 1) return undefined;
  return content.pages.find(page => page.slug === (slug[0] ?? "") && isPreviewPageAvailable(content, page));
}
export function previewPageHref(page: OwnerPage): string {
  return page.slug ? `${OWNER_PREVIEW_ROOT}/${encodeURIComponent(page.slug)}` : OWNER_PREVIEW_ROOT;
}
export function previewBuiltinHref(content: OwnerContent, key: BuiltinPageKey): string | null {
  const page = content.pages.find(page => page.builtinKey === key && isPreviewPageAvailable(content, page));
  return page ? previewPageHref(page) : null;
}
export type PreviewDestination = { href: string; kind: "page" | "external" | "anchor" | "download" };
/** Resolve only real, available content pages. Never turn arbitrary internal paths into owner/admin links. */
export function resolveSiteDestination(content: OwnerContent, href: string, mode: "public" | "preview"): PreviewDestination | null {
  if (!isSafeLink(href)) return null;
  if (href.startsWith("#")) return { href, kind: "anchor" };
  if (!href.startsWith("/")) return { href, kind: "external" };
  try {
    const url = new URL(href, "https://owner-preview.invalid");
    if (url.pathname === "/downloads/taylor-made-creations-care.pdf") return { href: url.pathname, kind: "download" };
    let path = url.pathname.replace(/\/$/, "");
    for (const root of [OWNER_PREVIEW_ROOT, LEGACY_PREVIEW_ROOT]) {
      if (path === root) { path = ""; break; }
      if (path.startsWith(`${root}/`)) { path = path.slice(root.length); break; }
    }
    path = path.replace(/^\//, "");
    const decoded = decodeURIComponent(path);
    if (decoded.includes("/")) {
      const commission = getPreviewCommissionPage(content, decoded.split("/"));
      return commission ? { href: `${mode === "public" ? "" : OWNER_PREVIEW_ROOT}/${encodeURIComponent(commission.slug)}/request${url.search}${url.hash}`, kind: "page" } : null;
    }
    const page = getPreviewPage(content, decoded ? [decoded] : []);
    const target = page ? mode === "public" ? (page.slug ? `/${encodeURIComponent(page.slug)}` : "/") : previewPageHref(page) : null;
    return target ? { href: `${target}${url.search}${url.hash}`, kind: "page" } : null;
  } catch { return null; }
}
export function resolvePreviewDestination(content: OwnerContent, href: string): PreviewDestination | null {
  return resolveSiteDestination(content, href, "preview");
}

export function getPreviewCommissionPage(content: OwnerContent, slug: readonly string[]): OwnerPage | undefined {
  if (slug.length !== 2 || slug[1] !== "request") return undefined;
  return content.pages.find(page => page.builtinKey === "commissions" && page.slug === slug[0] && isPreviewPageAvailable(content, page));
}
