import type { Metadata } from "next";
import { CartProvider, CartButton } from "@/components/Cart";
import { PublicHeader, PublicFooter } from "@/components/PublicChrome";
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
export const metadata: Metadata = { title: { default: site.name, template: `%s | ${site.name}` }, description: "Taylor Made Creations — fursuits, character work and commission information.", robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  const initialState = await getPublishedSite();
  return <html lang="en"><body><ColorModeRuntime /><CopyrightProvider initialYear={copyrightYearAt()}><PublicSiteProvider initialState={initialState}><CartProvider allowSample={process.env.NODE_ENV === "development"}><PublicSiteFrame><a className="skip" href="#main">Skip to content</a><div className="preview-banner"><span>Development preview · Forms and payments are not connected.</span></div><PublicHeader /><CartButton /><main id="main">{children}</main><PublicFooter /></PublicSiteFrame></CartProvider></PublicSiteProvider></CopyrightProvider></body></html>;
}
