"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getSiteThemeAttributes, getSiteThemeStyle } from "@/owner/site-design";
import { SiteFontLoader } from "./SiteFontLoader";
import { PublicAccountThemeSync } from "./PublicAccountThemeSync";
import { ColorModeToggle, useColorMode } from "./ColorMode";
import { usePublicOwnerContent } from "./PublicSiteContext";

/** Theme lives on the public frame, never :root/body or the management workspace. */
export function PublicSiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const area = pathname === "/client-hub" || pathname.startsWith("/client-hub/") || pathname === "/hub-window" ? "hub" : "public";
  const preferredColorMode = useColorMode(area);
  const colorMode = area === "hub" ? "dark" : preferredColorMode;
  const isOwner = /^\/(?:taylor|owner)(?:\/|$)/.test(pathname);
  const content = usePublicOwnerContent();
  const publicContent = /^\/(?:taylor|owner)(?:\/|$)/.test(pathname) ? null : content;
  return <div className="selected-design public-site-frame" data-theme-scope={isOwner ? undefined : "public"} data-color-mode={isOwner ? undefined : colorMode} {...getSiteThemeAttributes(publicContent)} style={getSiteThemeStyle(publicContent)}><PublicAccountThemeSync pathname={pathname} /><SiteFontLoader fonts={publicContent?.fonts} />{children}{!isOwner && area !== "hub" && <ColorModeToggle scope={area} />}</div>;
}
