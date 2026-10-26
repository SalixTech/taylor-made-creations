"use client";

import Link from "next/link";
import { Brand } from "./Brand";
import { CopyrightRange } from "./Copyright";
import { Nav } from "./Nav";
import { ColorModeToggle } from "./ColorMode";
import { site } from "@/content/site";
import { getVisibleNavigation, getMoreNavigation, pageHref, type OwnerContent } from "@/owner/model";
import { getTemplateImage, getTemplateLink, getTemplateText } from "@/owner/site-design";
import { getElementAppearanceAttributes, getElementAppearanceStyle } from "@/owner/appearance";
import { resolveSiteDestination } from "@/owner/preview-model";
import { usePublicOwnerContent, usePublicSiteState } from "./PublicSiteContext";

function FooterLink({ content, field }: { content: OwnerContent | null; field: "site.footerTerms" | "site.footerContact" }) {
  const link = getTemplateLink(content, field);
  const appearance = content?.contentOverrides?.styles?.[field];
  const styleProps = { ...getElementAppearanceAttributes(appearance), style: getElementAppearanceStyle(appearance) };
  const destination = content ? resolveSiteDestination(content, link.href, "public") : { href: link.href, kind: "page" };
  if (!destination) return null;
  if (destination.kind === "page") return <Link {...styleProps} href={destination.href}>{link.label}</Link>;
  return <a {...styleProps} href={destination.href} download={destination.kind === "download" || undefined} target={destination.kind === "external" && destination.href.startsWith("https:") ? "_blank" : undefined} rel={destination.kind === "external" ? "noopener noreferrer" : undefined}>{link.label}</a>;
}
export function PublicHeader() {
  const state = usePublicSiteState();
  const content = usePublicOwnerContent();
  if (state.status === "error") return <header className="site-header"><div className="header-inner"><span className="small-label">Website temporarily unavailable</span></div></header>;
  return <header className="site-header"><div className="header-inner"><Brand name={content?.site.name ?? site.name} logo={getTemplateImage(content, "site.logo")} appearance={content?.contentOverrides?.styles?.["site.brand"]} logoAppearance={content?.contentOverrides?.styles?.["site.logo"]} /><div className="header-right"><span className="small-label"><span {...getElementAppearanceAttributes(content?.contentOverrides?.styles?.["site.headerTagline"])} style={getElementAppearanceStyle(content?.contentOverrides?.styles?.["site.headerTagline"])}>{getTemplateText(content, "site.headerTagline")}</span></span><Nav showPremades={content?.site.showPremades ?? site.showPremades} moreEnabled={content?.site.moreEnabled ?? false} moreLinks={content ? getMoreNavigation(content).map(page => ({ id: page.id, href: pageHref(page), label: page.navLabel })) : []} links={content ? getVisibleNavigation(content).map(page => ({ id: page.id, href: pageHref(page), label: page.navLabel })) : undefined} /><ColorModeToggle scope="public" /></div></div></header>;
}
export function PublicFooter() {
  const state = usePublicSiteState();
  const content = usePublicOwnerContent();
  if (state.status === "error") return null;
  return <footer><div className="footer-top"><Brand footer name={content?.site.name ?? site.name} logo={getTemplateImage(content, "site.logo")} appearance={content?.contentOverrides?.styles?.["site.brand"]} logoAppearance={content?.contentOverrides?.styles?.["site.logo"]} /><span><span {...getElementAppearanceAttributes(content?.contentOverrides?.styles?.["site.footerTagline"])} style={getElementAppearanceStyle(content?.contentOverrides?.styles?.["site.footerTagline"])}>{getTemplateText(content, "site.footerTagline")}</span></span></div><div className="footer-bottom"><span><CopyrightRange /> {content?.site.name ?? site.name}</span><div><FooterLink content={content} field="site.footerTerms" /><FooterLink content={content} field="site.footerContact" /></div></div></footer>;
}
