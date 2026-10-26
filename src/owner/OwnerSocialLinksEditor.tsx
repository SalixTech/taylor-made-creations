"use client";
import { newOwnerId, type OwnerContent, type OwnerSocialLink } from "./model";
import { getOwnerSocialLinks } from "./social-links";
import { Field } from "./OwnerFields";
import { OwnerPriceReorderList } from "./OwnerPriceReorderList";
import { reorderById } from "./builder-interactions";
import { TrashIcon } from "./TrashIcon";
import buttons from "./OwnerButton.module.css";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerTemplateManagers.module.css";

type Props = { content: OwnerContent; onEdit: (change: (draft: OwnerContent) => void) => void; onRemove: (title: string, description: string, remove: () => void) => void };
export function OwnerSocialLinksEditor({ content, onEdit, onRemove }: Props) {
  const links = getOwnerSocialLinks(content);
  function edit(change: (links: OwnerSocialLink[]) => void) { onEdit(draft => { draft.site.socialLinks ??= getOwnerSocialLinks(draft); change(draft.site.socialLinks); }); }
  return <div className={styles.socialEditor}>
    <p className={ui.help}>Add any social or contact method. Drag to change the public order. Leave the address blank for a text-only contact.</p>
    <OwnerPriceReorderList items={links} label="Contact methods" itemLabel={link => link.label || "contact method"} onReorder={(source, target, after) => edit(items => { reorderById(items, source, target, after); })} onStep={(id, direction) => edit(items => { const index = items.findIndex(item => item.id === id), other = items[index + direction]; if (other) reorderById(items, id, other.id, direction > 0); })}>{(link, handle) => <div className={styles.socialCard}>
      <div className={styles.socialHeading}><strong>{link.label || "New contact method"}</strong>{handle}</div>
      <div className={styles.socialFields}><Field label="Contact label" value={link.label} onChange={value => edit(items => { const item = items.find(entry => entry.id === link.id); if (item) item.label = value; })} /><Field label="Display text" value={link.value} onChange={value => edit(items => { const item = items.find(entry => entry.id === link.id); if (item) item.value = value; })} />
      <Field label="Link address (optional)" value={link.url ?? ""} onChange={value => edit(items => { const item = items.find(entry => entry.id === link.id); if (item) item.url = value; })} /></div>
      <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.icon} ${buttons.compact}`} aria-label={`Delete ${link.label || "contact method"} card`} title="Delete card" onClick={() => onRemove(`Delete “${link.label || "contact method"}” card?`, "This removes the contact method from this draft. Save Live applies the contact card to the website.", () => edit(items => { const index = items.findIndex(item => item.id === link.id); if (index >= 0) items.splice(index, 1); }))}><TrashIcon /></button>
    </div>}</OwnerPriceReorderList>
    <button type="button" className={ui.secondary} disabled={links.length >= 50} onClick={() => edit(items => { if (items.length < 50) items.push({ id: newOwnerId("social"), label: "", value: "", url: "" }); })}>＋ Add contact or social</button>
  </div>;
}
