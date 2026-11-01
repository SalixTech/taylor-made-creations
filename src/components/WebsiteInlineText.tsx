"use client";
import {Fragment} from 'react';
import type {OwnerContent} from '@/owner/model';
import {parseInlineLinks} from '@/owner/inline-links';
import {resolveSiteDestination} from '@/owner/preview-model';
import {useWebsiteDocumentLink} from './useWebsiteDocumentLink';
/** Authored form help only; never used for action labels, answers or validation errors. */
export function WebsiteInlineText({content,text,mode="public"}:{content:OwnerContent; text:string; mode?:"public"|"private-preview"}){
 const {openDocument,documentError}=useWebsiteDocumentLink(mode);
 return <>{parseInlineLinks(text).map((part,index)=>{const destination=part.href?resolveSiteDestination(content,part.href,mode==='public'?'public':'preview'):null;return destination?<a key={index} href={destination.href} onClick={event=>openDocument(destination.href,event)} target={destination.kind==='external'&&destination.href.startsWith('https:')?'_blank':undefined} rel={destination.kind==='external'?'noopener noreferrer':undefined} download={destination.kind==='download'||undefined}>{part.text}</a>:<Fragment key={index}>{part.text}</Fragment>;})}{documentError&&<span role="alert">{documentError}</span>}</>;
}
