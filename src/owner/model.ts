import {isElementLinkKey,elementLinkKeyIsPublic} from "./canvas-hyperlinks";
import { BUTTON_PRESETS, validateButtonStyle, type ButtonAppearance } from "./button-import";
import {validateInlineTextStyles,projectInlineTextStyles} from "./rich-text";
import { validateContentCanvasLayout, projectCanvasLayouts, type CanvasLayout } from "./canvas-layout";
import { isCanvasStyleKey, canvasStyleKeyIsPublic } from "./canvas-target-registry";
import { validElementBox } from "./box-geometry";
import { validateCommissionFormConfig, projectCommissionFormConfig, type CommissionFormConfig } from "../components/commission-form-config";
import { DESIGN_COLOR_FIELDS, DESIGN_SELECT_FIELDS, TEXT_FIELDS, IMAGE_FIELDS, LINK_FIELDS, STYLE_FIELDS, type SiteDesign, type ContentOverrides, type ElementAppearance } from "./site-design";

/** Serializable, versioned public content only. Never store credentials or customer data here. */
export const OWNER_SCHEMA_VERSION = 1 as const;
export const COMMISSION_STATUSES = ["Opening Soon!", "Closed", "Open!", "Waitlist"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const BUILTIN_ROUTES = {
  home: "", prices: "prices", gallery: "gallery", commissions: "commissions",
  premades: "premades", suitcare: "suitcare", contact: "contact", terms: "terms",
  examples: "examples", "client-hub": "client-hub",
} as const;
export type BuiltinPageKey = keyof typeof BUILTIN_ROUTES;
export type TextBlock = { id: string; type: "text"; heading: string; body: string };
export type ImageBlock = { id: string; type: "image"; src: string; alt: string; caption: string };
export type LinkBlock = { id: string; type: "link"; label: string; href: string; buttonDesignId?:string; buttonAppearance?:ButtonAppearance };
export function buttonAppearanceSources(content:OwnerContent|PublicOwnerContent):string[]{return [...Object.values(content.contentOverrides?.links??{}).flatMap(link=>link.buttonAppearance?.artwork?[link.buttonAppearance.artwork.src]:[]),...[...content.pages.flatMap(page=>page.blocks),...(content.footerBlocks??[])].flatMap(block=>block.type==="link"&&block.buttonAppearance?.artwork?[block.buttonAppearance.artwork.src]:[])];}
function copyButtonAppearance(value:ButtonAppearance):ButtonAppearance{if(value.artwork?.src.startsWith("data:"))throw new OwnerValidationError([{path:"buttonAppearance.artwork",message:"Upload button artwork before publishing. Browser-local images cannot be published."}]);return {preset:value.preset,...(value.artwork?{artwork:{src:value.artwork.src}}:{}),...(value.imported?{imported:{...value.imported}}:{}),...(value.hover?{hover:{...value.hover}}:{}),...(value.focus?{focus:{...value.focus}}:{})};}
export type ButtonDesign={id:string;name:string}&ButtonAppearance;
export type HeadingBlock = { id: string; type: "heading"; text: string; level: 2 | 3 };
export type ListBlock = { id: string; type: "list"; items: string[]; style: "bullet" | "numbered" };
export type DividerBlock = { id: string; type: "divider" };
export type CanvasSpaceBlock = { id: string; type: "canvas-space"; widthPx: number; heightPx: number };
export type SpacerBlock = { id: string; type: "spacer"; size: "small" | "medium" | "large" };
export type FaqBlock = { id: string; type: "faq"; items: { id: string; question: string; answer: string }[] };
export type FeatureBlock = { id: string; type: "feature"; heading: string; body: string; src: string; alt: string; imageSide: "left" | "right" };
export type CommissionStatusBlock = {id:string;type:"commission-status";label:string;note:string;actionLabel:string};
export type SectionBlock = { id: string; type: "section"; heading: string };
export type PageBlock = (SectionBlock | CommissionStatusBlock | TextBlock | ImageBlock | LinkBlock | HeadingBlock | ListBlock | DividerBlock | SpacerBlock | CanvasSpaceBlock | FaqBlock | FeatureBlock) & { appearance?: ElementAppearance; parentId?: string; mobileParentId?: string | null; mobileOrder?: number };
export type FooterBlock = (TextBlock | HeadingBlock | LinkBlock) & {appearance?:ElementAppearance};
export type PageNavPlacement = "main" | "more" | "unlisted";
export type PageAvailability = "public" | "hidden";
export type OwnerPage = {
  id: string; kind: "builtin" | "custom"; builtinKey?: BuiltinPageKey;
  /** One path segment, with the empty string reserved for the built-in home page. */
  slug: string; title: string; navLabel: string; showInNav: boolean; order: number;
  /** Optional for unchanged legacy drafts; placement takes precedence over showInNav. */
  navPlacement?: PageNavPlacement; availability?: PageAvailability;
  trashedAt: string | null; blocks: PageBlock[]; titleAppearance?: ElementAppearance; canvasLayout?: CanvasLayout;
};
export type PriceItem = { id: string; name: string; price: number; detail: string };
export type PriceGroup = { id: string; title: string; note: string; items: PriceItem[] };
export type PriceLine = { id: string; name: string; price: number };
export type GalleryItem = { id: string; name: string; src: string; alt: string; width: number; height: number; visible: boolean; /** Blank or absent preserves automatic numbering. */ displayNumber?: string };
export type OwnerPremadePhoto = { id: string; src: string; alt: string };
export type PremadeSoldChannel = "tmc" | "third-party" | "con";
export type OwnerPremade = { soldChannel?: PremadeSoldChannel; externalUrl?: string; venue?: string; badge?: string; tags?: string[]; /** Private saved listing; excluded even by whole-site publication. */ isDraft?: boolean; id: string; name: string; image: string; alt: string; description: string; price: number | null; visible: boolean; photos?: OwnerPremadePhoto[]; coverPhotoId?: string; imageFit?: "cover" | "contain"; imagePositionX?: number; imagePositionY?: number };
export const MAX_PREMADE_TAGS = 10;
export const MAX_PREMADE_TAG_LENGTH = 80;
/** Commas delimit tags. Preserve the first spelling; never silently truncate. */
export function parsePremadeTags(value: string): string[] {
  const seen = new Set<string>();
  return value.split(",").map(tag => tag.trim()).filter(tag => {
    const key = tag.toLocaleLowerCase("en-US");
    if (!tag || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
/** An unchanged legacy badge remains one badge, including any literal comma. */
export function getPremadeTags(item: Pick<OwnerPremade, "badge" | "tags">): string[] {
  return item.tags !== undefined ? [...item.tags] : item.badge?.trim() ? [item.badge.trim()] : [];
}
export type OwnerSocialLink = { id: string; label: string; value: string; url?: string };
export type OwnerFont = { id: string; name: string; src: string; format: "woff2" | "woff" | "ttf" | "otf" };
export type OwnerContent = {
  schemaVersion: typeof OWNER_SCHEMA_VERSION;
  /** Optional creative settings: older saved drafts retain their original bytes and appearance. */
  design?: SiteDesign;
  chromeLayout?: CanvasLayout;
  footerBlocks?: FooterBlock[];
  fonts?: OwnerFont[];
  buttonDesigns?:ButtonDesign[];
  gallerySettings?:{showNumbers:boolean};
  contentOverrides?: ContentOverrides;
  /** Form structure and wording only. Client answers and consent are never stored here. */
  commissionForm?: CommissionFormConfig;
  site: { socialLinks?: OwnerSocialLink[]; moreEnabled?: boolean; catalogMode?: boolean; additionalPartsQuantities?: boolean; name: string; commissionStatus: CommissionStatus; statusNote: string; showPremades: boolean; telegram: string; discord: string; email: string; tiktok: string; twitch: string };
  home: { eyebrow: string; title: string; description: string; image: { src: string; alt: string }; caption: string };
  prices: { intro: string; groups: PriceGroup[]; parts: PriceLine[]; extras: PriceLine[] };
  gallery: GalleryItem[];
  premades: OwnerPremade[];
  pages: OwnerPage[];
};
export const MAX_NAMED_DRAFTS = 10;
export const MAX_DRAFT_NAME_LENGTH = 80;
export type OwnerNamedDraftSummary = { id: string; name: string; revision: number; createdAt: string; updatedAt: string };
export type OwnerNamedDraft = OwnerNamedDraftSummary & { content: OwnerContent };
export type SaveNamedDraftOptions = { id?: string; expectedRevision?: number };
export type LocalPublication = { content: OwnerContent; publishedAt: string };
export type OwnerWorkspace = {
  schemaVersion: typeof OWNER_SCHEMA_VERSION;
  revision: number;
  draft: OwnerContent;
  /** A browser-local preview snapshot. This is NEVER a live/public publication. */
  localPublished: LocalPublication | null;
  updatedAt: string | null;
};
export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };
export class OwnerValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map(({ path, message }) => `${path}: ${message}`).join("\n"));
    this.name = "OwnerValidationError";
    this.issues = issues;
  }
}

const RESERVED_SLUGS = new Set([
  ...Object.values(BUILTIN_ROUTES), "taylor", "owner", "admin", "api", "_next", "_vercel",
  "care", "tos", "login", "logout", "signin", "signup", "auth", "preview",
  "robots", "sitemap", "favicon", "images", "assets", "fonts", "manifest",
  "new", "edit", "settings", "account", "checkout", "cart", "404", "500",
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$&'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const MAX_IMAGE_SOURCE_LENGTH = 8 * 1024 * 1024;
export const MAX_CONTENT_BYTES = 24 * 1024 * 1024;

/** Returns a friendly error or null. Trashed pages retain their URL until restored. */
export function validatePageSlug(slug: string, pages: readonly OwnerPage[] = [], excludingId?: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) return "Use 1–64 lowercase letters, numbers and single hyphens, with no spaces or slashes.";
  const existing = pages.find(page => page.id === excludingId);
  const ownBuiltinSlug = existing?.kind === "builtin" && existing.builtinKey && BUILTIN_ROUTES[existing.builtinKey] === slug;
  if (RESERVED_SLUGS.has(slug) && !ownBuiltinSlug) return "This address is reserved for a built-in page or site feature.";
  if (pages.some(page => page.id !== excludingId && page.slug === slug)) return "Another page already uses this address, including pages in the trash.";
  return null;
}
export function slugifyTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-$/, "");
}
export function newOwnerId(prefix = "item"): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
export function isSafeLink(href: string): boolean {
  if (!href || href.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(href)) return false;
  if (/^\/api\/cloud-documents(?:[/?#]|$)/i.test(href)) return isWebsiteDocumentHref(href);
  if (/^\/api\/(?:cloud-files|owner-files|private-files)(?:[/?#]|$)/i.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//") && !/%(?:0[0-9a-f]|1[0-9a-f]|20|5c)/i.test(href);
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(href)) return true;
  if (href.startsWith("mailto:")) return EMAIL_PATTERN.test(href.slice(7));
  try { const url = new URL(href); return /^https:\/\//i.test(href) && url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function isSafeButtonArtwork(src:string):boolean{return isSafeImageSource(src)&&(/^\/api\/(?:cloud-media|media)\/[0-9a-f-]+$/.test(src)||/^\/images\/[^?#%]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(src)||/^data:image\/(?:png|jpeg|webp|gif|avif);base64,/.test(src));}
export function isWebsiteDocumentHref(href:string):boolean{return /^\/api\/cloud-documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(href);}
export function isSafeImageSource(src: string): boolean {
  if (!src || src.length > MAX_IMAGE_SOURCE_LENGTH) return false;
  if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return true;
  if (/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(src)) return true;
  if (/^\/api\/cloud-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(src)) return true;
  if (src.startsWith("/images/") && !src.includes("..") && !/[\\\u0000-\u0020?#%]/.test(src)) return true;
  try { const url = new URL(src); return /^https:\/\//i.test(src) && url.protocol === "https:" && !url.username && !url.password && !/[\\\u0000-\u0020]/.test(src); } catch { return false; }
}

/** Validate untrusted JSON at every persistence boundary, not only in form controls. */
function validateContent(value: unknown, published = false): ValidationResult {
  const issues: ValidationIssue[] = [];
  let textBytes = 0;
  const countText = (v: unknown) => {
    if (typeof v !== "string" || textBytes > MAX_CONTENT_BYTES) return;
    if (v.length > MAX_CONTENT_BYTES - textBytes) { textBytes = MAX_CONTENT_BYTES + 1; return; }
    textBytes += new TextEncoder().encode(v).byteLength;
  };
  const issue = (path: string, message: string) => { issues.push({ path, message }); };
  const object = (v: unknown, path: string): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v) || (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) { issue(path, "Must be a plain content object."); return {}; }
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, path: string, max = 500, required = true) => {
    countText(v);
    if (typeof v !== "string" || (required && !v.trim()) || (typeof v === "string" && v.length > max)) issue(path, `Enter ${required ? "non-empty " : ""}text of at most ${max} characters.`);
  };
  const bool = (v: unknown, path: string) => { if (typeof v !== "boolean") issue(path, "Must be true or false."); };
  const number = (v: unknown, path: string, max = 1_000_000, integer = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) issue(path, `Use a ${integer ? "whole " : ""}number between 0 and ${max}.`);
  };
  const money = (v: unknown, path: string) => {
    number(v, path);
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) > 0.000001) issue(path, "Use no more than two decimal places.");
  };
  const image = (v: unknown, path: string) => { countText(v); if (typeof v !== "string" || !isSafeImageSource(v)) issue(path, "Choose a local image, a secure HTTPS image, or an uploaded PNG, JPEG, WebP or GIF under 6 MB."); };
  const list = (v: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(v)) { issue(path, "Must be a list."); return []; }
    if (v.length > max) issue(path, `Use no more than ${max} items.`);
    return Array.from(v.slice(0, max + 1));
  };
  const ids = new Map<string, Set<string>>();
  const id = (v: unknown, path: string, namespace: string) => {
    if (typeof v !== "string" || !ID_PATTERN.test(v)) { issue(path, "Use a stable identifier with letters, numbers, hyphens or underscores."); return; }
    const set = ids.get(namespace) ?? new Set<string>();
    if (set.has(v)) issue(path, "Identifiers must be unique.");
    set.add(v); ids.set(namespace, set);
  };
  const exact = (v: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) issue(`${path}.${key}`, "This field is not supported. Raw HTML and scripts are never supported.");
  };
  const appearance = (value: unknown, path: string, allowMobile = true) => {
    const entry = object(value, path);
    exact(entry, ["textColor", "backgroundColor", "font", "textSize", "align", "imageFit", "imagePositionX", "imagePositionY", "fontSize", "headingAlign", "bodyAlign", "widthPercent", "heightPercent", "imageWidthPercent", "imageHeightPx", "imageAspectLocked", "fontId", "box", "marginTopPx", "marginRightPx", "marginBottomPx", "marginLeftPx", ...(allowMobile ? ["mobile"] : [])], path);
    for (const key of ["textColor", "backgroundColor"]) if (entry[key] !== undefined && (typeof entry[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(entry[key] as string))) issue(`${path}.${key}`, "Choose a six-digit hex color.");
    const options: Record<string, readonly string[]> = { font: ["original", "sans", "serif", "rounded", "mono"], textSize: ["small", "standard", "large"], align: ["left", "center", "right"], headingAlign: ["left", "center", "right"], bodyAlign: ["left", "center", "right"], imageFit: ["contain", "cover"] };
    for (const [key, choices] of Object.entries(options)) if (entry[key] !== undefined && (typeof entry[key] !== "string" || !choices.includes(entry[key] as string))) issue(`${path}.${key}`, "Choose one of the supported appearance options.");
    for (const key of ["imagePositionX", "imagePositionY"]) if (entry[key] !== undefined) number(entry[key], `${path}.${key}`, 100);
    if (entry.mobile !== undefined && allowMobile) appearance(entry.mobile, `${path}.mobile`, false);
    for (const key of ["marginTopPx","marginRightPx","marginBottomPx","marginLeftPx"]) if (entry[key] !== undefined && (typeof entry[key] !== "number" || !Number.isFinite(entry[key]))) issue(`${path}.${key}`, "Use a finite spacing value.");
    const positiveSize = (key: string) => { if (entry[key] !== undefined && (typeof entry[key] !== "number" || !Number.isFinite(entry[key]) || (entry[key] as number) <= 0)) issue(`${path}.${key}`, "Use a finite positive size."); };
    positiveSize("fontSize");
    if (entry.box !== undefined && !validElementBox(entry.box)) issue(`${path}.box`, "Use finite content-box geometry with positive dimensions.");
    positiveSize("widthPercent");
    positiveSize("imageWidthPercent");
    if (entry.imageAspectLocked !== undefined && typeof entry.imageAspectLocked !== "boolean") issue(`${path}.imageAspectLocked`, "Choose whether to lock image proportions.");
    positiveSize("imageHeightPx");
    positiveSize("heightPercent");
    if (entry.fontId !== undefined && (typeof entry.fontId !== "string" || !Array.isArray(root.fonts) || !root.fonts.some(font => font && typeof font === "object" && font.id === entry.fontId))) issue(`${path}.fontId`, "Choose a font uploaded to this draft.");
  };
  const root = object(value, "content");
  exact(root, ["schemaVersion", "site", "home", "prices", "gallery", "premades", "pages", "design", "contentOverrides", "fonts", "commissionForm", "chromeLayout", "buttonDesigns", "gallerySettings", "footerBlocks"], "content");
  if (root.commissionForm !== undefined) issues.push(...validateCommissionFormConfig(root.commissionForm).issues);
  if (root.schemaVersion !== OWNER_SCHEMA_VERSION) issue("schemaVersion", "This content version is not supported.");
  if (root.fonts !== undefined) list(root.fonts, "fonts", MAX_CONTENT_BYTES).forEach((value, index) => {
    const path = `fonts[${index}]`; const font = object(value, path);
    exact(font, ["id", "name", "src", "format"], path); id(font.id, `${path}.id`, "fonts"); text(font.name, `${path}.name`, 100);
    if (!["woff", "woff2", "ttf", "otf"].includes(font.format as string)) issue(`${path}.format`, "Choose a WOFF, WOFF2, TTF or OTF font.");
    if (typeof font.src !== "string" || !/^\/api\/(?:cloud-fonts|fonts)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(font.src)) issue(`${path}.src`, "Choose a font from the authorized font uploader.");
  });
  const validateDesign = (value: unknown, path: string, allowMobile = true) => {
    const design = object(value, path);
    exact(design, [...(allowMobile ? ["mobileLayoutEnabled", "mobileDesign"] : []), "colors", "bodyFontSize", "headingFontSize", "bodyFontId", "headingFontId", ...DESIGN_SELECT_FIELDS.map(field => field.key)], path);
    if (allowMobile && design.mobileDesign !== undefined) validateDesign(design.mobileDesign, `${path}.mobileDesign`, false);
    if (design.mobileLayoutEnabled !== undefined && typeof design.mobileLayoutEnabled !== "boolean") issue(`${path}.mobileLayoutEnabled`, "Choose whether mobile has an independent layout.");
    for (const key of ["bodyFontSize", "headingFontSize"]) if (design[key] !== undefined && (typeof design[key] !== "number" || !Number.isFinite(design[key]) || (design[key] as number) <= 0)) issue(`${path}.${key}`, "Use a finite positive font size.");
    for (const key of ["bodyFontId", "headingFontId"]) if (design[key] !== undefined && (typeof design[key] !== "string" || !Array.isArray(root.fonts) || !root.fonts.some(font => font && typeof font === "object" && font.id === design[key]))) issue(`${path}.${key}`, "Choose a font uploaded to this draft.");
    if (design.colors !== undefined) {
      const colors = object(design.colors, `${path}.colors`);
      exact(colors, DESIGN_COLOR_FIELDS.map(field => field.key), `${path}.colors`);
      for (const [key, value] of Object.entries(colors)) if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) issue(`${path}.colors.${key}`, "Choose a six-digit hex color, such as #800014.");
    }
    for (const field of DESIGN_SELECT_FIELDS) if (design[field.key] !== undefined && !field.options.some(option => option.value === design[field.key])) issue(`${path}.${field.key}`, "Choose one of the supported design options.");
  };
  if (root.design !== undefined) validateDesign(root.design, "design");
  const buttonIds=new Set<string>();
  const buttonAppearance=(value:unknown,path:string,reusable=false)=>{
    const entry=object(value,path);exact(entry,[...(reusable?["id","name"]:[]),"preset","artwork","imported","hover","focus"],path);
    if(!BUTTON_PRESETS.includes(entry.preset as ButtonAppearance["preset"]))issue(`${path}.preset`,"Choose a button preset.");
    for(const state of ["imported","hover","focus"])if(entry[state]!==undefined&&!validateButtonStyle(entry[state]))issue(`${path}.${state}`,"Choose supported structured button styles.");
    if(entry.artwork!==undefined){const artwork=object(entry.artwork,`${path}.artwork`);exact(artwork,["src"],`${path}.artwork`);if(typeof artwork.src!=="string"||!isSafeButtonArtwork(artwork.src))issue(`${path}.artwork.src`,"Choose an uploaded raster button image.");}
  };
  if(root.buttonDesigns!==undefined)list(root.buttonDesigns,"buttonDesigns",100).forEach((value,index)=>{const path=`buttonDesigns[${index}]`,entry=object(value,path);buttonAppearance(value,path,true);id(entry.id,`${path}.id`,"buttonDesigns");if(typeof entry.id==="string")buttonIds.add(entry.id);text(entry.name,`${path}.name`,100);});
  if(root.gallerySettings!==undefined){const settings=object(root.gallerySettings,"gallerySettings");exact(settings,["showNumbers"],"gallerySettings");bool(settings.showNumbers,"gallerySettings.showNumbers");}
  const buttonRef=(value:unknown,path:string)=>{if(value!==undefined&&(typeof value!=="string"||!buttonIds.has(value)))issue(path,"Choose an existing reusable button design.");};
  if (root.contentOverrides !== undefined) {
    const overrides = object(root.contentOverrides, "contentOverrides");
    exact(overrides, ["text", "images", "links", "styles", "inlineStyles", "elementLinks"], "contentOverrides");
    if (overrides.styles !== undefined) {
      const fields = object(overrides.styles, "contentOverrides.styles"); exact(fields, [...STYLE_FIELDS.map(field => field.key), ...Object.keys(fields).filter(isCanvasStyleKey)], "contentOverrides.styles");
      for (const [key, value] of Object.entries(fields)) appearance(value, `contentOverrides.styles.${key}`);
    }
    if (overrides.text !== undefined) {
      const fields = object(overrides.text, "contentOverrides.text"); exact(fields, TEXT_FIELDS.map(field => field.key), "contentOverrides.text");
      for (const [key, value] of Object.entries(fields)) text(value, `contentOverrides.text.${key}`, 2000, false);
    }
    if (overrides.images !== undefined) {
      const fields = object(overrides.images, "contentOverrides.images"); exact(fields, IMAGE_FIELDS.map(field => field.key), "contentOverrides.images");
      for (const [key, value] of Object.entries(fields)) {
        const path = `contentOverrides.images.${key}`; const entry = object(value, path); exact(entry, ["src", "alt"], path);
        image(entry.src, `${path}.src`); text(entry.alt, `${path}.alt`, 500, key !== "site.logo");
      }
    }
    if (overrides.elementLinks !== undefined) {
      const fields=object(overrides.elementLinks,"contentOverrides.elementLinks");
      for(const [key,value] of Object.entries(fields)){countText(value);if(!isElementLinkKey(root as unknown as OwnerContent,key))issue(`contentOverrides.elementLinks.${key}`,"Choose an existing text or photo target.");if(typeof value!=="string"||!isSafeLink(value))issue(`contentOverrides.elementLinks.${key}`,"Use a safe website link.");}
    }
    if (overrides.links !== undefined) {
      const fields = object(overrides.links, "contentOverrides.links"); exact(fields, LINK_FIELDS.map(field => field.key), "contentOverrides.links");
      for (const [key, value] of Object.entries(fields)) {
        const path = `contentOverrides.links.${key}`; const entry = object(value, path); exact(entry, ["label", "href", "buttonDesignId", "buttonAppearance"], path);buttonRef(entry.buttonDesignId,`${path}.buttonDesignId`);if(entry.buttonAppearance!==undefined)buttonAppearance(entry.buttonAppearance,`${path}.buttonAppearance`); text(entry.label, `${path}.label`, 150);
        countText(entry.href); if (typeof entry.href !== "string" || !isSafeLink(entry.href)) issue(`${path}.href`, "Use a site path, HTTPS address, email link or section anchor. Scripts are not allowed.");
      }
    }
  }

  const site = object(root.site, "site");
  exact(site, ["name", "commissionStatus", "statusNote", "showPremades", "telegram", "discord", "email", "tiktok", "twitch", "moreEnabled", "catalogMode", "additionalPartsQuantities", "socialLinks"], "site");
  text(site.name, "site.name", 120); text(site.statusNote, "site.statusNote", 1000, false);
  if (!COMMISSION_STATUSES.includes(site.commissionStatus as CommissionStatus)) issue("site.commissionStatus", "Choose Opening Soon!, Closed, Open! or Waitlist.");
  bool(site.showPremades, "site.showPremades");
  for (const key of ["moreEnabled", "catalogMode", "additionalPartsQuantities"]) if (site[key] !== undefined) bool(site[key], `site.${key}`);
  for (const key of ["telegram", "discord", "email", "tiktok", "twitch"]) text(site[key], `site.${key}`, 254, false);
  for (const key of ["telegram", "tiktok", "twitch"]) if (typeof site[key] === "string" && site[key] && !/^[A-Za-z0-9_.]{1,64}$/.test(site[key] as string)) issue(`site.${key}`, "Enter a username without @, spaces or a URL.");
  if (typeof site.email === "string" && site.email && !EMAIL_PATTERN.test(site.email)) issue("site.email", "Enter a valid email address, without an email link query or encoded headers.");
  if (site.socialLinks !== undefined) list(site.socialLinks, "site.socialLinks", 50).forEach((value, index) => {
    const path = `site.socialLinks[${index}]`, entry = object(value, path);
    exact(entry, ["id", "label", "value", "url"], path); id(entry.id, `${path}.id`, "socialLinks");
    text(entry.label, `${path}.label`, 80); text(entry.value, `${path}.value`, 254);
    if (entry.url !== undefined) {
      countText(entry.url);
      if (typeof entry.url !== "string" || entry.url.length > 2000 || (entry.url !== "" && (!/^(https:\/\/|mailto:)/i.test(entry.url) || !isSafeLink(entry.url)))) issue(`${path}.url`, "Use a secure HTTPS address or a plain email link, or leave this blank for text only.");
    }
  });
  const home = object(root.home, "home");
  exact(home, ["eyebrow", "title", "description", "image", "caption"], "home");
  text(home.eyebrow, "home.eyebrow", 150, false); text(home.title, "home.title", 200);
  text(home.description, "home.description", 2000, false); text(home.caption, "home.caption", 300, false);
  const hero = object(home.image, "home.image"); exact(hero, ["src", "alt"], "home.image"); image(hero.src, "home.image.src"); text(hero.alt, "home.image.alt", 500);
  const prices = object(root.prices, "prices"); exact(prices, ["intro", "groups", "parts", "extras"], "prices"); text(prices.intro, "prices.intro", 2000, false);
  list(prices.groups, "prices.groups", 30).forEach((v, i) => {
    const path = `prices.groups[${i}]`; const group = object(v, path);
    exact(group, ["id", "title", "note", "items"], path); id(group.id, `${path}.id`, "priceGroups"); text(group.title, `${path}.title`, 120); text(group.note, `${path}.note`, 500, false);
    list(group.items, `${path}.items`, 100).forEach((v, j) => {
      const p = `${path}.items[${j}]`; const item = object(v, p); exact(item, ["id", "name", "price", "detail"], p);
      id(item.id, `${p}.id`, "priceItems"); text(item.name, `${p}.name`, 150); money(item.price, `${p}.price`); text(item.detail, `${p}.detail`, 1000, false);
    });
  });
  for (const key of ["parts", "extras"]) list(prices[key], `prices.${key}`, 100).forEach((v, i) => {
    const p = `prices.${key}[${i}]`; const item = object(v, p); exact(item, ["id", "name", "price"], p);
    id(item.id, `${p}.id`, "priceLines"); text(item.name, `${p}.name`, 150); money(item.price, `${p}.price`);
  });
  list(root.gallery, "gallery", 200).forEach((v, i) => {
    const p = `gallery[${i}]`; const item = object(v, p); exact(item, ["id", "name", "src", "alt", "width", "height", "visible", "displayNumber"], p);
    id(item.id, `${p}.id`, "gallery"); text(item.name, `${p}.name`, 150); image(item.src, `${p}.src`); text(item.alt, `${p}.alt`, 500); bool(item.visible, `${p}.visible`);
    if (item.displayNumber !== undefined) text(item.displayNumber, `${p}.displayNumber`, 24, false);
    for (const dimension of ["width", "height"]) { number(item[dimension], `${p}.${dimension}`, 20000, true); if (item[dimension] === 0) issue(`${p}.${dimension}`, "Image dimensions must be greater than zero."); }
  });
  list(root.premades, "premades", 100).forEach((v, i) => {
    const p = `premades[${i}]`; const item = object(v, p); exact(item, ["id", "name", "image", "alt", "description", "price", "visible", "photos", "coverPhotoId", "imageFit", "imagePositionX", "imagePositionY", "soldChannel", "externalUrl", "venue", "badge", "tags", "isDraft"], p);
    id(item.id, `${p}.id`, "premades"); text(item.name, `${p}.name`, 150); image(item.image, `${p}.image`); text(item.alt, `${p}.alt`, 500); text(item.description, `${p}.description`, 5000, false); bool(item.visible, `${p}.visible`);
    if (item.price !== null) money(item.price, `${p}.price`);
    if (item.soldChannel !== undefined && !["tmc", "third-party", "con"].includes(item.soldChannel as string)) issue(`${p}.soldChannel`, "Choose Sold Here, third party or convention.");
    if (item.externalUrl !== undefined) {
      text(item.externalUrl, `${p}.externalUrl`, 2048, false);
      if (item.externalUrl && (typeof item.externalUrl !== "string" || !/^https:\/\//i.test(item.externalUrl) || !isSafeLink(item.externalUrl))) issue(`${p}.externalUrl`, "Use a secure HTTPS listing address without credentials.");
    }
    if (item.soldChannel === "third-party" && !item.isDraft && !item.externalUrl) issue(`${p}.externalUrl`, "Add the HTTPS third-party listing address.");
    if (item.venue !== undefined) text(item.venue, `${p}.venue`, 200, false);
    if (item.badge !== undefined) text(item.badge, `${p}.badge`, 80, false);
    if (item.isDraft !== undefined) bool(item.isDraft, `${p}.isDraft`);
    if (item.tags !== undefined) {
      const seen = new Set<string>();
      list(item.tags, `${p}.tags`, MAX_PREMADE_TAGS).forEach((tag, index) => {
        const path = `${p}.tags[${index}]`;
        text(tag, path, MAX_PREMADE_TAG_LENGTH);
        if (typeof tag === "string") {
          if (tag !== tag.trim() || tag.includes(",")) issue(path, "Use trimmed individual tags without commas.");
          const key = tag.toLocaleLowerCase("en-US");
          if (seen.has(key)) issue(path, "Each listing tag must be unique.");
          seen.add(key);
        }
      });
    }
    if (item.photos !== undefined) {
      // The serialized byte budget bounds the collection, not an arbitrary photo count.
      list(item.photos, `${p}.photos`, MAX_CONTENT_BYTES).forEach((value, index) => {
        const path = `${p}.photos[${index}]`; const photo = object(value, path);
        exact(photo, ["id", "src", "alt"], path); id(photo.id, `${path}.id`, `premadePhotos:${String(item.id)}`);
        image(photo.src, `${path}.src`); text(photo.alt, `${path}.alt`, 500);
      });
    }
    if (item.coverPhotoId !== undefined) {
      const cover = Array.isArray(item.photos) ? item.photos.find(photo => photo && typeof photo === "object" && photo.id === item.coverPhotoId) : undefined;
      if (typeof item.coverPhotoId !== "string" || !cover) issue(`${p}.coverPhotoId`, "Choose a cover photo from this premade’s photos.");
      else if (item.image !== cover.src || item.alt !== cover.alt) issue(`${p}.coverPhotoId`, "The premade cover image and description must match the selected cover photo.");
    }
    if (item.imageFit !== undefined && item.imageFit !== "cover" && item.imageFit !== "contain") issue(`${p}.imageFit`, "Choose cover or contain.");
    for (const position of ["imagePositionX", "imagePositionY"]) if (item[position] !== undefined) number(item[position], `${p}.${position}`, 100);
  });
  if(root.footerBlocks!==undefined)list(root.footerBlocks,"footerBlocks",100).forEach((value,index)=>{
    const p=`footerBlocks[${index}]`,block=object(value,p);id(block.id,`${p}.id`,"footerBlocks");
    if(block.appearance!==undefined)appearance(block.appearance,`${p}.appearance`);
    if(block.type==="text"){exact(block,["id","type","heading","body","appearance"],p);text(block.heading,`${p}.heading`,200,false);text(block.body,`${p}.body`,20000,false);}
    else if(block.type==="heading"){exact(block,["id","type","text","level","appearance"],p);text(block.text,`${p}.text`,200);if(block.level!==2&&block.level!==3)issue(`${p}.level`,"Choose heading level 2 or 3.");}
    else if(block.type==="link"){exact(block,["id","type","label","href","buttonDesignId","buttonAppearance","appearance"],p);text(block.label,`${p}.label`,150);if(typeof block.href!=="string"||!isSafeLink(block.href))issue(`${p}.href`,"Use a safe website link.");buttonRef(block.buttonDesignId,`${p}.buttonDesignId`);if(block.buttonAppearance!==undefined)buttonAppearance(block.buttonAppearance,`${p}.buttonAppearance`);}
    else issue(`${p}.type`,"Shared footer supports text, heading and button items only.");
  });
  const pages = list(root.pages, "pages", 100);
  const seenSlugs = new Set<string>(); const seenBuiltins = new Set<string>(); const seenOrders = new Set<number>();
  pages.forEach((v, i) => {
    const p = `pages[${i}]`; const page = object(v, p);
    exact(page, ["id", "kind", "builtinKey", "slug", "title", "navLabel", "showInNav", "order", "trashedAt", "blocks", "titleAppearance", "navPlacement", "availability", "canvasLayout"], p);
    if (page.navPlacement !== undefined && !["main", "more", "unlisted"].includes(page.navPlacement as string)) issue(`${p}.navPlacement`, "Choose main navigation, More or unlisted.");
    if (page.availability !== undefined && !["public", "hidden"].includes(page.availability as string)) issue(`${p}.availability`, "Choose accessible or hidden (404).");
    if (page.titleAppearance !== undefined) appearance(page.titleAppearance, `${p}.titleAppearance`);
    if(root.footerBlocks!==undefined&&page.id==="shared-footer")issue(`${p}.id`,"This identity is reserved for the shared footer.");
    if(Array.isArray(root.footerBlocks)&&Array.isArray(page.blocks)&&page.blocks.some(b=>b&&typeof b==="object"&&root.footerBlocks instanceof Array&&root.footerBlocks.some(f=>f&&typeof f==="object"&&f.id===b.id)))issue(`${p}.blocks`,"Shared footer identities must not duplicate page items.");
    id(page.id, `${p}.id`, "pages"); text(page.title, `${p}.title`, 150); text(page.navLabel, `${p}.navLabel`, 80); bool(page.showInNav, `${p}.showInNav`); number(page.order, `${p}.order`, 10000, true);
    if (typeof page.order === "number") { if (seenOrders.has(page.order)) issue(`${p}.order`, "Page positions must be unique."); seenOrders.add(page.order); }
    if (page.trashedAt !== null && (typeof page.trashedAt !== "string" || !isIsoDate(page.trashedAt))) issue(`${p}.trashedAt`, "Use a valid timestamp or null.");
    if (typeof page.slug !== "string") issue(`${p}.slug`, "Enter a page address.");
    else { if (seenSlugs.has(page.slug)) issue(`${p}.slug`, "Page addresses must be unique, including the trash."); seenSlugs.add(page.slug); }
    if (page.kind === "builtin") {
      const key = page.builtinKey;
      if (typeof key !== "string" || !Object.hasOwn(BUILTIN_ROUTES, key)) issue(`${p}.builtinKey`, "Unknown built-in page.");
      else {
        if (seenBuiltins.has(key)) issue(`${p}.builtinKey`, "A built-in page may only appear once.");
        seenBuiltins.add(key);
        if (key === "home") {
          if (page.slug !== "") issue(`${p}.slug`, "The home page must use the root address /.");
          if (page.trashedAt !== null) issue(`${p}.trashedAt`, "The home page cannot be moved to trash.");
          if (page.availability === "hidden") issue(`${p}.availability`, "The home page must remain accessible.");
        } else if (typeof page.slug === "string") {
          const error = validatePageSlug(page.slug, [page as unknown as OwnerPage], page.id as string);
          if (error) issue(`${p}.slug`, error);
        }
      }
    } else if (page.kind === "custom") {
      if (page.builtinKey !== undefined) issue(`${p}.builtinKey`, "Custom pages cannot replace built-in pages.");
      if (typeof page.slug === "string") { const error = validatePageSlug(page.slug); if (error) issue(`${p}.slug`, error); }
    } else issue(`${p}.kind`, "Choose a built-in or custom page.");
    const pageBlocks = list(page.blocks, `${p}.blocks`, 100);
    pageBlocks.forEach((v, j) => {
      const b = `${p}.blocks[${j}]`; const block = object(v, b); id(block.id, `${b}.id`, `blocks:${typeof page.id === "string" ? page.id : "invalid"}`);
      if (block.appearance !== undefined) appearance(block.appearance, `${b}.appearance`);
      for (const key of ["parentId", "mobileParentId"]) if (block[key] !== undefined && !(key === "mobileParentId" && block[key] === null) && (typeof block[key] !== "string" || !ID_PATTERN.test(block[key] as string))) issue(`${b}.${key}`, "Choose a section in this page.");
      if (block.mobileOrder !== undefined && (typeof block.mobileOrder !== "number" || !Number.isSafeInteger(block.mobileOrder) || block.mobileOrder < 0)) issue(`${b}.mobileOrder`, "Use a nonnegative integer mobile order.");
      if(block.type==="commission-status"){exact(block,["parentId","mobileParentId","mobileOrder","id","type","label","note","actionLabel","appearance"],b);text(block.label,`${b}.label`,2000,false);text(block.note,`${b}.note`,20000,false);text(block.actionLabel,`${b}.actionLabel`,2000,false);}
      else if (block.type === "section") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "heading", "appearance"], b); text(block.heading, `${b}.heading`, 200, false); }
      else if (block.type === "text") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "heading", "body", "appearance"], b); text(block.heading, `${b}.heading`, 200, false); text(block.body, `${b}.body`, 20000, false); }
      else if (block.type === "image") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "src", "alt", "caption", "appearance"], b); image(block.src, `${b}.src`); text(block.alt, `${b}.alt`, 500); text(block.caption, `${b}.caption`, 1000, false); }
      else if (block.type === "link") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "label", "href", "buttonDesignId", "buttonAppearance", "appearance"], b);buttonRef(block.buttonDesignId,`${b}.buttonDesignId`);if(block.buttonAppearance!==undefined)buttonAppearance(block.buttonAppearance,`${b}.buttonAppearance`); text(block.label, `${b}.label`, 150); if (typeof block.href !== "string" || !isSafeLink(block.href)) issue(`${b}.href`, "Use a site path, HTTPS address, email link or section anchor. Scripts are not allowed."); }
      else if (block.type === "heading") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "text", "level", "appearance"], b); text(block.text, `${b}.text`, 200); if (block.level !== 2 && block.level !== 3) issue(`${b}.level`, "Choose heading level 2 or 3."); }
      else if (block.type === "list") {
        exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "items", "style", "appearance"], b);
        if (block.style !== "bullet" && block.style !== "numbered") issue(`${b}.style`, "Choose a bullet or numbered list.");
        list(block.items, `${b}.items`, 100).forEach((item, index) => text(item, `${b}.items[${index}]`, 2000));
      }
      else if (block.type === "divider") exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "appearance"], b);
      else if (block.type === "canvas-space") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "widthPx", "heightPx", "appearance"], b); for (const key of ["widthPx", "heightPx"]) if (typeof block[key] !== "number" || !Number.isFinite(block[key]) || (block[key] as number) <= 0) issue(`${b}.${key}`, "Draw a finite, positive canvas space."); }
      else if (block.type === "spacer") { exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "size", "appearance"], b); if (typeof block.size !== "string" || !["small", "medium", "large"].includes(block.size)) issue(`${b}.size`, "Choose a small, medium or large space."); }
      else if (block.type === "faq") {
        exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "items", "appearance"], b);
        list(block.items, `${b}.items`, 30).forEach((value, index) => {
          const path = `${b}.items[${index}]`; const item = object(value, path); exact(item, ["id", "question", "answer"], path);
          id(item.id, `${path}.id`, `faq:${typeof page.id === "string" ? page.id : "invalid"}:${typeof block.id === "string" ? block.id : "invalid"}`); text(item.question, `${path}.question`, 200); text(item.answer, `${path}.answer`, 10000, false);
        });
      }
      else if (block.type === "feature") {
        exact(block, ["parentId", "mobileParentId", "mobileOrder", "id", "type", "heading", "body", "src", "alt", "imageSide", "appearance"], b); text(block.heading, `${b}.heading`, 200, false); text(block.body, `${b}.body`, 20000, false); image(block.src, `${b}.src`); text(block.alt, `${b}.alt`, 500);
        if (block.imageSide !== "left" && block.imageSide !== "right") issue(`${b}.imageSide`, "Choose an image on the left or right.");
      }
      else issue(`${b}.type`, "Choose a supported structured block. Raw HTML and scripts are never supported.");
    });
    // Validate both graphs even when mobile is disabled, so enabling it cannot
    // reveal a hidden cycle or an invalid cross-page parent.
    const records = pageBlocks.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
    const byId = new Map(records.filter(item => typeof item.id === "string").map(item => [item.id as string, item]));
    for (const mobile of [false,true]) for (const block of records) {
      const parentOf = (item: Record<string,unknown>) => mobile && Object.hasOwn(item,"mobileParentId") ? item.mobileParentId : item.parentId;
      const visited = new Set<unknown>([block.id]); let parent = parentOf(block);
      while (parent !== undefined && parent !== null) {
        const next = typeof parent === "string" ? byId.get(parent) : undefined;
        if (!next || next.type !== "section") { issue(`${p}.blocks`, "Each parent must be an existing section in the same page."); break; }
        if (visited.has(parent)) { issue(`${p}.blocks`, "Section nesting cannot contain a cycle."); break; }
        visited.add(parent); parent = parentOf(next);
      }
    }
  });
  for (const key of published ? ["home"] : Object.keys(BUILTIN_ROUTES)) if (!seenBuiltins.has(key)) issue("pages", `The ${key} built-in page must be retained; use the trash instead of deleting it.`);
  if(issues.length===0){
    const content=value as OwnerContent;
    issues.push(...validateInlineTextStyles(content));
    if(content.chromeLayout!==undefined)issues.push(...validateContentCanvasLayout(content,"chrome",content.chromeLayout,"chromeLayout"));
    for(const [index,page] of content.pages.entries())if(page.canvasLayout!==undefined)issues.push(...validateContentCanvasLayout(content,page,page.canvasLayout,`pages[${index}].canvasLayout`));
  }
  try {
    // Avoid allocating a potentially enormous serialized string for an already
    // invalid input or a draft whose bounded fields exceed the total budget.
    if (textBytes > MAX_CONTENT_BYTES || (issues.length === 0 && new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CONTENT_BYTES)) issue("content", "This draft is too large. Use smaller photos (24 MB total maximum).");
  }
  catch { issue("content", "Content must be serializable JSON."); }
  return { valid: issues.length === 0, issues };
}
export function validateOwnerContent(value: unknown): ValidationResult { return validateContent(value); }
export function assertOwnerContent(value: unknown): asserts value is OwnerContent {
  const result = validateOwnerContent(value);
  if (!result.valid) throw new OwnerValidationError(result.issues);
}
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function assertOwnerWorkspace(value: unknown): asserts value is OwnerWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !["schemaVersion", "revision", "draft", "localPublished", "updatedAt"].includes(key))) throw new OwnerValidationError([{ path: "workspace", message: "Saved workspace is not valid." }]);
  const state = value as Partial<OwnerWorkspace>;
  if (state.schemaVersion !== OWNER_SCHEMA_VERSION || !Number.isSafeInteger(state.revision) || (state.revision ?? -1) < 0 || (state.updatedAt !== null && (typeof state.updatedAt !== "string" || !isIsoDate(state.updatedAt)))) throw new OwnerValidationError([{ path: "workspace", message: "Saved workspace version, revision or date is not valid." }]);
  assertOwnerContent(state.draft);
  if (state.localPublished !== null) {
    if (!state.localPublished || Object.getPrototypeOf(state.localPublished) !== Object.prototype || Object.keys(state.localPublished).some(key => !["content", "publishedAt"].includes(key)) || typeof state.localPublished.publishedAt !== "string" || !isIsoDate(state.localPublished.publishedAt)) throw new OwnerValidationError([{ path: "localPublished", message: "Saved preview snapshot is not valid." }]);
    assertOwnerContent(state.localPublished.content);
  }
}

