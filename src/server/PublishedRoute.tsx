import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPublishedSite } from "./published-site";
import { publicContentToOwnerContent } from "@/owner/model";
import { getPreviewPage } from "@/owner/preview-model";
import { getPublicPremade, getPublicRequestPage } from "@/components/storefront-model";
import { PublishedPage } from "@/components/PublishedPage";
import { UnderConstruction } from "@/components/UnderConstruction";
import { site } from "@/content/site";

/** Publication is authoritative for pages, product details, and renamed request routes. */
export async function PublishedRoute({ slug, fallback, request = false }: { slug: string[]; fallback?: ReactNode; request?: boolean }) {
  const state = await getPublishedSite();
  // Return before serializing any page fallback or publication into client props.
  if (state.status === "locked") return <UnderConstruction />;
  const routeSlug = request ? slug.flatMap(part => part.split("/")) : slug;
  if (state.status === "published") {
    const content = publicContentToOwnerContent(state.snapshot.content);
    if (!getPreviewPage(content, routeSlug) && !getPublicPremade(content, routeSlug) && !getPublicRequestPage(content, routeSlug)) notFound();
  }
  if (state.status === "baseline" && (!fallback || (routeSlug[0] === "premades" && !site.showPremades))) notFound();
  return <PublishedPage slug={routeSlug} fallback={state.status === "baseline" ? fallback : undefined} request={request} serverState={state} />;
}
