"use client";
import {WEBSITE_WORKSPACE} from "./website-workspace-config";
import { galleryLinkedFileIds } from "./gallery-folder-links";
import type { PrivateGallery } from "./private-gallery";
import { CommissionFileHub } from "./CommissionFileHub";
import { RefreshButton } from "@/components/RefreshButton";

import Image from "next/image";
import SiteSelect from "@/components/SiteSelect";
import { useContext, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { readCloudFileOrder, saveCloudFileOrder, changeCloudFile, changeCloudFolder, confirmCloudUpload, downloadCloudFile, uploadCloudFile, pendingWebsiteUploads, retryWebsiteUpload, ensureCloudFontsFolder, ensureCloudSystemFolders, readCloudGallery, permanentDeleteCloudFiles, permanentlyDeleteEmptyCloudFolders, readCloudCleanupStatus, createCloudWebsitePhoto } from "./cloud-files-client";
import { CLOUD_FOLDER_LIMIT, CLOUD_UPLOAD_ACCEPT, CLOUD_FONTS_FOLDER_ID, CLOUD_DEFAULTS_FOLDER_ID, CLOUD_COMMISSIONS_FOLDER_ID, CLOUD_GALLERY_FOLDER_ID, isProtectedCloudFolder, isOriginalCloudPhoto, cloudPhotoSource, cloudDocumentSource, folderAncestors, isFolderTrashed, validFileName, type CloudFile, type CloudFolder, type CloudFolders } from "./cloud-files-model";
import { emptyCloudFileOrder, orderedCloudKeys } from "./cloud-file-order";
import { useCloudFiles } from "./use-cloud-files";
import { useOwnerMediaSource } from "./media-client";
import { UploadActivity } from "./PhotoUpload";
import { Dialog } from "./OwnerDialog";
import { TrashIcon } from "./TrashIcon";
import styles from "./CloudFileHub.module.css";
import buttons from "./OwnerButton.module.css";

type Item = { kind: "file"; file: CloudFile } | { kind: "folder"; id: string; folder: CloudFolder; registry: CloudFolders };
type Editing = { mode: "new" | "rename" | "move" | "trash"; target: Item | null; registry: CloudFolders; name: string; parentId: string; newId?: string };
const secondary = `${buttons.button} ${buttons.secondary} ${buttons.compact}`;
const primary = `${buttons.button} ${buttons.primary} ${buttons.compact}`;
const danger = `${buttons.button} ${buttons.danger} ${buttons.compact}`;
const photoAccept = "image/png,image/jpeg,image/webp,image/gif,image/avif";
const titleOf = (item: Item) => item.kind === "file" ? item.file.name : item.folder.name;
export const cloudBytesLabel = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1000))} KB`;
const bytesLabel = cloudBytesLabel;
const dragType = "application/x-tmc-cloud-item";
const itemKey = (item: Item) => item.kind === "file" ? `file:${item.file.id}` : `folder:${item.id}`;
function folderPath(registry: CloudFolders, id: string): string { return ["My files", ...folderAncestors(registry, id).reverse().map(key => registry.folders[key].name)].join(" / "); }

function PrivatePhoto({ file, full = false }: { file: CloudFile; full?: boolean }) {
  const media = useOwnerMediaSource(cloudPhotoSource(file.id));
  return <div className={full ? styles.fullPreview : styles.preview}>{media.error ? <p className={styles.error} role={full ? "alert" : undefined}>{media.error}</p> : media.src ? <Image unoptimized src={media.src} alt={file.name} width={file.width} height={file.height} /> : <span className={styles.photoBuffer} role="status"><span aria-hidden="true" />Loading photo…</span>}</div>;
}
function PhotoThumbnail({ file }: { file: CloudFile }) {
  const target = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!target.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => setNearby(entries.some(entry => entry.isIntersecting)), { rootMargin: "150px" });
    observer.observe(target.current); return () => observer.disconnect();
  }, []);
  return <div ref={target}>{nearby ? <PrivatePhoto file={file} /> : <div className={styles.preview}><span className={styles.status}>Photo preview</span></div>}</div>;
}
function FolderSymbol() { return <svg viewBox="0 0 48 38" width="44" height="36" aria-hidden="true" className={styles.symbol}><path d="M3 10V4h15l5 6h22v25H3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>; }

/** Owner-only File Hub and reusable cloud-photo picker. Uploading never publishes or selects a photo. */
export function CloudFileHub({ selected = "", onSelect, manager = false, onBusyChange, pickerKind = "photo", initialFolder = "root" }: { pickerKind?: "photo" | "document"; initialFolder?: string; selected?: string; onSelect?: (src: string) => void; manager?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const library = useCloudFiles();
  // Beta is a website-only workspace, never an entry to live commission files.
  function websiteFolder(id: string): boolean {
    if (WEBSITE_WORKSPACE !== "beta" || id === "root") return true;
    if (id === CLOUD_COMMISSIONS_FOLDER_ID) return true;
    try { return !folderAncestors(library.folders, id).includes(CLOUD_COMMISSIONS_FOLDER_ID); } catch { return false; }
  }
  const picker = Boolean(onSelect);
  const accessAllowed = useRef(library.ready);
  useEffect(() => { accessAllowed.current = library.ready; }, [library.ready]);
  const inputId = useId();
  const systemFoldersEnsured = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadActivity = useContext(UploadActivity);
  const finishUpload = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const active = useRef<AbortController | null>(null);
  const objectUrls = useRef(new Set<string>());
  const [parentId, setParentId] = useState(initialFolder);
  // Generic photo selection includes nested uploads; explicit specialty folders and PDFs retain their entry point.
  const [allPhotos, setAllPhotos] = useState(picker && pickerKind === "photo" && initialFolder === "root");
  const [savedGallery, setSavedGallery] = useState<PrivateGallery | null>(null);
  const [galleryRead, setGalleryRead] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [trash, setTrash] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">(manager ? "list" : "grid");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<CloudFile | null>(null);
  const [busy, setBusy] = useState(false);
  function updateBusy(value: boolean) {
    if (!alive.current) return;
    onBusyChange?.(value); setBusy(value);
  }
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const cleanupGeneration = useRef(0);
  const [cleanup, setCleanup] = useState<{ available: boolean; automaticCleanupEnabled: boolean; lastRunAt: string | null; message: string } | null>(null);
  const [deleting, setDeleting] = useState<{ files: CloudFile[]; folderIds: string[]; title: string } | null>(null);
  const [order, setOrder] = useState(emptyCloudFileOrder);
  const [orderReady, setOrderReady] = useState(false);
  const [placing, setPlacing] = useState<Item | null>(null);
  const [insertion, setInsertion] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragItem = useRef<Item | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [upload, setUpload] = useState<{ name: string; index: number; count: number; percent: number } | null>(null);
  useEffect(() => {
    alive.current = true;
    const urls = objectUrls.current;
    return () => { alive.current = false; active.current?.abort(); finishUpload.current?.(); finishUpload.current = null; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  }, []);
  useEffect(() => {
    if (library.ready || library.loading) return;
    active.current?.abort();
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    // Clear private dialogs after the access boundary, not during an ordinary refresh.
    void Promise.resolve().then(() => {
      if (!alive.current) return;
      setEditing(null); setViewing(null); setDeleting(null); setCleanup(null); setPlacing(null); setOrder(emptyCloudFileOrder()); setOrderReady(false); setDragging(null); setDropTarget(null); dragItem.current = null; setMessage("");  setError("");
    });
  }, [library.ready, library.loading]);

  useEffect(() => {
    if (!library.ready) { if (!library.loading) systemFoldersEnsured.current = false; return; }
    if (library.loading || systemFoldersEnsured.current) return;
    systemFoldersEnsured.current = true;
    let current = true;
    void ensureCloudSystemFolders().catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "Protected folders could not be prepared."); });
    return () => { current = false; };
  }, [library.ready, library.loading]);
  useEffect(() => {
    if (!library.ready || picker) return;
    let current = true; const generation = ++cleanupGeneration.current;
    void readCloudCleanupStatus().then(status => { if (current && alive.current && generation === cleanupGeneration.current) setCleanup(status); }).catch(() => { if (current && alive.current && generation === cleanupGeneration.current) setCleanup({ available: false, automaticCleanupEnabled: false, lastRunAt: null, message: "Trash cleanup could not be checked. Your files are kept." }); });
    return () => { current = false; };
  }, [library.ready, picker]);

  const currentParent = websiteFolder(parentId) && (parentId === "root" || library.folders.folders[parentId] && !isFolderTrashed(library.folders, parentId)) ? parentId : "root";
  const breadcrumbs = folderAncestors(library.folders, currentParent).reverse();
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => { if (live) setOrderReady(false); });
    if (library.ready && !library.loading && !picker) void readCloudFileOrder(currentParent).then(value => { if (live) { setOrder(value); setOrderReady(true); } }).catch(() => { if (live) setError("File order could not be loaded. Publish the latest Firestore rules and refresh before reordering."); });
    return () => { live = false; };
  }, [currentParent, library.ready, library.loading, picker]);

  useEffect(() => {
    let current = true;
    void Promise.resolve().then(async () => {
      if (!current) return;
      setSavedGallery(null);
      if (!library.ready || library.loading || currentParent !== CLOUD_GALLERY_FOLDER_ID || trash || allPhotos) { setGalleryRead("idle"); return; }
      setGalleryRead("loading");
      try { const gallery = await readCloudGallery(); if (current) { setSavedGallery(gallery); setGalleryRead("ready"); } }
      catch { if (current) setGalleryRead("error"); }
    });
    return () => { current = false; };
  }, [library.ready, library.loading, currentParent, trash, allPhotos]);
  const linkedGalleryIds = library.ready && currentParent === CLOUD_GALLERY_FOLDER_ID && galleryRead === "ready" && !trash && !allPhotos ? galleryLinkedFileIds(savedGallery, library.files, library.folders) : new Set<string>();
  const query = search.trim().toLocaleLowerCase();
  const folderEntries = Object.entries(library.folders.folders).filter(([id, folder]) => {
    const trashed = isFolderTrashed(library.folders, id);
    return websiteFolder(id) && (!picker || id !== CLOUD_COMMISSIONS_FOLDER_ID) && (!picker || !allPhotos) && (trash ? trashed : !trashed && folder.parentId === currentParent) && (!query || folder.name.toLocaleLowerCase().includes(query));
  }).sort((a, b) => Number(b[0] === CLOUD_DEFAULTS_FOLDER_ID) - Number(a[0] === CLOUD_DEFAULTS_FOLDER_ID) || a[1].name.localeCompare(b[1].name));
  const files = library.files.filter(file => {
    const trashed = Boolean(file.trashedAt) || isFolderTrashed(library.folders, file.parentId);
    return file.parentId !== CLOUD_COMMISSIONS_FOLDER_ID && websiteFolder(file.parentId) && (!picker || file.kind === pickerKind && file.status === "ready") && (trash ? trashed : !trashed && (picker && allPhotos || file.parentId === currentParent || linkedGalleryIds.has(file.id))) && (!query || file.name.toLocaleLowerCase().includes(query));
  }).sort((a, b) => a.name.localeCompare(b.name));
  const visibleItems: Item[] = [...folderEntries.map(([id, folder]): Item => ({ kind: "folder", id, folder, registry: library.folders })), ...files.map((file): Item => ({ kind: "file", file }))];
  const sortedKeys = orderedCloudKeys(order, visibleItems.map(itemKey));
  const visibleByKey = new Map(visibleItems.map(item => [itemKey(item), item]));
  const orderedItems = (!trash && !picker ? sortedKeys.map(key => visibleByKey.get(key)!) : visibleItems).sort((a, b) => Number(b.kind === "folder" && b.id === CLOUD_DEFAULTS_FOLDER_ID) - Number(a.kind === "folder" && a.id === CLOUD_DEFAULTS_FOLDER_ID));
  const canReorder = !trash && !picker && !query && orderReady && linkedGalleryIds.size === 0;
  const currentViewing = viewing && library.files.find(file => file.id === viewing.id && file.status === "ready") || null;
  const readyBytes = library.files.filter(file => file.status === "ready").reduce((sum, file) => sum + file.bytes, 0);
  const pendingCount = library.files.filter(file => file.status === "uploading").length;
  const trashFiles = library.files.filter(file => websiteFolder(file.parentId) && (Boolean(file.trashedAt) || isFolderTrashed(library.folders, file.parentId)));
  const unavailable = busy || library.loading || !library.ready;
  const retainedUploads = library.ready ? pendingWebsiteUploads() : [];

  function refreshFiles() {
    setError(""); void library.refresh();
    if (picker || !library.ready) return;
    const generation = ++cleanupGeneration.current;
    void readCloudCleanupStatus().then(status => { if (alive.current && accessAllowed.current && generation === cleanupGeneration.current) setCleanup(status); }).catch(() => { if (alive.current && accessAllowed.current && generation === cleanupGeneration.current) setCleanup({ available: false, automaticCleanupEnabled: false, lastRunAt: null, message: "Trash cleanup could not be checked. Your files are kept." }); });
  }
  function navigate(id: string) { if (!websiteFolder(id)) return; if (operation.current) return; if (editing) { setError("Save or cancel the current change before opening another folder."); return; } setParentId(id); setAllPhotos(false); setTrash(false); setSearch(""); setError(""); }
  function edit(mode: Editing["mode"], target: Item | null = null) {
    if (operation.current || !library.ready || editing) return;
    setError(""); setMessage("");
    setEditing({ mode, target, registry: structuredClone(library.folders), name: target ? titleOf(target) : "New folder", parentId: target ? target.kind === "file" ? target.file.parentId : target.folder.parentId : currentParent, ...(mode === "new" ? { newId: crypto.randomUUID() } : {}) });
  }
  async function run(action: () => Promise<void>, success = "") {
    if (operation.current) return;
    operation.current = true; updateBusy(true); setError(""); setMessage("");
    try { await action(); if (alive.current && success) setMessage(success); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "The change was not confirmed. Refresh before retrying."); }
    finally { operation.current = false; active.current = null; if (alive.current) { updateBusy(false); void library.refresh(); } }
  }
  async function saveEdit() {
    if (!editing) return;
    const captured = editing;
    if ((captured.mode === "rename" || captured.mode === "new") && !validFileName(captured.name.trim())) { setError("Use a name from 1 to 150 characters without slashes or control characters."); return; }
    await run(async () => {
      if (captured.mode === "new") await changeCloudFolder(captured.registry, captured.newId!, { name: captured.name.trim(), parentId: captured.parentId });
      else if (captured.target) {
        const change = captured.mode === "rename" ? { name: captured.name.trim() } : captured.mode === "move" ? { parentId: captured.parentId } : { trashedAt: new Date().toISOString() };
        if (captured.target.kind === "file") await changeCloudFile(captured.target.file, change);
        else await changeCloudFolder(captured.registry, captured.target.id, change);
      }
      if (alive.current) setEditing(null);
    }, captured.mode === "trash" ? cleanup?.automaticCleanupEnabled ? "Moved to Trash. Restore within 30 days. Files still in use are protected from permanent deletion." : "Moved to Trash. You can restore it from Trash." : captured.mode === "new" ? "Folder created." : "Changes saved.");
  }
  async function restore(target: Item) {
    await run(async () => {
      if (target.kind === "file") await changeCloudFile(target.file, { trashedAt: null });
      else await changeCloudFolder(target.registry, target.id, { trashedAt: null });
    }, `“${titleOf(target)}” restored. If its old parent was in Trash, it was restored to My files.`);
  }
  async function download(file: CloudFile) {
    await run(async () => {
      const controller = new AbortController(); active.current = controller;
      const blob = await downloadCloudFile(file, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); objectUrls.current.add(url);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = file.kind === "photo" ? `${file.name.replace(/\.[^.]+$/, "")}.webp` : file.name;
      anchor.rel = "noopener"; document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 30_000);
    }, "File handed to your browser for download. Check your browser’s Downloads list.");
  }
  async function retryUpload(id: string) {
    if (operation.current || !library.ready) return;
    operation.current = true; updateBusy(true); setError(""); setMessage("");
    const controller = new AbortController(); active.current = controller;
    finishUpload.current = uploadActivity.begin(() => controller.abort());
    try {
      await retryWebsiteUpload(id, { signal: controller.signal });
      if (alive.current && !controller.signal.aborted && accessAllowed.current) setMessage("The same upload was confirmed. No new file identity was created.");
    } catch (failure) {
      if (alive.current && !controller.signal.aborted && accessAllowed.current) setError(failure instanceof Error ? failure.message : "This upload is not confirmed. The original attempt is retained.");
    } finally {
      operation.current = false; active.current = null; finishUpload.current?.(); finishUpload.current = null;
      if (alive.current) { updateBusy(false); void library.refresh(); }
    }
  }
  async function uploadFiles(incoming: File[], destination = currentParent) {
    if (!incoming.length || operation.current || !library.ready) return;
    operation.current = true; updateBusy(true); setError(""); setMessage("");
    const controller = new AbortController(); active.current = controller;
    finishUpload.current = uploadActivity.begin(() => controller.abort());
    let completed = 0; const failures: string[] = [];
    try {
      for (const [index, file] of incoming.entries()) {
        if (!alive.current || controller.signal.aborted) break;
        setUpload({ name: file.name, index: index + 1, count: incoming.length, percent: 0 });
        try {
          await uploadCloudFile(file, { parentId: destination, signal: controller.signal, photoOnly: picker && pickerKind === "photo", websiteDocument: picker && pickerKind === "document", preserveOriginal: WEBSITE_WORKSPACE==="beta"?false:!picker, onProgress: percent => { if (alive.current && !controller.signal.aborted) setUpload({ name: file.name, index: index + 1, count: incoming.length, percent }); } });
          if (controller.signal.aborted || !alive.current) break;
          completed++;
        } catch (failure) { if (controller.signal.aborted) break; failures.push(`${file.name}: ${failure instanceof Error ? failure.message : "Upload was not confirmed."}`); }
      }
      if (alive.current) {
        if (completed) setMessage(`${completed} ${completed === 1 ? "file uploaded" : "files uploaded"}.${picker ? pickerKind === "document" ? " Choose Use PDF to set the link." : " Choose Use photo to place an image." : ""}`);
        if (controller.signal.aborted) setError(`Upload stopped. Previously confirmed files are kept. An interrupted file may have finished: ${picker ? "open File Hub" : "refresh"} and check the pending entry. Use Retry same upload if its original bytes are still retained; do not select it again automatically.`);
        else if (failures.length) setError(`${failures.join("\n")}\n${picker ? "Open File Hub" : "Refresh"} to check pending entries. ${WEBSITE_WORKSPACE === "beta" ? "Use Retry same upload for retained attempts. After a page reload, only a read-only check is available; do not select the file again." : "To retry, select the file again; existing bytes are never overwritten."}`);
      }
    } finally {
      operation.current = false; active.current = null; finishUpload.current?.(); finishUpload.current = null;
      if (alive.current) { updateBusy(false); setUpload(null); void library.refresh(); }
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function makeWebsitePhoto(file: CloudFile) {
    await run(async () => {
      const controller = new AbortController(); active.current = controller;
      const finish = uploadActivity.begin(() => controller.abort());
      setUpload({ name: file.name, index: 1, count: 1, percent: 0 });
      try { await createCloudWebsitePhoto(file, { signal: controller.signal, onProgress: percent => { if (alive.current) setUpload({ name: file.name, index: 1, count: 1, percent }); } }); }
      finally { finish(); if (alive.current) setUpload(null); }
    }, "Website photo created. Your original file is unchanged. Choose the new photo in a page or gallery when you are ready.");
  }
  function askDelete(item?: Item) {
    if (unavailable || editing) return;
    setError(""); setMessage("");
    const folderIds = item?.kind === "folder" ? Object.keys(library.folders.folders).filter(id => folderAncestors(library.folders, id).includes(item.id)) : item ? [] : Object.keys(library.folders.folders).filter(id => isFolderTrashed(library.folders, id));
    const candidates = item?.kind === "file" ? [item.file] : item?.kind === "folder" ? trashFiles.filter(file => folderAncestors(library.folders, file.parentId).includes(item.id)) : trashFiles;
    setDeleting({ files: candidates, folderIds, title: item ? `Delete “${titleOf(item)}” permanently?` : "Empty Trash?" });
  }
  async function deleteConfirmed() {
    if (!deleting) return;
    const captured = deleting;
    await run(async () => {
      const result = { deletedIds: [] as string[], blockedIds: [] as string[], failedIds: [] as string[] };
      let deletionIssue = "";
      for (let start = 0; start < captured.files.length; start += 100) {
        if (!alive.current || !accessAllowed.current) return;
        try {
          const batch = await permanentDeleteCloudFiles(captured.files.slice(start, start + 100));
          result.deletedIds.push(...batch.deletedIds); result.blockedIds.push(...batch.blockedIds); result.failedIds.push(...batch.failedIds);
        } catch (failure) {
          deletionIssue = failure instanceof Error ? failure.message : "Deletion could not be confirmed. Refresh before retrying.";
          result.failedIds.push(...captured.files.slice(start).map(file => file.id)); break;
        }
      }
      if (!alive.current || !accessAllowed.current) return;
      if (captured.folderIds.length && !deletionIssue) {
        try { await permanentlyDeleteEmptyCloudFolders(library.folders, captured.folderIds); }
        catch (failure) { deletionIssue = failure instanceof Error ? failure.message : "Some folders could not be removed."; }
      }
      if (!alive.current) return;
      const messages = [`${result.deletedIds.length} ${result.deletedIds.length === 1 ? "file" : "files"} permanently deleted.`];
      if (result.blockedIds.length) messages.push(`${result.blockedIds.length} ${result.blockedIds.length === 1 ? "file kept" : "files kept"}: in use, still uploading, or changed.`);
      if (result.failedIds.length) messages.push(`${result.failedIds.length} ${result.failedIds.length === 1 ? "file could" : "files could"} not be deleted. Refresh and try again.`);
      setMessage(messages.join(" ")); if (deletionIssue) setError(deletionIssue); setDeleting(null);
    });
  }
  async function openFonts() {
    if (operation.current || editing) return;
    await run(async () => { await ensureCloudFontsFolder(); if (alive.current) { setParentId(CLOUD_FONTS_FOLDER_ID); setAllPhotos(false); setTrash(false); setSearch(""); } });
  }
  function clearDrag() { dragItem.current = null; setDragging(null); setDropTarget(null); setInsertion(null); }
  function startDrag(event: DragEvent<HTMLElement>, item: Item) {
    if (unavailable || trash || picker || editing || item.kind === "folder" && isProtectedCloudFolder(item.id)) { event.preventDefault(); return; }
    setPlacing(null); dragItem.current = item; setDragging(itemKey(item));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragType, itemKey(item));
    event.dataTransfer.setDragImage?.(event.currentTarget, 36, 24);
  }
  function canDrop(destination: string) { return canMove(dragItem.current ?? placing, destination); }
  function canMove(item: Item | null, destination: string) {
    if (item?.kind === "file" && linkedGalleryIds.has(item.file.id)) return false;
    if (destination === CLOUD_COMMISSIONS_FOLDER_ID) return false;
    if (destination !== "root" && (!library.folders.folders[destination] || isFolderTrashed(library.folders, destination))) return false;
    if (!item) return true;
    if (item.kind === "folder" && (isProtectedCloudFolder(item.id) || item.registry.revision !== library.folders.revision || !library.folders.folders[item.id] || isFolderTrashed(library.folders, item.id))) return false;
    if (item.kind === "file") {
      const current = library.files.find(file => file.id === item.file.id);
      if (!current || current.trashedAt || current.revision !== item.file.revision || current.parentId !== "root" && !library.folders.folders[current.parentId] || isFolderTrashed(library.folders, current.parentId)) return false;
    }
    if ((item.kind === "file" ? item.file.parentId : item.folder.parentId) === destination) return false;
    return item.kind !== "folder" || !folderAncestors(library.folders, destination).includes(item.id);
  }
  function dragOver(event: DragEvent<HTMLElement>, destination: string) {
    if (unavailable || trash || editing || !canDrop(destination)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "none"; setDropTarget(null); return; }
    if (!dragItem.current && !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = dragItem.current ? "move" : "copy"; setDropTarget(destination);
  }
  function drop(event: DragEvent<HTMLElement>, destination: string) {
    if (!websiteFolder(destination)) { event.preventDefault(); return; }
    event.preventDefault(); event.stopPropagation();
    const item = dragItem.current; const permitted = canDrop(destination);
    clearDrag();
    if (unavailable || trash || editing || !permitted) return;
    if (item) {
      void run(async () => {
        if (item.kind === "file") await changeCloudFile(item.file, { parentId: destination });
        else await changeCloudFolder(item.registry, item.id, { parentId: destination });
      }, `Moved “${titleOf(item)}”.`);
    } else if (event.dataTransfer.files.length) void uploadFiles(Array.from(event.dataTransfer.files), destination);
  }
  async function placeItem(item: Item, target: Item, after = false) {
    if (!canReorder || unavailable || editing || itemKey(item) === itemKey(target)) return;
    clearDrag(); setPlacing(null);
    await run(() => saveCloudFileOrder(currentParent, order, itemKey(item), itemKey(target), after), "File order saved.");
  }
  function cardOver(event: DragEvent<HTMLElement>, item: Item) {
    if (!dragItem.current) { if (item.kind === "folder") dragOver(event, item.id); return; }
    const box = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    // Center of a folder is a move target. Its top and bottom edges reorder instead.
    if (item.kind === "folder" && y > .28 && y < .72) { setInsertion(null); dragOver(event, item.id); return; }
    if (!canReorder || unavailable || editing || itemKey(item) === dragging) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
    setDropTarget(null); setInsertion(`${itemKey(item)}:${y >= .5 ? "after" : "before"}`);
  }
  function cardDrop(event: DragEvent<HTMLElement>, item: Item) {
    const moving = dragItem.current;
    if (moving && insertion?.startsWith(`${itemKey(item)}:`)) {
      event.preventDefault(); event.stopPropagation(); void placeItem(moving, item, insertion.endsWith(":after"));
    } else if (item.kind === "folder") drop(event, item.id);
  }
  function placementControls(item: Item) {
    if (!canReorder || editing || item.kind === "folder") return null;
    return <div className={styles.keyboardPlacement} data-placing={Boolean(placing) || undefined}>
      
      <button type="button" data-owner-button className={secondary} disabled={unavailable} aria-pressed={placing && itemKey(placing) === itemKey(item) || false} onClick={() => setPlacing(placing && itemKey(placing) === itemKey(item) ? null : item)} aria-label={`Keyboard placement: ${titleOf(item)}`}>Keyboard placement</button>
      {placing && itemKey(placing) !== itemKey(item) && <><button type="button" data-owner-button className={secondary} disabled={unavailable} onClick={() => { void placeItem(placing, item); }}>Place before</button><button type="button" data-owner-button className={secondary} disabled={unavailable} onClick={() => { void placeItem(placing, item, true); }}>Place after</button></>}
      
    </div>;
  }
  async function movePlaced(destination: string) {
    if (!websiteFolder(destination)) return;
    const item = placing;
    if (!item || unavailable || editing || trash || !canMove(item, destination)) return;
    setPlacing(null);
    await run(async () => { if (item.kind === "file") await changeCloudFile(item.file, { parentId: destination }); else await changeCloudFolder(item.registry, item.id, { parentId: destination }); }, `Moved “${titleOf(item)}”.`);
  }
  function inlineName() {
    if (!editing || !["new", "rename"].includes(editing.mode)) return null;
    return <div className={styles.inlineName} onClick={event => event.stopPropagation()}>
      <input aria-label={editing.mode === "new" ? "New folder name" : "Rename item"} value={editing.name} maxLength={150} autoFocus disabled={busy}
        onFocus={event => event.currentTarget.select()} onChange={event => setEditing(current => current ? { ...current, name: event.target.value } : null)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void saveEdit(); } if (event.key === "Escape" && !operation.current) { event.preventDefault(); setEditing(null); setError(""); } }} />
      <div className={styles.actions}><button type="button" data-owner-button className={primary} disabled={busy} onClick={() => { void saveEdit(); }}>{busy ? "Saving…" : "Save name"}</button><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Cancel</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>;
  }
  function folderBranch(id: string, depth = 0) {
    const children = Object.entries(library.folders.folders)
      .filter(([key, folder]) => websiteFolder(key) && folder.parentId === id && !isFolderTrashed(library.folders, key))
      .sort((a, b) => Number(b[0] === CLOUD_DEFAULTS_FOLDER_ID) - Number(a[0] === CLOUD_DEFAULTS_FOLDER_ID) || a[1].name.localeCompare(b[1].name));
    const name = id === "root" ? "My files" : library.folders.folders[id].name;
    const expanded = expandedFolders[id] ?? (id === "root" || breadcrumbs.includes(id));
    return <div key={id} className={styles.folderBranch} data-folder-branch={id}>
      <div className={styles.folderRow} data-drop-target={dropTarget === id}
        onDragOver={event => { setInsertion(null); dragOver(event, id); }}
        onDrop={event => drop(event, id)}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}>
        {children.length > 0 ? <button type="button" className={styles.folderExpand} aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`} aria-expanded={expanded}
          onClick={() => setExpandedFolders(current => ({ ...current, [id]: !expanded }))}><span aria-hidden="true">{expanded ? "▾" : "▸"}</span></button> : <span className={styles.folderSpacer} />}
        <button type="button" className={styles.folderLink} disabled={unavailable || Boolean(editing) || Boolean(placing && !canMove(placing, id))}
          aria-label={`${placing ? "Move selected item to" : "Open folder"}: ${name}`}
          aria-current={!trash && currentParent === id ? "location" : undefined}
          title={isProtectedCloudFolder(id) ? `${name} folder (protected)` : folderPath(library.folders, id)}
          onClick={() => { if (placing) void movePlaced(id); else { setExpandedFolders(current => ({ ...current, ...Object.fromEntries(folderAncestors(library.folders, id).map(key => [key, true])), root: true })); navigate(id); } }}>
          <FolderSymbol /><span>{name}</span>{isProtectedCloudFolder(id) && <span aria-label="Protected folder">🔒</span>}
        </button>
      </div>
      {expanded && children.length > 0 && depth < CLOUD_FOLDER_LIMIT && <div className={styles.folderChildren}>{children.map(([key]) => folderBranch(key, depth + 1))}</div>}
    </div>;
  }
  const targets = [{ id: "root", label: "My files" }, ...Object.entries(library.folders.folders).filter(([id]) => websiteFolder(id) && !isFolderTrashed(library.folders, id) && !(editing?.target?.kind === "folder" && folderAncestors(library.folders, id).includes(editing.target.id))).map(([id]) => ({ id, label: folderPath(library.folders, id) })).sort((a, b) => a.label.localeCompare(b.label))];
  if (WEBSITE_WORKSPACE === "beta" && !picker && currentParent === CLOUD_COMMISSIONS_FOLDER_ID && library.ready) return <section className={styles.hub}><h2>Commissions</h2><p className={styles.copy}>This protected folder is reserved for private commission files. Beta is website-only and does not load Taylor’s main Client Hub files.</p><button type="button" data-owner-button className={secondary} onClick={() => navigate(CLOUD_DEFAULTS_FOLDER_ID)}>Back to Website Defaults</button></section>;
  if (WEBSITE_WORKSPACE === "main" && !picker && currentParent === CLOUD_COMMISSIONS_FOLDER_ID && library.ready) return <CommissionFileHub onBack={() => navigate("root")} />;
  return <section className={`${styles.hub} ${manager ? styles.manager : ""}`} aria-label={picker ? pickerKind === "document" ? "Website PDF library" : "Cloud photo library" : "File Hub"} onKeyDown={event => { if (event.key === "Escape") { clearDrag(); setPlacing(null); } }} onDragEnd={clearDrag} onDragOver={event => dragOver(event, currentParent)} onDrop={event => drop(event, currentParent)}>
    <div className={styles.heading}><div>{manager ? <h2>File Hub</h2> : <h3>{pickerKind === "document" ? "Website PDF library" : "Cloud photo library"}</h3>}<small>{picker ? pickerKind === "document" ? "Your uploaded website PDFs" : "Your uploaded photos" : "Your files, organized your way"}</small></div><div className={styles.headingActions}><RefreshButton label="Refresh files" busy={library.loading} disabled={busy} onClick={refreshFiles} />{!picker && <button type="button" data-owner-button className={`${secondary} ${styles.trashView}`} aria-label="Trash" title="View Trash" disabled={busy} aria-pressed={trash} onClick={() => { setTrash(true); setSearch(""); setError(""); }}><TrashIcon /></button>}</div></div>
    {picker && <p className={styles.copy}>{pickerKind === "document" ? "Upload a PDF, then choose Use PDF. PDFs must be no larger than 12 MiB." : "Upload a photo, then choose Use photo."}</p>}
    <div className={styles.toolbar}><div className={styles.tabs} aria-label="File section">{picker && <button type="button" data-owner-button className={secondary} disabled={busy} aria-pressed={allPhotos && !trash} onClick={() => { setParentId("root"); setAllPhotos(true); setTrash(false); setSearch(""); }}>{pickerKind === "document" ? "All PDFs" : "All photos"}</button>}<button type="button" data-owner-button className={secondary} disabled={busy} aria-pressed={!allPhotos && !trash} onClick={() => navigate("root")}>My files</button>{!picker && <button type="button" data-owner-button className={secondary} disabled={unavailable || Boolean(editing)} onClick={() => { void openFonts(); }} aria-pressed={!trash && currentParent === CLOUD_FONTS_FOLDER_ID}>Fonts</button>}</div><div className={styles.tabs} aria-label="File layout"><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => navigate("root")}>My files</button><button type="button" data-owner-button className={secondary} aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Grid</button><button type="button" data-owner-button className={secondary} aria-pressed={layout === "list"} onClick={() => setLayout("list")}>List</button></div></div>
    <div className={manager && !picker ? styles.explorer : undefined}>
    {manager && !picker && library.ready && <details className={styles.folderSidebar} open>
      <summary>Folders</summary>
      <nav aria-label="File hierarchy" onDragOver={event => event.stopPropagation()} onDrop={event => { event.preventDefault(); event.stopPropagation(); clearDrag(); }}>{folderBranch("root")}</nav>
    </details>}
    <div className={styles.filePane}>
    {library.ready && placing && <div className={styles.moveStatus} data-file-move-toolbar><p className={styles.hint} role="status">Moving “{titleOf(placing)}”. Choose a position or destination folder.</p><button type="button" data-owner-button className={secondary} onClick={() => setPlacing(null)}>Cancel move</button></div>}
    {!trash && !allPhotos && breadcrumbs.length > 0 && <nav className={styles.breadcrumbs} aria-label="Folder path">{breadcrumbs.map(id => <span key={id}>/ <button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { if (placing) void movePlaced(id); else navigate(id); }} aria-current={currentParent === id ? "location" : undefined} onDragOver={event => dragOver(event, id)} onDrop={event => drop(event, id)} data-drop-target={dropTarget === id}>{library.folders.folders[id].name}</button></span>)}</nav>}
    {!trash && <div className={styles.tools}>
      <input ref={fileInput} id={inputId} type="file" className={styles.fileInput} accept={picker ? pickerKind === "document" ? ".pdf,application/pdf" : photoAccept : CLOUD_UPLOAD_ACCEPT} multiple disabled={unavailable} aria-label={picker ? pickerKind === "document" ? "Upload website PDFs" : "Upload cloud photos" : "Upload cloud files"} onChange={event => { void uploadFiles(Array.from(event.target.files ?? [])); }} />
      <button type="button" data-owner-button className={primary} disabled={unavailable} onClick={() => fileInput.current?.click()}>Upload</button>
      <button type="button" data-owner-button className={secondary} disabled={unavailable || Boolean(editing) || Object.keys(library.folders.folders).length >= CLOUD_FOLDER_LIMIT} onClick={() => { setAllPhotos(false); edit("new"); }}>New folder</button>
      <label className={styles.search}><input aria-label="Find files in this view" type="search" placeholder={picker && allPhotos ? pickerKind === "document" ? "Find a website PDF…" : "Find a cloud photo…" : "Find in this folder…"} value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>}
    {trash && <label className={styles.search}><input aria-label="Find files in Trash" type="search" placeholder="Find in Trash…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {trash && <div className={styles.trashBar}><div><p className={styles.copy}>{cleanup?.automaticCleanupEnabled ? "Unused files in Trash are automatically deleted after 30 days. Files used by your live site, workspace, or saved drafts are protected." : cleanup?.available ? "Restore items or delete them permanently. Automatic 30-day cleanup is not active yet." : "Restore items from Trash at any time. Permanent cleanup is not enabled on this deployment; Empty Trash is unavailable and no files will be deleted."}</p>{cleanup && !cleanup.available && <p className={styles.hint}>{cleanup.message}</p>}</div><button type="button" data-owner-button className={danger} disabled={unavailable || !cleanup?.available || (!trashFiles.length && !folderEntries.length)} onClick={() => askDelete()}>Empty Trash</button></div>}
    {!trash && <p className={styles.hint}>Drop files here to upload{!picker ? ", drag a card to an edge to reorder, or to the center of a folder to move. Keyboard: Tab to a file’s placement control, then choose its destination" : ""}.</p>}
    {library.ready && upload && <div className={styles.uploadState}><p className={styles.status} role="status">Uploading {upload.index} of {upload.count}: {upload.name} · {upload.percent}%{upload.percent === 100 ? " · confirming saved metadata…" : ""}</p><progress max={100} value={upload.percent} aria-label={`Uploading ${upload.name}`} /><button type="button" data-owner-button className={secondary} onClick={() => active.current?.abort()}>Stop upload</button></div>}
    {library.error && <p className={styles.error} role="alert">{library.error} No local fallback was used.</p>}
    {library.ready && error && !editing && !deleting && <p className={styles.error} role="alert">{error}</p>}
    {library.ready && message && <p className={styles.success} role="status">{message}</p>}
    {retainedUploads.length > 0 && <section aria-label="Unconfirmed uploads" className={styles.copy}><p>The original file is kept in this page for a safe retry. Closing this panel keeps it; reloading the page loses these local bytes, not the pending cloud record.</p>{retainedUploads.map(attempt => <div key={attempt.id}><span>{attempt.name} · {bytesLabel(attempt.bytes)} </span><button type="button" data-owner-button className={secondary} disabled={unavailable || attempt.running} onClick={() => void retryUpload(attempt.id)}>Retry same upload</button></div>)}</section>}
    {galleryRead === "loading" && <p role="status">Reading saved gallery links…</p>}
    {galleryRead === "error" && <p className={styles.error} role="alert">Saved gallery links could not be read. Folder photos are still shown; refresh to try again.</p>}
    {library.loading && <p className={styles.status} role="status">Reading your private Firebase file list…</p>}
    {library.ready && !library.loading && !folderEntries.length && !files.length && editing?.mode !== "new" && <div className={styles.empty}>{query ? "No files match this search." : trash ? "Cloud Trash is empty." : picker ? pickerKind === "document" ? "No website PDFs in this view yet. Your current link remains unchanged." : "No cloud photos in this view yet. Your current image remains selected." : "This folder is empty. Upload a file or create a folder to begin."}</div>}
    {library.ready && <ul className={`${styles.list} ${layout === "grid" ? styles.grid : styles.details}`} onDragOver={event => dragOver(event, currentParent)} onDrop={event => drop(event, currentParent)} data-drop-target={dropTarget === currentParent} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}>
      {editing?.mode === "new" && <li className={`${styles.item} ${styles.creating}`}><div className={styles.preview}><FolderSymbol /></div><div className={styles.identity}>{inlineName()}</div></li>}
      {orderedItems.map(item => {
        if (item.kind === "folder") {
        const { id, folder } = item;
        return <li className={styles.item} key={id} draggable={!unavailable && !trash && !picker && !editing && !isProtectedCloudFolder(id)} onDragStart={event => startDrag(event, item)} onDragOver={event => cardOver(event, item)} onDrop={event => cardDrop(event, item)} data-insert={insertion?.startsWith(`${itemKey(item)}:`) ? insertion.split(":").at(-1) : undefined} data-dragging={dragging === itemKey(item)} data-drop-target={dropTarget === id} onDoubleClick={() => { if (!trash && !editing) navigate(id); }}><div className={styles.preview}><FolderSymbol /></div><div className={styles.identity}>{editing?.mode === "rename" && editing.target && itemKey(editing.target) === itemKey(item) ? inlineName() : <p className={styles.name}>{folder.name}</p>}<small className={styles.meta}>{trash ? folderPath(library.folders, folder.parentId) : isProtectedCloudFolder(id) ? `${folder.name} folder · Protected` : "Folder"}</small></div><div className={styles.actions}>{placementControls(item)}{trash ? <><button type="button" data-owner-button className={secondary} disabled={unavailable} onClick={() => { void restore(item); }}>Restore folder</button>{!isProtectedCloudFolder(id) && <button type="button" data-owner-button className={danger} disabled={unavailable || !cleanup?.available || isProtectedCloudFolder(id)} aria-label={`Delete permanently: ${titleOf(item)}`} onClick={() => askDelete(item)}>Delete</button>}</> : <><button type="button" data-owner-button className={primary} disabled={busy} onClick={() => navigate(id)}>Open</button>{!isProtectedCloudFolder(id) && <><button type="button" data-owner-button className={secondary} aria-label={`Rename: ${titleOf(item)}`} disabled={unavailable || isProtectedCloudFolder(id)} onClick={() => edit("rename", item)}>Rename</button><button type="button" data-owner-button className={secondary} aria-label={`Move: ${titleOf(item)}`} disabled={unavailable || isProtectedCloudFolder(id)} onClick={() => edit("move", item)}>Move</button><button type="button" data-owner-button className={`${secondary} ${buttons.icon}`} aria-label={`Move to Trash: ${titleOf(item)}`} title={`Move to Trash: ${titleOf(item)}`} disabled={unavailable || isProtectedCloudFolder(id)} onClick={() => edit("trash", item)}><TrashIcon /></button></>}</>}</div></li>;
      }
        const file = item.file, linked = linkedGalleryIds.has(file.id), src = file.kind === "photo" ? cloudPhotoSource(file.id) : file.kind === "document" ? cloudDocumentSource(file.id) : "";
        return <li className={styles.item} key={file.id} draggable={!linked && !unavailable && !trash && !picker && !editing} onDragStart={event => startDrag(event, item)} onDragOver={event => cardOver(event, item)} onDrop={event => cardDrop(event, item)} data-insert={insertion?.startsWith(`${itemKey(item)}:`) ? insertion.split(":").at(-1) : undefined} data-dragging={dragging === itemKey(item)} data-selected={Boolean(src) && selected === src}>
          {file.kind === "photo" && file.status === "ready" ? <PhotoThumbnail file={file} /> : <div className={styles.preview}><span className={styles.fileType}>{file.status === "uploading" ? "PENDING" : file.name.split(".").pop()?.toUpperCase().slice(0,8) || "FILE"}</span></div>}
          <div className={styles.identity}>{editing?.mode === "rename" && editing.target && itemKey(editing.target) === itemKey(item) ? inlineName() : <p className={styles.name}>{file.name}</p>}<small className={styles.meta}>{bytesLabel(file.bytes)}{file.kind === "photo" ? ` · ${file.width} × ${file.height} · Website photo` : isOriginalCloudPhoto(file) ? " · Original image" : file.kind === "font" ? " · Font" : file.kind === "document" ? " · Website PDF" : " · Private file"}{file.status === "uploading" ? " · Upload not confirmed" : ""}</small>{linked && <small className={styles.meta}>Linked from {folderPath(library.folders, file.parentId)}</small>}{(allPhotos || trash) && <small className={styles.meta}>{folderPath(library.folders, file.parentId)}</small>}</div>
          <div className={styles.actions}>
            {!linked && placementControls(item)}
            {linked && <button type="button" data-owner-button className={secondary} onClick={() => navigate(file.parentId)}>Open original folder</button>}
            {file.status === "ready" && file.kind === "photo" && <button type="button" data-owner-button className={secondary} aria-label={`View photo: ${file.name}`} onClick={() => setViewing(file)}>View</button>}
            {file.status === "ready" && !picker && !trash && isOriginalCloudPhoto(file) && <button type="button" data-owner-button className={primary} aria-label={`Create optimized website copy: ${file.name}`} disabled={unavailable} onClick={() => { void makeWebsitePhoto(file); }}>Create optimized website copy</button>}
            {file.status === "ready" && !picker && <button type="button" data-owner-button className={secondary} aria-label={`Download file: ${file.name}`} disabled={unavailable} onClick={() => { void download(file); }}>{file.kind === "pdf" ? "Download PDF" : "Download"}</button>}
            {trash ? <><button type="button" data-owner-button className={secondary} disabled={unavailable} onClick={() => { void restore(item); }}>Restore file</button><button type="button" data-owner-button className={danger} disabled={unavailable || !cleanup?.available} aria-label={`Delete permanently: ${titleOf(item)}`} onClick={() => askDelete(item)}>Delete</button></> : <>
              {picker && file.status === "ready" && onSelect && <button type="button" data-owner-button className={primary} disabled={unavailable} aria-pressed={selected === src} aria-label={`Use ${pickerKind === "document" ? "PDF" : "photo"}: ${file.name}`} onClick={() => { if (!unavailable && !operation.current && file.kind === pickerKind && !file.trashedAt) onSelect(src); }}>{selected === src ? "Selected" : pickerKind === "document" ? "Use PDF" : "Use photo"}</button>}
              {file.status === "uploading" && <button type="button" data-owner-button className={secondary} disabled={unavailable} onClick={() => { void run(async () => { await confirmCloudUpload(file); }, "Completed upload verified and added to your cloud files."); }}>Check completed upload</button>}
              {!picker && !linked && <><button type="button" data-owner-button className={secondary} aria-label={`Rename: ${titleOf(item)}`} disabled={unavailable} onClick={() => edit("rename", item)}>Rename</button><button type="button" data-owner-button className={secondary} aria-label={`Move: ${titleOf(item)}`} disabled={unavailable} onClick={() => edit("move", item)}>Move</button><button type="button" data-owner-button className={`${secondary} ${buttons.icon}`} aria-label={`Move to Trash: ${titleOf(item)}`} title={`Move to Trash: ${titleOf(item)}`} disabled={unavailable} onClick={() => edit("trash", item)}><TrashIcon /></button></>}
            </>}
          </div>
        </li>;
      })}
    </ul>}
    {library.ready && <p className={styles.usage} title="File Hub recorded usage, including Trash. Your storage billing total may differ.">{library.files.filter(file => file.status === "ready").length} {library.files.filter(file => file.status === "ready").length === 1 ? "file" : "files"} · {bytesLabel(readyBytes)}, including Trash.{pendingCount ? ` ${pendingCount} pending ${pendingCount === 1 ? "upload" : "uploads"}.` : ""}</p>}
    </div></div>
    {library.ready && deleting && <Dialog title={deleting.title} dismissDisabled={busy} onClose={() => { if (!operation.current) { setDeleting(null); setError(""); } }} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { setDeleting(null); setError(""); }}>Cancel</button><button type="button" data-owner-button className={danger} disabled={busy || !cleanup?.available} onClick={() => { void deleteConfirmed(); }}>{busy ? "Deleting…" : "Delete permanently"}</button></>}><p className={styles.copy}>{deleting.files.length} {deleting.files.length === 1 ? "file" : "files"}{deleting.folderIds.length ? ` in ${deleting.folderIds.length} ${deleting.folderIds.length === 1 ? "folder" : "folders"}` : ""}. This removes the stored files and cannot be undone from File Hub. Files used by your live site, workspace, or saved drafts are protected, as are pending or changed uploads.</p>{error && <p className={styles.error} role="alert">{error}</p>}</Dialog>}
    {library.ready && currentViewing && <Dialog title={currentViewing.name} wide onClose={() => setViewing(null)} actions={<button type="button" data-owner-button className={secondary} onClick={() => setViewing(null)}>Close photo</button>}><PrivatePhoto file={currentViewing} full /><p className={styles.copy}>{currentViewing.width} × {currentViewing.height} · {bytesLabel(currentViewing.bytes)}. Viewing does not change a page or publish this photo.</p></Dialog>}
    {library.ready && editing && editing.mode !== "new" && editing.mode !== "rename" && <Dialog title={`${editing.mode === "move" ? "Move" : "Move to Trash:"} ${editing.target ? titleOf(editing.target) : ""}`} dismissDisabled={busy} onClose={() => { if (!operation.current) { setEditing(null); setError(""); } }} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy || library.loading} aria-busy={busy} onClick={() => { void saveEdit(); }}>{busy ? "Saving…" : editing.mode === "trash" ? "Move to Trash" : "Save change"}</button></>}>
      {editing.mode === "move" && <fieldset className={styles.destination} disabled={busy}><legend>Destination folder</legend><SiteSelect id={`${inputId}-move`} value={editing.parentId} onChange={value => setEditing(current => current ? { ...current, parentId: value } : null)} options={targets.map(target => ({ value: target.id, label: target.label }))} /></fieldset>}
      {editing.mode === "trash" && <p className={styles.copy}>{editing.target?.kind === "folder" ? "The folder and everything inside it will appear in Trash. " : "This file will appear in Trash. "}No bytes are deleted. Existing page and published photo references are kept. You can restore it later. Website files may be used by your live site or saved drafts; changing or permanently deleting them can affect that content. Files still in use remain protected from permanent deletion.</p>}
      {editing.mode === "move" && <p className={styles.copy}>Moving only changes its folder. Stable photo references and existing pages are unchanged.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Dialog>}
  </section>;
}
