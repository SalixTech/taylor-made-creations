"use client";
import { useEffect, useRef, useState } from "react";
import { OwnerImage } from "./OwnerFields";
import { Dialog } from "./OwnerDialog";
import { cloudReferencedAssetIds } from "./cloud-files-model";
import { publicationChanges, selectPublication, applyGallerySelectionToDraft } from "./publication-selection";
import type { OwnerContent, OwnerWorkspace, PublishedOwnerSnapshot, GalleryItem } from "./model";
import type { OwnerStore } from "./storage";
import styles from "./PublicationReview.module.css";
import buttons from "./OwnerButton.module.css";
export function PublicationReview({ content, expectedRevision, galleryOnly = false, galleryLibrary, store, onClose, onPublished, onBusyChange }: { content: OwnerContent; expectedRevision: number; galleryOnly?: boolean; galleryLibrary?: { items: GalleryItem[]; expectedRevision: number }; store: OwnerStore; onClose: () => void; onPublished: (saved: OwnerWorkspace) => void; onBusyChange: (busy: boolean) => void }) {
 const reviewContent = galleryLibrary ? { ...content, gallery:galleryLibrary.items } : content;
 const [live, setLive] = useState<PublishedOwnerSnapshot | null>(null), [loaded, setLoaded] = useState(false), [selection, setSelection] = useState<string[]>([]), [loading, setLoading] = useState(false), [publishing, setPublishing] = useState(false), [error, setError] = useState("");
 const alive = useRef(true), lock = useRef(false), generation = useRef(0), busyCallback = useRef(onBusyChange);
 useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);
 async function refresh(initial = false) {
  if (lock.current) return;
  if (!store.readPublication) { setError("Publication review is not connected in this workspace. Save a private draft instead."); return; }
  const request = ++generation.current; setLoading(true); setLoaded(false); setSelection([]); setError("");
  try { const current = await store.readPublication(); if (!alive.current || request !== generation.current) return; setLive(current); setLoaded(true); const changes = publicationChanges(reviewContent, current?.content ?? null).filter(item => !galleryOnly || item.key.startsWith("gallery:" ) || item.key === "gallery-order"); setSelection(initial ? changes.map(item => item.key) : []); }
  catch (cause) { if (alive.current && request === generation.current) setError(cause instanceof Error ? cause.message : "Could not read the live site. Nothing was published."); }
  finally { if (alive.current && request === generation.current) setLoading(false); }
 }
 useEffect(() => { alive.current = true; let current = true; void Promise.resolve().then(() => { if(current) void refresh(true); }); return () => { current = false; alive.current = false; ++generation.current; }; /* The reviewed content is an immutable snapshot for this mounted dialog. */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
 const allChanges = loaded ? publicationChanges(reviewContent, live?.content ?? null) : [];
 const changes = allChanges.filter(item => !galleryOnly || item.key.startsWith("gallery:") || item.key === "gallery-order");
 let mergedOrder = "", selectionProblem = "";
 try { if (loaded && selection.length) mergedOrder = selectPublication(reviewContent, live?.content ?? null, selection).gallery.map(photo => photo.name).join(", ") || "None"; } catch (cause) { selectionProblem = cause instanceof Error ? cause.message : "Choose the required related changes together."; }
 const assetCount = loaded ? new Set([...cloudReferencedAssetIds(galleryLibrary ? applyGallerySelectionToDraft(content,galleryLibrary.items,selection) : content), ...cloudReferencedAssetIds(live?.content)]).size : 0;
 const firstGalleryBlocked = galleryOnly && loaded && !live;
 async function publish() {
  if (lock.current || loading || !loaded || !store.publishSelected || !selection.length || firstGalleryBlocked || assetCount > 100 || !!selectionProblem) return;
  lock.current = true; setPublishing(true); busyCallback.current(true); setError("");
  try { const saved = await store.publishSelected(content, expectedRevision, live?.revision ?? 0, selection, galleryLibrary); if (alive.current) onPublished(saved); }
  catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : "Publication was not confirmed. Keep your draft open and check before retrying."); setSelection([]); } }
  finally { lock.current = false; busyCallback.current(false); if (alive.current) setPublishing(false); }
 }
 return <Dialog title={galleryOnly ? "Review gallery changes" : "Review changes before publishing"} wide dismissDisabled={publishing} onClose={() => { if (!lock.current) onClose(); }} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={publishing} onClick={onClose}>Keep editing</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.primary}`} disabled={publishing || loading || !loaded || !selection.length || firstGalleryBlocked || assetCount > 100 || !!selectionProblem} onClick={() => void publish()}>{publishing ? "Publishing selected changes…" : `Publish ${selection.length} selected ${selection.length === 1 ? "change" : "changes"}`}</button></>}>
  <p>Only checked changes go live. Unchecked website edits stay saved in your draft. Unchecked library photos stay saved privately in Gallery for next time.</p>
  {loading && <p role="status">Checking the current live website…</p>}
  {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" disabled={publishing || loading} onClick={() => void refresh()}>Refresh review — choose changes again</button><p>If the saved workspace changed, close this review and reload the saved draft first. Your current edits are not discarded here.</p></div>}
  {assetCount > 100 && <p role="alert">This review references {assetCount} website files. Publication recovery currently supports 100 distinct files across the live site and retained draft. Choose fewer new photo changes, or reduce existing website draft references. Unchecked library photos do not count toward this limit. Nothing has been published.</p>}
  {firstGalleryBlocked && <p role="alert">The website has not been published yet. Save this gallery privately, then use the main Publish review to create the first complete website.</p>}
  {loaded && !changes.length && <p>No publishable changes in this {galleryOnly ? "gallery" : "draft"}. Hidden photos and saved listing drafts remain private.</p>}
  {loaded && !!changes.length && <div className={styles.selectionTools}><button type="button" disabled={publishing || firstGalleryBlocked} onClick={() => setSelection(changes.map(change => change.key))}>Select all shown</button><button type="button" disabled={publishing || firstGalleryBlocked} onClick={() => setSelection([])}>Clear selection</button></div>}
  {!!selection.length && selectionProblem && <p role="alert">{selectionProblem}</p>}
  <div className={styles.list}>{changes.map(change => <label className={styles.change} key={change.key}><input type="checkbox" checked={selection.includes(change.key)} disabled={publishing || firstGalleryBlocked} onChange={event => setSelection(previous => event.target.checked ? [...previous, change.key] : previous.filter(key => key !== change.key))} /><span><strong>{change.title}</strong><small>{change.summary}</small><span className={styles.diff}><span><b>Live</b>{change.before}</span><span><b>After publish</b>{change.key === "gallery-order" && mergedOrder ? mergedOrder : change.after}</span></span>
    {change.key.startsWith("gallery:") && <span className={styles.photos}>{[live?.content.gallery.find(photo => photo.id === change.key.slice(8)), reviewContent.gallery.find(photo => photo.id === change.key.slice(8) && photo.visible)].map((photo,index) => photo ? <span key={index}><b>{index === 0 ? "Live image" : "Proposed image"}</b><OwnerImage src={photo.src} alt={photo.alt} /></span> : <span key={index}>{index === 0 ? "Not live" : "Remove from live"}</span>)}</span>}
    {!!change.fields?.length && <details className={styles.fields} onClick={event => event.stopPropagation()}><summary>View {change.fields.length} changed {change.fields.length === 1 ? "field" : "fields"}</summary>{change.fields.map((field,index) => <span className={styles.field} key={`${field.path}-${index}`}><b>{field.path}</b><span><del>{field.before}</del><ins>{field.after}</ins></span></span>)}</details>}
    </span></label>)}</div>
  {loaded && <p className={styles.remainder}>{selection.length} selected · {allChanges.length - selection.length} publishable changes stay private. Library photos are not copied into your website draft unless selected; hidden/private listing drafts are never published.</p>}
  {!live && loaded && !galleryOnly && <p>The first publication needs the website structure, prices and catalog together. Individual photos are still optional.</p>}
 </Dialog>;
}
