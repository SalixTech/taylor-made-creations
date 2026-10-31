"use client";

import { DESIGN_COLOR_FIELDS, DESIGN_SELECT_FIELDS } from "./site-design";
import type { OwnerContent } from "./model";
import { OwnerSelect, Toggle } from "./OwnerFields";
import { OwnerHexInput, OwnerNumberInput } from "./OwnerDesignInputs";
import { OwnerFontLibrary } from "./FontUpload";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerDesignPanel.module.css";

type Props = {
  content: OwnerContent;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  onReset: () => void;
};

/** Only catalogued, bounded choices are written. There is deliberately no CSS/HTML input. */
export function OwnerDesignPanel({ content, onEdit, onReset }: Props) {
  const hasDesign = !!content.design && !!Object.keys(content.design).length
    || Object.values(content.contentOverrides?.styles ?? {}).some(appearance => Object.keys(appearance).length)
    || content.pages.some(page => !!page.titleAppearance && !!Object.keys(page.titleAppearance).length || page.blocks.some(block => !!block.appearance && !!Object.keys(block.appearance).length));
  return <div className={styles.designPanel}>
    <p className={ui.help}>These choices change the whole website, including this live canvas. Your public website changes only when you publish.</p>
    <section className={styles.group} aria-labelledby="builder-colors-heading">
      <h3 id="builder-colors-heading">Website colors</h3>
      <Toggle label="Section dividers" checked={content.design?.sectionDividers !== "hidden"} onChange={checked => onEdit(draft => { draft.design = { ...draft.design, sectionDividers: checked ? "visible" : "hidden" }; })} />
      <p className={styles.hint}>Choose a swatch to open the color picker. Keep text and backgrounds easy to read. Price text changes amounts on the price sheet and premade listings without changing accents or buttons. Until you choose a color, it follows the accent; Reset restores that link.</p>
      <div className={styles.colors}>{DESIGN_COLOR_FIELDS.map(field => {
        const value = content.design?.colors?.[field.key] ?? (field.key === "priceText" ? content.design?.colors?.accent : field.key === "sectionDivider" ? content.design?.colors?.border : undefined) ?? field.defaultValue;
        const overridden = content.design?.colors?.[field.key] !== undefined;
        return <div key={field.key} className={styles.colorRow}>
          <label><input type="color" aria-label={field.label} value={value} onChange={event => {
            const color = event.target.value;
            if (!/^#[0-9a-f]{6}$/i.test(color)) return;
            onEdit(draft => { draft.design = { ...draft.design, colors: { ...draft.design?.colors, [field.key]: color } }; });
          }} /><span><strong>{field.label}</strong><small>{value.toUpperCase()}</small></span></label>
          <OwnerHexInput label={field.label} value={value} onChange={color => onEdit(draft => { draft.design = { ...draft.design, colors: { ...draft.design?.colors, [field.key]: color } }; })} />
          {overridden && <button type="button" className={styles.reset} aria-label={`Reset ${field.label.toLowerCase()}`} onClick={() => onEdit(draft => { if (draft.design?.colors) delete draft.design.colors[field.key]; })}>Reset</button>}
        </div>;
      })}</div>
    </section>
    <section className={styles.group} aria-labelledby="builder-type-heading">
      <h3 id="builder-type-heading">Fonts, layout & buttons</h3>
      <OwnerNumberInput label="Body font size" value={content.design?.bodyFontSize} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit="px" hint="Any positive font size. Clear to preserve the original or existing size setting." onChange={value => onEdit(draft => { draft.design ??= {}; if (value === undefined) delete draft.design.bodyFontSize; else draft.design.bodyFontSize = value; })} />
      <OwnerNumberInput label="Heading font size" value={content.design?.headingFontSize} min={Number.MIN_VALUE} max={Number.MAX_VALUE} unit="px" hint="Any positive font size. Clear to preserve the original or existing size setting." onChange={value => onEdit(draft => { draft.design ??= {}; if (value === undefined) delete draft.design.headingFontSize; else draft.design.headingFontSize = value; })} />
      {!!content.fonts?.length && ([ ["bodyFontId", "Uploaded body font"], ["headingFontId", "Uploaded heading font"] ] as const).map(([key, label]) => <OwnerSelect key={key} label={label} value={content.design?.[key] ?? ""} options={[{ value: "", label: "Use standard font choice" }, ...content.fonts!.map(font => ({ value: font.id, label: font.name }))]} onChange={value => { if (value && !content.fonts?.some(font => font.id === value)) return; onEdit(draft => { draft.design ??= {}; if (value) draft.design[key] = value; else delete draft.design[key]; }); }} />)}
      {DESIGN_SELECT_FIELDS.filter(field => field.key !== "textSize" && field.key !== "headingSize" && field.key !== "sectionDividers").map(field => <OwnerSelect key={field.key} label={field.label} value={content.design?.[field.key] ?? field.defaultValue} options={field.options} onChange={value => {
        if (!field.options.some(option => option.value === value)) return;
        onEdit(draft => { draft.design = { ...draft.design, [field.key]: value }; });
      }} />)}
    </section>
    <section className={styles.group} aria-labelledby="builder-font-library-heading"><h3 id="builder-font-library-heading">Your uploaded fonts</h3><OwnerFontLibrary fonts={content.fonts} onChange={fonts => onEdit(draft => { draft.fonts = fonts; })} /></section>
    <button type="button" className={ui.secondary} disabled={!hasDesign} onClick={onReset}>Restore original website design</button>
    <p className={styles.hint}>Restores global and individual appearance settings. Your writing, photos, pages and prices stay unchanged.</p>
  </div>;
}
