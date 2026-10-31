"use client";

import {ButtonDesignEditor} from "./ButtonDesignEditor";
import {WebsiteAssetPicker} from "./WebsiteAssetPicker";
import { useState } from "react";
import type { OwnerContent } from "./model";
import { IMAGE_FIELDS, LINK_FIELDS, TEXT_FIELDS, getTemplateLink } from "./site-design";
import { Field, ImagePicker } from "./OwnerFields";
import { OwnerElementAppearance } from "./OwnerAppearancePanel";
import { OwnerLinkedTextField } from "./OwnerLinkedTextField";
import { templateSupportsInlineLinks } from "./inline-links";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerDesignPanel.module.css";

type Props = {
  content: OwnerContent;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  /** Without a target, show the full template group. A target shows its exact clicked control. */
  group?: string;
  target?: string;
};

/** Catalog identities, not array positions, keep delayed photo uploads on the correct image. */
export function OwnerTemplateEditor({ content, onEdit, group, target }: Props) {
  const [query, setQuery] = useState("");
  const [kind, ...parts] = target?.split(":") ?? [];
  const key = parts.join(":");
  const include = (field: { key: string; group: string; label: string }, type: string) => target
    ? kind === `template-${type}` && field.key === key
    : field.group === group && `${field.label} ${field.key}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
  const textFields = TEXT_FIELDS.filter(field => include(field, "text"));
  const imageFields = IMAGE_FIELDS.filter(field => include(field, "image"));
  const linkFields = LINK_FIELDS.filter(field => include(field, "link"));
  const total = textFields.length + imageFields.length + linkFields.length;
  return <div>
    {!target && <>
      <p className={ui.help}>Edit the template’s words, photos and buttons here. Reset brings back the original. Words in {"{braces}"} are reusable placeholders, not code.</p>
      <label className={styles.search}><span>Find a page detail</span><input type="search" value={query} placeholder="Search words, images or buttons…" onChange={event => setQuery(event.target.value)} /></label>
      <p className={styles.catalogSummary}>{total} {total === 1 ? "detail" : "details"}{query && <button className={styles.reset} type="button" onClick={() => setQuery("")}>Clear search</button>}</p>
    </>}
    <div className={styles.templateList}>
      {textFields.map(field => { const TextField = templateSupportsInlineLinks(field.key) ? OwnerLinkedTextField : Field; return <section key={field.key} className={styles.templateField}>
        <TextField label={field.label} value={content.contentOverrides?.text?.[field.key] ?? field.defaultValue} multiline={field.defaultValue.length > 80 || /description|paragraph|intro|note|message|copy|body/i.test(field.label)} hint={field.optional ? "Leave blank to hide this text. The photo description for screen readers stays unchanged." : undefined} onChange={value => onEdit(draft => { draft.contentOverrides = { ...draft.contentOverrides, text: { ...draft.contentOverrides?.text, [field.key]: value } }; })} />
        {field.optional && (content.contentOverrides?.text?.[field.key] ?? field.defaultValue).trim() && <button type="button" className={styles.reset} aria-label={`Hide ${field.label.toLowerCase()}`} onClick={() => onEdit(draft => { draft.contentOverrides = { ...draft.contentOverrides, text: { ...draft.contentOverrides?.text, [field.key]: "" } }; })}>Hide text</button>}
        <OwnerElementAppearance content={content} styleKey={field.key} onEdit={onEdit} />
        {content.contentOverrides?.text?.[field.key] !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${field.label.toLowerCase()}`} onClick={() => onEdit(draft => { if (draft.contentOverrides?.text) delete draft.contentOverrides.text[field.key]; })}>Reset to original text</button>}
      </section>; })}
      {imageFields.map(field => {
        const image = content.contentOverrides?.images?.[field.key] ?? field.defaultValue;
        return <section key={field.key} className={styles.templateField}>
          <div className={styles.fieldHeading}><h3>{field.label}</h3>{content.contentOverrides?.images?.[field.key] !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${field.label.toLowerCase()}`} onClick={() => onEdit(draft => { if (draft.contentOverrides?.images) delete draft.contentOverrides.images[field.key]; })}>Reset image</button>}</div>
          <ImagePicker key={field.key} src={image.src} alt={image.alt} onSource={src => onEdit(draft => { const current = draft.contentOverrides?.images?.[field.key] ?? field.defaultValue; draft.contentOverrides = { ...draft.contentOverrides, images: { ...draft.contentOverrides?.images, [field.key]: { ...current, src } } }; })} onAlt={alt => onEdit(draft => { const current = draft.contentOverrides?.images?.[field.key] ?? field.defaultValue; draft.contentOverrides = { ...draft.contentOverrides, images: { ...draft.contentOverrides?.images, [field.key]: { ...current, alt } } }; })} />
          <OwnerElementAppearance content={content} styleKey={field.key} onEdit={onEdit} />
        </section>;
      })}
      {linkFields.map(field => {
        const link = getTemplateLink(content, field.key);
        return <section key={field.key} className={styles.templateField}>
          <div className={styles.fieldHeading}><h3>{field.label}</h3>{content.contentOverrides?.links?.[field.key] !== undefined && <button type="button" className={styles.reset} aria-label={`Reset ${field.label.toLowerCase()}`} onClick={() => onEdit(draft => { if (draft.contentOverrides?.links) delete draft.contentOverrides.links[field.key]; })}>Reset button</button>}</div>
          <Field label="Button or link text" value={link.label} onChange={label => onEdit(draft => { const current = getTemplateLink(draft, field.key); draft.contentOverrides = { ...draft.contentOverrides, links: { ...draft.contentOverrides?.links, [field.key]: { ...current, label } } }; })} />
          <Field label="Where should it go?" value={link.href} onChange={href => onEdit(draft => { const current = getTemplateLink(draft, field.key); draft.contentOverrides = { ...draft.contentOverrides, links: { ...draft.contentOverrides?.links, [field.key]: { ...current, href } } }; })} hint="A page on your site, such as /contact, or a full https:// link. Changing this does not connect forms or checkout." />
          <WebsiteAssetPicker key={`pdf-${field.key}`} targetId={field.key} kind="document" value={link.href} onSelect={href=>onEdit(draft=>{const current=getTemplateLink(draft,field.key);draft.contentOverrides={...draft.contentOverrides,links:{...draft.contentOverrides?.links,[field.key]:{...current,href}}};})}/>
          <ButtonDesignEditor content={content} onEdit={onEdit} value={link.buttonDesignId} onSelect={id=>onEdit(draft=>{const current=getTemplateLink(draft,field.key);if(id)current.buttonDesignId=id;else delete current.buttonDesignId;draft.contentOverrides={...draft.contentOverrides,links:{...draft.contentOverrides?.links,[field.key]:current}};})}/>
          <OwnerElementAppearance content={content} styleKey={field.key} onEdit={onEdit} />
        </section>;
      })}
    </div>
    {!total && <p className={styles.empty}>{query ? "No matching details. Try another word, or clear your search." : "This page uses the editable sections shown on the canvas. Select a section or add one below."}</p>}
  </div>;
}
