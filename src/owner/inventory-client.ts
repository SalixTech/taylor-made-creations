"use client";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore/lite";
import { taylorOwnerSession } from "./taylor-services-client";
import { INVENTORY_STANDARD_UNITS, barcodeAliases, barcodeKey, inventoryChoiceRemovalError, INVENTORY_BARCODE_HOLD_MS, inventoryTimestamp, validInventoryBarcode, decodeInventoryCategories, decodeInventoryItem, emptyInventoryCategories, generatedInventoryBarcode, inventoryId, validateInventoryEdit, type InventoryCategories, type InventoryEdit, type InventoryItem } from "./inventory-model";
export const INVENTORY_ITEMS = "ownerInventory";
export const INVENTORY_CATEGORIES = "ownerInventorySettings/categories";
export const INVENTORY_BARCODES = "ownerInventoryBarcodes";
function data(item: InventoryItem) { const { id: _id, ...value } = item; void _id; return value; }
export async function readInventory() {
  const session = await taylorOwnerSession();
  const [items, categories] = await Promise.all([getDocs(collection(session.db, INVENTORY_ITEMS)), getDoc(doc(session.db, INVENTORY_CATEGORIES))]);
  session.assertCurrent();
  return { items: items.docs.map(item => decodeInventoryItem(item.data(), item.id)), categories: categories.exists() ? decodeInventoryCategories(categories.data()) : emptyInventoryCategories() };
}
function sameInventoryChoices(a: InventoryCategories, b: InventoryCategories) {
  return JSON.stringify([a.categories, a.itemTypes ?? [], a.units ?? []]) === JSON.stringify([b.categories, b.itemTypes ?? [], b.units ?? []]);
}
export async function saveInventoryCategories(previous: InventoryCategories, categories: InventoryCategories["categories"], options: Pick<InventoryCategories, "itemTypes" | "units"> = {}) {
  const candidate = structuredClone(decodeInventoryCategories({ ...previous, ...options, revision: previous.revision + 1, categories }));
  const removed = [
    ...previous.categories.filter(choice => !candidate.categories.some(next => next.id === choice.id)).map(choice => ({ field: "categoryId" as const, value: choice.id })),
    ...(previous.itemTypes ?? []).filter(choice => !candidate.itemTypes?.some(next => next.id === choice.id)).map(choice => ({ field: "kind" as const, value: choice.id })),
    ...(previous.units ?? []).filter(unit => !candidate.units?.includes(unit)).map(value => ({ field: "unit" as const, value })),
  ];
  const session = await taylorOwnerSession(), target = doc(session.db, INVENTORY_CATEGORIES);
  // Every item write advances this same settings document. A deletion therefore
  // cannot race a newly created reference, even though Lite has no query-in-tx.
  const guardSnapshot = removed.length ? await getDoc(target) : null;
  const guard = guardSnapshot?.exists() ? decodeInventoryCategories(guardSnapshot.data()) : emptyInventoryCategories();
  const inventory = removed.length ? await getDocs(collection(session.db, INVENTORY_ITEMS)) : null;
  if (inventory) for (const choice of removed) {
    const message = inventoryChoiceRemovalError(inventory.docs.map(item => decodeInventoryItem(item.data(), item.id)), choice.field, choice.value);
    if (message) throw new Error(message);
  }
  const next = await runTransaction(session.db, async tx => {
    const snapshot = await tx.get(target);
    const current = snapshot.exists() ? decodeInventoryCategories(snapshot.data()) : emptyInventoryCategories();
    if (!sameInventoryChoices(current, previous)) throw new Error("Inventory choices changed on another device. Refresh before saving.");
    if (removed.length && current.revision !== guard.revision) throw new Error("Inventory changed while checking this choice. Refresh inventory and try deleting again.");
    const saved = { ...candidate, revision: current.revision + 1 };
    session.assertCurrent(); tx.set(target, saved); return saved;
  });
  session.assertCurrent(); return next;
}
export async function saveInventoryItem(previous: InventoryItem | null, edit: InventoryEdit, adjustmentNote = "", options: { barcodeAssignment?: "manual" | "generated" } = {}) {
  const assignment = options.barcodeAssignment ?? "manual";
  if (!["manual", "generated"].includes(assignment)) throw new Error("Invalid barcode assignment mode.");
  validateInventoryEdit(edit, !!previous && previous.lowStock === edit.lowStock);
  if (adjustmentNote.length > 200 || /[\u0000-\u001f\u007f]/.test(adjustmentNote)) throw new Error("Keep the stock adjustment note under 200 characters.");
  const id = previous?.id ?? crypto.randomUUID(), expectedRevision = previous?.revision ?? 0; inventoryId(id);
  const snapshotEdit = structuredClone(edit);
  const session = await taylorOwnerSession();
  const result = await runTransaction(session.db, async tx => {
    const target = doc(session.db, INVENTORY_ITEMS, id);
    const [snapshot, categorySnapshot] = await Promise.all([tx.get(target), tx.get(doc(session.db, INVENTORY_CATEGORIES))]);
    const current = snapshot.exists() ? decodeInventoryItem(snapshot.data(), id) : null;
    if ((current?.revision ?? 0) !== expectedRevision) throw new Error("This item changed on another device. Refresh before saving so no stock changes are lost.");
    if (current?.trashedAt) throw new Error("Restore this item from Trash before editing it.");
    const categories = categorySnapshot.exists() ? decodeInventoryCategories(categorySnapshot.data()) : emptyInventoryCategories();
    if (snapshotEdit.categoryId && !categories.categories.some(category => category.id === snapshotEdit.categoryId)) throw new Error("That category is no longer available. Choose another category.");
    if (!["material", "finished"].includes(snapshotEdit.kind) && !categories.itemTypes?.some(type => type.id === snapshotEdit.kind)) throw new Error("That item type is no longer available. Choose another type.");
    if (!(INVENTORY_STANDARD_UNITS as readonly string[]).includes(snapshotEdit.unit) && !categories.units?.includes(snapshotEdit.unit) && current?.unit !== snapshotEdit.unit) throw new Error("That unit is no longer available. Choose another unit or create it again.");
    const oldKeys = current ? barcodeAliases(current.barcode).map(barcodeKey) : [];
    const newKeys = barcodeAliases(snapshotEdit.barcode).map(barcodeKey);
    const keys = [...new Set([...oldKeys, ...newKeys])];
    const reservations = await Promise.all(keys.map(key => tx.get(doc(session.db, INVENTORY_BARCODES, key))));
    for (let index = 0; index < keys.length; index++) {
      const reservation = reservations[index];
      if (newKeys.includes(keys[index])) assertClaimable(reservation.exists() ? reservation.data() : null, id, assignment);
      if (oldKeys.includes(keys[index]) && reservation.exists() && (reservation.data().itemId !== id || inventoryTimestamp(reservation.data().releasedAt))) throw new Error("The barcode registry changed. Refresh before saving.");
    }
    const now = new Date().toISOString();
    const history = current?.history ?? [];
    const changed = !current || current.quantity !== snapshotEdit.quantity || current.unit !== snapshotEdit.unit;
    const next: InventoryItem = { ...snapshotEdit, id, schemaVersion: 1, revision: (current?.revision ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now, trashedAt: null, barcodeKeys: newKeys, history: changed ? [{ at: now, from: current?.quantity ?? 0, to: snapshotEdit.quantity, fromUnit: current?.unit ?? snapshotEdit.unit, unit: snapshotEdit.unit, note: adjustmentNote || (current ? "Stock updated" : "Opening stock") }, ...history].slice(0, 30) : history };
    decodeInventoryItem(data(next), id); session.assertCurrent();
    for (const key of oldKeys) if (!newKeys.includes(key)) tx.set(doc(session.db, INVENTORY_BARCODES, key), { itemId: id, releasedAt: serverTimestamp(), assignment: "manual" });
    for (const key of newKeys) tx.set(doc(session.db, INVENTORY_BARCODES, key), { itemId: id, releasedAt: null, assignment });
    tx.set(doc(session.db, INVENTORY_CATEGORIES), { ...categories, revision: categories.revision + 1 });
    tx.set(target, data(next)); return next;
  });
  session.assertCurrent(); return result;
}

// The registry is checked before offering a code; the save transaction is the final
// authority if another device claims it between generation and saving.
export async function generateAvailableInventoryBarcode(generate = generatedInventoryBarcode) {
  const session = await taylorOwnerSession();
  const existing = await getDocs(collection(session.db, INVENTORY_ITEMS));
  session.assertCurrent();
  const occupied = new Set(existing.docs.map(item => decodeInventoryItem(item.data(), item.id)).filter(item => !item.trashedAt).flatMap(item => barcodeAliases(item.barcode)));
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = generate();
    if (!validInventoryBarcode(candidate)) continue;
    if (barcodeAliases(candidate).some(alias => occupied.has(alias))) continue;
    const reservations = await Promise.all(barcodeAliases(candidate).map(alias => getDoc(doc(session.db, INVENTORY_BARCODES, barcodeKey(alias)))));
    session.assertCurrent();
    if (reservations.every(reservation => !reservation.exists() || releasedForGeneration(reservation.data()))) return candidate;
  }
  throw new Error("Could not generate an unused barcode. Try again.");
}

