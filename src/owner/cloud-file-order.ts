import { CLOUD_FILE_ID } from './cloud-files-model';

export type CloudFileOrder = { schemaVersion: 1; revision: number; keys: string[] };
export const emptyCloudFileOrder = (): CloudFileOrder => ({ schemaVersion: 1, revision: 0, keys: [] });
export function decodeCloudFileOrder(value: unknown): CloudFileOrder {
  const data = value as CloudFileOrder;
  if (!data || Object.keys(data).sort().join(',') !== 'keys,revision,schemaVersion' || data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.keys) || data.keys.length > 5000 || new Set(data.keys).size !== data.keys.length || data.keys.some(key => typeof key !== 'string' || !/^(file|folder):/.test(key) || !CLOUD_FILE_ID.test(key.slice(key.indexOf(':') + 1)))) throw new Error('File order is invalid. Refresh File Hub.');
  return data;
}
/** Old deleted/moved identities are ignored; newly added items append without changing IDs. */
export function orderedCloudKeys(saved: CloudFileOrder, current: string[]): string[] {
  const available = new Set(current);
  return [...saved.keys.filter(key => available.has(key)), ...current.filter(key => !saved.keys.includes(key))];
}
export function reorderCloudKeys(saved: CloudFileOrder, expectedRevision: number, current: string[], moving: string, target: string, after = false): CloudFileOrder {
  if (saved.revision !== expectedRevision) throw new Error('File order changed on another device. Refresh before reordering.');
  if (!current.includes(moving) || !current.includes(target)) throw new Error('An item moved or is missing. Refresh before reordering.');
  const keys = orderedCloudKeys(saved, current);
  if (moving !== target) { keys.splice(keys.indexOf(moving), 1); keys.splice(keys.indexOf(target) + (after ? 1 : 0), 0, moving); }
  return decodeCloudFileOrder({ schemaVersion: 1, revision: saved.revision + 1, keys });
}
