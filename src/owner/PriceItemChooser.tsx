"use client";
import { useEffect, useRef, useState } from "react";
import type { OwnerContent, PriceItem } from "./model";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerPricesManager.module.css";

export type PriceSuggestion = Pick<PriceItem, "name" | "price" | "detail">;
export function priceNameKey(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }
export function priceSuggestions(content: OwnerContent): PriceSuggestion[] {
  const seen = new Set<string>();
  return [...content.prices.groups.flatMap(group => group.items), ...content.prices.parts.map(item => ({ ...item, detail: "" })), ...content.prices.extras.map(item => ({ ...item, detail: "" }))].filter(item => {
    const key = priceNameKey(item.name); if (!key || seen.has(key)) return false; seen.add(key); return true;
  }).map(({ name, price, detail }) => ({ name, price, detail }));
}
/** A selection reuses known wording and prices; each destination rejects duplicate names. */
export function PriceItemChooser({ content, existingNames, label, disabled = false, onChoose }: { content: OwnerContent; existingNames: string[]; label: string; disabled?: boolean; onChoose: (item: PriceSuggestion) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const region = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const existing = new Set(existingNames.map(priceNameKey));
  const all = priceSuggestions(content), key = priceNameKey(query);
  const matches = all.filter(item => !key || priceNameKey(item.name).includes(key));
  const exact = all.find(item => priceNameKey(item.name) === key);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: Event) => { if (region.current && !region.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function choose(item: PriceSuggestion) { if (disabled || existing.has(priceNameKey(item.name))) return; onChoose(item); setQuery(""); setOpen(false); }
  return <div ref={region} className={styles.itemChooser} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); region.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }}>
    <button type="button" className={ui.addButton} disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>＋ {label}</button>
    {open && <div className={styles.itemChooserPanel}>
      <label className={ui.field}><span>Search existing items or name a new one</span><input ref={input} type="search" value={query} maxLength={150} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && key && !existing.has(key)) { event.preventDefault(); choose(exact ?? { name: query.trim(), price: 0, detail: "" }); } }} /></label>
      <div className={styles.itemChoices} aria-label="Available items">{matches.map(item => <button type="button" key={priceNameKey(item.name)} disabled={disabled || existing.has(priceNameKey(item.name))} onClick={() => choose(item)}><span>{item.name}</span><small>{existing.has(priceNameKey(item.name)) ? "Already added" : `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</small></button>)}</div>
      {key && !exact && <button type="button" className={ui.secondary} disabled={disabled || existing.has(key)} onClick={() => choose({ name: query.trim(), price: 0, detail: "" })}>＋ Create “{query.trim()}”</button>}
      {!matches.length && !key && <p className={ui.help}>Type a name to add your first item.</p>}
    </div>}
  </div>;
}
