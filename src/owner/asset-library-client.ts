"use client";

import { useCallback, useEffect, useState } from "react";

/** Only authenticated metadata is retained in component memory; never localStorage or public HTML. */
export function usePrivateAssetLibrary<T extends { id: string }>(endpoint: string, field: string, validate: (value: unknown) => value is T) {
  const [assets, setAssets] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
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
            if (alive) { setAssets([]); setLoading(false); setError("Sign in again to open your private asset library."); }
          }
        });
        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body = await responseObject(response);
        session.assertCurrent();
        if (!alive || controller.signal.aborted) return;
        if (!Array.isArray(body[field]) || !body[field].every(validate)) throw new Error("The server returned an invalid asset list. Try refreshing the library.");
        const incoming = body[field] as T[];
        setAssets(current => [...current.filter(asset => !incoming.some(item => item.id === asset.id)), ...incoming]); setError("");
        if (body.available === false) setError(typeof body.message === "string" ? body.message : "Development-server uploads are not connected here.");
      } catch (failure) {
        if (alive && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your private library could not be loaded.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; controller.abort(); unsubscribe?.(); };
  }, [endpoint, field, validate, version]);
  const add = useCallback((asset: T) => { setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)]); }, []);
  const refresh = useCallback(() => { setLoading(true); setError(""); setVersion(value => value + 1); }, []);
  return { assets, add, refresh, error, loading };
}
