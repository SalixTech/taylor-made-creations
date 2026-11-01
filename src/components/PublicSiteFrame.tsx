"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getSiteThemeAttributes, getSiteThemeStyle, resolveSiteDesign } from "@/owner/site-design";
import { SiteFontLoader } from "./SiteFontLoader";
import { PublicAccountThemeSync } from "./PublicAccountThemeSync";
import { ColorModeToggle, useColorMode } from "./ColorMode";
import { isMainPublicRoute } from "./main-public-appearance";
import { usePublicOwnerContent } from "./PublicSiteContext";

import {useMobileSiteLayout} from "@/owner/use-mobile-site-layout";

/** Public colors and document canvas follow the visitor choice, defaulting to light. */
export function PublicSiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const area = pathname === "/client-hub" || pathname.startsWith("/client-hub/") || pathname === "/hub-window" ? "hub" : "public";
  const preferredColorMode = useColorMode(area);
  const colorMode = area === "hub" ? "dark" : preferredColorMode;
  const publicRoute = isMainPublicRoute(pathname);
  useEffect(() => {
    if (!publicRoute) return;
    const root = document.documentElement;
    if (!root) return;
    const previous = { colorScheme: root.style.colorScheme, backgroundColor: root.style.backgroundColor };
    root.style.colorScheme = colorMode;
    root.style.backgroundColor = colorMode === "dark" ? "#18181b" : "#ffffff";
    delete root.dataset.tmcThemePending;
    return () => { root.style.colorScheme = previous.colorScheme; root.style.backgroundColor = previous.backgroundColor; };
  }, [publicRoute, colorMode]);
  const isOwner = /^\/(?:taylor|owner)(?:\/|$)/.test(pathname);
  const content = usePublicOwnerContent();
  const publicContent = /^\/(?:taylor|owner)(?:\/|$)/.test(pathname) ? null : content;
  const mobile=useMobileSiteLayout(publicContent?.design?.mobileLayoutEnabled===true);
  const themedContent=publicContent?{design:resolveSiteDesign(publicContent.design,mobile)}:null;
  return <div className="selected-design public-site-frame" data-theme-scope={isOwner ? undefined : "public"} data-color-mode={isOwner ? undefined : colorMode} {...getSiteThemeAttributes(themedContent)} style={getSiteThemeStyle(themedContent)}><PublicAccountThemeSync pathname={pathname} /><SiteFontLoader fonts={publicContent?.fonts} />{children}{publicRoute && <ColorModeToggle scope="public" />}</div>;
}

/** Preserve the existing workspace notice; the public MAIN site is not a preview. */
export function MainDevelopmentBanner() {
  const pathname = usePathname();
  return isMainPublicRoute(pathname) ? null : <div className="preview-banner"><span>Development preview · No checkout payments are taken.</span></div>;
}
