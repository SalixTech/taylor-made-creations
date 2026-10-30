"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { stepWholeNumber, useWholeNumberWheel } from "./whole-number-input";
import SiteSelect, { type SelectOption, type InlineSelectCreate } from "@/components/SiteSelect";
import { isSafeImageSource } from "./model";
import { fursuitGallery } from "@/content/fursuit-gallery";
import styles from "./OwnerPortal.module.css";
import photoStyles from "./PhotoManager.module.css";
import { useOwnerMediaSource } from "./media-client";
import { AssetLibrary } from "./AssetLibrary";

export function Field({ label, value, onChange, hint, multiline = false, type = "text", placeholder, required = false, readOnly = false, step }: {
  label: string; value: string | number; onChange: (value: string) => void; hint?: string; multiline?: boolean; type?: string; placeholder?: string; required?: boolean; readOnly?: boolean; step?: number | string;
}) {
  const whole = type === "number" && (step === undefined || Number(step) === 1);
  const numberRef = useWholeNumberWheel(value, onChange, whole && !readOnly);
  return <label className={styles.field}><span>{label}{required && <span className={styles.required}> *</span>}</span>{multiline
    ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={4} placeholder={placeholder} readOnly={readOnly} required={required} />
    : <input ref={numberRef} onKeyDown={event => { if (whole && !readOnly && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); onChange(stepWholeNumber(value, event.key === "ArrowUp" ? 1 : -1)); } }} value={value} onChange={event => onChange(event.target.value)} type={type} min={type === "number" ? (step === undefined || Number(step) === 1) && Number.isFinite(Number(value)) ? Math.round((Number(value) % 1) * 100) / 100 : 0 : undefined} step={type === "number" ? step ?? 1 : undefined} placeholder={placeholder} readOnly={readOnly} required={required} />}
    {hint && <small>{hint}</small>}
  </label>;
}

/** Same keyboard-accessible combobox used by the public commission form. */
export function OwnerSelect({ label, value, onChange, options, hint, placeholder, required = false, inlineCreate }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly SelectOption[]; hint?: string; placeholder?: string; required?: boolean; inlineCreate?: InlineSelectCreate;
}) {
  const id = useId();
  return <div className={`${styles.field} ${styles.ownerSelect}`}><label htmlFor={id}>{label}{required && <span className={styles.required}> *</span>}</label><SiteSelect id={id} value={value} onChange={onChange} options={options} placeholder={placeholder} required={required} inlineCreate={inlineCreate} describedBy={hint ? `${id}-hint` : undefined} />{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

export function Toggle({ label, checked, onChange, hint, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; disabled?: boolean }) {
  return <label className={styles.toggle}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span className={styles.switch} aria-hidden="true" /><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span></label>;
}

export function Card({ title, description, children, action }: { title?: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.card}>{(title || action) && <div className={styles.cardHeading}><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}{children}</section>;
}

export function MoveButtons({ label, index, length, onMove }: { label: string; index: number; length: number; onMove: (direction: -1 | 1) => void }) {
  return <div className={styles.moveButtons}><button type="button" className={styles.iconButton} aria-label={`Move ${label} up`} title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button><button type="button" className={styles.iconButton} aria-label={`Move ${label} down`} title="Move down" disabled={index === length - 1} onClick={() => onMove(1)}>↓</button></div>;
}

export const imageChoices = [{ name: "Home page collage", src: "/images/home-collage.webp" }, ...fursuitGallery.map(photo => ({ name: photo.name, src: photo.src })), { name: "Heads example", src: "/images/heads.webp" }, { name: "Partials example", src: "/images/partials.webp" }, { name: "Fullsuits example", src: "/images/fullsuits.webp" }];
export function OwnerImage({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const media = useOwnerMediaSource(src);
  if (!isSafeImageSource(src)) return <span className={styles.imageError}>Choose an existing photo or enter a secure https:// image link.</span>;
  if (media.error) return <span className={styles.imageError} role="status">{media.error}</span>;
  if (!media.src) return <span className={styles.imageError} role="status">Loading private photo…</span>;
  if (failedSource === src) return <span className={styles.imageError}>This photo could not be opened. Check the image link or choose a different photo.<button type="button" className={styles.textButton} onClick={() => setFailedSource(null)}>Try image again</button></span>;
  return <Image unoptimized src={media.src} alt={alt} width={800} height={600} style={style} onError={() => setFailedSource(src)} />;
}

export function ImagePicker({ src, alt, onSource, onAlt }: { src: string; alt: string; onSource: (src: string) => void; onAlt: (alt: string) => void }) {
  return <div className={styles.imagePicker}>
    <div className={styles.imagePreview}><OwnerImage src={src} alt={alt || "Selected image"} /></div>
    <div><AssetLibrary selected={src} onSelect={onSource} /><div className={photoStyles.selectWrap}><OwnerSelect label="Choose a photo already on your site" value={imageChoices.some(choice => choice.src === src) ? src : ""} onChange={onSource} placeholder="Choose a photo…" options={imageChoices.map(choice => ({ value: choice.src, label: choice.name }))} /></div><details className={styles.details}><summary>Use an image link instead</summary><Field label="Image link" value={src} onChange={onSource} placeholder="https://…" hint="Use a full https:// image link or choose an existing photo above." /></details><Field label="Photo description" multiline value={alt} onChange={onAlt} hint="Describe what is in the photo for visitors who use screen readers." /></div>
  </div>;
}

export { Dialog } from "./OwnerDialog";

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    pages: <><path d="M7 3h9l4 4v14H7z" /><path d="M4 7v14M15 3v5h5M10 12h7M10 16h7" /></>,
    prices: <><path d="M20 13l-8 8L3 12V3h9z" /><circle cx="7.5" cy="7.5" r="1" /></>,
    photos: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="M3 18l6-6 4 4 3-3 5 5" /></>,
    premades: <><path d="M5 7h14l2 14H3zM8 8V6a4 4 0 018 0v2" /></>,
    home: <><path d="M3 10l9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    requests: <><path d="M3 5h18v14H3zM3 6l9 7 9-7" /></>,
    clients: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6M17 15a5 5 0 014 5" /></>,
    inventory: <><path d="M3 7l9-4 9 4v13H3zM3 7l9 4 9-4M12 11v9M7 15v3M17 15v3" /></>,
    files: <><path d="M3 6h7l2 3h9v12H3zM3 6V3h7l2 3h7v3" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.pages}</svg>;
}
