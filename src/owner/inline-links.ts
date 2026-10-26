import { isSafeLink } from "./model";

export type InlineTextPart = { text: string; href?: string };
/** A deliberately small link-only syntax. HTML, images, scripts and embeds stay text. */
export function parseInlineLinks(text: string): InlineTextPart[] {
  const result: InlineTextPart[] = [];
  const pattern = /\[([^\]\r\n]{1,300})\]\(([^\s)]{1,2048})\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (!isSafeLink(match[2])) continue;
    if (start > cursor) result.push({ text: text.slice(cursor, start) });
    result.push({ text: match[1], href: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length || !result.length) result.push({ text: text.slice(cursor) });
  return result;
}
export function makeInlineLink(label: string, href: string): string | null {
  const name = label.trim(), destination = href.trim();
  if (!name || name.length > 300 || /[\[\]\r\n]/.test(name) || !isSafeLink(destination)) return null;
  return `[${name}](${destination.replaceAll("(", "%28").replaceAll(")", "%29")})`;
}
/** Avoid offering a nested link inside an existing link's text. */
export function templateSupportsInlineLinks(key: string): boolean {
  return /(?:intro|body|description|note|message|copy|caption|photoCredit)$/i.test(key)
    && !["home.pricesBody", "home.careBody"].includes(key);
}
