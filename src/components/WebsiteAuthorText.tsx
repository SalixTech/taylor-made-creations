"use client";
import {Fragment} from 'react';
import type {OwnerContent,PublicOwnerContent} from '@/owner/model';
import {getInlineTextSource,getInlineTextRuns,inlineTextStyleCSS,inlineTextStyleAttributes} from '@/owner/rich-text';
import {useMobileSiteLayout} from '@/owner/use-mobile-site-layout';
/** Span-only presentation for existing business labels inside their own links.
 * Destinations and underlying metadata are never changed or parsed as HTML. */
export function WebsiteAuthorText({content,fieldId,text,offset=0,viewport}:{content:OwnerContent|PublicOwnerContent;fieldId:string;text:string;offset?:number;viewport?:'desktop'|'mobile'}){
 const mobile=useMobileSiteLayout(content.design?.mobileLayoutEnabled===true,viewport),source=getInlineTextSource(content,fieldId),length=Array.from(text).length;
 if(!source||Array.from(source.text).slice(offset,offset+length).join('')!==text)return <>{text}</>;
 const runs=getInlineTextRuns(content,fieldId,mobile).filter(run=>run.end>offset&&run.start<offset+length);
 return <>{runs.map((run,index)=>{const label=Array.from(run.text).slice(Math.max(0,offset-run.start),Math.min(run.end,offset+length)-run.start).join('');return run.style?<span key={index} {...inlineTextStyleAttributes(run.style)} style={inlineTextStyleCSS(run.style)}>{label}</span>:<Fragment key={index}>{label}</Fragment>;})}</>;
}
