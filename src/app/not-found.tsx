"use client";
import Link from "next/link";
import { isPageAvailable, pageHref } from "@/owner/model";
import { usePublicOwnerContent, usePublicSiteState } from "@/components/PublicSiteContext";
export default function NotFound(){
  const content=usePublicOwnerContent(),state=usePublicSiteState();
  const gallery=content?.pages.find(page=>page.builtinKey==='gallery'&&isPageAvailable(content,page));
  const galleryHref=gallery?pageHref(gallery):state.status==='baseline'?'/gallery':null;
  return <div className="page-shell empty-state public-not-found"><p className="eyebrow">404 · WRONG TURN AT THE DEALER’S DEN</p><h1>Lost on the con floor?</h1><p>We followed the giant tail and somehow ended up at a page that doesn’t exist. Let’s get you back to familiar paws.</p><div className="actions"><Link className="button" href="/">Back home</Link>{galleryHref&&<Link className="text-link" href={galleryHref}>Find the Fursuit Gallery →</Link>}</div></div>;
}
