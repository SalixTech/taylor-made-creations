"use client";
import{taylorOwnerSession}from'./taylor-services-client';
import{CLOUD_DOCUMENT_SOURCE,CLOUD_DOCUMENT_MAX_BYTES}from'./cloud-files-model';
import{assertWebsitePdfBytes}from'./website-pdf';
export async function downloadWebsiteDocument(href:string){const match=href.match(CLOUD_DOCUMENT_SOURCE);if(!match)throw Error('Choose a valid website PDF.');const session=await taylorOwnerSession();const{readBetaWebsiteAsset}=await import('./beta-assets-client');const blob=await readBetaWebsiteAsset(match[1],session);session.assertCurrent();if(blob.size>CLOUD_DOCUMENT_MAX_BYTES||blob.type!=='application/pdf')throw Error('The PDF did not pass its download checks.');assertWebsitePdfBytes(new Uint8Array(await blob.arrayBuffer()));session.assertCurrent();const url=URL.createObjectURL(blob);try{const anchor=document.createElement('a');anchor.href=url;anchor.download=`${match[1]}.pdf`;anchor.rel='noopener';anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}}
