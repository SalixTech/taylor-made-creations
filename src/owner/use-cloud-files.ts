"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLOUD_FILES_EVENT, readCloudFiles } from "./cloud-files-client";
import { emptyCloudFolders, folderAncestors, type CloudFile, type CloudFolders } from "./cloud-files-model";
import { taylorOwnerSession } from "./taylor-services-client";

type Library = { files: CloudFile[]; folders: CloudFolders; loading: boolean; ready: boolean; error: string };
const initial = (): Library => ({ files: [], folders: emptyCloudFolders(), loading: true, ready: false, error: "" });

/** No private metadata is persisted in browser storage, and old reads cannot replace newer results. */
export function useCloudFiles() {
  const [library, setLibrary] = useState<Library>(initial);
  const alive = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const started = ++generation.current;
    if (alive.current) setLibrary(current => ({ ...current, loading: true, error: "" }));
    try {
      const incoming = await readCloudFiles();
      // A corrupted/missing parent is not silently treated as a root folder.
      for (const file of incoming.files) folderAncestors(incoming.folders, file.parentId);
      if (alive.current && started === generation.current) setLibrary({ ...incoming, loading: false, ready: true, error: "" });
    } catch (failure) {
      if (alive.current && started === generation.current) setLibrary({ ...initial(), loading: false, error: failure instanceof Error ? failure.message : "Cloud files could not be checked. Try refreshing." });
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    let unsubscribe: (() => void) | undefined;
    let currentEffect = true;
    const version = generation;
    const invalidate = () => { generation.current++; setLibrary({ ...initial(), loading: false, error: "Your owner session changed. Sign in again to view private files." }); };
    void (async () => {
      try {
        const session = await taylorOwnerSession();
        if (!currentEffect || !alive.current) return;
        unsubscribe = session.auth.onAuthStateChanged(() => { try { session.assertCurrent(); } catch { if (currentEffect && alive.current) invalidate(); } });
      } catch { /* The authoritative library read below supplies the setup/sign-in error. */ }
    })();
    const changed = (event: Event) => {
      if ((event as Event & { endpoint?: string }).endpoint === CLOUD_FILES_EVENT) void refresh();
    };
    const focus = () => { void refresh(); };
    window.addEventListener("tmc-private-library-changed", changed);
    window.addEventListener("focus", focus);
    void Promise.resolve().then(() => { if (currentEffect) return refresh(); });
    return () => {
      currentEffect = false; alive.current = false; version.current++; unsubscribe?.();
      window.removeEventListener("tmc-private-library-changed", changed);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  return { ...library, refresh };
}
