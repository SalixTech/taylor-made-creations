"use client";
import { RefreshButton } from "@/components/RefreshButton";

import { TrashIcon } from "./TrashIcon";
import { CloudFileHub } from "./CloudFileHub";
import { uploadCloudFile } from "./cloud-files-client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useOwnerMediaSource } from "./media-client";
import { usePrivateAssetLibrary } from "./asset-library-client";
import { PhotoUpload } from "./PhotoUpload";
import { Dialog } from "./OwnerDialog";
import { TemporaryPhotoView } from "./TemporaryPhotoView";
import { changeTemporaryPhotoTrash, emptyTemporaryPhotoTrash, isStagedPhoto, type ConfirmedTrashEntry, type StagedPhoto } from "./temporary-photo-client";
import styles from "./AssetLibrary.module.css";
import buttons from "./OwnerButton.module.css";

function StagedThumbnail({ photo }: { photo: StagedPhoto }) {
  const { src, error } = useOwnerMediaSource(photo.src);
  if (!src || error) return <span className={styles.status}>{error || "Loading private photo…"}</span>;
  return <Image unoptimized src={src} alt={photo.name} width={photo.width} height={photo.height} />;
}
/** Keep large reusable libraries cheap without imposing a photo-count limit. */
function LazyStagedThumbnail({ photo }: { photo: StagedPhoto }) {
  const target = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !target.current) return;
    const observer = new IntersectionObserver(entries => { setNearby(entries.some(entry => entry.isIntersecting)); }, { rootMargin: "200px" });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, []);
  return <div className={styles.preview} ref={target}>{nearby ? <StagedThumbnail photo={photo} /> : <span className={styles.status}>Photo preview</span>}</div>;
}
export function LegacyAssetLibrary({ selected = "", onSelect, manager = false }: { selected?: string; onSelect?: (src: string) => void; manager?: boolean }) {
  const library = usePrivateAssetLibrary("/api/taylor/media?trash=1", "photos", isStagedPhoto);
  const [trash, setTrash] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [viewing, setViewing] = useState<StagedPhoto | null>(null);
  const [deleting, setDeleting] = useState<StagedPhoto | null>(null);
  const [emptying, setEmptying] = useState<ConfirmedTrashEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unconfirmedRemoval, setUnconfirmedRemoval] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const sectionButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);
  useEffect(() => { if (message) sectionButton.current?.focus(); }, [message]);
  const visible = library.assets.filter(photo => Boolean(photo.trashedAt) === trash);
  async function change(photo: StagedPhoto, action: "trash" | "restore") {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await changeTemporaryPhotoTrash(photo.id, action, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      library.add(saved);
      setDeleting(null);
      setMessage(action === "trash" ? `“${photo.name}” moved to Trash. Existing page photos are unchanged. You can restore it in Trash.` : `“${photo.name}” restored to the temporary photo library.`);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The library change was not confirmed. Refresh to check its status.");
    } finally { active.current = null; if (alive.current) setBusy(false); }
  }
  async function migrate(photo: StagedPhoto) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(""); setMessage("");
    try {
      const { taylorOwnerSession } = await import("./taylor-services-client");
      const session = await taylorOwnerSession();
      const response = await fetch(photo.src, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", signal: controller.signal });
      if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error("The temporary photo could not be read on this development server.");
      const blob = await response.blob(); session.assertCurrent(); controller.signal.throwIfAborted();
      await uploadCloudFile(new File([blob], `${photo.name}.webp`, { type: "image/webp" }), { signal: controller.signal, photoOnly: true });
      if (alive.current && !controller.signal.aborted) setMessage(`“${photo.name}” copied to shared Firebase Storage. Existing local photo and page references are unchanged. Choose the new cloud photo in your page picker, save, and publish when ready.`);
    } catch (failure) { if (alive.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Copy was not confirmed. Refresh File Hub before retrying."); }
    finally { active.current = null; if (alive.current) setBusy(false); }
  }
  async function emptyTrash() {
    if (active.current || !emptying) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const outcomes = await emptyTemporaryPhotoTrash(emptying, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const removed = outcomes.filter(outcome => outcome.status === "removed").length;
      const already = outcomes.filter(outcome => outcome.status === "already-removed").length;
      const changed = outcomes.filter(outcome => outcome.status === "changed").length;
      const failed = outcomes.filter(outcome => outcome.status === "failed").length;
      setUnconfirmedRemoval(failed > 0);
      setEmptying(null);
      library.refresh();
      setMessage(`${removed} ${removed === 1 ? "entry" : "entries"} permanently removed from the temporary photo library.${already ? ` ${already} already removed.` : ""}${changed ? ` ${changed} ${changed === 1 ? "entry changed since confirmation and was" : "entries changed since confirmation and were"} left untouched.` : ""}${failed ? ` ${failed} could not be removed; refresh and try again.` : ""} All image files remain on the development server to protect existing photos; no disk space was freed.`);
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) {
        setUnconfirmedRemoval(true);
        library.refresh();
        setError(`${failure instanceof Error ? failure.message : "The removal was not confirmed."} Some entries may already have been removed. Refresh to check before retrying; image files are retained.`);
      }
    } finally { active.current = null; if (alive.current) setBusy(false); }
  }
  return <section className={`${styles.library} ${manager ? styles.manager : ""}`} aria-label="Temporary photo library">
    <div className={styles.heading}><h3>Temporary photo library</h3><RefreshButton label="Refresh library" busy={library.loading} disabled={busy} onClick={library.refresh} /></div>
    <p className={styles.description}>{onSelect ? <>Upload first, then choose <strong>Use photo</strong>. Uploading does not replace the current image or publish it. </> : <>Manage reusable temporary photos without changing your pages. </>}Delete moves a library item to recoverable Trash; the image file and any existing page references are kept. This temporary library is on the development server, not connected cloud storage.</p>
    <div className={styles.libraryTools}><div className={styles.tabs} aria-label="Photo library section"><button ref={!trash ? sectionButton : undefined} type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={!trash} onClick={() => { setTrash(false); setError(""); }}>Photos ({library.assets.filter(photo => !photo.trashedAt).length})</button><button ref={trash ? sectionButton : undefined} type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={trash} aria-label={`Trash (${library.assets.filter(photo => photo.trashedAt).length})`} title="View temporary photo Trash" onClick={() => { setTrash(true); setError(""); }}><TrashIcon /><span aria-hidden="true">{library.assets.filter(photo => photo.trashedAt).length}</span></button></div>{manager && <div className={styles.tabs} aria-label="Photo layout"><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Grid</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-pressed={layout === "list"} onClick={() => setLayout("list")}>List</button></div>}</div>
    {!trash && library.available !== false && <PhotoUpload legacy multiple staged libraryOnly={manager} label="Upload to temporary library" onUploaded={photos => { for (const photo of photos) library.add({ ...photo.media, name: photo.name, createdAt: new Date().toISOString(), trashedAt: null }); }} />}
    {trash && <><p className={styles.description}>Restore brings photos back to the chooser. Empty Trash permanently removes library entries, but keeps image files so existing page, gallery and draft photos stay intact. It does not free disk space.</p>{library.available === true && <button type="button" data-owner-button className={`${buttons.button} ${buttons.danger}`} disabled={busy || library.loading || Boolean(library.error) || !visible.length} onClick={() => {
      if (active.current) return;
      setError("");
      setEmptying(visible.map(photo => ({ id: photo.id, trashedAt: photo.trashedAt!, revision: photo.revision ?? 0 })));
    }}>Empty Trash</button>}</>}
    {library.loading && <p className={styles.status} role="status">Loading your private photo library…</p>}
    {library.error && <p className={styles.error} role="alert">{library.error}</p>}
    {error && !deleting && !emptying && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.status} role="status">{message}</p>}
    {!library.loading && !library.error && !visible.length && <p className={styles.status}>{trash ? unconfirmedRemoval ? "No visible Trash entries. A previous removal was not confirmed; refresh to check its status." : "Your temporary-photo Trash is empty." : onSelect ? "No uploaded photos yet. Your current image stays selected." : "No temporary photos yet."}</p>}
    {visible.length > 0 && <ul className={`${styles.list} ${manager && layout === "list" ? styles.detailsList : ""}`}>{visible.map(photo => <li className={styles.item} key={photo.id} data-selected={selected === photo.src}>
      <div className={styles.photoFrame}><LazyStagedThumbnail photo={photo} /><div className={styles.photoActions}><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} aria-label={`View photo: ${photo.name}`} onClick={() => setViewing(photo)}>View</button>{!trash && <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.icon}`} aria-label={`Delete photo: ${photo.name}`} title={`Move photo to Trash: ${photo.name}`} disabled={busy} onClick={() => { setError(""); setDeleting(photo); }}><TrashIcon /></button>}</div></div>
      {!trash && <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.compact}`} disabled={busy} onClick={() => { void migrate(photo); }}>Copy to shared storage</button>}
      <div className={styles.photoIdentity}><p className={styles.name}>{photo.name}</p>{manager && <small className={styles.fileDetail}>{photo.width} × {photo.height} · {Math.max(1, Math.round(photo.bytes / 1024))} KB</small>}</div>
      {trash ? <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${styles.itemAction}`} disabled={busy} aria-label={`Restore photo: ${photo.name}`} onClick={() => { void change(photo, "restore"); }}>Restore</button> : onSelect && <button type="button" data-owner-button className={`${buttons.button} ${buttons.primary} ${styles.itemAction}`} aria-label={`Use photo: ${photo.name}`} aria-pressed={selected === photo.src} onClick={() => onSelect(photo.src)}>{selected === photo.src ? "Selected photo" : "Use photo"}</button>}
    </li>)}</ul>}
    {viewing && library.available !== false && <TemporaryPhotoView photo={viewing} onClose={() => setViewing(null)} />}
    {emptying && library.available !== false && <Dialog title={`Permanently remove ${emptying.length} ${emptying.length === 1 ? "entry" : "entries"}?`} onClose={() => { if (!active.current) { setEmptying(null); setError(""); } }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={busy} onClick={() => { if (!active.current) { setEmptying(null); setError(""); } }}>Cancel</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.danger}`} disabled={busy} aria-busy={busy} onClick={() => { void emptyTrash(); }}>{busy ? "Emptying Trash…" : `Permanently remove ${emptying.length} ${emptying.length === 1 ? "entry" : "entries"}`}</button></>}>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Dialog>}
    {deleting && library.available !== false && <Dialog title="Move photo to Trash?" onClose={() => { if (!busy) { setDeleting(null); setError(""); } }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} disabled={busy} onClick={() => { setDeleting(null); setError(""); }}>Cancel</button><button type="button" data-owner-button className={`${buttons.button} ${buttons.danger}`} disabled={busy} aria-busy={busy} onClick={() => { void change(deleting, "trash"); }}>{busy ? "Moving to Trash…" : "Move to Trash"}</button></>}>
      <p>“{deleting.name}” will be hidden from the temporary photo chooser. The image file is kept, and photos already used by drafts or published pages stay in place. No gallery entries are removed. You can bring it back from Trash.</p>{error && <p className={styles.error} role="alert">{error}</p>}
    </Dialog>}
  </section>;
}

/** The current chooser uses cloud storage. Legacy files are not deleted or rewritten. */
export function CloudFileDialog({onClose,...props}: {selected?:string;onSelect?:(src:string)=>void;manager?:boolean;onClose:()=>void}) {
  const busyRef=useRef(false),[busy,setBusy]=useState(false);
  const close=()=>{if(!busyRef.current)onClose();};
  return <div onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation();}}><Dialog wide maximizable title={props.manager?"File Hub":"Cloud photo library"} dismissDisabled={busy} onClose={close} actions={null}><CloudFileHub {...props} onBusyChange={value=>{busyRef.current=value;setBusy(value);}} onSelect={props.onSelect?src=>{if(busyRef.current)return;props.onSelect?.(src);onClose();}:undefined}/></Dialog></div>;
}
export function AssetLibrary(props: { selected?: string; onSelect?: (src: string) => void; manager?: boolean }) {
  const [open,setOpen]=useState(false);
  return props.manager ? <CloudFileHub {...props} /> : <><button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary}`} aria-haspopup="dialog" onClick={()=>setOpen(true)}>Open photo library</button>{open&&<CloudFileDialog {...props} onClose={()=>setOpen(false)}/>}</>;
}
