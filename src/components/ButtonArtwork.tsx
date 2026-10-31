"use client";
import{useOwnerMediaSource}from'@/owner/media-client';
import{isSafeButtonArtwork}from'@/owner/model';
/** Raster artwork is decorative: the link retains its separate accessible name. */
export function ButtonArtwork({src}:{src:string}){
 const media=useOwnerMediaSource(src);if(!isSafeButtonArtwork(src)||media.error||!media.src)return null;
 // Native intrinsic sizing preserves the uploaded artwork's actual aspect ratio.
 // eslint-disable-next-line @next/next/no-img-element
 return <span data-button-artwork style={{display:'inline-block',maxWidth:'100%'}}><img src={media.src} alt="" style={{display:'block',maxWidth:'100%',height:'auto'}}/></span>;
}
