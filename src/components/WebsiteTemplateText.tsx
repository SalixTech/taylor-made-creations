"use client";
import {Fragment} from 'react';
import {resolveElementAppearance} from '@/owner/appearance';
import {LayoutAppearance} from './LayoutAppearance';
import {useMobileSiteLayout} from '@/owner/use-mobile-site-layout';
import type {OwnerContent,PublicOwnerContent} from '@/owner/model';
import {getTemplateText} from '@/owner/site-design';
import {getInlineTextRuns,inlineTextStyleCSS,inlineTextStyleAttributes,type InlineTextStyle} from '@/owner/rich-text';
import {parseInlineLinks,templateSupportsInlineLinks} from '@/owner/inline-links';
import {resolveSiteDestination} from '@/owner/preview-model';
import {getElementHref} from '@/owner/canvas-hyperlinks';
import {useWebsiteDocumentLink} from './useWebsiteDocumentLink';
/** Shared public fallback for catalog copy rendered outside the canvas context. */
export function WebsiteTemplateText({content,field,variables,mode="public",viewport,contained=false}:{content:OwnerContent|PublicOwnerContent;field:string;variables?:Record<string,string>;mode?:"public"|"private-preview"|"editor";viewport?:"desktop"|"mobile";contained?:boolean}){
 const text=getTemplateText(content,field,variables),{openDocument,documentError}=useWebsiteDocumentLink(mode,getTemplateText(content,"site.pdfFailureMessage"));
 const mobile=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true,viewport),appearance=resolveElementAppearance(content.contentOverrides?.styles?.[field],mobile);
 const whole=getElementHref(content,`template:${field}`),destination=!contained&&whole?resolveSiteDestination(content as OwnerContent,whole,mode==='public'?'public':'preview'):null;
 const id=`template:${field}`,record=content.contentOverrides?.inlineStyles?.[id];
 const parts:Array<{text:string;href?:string;style?:InlineTextStyle}>=record?getInlineTextRuns(content,id,mobile):(templateSupportsInlineLinks(field)?parseInlineLinks(text):[{text}]);
 const tokens:Record<string,string>={siteName:content.site.name,siteNameUpper:content.site.name.toUpperCase(),...variables};
 const nodes=parts.map((part,index)=>{const label=part.text.replace(/\{([A-Za-z]+)\}/g,(match,key:string)=>tokens[key]??match),node=part.style?<span {...inlineTextStyleAttributes(part.style)} style={inlineTextStyleCSS(part.style)}>{label}</span>:label;const target=!contained&&!destination&&part.href?resolveSiteDestination(content as OwnerContent,part.href,mode==='public'?'public':'preview'):null;return target?<a key={index} href={target.href} onClick={event=>openDocument(target.href,event)} target={target.kind==='external'&&target.href.startsWith('https:')?'_blank':undefined} rel={target.kind==='external'?'noopener noreferrer':undefined} download={target.kind==='download'||undefined}>{node}</a>:<Fragment key={index}>{node}</Fragment>;});
 return <LayoutAppearance appearance={appearance} inline><span>{destination?<a href={destination.href} onClick={event=>openDocument(destination.href,event)} target={destination.kind==='external'&&destination.href.startsWith('https:')?'_blank':undefined} rel={destination.kind==='external'?'noopener noreferrer':undefined}>{nodes}</a>:nodes}{documentError&&<span role="alert">{documentError}</span>}</span></LayoutAppearance>;
}
