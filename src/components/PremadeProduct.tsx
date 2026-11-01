"use client";
import {WebsiteAuthorText} from "./WebsiteAuthorText";
import {resolveElementAppearance} from "@/owner/appearance";
import {useMobileSiteLayout} from "@/owner/use-mobile-site-layout";
import {LayoutAppearance} from "./LayoutAppearance";
import {WebsiteTemplateText} from "./WebsiteTemplateText";
import {getTemplateText} from "@/owner/site-design";
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

export function PremadeTags({ item, content, renderText, renderTag }: { item: OwnerPremade;content?:OwnerContent;renderTag?:(tag:string,index:number)=>React.ReactNode;renderText?:(key:string,variables?:Record<string,string>)=>React.ReactNode }) {
  const key=item.soldChannel==='third-party'?'premades.soldThirdParty':item.soldChannel==='con'?'premades.soldConvention':'premades.soldHere';
  return <div className="premade-tags"><span>{content?(renderText?renderText(key):getElementHref(content,`layout.premade:${item.id}:tags`)?parseInlineLinks(getTemplateText(content,key)).map(p=>p.text).join(''):<WebsiteTemplateText content={content} field={key}/>):premadeChannelLabel(item)}</span>{getPremadeTags(item).map((tag,index) => <span key={tag}>{renderTag?renderTag(tag,index):content&&!getElementHref(content,`layout.premade:${item.id}:tags`)?<PremadeTextLink content={content} item={item} part={`tag-${index}`}><WebsiteAuthorText content={content} fieldId={`author:premadeTag:${item.id}:${index}`} text={tag}/></PremadeTextLink>:content?<WebsiteAuthorText content={content} fieldId={`author:premadeTag:${item.id}:${index}`} text={tag}/>:tag}</span>)}</div>;
}
export function PremadePurchaseInfo({ content, item, preview = false, renderText, mode }: { content: OwnerContent; item: OwnerPremade; preview?: boolean;mode?:"public"|"private-preview"|"editor";renderText?:(key:string,variables?:Record<string,string>)=>React.ReactNode }) {
  const text=(key:string,variables?:Record<string,string>)=>renderText?renderText(`premades.${key}`,variables):<WebsiteTemplateText mode={displayMode} content={content} field={`premades.${key}`} variables={variables}/>;
  const displayMode=mode??(preview?"private-preview":"public"),{openDocument,documentError}=useWebsiteDocumentLink(displayMode,getTemplateText(content,"site.pdfFailureMessage"));
  const channel = item.soldChannel ?? "tmc";
  const externalUrl = thirdPartyListingUrl(item),override=getElementHref(content,`layout.premade:${item.id}:destination`,externalUrl??undefined),destination=override?resolveSiteDestination(content,override,displayMode==="public"?"public":"preview"):null;
  if (channel === "third-party") return <div className="premade-purchase"><p>{text('thirdPartyNotice')}</p>{destination ? <a className="button" href={destination.href} onClick={event=>openDocument(destination.href,event)} target={destination.kind==="external"?"_blank":undefined} rel="noopener noreferrer" {...(displayMode==="editor"?{"data-owner-edit":`canvas:layout.premade:${item.id}:destination`}: {})}>{text('thirdPartyLink')}</a> : <p role="status">{text('thirdPartyMissing')}</p>}{documentError&&<p role="alert">{documentError}</p>}</div>;
  if (channel === "con") return <div className="premade-purchase"><h2>{text('purchaseHeading')}</h2><p>{item.venue?.trim() ? text('venueNotice',{venue:item.venue}) : text('conventionNotice')}</p><p className="storefront-notice">{text('conventionAvailability')}</p></div>;
  if (content.site.catalogMode) return <div className="premade-purchase"><h2>{text('purchaseHeading')}</h2><p>{text('catalogNotice')}</p><p className="storefront-notice">{text('catalogDisabled')}</p></div>;
  if (preview) return <p className="storefront-notice">{text('previewNotice')}</p>;
  return <AddPremadeToCart content={content} item={item} />;
}
function AddPremadeToCart({ content, item }: { content: OwnerContent; item: OwnerPremade }) {
  const cart = useCart();
  const canAdd = canAddPublishedPremade(content, item.id) && cart.enabled;
  const inCart = cart.item?.id === item.id;
  return <div className="premade-purchase">{canAdd ? <button className="button" type="button" onClick={() => inCart ? cart.open() : cart.add({ id: item.id, name: item.name, image: item.image, price: item.price! })}>{inCart ? getTemplateText(content,"premades.viewCart") : getTemplateText(content,"premades.addCart")}</button> : <p><WebsiteTemplateText content={content} field="premades.noPrice"/></p>}<p className="storefront-notice"><WebsiteTemplateText content={content} field="premades.checkoutNotice"/></p></div>;
}
export function PremadeListingLink({ content, page, item, children }: { content: OwnerContent; page: OwnerPage; item: OwnerPremade; children?: React.ReactNode }) {
  const {openDocument,documentError}=useWebsiteDocumentLink("public",getTemplateText(content,"site.pdfFailureMessage"));
  const override=getElementHref(content,`layout.premade:${item.id}:destination`);
  const destination=override?resolveSiteDestination(content,override,"public"):null;
  if(override)return destination?<><a onClick={event=>openDocument(destination.href,event)} className="text-link" href={destination.href} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined}>{children??getTemplateText(content,"premades.viewListing")}</a>{documentError&&<span role="alert">{documentError}</span>}</>:<>{children??getTemplateText(content,"premades.viewListing")}</>;
  const external = !content.site.catalogMode ? thirdPartyListingUrl(item) : null;
  if (external) return <a className="text-link" href={external} target="_blank" rel="noopener noreferrer">{children ?? getTemplateText(content,"premades.thirdPartyLink")}</a>;
  return <Link className="text-link" href={premadeHref(page, item)}>{children ?? (content.site.catalogMode || item.soldChannel === "con" ? getTemplateText(content,"premades.viewPurchase") : getTemplateText(content,"premades.viewListing"))}</Link>;
}
function PremadeTextLink({content,item,part,children}:{content:OwnerContent;item:OwnerPremade;part:string;children:React.ReactNode}) {
  const {openDocument,documentError}=useWebsiteDocumentLink("public",getTemplateText(content,"site.pdfFailureMessage"));
  const href=getElementHref(content,`layout.premade:${item.id}:${part}`),destination=href?resolveSiteDestination(content,href,"public"):null;
  return destination?<><a onClick={event=>openDocument(destination.href,event)} className="inline-content-link" href={destination.href} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined}>{children}</a>{documentError&&<span role="alert">{documentError}</span>}</>:<>{children}</>;
}
/** Descriptions already accept inline link syntax in the owner inspector. A
 * whole-description destination owns its children rather than nesting anchors. */
