import type { OwnerContent, OwnerSocialLink } from "./model";
import { getTemplateText } from "./site-design";

/** Legacy contacts stay untouched until the owner edits the ordered contact list. */
export function getOwnerSocialLinks(content: OwnerContent): OwnerSocialLink[] {
  if (content.site.socialLinks !== undefined) return content.site.socialLinks.map(link => ({ ...link }));
  const site = content.site;
  return [
    { id: "telegram", label: getTemplateText(content, "contact.telegramLabel"), value: site.telegram ? `@${site.telegram}` : "", url: `https://t.me/${encodeURIComponent(site.telegram)}` },
    { id: "discord", label: getTemplateText(content, "contact.discordLabel"), value: site.discord },
    { id: "tiktok", label: getTemplateText(content, "contact.tiktokLabel"), value: site.tiktok ? `@${site.tiktok}` : "", url: `https://www.tiktok.com/@${encodeURIComponent(site.tiktok)}` },
    { id: "twitch", label: getTemplateText(content, "contact.twitchLabel"), value: site.twitch, url: `https://www.twitch.tv/${encodeURIComponent(site.twitch)}` },
    { id: "email", label: getTemplateText(content, "contact.emailLabel"), value: site.email, url: `mailto:${site.email}` },
  ].filter(link => link.value);
}