function releasedForGeneration(reservation: { releasedAt?: unknown }) {
  const releasedAt = inventoryTimestamp(reservation.releasedAt);
  return !!releasedAt && Date.now() >= Date.parse(releasedAt) + INVENTORY_BARCODE_HOLD_MS;
}
function assertClaimable(reservation: { itemId?: unknown; releasedAt?: unknown } | null, id: string, assignment: "manual" | "generated") {
  if (!reservation) return;
  const releasedAt = inventoryTimestamp(reservation.releasedAt);
  if (!releasedAt && reservation.itemId !== id) throw new Error("That barcode is already assigned to another item. Use a different code or generate one.");
  if (releasedAt && assignment === "generated" && !releasedForGeneration(reservation)) throw new Error("That barcode is on a 60-day generation hold. Generate another code, or enter it manually to deliberately reassign it.");
}
async function setInventoryTrash(previous: InventoryItem, trash: boolean) {
  inventoryId(previous.id);
  const session = await taylorOwnerSession(), target = doc(session.db, INVENTORY_ITEMS, previous.id);
  await runTransaction(session.db, async tx => {
    const [snapshot, settingsSnapshot] = await Promise.all([tx.get(target), tx.get(doc(session.db, INVENTORY_CATEGORIES))]);
    if (!snapshot.exists()) throw new Error("This inventory item no longer exists.");
    const current = decodeInventoryItem(snapshot.data(), previous.id);
    if (current.revision !== previous.revision) throw new Error("This item changed on another device. Refresh before continuing.");
    if (!!current.trashedAt === trash) throw new Error(trash ? "This item is already in Trash." : "This item is not in Trash.");
    const keys = barcodeAliases(current.barcode).map(barcodeKey);
    const reservations = await Promise.all(keys.map(key => tx.get(doc(session.db, INVENTORY_BARCODES, key))));
    for (const reservation of reservations) {
      if (!reservation.exists()) continue;
      const value = reservation.data();
      if (trash && (value.itemId !== current.id || inventoryTimestamp(value.releasedAt))) throw new Error("The barcode registry changed. Refresh before continuing.");
      if (!trash && !inventoryTimestamp(value.releasedAt) && value.itemId !== current.id) throw new Error("That barcode is already assigned to another item. Change the active item's barcode before restoring this item, or keep this item in Trash.");
      if (!trash) assertClaimable(value, current.id, "manual");
    }
    session.assertCurrent();
    const stamp = trash ? serverTimestamp() : null;
    for (const key of keys) tx.set(doc(session.db, INVENTORY_BARCODES, key), { itemId: current.id, releasedAt: stamp, assignment: "manual" });
    const settings = settingsSnapshot.exists() ? decodeInventoryCategories(settingsSnapshot.data()) : emptyInventoryCategories();
    tx.set(doc(session.db, INVENTORY_CATEGORIES), { ...settings, revision: settings.revision + 1 });
    tx.set(target, { ...data(current), barcodeKeys: keys, trashedAt: stamp, revision: current.revision + 1, updatedAt: new Date().toISOString() });
  });
  session.assertCurrent();
  const saved = await getDoc(target); session.assertCurrent();
  if (!saved.exists()) throw new Error("The saved inventory item could not be read. Refresh to check its status.");
  return decodeInventoryItem(saved.data(), previous.id);
}
export async function trashInventoryItem(previous: InventoryItem) { return setInventoryTrash(previous, true); }
export async function restoreInventoryItem(previous: InventoryItem) { return setInventoryTrash(previous, false); }
