"use client";

import type {ReactElement,ReactNode} from "react";
import {usePathname} from "next/navigation";
import {LayoutAppearance} from "./LayoutAppearance";
import {useMobileSiteLayout} from "@/owner/use-mobile-site-layout";
import Link from "next/link";
import {Brand} from "./Brand";
import {CopyrightRange} from "./Copyright";
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
 const mobile=useMobileSiteLayout(content?.design?.mobileLayoutEnabled===true),path=usePathname(),dropdown=useNavigationDisclosure(path);
 const appearance=(key:string)=>resolveElementAppearance(content?.contentOverrides?.styles?.[key],mobile);
 const wrap=(key:string,element:ReactElement,inline=false,target=`canvas:${key}`)=><LayoutAppearance key={target} target={target} appearance={appearance(key)} inline={inline}>{element}</LayoutAppearance>;
 const footerLink=(field:'site.footerTerms'|'site.footerContact')=>{
  const link=getTemplateLink(content,field),visual=appearance(field),props={...getElementAppearanceAttributes(visual),style:getElementAppearanceStyle(visual)};
  const destination=content?resolveSiteDestination(content,link.href,'public'):{href:link.href,kind:'page'};
  if(!destination)return null;
  const element=destination.kind==='page'?<Link {...props} href={destination.href}>{link.label}</Link>:<a {...props} href={destination.href} download={destination.kind==='download'||undefined} target={destination.kind==='external'&&destination.href.startsWith('https:')?'_blank':undefined} rel={destination.kind==='external'?'noopener noreferrer':undefined}>{link.label}</a>;
  return wrap(field,element,true,`template-link:${field}`);
 };
 const renderLink=({id,href,label}:HeaderNavigationLink)=>wrap(`layout.navigation:${id}`,href.startsWith('https://')?<a href={href} target="_blank" rel="noopener noreferrer" onClick={()=>dropdown.current?.removeAttribute('open')}>{label}</a>:<Link href={href} aria-current={path===href||(href!=='/'&&path.startsWith(`${href}/`))?'page':undefined} onClick={()=>dropdown.current?.removeAttribute('open')}>{label}</Link>,true);
 const navigation=content?getHeaderNavigation(content):null;
 const nav=navigation?wrap('layout.site.navigation',<nav aria-label="Main navigation">{navigation.main.filter(({href})=>href!=='/premades'||(content?.site.showPremades??site.showPremades)).map(renderLink)}{content?.site.moreEnabled&&navigation.more.length>0&&wrap('layout.site.more',<details className="nav-more" ref={dropdown} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dropdown.current?.removeAttribute('open');dropdown.current?.querySelector('summary')?.focus();}}}><summary>More <DropdownChevron className="nav-more-chevron"/></summary><div className="nav-more-menu">{navigation.more.map(renderLink)}</div></details>)}</nav>):<Nav showPremades={site.showPremades}/>;
 if(state.status==='locked')return {content,mobile,header:null,footer:null};
 if(state.status==='error')return {content,mobile,header:<header className="site-header"><div className="header-inner"><span className="small-label">Website temporarily unavailable</span></div></header>,footer:null};
 const brand=(footer=false)=><Brand footer={footer} name={content?.site.name??site.name} logo={getTemplateImage(content,'site.logo')} appearance={appearance('site.brand')} logoAppearance={appearance('site.logo')}/>;
 const header=wrap('layout.site.header',<header className="site-header"><div className="header-inner">{wrap('layout.site.headerBrand',<div>{brand()}</div>)}<div className="header-right"><span className="small-label">{wrap('site.headerTagline',<span>{getTemplateText(content,'site.headerTagline')}</span>,true,'template-text:site.headerTagline')}</span>{nav}</div></div></header>);
 const footer=wrap('layout.site.footer',<footer><div className="footer-top">{wrap('layout.site.footerBrand',<div>{brand(true)}</div>)}<span>{wrap('site.footerTagline',<span>{getTemplateText(content,'site.footerTagline')}</span>,true,'template-text:site.footerTagline')}</span></div><div className="footer-bottom"><span><CopyrightRange/> {content?.site.name??site.name}. All rights reserved.</span><div>{footerLink('site.footerTerms')}{footerLink('site.footerContact')}</div></div><FooterCredits /></footer>);
 return {content,mobile,header,footer};
}
/** Kept for isolated callers; the app uses the unified scene below. */
export function PublicHeader(){return usePublicChromeTrees().header;}
export function PublicFooter(){return usePublicChromeTrees().footer;}
function PublicChromeBody({children}:{children:ReactNode}){return <>{children}</>;}
export function PublicChromeLayout({children}:{children:ReactNode}){
 const {content,mobile,header,footer}=usePublicChromeTrees();
 const tree=<>{header}<PublicChromeBody>{children}</PublicChromeBody>{footer}</>;
 return content?<CanvasScene content={content} scope="chrome" mobile={mobile} markers={markers}>{tree}</CanvasScene>:tree;
}
