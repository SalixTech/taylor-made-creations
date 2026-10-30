import type { HubSupportRequest } from "./model";
export type HiddenRequestRefreshTarget = { requestId: string; activityKey: string };
/** A scope-owned, two-read queue. Newer activity replaces queued work for the same
 * thread; successful versions deduplicate, and stop discards every late result. */
export function createHiddenRequestRefresher(load: (requestId: string, signal: AbortSignal) => Promise<HubSupportRequest>, onValue: (value: HubSupportRequest) => void, onError: (cause: unknown) => void) {
  const controller = new AbortController(), queued = new Map<string, HiddenRequestRefreshTarget>(), completed = new Map<string, string>(), inFlight = new Map<string, string>();
  let active = true;
  function pump() {
    if (!active) return;
    while (inFlight.size < 2) {
      const target = [...queued.values()].find(item => !inFlight.has(item.requestId)); if (!target) return;
      queued.delete(target.requestId); inFlight.set(target.requestId, target.activityKey);
      void load(target.requestId, controller.signal).then(value => {
        if (!active || controller.signal.aborted) return;
        completed.set(target.requestId, target.activityKey); onValue(value);
      }).catch(cause => { if (active && !controller.signal.aborted) onError(cause); }).finally(() => { inFlight.delete(target.requestId); pump(); });
    }
  }
  return {
    update(targets: HiddenRequestRefreshTarget[]) {
      if (!active) return;
      const relevant = new Set(targets.map(item => item.requestId));
      for (const id of queued.keys()) if (!relevant.has(id)) queued.delete(id);
      for (const id of completed.keys()) if (!relevant.has(id)) completed.delete(id);
      for (const target of targets) {
        if (completed.get(target.requestId) === target.activityKey || inFlight.get(target.requestId) === target.activityKey) continue;
        queued.set(target.requestId, target);
      }
      pump();
    },
    stop() { active = false; controller.abort(); queued.clear(); completed.clear(); },
  };
}
