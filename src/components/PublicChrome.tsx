"use client";

import {useWebsiteDocumentLink} from "./useWebsiteDocumentLink";
import {getElementHref} from "@/owner/canvas-hyperlinks";
import type {ReactElement,ReactNode} from "react";
import {usePathname} from "next/navigation";
import {LayoutAppearance} from "./LayoutAppearance";
import {useMobileSiteLayout} from "@/owner/use-mobile-site-layout";
import Link from "next/link";
import {Brand} from "./Brand";
import {CopyrightRange} from "./Copyright";
import {ContentBlocks,ElementLink,TemplateText,TemplateLink,siteContentCanvasMarkers,PublicSiteContentContext} from "./SiteContent";
import type {OwnerContent} from "@/owner/model";
import {WebsiteAuthorText} from "./WebsiteAuthorText";
import {FooterCredits} from "./FooterCredits";
import {Nav} from "./Nav";
import {useNavigationDisclosure} from "./use-navigation-disclosure";
import {DropdownChevron} from "./DropdownChevron";
import {CanvasScene,type CanvasMarker} from "./CanvasScene";
import {site} from "@/content/site";
import {getHeaderNavigation,type HeaderNavigationLink} from "@/owner/header-navigation";
import {getTemplateImage,getTemplateLink,getTemplateText} from "@/owner/site-design";
import {getElementAppearanceAttributes,getElementAppearanceStyle,resolveElementAppearance} from "@/owner/appearance";
import {resolveSiteDestination} from "@/owner/preview-model";
import {usePublicOwnerContent,usePublicSiteState} from "./PublicSiteContext";

const markers:readonly CanvasMarker[]=[{type:LayoutAppearance,target:props=>typeof props.target==='string'?props.target:null}];
/** Build explicit chrome elements without invoking React components. Keeping
 * header/footer in one scene allows moves between them while route children
 * remain opaque and outside the chrome inventory. */