export function assertOwnerDraftId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new OwnerValidationError([{ path: "draft.id", message: "Choose a valid saved draft identifier." }]);
}
export function normalizeOwnerDraftName(name: unknown): string {
  if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_DRAFT_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) throw new OwnerValidationError([{ path: "draft.name", message: `Name this draft using 1–${MAX_DRAFT_NAME_LENGTH} characters.` }]);
  return name.trim();
}
export function assertOwnerNamedDraft(value: unknown): asserts value is OwnerNamedDraft {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !["id", "name", "revision", "createdAt", "updatedAt", "content"].includes(key))) throw new OwnerValidationError([{ path: "draft", message: "This saved draft is not valid." }]);
  const draft = value as Partial<OwnerNamedDraft>;
  assertOwnerDraftId(draft.id);
  if (normalizeOwnerDraftName(draft.name) !== draft.name || !Number.isSafeInteger(draft.revision) || (draft.revision ?? 0) < 1 || typeof draft.createdAt !== "string" || !isIsoDate(draft.createdAt) || typeof draft.updatedAt !== "string" || !isIsoDate(draft.updatedAt)) throw new OwnerValidationError([{ path: "draft", message: "This saved draft’s name, revision or dates are not valid." }]);
  assertOwnerContent(draft.content);
}
export function namedDraftSummary(draft: OwnerNamedDraft): OwnerNamedDraftSummary {
  const { id, name, revision, createdAt, updatedAt } = draft;
  return { id, name, revision, createdAt, updatedAt };
}

