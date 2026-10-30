/** Private bytes only, never object URLs or persistent browser storage. A hit
 * must be reauthorized by load() before it can be returned to any caller. */
export type PrivatePhotoEntry = { blob: Blob; generation: string; expiresAt: number };
type Scope = { user: object; accountKey: string };
type Result = { blob: Blob; generation?: string };
type Job = { controller: AbortController; promise: Promise<Blob>; consumers: number };
const cancelled = () => new DOMException("Photo request cancelled.", "AbortError");

export class PrivatePhotoMemoryCache {
  private scope: Scope | null = null;
  private version = 0;
  private bytes = 0;
  private entries = new Map<string, PrivatePhotoEntry>();
  private jobs = new Map<string, Job>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly maxBytes = 32 * 1024 * 1024, private readonly maxEntries = 12, private readonly ttlMs = 5 * 60_000, private readonly now = Date.now) {}
  clear() {
    this.version++; this.scope = null; this.entries.clear(); this.bytes = 0;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear(); if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
  }
  clearIfCurrent(scope: Scope) {
    if (this.scope?.user === scope.user && this.scope.accountKey === scope.accountKey) this.clear();
  }
  private remove(key: string) { const entry = this.entries.get(key); if (entry) this.bytes -= entry.blob.size; this.entries.delete(key); }
  private prune() {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= this.now()) this.remove(key);
    if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
    if (this.entries.size) {
      const next = Math.min(...Array.from(this.entries.values(), entry => entry.expiresAt));
      this.timer = setTimeout(() => this.prune(), Math.max(1, next - this.now()));
      // Tests/server module analysis must not be kept alive by a browser cache.
      if (typeof this.timer === "object" && "unref" in this.timer) this.timer.unref();
    }
  }
  run(scope: Scope, key: string, load: (previous: PrivatePhotoEntry | null, signal: AbortSignal) => Promise<Result>, signal?: AbortSignal): Promise<Blob> {
    if (signal?.aborted) return Promise.reject(cancelled());
    if (!this.scope || this.scope.user !== scope.user || this.scope.accountKey !== scope.accountKey) { this.clear(); this.scope = scope; }
    this.prune();
    const version = this.version;
    let job = this.jobs.get(key);
    // A closed viewer must not force its immediate replacement to join a
    // cancelled callable that is still settling in the background.
    if (job?.controller.signal.aborted) { this.jobs.delete(key); job = undefined; }
    if (!job) {
      const previous = this.entries.get(key) ?? null;
      if (previous) { this.entries.delete(key); this.entries.set(key, previous); }
      const controller = new AbortController();
      const created: Job = { controller, consumers: 0, promise: Promise.resolve(null as unknown as Blob) };
      created.promise = Promise.resolve().then(() => {
        if (controller.signal.aborted || version !== this.version) throw cancelled();
        return load(previous, controller.signal);
      }).then(result => {
        if (controller.signal.aborted || version !== this.version) throw cancelled();
        this.remove(key);
        if (result.generation && /^[0-9]{1,32}$/.test(result.generation) && result.blob.size <= this.maxBytes && result.blob.size > 0) {
          while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + result.blob.size > this.maxBytes)) this.remove(this.entries.keys().next().value!);
          this.entries.set(key, { blob: result.blob, generation: result.generation, expiresAt: this.now() + this.ttlMs }); this.bytes += result.blob.size; this.prune();
        }
        return result.blob;
      }).catch(error => {
        // A late rejected RPC belongs to its old caller, never the replacement
        // account/viewer. Do not forward an old auth error into its new scope.
        if (controller.signal.aborted || version !== this.version) throw cancelled();
        if (this.jobs.get(key) === created) this.remove(key);
        throw error;
      }).finally(() => { if (this.jobs.get(key) === created) this.jobs.delete(key); });
      job = created; this.jobs.set(key, job);
    }
    const shared = job;
    shared.consumers++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (work: () => void) => { if (settled) return; settled = true; signal?.removeEventListener("abort", abort); shared.consumers--; if (!shared.consumers) shared.controller.abort(); work(); };
      const abort = () => finish(() => reject(cancelled()));
      signal?.addEventListener("abort", abort, { once: true });
      shared.promise.then(blob => finish(() => { if (signal?.aborted || version !== this.version) reject(cancelled()); else resolve(blob); }), error => finish(() => reject(error)));
      if (signal?.aborted) abort();
    });
  }
}

export const hubPhotoMemoryCache = new PrivatePhotoMemoryCache();
export const clearHubPhotoCache = () => hubPhotoMemoryCache.clear();
