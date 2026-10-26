"use client";
import Image from "next/image";
import { useState } from "react";
export function Photo({src,alt,className=""}: {src:string;alt:string;className?:string}) {
  const [failed,setFailed] = useState(false);
  const isLogo=className.includes("logo");
  const isHero=src.includes("home-collage");
  return <div className={`photo ${className}`}>{failed ? <div className="photo-fallback"><span aria-hidden="true">✧</span><p>Photo will appear here</p><small>Original Taylor Made Creations work</small></div> : <Image src={src} alt={alt} fill sizes={isLogo?"66px":isHero?"(max-width: 1140px) 95vw, 1084px":"(max-width: 560px) 92vw, (max-width: 1140px) 46vw, 528px"} preload={isLogo||isHero} onError={()=>setFailed(true)} />}</div>;
}