function updatedPages(content: OwnerContent, pages: OwnerPage[]): OwnerContent {
  const next = { ...content, pages };
  assertOwnerContent(next);
  return next;
}
function requirePage(content: OwnerContent, id: string): OwnerPage {
  const page = content.pages.find(page => page.id === id);
  if (!page) throw new OwnerValidationError([{ path: "pages", message: "This page no longer exists. Reload the workspace." }]);
  return page;
}
export function createCustomPage(content: OwnerContent, options: { title: string; slug: string; navLabel?: string; showInNav?: boolean }): OwnerContent {
  const error = validatePageSlug(options.slug, content.pages);
  if (error) throw new OwnerValidationError([{ path: "slug", message: error }]);
  return updatedPages(content, [...content.pages, {
    id: newOwnerId("page"), kind: "custom", slug: options.slug, title: options.title,
    navLabel: options.navLabel ?? options.title, showInNav: options.showInNav ?? true,
    order: Math.max(-1, ...content.pages.map(page => page.order)) + 1, trashedAt: null, blocks: [],
  }]);
}
export function renamePage(content: OwnerContent, id: string, changes: { title?: string; slug?: string; navLabel?: string }): OwnerContent {
  const page = requirePage(content, id);
  if (changes.slug !== undefined && changes.slug !== page.slug) {
    if (page.builtinKey === "home") throw new OwnerValidationError([{ path: "slug", message: "The home page must use the root address /." }]);
    const error = validatePageSlug(changes.slug, content.pages, id);
    if (error) throw new OwnerValidationError([{ path: "slug", message: error }]);
  }
  return updatedPages(content, content.pages.map(page => page.id === id ? { ...page, ...changes } : page));
}
export function movePage(content: OwnerContent, id: string, direction: "up" | "down"): OwnerContent {
  const selected = requirePage(content, id);
  // The editor displays the trash separately; an active page moves relative to
  // other active pages, never an invisible adjacent trash entry.
  const sorted = content.pages.filter(page => Boolean(page.trashedAt) === Boolean(selected.trashedAt)).sort((a, b) => a.order - b.order);
  const index = sorted.findIndex(page => page.id === id);
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= sorted.length) return content;
  const neighbor = sorted[target];
  return updatedPages(content, content.pages.map(page => page.id === selected.id ? { ...page, order: neighbor.order } : page.id === neighbor.id ? { ...page, order: selected.order } : page).sort((a, b) => a.order - b.order));
}
export function trashPage(content: OwnerContent, id: string, now = new Date().toISOString()): OwnerContent {
  const page = requirePage(content, id);
  if (page.builtinKey === "home") throw new OwnerValidationError([{ path: "pages", message: "The home page cannot be moved to trash." }]);
  if (page.trashedAt) return content;
  return updatedPages(content, content.pages.map(page => page.id === id ? { ...page, trashedAt: now } : page));
}
export function restorePage(content: OwnerContent, id: string): OwnerContent {
  requirePage(content, id);
  return updatedPages(content, content.pages.map(page => page.id === id ? { ...page, trashedAt: null } : page));
}
export function getPageNavPlacement(page: OwnerPage): PageNavPlacement {
  return page.navPlacement ?? (page.showInNav ? "main" : "unlisted");
}
export function isPageAvailable(content: OwnerContent, page: OwnerPage): boolean {
  return !page.trashedAt && page.availability !== "hidden" && (page.builtinKey !== "premades" || content.site.showPremades);
}
/** More is a separate opt-in group, never silently promoted into the main bar. */
export function getVisibleNavigation(content: OwnerContent): OwnerPage[] {
  return content.pages.filter(page => isPageAvailable(content, page) && getPageNavPlacement(page) === "main").sort((a, b) => a.order - b.order);
}
export function getMoreNavigation(content: OwnerContent): OwnerPage[] {
  return content.site.moreEnabled ? content.pages.filter(page => isPageAvailable(content, page) && getPageNavPlacement(page) === "more").sort((a, b) => a.order - b.order) : [];
}
export function pageHref(page: OwnerPage): string { return page.slug ? `/${page.slug}` : "/"; }

