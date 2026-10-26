"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { publicContentToOwnerContent } from "@/owner/model";
import { getPreviewPage } from "@/owner/preview-model";
import { ContentPage } from "./SiteContent";
import { PremadeProduct } from "./PremadeProduct";
import { CommissionRequestPage } from "./CommissionRequestPage";
import { getPublicPremade, getPublicRequestPage } from "./storefront-model";
import type { PublicSiteState } from "@/server/published-site";
import { usePublicServerState } from "./PublicSiteContext";

export function PublicUnavailable({ message }: { message: string }) {
  return <div className="page-shell"><div className="page-intro" role="alert"><p className="eyebrow">PLEASE TRY AGAIN</p><h1>The website is temporarily unavailable.</h1><p>{message}</p><button className="button" type="button" onClick={() => window.location.reload()}>Reload website</button></div></div>;
}
export function PublicPageMissing() {
  return <div className="page-shell public-not-found"><div className="page-intro"><p className="eyebrow">404 · PAGE NOT FOUND</p><h1>This page is not available.</h1><p>It may have been removed or switched off.</p><Link className="button" href="/">Back to home →</Link></div></div>;
}
export function PublishedPage({ slug, fallback, serverState }: { slug: string[]; fallback?: ReactNode; request?: boolean; serverState: PublicSiteState }) {
  const state = usePublicServerState(serverState);
  if (state.status === "error") return <PublicUnavailable message={state.message} />;
  if (state.status === "baseline") return fallback ?? <PublicPageMissing />;
  const content = publicContentToOwnerContent(state.snapshot.content);
  const product = getPublicPremade(content, slug);
  if (product) return <PremadeProduct content={content} page={product.page} item={product.item} />;
  const requestPage = getPublicRequestPage(content, slug);
  if (requestPage) return <CommissionRequestPage page={requestPage} />;
  const page = getPreviewPage(content, slug);
  return page ? <ContentPage content={content} page={page} mode="public" /> : <PublicPageMissing />;
}
