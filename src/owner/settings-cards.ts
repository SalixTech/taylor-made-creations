import { type OwnerContent } from "./model";

export type SettingsCardId = "business" | "availability" | "commission-form" | "contacts" | "gallery-display";
export const SETTINGS_CARD_LABELS: Record<SettingsCardId, string> = { business: "Your business", availability: "Commission availability", "commission-form": "Commission form", contacts: "Where people can find you", "gallery-display": "Gallery display" };
/** Copy just one card into a saved/live base. Unrelated unsaved values never leak. */
export function applySettingsCard(base: OwnerContent, edited: OwnerContent, card: SettingsCardId): OwnerContent {
  const next = structuredClone(base);
  switch (card) {
    case "gallery-display":
      if (edited.gallerySettings === undefined) delete next.gallerySettings;
      else {
        if (typeof edited.gallerySettings.showNumbers !== "boolean") throw new Error("Choose whether gallery numbers are visible.");
        next.gallerySettings = { showNumbers: edited.gallerySettings.showNumbers };
      }
      break;
    case "business": next.site.name = edited.site.name; break;
    case "availability": next.site.commissionStatus = edited.site.commissionStatus; next.site.statusNote = edited.site.statusNote; break;
    case "commission-form":
      if (edited.site.additionalPartsQuantities === undefined) delete next.site.additionalPartsQuantities;
      else next.site.additionalPartsQuantities = edited.site.additionalPartsQuantities;
      if (edited.commissionForm === undefined) delete next.commissionForm;
      else next.commissionForm = structuredClone(edited.commissionForm);
      break;
    case "contacts":
      for (const key of ["telegram", "discord", "email", "tiktok", "twitch"] as const) next.site[key] = edited.site[key];
      if (edited.site.socialLinks === undefined) delete next.site.socialLinks;
      else next.site.socialLinks = structuredClone(edited.site.socialLinks);
      break;
    default: throw new Error("Choose a supported settings card.");
  }
  return next;
}
