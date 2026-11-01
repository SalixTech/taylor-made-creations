"use client";
import {Fragment} from "react";
import {parseInlineLinks} from "@/owner/inline-links";
import {useWebsiteDocumentLink} from "./useWebsiteDocumentLink";
import { getElementHref } from "@/owner/canvas-hyperlinks";
import { resolveSiteDestination } from "@/owner/preview-model";
import Link from "next/link";
import type { OwnerContent, OwnerPage, OwnerPremade } from "@/owner/model";
import { getPremadeTags, pageHref } from "@/owner/model";
import { useCart } from "./Cart";
import { PremadeGallery } from "./PremadeGallery";
import { canAddPublishedPremade, premadeChannelLabel, premadeHref, thirdPartyListingUrl } from "./storefront-model";

export function PremadeTags({ item }: { item: OwnerPremade }) {
  return <div className="premade-tags"><span>{premadeChannelLabel(item)}</span>{getPremadeTags(item).map(tag => <span key={tag}>{tag}</span>)}</div>;
}
export function PremadePurchaseInfo({ content, item, preview = false }: { content: OwnerContent; item: OwnerPremade; preview?: boolean }) {
  const channel = item.soldChannel ?? "tmc";
  const externalUrl = thirdPartyListingUrl(item);
  if (channel === "third-party") return <div className="premade-purchase"><p>Purchase through the third-party listing. The seller&apos;s listing controls availability, price and checkout.</p>{externalUrl ? <a className="button" href={externalUrl} target="_blank" rel="noopener noreferrer">View third-party listing ↗</a> : <p role="status">A secure third-party listing link has not been provided yet.</p>}</div>;
  if (channel === "con") return <div className="premade-purchase"><h2>Where to purchase</h2><p>{item.venue?.trim() ? `Find this premade at ${item.venue}.` : "Available in person at a convention. Contact Taylor for the next event and booth details."}</p><p className="storefront-notice">Convention catalog: the items shown do not necessarily reflect current availability. Please confirm at the booth before making plans.</p></div>;
  if (content.site.catalogMode) return <div className="premade-purchase"><h2>Where to purchase</h2><p>Listed by Taylor Made Creations. Contact Taylor to confirm current availability and purchasing details.</p><p className="storefront-notice">Catalog mode is on. Online cart and checkout are unavailable.</p></div>;
  if (preview) return <p className="storefront-notice">Owner preview only. Publish this listing to make its product page available. PayPal and checkout are not connected.</p>;
  return <AddPremadeToCart content={content} item={item} />;
}
function AddPremadeToCart({ content, item }: { content: OwnerContent; item: OwnerPremade }) {
  const cart = useCart();
  const canAdd = canAddPublishedPremade(content, item.id) && cart.enabled;
  const inCart = cart.item?.id === item.id;
  return <div className="premade-purchase">{canAdd ? <button className="button" type="button" onClick={() => inCart ? cart.open() : cart.add({ id: item.id, name: item.name, image: item.image, price: item.price! })}>{inCart ? "View cart →" : "Add to cart"}</button> : <p>A purchase price is not available. Contact Taylor for details.</p>}<p className="storefront-notice">PayPal and checkout are not connected. Adding to cart does not reserve this item, place an order or make a payment.</p></div>;
}
export function PremadeListingLink({ content, page, item, children }: { content: OwnerContent; page: OwnerPage; item: OwnerPremade; children?: React.ReactNode }) {
  const {openDocument,documentError}=useWebsiteDocumentLink();
  const override=getElementHref(content,`layout.premade:${item.id}:destination`);
  const destination=override?resolveSiteDestination(content,override,"public"):null;
  if(override)return destination?<><a onClick={event=>openDocument(destination.href,event)} className="text-link" href={destination.href} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined}>{children??"View premade →"}</a>{documentError&&<span role="alert">{documentError}</span>}</>:<>{children??"View premade →"}</>;
  const external = !content.site.catalogMode ? thirdPartyListingUrl(item) : null;
  if (external) return <a className="text-link" href={external} target="_blank" rel="noopener noreferrer">{children ?? "View third-party listing ↗"}</a>;
  return <Link className="text-link" href={premadeHref(page, item)}>{children ?? (content.site.catalogMode || item.soldChannel === "con" ? "Details & where to purchase →" : "View premade →")}</Link>;
}
function PremadeTextLink({content,item,part,children}:{content:OwnerContent;item:OwnerPremade;part:string;children:React.ReactNode}) {
  const {openDocument,documentError}=useWebsiteDocumentLink();
  const href=getElementHref(content,`layout.premade:${item.id}:${part}`),destination=href?resolveSiteDestination(content,href,"public"):null;
  return destination?<><a onClick={event=>openDocument(destination.href,event)} className="inline-content-link" href={destination.href} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined}>{children}</a>{documentError&&<span role="alert">{documentError}</span>}</>:<>{children}</>;
}
/** Descriptions already accept inline link syntax in the owner inspector. A
 * whole-description destination owns its children rather than nesting anchors. */
function PremadeDescription({content,item}:{content:OwnerContent;item:OwnerPremade}) {
 const {openDocument,documentError}=useWebsiteDocumentLink();
 const href=getElementHref(content,`layout.premade:${item.id}:body`),whole=href?resolveSiteDestination(content,href,"public"):null;
 return <><PremadeTextLink content={content} item={item} part="body">{parseInlineLinks(item.description).map((part,index)=>{
  const destination=!whole&&part.href?resolveSiteDestination(content,part.href,"public"):null;
  return destination?<a key={index} className="inline-content-link" href={destination.href} onClick={event=>openDocument(destination.href,event)} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined} download={destination.kind==="download"||undefined}>{part.text}</a>:<Fragment key={index}>{part.text}</Fragment>;
 })}</PremadeTextLink>{documentError&&<span role="alert">{documentError}</span>}</>;
}
export function PremadeProduct({ content, page, item }: { content: OwnerContent; page: OwnerPage; item: OwnerPremade }) {
  const override=getElementHref(content,`layout.premade:${item.id}:destination`),destination=override?resolveSiteDestination(content,override,"public"):null;
  return <div className="page-shell"><p><Link className="text-link" href={pageHref(page)}>← {page.title}</Link></p><article className="premade-product"><PremadeGallery item={item} listingHref={destination?.href} external={destination?.kind==="external"} /><div><PremadeTextLink content={content} item={item} part="tags"><PremadeTags item={item} /></PremadeTextLink><h1><PremadeTextLink content={content} item={item} part="destination">{item.name}</PremadeTextLink></h1><p className="premade-description"><PremadeDescription content={content} item={item}/></p>{item.price !== null && <p className="premade-price"><PremadeTextLink content={content} item={item} part="price">${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD</PremadeTextLink></p>}<PremadePurchaseInfo content={content} item={item} /></div></article></div>;
}