function PremadeDescription({content,item}:{content:OwnerContent;item:OwnerPremade}) {
 const {openDocument,documentError}=useWebsiteDocumentLink("public",getTemplateText(content,"site.pdfFailureMessage"));
 const descriptionParts=parseInlineLinks(item.description);
 const href=getElementHref(content,`layout.premade:${item.id}:body`),whole=href?resolveSiteDestination(content,href,"public"):null;
 return <><PremadeTextLink content={content} item={item} part="body">{descriptionParts.map((part,index)=>{
  const label=<WebsiteAuthorText content={content} fieldId={`author:premade:${item.id}:description`} text={part.text} offset={descriptionParts.slice(0,index).reduce((sum,entry)=>sum+Array.from(entry.text).length,0)}/>;
  const destination=!whole&&part.href?resolveSiteDestination(content,part.href,"public"):null;
  return destination?<a key={index} className="inline-content-link" href={destination.href} onClick={event=>openDocument(destination.href,event)} target={destination.kind==="external"&&destination.href.startsWith("https:")?"_blank":undefined} rel={destination.kind==="external"?"noopener noreferrer":undefined} download={destination.kind==="download"||undefined}>{label}</a>:<Fragment key={index}>{label}</Fragment>;
 })}</PremadeTextLink>{documentError&&<span role="alert">{documentError}</span>}</>;
}
export function PremadeProduct({ content, page, item }: { content: OwnerContent; page: OwnerPage; item: OwnerPremade }) {
 const mobile=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true);
  const override=getElementHref(content,`layout.premade:${item.id}:destination`),destination=override?resolveSiteDestination(content,override,"public"):null;
  return <div className="page-shell"><p><Link className="text-link" href={pageHref(page)}>← {page.title}</Link></p><article className="premade-product"><PremadeGallery content={content} item={item} listingHref={destination?.href} external={destination?.kind==="external"} /><div><PremadeTextLink content={content} item={item} part="tags"><PremadeTags item={item} content={content} /></PremadeTextLink><h1><PremadeTextLink content={content} item={item} part="destination"><WebsiteAuthorText content={content} fieldId={`author:premade:${item.id}:name`} text={item.name}/></PremadeTextLink></h1><p className="premade-description"><PremadeDescription content={content} item={item}/></p>{item.price !== null && <LayoutAppearance appearance={resolveElementAppearance(content.contentOverrides?.styles?.[`layout.premade:${item.id}:price`],mobile)}><p className="premade-price"><PremadeTextLink content={content} item={item} part="price">${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} <WebsiteTemplateText content={content} field="premades.currencyLabel" contained={!!getElementHref(content,`layout.premade:${item.id}:price`)}/></PremadeTextLink></p></LayoutAppearance>}<PremadePurchaseInfo content={content} item={item} /></div></article></div>;
}
