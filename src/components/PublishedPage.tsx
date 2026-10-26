"use client";

import type { ReactNode } from "react";
import { publicContentToOwnerContent } from "@/owner/model";
import { getPreviewPage } from "@/owner/preview-model";
import { ContentPage } from "./SiteContent";
import { PremadeProduct } from "./PremadeProduct";
import { CommissionRequestPage } from "./CommissionRequestPage";
import { getPublicPremade, getPublicRequestPage } from "./storefront-model";
import type { PublicSiteState } from "@/server/published-site";
import { usePublicServerState } from "./PublicSiteContext";
import { UnderConstruction } from "./UnderConstruction";
import { PublicNotFound } from "./PublicNotFound";
import { PublicUnavailable } from "./PublicUnavailable";

export function PublishedPage({ slug, fallback, serverState }: { slug: string[]; fallback?: ReactNode; request?: boolean; serverState: PublicSiteState }) {
  const state = usePublicServerState(serverState);
  if (state.status === "locked") return <UnderConstruction />;
  if (state.status === "error") return <PublicUnavailable message={state.message} />;
  if (state.status === "baseline") return fallback ?? <PublicNotFound state={state} />;
  const content = publicContentToOwnerContent(state.snapshot.content);
  const product = getPublicPremade(content, slug);
  if (product) return <PremadeProduct content={content} page={product.page} item={product.item} />;
  const requestPage = getPublicRequestPage(content, slug);
  if (requestPage) return <CommissionRequestPage page={requestPage} />;
  const page = getPreviewPage(content, slug);
  return page ? <ContentPage content={content} page={page} mode="public" /> : <PublicNotFound state={state} />;
}
