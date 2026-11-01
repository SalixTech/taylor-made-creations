"use client";
import {getTemplateText} from "@/owner/site-design";
import type {ReactNode} from "react";
import Image from "next/image";
import type {OwnerContent} from "@/owner/model";
import {getElementHref} from "@/owner/canvas-hyperlinks";
import {resolveSiteDestination} from "@/owner/preview-model";
import {useWebsiteDocumentLink} from "./useWebsiteDocumentLink";
import styles from "./FooterCredits.module.css";

/** Credit destinations are editable; the supplied brand artwork stays unchanged. */
export function FooterCredits({designCredit="Design by Taylor Made Creations",platformCredit="Platform Built By Salix Technologies LLC",content,mode="public"}:{designCredit?:ReactNode;platformCredit?:ReactNode;content?:OwnerContent;mode?:"public"|"private-preview"|"editor"}={}) {
 const {openDocument,documentError}=useWebsiteDocumentLink(mode,getTemplateText(content,"site.pdfFailureMessage"));
 const credit=(field:string,fallback:string,label:ReactNode,src:string)=>{
  const authored=content?getElementHref(content,`template:${field}`,fallback):fallback;
  const destination=content&&authored?resolveSiteDestination(content,authored,mode==="public"?"public":"preview"):null;
  const href=content?destination?.href:fallback;
  const children=<><Image className={styles.icon} src={src} alt="" aria-hidden="true" width={32} height={32} unoptimized/><span>{label}</span></>;
  return href?<a className={styles.credit} href={href} target={href.startsWith("https:")?"_blank":undefined} rel="noopener noreferrer" onClick={event=>openDocument(href,event)}>{children}</a>:<span className={styles.credit}>{children}</span>;
 };
 return <div className={styles.credits} role="group" aria-label="Website credits">
  {credit("site.designCredit","https://taylormadecreations.dog",designCredit,"/icon.svg")}
  {credit("site.platformCredit","https://salixtechnologies.com",platformCredit,"/images/salix-technologies-logo.png")}
  {documentError&&<span role="alert">{documentError}</span>}
 </div>;
}