export type PublicOwnerContent = Omit<OwnerContent, "pages" | "gallery" | "premades"> & {
  pages: Omit<OwnerPage, "trashedAt">[];
  gallery: Omit<GalleryItem, "visible">[];
  premades: Omit<OwnerPremade, "visible" | "isDraft">[];
};

/**
 * Allowlisted public projection, NOT a publishing action. Uploaded images
 * must use authorized object storage first and pass HTTPS asset
 * references here. Local data-URI photos are deliberately rejected. Keep the
 * document comfortably below Firestore's per-document limit; do not write the
 * 24 MB local workspace, draft history or trash into a public Firestore document.
 */
export function createPublicContentSnapshot(content: OwnerContent): PublicOwnerContent {
  assertOwnerContent(content);
  const publicImage = (src: string, path: string) => {
    if (src.startsWith("data:")) throw new OwnerValidationError([{ path, message: "Upload this photo to authorized image storage before publishing. Browser-local photos cannot be written to the public content document." }]);
    return src;
  };
  const publicAppearance = (appearance: ElementAppearance): ElementAppearance => {
    const keys = ["textColor", "backgroundColor", "font", "textSize", "align", "imageFit", "imagePositionX", "imagePositionY", "fontSize", "headingAlign", "bodyAlign", "widthPercent", "heightPercent", "imageWidthPercent", "imageHeightPx", "imageAspectLocked", "fontId", "box", "marginTopPx", "marginRightPx", "marginBottomPx", "marginLeftPx", "mobile"];
    return Object.fromEntries(keys.filter(key => Object.hasOwn(appearance,key)).map(key => [key, structuredClone(appearance[key as keyof ElementAppearance])]));
  };
  const blockLayout = (block: PageBlock) => ({ ...(block.appearance !== undefined ? {appearance:publicAppearance(block.appearance)} : {}), ...(block.parentId !== undefined ? {parentId:block.parentId} : {}), ...(block.mobileParentId !== undefined ? {mobileParentId:block.mobileParentId} : {}), ...(block.mobileOrder !== undefined ? {mobileOrder:block.mobileOrder} : {}) });
  const { site, home, prices } = content;
  const snapshot: PublicOwnerContent = {
    schemaVersion: 1,
    site: { ...(site.socialLinks !== undefined ? { socialLinks: site.socialLinks.map(link => ({ id: link.id, label: link.label, value: link.value, ...(link.url !== undefined ? { url: link.url } : {}) })) } : {}), name: site.name, commissionStatus: site.commissionStatus, statusNote: site.statusNote, showPremades: site.showPremades, telegram: site.telegram, discord: site.discord, email: site.email, tiktok: site.tiktok, twitch: site.twitch, ...(site.moreEnabled !== undefined ? { moreEnabled: site.moreEnabled } : {}), ...(site.catalogMode !== undefined ? { catalogMode: site.catalogMode } : {}), ...(site.additionalPartsQuantities !== undefined ? { additionalPartsQuantities: site.additionalPartsQuantities } : {}) },
    home: { eyebrow: home.eyebrow, title: home.title, description: home.description, image: { src: publicImage(home.image.src, "home.image.src"), alt: home.image.alt }, caption: home.caption },
    prices: {
      intro: prices.intro,
      groups: prices.groups.map(group => ({ id: group.id, title: group.title, note: group.note, items: group.items.map(item => ({ id: item.id, name: item.name, price: item.price, detail: item.detail })) })),
      parts: prices.parts.map(item => ({ id: item.id, name: item.name, price: item.price })),
      extras: prices.extras.map(item => ({ id: item.id, name: item.name, price: item.price })),
    },
    gallery: content.gallery.filter(item => item.visible).map(item => ({ id: item.id, name: item.name, src: publicImage(item.src, `gallery.${item.id}.src`), alt: item.alt, width: item.width, height: item.height, ...(item.displayNumber !== undefined ? { displayNumber: item.displayNumber } : {}) })),
    premades: content.premades.filter(item => item.visible && !item.isDraft && site.showPremades).map(item => ({ id: item.id, name: item.name, image: publicImage(item.image, `premades.${item.id}.image`), alt: item.alt, description: item.description, price: item.price, ...(item.photos !== undefined ? { photos: item.photos.map(photo => ({ id: photo.id, src: publicImage(photo.src, `premades.${item.id}.photos.${photo.id}.src`), alt: photo.alt })) } : {}), ...(item.coverPhotoId !== undefined ? { coverPhotoId: item.coverPhotoId } : {}), ...(item.imageFit !== undefined ? { imageFit: item.imageFit } : {}), ...(item.imagePositionX !== undefined ? { imagePositionX: item.imagePositionX } : {}), ...(item.imagePositionY !== undefined ? { imagePositionY: item.imagePositionY } : {}), ...(item.soldChannel !== undefined ? { soldChannel: item.soldChannel } : {}), ...(item.externalUrl !== undefined ? { externalUrl: item.externalUrl } : {}), ...(item.venue !== undefined ? { venue: item.venue } : {}), ...(item.badge !== undefined ? { badge: item.badge } : {}), ...(item.tags !== undefined ? { tags: [...item.tags] } : {}) })),
    pages: content.pages.filter(page => !page.trashedAt && page.availability !== "hidden").map(page => ({
      id: page.id, kind: page.kind, ...(page.builtinKey ? { builtinKey: page.builtinKey } : {}),
      slug: page.slug, title: page.title, navLabel: page.navLabel, showInNav: page.showInNav, order: page.order, ...(page.navPlacement !== undefined ? { navPlacement: page.navPlacement } : {}), ...(page.availability !== undefined ? { availability: page.availability } : {}), ...(page.titleAppearance !== undefined ? { titleAppearance: publicAppearance(page.titleAppearance) } : {}), ...(page.canvasLayout !== undefined ? {canvasLayout:structuredClone(page.canvasLayout)}:{}),
      blocks: page.blocks.map(block => {
        if(block.type==="commission-status")return {...blockLayout(block),id:block.id,type:block.type,label:block.label,note:block.note,actionLabel:block.actionLabel};
        if (block.type === "section") return {...blockLayout(block),id:block.id,type:block.type,heading:block.heading};
        if (block.type === "text") return { ...blockLayout(block), id: block.id, type: block.type, heading: block.heading, body: block.body };
        if (block.type === "image") return { ...blockLayout(block), id: block.id, type: block.type, src: publicImage(block.src, `pages.${page.id}.${block.id}.src`), alt: block.alt, caption: block.caption };
        if (block.type === "link") return { ...blockLayout(block), id: block.id, type: block.type, label: block.label, href: block.href, ...(block.buttonDesignId?{buttonDesignId:block.buttonDesignId}:{}),...(block.buttonAppearance?{buttonAppearance:copyButtonAppearance(block.buttonAppearance)}:{}) };
        if (block.type === "heading") return { ...blockLayout(block), id: block.id, type: block.type, text: block.text, level: block.level };
        if (block.type === "list") return { ...blockLayout(block), id: block.id, type: block.type, items: [...block.items], style: block.style };
        if (block.type === "divider") return { ...blockLayout(block), id: block.id, type: block.type };
        if (block.type === "canvas-space") return { ...blockLayout(block), id: block.id, type: block.type, widthPx: block.widthPx, heightPx: block.heightPx };
        if (block.type === "spacer") return { ...blockLayout(block), id: block.id, type: block.type, size: block.size };
        if (block.type === "faq") return { ...blockLayout(block), id: block.id, type: block.type, items: block.items.map(item => ({ id: item.id, question: item.question, answer: item.answer })) };
        return { ...blockLayout(block), id: block.id, type: block.type, heading: block.heading, body: block.body, src: publicImage(block.src, `pages.${page.id}.${block.id}.src`), alt: block.alt, imageSide: block.imageSide };
      }),
    })),
  };
  if(content.footerBlocks!==undefined)snapshot.footerBlocks=content.footerBlocks.map(block=>{
    const base={id:block.id,...(block.appearance!==undefined?{appearance:publicAppearance(block.appearance)}:{})};
    if(block.type==="text")return {...base,type:block.type,heading:block.heading,body:block.body};
    if(block.type==="heading")return {...base,type:block.type,text:block.text,level:block.level};
    return {...base,type:block.type,label:block.label,href:block.href,...(block.buttonDesignId?{buttonDesignId:block.buttonDesignId}:{}),...(block.buttonAppearance?{buttonAppearance:copyButtonAppearance(block.buttonAppearance)}:{})};
  });
  if(content.chromeLayout!==undefined)snapshot.chromeLayout=structuredClone(content.chromeLayout);
  if (content.commissionForm !== undefined && content.pages.some(page => page.builtinKey === "commissions" && isPageAvailable(content, page))) snapshot.commissionForm = projectCommissionFormConfig(content.commissionForm);
  if (content.fonts !== undefined) snapshot.fonts = content.fonts.map(font => ({ id: font.id, name: font.name, src: font.src, format: font.format }));
  if (content.design !== undefined) {
    snapshot.design = {};
    if (content.design.mobileDesign !== undefined) snapshot.design.mobileDesign = structuredClone(content.design.mobileDesign);
    for (const key of ["mobileLayoutEnabled", "bodyFontSize", "headingFontSize", "bodyFontId", "headingFontId"] as const) if (content.design[key] !== undefined) Object.assign(snapshot.design, { [key]: content.design[key] });
    if (content.design.colors !== undefined) snapshot.design.colors = Object.fromEntries(DESIGN_COLOR_FIELDS.filter(field => content.design?.colors?.[field.key] !== undefined).map(field => [field.key, content.design!.colors![field.key]]));
    for (const field of DESIGN_SELECT_FIELDS) if (content.design[field.key] !== undefined) Object.assign(snapshot.design, { [field.key]: content.design[field.key] });
  }
  if (content.contentOverrides !== undefined) {
    snapshot.contentOverrides = {};
    if(content.contentOverrides.elementLinks!==undefined)snapshot.contentOverrides.elementLinks=Object.fromEntries(Object.entries(content.contentOverrides.elementLinks).filter(([key])=>elementLinkKeyIsPublic(snapshot,key)));
    if(content.contentOverrides.inlineStyles!==undefined)snapshot.contentOverrides.inlineStyles=structuredClone(content.contentOverrides.inlineStyles);
    const isActive = (group: string) => group === "site" || content.pages.some(page => page.builtinKey === group && !page.trashedAt && page.availability !== "hidden");
    if (content.contentOverrides.styles !== undefined) snapshot.contentOverrides.styles = Object.fromEntries(Object.entries(content.contentOverrides.styles).filter(([key]) => STYLE_FIELDS.some(field => field.key === key && isActive(field.group)) || canvasStyleKeyIsPublic(key,snapshot)).map(([key,value]) => [key,publicAppearance(value)]));
    if (content.contentOverrides.text !== undefined) snapshot.contentOverrides.text = Object.fromEntries(TEXT_FIELDS.filter(field => isActive(field.group) && Object.hasOwn(content.contentOverrides!.text!, field.key)).map(field => [field.key, content.contentOverrides!.text![field.key]]));
    if (content.contentOverrides.images !== undefined) snapshot.contentOverrides.images = Object.fromEntries(IMAGE_FIELDS.filter(field => isActive(field.group) && Object.hasOwn(content.contentOverrides!.images!, field.key)).map(field => { const value = content.contentOverrides!.images![field.key]; return [field.key, { src: publicImage(value.src, `contentOverrides.images.${field.key}.src`), alt: value.alt }]; }));
    if (content.contentOverrides.links !== undefined) snapshot.contentOverrides.links = Object.fromEntries(LINK_FIELDS.filter(field => isActive(field.group) && Object.hasOwn(content.contentOverrides!.links!, field.key)).map(field => { const value = content.contentOverrides!.links![field.key]; return [field.key, { label: value.label, href: value.href, ...(value.buttonDesignId?{buttonDesignId:value.buttonDesignId}:{}),...(value.buttonAppearance?{buttonAppearance:copyButtonAppearance(value.buttonAppearance)}:{}) }]; }));
  }
  projectInlineTextStyles(snapshot);
  if(content.gallerySettings!==undefined)snapshot.gallerySettings={showNumbers:content.gallerySettings.showNumbers};
  if(content.buttonDesigns!==undefined){const used=new Set([...Object.values(snapshot.contentOverrides?.links??{}).map(link=>link.buttonDesignId),...[...snapshot.pages.flatMap(page=>page.blocks),...(snapshot.footerBlocks??[])].flatMap(block=>block.type==="link"?[block.buttonDesignId]:[])]);snapshot.buttonDesigns=content.buttonDesigns.filter(design=>used.has(design.id)).map(design=>({id:design.id,name:design.name,preset:design.preset,...(design.imported?{imported:{...design.imported}}:{}),...(design.hover?{hover:{...design.hover}}:{}),...(design.focus?{focus:{...design.focus}}:{}),...(design.artwork?{artwork:{src:publicImage(design.artwork.src,`buttonDesigns.${design.id}.artwork.src`)}}:{})}));}
  projectCanvasLayouts(snapshot);
  if (snapshot.fonts !== undefined) {
    const used = new Set([...Object.values(snapshot.contentOverrides?.inlineStyles??{}).flatMap(record=>[...record.spans,...(record.mobile??[])].map(span=>span.style.fontId)), ...(snapshot.footerBlocks??[]).flatMap(block=>[block.appearance?.fontId,block.appearance?.mobile?.fontId]), snapshot.design?.bodyFontId, snapshot.design?.headingFontId, snapshot.design?.mobileDesign?.bodyFontId, snapshot.design?.mobileDesign?.headingFontId, ...Object.values(snapshot.contentOverrides?.styles ?? {}).flatMap(style => [style.fontId,style.mobile?.fontId]), ...snapshot.pages.flatMap(page => [page.titleAppearance?.fontId,page.titleAppearance?.mobile?.fontId, ...page.blocks.flatMap(block => [block.appearance?.fontId,block.appearance?.mobile?.fontId])])].filter(Boolean));
    snapshot.fonts = snapshot.fonts.filter(font => used.has(font.id));
  }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 700_000) throw new OwnerValidationError([{ path: "content", message: "This public text document is too large. Reduce the text or number of blocks before publishing." }]);
  return snapshot;
}

