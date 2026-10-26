"use client";

import { useEffect } from "react";
import type { OwnerFont } from "@/owner/model";
import { FONT_CONTENT_TYPES, isOwnerFont } from "@/owner/font-client";
import { fontFamilyName } from "@/owner/site-fonts";

/** Register generated font-family names only. No style tag, inline @font-face string, :root or owner UI changes. */
export function SiteFontLoader({ fonts, privateFonts = false }: { fonts?: OwnerFont[]; privateFonts?: boolean }) {
  const key = JSON.stringify((fonts ?? []).filter(isOwnerFont).map(font => [font.id, font.src, font.format]));
  useEffect(() => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    const values = JSON.parse(key) as [string, string, OwnerFont["format"]][];
    if (!values.length) return;
    const controller = new AbortController(), faces = new Set<FontFace>();
    let alive = true, unsubscribe: (() => void) | undefined;
    const clear = () => { for (const face of faces) document.fonts.delete(face); faces.clear(); };
    void (async () => {
      let session: Awaited<ReturnType<typeof import("@/owner/taylor-services-client")["taylorOwnerSession"]>> | undefined;
      if (privateFonts) {
        try {
          const { taylorOwnerSession } = await import("@/owner/taylor-services-client");
          session = await taylorOwnerSession();
          if (!alive) return;
          unsubscribe = session.auth.onAuthStateChanged(() => { try { session!.assertCurrent(); } catch { controller.abort(); clear(); } });
        } catch { return; } // Never fall back to unauthenticated reads of unpublished fonts.
      }
      for (const [id, source, format] of values) {
        if (!alive || controller.signal.aborted) break;
        const family = fontFamilyName(id);
        if (!family) continue;
        try {
          let face: FontFace;
          if (session) {
            session.assertCurrent();
            const response = await fetch(source, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
            if (!response.ok || response.headers.get("content-type") !== FONT_CONTENT_TYPES[format]) continue;
            const bytes = await response.arrayBuffer();
            session.assertCurrent();
            if (!alive || controller.signal.aborted) break;
            // Authenticated bytes stay in memory; no public fallback, token URL, data URI or Firestore binary.
            face = new FontFace(family, bytes, { display: "swap" });
          } else {
            face = new FontFace(family, `url("${source}")`, { display: "swap" });
          }
          await face.load();
          if (session) session.assertCurrent();
          if (!alive || controller.signal.aborted) break;
          faces.add(face); document.fonts.add(face);
        } catch { /* A missing/invalid font falls back to the explicitly configured safe stack. */ }
      }
    })();
    return () => { alive = false; controller.abort(); unsubscribe?.(); clear(); };
  }, [key, privateFonts]);
  return null;
}
