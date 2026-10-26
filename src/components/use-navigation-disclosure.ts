"use client";

import { useEffect, useRef } from "react";

/** Keep native keyboard disclosure behavior in every public and private header. */
export function useNavigationDisclosure(resetKey: string) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (dropdown.current) dropdown.current.open = false; }, [resetKey]);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      const menu = dropdown.current;
      if (menu && event.target && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, []);
  return dropdown;
}