export type PublishedOwnerSnapshot = {
  schemaVersion: typeof OWNER_SCHEMA_VERSION;
  /** Same revision as the private workspace committed by the Publish action. */
  revision: number;
  publishedAt: string;
  content: PublicOwnerContent;
};

function plainPublicObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new OwnerValidationError([{ path, message: "Published content must contain only plain content objects." }]);
  return value as Record<string, unknown>;
}
function expandPublicContent(value: Record<string, unknown>): unknown {
  const expand = (items: unknown, path: string, privateKey: string, defaultValue: null | true) => Array.isArray(items) ? Array.from(items, (item, index) => {
    const entry = plainPublicObject(item, `${path}[${index}]`);
    if (path === "premades" && Object.hasOwn(entry, "isDraft")) throw new OwnerValidationError([{ path: `${path}[${index}].isDraft`, message: "Private listing draft state must not be present in a published snapshot." }]);
    if (Object.hasOwn(entry, privateKey)) throw new OwnerValidationError([{ path: `${path}[${index}].${privateKey}`, message: "Private visibility and trash fields must not be present in a published snapshot." }]);
    return { ...entry, [privateKey]: defaultValue };
  }) : items;
  return { ...value, pages: expand(value.pages, "pages", "trashedAt", null), gallery: expand(value.gallery, "gallery", "visible", true), premades: expand(value.premades, "premades", "visible", true) };
}

