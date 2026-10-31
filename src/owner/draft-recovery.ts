import { workspaceBrowserKey } from "./website-workspace-config";
import { validateOwnerContent, type OwnerContent } from "./model";

/** Browser-local recovery is not authentication, a cloud draft, or publication. */
export type RecoveryIdentity = { projectId: string; ownerUid: string };
export type RecoverySession = RecoveryIdentity & { assertCurrent: () => void };
export type RecoveryRecord = { version: 1; branch: string; updatedAt: number; cloudRevision: number; content: OwnerContent };
export type RecoveryCandidate = { key: string; raw: string; record: RecoveryRecord };
export const RECOVERY_MAX_BYTES = 1_048_576;
export const RECOVERY_MAX_BRANCHES = 8;
export const RECOVERY_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export type UnavailableRecovery = { key: string; raw: string };
const ACTIVE_LEASE_MS = 24 * 60 * 60 * 1000;
const leasePrefix = (identity: RecoveryIdentity) => recoveryPrefix(identity).replace("tmc-draft-recovery:", "tmc-draft-recovery-active:");
const branchPattern = /^[a-zA-Z0-9_-]{16,80}$/;
export function recoveryPrefix(identity: RecoveryIdentity): string {
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(identity.projectId) || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.ownerUid)) throw new Error("Recovery account is unavailable.");
  return workspaceBrowserKey(`tmc-draft-recovery:v1:${identity.projectId}:${identity.ownerUid}:`);
}
export function readRecoveryRecord(raw: string | null, now = Date.now()): RecoveryRecord | null {
  if (!raw || raw.length * 2 > RECOVERY_MAX_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "branch,cloudRevision,content,updatedAt,version" || value.version !== 1 || typeof value.branch !== "string" || !branchPattern.test(value.branch) || !Number.isSafeInteger(value.updatedAt) || value.updatedAt > now + 60_000 || value.updatedAt < now - RECOVERY_MAX_AGE || !Number.isSafeInteger(value.cloudRevision) || value.cloudRevision < 0) return null;
    return validateOwnerContent(value.content).valid ? value as RecoveryRecord : null;
  } catch { return null; }
}
export function listRecovery(storage: StorageLike, identity: RecoveryIdentity, now = Date.now()): RecoveryCandidate[] {
  const prefix = recoveryPrefix(identity), candidates: RecoveryCandidate[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key), record = readRecoveryRecord(raw, now);
    if (raw && record && key === prefix + record.branch) candidates.push({ key, raw, record });
  }
  return candidates.sort((a, b) => b.record.updatedAt - a.record.updatedAt).slice(0, RECOVERY_MAX_BRANCHES);
}
export function listUnavailableRecovery(storage: StorageLike, identity: RecoveryIdentity, now = Date.now()): UnavailableRecovery[] {
  const prefix = recoveryPrefix(identity), entries: UnavailableRecovery[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    const record = readRecoveryRecord(raw, now);
    if (raw !== null && (!record || key !== prefix + record.branch)) entries.push({ key, raw });
    if (entries.length >= RECOVERY_MAX_BRANCHES) break;
  }
  return entries;
}
/** Explicit cleanup uses a reviewed snapshot and never erases a newer write. */
export function discardUnavailableRecovery(storage: StorageLike, identity: RecoveryIdentity, entries: UnavailableRecovery[], now = Date.now()): void {
  if (entries.length > RECOVERY_MAX_BRANCHES) throw new Error("Review a smaller recovery batch.");
  const prefix = recoveryPrefix(identity);
  if (entries.some(entry => !entry.key.startsWith(prefix) || storage.getItem(entry.key) !== entry.raw || (() => { const record = readRecoveryRecord(entry.raw, now); return !!record && entry.key === prefix + record.branch; })())) throw new Error("A recovery copy changed. Refresh before clearing unavailable copies.");
  for (const entry of entries) storage.removeItem(entry.key);
}
/** Expiry prevents restore, not safe oldest-first retention of a strict checkpoint. */
function readRetentionRecord(raw: string | null, now: number): RecoveryRecord | null {
  if (!raw || raw.length * 2 > RECOVERY_MAX_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (!Number.isSafeInteger(value?.updatedAt) || value.updatedAt < 0 || value.updatedAt > now + 60_000) return null;
    // Validate the same exact version/schema/content, at the recorded checkpoint time.
    return readRecoveryRecord(raw, value.updatedAt);
  } catch { return null; }
}
/** Inventory is deliberately unsliced: retention must see every eligible copy. */
function recoveryInventory(storage: StorageLike, identity: RecoveryIdentity, now: number): RecoveryCandidate[] {
  const prefix = recoveryPrefix(identity), result: RecoveryCandidate[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key), record = readRetentionRecord(raw, now);
    // Malformed entries remain available for explicit reviewed cleanup.
    if (raw && record && key === prefix + record.branch) result.push({ key, raw, record });
  }
  return result.sort((a, b) => a.record.updatedAt - b.record.updatedAt || a.key.localeCompare(b.key));
}
function protectedRecoveryKeys(storage: StorageLike, identity: RecoveryIdentity, now: number): Set<string> {
  const result = new Set<string>(), prefix = leasePrefix(identity), recovery = recoveryPrefix(identity);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const lease = JSON.parse(storage.getItem(key) || "null");
      if (!lease || !Number.isSafeInteger(lease.expiresAt) || lease.expiresAt < now || lease.expiresAt > now + ACTIVE_LEASE_MS + 60_000 || !Array.isArray(lease.keys) || lease.keys.length > 2) continue;
      for (const candidate of lease.keys) if (typeof candidate === "string" && candidate.startsWith(recovery) && branchPattern.test(candidate.slice(recovery.length))) result.add(candidate);
    } catch { /* An invalid advisory lease never authorizes removing unrelated data. */ }
  }
  return result;
}
/** Each mount is an isolated writer; every persisted checkpoint has a fresh immutable key. */
export class DraftRecoveryBranch {
  private currentKey: string;
  get key(): string { return this.currentKey; }
  private readonly owned = new Map<string, string>();
  private lastRaw: string | null = null;
  private active = true;
  private protected = false;
  /** Browser hook opts in; leases are conservative hints, not proof a suspended tab closed. */
  protectActive(): void { this.protected = true; }
  refreshProtection(keys = [this.currentKey]): void {
    if (!this.active || !this.protected || (this.lastRaw === null && keys.length === 1)) return;
    this.storage.setItem(leasePrefix(this.identity) + this.branch, JSON.stringify({ keys, expiresAt: this.now() + ACTIVE_LEASE_MS }));
  }
  private evictOldest(): boolean {
    const protectedKeys = protectedRecoveryKeys(this.storage, this.identity, this.now());
    protectedKeys.add(this.currentKey);
    for (const candidate of recoveryInventory(this.storage, this.identity, this.now())) {
      if (protectedKeys.has(candidate.key) || this.storage.getItem(candidate.key) !== candidate.raw) continue;
      this.storage.removeItem(candidate.key);
      return true;
    }
    return false;
  }
  constructor(private storage: StorageLike, readonly identity: RecoveryIdentity, readonly branch: string, private now = Date.now) {
    if (!branchPattern.test(branch)) throw new Error("Recovery branch is unavailable.");
    this.currentKey = recoveryPrefix(identity) + branch;
    if (storage.getItem(this.key) !== null) throw new Error("Recovery branch already exists. Reload before editing.");
  }
  checkpoint(content: OwnerContent, cloudRevision: number): RecoveryCandidate {
    if (!this.active) throw new Error("This recovery session is closed.");
    if (this.storage.getItem(this.key) !== this.lastRaw) throw new Error("This browser recovery was changed or discarded in another tab. Your edits remain here; save a cloud draft before leaving.");
    if (!Number.isSafeInteger(cloudRevision) || cloudRevision < 0 || !validateOwnerContent(content).valid) throw new Error("Some unfinished fields cannot be recovered yet. Keep this tab open or finish the fields before leaving.");
    // Immutable generations make cross-tab discard safe without relying on
    // non-atomic localStorage read/compare/delete operations. A newer save always
    // has a different key; nobody ever updates an existing checkpoint key.
    const generation = crypto.randomUUID();
    const nextKey = recoveryPrefix(this.identity) + generation;
    if (this.storage.getItem(nextKey) !== null) throw new Error("Recovery version collision. Try saving again.");
    const record: RecoveryRecord = { version: 1, branch: generation, updatedAt: this.now(), cloudRevision, content };
    const raw = JSON.stringify(record);
    if (raw.length * 2 > RECOVERY_MAX_BYTES) throw new Error("This draft is too large for browser recovery. Save as Draft to keep it safely in your owner account.");
    // Preserve the current confirmed generation until the replacement is confirmed.
    // Active tabs announce their immutable keys under a separate advisory namespace.
    const prefix = recoveryPrefix(this.identity);
    const countCopies = () => { let count = 0; for (let index = 0; index < this.storage.length; index++) if (this.storage.key(index)?.startsWith(prefix)) count++; return count; };
    if (this.lastRaw === null && countCopies() >= RECOVERY_MAX_BRANCHES) {
      const protectedKeys = protectedRecoveryKeys(this.storage, this.identity, this.now());
      protectedKeys.add(this.currentKey);
      const available = recoveryInventory(this.storage, this.identity, this.now()).filter(candidate => !protectedKeys.has(candidate.key));
      if (available.length < countCopies() - RECOVERY_MAX_BRANCHES + 1) throw new Error("Browser recovery is full of active or unavailable copies. Your current edits are unchanged; save a cloud draft before leaving.");
    }
    // Only a storage quota failure permits further eviction; access/security errors
    // must remain visible, not cause destructive cleanup in a futile retry loop.
    const persist = (write: () => void) => {
      for (;;) { try { write(); return; } catch (error) {
        if (!(error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) || !this.evictOldest()) throw error;
      } }
    };
    persist(() => this.refreshProtection([this.currentKey, nextKey]));
    persist(() => this.storage.setItem(nextKey, raw));
    if (this.storage.getItem(nextKey) !== raw) throw new Error("Browser recovery could not be confirmed. Save as Draft before leaving.");
    this.currentKey = nextKey; this.lastRaw = raw; this.owned.set(nextKey, raw);
    try { this.refreshProtection(); } catch { /* The pre-write lease still protects both confirmed generations. */ }
    // Only prune immutable generations created by this writer. Other tabs can
    // discard them, but cannot make this deletion erase their newer version.
    for (const [key, previous] of this.owned) if (key !== nextKey) {
      try { if (this.storage.getItem(key) === previous) this.storage.removeItem(key); this.owned.delete(key); } catch { /* The newest checkpoint is confirmed; retain inaccessible old bytes for explicit cleanup. */ }
    }
    // Retention pruning normally happens only after the new copy is confirmed.
    // A raced lease can temporarily retain extra copies rather than sacrifice active work.
    while (countCopies() > RECOVERY_MAX_BRANCHES) { if (!this.evictOldest()) break; }
    return { key: nextKey, raw, record: JSON.parse(raw) as RecoveryRecord };
  }
  clear(): void {
    const currentMatches = this.lastRaw !== null && this.storage.getItem(this.key) === this.lastRaw;
    for (const [key, raw] of this.owned) { if (this.storage.getItem(key) === raw) this.storage.removeItem(key); this.owned.delete(key); }
    if (currentMatches) this.lastRaw = null;
  }
  dispose(clear = false): void { this.active = false; if (clear) this.clear(); if (this.protected) { try { this.storage.removeItem(leasePrefix(this.identity) + this.branch); } catch { /* Expiry releases an inaccessible advisory lease. */ } } }
}
/** Delete only this immutable generation. A concurrently saved newer key survives. */
export function discardRecovery(storage: StorageLike, identity: RecoveryIdentity, candidate: RecoveryCandidate): void {
  if (candidate.key !== recoveryPrefix(identity) + candidate.record.branch || storage.getItem(candidate.key) !== candidate.raw) throw new Error("That recovery copy changed in another tab. Refresh the recovery list before trying again.");
  storage.removeItem(candidate.key);
}
