"use client";

import {useWebsiteDocumentLink} from "./useWebsiteDocumentLink";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { isSafeImageSource } from "@/owner/model";
import { getElementAppearanceAttributes, getElementAppearanceStyle, getImageAppearanceStyle, getImageFrameStyle, type ElementAppearance } from "@/owner/appearance";
import { useOwnerMediaSource } from "@/owner/media-client";
import styles from "./Brand.module.css";

function BrandLogo({ src, alt, privateMedia, appearance, editable = false }: { src: string; alt: string; privateMedia: boolean; appearance?: ElementAppearance; editable?: boolean }) {
  const media = useOwnerMediaSource(src, privateMedia);
  const [failed, setFailed] = useState(false);
  const available = isSafeImageSource(src) && media.src && !media.error && !failed;
  return <div data-owner-image-frame className="photo logo" {...(editable ? { "data-owner-edit": "template-image:site.logo", tabIndex: 0, "aria-label": "Edit site logo" } : {})} {...getElementAppearanceAttributes(appearance)} style={{ ...getElementAppearanceStyle(appearance), ...getImageFrameStyle(appearance) }}>{available ? <Image src={media.src!} alt={alt} fill unoptimized sizes="86px" style={getImageAppearanceStyle(appearance)} onError={() => setFailed(true)} /> : <div className="photo-fallback" role="img" aria-label={alt || "Brand logo unavailable"}><span aria-hidden="true">♠</span></div>}</div>;
}

export function Brand({ footer = false, href = "/", name = "Taylor Made Creations", logo = { src: "/images/logo.png", alt: "" }, privateMedia = false, appearance, logoAppearance, nameNode, pdfFailureMessage, editable = false }: { footer?: boolean; href?: string; name?: string; logo?: { src: string; alt: string }; privateMedia?: boolean; appearance?: ElementAppearance; logoAppearance?: ElementAppearance; editable?: boolean; nameNode?:ReactNode;pdfFailureMessage?:string }) {
  const {openDocument,documentError}=useWebsiteDocumentLink(editable?"editor":privateMedia?"private-preview":"public",pdfFailureMessage);
  // The supplied artwork includes the business name in both site locations.
  // Custom names/logos stay on their existing editable, media-aware path.
  const defaultWordmark = name === "Taylor Made Creations" && (logo.src === "/images/logo.png" || logo.src === "/images/tmc-wordmark.png");
  if (defaultWordmark) return <><Link onClick={event=>openDocument(href,event)} {...getElementAppearanceAttributes(appearance)} style={getElementAppearanceStyle(appearance)} href={href} className={`brand${footer ? " footer-brand" : ""} ${styles.wordmarkBrand}`} aria-label={`${name} home`}>
    <div data-owner-image-frame className={styles.wordmarkPlate} {...(editable ? { "data-owner-edit": "template-image:site.logo", tabIndex: 0, "aria-label": "Edit site logo" } : {})} {...getElementAppearanceAttributes(logoAppearance)} style={{ ...getElementAppearanceStyle(logoAppearance), ...getImageFrameStyle(logoAppearance) }}>
      <Image className={styles.wordmarkImage} src="/images/tmc-wordmark.png" width={1835} height={512} alt={logo.alt} unoptimized style={{ ...getImageAppearanceStyle(logoAppearance), ...(logoAppearance?.imageHeightPx !== undefined ? { height: "100%" } : {}) }} />
    </div>
  </Link>{documentError&&<span role="alert">{documentError}</span>}</>;
  return <><Link onClick={event=>openDocument(href,event)} {...getElementAppearanceAttributes(appearance)} style={getElementAppearanceStyle(appearance)} href={href} className={`brand${footer ? " footer-brand" : ""}`} aria-label={`${name} home`}><BrandLogo key={`${logo.src}-${privateMedia}`} src={logo.src} alt={logo.alt} privateMedia={privateMedia} appearance={logoAppearance} editable={editable} /><span {...(editable ? { "data-owner-edit": "site", tabIndex: 0, "aria-label": "Edit business name" } : {})}>{nameNode ?? (name === "Taylor Made Creations" ? <>Taylor Made<br />Creations</> : name)}</span></Link>{documentError&&<span role="alert">{documentError}</span>}</>;
}

/** Reuse the actual brand artwork for empty storefronts, never a substitute star. */
export function BrandMark({ logo = { src: "/images/logo.png", alt: "" }, privateMedia = false }: { logo?: { src: string; alt: string }; privateMedia?: boolean }) {
  return <div className="brand-mark" aria-hidden="true"><BrandLogo src={logo.src} alt="" privateMedia={privateMedia} /></div>;
}

/** Supplied circle-spade mark, tinted for the current light/dark theme. */
export function SpadeMark(){return <span className="tmc-spade-mark" aria-hidden="true" />;}
