"use client";

import { useRef, useState } from "react";
import { COMMISSION_STATUSES, getPremadeTags, parsePremadeTags, MAX_PREMADE_TAGS, MAX_PREMADE_TAG_LENGTH, newOwnerId, type GalleryItem, type OwnerContent, type OwnerPremade } from "./model";
import { Card, Dialog, Field, Icon, ImagePicker, MoveButtons, OwnerImage, OwnerSelect, Toggle } from "./OwnerFields";
import CommissionForm from "@/components/CommissionForm";
import { OwnerPriceReorderList } from "./OwnerPriceReorderList";
import { reorderById } from "./builder-interactions";
import { OwnerSocialLinksEditor } from "./OwnerSocialLinksEditor";
import { SettingsCardActions, type SettingsCardSaveProps } from "./SettingsCardActions";
import { PhotoUpload } from "./PhotoUpload";
import { PremadePhotoEditor } from "./PremadePhotoEditor";
import { getPremadeCoverPhoto, getPremadePhotos } from "./premade-gallery";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerTemplateManagers.module.css";

type ManagerProps = {
  content: OwnerContent;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  onRemove: (title: string, description: string, remove: () => void) => void;
};
export type PremadesManagerProps = ManagerProps & {
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
  const editedPhoto = content.gallery.find(photo => photo.id === editing);
  function editPhoto(id: string, patch: Partial<GalleryItem>) {
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
        <PhotoUpload multiple label="Upload gallery photos" onUploaded={photos => addPhotos(photos.map(({ media, name }) => ({ id: newOwnerId("photo"), name, src: media.src, alt: name, width: media.width, height: media.height, visible: true })))} />
        <button type="button" className={ui.secondary} onClick={() => addPhotos([{ id: newOwnerId("photo"), name: "New photo", src: "/images/home-collage.webp", alt: "Taylor Made Creations fursuit work", width: 1996, height: 960, visible: true }], true)}>＋ Add an existing photo</button>
      </Card>
    </div>
    <div className={ui.sectionActions}><p className={ui.help}>{content.gallery.length} photos · {content.gallery.filter(photo => photo.visible).length} shown in your draft gallery</p><button type="button" className={ui.primary} disabled={!onSavePhotos} onClick={onSavePhotos}>Save photos</button></div>
    <div className={styles.galleryNumberActions}><p className={ui.help}>Blank gallery numbers update automatically when you move a photo.</p><button type="button" className={ui.secondary} disabled={!content.gallery.some(photo => photo.displayNumber?.trim())} onClick={() => onRemove("Use automatic gallery numbers?", "This clears manual number overrides. Photos and their order stay unchanged.", () => onEdit(draft => { draft.gallery.forEach(photo => { delete photo.displayNumber; }); }))}>Use automatic numbers</button></div>
    <OwnerPriceReorderList items={content.gallery} label="Gallery photos" layout="grid" disabled={editing !== null} itemLabel={photo => photo.name || "photo"} onReorder={(source, target, after) => onEdit(draft => { reorderById(draft.gallery, source, target, after); })} onStep={(id, direction) => onEdit(draft => move(draft.gallery, id, direction))}>{(photo, handle) => <div className={styles.galleryCard} data-gallery-photo-open={editing === photo.id}><Card key={photo.id}>
        <div className={`${ui.photoThumb} ${styles.galleryThumbnail}`}><OwnerImage src={photo.src} alt={photo.alt} /></div>
        <div className={ui.rowHeading}><h3>{photo.name || "Untitled photo"}</h3><span className={`${ui.badge} ${photo.visible ? ui.badgeVisible : ""}`}>{photo.visible ? "In draft gallery" : "Hidden in draft"}</span></div>
        <p className={styles.itemMeta}>Position {content.gallery.findIndex(item => item.id === photo.id) + 1}{photo.displayNumber?.trim() ? ` · Gallery number ${photo.displayNumber}` : " · Automatic gallery number"}</p>
        <div className={ui.rowEnd}>
          {handle}
          <button type="button" className={ui.secondary} aria-haspopup="dialog" onClick={() => setEditing(photo.id)}>Edit photo</button>
          <button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${photo.name}”?`, "This removes the photo from your gallery draft. It does not delete the original image file or change the live website.", () => { onEdit(draft => { draft.gallery = draft.gallery.filter(item => item.id !== photo.id); }); if (editing === photo.id) setEditing(null); })}>Remove</button>
        </div>
      </Card></div>}</OwnerPriceReorderList>
    {editedPhoto && <Dialog title="Edit photo" onClose={() => setEditing(null)} actions={<><button type="button" className={ui.secondary} onClick={() => setEditing(null)}>Done</button>{onSavePhotos && <button type="button" className={ui.primary} onClick={() => { setEditing(null); onSavePhotos(); }}>Save Photo</button>}</>}>
      <div className={styles.galleryPhotoEditor} data-gallery-photo-editor={editedPhoto.id}>
        <div className={styles.galleryEditSummary}>
          <div className={styles.galleryEditPreview}><OwnerImage src={editedPhoto.src} alt={editedPhoto.alt} /></div>
          <div><Field label="Photo name" value={editedPhoto.name} onChange={value => editPhoto(editedPhoto.id, { name: value })} />
          <Field label="Gallery number (optional)" value={editedPhoto.displayNumber ?? ""} onChange={value => editPhoto(editedPhoto.id, { displayNumber: value })} hint="Leave blank for automatic numbering." /></div>
        </div>
        <Toggle label="Show this photo in the gallery" checked={editedPhoto.visible} onChange={value => editPhoto(editedPhoto.id, { visible: value })} />
        <details className={styles.galleryChangePhoto}><summary>Change photo or description</summary><div className={styles.galleryImagePicker}><ImagePicker key={editedPhoto.id} src={editedPhoto.src} alt={editedPhoto.alt} onSource={value => editPhoto(editedPhoto.id, { src: value })} onAlt={value => editPhoto(editedPhoto.id, { alt: value })} /></div></details>
      </div>
    </Dialog>}
    {!content.gallery.length && <Card><div className={ui.empty}><h3>Time to show off your work.</h3><p>Upload your first photos or choose an existing photo above.</p></div></Card>}
  </div>;
}

/** Listings stay editable while the shop is hidden. Only the explicit shop action changes live visibility. */
export function PremadesManager({ content, onEdit, onRemove, liveShopVisibility, liveShopKnown, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, canPublishPremade = false, onPublishPremade, canSavePremadeDraft = false, onSavePremadeDraft, canDeletePremadeDraft = false, onDeletePremadeDraft }: PremadesManagerProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
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

  function editListing(id: string, patch: Partial<OwnerPremade>) {
    onEdit(draft => { const item = draft.premades.find(listing => listing.id === id); if (item) Object.assign(item, patch); });
  }
  function addListing() {
    const id = newOwnerId("premade");
    onEdit(draft => { draft.premades.unshift({ id, name: "New premade", image: "/images/home-collage.webp", alt: "Premade fursuit", description: "", price: null, visible: false, isDraft: true, soldChannel: "tmc" }); });
    setEditing(id); setDraftsOpen(true); draftSection.current?.scrollIntoView({ block: "start", behavior: "smooth" });
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
  function renderListing(item: OwnerPremade, index: number, group: OwnerPremade[]) {
    const cover = getPremadeCoverPhoto(item), photos = getPremadePhotos(item);
    const tags = getPremadeTags(item);
    const tagsInvalid = tags.length > MAX_PREMADE_TAGS || tags.some(tag => tag.length > MAX_PREMADE_TAG_LENGTH);
    const listingSaveProps = {
      disabled: !canSavePremadeDraft || !onSavePremadeDraft || tagsInvalid || savingListingId !== null,
      "aria-busy": savingListingId === item.id,
      onClick: () => void saveListing(item),
    };
    const listingSaveLabel = savingListingId === item.id ? "Saving draft…" : "Save as Draft";
    return <div key={item.id} className={`${styles.listingCard} ${editing === item.id ? styles.expandedListing : ""}`}><Card title={item.name || "Untitled premade"} action={<div className={styles.listingActions}>
      <div className={styles.listingBadges}>
      <span className={ui.badge}>{item.soldChannel === "third-party" ? "Sold on third party" : item.soldChannel === "con" ? "Sold at con" : "Sold Here"}</span>{tags.map(tag => <span className={`${ui.badge} ${styles.listingTag}`} key={tag}>{tag}</span>)}<span className={`${ui.badge} ${item.visible && !item.isDraft ? ui.badgeVisible : ""}`}>{item.isDraft ? "Private listing draft" : item.visible ? "Shown in draft" : "Hidden in draft"}</span></div>
      <div className={styles.listingControls}>{!item.isDraft && <MoveButtons label={item.name || "listing"} index={index} length={group.length} onMove={direction => onEdit(draft => {
        const other = group[index + direction];
        if (!other) return;
        const from = draft.premades.findIndex(entry => entry.id === item.id), to = draft.premades.findIndex(entry => entry.id === other.id);
        if (from >= 0 && to >= 0) [draft.premades[from], draft.premades[to]] = [draft.premades[to], draft.premades[from]];
      })} />}
      {editing === item.id && <button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button>}

      <button type="button" className={ui.secondary} aria-expanded={editing === item.id} onClick={() => setEditing(editing === item.id ? null : item.id)}>{editing === item.id ? "Close details" : "Edit listing"}</button></div>
    </div>}>
      {editing === item.id ? <>
        <div className={ui.twoCol}><Field label="Listing name" value={item.name} onChange={value => editListing(item.id, { name: value })} /><Field label="Price (USD, optional)" type="number" value={item.price ?? ""} onChange={value => editListing(item.id, { price: value === "" ? null : Number(value) })} hint="Leave blank if you’re not ready to set a price." /></div>
        <Field label="Description" multiline value={item.description} onChange={value => editListing(item.id, { description: value })} />
        <OwnerSelect label="Where is this sold?" value={item.soldChannel ?? "tmc"} onChange={value => editListing(item.id, { soldChannel: value as OwnerPremade["soldChannel"] })} options={[{ value: "tmc", label: "Sold Here" }, { value: "third-party", label: "Sold on third party" }, { value: "con", label: "Sold at con" }]} hint="The sales channel is shown as a visible tag on the public listing." />
        {item.soldChannel === "third-party" && <Field label="Third-party listing address" value={item.externalUrl ?? ""} onChange={value => editListing(item.id, { externalUrl: value })} type="url" hint="A full https:// address. Visitors will leave this site to view the listing." />}
        {item.soldChannel === "con" && <Field label="Convention / venue" value={item.venue ?? ""} onChange={value => editListing(item.id, { venue: value })} hint="Convention listings are a catalog; displayed items do not guarantee current availability." />}
        {(item.soldChannel ?? "tmc") === "tmc" && <p className={ui.help}>The Sold Here channel uses the on-site cart when catalog mode is off. Checkout and payments are not connected; no purchase is completed here.</p>}
        <Field label="Extra listing badges (optional)" value={tagInputs[item.id] ?? tags.join(", ")} onChange={value => {
          setTagInputs(current => ({ ...current, [item.id]: value }));
          onEdit(draft => { const target = draft.premades.find(entry => entry.id === item.id); if (target) { target.tags = parsePremadeTags(value); delete target.badge; } });
        }} hint="Separate tags with commas. Up to 10 unique tags, 80 characters each; repeated tags are combined." />
        {tagsInvalid && <p className={ui.error} role="alert">Use no more than 10 tags, with up to 80 characters in each tag. No tags have been discarded.</p>}
        <PremadePhotoEditor key={item.id} item={item} onChange={patch => editListing(item.id, patch)} />
        {item.isDraft ? <p className={ui.help}>This listing draft stays private, even when you publish the whole website. Choose Publish to store when it is ready.</p> : <Toggle label="Show this listing" checked={item.visible} onChange={value => editListing(item.id, { visible: value })} hint="The shop switch also needs to be on for visitors to see this listing. Preview to review your draft privately." />}
        <div className={styles.publishListing}><button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button><button type="button" className={ui.primary} disabled={!canPublishPremade || !onPublishPremade || tagsInvalid} onClick={() => onPublishPremade?.(item)}>Publish to store</button><p className={ui.help}>Save as Draft saves only this card privately, without changing an already-live listing. {canPublishPremade ? "Publish to store publishes only this listing; other draft edits and the shop switch are unchanged." : "Publish the website once and confirm its live shop state before publishing individual listings."}</p></div>
        <button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${item.name}”?`, "This removes the listing from your draft. Its photos are not deleted, and the live website stays unchanged until you publish.", () => { onEdit(draft => { draft.premades = draft.premades.filter(listing => listing.id !== item.id); }); setEditing(null); })}>Remove listing</button>
      </> : <>
        <div className={styles.listingSummary}>
          <div className={styles.listingThumbnail}><OwnerImage src={cover.src} alt={cover.alt} style={{ objectFit: item.imageFit ?? "contain", objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%` }} /></div>
          <div><p className={styles.listingPrice}>{item.price === null ? "No price set" : `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</p><p className={ui.help}>{item.description || "Add a description and photos to introduce this character."}</p><p className={styles.itemMeta}>{photos.length} {photos.length === 1 ? "photo" : "photos"} · Cover shown</p></div>
        </div>
        {!item.isDraft && <button type="button" className={ui.secondary} {...listingSaveProps}>{listingSaveLabel}</button>}
      </>}
      {item.isDraft && <div className={styles.listingFooter}><button type="button" className={ui.danger} disabled={!canDeletePremadeDraft || !onDeletePremadeDraft || deleting || savingListingId !== null} onClick={() => { setDeleteId(item.id); setDeleteError(""); }}>Delete draft</button></div>}
    </Card></div>;
  }
  return <div className={styles.manager} data-template-manager="premades">
    {deleteId && <Dialog title="Delete this listing draft?" onClose={() => { if (!deleteLock.current) setDeleteId(null); }} actions={<><button type="button" className={ui.secondary} disabled={deleting} onClick={() => setDeleteId(null)}>Keep draft</button><button type="button" className={ui.danger} disabled={deleting || !canDeletePremadeDraft} onClick={() => void deleteDraft()}>{deleting ? "Deleting…" : "Delete draft"}</button></>}><p>Delete “{content.premades.find(item => item.id === deleteId)?.name || "this draft"}” from Draft listings? Its photos, other drafts, and any already-live version stay unchanged.</p>{deleteError && <p className={ui.error} role="alert">{deleteError}</p>}</Dialog>}

    <Card title="Premade shop visibility" description="Keep your listings ready here, even when the shop is hidden.">
      <Toggle label="Show the premade shop" checked={content.site.showPremades} onChange={value => onEdit(draft => { draft.site.showPremades = value; })} hint="This switch changes your draft. Hidden listings and photos stay saved." />
      <p className={ui.help}>Live shop: <strong>{!liveShopKnown ? liveShopReadError ? "Could not check" : "Checking…" : liveShopVisibility === null ? "Not published yet" : liveShopVisibility ? "On" : "Off"}</strong>. Your draft shop is {content.site.showPremades ? "on" : "off"}.</p>
      {!liveShopKnown && <div className={ui.softNote}><p role={liveShopReadError ? "alert" : "status"}>{liveShopReadError || "Checking the published website before offering a live update…"}</p>{liveShopReadError && <button type="button" className={ui.secondary} onClick={onRetryLiveShop}>Check again</button>}</div>}
      {liveShopKnown && content.site.showPremades !== liveShopVisibility && <div className={ui.softNote}>
        <strong>Apply just the shop switch</strong><p>Update live changes only whether the already-published shop is shown. It does not publish new listings, photos, prices, or any other draft edits.</p>
        <button type="button" className={ui.primary} disabled={!canUpdateLiveShop || liveShopVisibility === null} onClick={() => { if (canUpdateLiveShop && liveShopVisibility !== null) onUpdateLiveShop(); }}>Update live</button>
        {liveShopVisibility === null && <p>Publish the website once before using the shop-only update.</p>}
      </div>}
    </Card>
    <Card title="Catalog mode"><Toggle label="Use the storefront as a catalog" checked={content.site.catalogMode ?? false} onChange={value => onEdit(draft => { draft.site.catalogMode = value; })} hint="Hides the cart and shows where each item can be purchased. Save draft keeps this private; Publish live applies this setting. On-site checkout and payments are not connected." /></Card>
    <div className={ui.sectionActions}><h2 className={ui.smallTitle}>Your listings</h2><button type="button" className={ui.primary} onClick={addListing}>＋ Add a premade</button></div>
    {!content.premades.length && <Card><div className={ui.empty}><span className={ui.emptyIcon}><Icon name="premades" /></span><h3>A new character starts here.</h3><p>Add a premade when you’re ready. Keep it hidden while you get the details just right.</p></div></Card>}
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
    <Card title="Your welcome" description="Update the words in your existing home-page template.">
      <Field label="Main heading" value={content.home.title} onChange={value => onEdit(draft => { draft.home.title = value; })} />
      <Field label="Caption beneath the main photo" value={content.home.caption} onChange={value => onEdit(draft => { draft.home.caption = value; })} />
    </Card>
    <Card title="The main photo"><ImagePicker src={content.home.image.src} alt={content.home.image.alt} onSource={value => onEdit(draft => { draft.home.image.src = value; })} onAlt={value => onEdit(draft => { draft.home.image.alt = value; })} /></Card>
    <p className={ui.help}>Want to add sections or change the page layout? Use the separate Website builder tab. These settings keep your existing template.</p>
  </div>;
}

