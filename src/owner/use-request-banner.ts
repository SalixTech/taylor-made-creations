"use client";
import { useCallback, useEffect, useState } from "react";
/** Only the banner expires. Callers retain outcome/error state for safe recovery. */
export function useRequestBanner() {
  const [state, setState] = useState({ message: null as string | null, revision: 0 });
  const [hiddenRevision, setHiddenRevision] = useState(-1);
  useEffect(() => {
    if (!state.message) return;
    const timer = window.setTimeout(() => setHiddenRevision(state.revision), 6000);
    return () => window.clearTimeout(timer);
  }, [state.message, state.revision]);
  const setMessage = useCallback((message: string | null) => setState(previous => ({ message, revision: previous.revision + 1 })), []);
  return [state.message, setMessage, hiddenRevision === state.revision ? null : state.message] as const;
}
