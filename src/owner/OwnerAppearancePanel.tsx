"use client";

import { OwnerBoxFields } from "./OwnerCanvasBoxTools";
import type { OwnerContent } from "./model";
import { STYLE_FIELDS, type ElementAppearance } from "./site-design";
import { OwnerSelect } from "./OwnerFields";
import { OwnerHexInput, OwnerNumberInput } from "./OwnerDesignInputs";
import styles from "./OwnerDesignPanel.module.css";

type AppearanceKind = "text" | "image" | "link" | "section";
type Props = {
  value?: ElementAppearance;
  kind?: AppearanceKind;
  label?: string;
  withImage?: boolean;
  onEdit: (change: (appearance: ElementAppearance) => void) => void;
  onReset: () => void;
  fonts?: OwnerContent["fonts"];
  separateAlignment?: boolean;
};
const fontOptions = [{ value: "", label: "Use website font" }, { value: "original", label: "Original site font" }, { value: "sans", label: "Clean sans-serif" }, { value: "serif", label: "Classic serif" }, { value: "rounded", label: "Friendly rounded" }, { value: "mono", label: "Monospace" }];
const alignmentOptions = [{ value: "", label: "Use original alignment" }, { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
const fitOptions = [{ value: "", label: "Use original fit" }, { value: "contain", label: "Show the whole photo" }, { value: "cover", label: "Fill and crop the frame" }];

/** Optional values inherit the public site's design; choosing a control writes a real safe token. */
export function OwnerAppearancePanel({ value, kind = "text", label = "Appearance", withImage = false, onEdit, onReset, fonts = [], separateAlignment = false }: Props) {
  const image = kind === "image" || withImage;
  const text = kind !== "image";
  return <details className={styles.appearance}>
    <summary>{label}<span>{value && Object.keys(value).length ? "Customized" : "Website defaults"}</span></summary>
    <div className={styles.appearanceBody}>
      <p className={styles.hint}>Change only this {kind === "section" ? "section" : kind === "link" ? "button or link" : kind === "image" ? "photo" : "text"}. Unchanged options follow the website design.</p>
      <div className={styles.colors}>
        {([...(text ? [{ key: "textColor" as const, label: "Text color", fallback: "#302c2c" }] : []), { key: "backgroundColor" as const, label: "Background color", fallback: "#ffffff" }]).map(field => <div className={styles.colorRow} key={field.key}>
          <label><input type="color" aria-label={`${label}: ${field.label.toLowerCase()}`} value={value?.[field.key] ?? field.fallback} onChange={event => { const color = event.target.value; if (/^#[0-9a-f]{6}$/i.test(color)) onEdit(appearance => { appearance[field.key] = color; }); }} /><span><strong>{field.label}</strong><small>{value?.[field.key]?.toUpperCase() ?? "Inherited"}</small></span></label>
          <OwnerHexInput label={`${label}: ${field.label.toLowerCase()}`} value={value?.[field.key] ?? field.fallback} onChange={color => onEdit(appearance => { appearance[field.key] = color; })} />
          {value?.[field.key] !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${label.toLowerCase()} ${field.label.toLowerCase()}`} onClick={() => onEdit(appearance => { delete appearance[field.key]; })}>Reset</button>}
        </div>)}
      </div>
      {text && <>
        <OwnerSelect label="Font for this element" value={value?.font ?? ""} options={fontOptions} onChange={font => { if (!fontOptions.some(option => option.value === font)) return; onEdit(appearance => { if (font) appearance.font = font as ElementAppearance["font"]; else delete appearance.font; }); }} />
        {fonts.length > 0 && <OwnerSelect label="Uploaded font for this element" value={value?.fontId ?? ""} options={[{ value: "", label: "Use font above" }, ...fonts.map(font => ({ value: font.id, label: font.name }))]} onChange={fontId => { if (fontId && !fonts.some(font => font.id === fontId)) return; onEdit(appearance => { if (fontId) appearance.fontId = fontId; else delete appearance.fontId; }); }} />}
        <OwnerNumberInput label="Font size" value={value?.fontSize} min={8} max={144} unit="px" hint={value?.textSize ? `Existing ${value.textSize} size is preserved until you enter a number. Clear to restore it.` : "8–144 px. Clear to inherit the original size."} onChange={size => onEdit(appearance => { if (size === undefined) delete appearance.fontSize; else appearance.fontSize = size; })} />
        {separateAlignment ? ([ ["headingAlign", "Heading alignment"], ["bodyAlign", "Text alignment"] ] as const).map(([key, title]) => <OwnerSelect key={key} label={title} value={value?.[key] ?? ""} options={alignmentOptions} onChange={align => { if (!alignmentOptions.some(option => option.value === align)) return; onEdit(appearance => { if (align) appearance[key] = align as ElementAppearance["align"]; else delete appearance[key]; }); }} />) : <OwnerSelect label="Text alignment" value={value?.align ?? ""} options={alignmentOptions} onChange={align => { if (!alignmentOptions.some(option => option.value === align)) return; onEdit(appearance => { if (align) appearance.align = align as ElementAppearance["align"]; else delete appearance.align; }); }} />}
      </>}
      {image && <>
        <label><input type="checkbox" checked={value?.imageAspectLocked !== false} onChange={event => onEdit(appearance => { appearance.imageAspectLocked = event.target.checked; })} /> Lock proportions while dragging image corners</label>
        <p className={styles.hint}>Select the photo on the page to resize its corners or drag its crop. Your original photo stays unchanged.</p>
        <OwnerNumberInput label="Photo width" value={value?.imageWidthPercent} min={5} max={100} unit="%" placeholder="Original" hint="5–100% of the available space. Clear to use the original width." onChange={size => onEdit(appearance => { if (size === undefined) delete appearance.imageWidthPercent; else appearance.imageWidthPercent = size; })} />
        <OwnerNumberInput label="Photo height" value={value?.imageHeightPx} min={16} max={2000} unit="px" placeholder="Original" hint="16–2000 px. Clear to preserve the original proportions. Choose Show the whole photo to avoid cropping." onChange={size => onEdit(appearance => { if (size === undefined) delete appearance.imageHeightPx; else appearance.imageHeightPx = size; })} />
        <OwnerSelect label="Photo fit" value={value?.imageFit ?? ""} options={fitOptions} onChange={fit => { if (!fitOptions.some(option => option.value === fit)) return; onEdit(appearance => { if (fit) appearance.imageFit = fit as ElementAppearance["imageFit"]; else delete appearance.imageFit; }); }} />
        <p className={styles.hint}>Move the focal point if the photo is cropped. With “Show the whole photo”, position only changes when there is room around the image.</p>
        {([ ["imagePositionX", "Horizontal focal point"], ["imagePositionY", "Vertical focal point"] ] as const).map(([key, title]) => <div className={styles.range} key={key}><label><span>{title}<output>{value?.[key] ?? 50}%</output></span><input type="range" min={0} max={100} step={1} value={value?.[key] ?? 50} onChange={event => { const position = Number(event.target.value); if (Number.isFinite(position) && position >= 0 && position <= 100) onEdit(appearance => { appearance[key] = position; }); }} /><small>{key === "imagePositionX" ? "Left → right" : "Top → bottom"}</small></label><OwnerNumberInput label={`${title} percentage`} value={value?.[key] ?? 50} min={0} max={100} unit="%" onChange={position => onEdit(appearance => { if (position === undefined) delete appearance[key]; else appearance[key] = position; })} /></div>)}
      </>}
      {text && <OwnerBoxFields value={value} onChange={next => onEdit(appearance => { Object.assign(appearance, next); })} />}
      <button type="button" className={styles.reset} disabled={!value || !Object.keys(value).length} onClick={onReset}>Reset this appearance</button>
    </div>
  </details>;
}

type ElementProps = { content: OwnerContent; styleKey: string; onEdit: (change: (draft: OwnerContent) => void) => void; label?: string };
/** Catalog lookup prevents adding an inspector for a property that has no renderer. */
export function OwnerElementAppearance({ content, styleKey, onEdit, label }: ElementProps) {
  const field = STYLE_FIELDS.find(field => field.key === styleKey);
  if (!field) return null;
  return <OwnerAppearancePanel fonts={content.fonts} value={content.contentOverrides?.styles?.[field.key]} kind={field.kind} label={label ?? `${field.label} appearance`} onEdit={change => onEdit(draft => {
    draft.contentOverrides ??= {};
    draft.contentOverrides.styles ??= {};
    draft.contentOverrides.styles[field.key] ??= {};
    change(draft.contentOverrides.styles[field.key]);
  })} onReset={() => onEdit(draft => { if (draft.contentOverrides?.styles) delete draft.contentOverrides.styles[field.key]; })} />;
}
