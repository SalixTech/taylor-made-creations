'use client';

import {useEffect,useRef} from 'react';
import terms from '@/data/terms-of-service.json';
import styles from './TermsAgreement.module.css';
import { usePublicSiteState, usePublicOwnerContent } from './PublicSiteContext';
import { currentTermsIdentity, previewTermsIdentity } from "@/content/terms-identity";
import { SiteContentBlocks } from './SiteContent';
import { lockPageScroll } from './modal-scroll-lock';

export default function TermsAgreement({onAgree,onDismiss,previewContent}:{onAgree:()=>void;onDismiss:()=>void;previewContent?:import("@/owner/model").OwnerContent}) {
  const publication = usePublicSiteState();
  const publishedContent = usePublicOwnerContent();
  const content = previewContent ?? publishedContent;
  const page = content?.pages.find(page => page.builtinKey === "terms" && !page.trashedAt && page.availability !== "hidden");
  const canAgree = (previewContent ? previewTermsIdentity(previewContent) : currentTermsIdentity(publication)) !== null;
  const dialogRef=useRef<HTMLDialogElement>(null);
  const headingRef=useRef<HTMLHeadingElement>(null);

  useEffect(()=>{
    const dialog=dialogRef.current;
    const returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const unlock=lockPageScroll();
    try { dialog?.showModal(); } catch(error) { unlock(); throw error; }
    headingRef.current?.focus();
    return ()=>{
      dialog?.close();
      unlock();
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    };
  },[]);

  return <dialog data-terms-dialog ref={dialogRef} className={styles.dialog} aria-labelledby="commission-terms-heading" onCancel={event=>{event.preventDefault();onDismiss();}}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>BEFORE WE BEGIN</p><h2 ref={headingRef} tabIndex={-1} id="commission-terms-heading">{page?.title ?? "Terms of service"}</h2></div>
      <button type="button" className={styles.close} aria-label="Close terms of service" onClick={onDismiss}>×</button>
    </header>
    <div className={styles.content} tabIndex={0} aria-label="Full terms of service">
      <p className={styles.intro}>Please read the terms below before agreeing to continue with your request.</p>
      {!previewContent && publication.status === "error" ? <p role="alert">The current terms could not be loaded. Please try again before agreeing.</p> : content ? (page?.blocks.length ? <SiteContentBlocks content={content} blocks={page.blocks} presentation="terms" mode={previewContent ? "private-preview" : "public"} /> : <p role="alert">The terms are currently unavailable. Please contact Taylor before continuing.</p>) : <>{terms.sections.map(({id,heading,items})=><section key={id} aria-labelledby={`commission-terms-${id}`}>
        <h3 id={`commission-terms-${id}`}>{heading}</h3>
        <ul>{items.map(item=><li key={item}>{item}</li>)}</ul>
      </section>)}
      <p className={styles.agreement}>{terms.agreement}</p></>}
    </div>
    <footer className={styles.actions}>
      <button type="button" className={styles.cancel} onClick={onDismiss}>Cancel</button>
      <button type="button" className={styles.agree} disabled={!canAgree} onClick={() => { if (canAgree) onAgree(); }}>I agree to the terms of service</button>
    </footer>
  </dialog>;
}
