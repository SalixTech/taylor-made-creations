"use client";
/** Opt-in, bounded, memory-only troubleshooting. No identifiers, private text,
 * credentials, document contents or cross-device clock comparisons. */
export type HubTimingSample = { role: "owner" | "client"; action: "message" | "support-reply" | "support-status" | "visibility" | "snapshot"; stage: "auth-ready" | "callable-confirmed" | "failed" | "next-frame"; elapsedMs: number };
let enabled = false;
const samples: HubTimingSample[] = [];
const subscribers = new Set<() => void>();
export function hubTimingEnabled() { return enabled; }
export function setHubTimingEnabled(value: boolean) { enabled = value; samples.length = 0; subscribers.forEach(notify => notify()); }
export function readHubTimings(): HubTimingSample[] { return samples.map(sample => ({ ...sample })); }
export function subscribeHubTimings(notify: () => void) { subscribers.add(notify); return () => { subscribers.delete(notify); }; }
function add(sample: HubTimingSample) { if (!enabled || !Number.isFinite(sample.elapsedMs)) return; samples.push({ ...sample, elapsedMs: Math.max(0, Math.min(300_000, Math.round(sample.elapsedMs))) }); if (samples.length > 80) samples.splice(0, samples.length - 80); subscribers.forEach(notify => notify()); }
export function startHubTiming(action: HubTimingSample["action"], owner: boolean) {
  const start = enabled ? performance.now() : null;
  return (stage: HubTimingSample["stage"]) => { if (start !== null) add({ role: owner ? "owner" : "client", action, stage, elapsedMs: performance.now() - start }); };
}
export function timeHubSnapshotFrame(owner: boolean) {
  if (!enabled || typeof requestAnimationFrame === "undefined") return;
  const mark = startHubTiming("snapshot", owner);
  requestAnimationFrame(() => mark("next-frame"));
}