export function ContactSettingsManager({ content, onEdit, onRemove, userEmail, onSync, constructionSettings, onEditCommissionForm, ...saveProps }: ManagerProps & SettingsCardSaveProps & { userEmail: string; onSync: () => void; onEditCommissionForm?: () => void; constructionSettings?: import("react").ReactNode }) {
  const [formPreviewOpen,setFormPreviewOpen]=useState(false);
  return <div className={styles.manager} data-template-manager="settings">
    {constructionSettings}
    <div className={ui.twoCol}>
      <Card title="Your business"><Field label="Business name" value={content.site.name} onChange={value => onEdit(draft => { draft.site.name = value; })} hint="Shown in your website’s header and footer after publishing." /><SettingsCardActions card="business" {...saveProps} /></Card>
      <Card title="Commission availability">
        <OwnerSelect label="Commission status" value={content.site.commissionStatus} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} options={COMMISSION_STATUSES.map(status => ({ value: status, label: status }))} hint="Choose Save live on this card to update the website." />
        <Field label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} placeholder="Let people know what to expect…" />
        <SettingsCardActions card="availability" {...saveProps} />
      </Card>
    </div>
    <Card title="Commission form" description="Edit questions, wording, answer options and order. Additional Parts is optional for every suit type except Parts.">
      <Toggle label="Allow quantities for Additional Parts" checked={content.site.additionalPartsQuantities === true} onChange={value => onEdit(draft => { draft.site.additionalPartsQuantities = value; })} hint="Off adds one of each selected extra. On lets clients request multiple extras or spares. Save draft keeps this private; Save live applies this card to the website." />
      <div className={ui.rowEnd}><button type="button" className={ui.secondary} disabled={!onEditCommissionForm} onClick={onEditCommissionForm}>Edit commission form</button><button type="button" className={ui.secondary} onClick={()=>setFormPreviewOpen(true)}>Preview commission form</button></div>
      <SettingsCardActions card="commission-form" {...saveProps} />
    </Card>
    {formPreviewOpen&&<Dialog title="Commission form preview" wide maximizable onClose={()=>setFormPreviewOpen(false)} actions={<button type="button" className={ui.secondary} onClick={()=>setFormPreviewOpen(false)}>Close preview</button>}><p className={ui.help}>Try your unsaved questions and quantity setting here. This preview does not save a request, upload references, contact clients, or take a payment.</p><CommissionForm previewContent={content} additionalPartsQuantities={content.site.additionalPartsQuantities === true} configuration={content.commissionForm??{}}/></Dialog>}
    <details className={styles.contactsSection} open><summary>Where people can find you</summary><div className={styles.contactsContent}><OwnerSocialLinksEditor content={content} onEdit={onEdit} onRemove={onRemove} /><SettingsCardActions card="contacts" {...saveProps} /></div></details>
    <Card title="This workspace">
      <p className={ui.help}>Signed in as <strong>{userEmail}</strong>.</p>
      <p className={ui.help}>Save draft stores changes privately in your owner account. Preview shows current edits without saving. Publish live updates published content but never turns Construction Mode off. Construction Mode and the premade shop have separate, explicit Update live actions. Saving needs an internet connection; an error leaves your edits on screen.</p>
      <p className={ui.help}>Cloud Sync checks your saved cloud draft. If you have unsaved edits, you can save first, explicitly reload the saved version, or keep editing. It never silently replaces unsaved work.</p>
      <button type="button" className={ui.secondary} onClick={onSync}>Cloud Sync</button>
    </Card>
  </div>;
}
