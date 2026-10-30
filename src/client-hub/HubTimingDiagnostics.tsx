"use client";
import { useEffect, useState } from "react";
import { hubTimingEnabled, readHubTimings, setHubTimingEnabled, subscribeHubTimings } from "./hub-timing";
import styles from "./ProjectWorkspace.module.css";
export function HubTimingDiagnostics() {
  const [, update] = useState(0);
  useEffect(() => subscribeHubTimings(() => update(value => value + 1)), []);
  return <details className={styles.cooldownControl}><summary>Connection timing diagnostics</summary><p className={styles.caption}>Optional timings stay in this window’s memory (latest 80), without client names, message text, identifiers or credentials. No diagnostic data is sent anywhere. Auth checks are unchanged.</p><button className={styles.button} type="button" onClick={() => setHubTimingEnabled(!hubTimingEnabled())}>{hubTimingEnabled() ? "Stop and clear timings" : "Start local timings"}</button>{hubTimingEnabled() && <><p className={styles.caption}>Times are cumulative from each action starting. Callable confirmation includes network, routing, security checks and database work—not just commit time. Snapshot → next frame measures local rendering, not cross-device delivery latency.</p><ul className={styles.timingList}>{readHubTimings().slice(-20).map((sample, index) => <li key={index}>{sample.role} · {sample.action} · {sample.stage}: {sample.elapsedMs} ms</li>)}</ul></>}</details>;
}
