import type { OwnerFont, OwnerContent, PublicOwnerContent } from "./model";

/** Family identifiers are generated from allowlisted IDs, never from an uploaded font's display name. */
export function fontFamilyName(id: string | undefined): string | undefined {
  return id && /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? `TMCFont_${id}` : undefined;
}
export function fontFamilyForId(id: string | undefined): string | undefined {
  const name = fontFamilyName(id);
  return name ? `"${name}", sans-serif` : undefined;
}

/** Only load fonts actually referenced by this site, not every file in the reusable upload library. */
export function referencedSiteFonts(content: OwnerContent | PublicOwnerContent): OwnerFont[] {
  const ids = new Set([content.design?.bodyFontId, content.design?.headingFontId,
    ...Object.values(content.contentOverrides?.styles ?? {}).map(style => style.fontId),
    ...content.pages.flatMap(page => [page.titleAppearance?.fontId, ...page.blocks.map(block => block.appearance?.fontId)]),
  ].filter(Boolean));
  return (content.fonts ?? []).filter(font => ids.has(font.id));
}
