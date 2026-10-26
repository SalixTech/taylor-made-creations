"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteContentFrame } from "@/components/SiteContent";
import type { OwnerStore } from "./storage";
import type { OwnerContent } from "./model";
import { getPreviewPage, OWNER_PREVIEW_ROOT } from "./preview-model";
import styles from "./OwnerSitePreview.module.css";

type SnapshotState =
  | { status: "loading" }
  | { status: "error"; store: OwnerStore; message: string }
  | { status: "ready"; store: OwnerStore; content: OwnerContent; savedAt: string | null };

export interface OwnerSitePreviewProps {
  slug?: string[];
  store: OwnerStore;
  mode: "cloud";
  userEmail: string;
  onSignOut: () => Promise<void>;
}

/** Uses the gate's authenticated cloud store; never reads a browser-local draft. */
export function OwnerSitePreview({ slug = [], store, mode, userEmail, onSignOut }: OwnerSitePreviewProps) {
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    let request = 0;
    const refresh = async () => {
      const currentRequest = ++request;
      try {
        const workspace = await store.load();
        if (!alive || currentRequest !== request) return;
        // Private preview follows the saved draft. The embedded editor preview renders unsaved edits directly.
        setSnapshot({ status: "ready", store, content: workspace.draft, savedAt: workspace.updatedAt });
      } catch (error) {
        if (alive && currentRequest === request) setSnapshot({ status: "error", store, message: error instanceof Error ? error.message : "The private cloud preview could not be opened. Check your connection and owner access." });
      }
    };
    const unsubscribe = store.subscribe(() => { void refresh(); });
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => { alive = false; request++; unsubscribe(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisibility); };
  }, [retry, store]);

  // Never show a previous session's data while a replacement store is loading.
  const current = snapshot.status === "loading" || snapshot.store === store ? snapshot : { status: "loading" as const };
  const content = current.status === "ready" ? current.content : null;
  const page = content ? getPreviewPage(content, slug) : undefined;
  return <section className={styles.preview} data-owner-preview="true" data-workspace-mode={mode} aria-label="Private owner site preview">
    <div className={styles.toolbar}><div><span className={styles.kicker}>Taylor’s Space · private saved draft</span><strong>View your site · editing is off</strong><p>Browse your private saved draft without editing. This does not open the website to visitors.</p><small className={styles.account}>Signed in as {userEmail}</small></div><div className={styles.toolbarActions}><Link href="/taylor" className={styles.back}>← Taylor’s Space</Link><button type="button" className={styles.back} onClick={() => { void onSignOut(); }}>Sign out</button></div></div>
    {current.status === "loading" && <div className={styles.loading} role="status"><h1>Loading your site preview…</h1><p>Opening your private preview from the cloud. An internet connection is required.</p></div>}
    {current.status === "error" && <div className={styles.loading} role="alert"><h1>Your saved draft could not be opened.</h1><p className={styles.error}>{current.message}</p><p>Your existing saved content has not been replaced.</p><button className="button" type="button" onClick={() => { setSnapshot({ status: "loading" }); setRetry(value => value + 1); }}>Try again</button></div>}
    {current.status === "ready" && content && <>
      <div className={styles.snapshot}>{current.savedAt ? <>Saved draft from <time dateTime={current.savedAt}>{new Date(current.savedAt).toLocaleString()}</time>. Unsaved edits appear in the live preview beside your editor.</> : <>Your starting draft. Nothing has been published from this preview.</>}</div>
      {page ? <SiteContentFrame content={content} page={page} mode="private-preview" /> : <div className="page-shell"><div className="page-intro"><p className="eyebrow">PAGE NOT AVAILABLE</p><h1>This page is not in your preview.</h1><p>It may have been moved to trash, switched off, or given a new address.</p></div><Link href={OWNER_PREVIEW_ROOT} className="button">Back to preview home →</Link></div>}
      <div className={styles.previewFooter}><span>End of private preview · no changes made here</span><Link href="/taylor">Back to Taylor’s Space</Link></div>
    </>}
  </section>;
}
