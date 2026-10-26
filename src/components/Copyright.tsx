"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { COPYRIGHT_START_YEAR, copyrightRefreshDelay, copyrightYearAt } from "@/content/copyright";

const CopyrightContext = createContext<number | null>(null);
/** The request-time year is serialized with the page, so crossing the boundary during hydration is safe. */
export function CopyrightProvider({ initialYear, children }: { initialYear: number; children: ReactNode }) {
  return <CopyrightContext value={initialYear}>{children}</CopyrightContext>;
}
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { onChange(); schedule(); }, copyrightRefreshDelay());
  };
  const refresh = () => { onChange(); schedule(); };
  const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
  schedule();
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", onVisible);
  return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
}
const getCurrentYear = () => copyrightYearAt();
export function CopyrightRange() {
  const initialYear = useContext(CopyrightContext);
  const year = useSyncExternalStore(subscribe, getCurrentYear, () => initialYear);
  return <>© {COPYRIGHT_START_YEAR}-{year ?? "present"}</>;
}
