import { cookies } from "next/headers";
import { getPublicTheme } from "@/server/site-theme";
import { ThemeDefaultsProvider } from "@/components/ThemeDefaultsProvider";
import { themeBootstrap } from "@/components/theme-bootstrap";
import { THEME_AREAS, type ThemeArea, type ThemeMode } from "@/components/theme-settings";
import type { Metadata } from "next";
import { CartProvider, CartButton } from "@/components/Cart";
import { PublicChromeLayout } from "@/components/PublicChrome";
import { PublicSiteFrame } from "@/components/PublicSiteFrame";
import { PublicSiteProvider } from "@/components/PublicSiteContext";
import { getPublishedSite } from "@/server/published-site";
import { site } from "@/content/site";
import { CopyrightProvider } from "@/components/Copyright";
import { copyrightYearAt } from "@/content/copyright";
import "./globals.css";
import "./color-modes.css";
import { ColorModeRuntime } from "@/components/ColorMode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: site.name, template: `%s | ${site.name}` }, description: "Taylor Made Creations: fursuits, character work and commission information.", robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [initialState, theme, cookieJar] = await Promise.all([getPublishedSite(), getPublicTheme(), cookies()]);
  const initialModes: Partial<Record<ThemeArea, ThemeMode>> = {};
  for (const area of THEME_AREAS) { const value = cookieJar.get(`tmc-theme-${area}`)?.value; if (value === "light" || value === "dark") initialModes[area] = value; }
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap(theme, initialModes) }} /></head><body><ThemeDefaultsProvider defaults={theme} initialModes={initialModes}><ColorModeRuntime /><CopyrightProvider initialYear={copyrightYearAt()}><PublicSiteProvider initialState={initialState}><CartProvider allowSample={process.env.NODE_ENV === "development"}><PublicSiteFrame><a className="skip" href="#main">Skip to content</a>{initialState.status !== "locked" && <div className="preview-banner"><span>Development preview · No checkout payments are taken.</span></div>}<PublicChromeLayout><CartButton /><main id="main">{children}</main></PublicChromeLayout></PublicSiteFrame></CartProvider></PublicSiteProvider></CopyrightProvider></ThemeDefaultsProvider></body></html>;
}
