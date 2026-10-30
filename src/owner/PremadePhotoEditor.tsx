"use client";

import { useRef, useState } from "react";
import { Field, imageChoices, MoveButtons, OwnerImage, OwnerSelect } from "./OwnerFields";
import { isSafeImageSource, newOwnerId, type OwnerPremade, type OwnerPremadePhoto } from "./model";
import { getPremadeCoverPhoto, getPremadePhotos } from "./premade-gallery";
import { PhotoUpload } from "./PhotoUpload";
import { OwnerNumberInput } from "./OwnerDesignInputs";
import styles from "./PhotoManager.module.css";

/** Photo bytes live in storage; this editor keeps only stable references in the draft. */
export function PremadePhotoEditor({ item, onChange }: { item: OwnerPremade; onChange: (patch: Partial<OwnerPremade>) => void }) {
  const [source, setSource] = useState(imageChoices[0].src);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const photos = getPremadePhotos(item);
  const cover = getPremadeCoverPhoto(item);
  function update(next: OwnerPremadePhoto[], coverId = cover.id) {
    const selected = next.find(photo => photo.id === coverId) ?? next[0];
    if (!selected) return;
    onChange({ photos: next, coverPhotoId: selected.id, image: selected.src, alt: selected.alt });
  }
  function add(next: OwnerPremadePhoto[]) {
    update([...next, ...photos]);
    root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return <div ref={root} className={styles.manager}>
    <h3>Listing photos</h3><p className={styles.intro}>Add as many photos as you need, then choose the cover. New photos appear at the top. There is no fixed photo-count limit; saved text and photo references still need to fit the document size limit.</p>
    <PhotoUpload multiple onUploaded={uploaded => add(uploaded.map(({ media, name }) => ({ id: newOwnerId("photo"), src: media.src, alt: name })))} />
    <details className={styles.addExisting}><summary>Add an existing photo or image link</summary><div>
      <div className={styles.selectWrap}><OwnerSelect label="Choose a photo already on your site" value={imageChoices.some(choice => choice.src === source) ? source : ""} onChange={setSource} options={imageChoices.map(choice => ({ value: choice.src, label: choice.name }))} placeholder="Choose a photo…" /></div>
      <Field label="Or use an image link" value={source} onChange={setSource} placeholder="https://…" />
      <Field label="Description for this new photo" value={alt} onChange={setAlt} hint="Describe the character and view shown in this photo." />
      <button type="button" className={styles.coverButton} onClick={() => { if (!isSafeImageSource(source)) { setError("Choose a valid photo or secure HTTPS image link."); return; } setError(""); add([{ id: newOwnerId("photo"), src: source, alt: alt.trim() || `${item.name} photo` }]); }}>Add this photo</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div></details>
    <ol className={styles.photoList}>{photos.map((photo, index) => <li key={photo.id} className={styles.photoCard} data-cover={photo.id === cover.id}>
      <div className={styles.thumbnail}><OwnerImage src={photo.src} alt={photo.alt} /></div>
      <div><p className={styles.photoNumber}>Photo {index + 1}{photo.id === cover.id ? " · Listing cover" : ""}</p>
        <Field label={`Photo ${index + 1} description`} value={photo.alt} onChange={value => update(photos.map(entry => entry.id === photo.id ? { ...entry, alt: value } : entry))} hint="A clear description helps visitors who use screen readers." />
        <div className={styles.photoActions}><button type="button" className={styles.coverButton} aria-pressed={photo.id === cover.id} onClick={() => update([...photos], photo.id)}>{photo.id === cover.id ? "✓ Cover photo" : "Use as cover"}</button>
          <MoveButtons label={`photo ${index + 1}`} index={index} length={photos.length} onMove={direction => { const next = [...photos]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; update(next); }} />
          <button type="button" className={styles.remove} disabled={photos.length === 1} title={photos.length === 1 ? "Keep one cover photo. Add another before removing this one." : "Remove from this listing; the original file is kept"} onClick={() => update(photos.filter(entry => entry.id !== photo.id))}>Remove photo</button>
        </div>
      </div>
    </li>)}</ol>
    <p className={styles.intro}>Removing a photo only removes its reference from this listing. It does not delete the stored file. One cover photo is required.</p>
    <div className={styles.framing}><div className={styles.thumbnail}><OwnerImage src={cover.src} alt={cover.alt} style={{ objectFit: item.imageFit ?? "contain", objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%` }} /></div><div>
      <div className={styles.selectWrap}><OwnerSelect label="Photo fit" value={item.imageFit ?? "contain"} onChange={value => onChange({ imageFit: value === "cover" ? "cover" : "contain" })} options={[{ value: "contain", label: "Fit whole photo (no cropping)" }, { value: "cover", label: "Fill frame (crop edges)" }]} /></div>
      <div className={styles.positionFields}><OwnerNumberInput label="Horizontal position" value={item.imagePositionX ?? 50} min={0} max={100} unit="%" onChange={value => onChange({ imagePositionX: value ?? 50 })} /><OwnerNumberInput label="Vertical position" value={item.imagePositionY ?? 50} min={0} max={100} unit="%" onChange={value => onChange({ imagePositionY: value ?? 50 })} /></div>
      <p className={styles.intro}>Move the framing without changing the stored photo.</p>
    </div></div>
  </div>;
}