/** Strict read boundary for public JSON; deleted built-ins are intentionally absent. */
export function assertPublicOwnerContent(value: unknown): asserts value is PublicOwnerContent {
  const source = plainPublicObject(value, "content");
  const expanded = expandPublicContent(source);
  const result = validateContent(expanded, true);
  if (!result.valid) throw new OwnerValidationError(result.issues);
  const content = expanded as OwnerContent;
  // Turning the published shop off retains its already-public inventory so a
  // flag-only Update Live can turn it back on without publishing draft edits.
  const imageSources = [...buttonAppearanceSources(content),...(content.buttonDesigns??[]).flatMap(design=>design.artwork?[design.artwork.src]:[]),...Object.values(content.contentOverrides?.images ?? {}).map(image => image.src), content.home.image.src, ...content.gallery.map(item => item.src), ...content.premades.flatMap(item => [item.image, ...(item.photos?.map(photo => photo.src) ?? [])]), ...content.pages.flatMap(page => page.blocks.flatMap(block => block.type === "image" || block.type === "feature" ? [block.src] : []))];
  if (imageSources.some(src => src.startsWith("data:"))) throw new OwnerValidationError([{ path: "content", message: "Published photos must use local site assets or secure HTTPS image storage, never browser data images." }]);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 700_000) throw new OwnerValidationError([{ path: "content", message: "The published content exceeds the 700 KB limit." }]);
}

