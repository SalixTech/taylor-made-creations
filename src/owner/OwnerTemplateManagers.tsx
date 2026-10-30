"use client";

import { SpadeMark } from "@/client-hub/SpadeMark";
import services from "./TaylorServices.module.css";
import { PencilIcon } from "@/components/PencilIcon";
import { TrashIcon } from "./TrashIcon";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { validateOwnerContent, COMMISSION_STATUSES, getPremadeTags, parsePremadeTags, MAX_PREMADE_TAGS, MAX_PREMADE_TAG_LENGTH, newOwnerId, type GalleryItem, type OwnerContent, type OwnerPremade } from "./model";
import { Card, Dialog, Field, ImagePicker, MoveButtons, OwnerImage, OwnerSelect, Toggle } from "./OwnerFields";
import CommissionForm from "@/components/CommissionForm";
import { OwnerPriceReorderList } from "./OwnerPriceReorderList";
import { reorderById } from "./builder-interactions";
import { OwnerSocialLinksEditor } from "./OwnerSocialLinksEditor";
import { SettingsCardActions, type SettingsCardSaveProps } from "./SettingsCardActions";
import { GalleryPreview } from "./GalleryPreview";
import { PhotoUpload } from "./PhotoUpload";
import { PremadePhotoEditor } from "./PremadePhotoEditor";
import { getPremadeCoverPhoto, getPremadePhotos } from "./premade-gallery";
import ui from "./OwnerPortal.module.css";
import { GlobalUpdateCooldown, ImportBrowserWhimsy, StudioPreferenceStatus, StudioPreferenceRefresh } from "./StudioPreferenceControls";
import { useStudioSettings } from "./use-studio-settings";
import { setOwnerWhimsy, useOwnerWhimsy, useOwnerWhimsyTerms } from "./owner-whimsy";
import { StudioThemeSettings } from "./StudioThemeSettings";
import { WhimsyWordsEditor } from "./WhimsyWordsEditor";
import styles from "./OwnerTemplateManagers.module.css";

type ManagerProps = {
  content: OwnerContent;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  onRemove: (title: string, description: string, remove: () => void) => void;
};
export type PremadesManagerProps = ManagerProps & {
  creationBlocked?: boolean;
  liveShopVisibility: boolean | null;
  liveShopKnown: boolean;
  liveShopReadError: string | null;
  onRetryLiveShop: () => void;
  canUpdateLiveShop: boolean;
  onUpdateLiveShop: () => void;
  canSavePremadeDraft?: boolean;
  onSavePremadeDraft?: (item: OwnerPremade) => Promise<boolean>;
  onDeletePremadeDraft?: (id: string) => Promise<boolean>;
  canDeletePremadeDraft?: boolean;
  canPublishPremade?: boolean;
  onPublishPremade?: (item: OwnerPremade) => void;
};

function move<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
  const from = items.findIndex(item => item.id === id), to = from + direction;
  if (from >= 0 && to >= 0 && to < items.length) [items[from], items[to]] = [items[to], items[from]];
}

