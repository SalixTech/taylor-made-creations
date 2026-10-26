import { site, priceGroups, parts, extras } from "../content/site";
import { fursuitGallery } from "../content/fursuit-gallery";
import terms from "../data/terms-of-service.json";
import care from "../data/care-instructions.json";
import type { OwnerContent, OwnerPage, OwnerWorkspace, PageBlock } from "./model";

const pageDefinitions: Array<[NonNullable<OwnerPage["builtinKey"]>, string, string, boolean]> = [
  ["home", "Home", "Home", true],
  ["prices", "Fursuit prices", "Prices", true],
  ["gallery", "Fursuit Gallery", "Fursuit Gallery", true],
  ["commissions", "Something made for you.", "Commissions", true],
  ["premades", "Premades", "Premades", true],
  ["suitcare", "Fursuit care", "Suit Care", true],
  ["contact", "Let’s talk fursuits.", "Contact", true],
  ["terms", "Terms of service", "Terms of service", false],
  ["examples", "Fursuit examples", "Examples", false],
  ["client-hub", "Client hub", "Client hub", false],
];
const termsBlocks: PageBlock[] = [
  ...terms.sections.map(section => ({ id: `terms-${section.id}`, type: "text" as const, heading: section.heading, body: section.items.join("\n\n") })),
  { id: "terms-agreement", type: "text", heading: "", body: terms.agreement },
];
const careBlocks: PageBlock[] = [
  { id: "care-download", type: "link", label: "Download care instructions (PDF)", href: "/downloads/taylor-made-creations-care.pdf" },
  { id: "care-recommended-intro", type: "text", heading: "Recommended Items", body: "All items here are items that I not only recommend but also use personally to take care of my own fursuits." },
  ...care.recommendedItems.map((item, index) => ({ id: `care-recommended-${index + 1}`, type: "link" as const, label: item.name, href: item.href })),
  ...care.sections.map((section, index) => ({ id: `care-${index + 1}`, type: "text" as const, heading: section.heading, body: section.paragraphs.join("\n\n") })),
];

/** Creates a fresh copy each time: changing a draft cannot mutate the baseline. */
export function createDefaultOwnerContent(): OwnerContent {
  return {
    schemaVersion: 1,
    site: {
      name: site.name, commissionStatus: site.commissionStatus, statusNote: site.statusNote,
      showPremades: site.showPremades, additionalPartsQuantities: false, telegram: site.telegram, discord: site.discord,
      email: "taylormadecreations.dog@gmail.com", tiktok: "gd_taylor", twitch: "gd_taylor",
    },
    home: {
      eyebrow: "TAYLOR MADE CREATIONS · FURSUITS",
      title: "Welcome to your new Fursuit",
      description: "Your character. Your colors. Something entirely you.",
      image: { src: "/images/home-collage.webp", alt: "Collage of Taylor Made Creations fursuit work" },
      caption: "A little character goes a long way.",
    },
    prices: {
      intro: "Start with the shape of your character. These are starting prices in USD for simple one- or two-color designs; complexity can change your quote.",
      groups: priceGroups.map((group, i) => ({ ...group, id: `price-group-${i + 1}`, items: group.items.map((item, j) => ({ ...item, id: `price-${i + 1}-${j + 1}` })) })),
      parts: parts.map(([name, price], i) => ({ id: `part-${i + 1}`, name, price })),
      extras: extras.map(([name, price], i) => ({ id: `extra-${i + 1}`, name, price })),
    },
    gallery: fursuitGallery.map(({ name, src, alt, width, height }, i) => ({ id: `gallery-${i + 1}`, name, src, alt, width, height, visible: true })),
    premades: [],
    pages: pageDefinitions.map(([key, title, navLabel, showInNav], order) => ({
      id: `builtin-${key}`, kind: "builtin", builtinKey: key, slug: key === "home" ? "" : key,
      title, navLabel, showInNav, order, trashedAt: null,
      blocks: structuredClone(key === "terms" ? termsBlocks : key === "suitcare" ? careBlocks : key === "client-hub" ? [
        { id: "client-hub-status", type: "text", heading: "Not connected yet.", body: "No login, account, project records or payment tools exist in this preview. There is nothing to sign up for." },
        { id: "client-hub-contact", type: "link", label: "Contact Taylor instead →", href: "/contact" },
      ] : []),
    })),
  };
}

export function createInitialOwnerWorkspace(): OwnerWorkspace {
  return { schemaVersion: 1, revision: 0, draft: createDefaultOwnerContent(), localPublished: null, updatedAt: null };
}
