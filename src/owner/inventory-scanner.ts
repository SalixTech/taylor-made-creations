/** Keyboard-wedge detection is intentionally conservative. Manual/slow readers use
 * the labeled input instead, so ordinary keyboard navigation never becomes a scan. */
export type InventoryScanState = { value: string; startedAt: number; lastAt: number };
export const emptyInventoryScan = (): InventoryScanState => ({ value: "", startedAt: 0, lastAt: 0 });
export function inventoryScanKey(state: InventoryScanState, key: string, at: number, options: { repeat?: boolean; modified?: boolean; composing?: boolean } = {}): { state: InventoryScanState; barcode?: string } {
  if (!Number.isFinite(at) || options.repeat || options.modified || options.composing || key === "Escape") return { state: emptyInventoryScan() };
  if (key === "Shift") return { state }; // Readers may send shifted characters.
  if (key === "Enter" || key === "Tab") {
    const fast = state.value.length >= 3 && at - state.lastAt <= 80 && (state.lastAt - state.startedAt) / (state.value.length - 1) <= 35;
    return { state: emptyInventoryScan(), ...(fast ? { barcode: state.value } : {}) };
  }
  if (!/^[A-Za-z0-9.\- $/+%]$/.test(key)) return { state: emptyInventoryScan() };
  const value = state.value && at - state.lastAt <= 60 && at >= state.lastAt ? state.value + key.toUpperCase() : key.toUpperCase();
  return { state: value.length <= 25 ? { value, startedAt: value.length === 1 ? at : state.startedAt, lastAt: at } : emptyInventoryScan() };
}
export function inventoryScanTargetIsEditable(target: EventTarget | null): boolean {
  return !!(target && "closest" in target && typeof target.closest === "function" && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="listbox"],[role="option"],dialog,[role="dialog"]'));
}
