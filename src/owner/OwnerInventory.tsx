"use client";
import { RefreshButton } from "@/components/RefreshButton";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TrashIcon } from "./TrashIcon";
import type { InlineSelectCreate } from "@/components/SiteSelect";
import { OwnerSelect } from "./OwnerFields";
import { Dialog } from "./OwnerDialog";
import { generateAvailableInventoryBarcode, readInventory, restoreInventoryItem, saveInventoryCategories, saveInventoryItem, trashInventoryItem } from "./inventory-client";
import { INVENTORY_STANDARD_UNITS, barcodeAliases, code39Bars, emptyInventoryCategories, generatedInventoryBarcode, uniqueInventoryBarcode, inventoryStatus, inventoryTags, matchesInventory, normalizeBarcode, validInventoryBarcode, inventoryChoiceRemovalError, stepInventoryQuantity, type InventoryChoiceField, type InventoryCategories, type InventoryEdit, type InventoryItem } from "./inventory-model";
import { emptyInventoryScan, inventoryScanKey, inventoryScanTargetIsEditable } from "./inventory-scanner";
import buttons from "./OwnerButton.module.css";
import styles from "./OwnerInventory.module.css";
const action = `${buttons.button} ${buttons.secondary}`;
const primary = `${buttons.button} ${buttons.primary}`;
const statusLabel = { out: "Out Of Stock", low: "Low Stock", available: "In Stock" };
const blank = (): InventoryEdit => ({ name: "", kind: "material", categoryId: "", barcode: generatedInventoryBarcode(), tags: [], quantity: 0, unit: "pieces", lowStock: 1, notes: "", archived: false });
function editOf(item: InventoryItem): InventoryEdit { const { name, kind, categoryId, barcode, tags, quantity, unit, lowStock, notes, archived } = item; return { name, kind, categoryId, barcode, tags, quantity, unit, lowStock, notes, archived }; }
function errorField(message: string) {
  if (/item name/i.test(message)) return "name";
  if (/threshold/i.test(message)) return "lowStock";
  if (/adjustment note/i.test(message)) return "adjustment";
  if (/barcode|check digit/i.test(message)) return "barcode";
  if (/quantity/i.test(message)) return "quantity";
  if (/tags/i.test(message)) return "tags";
  if (/notes/i.test(message)) return "notes";
  return "";
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "Inventory could not be saved. Check your connection and try again."; }
export function InventoryBarcode({ value }: { value: string }) {
  const pattern = code39Bars(value);
  return <svg className={styles.barcode} viewBox={`0 0 ${pattern.width} ${pattern.height + 26}`} role="img" aria-label={`Code 39 barcode ${value}`} shapeRendering="crispEdges"><rect width={pattern.width} height={pattern.height + 26} fill="#fff" />{pattern.bars.map((bar, index) => <rect key={index} x={bar.x} y="5" width={bar.width} height={pattern.height} fill="#000" />)}<text x={pattern.width / 2} y={pattern.height + 19} textAnchor="middle" fontFamily="monospace" fontSize="10" fill="#000" shapeRendering="auto">{value}</text></svg>;
}
// Build labels from the acknowledged cloud item, never from an unsaved preview.
function printSavedItem(popup: Window, item: InventoryItem) {
  const doc = popup.document, body = doc.body;
  body.replaceChildren(); body.style.cssText = "margin:24px;font-family:Arial,sans-serif;color:#000;background:#fff;width:500px;max-width:calc(100% - 48px);text-align:center";
  const heading = doc.createElement("h1"); heading.textContent = item.name; heading.style.fontSize = "16px"; body.append(heading);
  const pattern = code39Bars(item.barcode), ns = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({ viewBox: `0 0 ${pattern.width} ${pattern.height + 26}`, width: "500", height: String(500 * (pattern.height + 26) / pattern.width), preserveAspectRatio: "xMidYMid meet", shapeRendering: "crispEdges" })) svg.setAttribute(key, value);
  const rect = (attributes: Record<string, string | number>) => { const node = doc.createElementNS(ns, "rect"); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); svg.append(node); };
  rect({ width: pattern.width, height: pattern.height + 26, fill: "#fff" });
  for (const bar of pattern.bars) rect({ x: bar.x, y: 5, width: bar.width, height: pattern.height, fill: "#000" });
  const text = doc.createElementNS(ns, "text");
  for (const [key, value] of Object.entries({ x: String(pattern.width / 2), y: String(pattern.height + 19), "text-anchor": "middle", "font-family": "monospace", "font-size": "10", fill: "#000", "shape-rendering": "auto" })) text.setAttribute(key, value);
  text.textContent = item.barcode; svg.append(text); svg.style.cssText = "display:block;width:100%;height:auto;margin:0 auto"; body.append(svg);
  const caption = doc.createElement("p"); caption.textContent = "Taylor Made Creations"; body.append(caption);
  doc.title = `${item.name} barcode`; popup.focus(); popup.print();
}
export function OwnerInventory({ onDirtyChange, onBusyChange }: { onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void } = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategories>(emptyInventoryCategories);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [category, setCategory] = useState("all"), [kind, setKind] = useState("all");
  const [editor, setEditor] = useState<{ previous: InventoryItem | null; initial: InventoryEdit; value: InventoryEdit } | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [categoryEditor, setCategoryEditor] = useState<{ id: string; name: string; initial: string } | null>(null);
  const [newChoice, setNewChoice] = useState<{ field: "kind" | "categoryId" | "unit"; name: string; context?: "editor" | "filter" | "dialog" } | null>(null);
  const [discard, setDiscard] = useState(false);
  const [generating, setGenerating] = useState(false), [archiveHelp, setArchiveHelp] = useState(false);
  const [label, setLabel] = useState<InventoryItem | null>(null);
  const [notice, setNotice] = useState("");
  const [trashTarget, setTrashTarget] = useState<InventoryItem | null>(null);
  const [barcodeAssignment, setBarcodeAssignment] = useState<"manual" | "generated">("manual");
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [choiceManager, setChoiceManager] = useState(false);
  const [choiceRename, setChoiceRename] = useState<{ field: InventoryChoiceField; value: string; name: string } | null>(null);
  const [highlightVersion, setHighlightVersion] = useState(0);
  const [finderMode, setFinderMode] = useState<"find" | "add">("find"), [highlightId, setHighlightId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false), [finderCode, setFinderCode] = useState(""), [finderError, setFinderError] = useState("");
  const [deleteChoice, setDeleteChoice] = useState<{ field: InventoryChoiceField; value: string; name: string } | null>(null);
  const finderInput = useRef<HTMLInputElement>(null);
  const scanBuffer = useRef(emptyInventoryScan());
  const lastScan = useRef({ barcode: "", at: 0 });
  const cardPointer = useRef<{ id: string; x: number; y: number } | null>(null);
  const field = editor && !newChoice && !label ? errorField(error) : "";
  const hasDialog = !!(choiceManager || choiceRename || editor || categoryEditor || label || trashTarget || unknownBarcode || deleteChoice || discard || finderOpen || newChoice?.context === "dialog");
  useEffect(() => {
    if (!error || busy || !hasDialog || newChoice) return;
    const target = document.getElementById(field ? `inventory-${field}` : "inventory-dialog-error");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "nearest" });
  }, [error, busy, field, hasDialog, newChoice]);
  function invalid(name: string) { return { id: `inventory-${name}`, "aria-invalid": field === name || undefined, "aria-describedby": field === name ? `inventory-${name}-error` : undefined }; }
  function fieldMessage(name: string) { return field === name ? <small id={`inventory-${name}-error`} className={styles.fieldError}>{error}</small> : null; }
  const modalError = error && !newChoice ? <div id="inventory-dialog-error" tabIndex={-1} role="alert" className={styles.error}><strong>Please check this before continuing</strong><div>{error}</div></div> : null;
  const search = useRef<HTMLInputElement>(null), active = useRef(true), pending = useRef(false), generation = useRef(0);
  const pendingPrint = useRef<Window | null>(null);
  useEffect(() => () => { pendingPrint.current?.close(); pendingPrint.current = null; }, []);
  const dirty = !!(choiceRename && choiceRename.name !== (choiceRename.field === "unit" ? choiceRename.value : (choiceRename.field === "kind" ? categories.itemTypes : categories.categories)?.find(choice => choice.id === choiceRename.value)?.name)) || !!newChoice?.name.trim() || !!(editor && (JSON.stringify(editor.initial) !== JSON.stringify(editor.value) || adjustment)) || !!(categoryEditor && categoryEditor.name !== categoryEditor.initial);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { if (!dirty && !busy) return; const block = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", block); return () => window.removeEventListener("beforeunload", block); }, [dirty, busy]);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const run = ++generation.current; setLoading(true); setError("");
    try { const next = await readInventory(); if (active.current && generation.current === run) { setItems(next.items); setCategories(next.categories); } }
    catch (cause) { if (active.current && generation.current === run) setError(errorText(cause)); }
    finally { if (active.current && generation.current === run) setLoading(false); }
  }, []);
  useEffect(() => { active.current = true; let disposed = false; const lifecycle = generation; void Promise.resolve().then(() => { if (!disposed) return refresh(); }); return () => { disposed = true; active.current = false; lifecycle.current++; }; }, [refresh]);
  async function perform(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await work(); return true; } catch (cause) { if (active.current) setError(errorText(cause)); return false; }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  function openCard(event: MouseEvent<HTMLElement>, item: InventoryItem) {
    const start = cardPointer.current;
    cardPointer.current = null;
    if (busy || loading || item.trashedAt || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target.closest?.('button,a,input,select,textarea,summary,[role="button"],[role="combobox"],[contenteditable="true"],code')) return;
    if (window.getSelection?.()?.toString()) return;
    if (start?.id === item.id && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    open(item);
  }
  const open = useCallback((item?: InventoryItem, barcode?: string) => { if (busy || loading || item?.trashedAt) return; setBarcodeAssignment(item || barcode ? "manual" : "generated"); const value = item ? editOf(item) : { ...blank(), barcode: barcode ?? uniqueInventoryBarcode(items) }; setNewChoice(null); setArchiveHelp(false); setEditor({ previous: item ?? null, initial: structuredClone(value), value }); setAdjustment(""); setError(""); }, [busy, loading, items]);
  function close() { if (busy) return; if (dirty) setDiscard(true); else { setEditor(null); setCategoryEditor(null); setNewChoice(null); } }
  function change<K extends keyof InventoryEdit>(key: K, value: InventoryEdit[K]) { setEditor(current => current ? { ...current, value: { ...current.value, [key]: value } } : current); }
  const typeOptions = [{ value: "material", label: "Material" }, { value: "finished", label: "Finished item" }, ...(categories.itemTypes ?? []).map(type => ({ value: type.id, label: type.name }))];
  const unitOptions = [...new Set([...INVENTORY_STANDARD_UNITS, ...(categories.units ?? []), ...(editor ? [editor.value.unit] : [])])].map(unit => ({ value: unit, label: unit }));
  function choose(field: "kind" | "categoryId" | "unit", value: string) { if (value === "__create__") setNewChoice({ field, name: "" }); else change(field, value); }
  function inlineChoice(field: "kind" | "categoryId" | "unit", label: string, context: "editor" | "filter" = "editor"): Omit<InlineSelectCreate, "onSubmit"> {
    return {
      active: newChoice?.field === field && (newChoice.context ?? "editor") === context, name: newChoice?.field === field && (newChoice.context ?? "editor") === context ? newChoice.name : "",
      label, maxLength: field === "unit" ? 30 : 80, busy, error: newChoice?.field === field ? error : "",
      onStart: () => { setNewChoice({ field, name: "", context }); setError(""); },
      onCancel: () => { setNewChoice(current => current?.field === field && (current.context ?? "editor") === context ? null : current); setError(""); },
      onNameChange: name => setNewChoice({ field, name, context }),
    };
  }
  async function createChoice() {
    if (!newChoice) return;
    const name = newChoice.name.trim(), id = crypto.randomUUID();
    if (!name) throw new Error("Enter a name first.");
    const field = newChoice.field, context = newChoice.context ?? "editor";
    if (field === "unit" && unitOptions.some(option => option.value.toLowerCase() === name.toLowerCase())) throw new Error("That unit already exists. Select it from the list.");
    const saved = await saveInventoryCategories(categories, field === "categoryId" ? [...categories.categories, { id, name }] : categories.categories,
      field === "kind" ? { itemTypes: [...(categories.itemTypes ?? []), { id, name }] } : field === "unit" ? { units: [...(categories.units ?? []), name] } : {});
    if (active.current) { setCategories(saved); if (context === "editor") change(field, field === "unit" ? name : id); else if (field === "categoryId") setCategory(id); else if (field === "kind") setKind(id); setNewChoice(null); }
  }
  const available = items.filter(item => !item.archived && !item.trashedAt);
  const out = available.filter(item => inventoryStatus(item) === "out").length, low = available.filter(item => inventoryStatus(item) === "low").length;
  const visible = items.filter(item => (filter === "trash" ? !!item.trashedAt : !item.trashedAt && (filter === "archived" ? item.archived : !item.archived)) && (filter === "attention" ? inventoryStatus(item) !== "available" : filter === "low" || filter === "out" ? inventoryStatus(item) === filter : true) && (category === "all" || item.categoryId === category) && (kind === "all" || item.kind === kind) && matchesInventory(item, query)).sort((a, b) => a.name.localeCompare(b.name));
  // Scanner identity is stabilized for the capture listener; mutable burst state is event-only.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const scanBarcode = useCallback((input: string, automatic = false) => {
    if (busy || loading || hasDialog && !finderOpen) return;
    const raw = input.trim().toUpperCase(), value = raw.startsWith("*") && raw.endsWith("*") && raw.length > 2 ? raw.slice(1, -1) : raw;
    if (!value) { if (finderOpen) setFinderError("Enter or scan a barcode first."); return; }
    const now = Date.now();
    if (automatic && lastScan.current.barcode === value && now - lastScan.current.at < 1200) return;
    lastScan.current = { barcode: value, at: now };
    const match = items.find(item => !item.trashedAt && barcodeAliases(item.barcode).includes(value));
    if (match) { setFinderOpen(false); setFinderError(""); setError("");
      if (finderOpen && finderMode === "add") { setNotice(""); open(match); }
      else { setQuery(""); setCategory("all"); setKind("all"); setFilter(match.archived ? "archived" : "all"); setHighlightId(match.id); setHighlightVersion(value => value + 1); setNotice(`Found ${match.name}`); }
    }
    else if (validInventoryBarcode(value)) { setFinderOpen(false); setFinderError(""); setError(""); setUnknownBarcode(value); }
    else (finderOpen ? setFinderError : setNotice)("That scan is not a supported inventory barcode. Enter 1–24 letters, numbers, periods or hyphens in Find Barcode, then choose Find item.");
  }, [busy, loading, hasDialog, finderOpen, finderMode, items, open]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  useEffect(() => {
    if (!highlightId) return;
    const frame = requestAnimationFrame(() => document.getElementById(`inventory-card-${highlightId}`)?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    const timer = setTimeout(() => setHighlightId(null), 5000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [highlightId, highlightVersion]);
  async function renameChoice() {
    if (!choiceRename) return;
    const { field, value } = choiceRename, name = choiceRename.name.trim();
    if (!name) throw new Error("Enter a name.");
    if (field === "unit" && name !== value) { const error = inventoryChoiceRemovalError(items, "unit", value); if (error) throw new Error(error); }
    const next = await saveInventoryCategories(categories,
      field === "categoryId" ? categories.categories.map(item => item.id === value ? { ...item, name } : item) : categories.categories,
      field === "kind" ? { itemTypes: (categories.itemTypes ?? []).map(item => item.id === value ? { ...item, name } : item) } : field === "unit" ? { units: (categories.units ?? []).map(unit => unit === value ? name : unit) } : {});
    if (active.current) { setCategories(next); setChoiceRename(null); setNotice("Saved Successfully"); }
  }
  function scan() { scanBarcode(query); }
  useEffect(() => {
    scanBuffer.current = emptyInventoryScan();
    if (busy || loading || hasDialog) return;
    const capture = (event: KeyboardEvent) => {
      if (event.defaultPrevented || inventoryScanTargetIsEditable(event.target)) { scanBuffer.current = emptyInventoryScan(); return; }
      const next = inventoryScanKey(scanBuffer.current, event.key, event.timeStamp, { repeat: event.repeat, modified: event.ctrlKey || event.metaKey || event.altKey, composing: event.isComposing });
      scanBuffer.current = next.state;
      if (next.barcode) { event.preventDefault(); event.stopPropagation(); scanBarcode(next.barcode, true); }
    };
    const reset = () => { scanBuffer.current = emptyInventoryScan(); };
    const captureOptions = { capture: true };
    window.addEventListener("keydown", capture, captureOptions); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", capture, captureOptions); window.removeEventListener("blur", reset); reset(); };
  }, [busy, loading, hasDialog, scanBarcode]);
  async function removeChoice() {
    if (!deleteChoice) return;
    const message = inventoryChoiceRemovalError(items, deleteChoice.field, deleteChoice.value);
    if (message) throw new Error(message);
    const next = await saveInventoryCategories(categories,
      deleteChoice.field === "categoryId" ? categories.categories.filter(choice => choice.id !== deleteChoice.value) : categories.categories,
      deleteChoice.field === "kind" ? { itemTypes: (categories.itemTypes ?? []).filter(choice => choice.id !== deleteChoice.value) } : deleteChoice.field === "unit" ? { units: (categories.units ?? []).filter(unit => unit !== deleteChoice.value) } : {});
    if (!active.current) return;
    setCategories(next); setDeleteChoice(null); setNotice("Inventory choice deleted from the cloud. No item records were changed.");
    if (deleteChoice.field === "categoryId" && category === deleteChoice.value) setCategory("all");
    if (deleteChoice.field === "kind" && kind === deleteChoice.value) setKind("all");
  }
  function printLabel() {
    if (!label) return;
    let popup: Window | null = null;
    try { popup = window.open("", "_blank", "width=700,height=450"); } catch { /* Report the blocked window below. */ }
    if (!popup) { setError("Allow the print window in your browser to print this label."); return; }
    popup.opener = null;
    try { printSavedItem(popup, label); setError(""); } catch { popup.close(); setError("The label could not open. Your item is saved. Please try printing again."); }
  }
  async function saveItem(andPrint = false) {
    if (!editor || newChoice || pending.current) return;
    // Reserve the window during the click so browsers need not allow async popups.
    let popup: Window | null = null;
    if (andPrint) {
      try {
        popup = window.open("", "_blank", "width=700,height=450");
        if (popup) { popup.opener = null; popup.document.title = "Saving inventory item"; popup.document.body.textContent = "Saving item before preparing the label…"; pendingPrint.current = popup; }
      } catch { popup?.close(); popup = null; /* Offer manual printing after saving. */ }
    }
    const success = await perform(async () => {
      const saved = await saveInventoryItem(editor.previous, editor.value, adjustment, { barcodeAssignment });
      if (!active.current) return;
      setItems(current => [...current.filter(item => item.id !== saved.id), saved]);
      setEditor(null); setAdjustment(""); setNotice("Inventory saved to the cloud.");
      if (andPrint) {
        setLabel(saved);
        if (!popup || popup.closed) setError("Item saved. Select Print label to open a new print window.");
        else {
          try { printSavedItem(popup, saved); }
          catch { popup.close(); setError("Item saved, but the label could not open. Select Print label to try again."); }
        }
      }
    });
    if (!success || !active.current) popup?.close();
    pendingPrint.current = null;
  }
  return <div className={styles.root} aria-label="Inventory">
    <div className={styles.summary}><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><strong>{available.length}</strong><span>Active items</span></button><button type="button" aria-pressed={filter === "low"} onClick={() => setFilter("low")}><strong>{low}</strong><span>Low stock</span></button><button type="button" aria-pressed={filter === "out"} onClick={() => setFilter("out")}><strong>{out}</strong><span>Out of stock</span></button></div>
    <div className={styles.toolbar}><button type="button" data-owner-button className={primary} disabled={loading || busy} onClick={() => open()}>New Item</button><button type="button" data-owner-button className={action} disabled={loading || busy} onClick={() => setCategoryEditor({ id: crypto.randomUUID(), name: "", initial: "" })}>New Category</button><button type="button" data-owner-button className={action} disabled={loading || busy} onClick={() => { setError(""); setNewChoice({ field: "kind", name: "", context: "dialog" }); }}>New Item Type</button><button type="button" data-owner-button className={action} disabled={loading || busy} onClick={() => { setFinderMode("add"); setFinderCode(""); setFinderError(""); setFinderOpen(true); }}>Add Inventory</button><button type="button" data-owner-button className={action} disabled={loading || busy} onClick={() => { setFinderMode("find"); setFinderCode(query); setFinderError(""); setFinderOpen(true); }}>Find Barcode</button><button type="button" data-owner-button className={action} disabled={loading || busy} aria-label="Manage inventory choices" title="Edit categories, item types and units" onClick={() => { setError(""); setChoiceManager(true); }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg></button><RefreshButton className={styles.toolbarRefresh} label="Refresh inventory" busy={loading} disabled={busy} onClick={() => void refresh()} /></div>
    <div className={styles.filters}><label>Search or scan barcode<input ref={search} value={query} placeholder="Name, tag or barcode" onChange={event => { setQuery(event.target.value); setNotice(""); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent?.isComposing && event.nativeEvent?.keyCode !== 229 && !event.repeat) { event.preventDefault(); scan(); } }} /></label><OwnerSelect label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "Active items" }, { value: "attention", label: "Needs restocking" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }, { value: "archived", label: "Archived items" }, { value: "trash", label: "Trash" }]} /><OwnerSelect label="Item type" value={kind} onChange={setKind} options={[{ value: "all", label: "All item types" }, ...typeOptions, { value: "__create__", label: "+ Create item type" }]} inlineCreate={{ ...inlineChoice("kind", "New item type", "filter"), onSubmit: async () => (await perform(createChoice)) === true }} /><OwnerSelect label="Category" value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, { value: "", label: "Uncategorized" }, ...categories.categories.map(item => ({ value: item.id, label: item.name })), { value: "__create__", label: "+ Create category" }]} inlineCreate={{ ...inlineChoice("categoryId", "New category", "filter"), onSubmit: async () => (await perform(createChoice)) === true }} /></div>
    <div className={styles.scanHelp}><p className={styles.hint}>Scanner ready while Inventory is open. USB / Bluetooth readers ending with Enter or Tab highlight the item. Use Add Inventory to scan into the editor. Scanning pauses in forms and dialogs. For slower readers or keyboard access, enter a barcode above and press Enter or choose Find barcode.</p></div>
    <>{choiceManager && <Dialog title="Inventory choices" onClose={() => { if (!busy) setChoiceManager(false); }} dismissDisabled={busy} actions={<button type="button" data-owner-button className={action} disabled={busy} onClick={() => setChoiceManager(false)}>Close</button>}><div className={styles.categories}><p className={styles.hint}>Delete unused custom choices. Choices used by any item (including archived items and Trash) must be reassigned first. Built-in item types and standard units stay available.</p>
      {([{ field: "categoryId" as const, label: "Categories", choices: categories.categories.map(choice => ({ value: choice.id, name: choice.name })) }, { field: "kind" as const, label: "Custom item types", choices: (categories.itemTypes ?? []).map(choice => ({ value: choice.id, name: choice.name })) }, { field: "unit" as const, label: "Custom units", choices: (categories.units ?? []).map(unit => ({ value: unit, name: unit })) }]).map(group => <div key={group.field}><h3 className={styles.choiceHeading}>{group.label}</h3>{group.choices.length ? <ul className={styles.choiceList}>{group.choices.map(choice => <li key={choice.value}><span>{choice.name}</span><button type="button" data-owner-button className={`${action} ${buttons.icon}`} aria-label={`Edit ${choice.name}`} disabled={loading || busy} onClick={() => { setError(""); setChoiceRename({ field: group.field, value: choice.value, name: choice.name }); }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg></button><button type="button" data-owner-button className={action} aria-label={`Delete ${group.label.toLowerCase()}: ${choice.name}`} disabled={loading || busy} onClick={() => { setError(""); setDeleteChoice({ field: group.field, ...choice }); }}><TrashIcon /></button></li>)}</ul> : <p className={styles.hint}>No custom choices yet.</p>}</div>)}
    </div></Dialog>}</>
    {error && !choiceRename && !editor && !categoryEditor && !label && !trashTarget && !deleteChoice && !unknownBarcode && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading inventory…</p> : <><p className={styles.hint}>{visible.length} {visible.length === 1 ? "item" : "items"}</p><div className={styles.grid}>{visible.map(item => <article className={`${styles.card} ${!item.trashedAt && !busy ? styles.openableCard : ""}`} key={item.id} id={`inventory-card-${item.id}`} data-scan-highlight={highlightId === item.id || undefined} tabIndex={!item.trashedAt && !busy ? 0 : undefined} aria-label={`${item.name}${item.trashedAt ? ", in Trash" : ", press Enter to edit"}`} onPointerDown={event => { cardPointer.current = { id: item.id, x: event.clientX, y: event.clientY }; }} onClick={event => openCard(event, item)} onKeyDown={event => {
      if (event.target !== event.currentTarget || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || busy || item.trashedAt) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(item); }
    }}><div className={styles.cardTop}><h3>{item.name}</h3><div className={styles.cardBadges}><span className={styles[inventoryStatus(item)]}>{statusLabel[inventoryStatus(item)]}</span>{(item.trashedAt || item.archived) && <span className={styles.archived}>{item.trashedAt ? "In Trash" : "Archived"}</span>}</div></div><p>{typeOptions.find(type => type.value === item.kind)?.label ?? "Custom item"}{item.categoryId ? ` · ${categories.categories.find(c => c.id === item.categoryId)?.name ?? "Uncategorized"}` : ""}</p><p className={styles.quantity}>{item.quantity.toLocaleString()} <span>{item.unit}</span></p><p className={styles.hint}>Low-stock alert at {item.lowStock.toLocaleString()} {item.unit}</p><code className={styles.code}>{item.barcode}</code>{item.tags.length > 0 && <div className={styles.tags}>{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}<div className={styles.cardActions}>{item.trashedAt ? <button type="button" data-owner-button className={action} disabled={busy} onClick={() => void perform(async () => { const saved = await restoreInventoryItem(item); if (active.current) { setItems(current => current.map(row => row.id === saved.id ? saved : row)); setNotice("Item restored. Its saved stock and history are kept."); } })}>Restore item</button> : <><button type="button" data-owner-button className={`${action} ${styles.cardIcon}`} disabled={busy} aria-label={`Edit ${item.name}`} title="Edit / update stock" onClick={() => open(item)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg></button><button type="button" data-owner-button className={`${action} ${styles.cardIcon}`} disabled={busy} aria-label={`Print barcode for ${item.name}`} title="Print barcode" onClick={() => { setLabel(item); setError(""); }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 9V3h12v6M6 17H3v-8h18v8h-3M6 14h12v7H6zM17 12h1" /></svg></button><button type="button" data-owner-button className={`${action} ${styles.cardIcon} ${styles.trashButton}`} disabled={busy} aria-label={`Move ${item.name} to Trash`} title="Move to Trash" onClick={() => { setTrashTarget(item); setError(""); }}><TrashIcon /></button></>}</div></article>)}</div>{!visible.length && <p className={styles.empty}>{items.length ? "No items match these filters." : "Add your first material or finished creation to start tracking stock."}</p>}</>}
    {editor && <Dialog title={editor.previous ? "Edit inventory item" : "New inventory item"} onClose={close} dismissDisabled={busy} wide actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={close}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy || !!newChoice} onClick={() => void saveItem()}>{busy ? "Saving…" : "Save item"}</button></>}>
      {!label && modalError}
      <fieldset className={styles.form} disabled={busy}><label>Item name<input {...invalid("name")} maxLength={150} value={editor.value.name} onChange={event => change("name", event.target.value)} />{fieldMessage("name")}</label><OwnerSelect label="Item type" value={editor.value.kind} onChange={value => choose("kind", value)} options={[...typeOptions, { value: "__create__", label: "+ Create item type" }]} inlineCreate={{ ...inlineChoice("kind", "New item type"), onSubmit: async () => (await perform(createChoice)) === true }} /><OwnerSelect label="Category" value={editor.value.categoryId} onChange={value => choose("categoryId", value)} options={[{ value: "", label: "Uncategorized" }, ...categories.categories.map(item => ({ value: item.id, label: item.name })), { value: "__create__", label: "+ Create category" }]} inlineCreate={{ ...inlineChoice("categoryId", "New category"), onSubmit: async () => (await perform(createChoice)) === true }} /><label>Tags, separated by commas<input {...invalid("tags")} maxLength={1019} value={editor.value.tags.join(",")} onChange={event => change("tags", event.target.value.split(","))} onBlur={event => change("tags", inventoryTags(event.target.value))} />{fieldMessage("tags")}</label><label>Quantity<input {...invalid("quantity")} type="number" min="0" max="1000000" step="1" onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); change("quantity", stepInventoryQuantity(editor.value.quantity, event.key === "ArrowUp" ? 1 : -1)); } }} value={Number.isNaN(editor.value.quantity) ? "" : editor.value.quantity} onChange={event => change("quantity", event.target.value === "" ? NaN : Number(event.target.value))} />{fieldMessage("quantity")}</label><OwnerSelect label="Unit" value={editor.value.unit} onChange={value => choose("unit", value)} options={[...unitOptions, { value: "__create__", label: "+ Create unit" }]} inlineCreate={{ ...inlineChoice("unit", "New unit"), onSubmit: async () => (await perform(createChoice)) === true }} /><label>Low-stock alert at or below<input {...invalid("lowStock")} type="number" min="0" max="1000000" step="1" aria-describedby={field === "lowStock" ? "inventory-lowStock-error inventory-threshold-help" : "inventory-threshold-help"} value={Number.isNaN(editor.value.lowStock) ? "" : editor.value.lowStock} onChange={event => change("lowStock", event.target.value === "" ? NaN : Number(event.target.value))} />{fieldMessage("lowStock")}<small id="inventory-threshold-help" className={styles.hint}>Whole numbers or halves, such as 1 or 1.5.</small></label><label>Stock adjustment note<input {...invalid("adjustment")} maxLength={200} value={adjustment} onChange={event => setAdjustment(event.target.value)} placeholder="Received shipment, used for a commission…" />{fieldMessage("adjustment")}</label><label className={styles.full}>Barcode<div className={styles.barcodeInput}><input {...invalid("barcode")} maxLength={24} value={editor.value.barcode} onChange={event => { setBarcodeAssignment("manual"); change("barcode", normalizeBarcode(event.target.value)); }} /><button type="button" data-owner-button className={action} disabled={busy} aria-busy={generating} onClick={() => void perform(async () => { setGenerating(true); try { const barcode = await generateAvailableInventoryBarcode(); if (active.current) { setBarcodeAssignment("generated"); change("barcode", barcode); } } finally { if (active.current) setGenerating(false); } })}>{generating && <span className={styles.spinner} aria-hidden="true" />}{generating ? "Generating…" : "Generate"}</button></div>{fieldMessage("barcode")}</label><label className={styles.full}>Notes<textarea {...invalid("notes")} maxLength={2000} rows={2} value={editor.value.notes} onChange={event => change("notes", event.target.value)} />{fieldMessage("notes")}</label><div className={styles.archiveRow}><label className={styles.check}><input type="checkbox" checked={editor.value.archived} onChange={event => change("archived", event.target.checked)} />Archive this item</label><div className={styles.helpWrap}><button type="button" data-owner-button className={styles.helpButton} aria-label="What does archiving an item do?" aria-expanded={archiveHelp} aria-controls="inventory-archive-help" onClick={() => setArchiveHelp(value => !value)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setArchiveHelp(false); } }}>?</button><span id="inventory-archive-help" role="tooltip" className={styles.helpText} data-open={archiveHelp}>Archiving hides this item from active inventory and stock alerts. Its quantity, barcode and history are kept. Choose Archived items to edit it and clear this option to restore it.</span></div></div></fieldset>

      <div className={styles.printRow}><span className={styles.hint}>Labels print only after the item is saved.</span><div className={styles.printActions}><button type="button" data-owner-button className={primary} disabled={busy || !!newChoice} onClick={() => void saveItem(true)}>Save item and print</button>{editor.previous && <button type="button" data-owner-button className={action} disabled={busy || dirty || !editor.previous} onClick={() => { if (editor.previous && !dirty) { setLabel(editor.previous); setError(""); } }}>Print saved barcode</button>}</div></div>{validInventoryBarcode(editor.value.barcode) && <details className={styles.barcodePreview}><summary>Preview barcode</summary><InventoryBarcode value={editor.value.barcode} /></details>}
      {editor.previous && <details className={styles.history}><summary>Recent stock changes</summary><p className={styles.hint}>Latest 30 quantity changes.</p>{editor.previous.history.map((entry, index) => <p key={`${entry.at}-${index}`}>{new Date(entry.at).toLocaleString()} · {entry.from} {entry.fromUnit} → {entry.to} {entry.unit} · {entry.note}</p>)}</details>}
    </Dialog>}
    {finderOpen && <Dialog initialFocusRef={finderInput} title={finderMode === "add" ? "Add Inventory" : "Find Barcode"} onClose={() => setFinderOpen(false)} actions={<button type="button" data-owner-button className={action} onClick={() => setFinderOpen(false)}>Close</button>}><form onSubmit={event => { event.preventDefault(); scanBarcode(finderCode); }}><label>Barcode<input ref={finderInput} autoFocus autoComplete="off" value={finderCode} maxLength={64} onChange={event => { setFinderCode(event.target.value); setFinderError(""); }} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229 || event.repeat)) event.preventDefault(); }} /></label><p className={styles.hint}>Scan or type the barcode, with or without its check digit. This finds your saved inventory, not a public product database.</p>{finderError && <p role="alert" className={styles.error}>{finderError}</p>}<button type="submit" data-owner-button className={primary} disabled={!finderCode.trim()}>{finderMode === "add" ? "Open item" : "Find item"}</button></form></Dialog>}
    {choiceRename && <Dialog title="Edit inventory choice" onClose={() => { if (!busy) setChoiceRename(null); }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={() => setChoiceRename(null)}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy || !choiceRename.name.trim()} onClick={() => void perform(renameChoice)}>Save</button></>}><label className={styles.choiceField}>Name<input autoFocus maxLength={80} value={choiceRename.name} disabled={busy} onChange={event => setChoiceRename(current => current ? { ...current, name: event.target.value } : null)} /></label>{choiceRename.field === "unit" && <p className={styles.hint}>Units already used by inventory must be reassigned before renaming.</p>}{modalError}</Dialog>}
    {newChoice?.context === "dialog" && <Dialog title="New item type" onClose={close} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={close}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy || !newChoice.name.trim()} onClick={() => void perform(createChoice)}>Create item type</button></>}><label className={styles.choiceField}>Item type name<input autoFocus maxLength={80} value={newChoice.name} disabled={busy} onChange={event => setNewChoice(current => current ? { ...current, name: event.target.value } : current)} /></label>{error && <p role="alert" className={styles.error}>{error}</p>}</Dialog>}
    {unknownBarcode && <Dialog draggable={false} title="Barcode not found" onClose={() => setUnknownBarcode(null)} actions={<><button type="button" data-owner-button className={action} onClick={() => setUnknownBarcode(null)}>Close</button><button type="button" data-owner-button className={primary} onClick={() => { const barcode = unknownBarcode; setUnknownBarcode(null); open(undefined, barcode); }}>Add Item</button></>}><p>No inventory item uses <strong>{unknownBarcode}</strong>. Create a new item with this barcode?</p><p className={styles.hint}>No stock or item is saved until you choose Save item.</p></Dialog>}
    {deleteChoice && <Dialog draggable={false} title={`Delete ${deleteChoice.field === "categoryId" ? "category" : deleteChoice.field === "kind" ? "item type" : "unit"}?`} onClose={() => { if (!busy) setDeleteChoice(null); }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={() => setDeleteChoice(null)}>Keep choice</button><button type="button" data-owner-button className={primary} disabled={busy || !!inventoryChoiceRemovalError(items, deleteChoice.field, deleteChoice.value)} onClick={() => void perform(removeChoice)}>{busy ? "Deleting…" : "Delete choice"}</button></>}>{modalError}<p>Delete <strong>{deleteChoice.name}</strong> from inventory choices?</p>{inventoryChoiceRemovalError(items, deleteChoice.field, deleteChoice.value) ? <p role="status" className={styles.error}>{inventoryChoiceRemovalError(items, deleteChoice.field, deleteChoice.value)}</p> : <p>No saved items use this choice. The cloud checks again before deletion.</p>}</Dialog>}
    {trashTarget && <Dialog draggable={false} title="Move inventory item to Trash?" onClose={() => { if (!pending.current) setTrashTarget(null); }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={() => void perform(async () => { const saved = await trashInventoryItem(trashTarget); if (active.current) { setItems(current => current.map(row => row.id === saved.id ? saved : row)); setTrashTarget(null); setNotice("Item moved to Trash. Choose Trash in the Show menu to restore it."); } })}>{busy ? "Moving…" : "Move to Trash"}</button><button type="button" data-owner-button className={primary} disabled={busy} onClick={() => setTrashTarget(null)}>Keep item</button></>}>{modalError}<p><strong>{trashTarget.name}</strong> will leave active inventory. Its stock and history are kept in Trash.</p><p>Its released barcode cannot be generated for 60 days. It can be manually assigned to another item if unused. Restoring this item requires its barcode to still be available.</p></Dialog>}
    {categoryEditor && <Dialog title={categoryEditor.initial ? "Rename category" : "New category"} onClose={close} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={action} disabled={busy} onClick={close}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy || !categoryEditor.name.trim()} onClick={() => void perform(async () => { const value = { id: categoryEditor.id, name: categoryEditor.name.trim() }; const next = categories.categories.some(c => c.id === value.id) ? categories.categories.map(c => c.id === value.id ? value : c) : [...categories.categories, value]; const saved = await saveInventoryCategories(categories, next); if (active.current) { setCategories(saved); setCategoryEditor(null); setNotice("Category saved."); } })}>Save category</button></>}>{modalError}<label className={styles.categoryName}>Category name<input maxLength={80} autoFocus value={categoryEditor.name} disabled={busy} onChange={event => setCategoryEditor(current => current ? { ...current, name: event.target.value } : null)} /></label></Dialog>}
    {discard && <Dialog draggable={false} title="Discard unsaved inventory changes?" onClose={() => setDiscard(false)} actions={<><button type="button" data-owner-button className={action} onClick={() => { setDiscard(false); setEditor(null); setCategoryEditor(null); setNewChoice(null); setAdjustment(""); }}>Discard changes</button><button type="button" data-owner-button className={primary} onClick={() => setDiscard(false)}>Keep editing</button></>} />}
    {label && <Dialog title="Barcode label" onClose={() => setLabel(null)} actions={<><button type="button" data-owner-button className={action} onClick={() => setLabel(null)}>Close</button><button type="button" data-owner-button className={primary} onClick={printLabel}>Print label</button></>}>{modalError}<div id="inventory-print-label"><h3>{label.name}</h3><InventoryBarcode value={label.barcode} /></div><p className={styles.hint}>Code 39 with a Mod43 check digit. Search accepts scans with or without the check digit. Print at a readable size without cropping the white margins.</p></Dialog>}
  </div>;
}
