"use client";
import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore/lite";
import { taylorOwnerSession } from "./taylor-services-client";
import { barcodeAliases, barcodeKey, decodeInventoryCategories, decodeInventoryItem, emptyInventoryCategories, generatedInventoryBarcode, inventoryId, validateInventoryEdit, type InventoryCategories, type InventoryEdit, type InventoryItem } from "./inventory-model";
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
export async function saveInventoryCategories(previous: InventoryCategories, categories: InventoryCategories["categories"], options: Pick<InventoryCategories, "itemTypes" | "units"> = {}) {
  const expectedRevision = previous.revision;
  const next = structuredClone(decodeInventoryCategories({ ...previous, ...options, revision: expectedRevision + 1, categories }));
  const session = await taylorOwnerSession();
  await runTransaction(session.db, async tx => {
    const target = doc(session.db, INVENTORY_CATEGORIES), snapshot = await tx.get(target);
    const current = snapshot.exists() ? decodeInventoryCategories(snapshot.data()) : emptyInventoryCategories();
    if (current.revision !== expectedRevision) throw new Error("Categories changed on another device. Refresh before saving.");
    session.assertCurrent(); tx.set(target, next);
  });
  session.assertCurrent(); return next;
}
export async function saveInventoryItem(previous: InventoryItem | null, edit: InventoryEdit, adjustmentNote = "") {
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
    const categories = categorySnapshot.exists() ? decodeInventoryCategories(categorySnapshot.data()) : emptyInventoryCategories();
    if (snapshotEdit.categoryId && !categories.categories.some(category => category.id === snapshotEdit.categoryId)) throw new Error("That category is no longer available. Choose another category.");
    if (!["material", "finished"].includes(snapshotEdit.kind) && !categories.itemTypes?.some(type => type.id === snapshotEdit.kind)) throw new Error("That item type is no longer available. Choose another type.");
    const oldKeys = current ? barcodeAliases(current.barcode).map(barcodeKey) : [];
    const newKeys = barcodeAliases(snapshotEdit.barcode).map(barcodeKey);
    const keys = [...new Set([...oldKeys, ...newKeys])];
    const reservations = await Promise.all(keys.map(key => tx.get(doc(session.db, INVENTORY_BARCODES, key))));
    for (let index = 0; index < keys.length; index++) {
      const reservation = reservations[index];
      if (newKeys.includes(keys[index]) && reservation.exists() && reservation.data().itemId !== id) throw new Error("That barcode is already assigned to another item. Use a different code or generate one.");
      if (oldKeys.includes(keys[index]) && reservation.exists() && reservation.data().itemId !== id) throw new Error("The barcode registry changed. Refresh before saving.");
    }
    const now = new Date().toISOString();
    const history = current?.history ?? [];
    const changed = !current || current.quantity !== snapshotEdit.quantity || current.unit !== snapshotEdit.unit;
    const next: InventoryItem = { ...snapshotEdit, id, schemaVersion: 1, revision: (current?.revision ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now, history: changed ? [{ at: now, from: current?.quantity ?? 0, to: snapshotEdit.quantity, fromUnit: current?.unit ?? snapshotEdit.unit, unit: snapshotEdit.unit, note: adjustmentNote || (current ? "Stock updated" : "Opening stock") }, ...history].slice(0, 30) : history };
    decodeInventoryItem(data(next), id); session.assertCurrent();
    for (const key of oldKeys) if (!newKeys.includes(key)) tx.delete(doc(session.db, INVENTORY_BARCODES, key));
    for (const key of newKeys) tx.set(doc(session.db, INVENTORY_BARCODES, key), { itemId: id });
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
  const occupied = new Set(existing.docs.flatMap(item => barcodeAliases(decodeInventoryItem(item.data(), item.id).barcode)));
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = generate();
    if (barcodeAliases(candidate).some(alias => occupied.has(alias))) continue;
    const reservations = await Promise.all(barcodeAliases(candidate).map(alias => getDoc(doc(session.db, INVENTORY_BARCODES, barcodeKey(alias)))));
    session.assertCurrent();
    if (reservations.every(reservation => !reservation.exists())) return candidate;
  }
  throw new Error("Could not generate an unused barcode. Try again.");
}
