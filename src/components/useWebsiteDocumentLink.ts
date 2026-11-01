"use client";
import {useState,type MouseEvent} from "react";
import {isWebsiteDocumentHref} from "@/owner/model";
import {WEBSITE_WORKSPACE} from "@/owner/website-workspace-config";
/** Use the authenticated document transport in private/beta views, never an opaque storage URL. */
export function useWebsiteDocumentLink(mode:"public"|"private-preview"|"editor"="public",failureMessage="The website PDF could not be opened. Check your owner session and try again.") {
 const [documentError,setDocumentError]=useState("");
 const openDocument=(href:string|undefined,event:MouseEvent<HTMLElement>)=>{
  if(!href||!isWebsiteDocumentHref(href)||(mode==="public"&&WEBSITE_WORKSPACE!=="beta"))return;
  event.preventDefault();
  if(mode==="editor")return;
  setDocumentError("");
  void import("@/owner/website-document-client").then(({downloadWebsiteDocument})=>downloadWebsiteDocument(href)).catch(()=>setDocumentError(failureMessage));
 };
 return {openDocument,documentError};
}
