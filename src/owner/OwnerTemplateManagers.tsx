"use client";

import { useRef, useState } from "react";
import { COMMISSION_STATUSES, getPremadeTags, parsePremadeTags, MAX_PREMADE_TAGS, MAX_PREMADE_TAG_LENGTH, newOwnerId, type GalleryItem, type OwnerContent, type OwnerPremade } from "./model";
import { Card, Field, Icon, ImagePicker, MoveButtons, OwnerImage, OwnerSelect, Toggle } from "./OwnerFields";
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
      <Card title="Add to your gallery" description="New photos go to the top. Use the arrows on each card to arrange them in the order you want.">
        <PhotoUpload multiple label="Upload gallery photos" onUploaded={photos => addPhotos(photos.map(({ media, name }) => ({ id: newOwnerId("photo"), name, src: media.src, alt: name, width: media.width, height: media.height, visible: true })))} />
        <button type="button" className={ui.secondary} onClick={() => addPhotos([{ id: newOwnerId("photo"), name: "New photo", src: "/images/home-collage.webp", alt: "Taylor Made Creations fursuit work", width: 1996, height: 960, visible: true }], true)}>＋ Add an existing photo</button>
      </Card>
    </div>
    <div className={ui.sectionActions}><p className={ui.help}>{content.gallery.length} photos · {content.gallery.filter(photo => photo.visible).length} shown in your draft gallery</p><button type="button" className={ui.primary} disabled={!onSavePhotos} onClick={onSavePhotos}>Save photos</button></div>
    <div className={ui.photoGrid}>
      {content.gallery.map((photo, index) => <Card key={photo.id}>
        <div className={ui.photoThumb}><OwnerImage src={photo.src} alt={photo.alt} /></div>
        <div className={ui.rowHeading}><h3>{photo.name || "Untitled photo"}</h3><span className={`${ui.badge} ${photo.visible ? ui.badgeVisible : ""}`}>{photo.visible ? "In draft gallery" : "Hidden in draft"}</span></div>
        <p className={styles.itemMeta}>Position {index + 1}{photo.displayNumber?.trim() ? ` · Gallery number ${photo.displayNumber}` : " · Automatic gallery number"}</p>
        <div className={ui.rowEnd}>
          <MoveButtons label={photo.name || "photo"} index={index} length={content.gallery.length} onMove={direction => onEdit(draft => move(draft.gallery, photo.id, direction))} />
          <button type="button" className={ui.secondary} aria-expanded={editing === photo.id} onClick={() => setEditing(editing === photo.id ? null : photo.id)}>{editing === photo.id ? "Close details" : "Edit photo"}</button>
          <button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${photo.name}”?`, "This removes the photo from your gallery draft. It does not delete the original image file or change the live website.", () => { onEdit(draft => { draft.gallery = draft.gallery.filter(item => item.id !== photo.id); }); if (editing === photo.id) setEditing(null); })}>Remove</button>
        </div>
        {editing === photo.id && <div className={ui.expanded}>
          <Field label="Photo name" value={photo.name} onChange={value => editPhoto(photo.id, { name: value })} />
          <Field label="Gallery number (optional)" value={photo.displayNumber ?? ""} onChange={value => editPhoto(photo.id, { displayNumber: value })} hint="Leave blank to number photos automatically. This changes the displayed number, not the photo’s order." />
          <ImagePicker key={photo.id} src={photo.src} alt={photo.alt} onSource={value => editPhoto(photo.id, { src: value })} onAlt={value => editPhoto(photo.id, { alt: value })} />
          {onSavePhotos && <button type="button" className={ui.primary} onClick={onSavePhotos}>Save Photo</button>}
          <Toggle label="Show this photo in the gallery" checked={photo.visible} onChange={value => editPhoto(photo.id, { visible: value })} hint="Hidden photos stay here for you to edit. Publish when your gallery is ready for visitors." />
        </div>}
      </Card>)}
    </div>
    {!content.gallery.length && <Card><div className={ui.empty}><h3>Time to show off your work.</h3><p>Upload your first photos or choose an existing photo above.</p></div></Card>}
  </div>;
}

/** Listings stay editable while the shop is hidden. Only the explicit shop action changes live visibility. */
export function PremadesManager({ content, onEdit, onRemove, liveShopVisibility, liveShopKnown, liveShopReadError, onRetryLiveShop, canUpdateLiveShop, onUpdateLiveShop, canPublishPremade = false, onPublishPremade, canSavePremadeDraft = false, onSavePremadeDraft }: PremadesManagerProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const savingListing = useRef(false);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const draftSection = useRef<HTMLDetailsElement>(null);
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
    </Card></div>;
  }
  return <div className={styles.manager} data-template-manager="premades">
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

export function ContactSettingsManager({ content, onEdit, userEmail, onSync, constructionSettings }: ManagerProps & { userEmail: string; onSync: () => void; constructionSettings?: import("react").ReactNode }) {
  return <div className={styles.manager} data-template-manager="settings">
    {constructionSettings}
    <div className={ui.twoCol}>
      <Card title="Your business"><Field label="Business name" value={content.site.name} onChange={value => onEdit(draft => { draft.site.name = value; })} hint="Shown in your website’s header and footer after publishing." /></Card>
      <Card title="Commission availability">
        <OwnerSelect label="Commission status" value={content.site.commissionStatus} onChange={value => onEdit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} options={COMMISSION_STATUSES.map(status => ({ value: status, label: status }))} hint="Your live site changes only when you choose Publish live." />
        <Field label="A note for visitors" multiline value={content.site.statusNote} onChange={value => onEdit(draft => { draft.site.statusNote = value; })} placeholder="Let people know what to expect…" />
      </Card>
    </div>
    <Card title="Where people can find you" description="Leave an optional contact field empty to hide it from your contact page."><div className={ui.twoCol}>
      <Field label="Telegram username" value={content.site.telegram} onChange={value => onEdit(draft => { draft.site.telegram = value.replace(/^@/, ""); })} hint="Just your username, without @ or a link." />
      <Field label="Discord username" value={content.site.discord} onChange={value => onEdit(draft => { draft.site.discord = value; })} />
      <Field label="Email address" type="email" value={content.site.email} onChange={value => onEdit(draft => { draft.site.email = value; })} />
      <Field label="TikTok username" value={content.site.tiktok} onChange={value => onEdit(draft => { draft.site.tiktok = value.replace(/^@/, ""); })} hint="Just your username, without @ or a link." />
      <Field label="Twitch username" value={content.site.twitch} onChange={value => onEdit(draft => { draft.site.twitch = value.replace(/^@/, ""); })} hint="Just your username, without @ or a link." />
    </div></Card>
    <Card title="This workspace">
      <p className={ui.help}>Signed in as <strong>{userEmail}</strong>.</p>
      <p className={ui.help}>Save draft stores changes privately in your owner account. Preview shows current edits without saving. Publish live updates published content but never turns Construction Mode off. Construction Mode and the premade shop have separate, explicit Update live actions. Saving needs an internet connection; an error leaves your edits on screen.</p>
      <p className={ui.help}>Cloud Sync checks your saved cloud draft. If you have unsaved edits, you can save first, explicitly reload the saved version, or keep editing. It never silently replaces unsaved work.</p>
      <button type="button" className={ui.secondary} onClick={onSync}>Cloud Sync</button>
    </Card>
  </div>;
}
