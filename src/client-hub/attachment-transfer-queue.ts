/** Separate bounded lanes reserve capacity for user actions. No bytes are cached.
 * At most one original per lane is allocated; cancellation removes queued work. */
export type AttachmentPriority = "interactive" | "background";
type Job = { start: () => void; cancel: () => void };
export function createAttachmentTransferQueue() {
  const lanes = {
    interactive: { active: false, waiting: [] as Job[] },
    background: { active: false, waiting: [] as Job[] },
  };
  function pump(priority: AttachmentPriority) {
    const lane = lanes[priority];
    if (lane.active) return;
    const next = lane.waiting.shift();
    if (next) { lane.active = true; next.start(); }
  }
  return function run<T>(priority: AttachmentPriority, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const lane = lanes[priority];
    return new Promise<T>((resolve, reject) => {
      let started = false;
      const job: Job = {
        cancel() {
          if (started) return; // Active task owns its auth/abort checks.
          const index = lane.waiting.indexOf(job);
          if (index >= 0) lane.waiting.splice(index, 1);
          signal?.removeEventListener("abort", job.cancel);
          reject(new DOMException("Attachment request cancelled.", "AbortError"));
        },
        start() {
          started = true; signal?.removeEventListener("abort", job.cancel);
          void Promise.resolve().then(() => {
            if (signal?.aborted) throw new DOMException("Attachment request cancelled.", "AbortError");
            return task();
          }).then(resolve, reject).finally(() => { lane.active = false; pump(priority); });
        },
      };
      if (signal?.aborted) { job.cancel(); return; }
      signal?.addEventListener("abort", job.cancel, { once: true });
      lane.waiting.push(job); pump(priority);
    });
  };
}
