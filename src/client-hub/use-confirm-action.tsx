"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubActionDialog } from "./HubActionDialog";
/** One pending confirmation; cancellation and unmount never approve an action. */
export function useConfirmAction() {
  const [message, setMessage] = useState("");
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const settle = useCallback((accepted: boolean) => { resolver.current?.(accepted); resolver.current = null; setMessage(""); }, []);
  const confirm = useCallback((text: string) => new Promise<boolean>(resolve => { resolver.current?.(false); resolver.current = resolve; setMessage(text); }), []);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);
  return { confirm, cancel: useCallback(() => settle(false), [settle]), confirmation: message ? <HubActionDialog title="Keep your draft?" cancelLabel="Keep draft" confirmLabel="Discard draft and continue" onClose={() => settle(false)} onConfirm={() => settle(true)}><p>{message}</p><p>Keep draft leaves everything here unchanged.</p></HubActionDialog> : null };
}
