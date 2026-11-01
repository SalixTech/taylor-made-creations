"use client";
import type {MouseEvent} from "react";
/** MAIN links use the publication-checked document gateway. Never request beta/private bytes. */
export function useWebsiteDocumentLink(_mode:"public"|"private-preview"|"editor"="public",_failureMessage?:string) {
 void _mode;void _failureMessage;
 const openDocument=(_href:string|undefined,_event:MouseEvent<HTMLElement>)=>{void _href;void _event;};
 return {openDocument,documentError:""};
}
