"use client";

import {useSyncExternalStore} from "react";

type Design = "first" | "original";
const storageKey = "tmc-preview-design";
const changeEvent = "tmc-preview-design-change";
let currentDesign: Design | undefined;

function readDesign(): Design {
  if (currentDesign === undefined) {
    try {
      currentDesign = window.localStorage.getItem(storageKey) === "first" ? "first" : "original";
    } catch {
      currentDesign = "original";
    }
  }
  return currentDesign;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      currentDesign = undefined;
      onChange();
    }
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function selectDesign(design: Design) {
  currentDesign = design;
  try {
    window.localStorage.setItem(storageKey, design);
  } catch {
    // Private browsing/storage restrictions must not disable the comparison.
  }
  window.dispatchEvent(new Event(changeEvent));
}

const serverDesign = (): Design => "original";

export function DesignPreview({children}: {children: React.ReactNode}) {
  const design = useSyncExternalStore(subscribe, readDesign, serverDesign);
  return <div data-design={design}>
    <div className="design-preview" role="group" aria-label="Compare website designs">
      <span>Compare designs</span>
      <button type="button" aria-pressed={design === "first"} onClick={() => selectDesign("first")}>First design</button>
      <button type="button" aria-pressed={design === "original"} onClick={() => selectDesign("original")}>Original-style revision</button>
    </div>
    {children}
  </div>;
}
