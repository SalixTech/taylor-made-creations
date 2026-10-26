"use client";

import { useState } from "react";
import { newOwnerId, type OwnerContent } from "./model";
import { Card, Field } from "./OwnerFields";
import { PriceItemChooser, priceNameKey } from "./PriceItemChooser";
import { OwnerPriceReorderList } from "./OwnerPriceReorderList";
import { reorderById } from "./builder-interactions";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerPricesManager.module.css";

type Props = {
  content: OwnerContent;
  onEdit: (change: (draft: OwnerContent) => void) => void;
  onRemove: (title: string, description: string, remove: () => void) => void;
  disabled?: boolean;
};

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return <label className={ui.field}><span>{label}</span><div className={ui.money}><span>$</span><input type="number" min="0" step="0.01" value={typed ?? String(value)} onChange={event => { setTyped(event.target.value); onChange(event.target.value === "" ? 0 : Number(event.target.value)); }} onBlur={() => setTyped(null)} placeholder="0" /></div></label>;
}

function stepById<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
  const index = items.findIndex(item => item.id === id), target = items[index + direction];
  if (index >= 0 && target) reorderById(items, id, target.id, direction > 0);
}

/** All callbacks resolve current stable IDs, including edits that finish after a drag. */
export function OwnerPricesManager({ content, onEdit, onRemove, disabled = false }: Props) {
  function edit(change: (draft: OwnerContent) => void) { if (!disabled) onEdit(change); }
  return <div className={styles.manager} data-template-manager="prices">
    <Card title="Introduce your prices"><Field label="Introductory text" multiline value={content.prices.intro} onChange={value => edit(draft => { draft.prices.intro = value; })} /></Card>
    <p className={ui.help}>Drag cards to arrange groups, prices, parts and extras. You can also focus a card and use the arrow keys. Changes stay in your draft until you publish.</p>
    <OwnerPriceReorderList items={content.prices.groups} label="Price groups" itemLabel={group => group.title || "price group"} disabled={disabled} onReorder={(source, target, after) => edit(draft => { reorderById(draft.prices.groups, source, target, after); })} onStep={(id, direction) => edit(draft => stepById(draft.prices.groups, id, direction))}>{(group, handle) => <Card title={group.title || "New price group"} action={<div className={ui.inlineActions}>{handle}<button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${group.title}”?`, "This removes the group and all its prices from this draft.", () => edit(draft => { draft.prices.groups = draft.prices.groups.filter(item => item.id !== group.id); }))}>Remove group</button></div>}>
      <div className={ui.twoCol}><Field label="Group name" value={group.title} onChange={value => edit(draft => { const current = draft.prices.groups.find(item => item.id === group.id); if (current) current.title = value; })} /><Field label="Short introduction" value={group.note} onChange={value => edit(draft => { const current = draft.prices.groups.find(item => item.id === group.id); if (current) current.note = value; })} /></div>
      <OwnerPriceReorderList items={group.items} label={`${group.title || "Group"} prices`} itemLabel={item => item.name || "price"} disabled={disabled} onReorder={(source, target, after) => edit(draft => { const current = draft.prices.groups.find(item => item.id === group.id); if (current) reorderById(current.items, source, target, after); })} onStep={(id, direction) => edit(draft => { const current = draft.prices.groups.find(item => item.id === group.id); if (current) stepById(current.items, id, direction); })}>{(item, itemHandle) => <div className={ui.priceRow}>
        <div className={ui.priceFields}><Field label="Item name" value={item.name} onChange={value => edit(draft => { const current = draft.prices.groups.find(entry => entry.id === group.id)?.items.find(entry => entry.id === item.id); if (current) current.name = value; })} /><MoneyField label="Starting price (USD)" value={item.price} onChange={value => edit(draft => { const current = draft.prices.groups.find(entry => entry.id === group.id)?.items.find(entry => entry.id === item.id); if (current) current.price = value; })} /><Field label="What is included?" value={item.detail} onChange={value => edit(draft => { const current = draft.prices.groups.find(entry => entry.id === group.id)?.items.find(entry => entry.id === item.id); if (current) current.detail = value; })} /></div>
        <div className={ui.rowEnd}>{itemHandle}<button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${item.name}”?`, "This item will be removed from the price group in your draft.", () => edit(draft => { const current = draft.prices.groups.find(entry => entry.id === group.id); if (current) current.items = current.items.filter(line => line.id !== item.id); }))}>Remove item</button></div>
      </div>}</OwnerPriceReorderList>
      <PriceItemChooser content={content} existingNames={group.items.map(item => item.name)} label="Add a price" disabled={disabled} onChoose={item => edit(draft => { const current = draft.prices.groups.find(entry => entry.id === group.id); if (current && !current.items.some(entry => priceNameKey(entry.name) === priceNameKey(item.name))) current.items.push({ id: newOwnerId("price"), ...item }); })} />
    </Card>}</OwnerPriceReorderList>
    <button type="button" className={ui.secondary} onClick={() => edit(draft => { draft.prices.groups.push({ id: newOwnerId("group"), title: "New group", note: "", items: [] }); })}>＋ Add a price group</button>
    <div className={ui.twoCol}>{(["parts", "extras"] as const).map(key => <Card key={key} title={key === "parts" ? "Individual parts" : "Extras & add-ons"}>
      <OwnerPriceReorderList items={content.prices[key]} label={key === "parts" ? "Individual parts" : "Extras and add-ons"} itemLabel={item => item.name || key} disabled={disabled} onReorder={(source, target, after) => edit(draft => { reorderById(draft.prices[key], source, target, after); })} onStep={(id, direction) => edit(draft => stepById(draft.prices[key], id, direction))}>{(item, handle) => <div className={ui.simplePrice}>
        <div className={ui.twoCol}><Field label="Name" value={item.name} onChange={value => edit(draft => { const current = draft.prices[key].find(entry => entry.id === item.id); if (current) current.name = value; })} /><MoneyField label="Price (USD)" value={item.price} onChange={value => edit(draft => { const current = draft.prices[key].find(entry => entry.id === item.id); if (current) current.price = value; })} /></div>
        <div className={ui.rowEnd}>{handle}<button type="button" className={ui.dangerLink} onClick={() => onRemove(`Remove “${item.name}”?`, "This item will be removed from your draft.", () => edit(draft => { draft.prices[key] = draft.prices[key].filter(line => line.id !== item.id); }))}>Remove</button></div>
      </div>}</OwnerPriceReorderList>
      <PriceItemChooser content={content} existingNames={content.prices[key].map(item => item.name)} label={key === "parts" ? "Add a part" : "Add an extra"} disabled={disabled} onChoose={item => edit(draft => { if (!draft.prices[key].some(entry => priceNameKey(entry.name) === priceNameKey(item.name))) draft.prices[key].push({ id: newOwnerId(key), name: item.name, price: item.price }); })} />
    </Card>)}</div>
  </div>;
}
