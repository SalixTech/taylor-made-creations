import type { CSSProperties } from "react";
import { customFontFamily, type ElementAppearance } from "./appearance";
export { getElementAppearanceStyle, getElementAppearanceAttributes, getImageAppearanceStyle } from "./appearance";
export type { ElementAppearance } from "./appearance";
import type { BuiltinPageKey, OwnerContent } from "./model";

/** Catalog IDs are the entire editable template surface. No arbitrary DOM/CSS paths. */
export type TemplateGroup = "site" | BuiltinPageKey;
export type TemplateImage = { src: string; alt: string };
export type TemplateLink = { label: string; href: string };
export type ContentOverrides = { text?: Record<string, string>; images?: Record<string, TemplateImage>; links?: Record<string, TemplateLink>; styles?: Record<string, ElementAppearance> };
export const DESIGN_COLOR_FIELDS = [
  { key: "background", label: "Page background", defaultValue: "#ffffff" },
  { key: "text", label: "Main text", defaultValue: "#302c2c" },
  { key: "muted", label: "Supporting text", defaultValue: "#706a67" },
  { key: "accent", label: "Accent and buttons", defaultValue: "#800014" },
  { key: "headerBackground", label: "Header background", defaultValue: "#800014" },
  { key: "headerText", label: "Header text", defaultValue: "#ffffff" },
  { key: "footerBackground", label: "Footer background", defaultValue: "#f8f7f5" },
  { key: "footerText", label: "Footer text", defaultValue: "#706a67" },
  { key: "buttonText", label: "Button text", defaultValue: "#ffffff" },
  { key: "border", label: "Borders and dividers", defaultValue: "#e3dfdb" },
  { key: "surface", label: "Cards and panels", defaultValue: "#ffffff" },
] as const;
const fonts = [{ value: "original", label: "Original site" }, { value: "sans", label: "Clean sans-serif" }, { value: "serif", label: "Classic serif" }, { value: "rounded", label: "Friendly rounded" }, { value: "mono", label: "Monospace" }] as const;
const sizes = [{ value: "small", label: "Small" }, { value: "standard", label: "Standard" }, { value: "large", label: "Large" }] as const;
export const DESIGN_SELECT_FIELDS = [
  { key: "bodyFont", label: "Body font", defaultValue: "original", options: fonts },
  { key: "headingFont", label: "Heading font", defaultValue: "original", options: fonts },
  { key: "textSize", label: "Text size", defaultValue: "standard", options: sizes },
  { key: "headingSize", label: "Heading size", defaultValue: "standard", options: sizes },
  { key: "buttonRadius", label: "Button corners", defaultValue: "soft", options: [{ value: "square", label: "Square" }, { value: "soft", label: "Soft" }, { value: "round", label: "Rounded" }, { value: "pill", label: "Pill" }] },
  { key: "contentWidth", label: "Content width", defaultValue: "standard", options: [{ value: "compact", label: "Compact" }, { value: "standard", label: "Standard" }, { value: "wide", label: "Wide" }] },
  { key: "spacing", label: "Section spacing", defaultValue: "standard", options: [{ value: "compact", label: "Compact" }, { value: "standard", label: "Standard" }, { value: "relaxed", label: "Relaxed" }] },
  { key: "homeIntro", label: "Home introduction", defaultValue: "title-only", options: [{ value: "title-only", label: "Title only (original)" }, { value: "full", label: "Show description and buttons" }] },
  { key: "headerTagline", label: "Header tagline", defaultValue: "hidden", options: [{ value: "hidden", label: "Hidden (original)" }, { value: "visible", label: "Visible" }] },
] as const;
export type DesignColorKey = typeof DESIGN_COLOR_FIELDS[number]["key"];
export type DesignSelectKey = typeof DESIGN_SELECT_FIELDS[number]["key"];
type DesignSelections = { [F in typeof DESIGN_SELECT_FIELDS[number] as F["key"]]?: F["options"][number]["value"] };
export type SiteDesign = DesignSelections & { bodyFontSize?: number; headingFontSize?: number; bodyFontId?: string; headingFontId?: string; colors?: Partial<Record<DesignColorKey, string>> };
export type TemplateTextField = { key: string; label: string; group: TemplateGroup; defaultValue: string };
export type TemplateImageField = { key: string; label: string; group: TemplateGroup; defaultValue: TemplateImage };
export type TemplateLinkField = { key: string; label: string; group: TemplateGroup; defaultValue: TemplateLink };
const texts = (group: TemplateGroup, fields: [string, string, string][]): TemplateTextField[] => fields.map(([key, label, defaultValue]) => ({ key: `${group}.${key}`, label, group, defaultValue }));
export const TEXT_FIELDS: readonly TemplateTextField[] = [
  ...texts("site", [["headerTagline", "Header tagline", "CHARACTERS MADE PERSONAL"], ["footerTagline", "Footer tagline", "Made for your character."], ["emptyTitle", "Empty page heading", "This page is ready for your story."], ["emptyBody", "Empty page description", "There is no content to show here yet."]]),
  ...texts("home", [["stripEyebrow", "Commission section eyebrow", "DREAMING UP YOUR SUIT?"], ["stripTitle", "Commission section heading", "Let’s start with the possibilities."], ["stripBody", "Commission section description", "Explore suit types, starting prices and the details to prepare."], ["pricesEyebrow", "Prices card eyebrow", "01 / THE POSSIBILITIES"], ["pricesBody", "Prices card description", "Heads, partials, fullsuits & the little extras."], ["careEyebrow", "Care card eyebrow", "02 / AFTER THE ADVENTURE"], ["careBody", "Care card description", "A home for keeping your character looking its best."]]),
  ...texts("prices", [["eyebrow", "Page eyebrow", "FIND YOUR FIT"], ["exampleLabel", "Category examples label ({category} inserts its name)", "See {category} examples →"], ["startingAt", "Starting price label", "starting at"], ["partsTitle", "Parts heading", "Fursuit parts"], ["extrasTitle", "Extras heading", "Extras"], ["endTitle", "Closing heading", "A character is more than a price list."], ["endBody", "Closing description", "Have a character in mind? Find out how to get started, then bring your ideas to Taylor."]]),
  ...texts("gallery", [["eyebrow", "Page eyebrow", "A FEW FAMILIAR FACES"], ["intro", "Introduction ({siteName} inserts your site name)", "Character work from {siteName}, newest first. Select a photo for a closer look."], ["emptyTitle", "Empty gallery heading", "No gallery photos to show yet."], ["emptyBody", "Empty gallery description", "Check back for more characters soon."], ["endTitle", "Closing heading", "What does your character look like?"]]),
  ...texts("commissions", [["eyebrow", "Page eyebrow", "FROM CHARACTER TO FURSUIT"], ["intro", "Introduction", "Bring your character to life. Explore suit types and prepare the details for your commission."], ["statusLabel", "Status panel label", "COMMISSION STATUS"], ["requestButton", "Open commission button label", "Commission Me →"], ["stepsTitle", "Preparation heading", "Before you reach out"], ["stepOneTitle", "First step heading", "Provide your ref-sheet"], ["stepOneBody", "First step description", "A clear front and back view helps explain your character’s markings and colors."], ["stepTwoTitle", "Second step heading", "Choose your suit type"], ["stepTwoBody", "Second step description", "Browse the available heads, partials and fullsuits to find a starting point."], ["stepThreeTitle", "Third step heading", "Read the terms"], ["stepThreeBody", "Third step description", "Review and agree to the terms of service before discussing a commission."], ["formEyebrow", "Request card eyebrow", "COMMISSION FORM"], ["formTitle", "Request card heading", "Tell us about your character"], ["formBody", "Request card description", "Choose your suit type, share your character’s details and review your request."], ["formButton", "Request button label", "Plan your commission →"]]),
  ...texts("premades", [["eyebrow", "Page eyebrow", "A CHARACTER OF THEIR OWN"], ["intro", "Introduction", "Ready-made characters, each with a personality of their own."], ["emptyTitle", "Empty shop heading", "No premades listed right now."], ["emptyBody", "Empty shop description", "Explore the gallery for more characters and inspiration."]]),
  ...texts("contact", [["eyebrow", "Page eyebrow", "SAY AWOOO"], ["intro", "Introduction", "Questions about a character or commission? Get in touch with Taylor."], ["detailsTitle", "Contact details heading", "Find Taylor"], ["detailsBody", "Telegram introduction", "Telegram is the best place to reach Taylor for a quick response."], ["telegramLabel", "Telegram label", "Telegram"], ["discordLabel", "Discord label", "Discord"], ["tiktokLabel", "TikTok label", "TikTok"], ["twitchLabel", "Twitch label", "Twitch"], ["emailLabel", "Email label", "Email"], ["formTitle", "Message card heading", "Send a message"], ["nameLabel", "Name label", "Name"], ["namePlaceholder", "Name placeholder", "Your name"], ["emailFieldLabel", "Email field label", "Email"], ["emailPlaceholder", "Email placeholder", "Your email"], ["messageLabel", "Message label", "Message"], ["messagePlaceholder", "Message placeholder", "What would you like to ask?"]]),
  ...texts("examples", [["eyebrow", "Page eyebrow", "PICTURE THE POSSIBILITIES"], ["intro", "Introduction", "Category examples from Taylor’s existing website. Your character’s design and included pieces are confirmed in your individual quote."], ["headsTitle", "Heads section heading", "Heads"], ["partialsTitle", "Partials section heading", "Partials"], ["fullsuitsTitle", "Fullsuits section heading", "Fullsuits"]]),
  ...texts("terms", [["eyebrow", "Page eyebrow", "THE IMPORTANT DETAILS"]]),
  ...texts("suitcare", [["eyebrow", "Page eyebrow", "{siteNameUpper}"]]),
  ...texts("client-hub", [["eyebrow", "Page eyebrow", "FOR A LATER CHAPTER"]]),
];
export const IMAGE_FIELDS: readonly TemplateImageField[] = [
  { key: "site.logo", label: "Site logo (header and footer)", group: "site", defaultValue: { src: "/images/logo.png", alt: "" } },
  ...["heads", "partials", "fullsuits"].map(category => ({ key: `examples.${category}`, label: `${category[0].toUpperCase()}${category.slice(1)} example image`, group: "examples" as const, defaultValue: { src: `/images/${category}.webp`, alt: `${category[0].toUpperCase()}${category.slice(1)} examples from {siteName}` } })),
];
const links = (group: TemplateGroup, fields: [string, string, string, string][]): TemplateLinkField[] => fields.map(([key, label, text, href]) => ({ key: `${group}.${key}`, label, group, defaultValue: { label: text, href } }));
export const LINK_FIELDS: readonly TemplateLinkField[] = [
  ...links("site", [["footerTerms", "Footer terms link", "Terms of service", "/terms"], ["footerContact", "Footer contact link", "Contact", "/contact"]]),
  ...links("home", [["galleryButton", "Gallery button", "Explore the gallery ↗", "/gallery"], ["pricesButton", "Prices button", "Fursuit prices →", "/prices"], ["commissionsButton", "Commission section button", "About commissions →", "/commissions"], ["pricesCard", "Prices card", "Fursuit prices ↗", "/prices"], ["careCard", "Care card", "Care for your suit ↗", "/suitcare"]]),
  ...links("prices", [["commissionsButton", "Closing button", "Commission information →", "/commissions"]]),
  ...links("gallery", [["commissionsButton", "Closing link", "Explore commissions →", "/commissions"]]),
  ...links("commissions", [["pricesLink", "Preparation prices link", "See fursuit prices →", "/prices"], ["termsLink", "Preparation terms link", "Read the terms →", "/terms"]]),
  ...links("premades", [["galleryLink", "Empty shop gallery link", "Meet the gallery characters →", "/gallery"]]),
  ...links("examples", [["pricesLink", "Back to prices link", "Back to starting prices →", "/prices"], ["galleryButton", "Gallery button", "Explore the Fursuit Gallery →", "/gallery"]]),
];
/** Only these semantic content targets accept per-element appearance; never selectors or paths. */
export const STYLE_FIELDS: readonly { key: string; label: string; group: TemplateGroup; kind: "text" | "image" | "link" | "section" }[] = [
  ...TEXT_FIELDS.map(field => ({ key: field.key, label: field.label, group: field.group, kind: "text" as const })),
  ...IMAGE_FIELDS.map(field => ({ key: field.key, label: field.label, group: field.group, kind: "image" as const })),
  ...LINK_FIELDS.map(field => ({ key: field.key, label: field.label, group: field.group, kind: "link" as const })),
  ...["eyebrow", "title", "description", "caption"].map(key => ({ key: `home.${key}`, label: `Home ${key}`, group: "home" as const, kind: "text" as const })),
  { key: "home.image", label: "Main home image", group: "home", kind: "image" },
  { key: "site.brand", label: "Brand name", group: "site", kind: "text" },
  { key: "prices.intro", label: "Prices introduction", group: "prices", kind: "text" },
  ...(["prices", "gallery", "commissions", "premades", "suitcare", "contact", "terms", "examples", "client-hub"] as const).map(group => ({ key: `${group}.title`, label: "Page title", group, kind: "text" as const })),
];
function interpolate(value: string, content?: OwnerContent | null, variables: Record<string, string> = {}): string {
  const tokens = { siteName: content?.site.name ?? "Taylor Made Creations", siteNameUpper: (content?.site.name ?? "Taylor Made Creations").toUpperCase(), ...variables };
  return value.replace(/\{([A-Za-z]+)\}/g, (match, key: string) => tokens[key as keyof typeof tokens] ?? match);
}
export function getTemplateText(content: OwnerContent | null | undefined, key: string, variables?: Record<string, string>): string {
  const field = TEXT_FIELDS.find(field => field.key === key);
  return field ? interpolate(content?.contentOverrides?.text?.[key] ?? field.defaultValue, content, variables) : "";
}
export function getTemplateImage(content: OwnerContent | null | undefined, key: string): TemplateImage {
  const field = IMAGE_FIELDS.find(field => field.key === key);
  const image = content?.contentOverrides?.images?.[key] ?? field?.defaultValue ?? { src: "/images/logo.png", alt: "" };
  return { src: image.src, alt: interpolate(image.alt, content) };
}
export function getTemplateLink(content: OwnerContent | null | undefined, key: string): TemplateLink {
  const field = LINK_FIELDS.find(field => field.key === key);
  const link = { ...(content?.contentOverrides?.links?.[key] ?? field?.defaultValue ?? { label: "", href: "" }) };
  // Built-in template destinations follow the current page identity, not a stale slug.
  if (content && !content.contentOverrides?.links?.[key]) {
    const builtin = link.href.slice(1);
    const page = content.pages.find(page => page.builtinKey === builtin && !page.trashedAt && page.availability !== "hidden" && (page.builtinKey !== "premades" || content.site.showPremades));
    if (page) link.href = page.slug ? `/${page.slug}` : "/";
  }
  return link;
}
const fontValues = { original: "'MS Reference Sans Serif',Arial,Helvetica,sans-serif", sans: "Arial,Helvetica,sans-serif", serif: "Georgia,'Times New Roman',serif", rounded: "'Trebuchet MS',Arial,sans-serif", mono: "'Courier New',monospace" };
/** Defense in depth: only allowlisted tokens and six-digit colors ever become CSS. */
export function getSiteThemeStyle(content: Pick<OwnerContent, "design"> | null | undefined): CSSProperties {
  const design = content?.design;
  if (!design) return {};
  const style: Record<string, string | number> = {};
  for (const field of DESIGN_COLOR_FIELDS) {
    const value = design.colors?.[field.key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) style[`--site-${field.key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`] = value;
  }
  const tokens: Record<string, Record<string, string | number>> = {
    bodyFont: fontValues, headingFont: fontValues,
    headingSize: { small: 0.85, standard: 1, large: 1.2 },
    buttonRadius: { square: "0px", soft: "2px", round: "12px", pill: "999px" },
    contentWidth: { compact: "940px", standard: "1140px", wide: "1380px" }, spacing: { compact: 0.75, standard: 1, relaxed: 1.3 },
  };
  const names: Record<string, string> = { bodyFont: "body-font", headingFont: "heading-font", headingSize: "heading-scale", buttonRadius: "button-radius", contentWidth: "content-width", spacing: "spacing" };
  for (const [key, values] of Object.entries(tokens)) {
    const value = design[key as DesignSelectKey];
    if (typeof value === "string" && Object.hasOwn(values, value)) style[`--site-${names[key]}`] = values[value];
  }
  if (design.textSize && Object.hasOwn({ small: 0.9, standard: 1, large: 1.1 }, design.textSize)) style["--site-text-scale"] = { small: 0.9, standard: 1, large: 1.1 }[design.textSize];
  for (const [key, css] of [["bodyFontSize", "--site-body-font-size"], ["headingFontSize", "--site-heading-font-size"]] as const) {
    const value = design[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 8 && value <= 144) style[css] = `${value}px`;
  }
  const bodyFont = customFontFamily(design.bodyFontId), headingFont = customFontFamily(design.headingFontId);
  if (bodyFont) style["--site-body-font"] = `'${bodyFont}',Arial,Helvetica,sans-serif`;
  if (headingFont) style["--site-heading-font"] = `'${headingFont}',Arial,Helvetica,sans-serif`;
  return style as CSSProperties;
}
export function getSiteThemeAttributes(content: Pick<OwnerContent, "design"> | null | undefined) {
  const design = content?.design;
  return { "data-site-theme": design ? "true" : undefined, "data-site-body-font-size": typeof design?.bodyFontSize === "number" && design.bodyFontSize >= 8 && design.bodyFontSize <= 144 ? "true" : undefined, "data-site-heading-font-size": typeof design?.headingFontSize === "number" && design.headingFontSize >= 8 && design.headingFontSize <= 144 ? "true" : undefined, "data-site-body-font": (design?.bodyFont || customFontFamily(design?.bodyFontId)) ? "true" : undefined, "data-site-heading-font": (design?.headingFont || customFontFamily(design?.headingFontId)) ? "true" : undefined, "data-site-text-size": design?.textSize && design.bodyFontSize === undefined ? "true" : undefined, "data-site-heading-size": design?.headingSize && design.headingFontSize === undefined ? "true" : undefined, "data-site-button-radius": design?.buttonRadius ? "true" : undefined, "data-site-content-width": design?.contentWidth ? "true" : undefined, "data-site-spacing": design?.spacing ? "true" : undefined, "data-site-home-intro": design?.homeIntro, "data-site-header-tagline": design?.headerTagline };
}
