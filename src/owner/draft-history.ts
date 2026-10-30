import type { OwnerContent } from "./model";

type Entry = { value: OwnerContent; bytes: number };
/** Private session-only history. It has no storage, cloud, provider or publish API. */
export class OwnerDraftHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private group: { key: object; at: number } | null = null;
  value: OwnerContent | null = null;
  constructor(readonly maxEntries = 60, readonly maxBytes = 8 * 1024 * 1024) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get depth() { return { undo: this.past.length, redo: this.future.length }; }
  reset(value: OwnerContent | null) { this.value = value; this.past = []; this.future = []; this.group = null; }
  endGroup() { this.group = null; }
  private trim(entries: Entry[]) {
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    while (entries.length && (entries.length > this.maxEntries || bytes > this.maxBytes)) bytes -= entries.shift()!.bytes;
  }
  private entry(value: OwnerContent): Entry { return { value: structuredClone(value), bytes: JSON.stringify(value).length * 2 }; }
  record(next: OwnerContent, key?: object | null, at = Date.now(), continuous = false) {
    const current = this.value;
    if (!current) { this.reset(next); return false; }
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    if (!key || this.group?.key !== key || (!continuous && at - this.group.at > 800)) this.past.push(this.entry(current));
    this.trim(this.past); this.future = []; this.value = next;
    this.group = key ? { key, at } : null;
    return true;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry || !this.value) return null;
    this.future.push(this.entry(this.value)); this.trim(this.future);
    this.value = structuredClone(entry.value); this.group = null; return this.value;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry || !this.value) return null;
    this.past.push(this.entry(this.value)); this.trim(this.past);
    this.value = structuredClone(entry.value); this.group = null; return this.value;
  }
}
/** Text controls own their native undo stack, including IME and contenteditable. */
export function usesNativeUndo(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== "function") return false;
  return !!(target as HTMLElement).closest("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']");
}