/** A template gallery manager: editing photos never requires opening a page canvas. */
export function PhotoGalleryManager({ content, onEdit, onRemove, onSavePhotos }: ManagerProps & { onSavePhotos?: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const [pendingPhoto, setPendingPhoto] = useState<GalleryItem | null>(null);
  const pendingPhotoRef = useRef<GalleryItem | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewWhole, setPreviewWhole] = useState(false);
  const [nameError, setNameError] = useState("");
  const editedPhoto = pendingPhoto ?? content.gallery.find(photo => photo.id === editing);
  function dismissPhoto() { pendingPhotoRef.current = null; setPendingPhoto(null); setEditing(null); setNameError(""); setPreviewId(null); }
  function beginExistingPhoto() { const photo: GalleryItem = { id: newOwnerId("photo"), name: "New photo", src: "/images/home-collage.webp", alt: "Taylor Made Creations fursuit work", width: 1996, height: 960, visible: true }; pendingPhotoRef.current = photo; setPendingPhoto(photo); setEditing(photo.id); setNameError(""); }
  function savePhoto() {
    const staged = pendingPhotoRef.current;
    if (pendingPhoto && !staged) return; // Ignore a second click before React renders.
    if (staged) { if (staged.name.length > 42) return; pendingPhotoRef.current = null; onEdit(draft => { if (!draft.gallery.some(photo => photo.id === staged.id)) draft.gallery.unshift(structuredClone(staged)); }); }
    dismissPhoto(); onSavePhotos?.();
  }
  function editPhoto(id: string, patch: Partial<GalleryItem>) {
    if (pendingPhotoRef.current?.id === id) { const next = { ...pendingPhotoRef.current, ...patch }; pendingPhotoRef.current = next; setPendingPhoto(next); return; }
    onEdit(draft => { const item = draft.gallery.find(photo => photo.id === id); if (item) Object.assign(item, patch); });
  }
  function addPhotos(photos: GalleryItem[], openDetails = false) {
    onEdit(draft => { draft.gallery.unshift(...photos); });
    if (openDetails && photos[0]) setEditing(photos[0].id);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return <div className={styles.manager} data-template-manager="photos">
    <div ref={top} className={styles.galleryTop}>
      <Card title="Add to your gallery" description="New photos go to the top. Drag a card to arrange your photos. Numbers follow the new order unless you set an override.">
        <PhotoUpload multiple gallery label="Upload gallery photos" onUploaded={photos => addPhotos(photos.map(({ media, name }) => ({ id: newOwnerId("photo"), name, src: media.src, alt: name, width: media.width, height: media.height, visible: true })))} />
        <button type="button" className={ui.secondary} onClick={beginExistingPhoto}>Add existing photo</button>
      </Card>
    </div>
    <div className={styles.gallerySummary}><div className={ui.sectionActions}><p className={ui.help}>{content.gallery.length} photos · {content.gallery.filter(photo => photo.visible).length} selected for your next gallery</p><button type="button" className={ui.primary} disabled={!onSavePhotos} onClick={onSavePhotos}>Save photos</button><button type="button" className={ui.secondary} disabled={!content.gallery.some(photo => photo.visible)} onClick={() => { setPreviewWhole(true); setPreviewId(content.gallery.find(photo => photo.visible)!.id); }}>Preview gallery</button></div>
    <div className={styles.galleryNumberActions}><p className={ui.help}>Blank gallery numbers update automatically when you move a photo.</p><button type="button" className={ui.secondary} disabled={!content.gallery.some(photo => photo.displayNumber?.trim())} onClick={() => onRemove("Use automatic gallery numbers?", "This clears manual number overrides. Photos and their order stay unchanged.", () => onEdit(draft => { draft.gallery.forEach(photo => { delete photo.displayNumber; }); }))}>Use automatic numbers</button></div></div>
    <OwnerPriceReorderList items={content.gallery} label="Gallery photos" layout="grid" disabled={editing !== null} itemLabel={photo => photo.name || "photo"} onReorder={(source, target, after) => onEdit(draft => { reorderById(draft.gallery, source, target, after); })} onStep={(id, direction) => onEdit(draft => move(draft.gallery, id, direction))}>{(photo, handle) => <div className={styles.galleryCard} data-gallery-photo-open={editing === photo.id}><Card key={photo.id}>
        <button type="button" className={`${ui.photoThumb} ${styles.galleryThumbnail} ${styles.previewButton}`} aria-label={`Preview photo: ${photo.name}`} onClick={() => { setPreviewWhole(false); setPreviewId(photo.id); }}><OwnerImage src={photo.src} alt={photo.alt} /></button>
        <div className={ui.rowHeading}><h3>{photo.name || "Untitled photo"}</h3><span className={`${ui.badge} ${photo.visible ? ui.badgeVisible : ""}`}>{photo.visible ? "Selected for gallery" : "Hidden from gallery"}</span></div>
        <p className={styles.itemMeta}>Position {content.gallery.findIndex(item => item.id === photo.id) + 1}{photo.displayNumber?.trim() ? ` · Gallery number ${photo.displayNumber}` : " · Automatic gallery number"}</p>
        <div className={styles.photoActions}>
          {handle}
          <button type="button" className={ui.secondary} aria-haspopup="dialog" aria-label={`Edit photo: ${photo.name || "Untitled photo"}`} onClick={() => setEditing(photo.id)}><PencilIcon /></button>
          <button type="button" className={`${ui.secondary} ${styles.trashButton}`} aria-label={`Remove photo: ${photo.name || "Untitled photo"}`} onClick={() => onRemove(`Remove “${photo.name}”?`, "This removes the photo from your website draft. Publish live applies the change to your website. The original file is not deleted.", () => { onEdit(draft => { draft.gallery = draft.gallery.filter(item => item.id !== photo.id); }); if (editing === photo.id) setEditing(null); })}><TrashIcon /></button>
        </div>
      </Card></div>}</OwnerPriceReorderList>
    {editedPhoto && <Dialog title={pendingPhoto ? "Add existing photo" : "Edit photo"} onClose={dismissPhoto} actions={<><button type="button" className={ui.secondary} onClick={dismissPhoto}>{pendingPhoto ? "Cancel" : "Done"}</button>{(pendingPhoto || onSavePhotos) && <button type="button" className={ui.primary} disabled={!!pendingPhoto && pendingPhoto.name.length > 42} onClick={savePhoto}>Save Photo</button>}</>}>
      <div className={styles.galleryPhotoEditor} data-gallery-photo-editor={editedPhoto.id}>
        <div className={styles.galleryEditSummary}>
          <button type="button" className={`${styles.galleryEditPreview} ${styles.previewButton}`} aria-label={`Preview photo: ${editedPhoto.name}`} onClick={() => { setPreviewWhole(false); setPreviewId(editedPhoto.id); }}><OwnerImage src={editedPhoto.src} alt={editedPhoto.alt} /></button>
          <div><Field label="Photo name" value={editedPhoto.name} onChange={value => { setNameError(value.length > 42 ? "Photo names can have up to 42 characters." : ""); editPhoto(editedPhoto.id, { name: value }); }} />
          <Field label="Gallery number (optional)" value={editedPhoto.displayNumber ?? ""} onChange={value => editPhoto(editedPhoto.id, { displayNumber: value })} hint="Leave blank for automatic numbering." /></div>
        </div>
        {nameError && <p className={ui.error} role="alert">{nameError} <button type="button" className={ui.secondary} onClick={() => { editPhoto(editedPhoto.id, { name: editedPhoto.name.slice(0, 42).trim() }); setNameError(""); }}>Shorten name</button></p>}
        <details className={styles.numberHelp}><summary aria-label="About automatic gallery numbering">? Automatic numbering</summary><p>A blank number follows the photo’s position in this gallery. Moving a photo changes its automatic number. A typed number stays fixed until you clear it.</p></details>
        <Toggle label="Show this photo in the gallery" checked={editedPhoto.visible} onChange={value => editPhoto(editedPhoto.id, { visible: value })} />
        <details className={styles.galleryChangePhoto}><summary>Change photo or description</summary><div className={styles.galleryImagePicker}><ImagePicker key={editedPhoto.id} src={editedPhoto.src} alt={editedPhoto.alt} onSource={value => editPhoto(editedPhoto.id, { src: value })} onAlt={value => editPhoto(editedPhoto.id, { alt: value })} /></div></details>
      </div>
    </Dialog>}
    {previewId && <GalleryPreview photos={previewWhole ? content.gallery.filter(photo => photo.visible) : pendingPhoto?.id === previewId ? [pendingPhoto] : content.gallery} initialId={previewId} onClose={() => setPreviewId(null)} />}
    {!content.gallery.length && <Card><div className={ui.empty}><h3>Time to show off your work.</h3><p>Upload your first photos or choose an existing photo above.</p></div></Card>}
  </div>;
}

/** Listings stay editable while the shop is hidden. Only the explicit shop action changes live visibility. */
export function PremadesManager({ creationBlocked = false, content, onEdit, onRemove, liveShopVisibility, liveShopKnown, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, canPublishPremade = false, onPublishPremade, canSavePremadeDraft = false, onSavePremadeDraft, canDeletePremadeDraft = false, onDeletePremadeDraft }: PremadesManagerProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [creating, setCreating] = useState<OwnerPremade | null>(null);
  const creatingRef = useRef<OwnerPremade | null>(null), adding = useRef(false);
  const creationBlockedRef = useRef(creationBlocked);
  useLayoutEffect(() => { creationBlockedRef.current = creationBlocked; }, [creationBlocked]);
  const [createError, setCreateError] = useState("");
  useEffect(() => () => { creatingRef.current = null; }, []);
  function closeCreation(expectedId?: string) {
    if (expectedId && creatingRef.current?.id !== expectedId) return;
    const id = creatingRef.current?.id; creatingRef.current = null; setCreating(null); setCreateError("");
    if (id) setTagInputs(current => { const next = {...current}; delete next[id]; return next; });
  }
  function finishCreation(expectedId: string) {
    const item = creatingRef.current;
    if (!item || item.id !== expectedId || adding.current || creationBlockedRef.current) return;
    const candidate = { ...item, name: item.name.trim(), isDraft: true, visible: false };
    const issues = validateOwnerContent({...content,premades:[candidate]}).issues.filter(issue => issue.path.startsWith("premades"));
    if (issues.length || content.premades.length >= 100) { setCreateError(issues[0]?.message ?? "This workspace already has 100 listings."); return; }
    adding.current = true;
    try {
      onEdit(draft => { if (!draft.premades.some(saved => saved.id === candidate.id)) draft.premades.unshift(structuredClone(candidate)); });
      closeCreation(candidate.id); setEditing(candidate.id); setDraftsOpen(true);
      draftSection.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch { setCreateError("The listing was not added. Your details are still here; try again."); }
    finally { adding.current = false; }
  }
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const savingListing = useRef(false);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const draftSection = useRef<HTMLDetailsElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteLock = useRef(false);
  async function deleteDraft() {
    if (!deleteId || !canDeletePremadeDraft || !onDeletePremadeDraft || deleteLock.current) return;
    const id = deleteId;
    if (!content.premades.some(item => item.id === id && item.isDraft)) { setDeleteError("This draft is no longer available. Refresh its saved state before trying again."); return; }
    deleteLock.current = true; setDeleting(true); setDeleteError("");
    try {
      if (await onDeletePremadeDraft(id)) { setDeleteId(null); if (editing === id) setEditing(null); }
      else setDeleteError("The draft was not deleted. Your listing is still here.");
    } catch { setDeleteError("Could not delete this draft. Please try again."); }
    finally { deleteLock.current = false; setDeleting(false); }
  }

  function editListing(id: string, patch: Partial<OwnerPremade>, staged = false) {
    if (staged) {
      if (creatingRef.current?.id !== id) return; // Late upload/editor callback after Cancel or completion.
      const next = {...creatingRef.current,...patch}; if ("tags" in patch) delete next.badge;
      creatingRef.current = next; setCreating(next); setCreateError(""); return;
    }
    onEdit(draft => { const item = draft.premades.find(listing => listing.id === id); if (item) { Object.assign(item, patch); if ("tags" in patch) delete item.badge; } });
  }
  function addListing() {
    if (creatingRef.current || creationBlocked) return;
    const item: OwnerPremade = { id: newOwnerId("premade"), name: "", image: "/images/home-collage.webp", alt: "Premade fursuit", description: "", price: null, visible: false, isDraft: true, soldChannel: "tmc" };
    creatingRef.current = item; setCreating(item); setCreateError("");
  }
  async function saveListing(item: OwnerPremade) {
    const tags = getPremadeTags(item);
    if (!canSavePremadeDraft || !onSavePremadeDraft || savingListing.current || tags.length > MAX_PREMADE_TAGS || tags.some(tag => tag.length > MAX_PREMADE_TAG_LENGTH)) return;
    savingListing.current = true; setSavingListingId(item.id);
    try {
      if (await onSavePremadeDraft(item)) {
        setEditing(null); setDraftsOpen(false);
        setTagInputs(current => { const next = { ...current }; delete next[item.id]; return next; });
      }
    } finally { savingListing.current = false; setSavingListingId(null); }
  }
  const activeListings = content.premades.filter(item => !item.isDraft);
  const draftListings = content.premades.filter(item => item.isDraft);
  function renderListing(item: OwnerPremade, index: number, group: OwnerPremade[], staged = false) {
    const cover = getPremadeCoverPhoto(item), photos = getPremadePhotos(item);
    const tags = getPremadeTags(item);
    const tagsInvalid = tags.length > MAX_PREMADE_TAGS || tags.some(tag => tag.length > MAX_PREMADE_TAG_LENGTH);
    const listingSaveProps = {
      disabled: !canSavePremadeDraft || !onSavePremadeDraft || tagsInvalid || savingListingId !== null,
      "aria-busy": savingListingId === item.id,
      onClick: () => void saveListing(item),
    };
    const listingSaveLabel = savingListingId === item.id ? "Saving draft…" : "Save as Draft";
    return <div key={item.id} className={`${styles.listingCard} ${staged || editing === item.id ? styles.expandedListing : ""}`}><Card title={item.name || "Untitled premade"} action={staged ? undefined : <div className={styles.listingActions}>
      <div className={styles.listingBadges}>
      <span className={ui.badge}>{item.soldChannel === "third-party" ? "Sold on third party" : item.soldChannel === "con" ? "Sold at con" : "Sold Here"}</span>{tags.map(tag => <span className={`${ui.badge} ${styles.listingTag}`} key={tag}>{tag}</span>)}<span className={`${ui.badge} ${item.visible && !item.isDraft ? ui.badgeVisible : ""}`}>{item.isDraft ? "Private listing draft" : item.visible ? "Shown in draft" : "Hidden in draft"}</span></div>
      <div className={styles.listingControls}>{!item.isDraft && <MoveButtons label={item.name || "listing"} index={index} length={group.length} onMove={direction => onEdit(draft => {
        const other = group[index + direction];
        if (!other) return;
        const from = draft.premades.findIndex(entry => entry.id === item.id), to = draft.premades.findIndex(entry => entry.id === other.id);
        if (from >= 0 && to >= 0) [draft.premades[from], draft.premades[to]] = [draft.premades[to], draft.premades[from]];
      })} />}
      {editing === item.id && <button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button>}

      <button type="button" className={ui.secondary} aria-label={`${editing === item.id ? "Close" : "Edit"} listing: ${item.name}`} title={editing === item.id ? "Close details" : "Edit listing"} aria-expanded={editing === item.id} onClick={() => setEditing(editing === item.id ? null : item.id)}><PencilIcon /></button>{item.isDraft && <button type="button" className={`${ui.secondary} ${styles.trashButton}`} aria-label={`Delete draft: ${item.name}`} title="Delete draft" disabled={!canDeletePremadeDraft || !onDeletePremadeDraft || deleting || savingListingId !== null} onClick={() => { setDeleteId(item.id); setDeleteError(""); }}><TrashIcon /></button>}</div>
    </div>}>
      {staged || editing === item.id ? <>
        <div className={ui.twoCol}><Field label="Listing name" value={item.name} onChange={value => editListing(item.id, { name: value }, staged)} /><Field label="Price (USD)" type="number" step={1} value={item.price ?? ""} onChange={value => editListing(item.id, { price: value === "" ? null : Number(value) }, staged)} hint="Leave blank if you’re not ready to set a price." /></div>
        <Field label="Description" multiline value={item.description} onChange={value => editListing(item.id, { description: value }, staged)} />
        <OwnerSelect label="Where is this sold?" value={item.soldChannel ?? "tmc"} onChange={value => editListing(item.id, { soldChannel: value as OwnerPremade["soldChannel"] }, staged)} options={[{ value: "tmc", label: "Sold Here" }, { value: "third-party", label: "Sold on third party" }, { value: "con", label: "Sold at con" }]} hint="The sales channel is shown as a visible tag on the public listing." />
        {item.soldChannel === "third-party" && <Field label="Third-party listing address" value={item.externalUrl ?? ""} onChange={value => editListing(item.id, { externalUrl: value }, staged)} type="url" hint="A full https:// address. Visitors will leave this site to view the listing." />}
        {item.soldChannel === "con" && <Field label="Convention / venue" value={item.venue ?? ""} onChange={value => editListing(item.id, { venue: value }, staged)} hint="Convention listings are a catalog; displayed items do not guarantee current availability." />}
        {(item.soldChannel ?? "tmc") === "tmc" && <p className={ui.help}>The Sold Here channel uses the on-site cart when catalog mode is off. Checkout and payments are not connected; no purchase is completed here.</p>}
        <Field label="Extra listing badges (optional)" value={tagInputs[item.id] ?? tags.join(", ")} onChange={value => {
          setTagInputs(current => ({ ...current, [item.id]: value }));
          editListing(item.id, { tags: parsePremadeTags(value) }, staged);
        }} hint="Separate tags with commas. Up to 10 unique tags, 80 characters each; repeated tags are combined." />
        {tagsInvalid && <p className={ui.error} role="alert">Use no more than 10 tags, with up to 80 characters in each tag. No tags have been discarded.</p>}
        <PremadePhotoEditor key={item.id} item={item} onChange={patch => editListing(item.id, patch, staged)} />
        {item.isDraft ? <p className={ui.help}>This listing draft stays private, even when you publish the whole website. Choose Publish to store when it is ready.</p> : <Toggle label="Show this listing" checked={item.visible} onChange={value => editListing(item.id, { visible: value })} hint="The shop switch also needs to be on for visitors to see this listing. Preview to review your draft privately." />}
        {!staged && <div className={styles.publishListing}><button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button><button type="button" className={ui.primary} disabled={!canPublishPremade || !onPublishPremade || tagsInvalid} onClick={() => onPublishPremade?.(item)}>Publish to store</button><p className={ui.help}>Save as Draft saves only this card privately, without changing an already-live listing. {canPublishPremade ? "Publish to store publishes only this listing; other draft edits and the shop switch are unchanged." : "Publish the website once and confirm its live shop state before publishing individual listings."}</p></div>}
        {!item.isDraft && <button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${item.name}”?`, "This removes the listing from your draft. Its photos are not deleted, and the live website stays unchanged until you publish.", () => { onEdit(draft => { draft.premades = draft.premades.filter(listing => listing.id !== item.id); }); setEditing(null); })}>Remove listing</button>}
      </> : <>
        <div className={styles.listingSummary}>
          <div className={styles.listingThumbnail}><OwnerImage src={cover.src} alt={cover.alt} style={{ objectFit: item.imageFit ?? "contain", objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%` }} /></div>
          <div><p className={styles.listingPrice}>{item.price === null ? "No price set" : `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</p><p className={ui.help}>{item.description || "Add a description and photos to introduce this character."}</p><p className={styles.itemMeta}>{photos.length} {photos.length === 1 ? "photo" : "photos"} · Cover shown</p></div>
        </div>
        {!item.isDraft && <button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button>}
      </>}

    </Card></div>;
  }
  return <div className={styles.manager} data-template-manager="premades">
    {creating && <Dialog wide title="Add Premade" onClose={() => closeCreation(creating.id)} actions={<><button type="button" className={ui.secondary} onClick={() => closeCreation(creating.id)}>Cancel</button><button type="button" className={ui.primary} disabled={creationBlocked || !creating.name.trim()} onClick={() => finishCreation(creating.id)}>{creationBlocked ? "Finish current upload or action…" : "Add private draft"}</button></>}>
      <p>Nothing is added until you choose Add private draft. You can save the new card privately or publish it later. Uploaded original files remain in File Hub if you cancel; no listing is published.</p>
      {createError && <p role="alert" className={ui.errorNotice}>{createError}</p>}
      {renderListing(creating, 0, [creating], true)}
    </Dialog>}
    {deleteId && <Dialog title="Delete this listing draft?" onClose={() => { if (!deleteLock.current) setDeleteId(null); }} actions={<><button type="button" className={ui.secondary} disabled={deleting} onClick={() => setDeleteId(null)}>Keep draft</button><button type="button" className={ui.danger} disabled={deleting || !canDeletePremadeDraft} onClick={() => void deleteDraft()}>{deleting ? "Deleting…" : "Delete draft"}</button></>}><p>Delete “{content.premades.find(item => item.id === deleteId)?.name || "this draft"}” from Draft listings? Its photos, other drafts, and any already-live version stay unchanged.</p>{deleteError && <p className={ui.error} role="alert">{deleteError}</p>}</Dialog>}

    <div className={styles.premadeSettings}><Card title="Premade shop visibility" description="Keep your listings ready here, even when the shop is hidden.">
      <Toggle label="Show the premade shop" checked={content.site.showPremades} onChange={value => onEdit(draft => { draft.site.showPremades = value; })} hint="This switch changes your draft. Hidden listings and photos stay saved." />
      <p className={ui.help}>Live shop: <strong>{!liveShopKnown ? liveShopReadError ? "Could not check" : "Checking…" : liveShopVisibility === null ? "Not published yet" : liveShopVisibility ? "On" : "Off"}</strong>. Your draft shop is {content.site.showPremades ? "on" : "off"}.</p>
      {!liveShopKnown && <div className={ui.softNote}><p role={liveShopReadError ? "alert" : "status"}>{liveShopReadError || "Checking the published website before offering a live update…"}</p>{liveShopReadError && <button type="button" className={ui.secondary} onClick={onRetryLiveShop}>Check again</button>}</div>}
      {liveShopKnown && content.site.showPremades !== liveShopVisibility && <div className={ui.softNote}>
        <strong>Apply just the shop switch</strong><p>Update live changes only whether the already-published shop is shown. It does not publish new listings, photos, prices, or any other draft edits.</p>
        <button type="button" className={ui.primary} disabled={!canUpdateLiveShop || liveShopVisibility === null} onClick={() => { if (canUpdateLiveShop && liveShopVisibility !== null) onUpdateLiveShop(); }}>Update live</button>
        {liveShopVisibility === null && <p>Publish the website once before using the shop-only update.</p>}
      </div>}
    </Card>
    <Card title="Catalog mode"><Toggle label="Use the storefront as a catalog" checked={content.site.catalogMode ?? false} onChange={value => onEdit(draft => { draft.site.catalogMode = value; })} hint="Hides the cart and shows where each item can be purchased. Save draft keeps this private; Publish live applies this setting. On-site checkout and payments are not connected." /></Card></div>
    <div className={ui.sectionActions}><h2 className={ui.smallTitle}>Your listings</h2><button type="button" className={ui.primary} disabled={creationBlocked || !!creating} onClick={addListing}>Add Premade</button></div>
    {!content.premades.length && <Card><div className={ui.empty}><span aria-hidden="true" className={`${services.inboxIcon} ${services.inboxBrand}`} style={{ marginInline: "auto" }}><SpadeMark /></span><h3>A new character starts here.</h3><p>Add a premade when you’re ready. Keep it hidden while you get the details just right.</p></div></Card>}
    {activeListings.map((item, index) => renderListing(item, index, activeListings))}
    <details ref={draftSection} className={styles.draftListings} open={draftsOpen} onToggle={event => setDraftsOpen(event.currentTarget.open)}>
      <summary>Draft listings <span>{draftListings.length}</span><small>Private cards · open to continue editing</small></summary>
      <p className={ui.help}>These listings are excluded from whole-site publication. Save as Draft confirms a cloud save; editing or adding a card alone does not save it. An older live version stays unchanged until you publish.</p>
      {draftListings.length ? <div className={styles.draftGrid}>{draftListings.map((item, index) => renderListing(item, index, draftListings))}</div> : <p className={ui.help}>No listing drafts yet. Add a premade or save a listing as a draft to keep it here.</p>}
    </details>
  </div>;
}

export function HomePageManager({ content, onEdit }: ManagerProps) {
  return <div className={styles.manager} data-template-manager="home">
    <Card title="Your Home Page" description="Update the words in your existing home-page template.">
      <div className={ui.twoCol}><Field label="Main heading" value={content.home.title} onChange={value => onEdit(draft => { draft.home.title = value; })} />
      <Field label="Caption beneath the main photo" value={content.home.caption} onChange={value => onEdit(draft => { draft.home.caption = value; })} /></div>
    </Card>
    <Card title="The main photo"><ImagePicker src={content.home.image.src} alt={content.home.image.alt} onSource={value => onEdit(draft => { draft.home.image.src = value; })} onAlt={value => onEdit(draft => { draft.home.image.alt = value; })} /></Card>
    <p className={ui.help}>Want to add sections or change the page layout? Use the separate Website builder tab. These settings keep your existing template.</p>
  </div>;
}

export function ContactSettingsManager({ content, onEdit, onRemove, constructionSettings, onEditCommissionForm, ...saveProps }: ManagerProps & SettingsCardSaveProps & { userEmail: string; onSync: () => void; onEditCommissionForm?: () => void; constructionSettings?: import("react").ReactNode }) {
  const [formPreviewOpen,setFormPreviewOpen]=useState(false);
  const whimsy = useOwnerWhimsy(), account = useStudioSettings();
    const [whimsyEditorOpen, setWhimsyEditorOpen] = useState(false);
  const whimsyTerms = useOwnerWhimsyTerms();
  return <div className={styles.manager} data-template-manager="settings">
    <StudioThemeSettings />
    <div className={styles.settingsTop}>
      <Card title="Studio whimsy" description="A little personality in your private Client Hub controls." action={<div className={styles.cardTools}><StudioPreferenceRefresh /><button type="button" className={styles.settingsIcon} aria-label="Edit whimsy words" title="Edit whimsy words" onClick={() => setWhimsyEditorOpen(true)}><PencilIcon /></button></div>}>
        <div className={styles.settingsCardBody}><Toggle label="Whimsy" checked={whimsy} disabled={account.loading || account.busy || account.retry || !account.settings} onChange={enabled => { void setOwnerWhimsy(enabled, account.settings?.revision); }} hint="On uses playful Add Floof, Add Scales and similar labels. Off always uses Add Client." />
        <p className={ui.help}>Six permanent words{whimsyTerms.length ? ` + ${whimsyTerms.length} custom` : ""}. Use the pencil to make the list yours.</p>
        <StudioPreferenceStatus /><ImportBrowserWhimsy /></div>
      </Card>
      {constructionSettings}
    </div>
    {whimsyEditorOpen && <WhimsyWordsEditor onClose={() => setWhimsyEditorOpen(false)} />}
    <Card title="Client update requests"><GlobalUpdateCooldown /></Card>
    <div className={styles.settingsDetails}>
      <Card title="Your business"><Field label="Business name" value={content.site.name} onChange={value => onEdit(draft => { draft.site.name = value; })} hint="Shown in your website’s header and footer after publishing." /><SettingsCardActions card="business" {...saveProps} /></Card>
      <Card title="Commission availability">
        <OwnerSelect label="Commission status" value={content.site.commissionStatus} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} options={COMMISSION_STATUSES.map(status => ({ value: status, label: status }))} hint="Choose Save live on this card to update the website." />
        <Field label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} placeholder="Let people know what to expect…" />
        <SettingsCardActions card="availability" {...saveProps} />
      </Card>
    </div>
    <Card title="Commission form" description="Edit questions, wording, answer options and order. Additional Parts is optional for every suit type except Parts.">
      <Toggle label="Allow quantities for Additional Parts" checked={content.site.additionalPartsQuantities === true} onChange={value => onEdit(draft => { draft.site.additionalPartsQuantities = value; })} hint="Off adds one of each selected extra. On lets clients request multiple extras or spares. Save draft keeps this private; Save live applies this card to the website." />
      <div className={styles.commissionFormActions}><SettingsCardActions card="commission-form" {...saveProps} inline /><div className={styles.commissionFormEditActions}><button type="button" className={ui.secondary} disabled={!onEditCommissionForm} onClick={onEditCommissionForm}>Edit commission form</button><button type="button" className={ui.secondary} onClick={()=>setFormPreviewOpen(true)}>Preview commission form</button></div></div>
    </Card>
    {formPreviewOpen&&<Dialog title="Commission form preview" wide maximizable onClose={()=>setFormPreviewOpen(false)} actions={<button type="button" className={ui.secondary} onClick={()=>setFormPreviewOpen(false)}>Close preview</button>}><p className={ui.help}>Try your unsaved questions and quantity setting here. This preview does not save a request, upload references, contact clients, or take a payment.</p><CommissionForm previewContent={content} additionalPartsQuantities={content.site.additionalPartsQuantities === true} configuration={content.commissionForm??{}}/></Dialog>}
    <details className={styles.contactsSection}><summary>Socials</summary><div className={styles.contactsContent}><OwnerSocialLinksEditor content={content} onEdit={onEdit} onRemove={onRemove} /><SettingsCardActions card="contacts" {...saveProps} /></div></details>

  </div>;
}