/** Restore renderer-only flags, never missing pages, hidden listings or defaults. */
export function publicContentToOwnerContent(content: PublicOwnerContent): OwnerContent {
  assertPublicOwnerContent(content);
  return expandPublicContent(structuredClone(content) as unknown as Record<string, unknown>) as OwnerContent;
}

export function assertPublishedOwnerSnapshot(value: unknown): asserts value is PublishedOwnerSnapshot {
  const snapshot = plainPublicObject(value, "publication");
  if (Object.keys(snapshot).length !== 4 || Object.keys(snapshot).some(key => !["schemaVersion", "revision", "publishedAt", "content"].includes(key)) || snapshot.schemaVersion !== OWNER_SCHEMA_VERSION || !Number.isSafeInteger(snapshot.revision) || typeof snapshot.revision !== "number" || snapshot.revision < 1 || typeof snapshot.publishedAt !== "string" || !isIsoDate(snapshot.publishedAt)) throw new OwnerValidationError([{ path: "publication", message: "Published version, revision, timestamp or fields are not valid." }]);
  assertPublicOwnerContent(snapshot.content);
}

export function createPublishedOwnerSnapshot(content: OwnerContent, revision: number, publishedAt = new Date().toISOString()): PublishedOwnerSnapshot {
  const snapshot: PublishedOwnerSnapshot = { schemaVersion: OWNER_SCHEMA_VERSION, revision, publishedAt, content: createPublicContentSnapshot(content) };
  assertPublishedOwnerSnapshot(snapshot);
  return snapshot;
}

