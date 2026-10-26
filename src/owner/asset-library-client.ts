"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const libraryChangeEvent = "tmc-private-library-changed";
/** No metadata crosses tabs or enters browser storage; this only invalidates in-memory reads. */
export function notifyPrivateAssetLibraryChanged(endpoint: string) {
  if (typeof window === "undefined") return;
  const event = new Event(libraryChangeEvent);
  Object.assign(event, { endpoint: endpoint.split("?")[0] });
  window.dispatchEvent(event);
}

/** Only authenticated metadata is retained in component memory; never localStorage or public HTML. */
export function usePrivateAssetLibrary<T extends { id: string }>(endpoint: string, field: string, validate: (value: unknown) => value is T) {
  const [assets, setAssets] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as Event & { endpoint?: string }).endpoint !== endpoint.split("?")[0]) return;
      generation.current++;
      setLoading(true); setVersion(value => value + 1);
    };
    const focus = () => { generation.current++; setLoading(true); setVersion(value => value + 1); };
    window.addEventListener(libraryChangeEvent, refresh);
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener(libraryChangeEvent, refresh); window.removeEventListener("focus", focus); };
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    const started = generation.current;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const { taylorOwnerSession, responseObject } = await import("./taylor-services-client");
        const session = await taylorOwnerSession();
        if (!alive) return;
        unsubscribe = session.auth.onAuthStateChanged(() => {
          try { session.assertCurrent(); } catch {
            controller.abort();
            if (alive) { setAssets([]); setAvailable(false); setLoading(false); setError("Sign in again to open your private asset library."); }
          }
        });
        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await responseObject(response);
        session.assertCurrent();
        if (!alive || controller.signal.aborted || started !== generation.current) return;
        if (!Array.isArray(body[field]) || !body[field].every(validate)) throw new Error("The server returned an invalid asset list. Try refreshing the library.");
        const incoming = body[field] as T[];
        // A fresh server snapshot must remove missing/trashed entries, not merge them back in.
        setAssets(incoming); setAvailable(body.available !== false); setError("");
        if (body.available === false) setError(typeof body.message === "string" ? body.message : "Development-server uploads are not connected here.");
      } catch (failure) {
        if (alive && !controller.signal.aborted && started === generation.current) setError(failure instanceof Error ? failure.message : "Your private library could not be loaded.");
      } finally { if (alive && started === generation.current) setLoading(false); }
    })();
    return () => { alive = false; controller.abort(); unsubscribe?.(); };
  }, [endpoint, field, validate, version]);
  const add = useCallback((asset: T) => {
    setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)]);
    // Invalidate any older in-flight snapshot, and refresh other mounted pickers.
    notifyPrivateAssetLibraryChanged(endpoint);
  }, [endpoint]);
  const refresh = useCallback(() => { generation.current++; setLoading(true); setError(""); setVersion(value => value + 1); }, []);
  return { assets, add, refresh, error, loading, available };
}
