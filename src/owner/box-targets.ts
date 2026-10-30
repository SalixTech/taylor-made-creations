import type { OwnerPage, PageBlock } from "./model";
import { TEXT_FIELDS, IMAGE_FIELDS, LINK_FIELDS } from "./site-design";

/** Explicit renderer contract, not a promise to transform arbitrary DOM. */
export const BOX_BLOCK_TYPES: readonly PageBlock["type"][] = ["text", "heading", "image", "list", "link", "feature", "faq", "divider", "spacer"];
export const BOX_CORE_KEYS = ["home.eyebrow", "home.title", "home.description", "home.caption", "prices.intro"] as const;
export const NON_BOX_TEMPLATE_TEXT_KEYS = ["contact.namePlaceholder", "contact.emailPlaceholder", "contact.messagePlaceholder"];
export function boxStyleKeyForTarget(target: string | null): string | null {
  if (target === "home-image") return "home.image";
  if (target?.startsWith("core-text:")) { const key = target.slice(10); return BOX_CORE_KEYS.some(value => value === key) ? key : null; }
  if (target?.startsWith("template-text:")) { const key = target.slice(14); return TEXT_FIELDS.some(field => field.key === key) && !NON_BOX_TEMPLATE_TEXT_KEYS.includes(key) ? key : null; }
  if (target?.startsWith("template-link:")) { const key = target.slice(14); return LINK_FIELDS.some(field => field.key === key) ? key : null; }
  if (target?.startsWith("template-image:")) { const key = target.slice(15); return key !== "site.logo" && IMAGE_FIELDS.some(field => field.key === key) ? key : null; }
  return null;
}
export function supportsBoxTarget(target: string | null, page: OwnerPage): boolean {
  return Boolean(boxStyleKeyForTarget(target) || target === "page-title" || (target?.startsWith("block:") && page.blocks.some(block => block.id === target.slice(6) && BOX_BLOCK_TYPES.includes(block.type))));
}
export function boxTargetLabel(target: string, page: OwnerPage): string {
  if (target === "page-title") return "Page title";
  if (target === "home-image") return "Main photo + caption";
  const block = page.blocks.find(block => target === `block:${block.id}`);
  if (block) return `${page.blocks.indexOf(block) + 1}. ${block.type} section`;
  const key = boxStyleKeyForTarget(target);
  return [...TEXT_FIELDS, ...IMAGE_FIELDS, ...LINK_FIELDS].find(field => field.key === key)?.label ?? key?.replaceAll(".", " ") ?? target;
}
/** Repeated semantic fields share their saved style, but controls follow the
 * occurrence the owner actually selected (e.g. a later starting-price label). */
export function findCanvasBoxTarget(canvas: HTMLDivElement, target: string, occurrence = 0): HTMLElement | null {
  if (!Number.isSafeInteger(occurrence) || occurrence < 0) return null;
  return Array.from(canvas.querySelectorAll<HTMLElement>("[data-owner-edit]")).filter(node => node.dataset.ownerEdit === target)[occurrence] ?? null;
}