/** Replace one listing only; unrelated private edits never enter this public snapshot. */
export function createPublishedPremadeSnapshot(published: PublishedOwnerSnapshot, item: OwnerPremade, revision: number, publishedAt = new Date().toISOString()): PublishedOwnerSnapshot {
  assertPublishedOwnerSnapshot(published);
  if (item.isDraft) throw new OwnerValidationError([{ path: "premade.isDraft", message: "Choose Publish to store explicitly before publishing a saved listing draft." }]);
  if (item.visible !== true) throw new OwnerValidationError([{ path: "premade.visible", message: "Make this premade visible before publishing it to the store." }]);
  const selected: Omit<OwnerPremade, "visible" | "isDraft"> = {
    id: item.id, name: item.name, image: item.image, alt: item.alt, description: item.description, price: item.price,
    ...(item.photos !== undefined ? { photos: item.photos.map(photo => ({ id: photo.id, src: photo.src, alt: photo.alt })) } : {}),
    ...(item.coverPhotoId !== undefined ? { coverPhotoId: item.coverPhotoId } : {}),
    ...(item.imageFit !== undefined ? { imageFit: item.imageFit } : {}),
    ...(item.imagePositionX !== undefined ? { imagePositionX: item.imagePositionX } : {}),
    ...(item.imagePositionY !== undefined ? { imagePositionY: item.imagePositionY } : {}),
    ...(item.soldChannel !== undefined ? { soldChannel: item.soldChannel } : {}),
    ...(item.externalUrl !== undefined ? { externalUrl: item.externalUrl } : {}),
    ...(item.venue !== undefined ? { venue: item.venue } : {}),
    ...(item.badge !== undefined ? { badge: item.badge } : {}), ...(item.tags !== undefined ? { tags: [...item.tags] } : {}),
  };
  const premades = published.content.premades.some(entry => entry.id === item.id)
    ? published.content.premades.map(entry => entry.id === item.id ? selected : entry)
    : [...published.content.premades, selected];
  const next: PublishedOwnerSnapshot = { ...published, revision, publishedAt, content: { ...published.content, premades } };
  assertPublishedOwnerSnapshot(next);
  return structuredClone(next);
}