function usePublicChromeTrees(){
 const state=usePublicSiteState(),content=usePublicOwnerContent();
 const {openDocument,documentError}=useWebsiteDocumentLink("public",getTemplateText(content,"site.pdfFailureMessage"));

 const mobile=useMobileSiteLayout(content?.design?.mobileLayoutEnabled===true),path=usePathname(),dropdown=useNavigationDisclosure(path);
 const appearance=(key:string)=>resolveElementAppearance(content?.contentOverrides?.styles?.[key],mobile);
 const wrap=(key:string,element:ReactElement,inline=false,target=`canvas:${key}`)=><LayoutAppearance key={target} target={target} appearance={appearance(key)} inline={inline}>{element}</LayoutAppearance>;
 const footerLink=(field:'site.footerTerms'|'site.footerContact')=>{
  if(content)return <TemplateLink content={content as OwnerContent} field={field} className=""/>;
  const link=getTemplateLink(content,field),visual=appearance(field),props={...getElementAppearanceAttributes(visual),style:getElementAppearanceStyle(visual)};
  const destination=content?resolveSiteDestination(content,link.href,'public'):{href:link.href,kind:'page'};
  if(!destination)return null;
  const element=destination.kind==='page'?<Link {...props} href={destination.href}>{link.label}</Link>:<a {...props} href={destination.href} download={destination.kind==='download'||undefined} target={destination.kind==='external'&&destination.href.startsWith('https:')?'_blank':undefined} rel={destination.kind==='external'?'noopener noreferrer':undefined}>{link.label}</a>;
  return wrap(field,element,true,`template-link:${field}`);
 };
 const renderLink=({id,href,label}:HeaderNavigationLink)=>{
  const effective=content?getElementHref(content,`layout.navigation:${id}`,href)??href:href;
  const destination=content?resolveSiteDestination(content,effective,'public'):{href:effective,kind:effective.startsWith('https:')?'external':'page'};
  if(!destination)return null;
  href=destination.href;const labelNode=content&&id!=="trello-board"?<WebsiteAuthorText content={content} fieldId={`author:navigation:${id}`} text={label}/>:label;
  return wrap(`layout.navigation:${id}`,destination.kind!=='page'?<a href={href} target={destination.kind==='external'&&href.startsWith('https:')?'_blank':undefined} rel={destination.kind==='external'?'noopener noreferrer':undefined} download={destination.kind==='download'||undefined} onClick={event=>{openDocument(href,event);dropdown.current?.removeAttribute('open');}}>{labelNode}</a>:<Link href={href} aria-current={path===href||(href!=='/'&&path.startsWith(`${href}/`))?'page':undefined} onClick={event=>{openDocument(href,event);dropdown.current?.removeAttribute('open');}}>{labelNode}</Link>,true);
 };
 const navigation=content?getHeaderNavigation(content):null;
 const nav=navigation?wrap('layout.site.navigation',<nav aria-label="Main navigation">{navigation.main.filter(({href})=>href!=='/premades'||(content?.site.showPremades??site.showPremades)).map(renderLink)}{content?.site.moreEnabled&&navigation.more.length>0&&wrap('layout.site.more',<details className="nav-more" ref={dropdown} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dropdown.current?.removeAttribute('open');dropdown.current?.querySelector('summary')?.focus();}}}><summary>{getTemplateText(content,"site.moreLabel")} <DropdownChevron className="nav-more-chevron"/></summary><div className="nav-more-menu">{navigation.more.map(renderLink)}</div></details>)}</nav>):<Nav showPremades={site.showPremades}/>;
 if(state.status==='locked')return {content,mobile,header:null,footer:null};
 if(state.status==='error')return {content,mobile,header:<header className="site-header"><div className="header-inner"><span className="small-label">Website temporarily unavailable</span></div></header>,footer:null};
 const brand=(footer=false)=><Brand pdfFailureMessage={getTemplateText(content,"site.pdfFailureMessage")} footer={footer} href={content?resolveSiteDestination(content,getElementHref(content,"site.brand","/")??"/","public")?.href??"/":"/"} name={content?.site.name??site.name} nameNode={content?<WebsiteAuthorText content={content} fieldId="author:site:name" text={content.site.name}/>:undefined} logo={getTemplateImage(content,'site.logo')} appearance={appearance('site.brand')} logoAppearance={appearance('site.logo')}/>;
 const header=wrap('layout.site.header',<header className="site-header"><div className="header-inner">{wrap('layout.site.headerBrand',<div>{brand()}</div>)}<div className="header-right"><span className="small-label">{content?<TemplateText content={content as OwnerContent} field="site.headerTagline"/>:getTemplateText(content,"site.headerTagline")}</span>{nav}{documentError&&<span role="alert">{documentError}</span>}</div></div></header>);
 const footer=wrap('layout.site.footer',<footer><div className="footer-top">{wrap('layout.site.footerBrand',<div>{brand(true)}</div>)}<span>{content?<TemplateText content={content as OwnerContent} field="site.footerTagline"/>:getTemplateText(content,"site.footerTagline")}</span></div><div className="footer-bottom"><span><CopyrightRange renderText={content?variables=><TemplateText content={content as OwnerContent} field="site.copyrightFormat" variables={variables}/>:undefined}/> {content?<ElementLink content={content as OwnerContent} href={getElementHref(content,"site.brand")}><WebsiteAuthorText content={content} fieldId="author:site:name" text={content.site.name}/></ElementLink>:site.name}{content?<TemplateText content={content as OwnerContent} field="site.rightsReserved"/>:getTemplateText(content,"site.rightsReserved")}</span><div>{footerLink('site.footerTerms')}{footerLink('site.footerContact')}</div></div>{!!content?.footerBlocks?.length&&<ContentBlocks content={content as OwnerContent} blocks={content!.footerBlocks!}/>}<FooterCredits content={content as OwnerContent} designCredit={getTemplateText(content,"site.designCredit")} platformCredit={getTemplateText(content,"site.platformCredit")}/></footer>);
 return {content,mobile,header,footer};
}
/** Kept for isolated callers; the app uses the unified scene below. */
export function PublicHeader(){const {header,mobile}=usePublicChromeTrees();return <PublicSiteContentContext mobile={mobile}>{header}</PublicSiteContentContext>;}
export function PublicFooter(){const {footer,mobile}=usePublicChromeTrees();return <PublicSiteContentContext mobile={mobile}>{footer}</PublicSiteContentContext>;}
function PublicChromeBody({children}:{children:ReactNode}){return <>{children}</>;}
export function PublicChromeLayout({children}:{children:ReactNode}){
 const {content,mobile,header,footer}=usePublicChromeTrees();
 const tree=<>{header}<PublicChromeBody>{children}</PublicChromeBody>{footer}</>;
 return content?<PublicSiteContentContext mobile={mobile}><CanvasScene content={content} scope="chrome" mobile={mobile} markers={[...markers,...siteContentCanvasMarkers({mode:"public",mobileLayout:mobile})]}>{tree}</CanvasScene></PublicSiteContentContext>:tree;
}
