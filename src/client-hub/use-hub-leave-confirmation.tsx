"use client";
import { useEffect, useRef, useState } from "react";
import { HubActionDialog } from "./HubActionDialog";
type LeaveIntent = { scope: string; run: () => void; warning: string };
/** A single explicit intent; neither repeated clicks nor a replacement account
 * can redirect a confirmation that is already open. No Auth effects. */
export function useHubLeaveConfirmation(scope: string) {
  const [pending, setPending] = useState<LeaveIntent | null>(null), [previousScope, setPreviousScope] = useState(scope);
  const current = useRef<LeaveIntent | null>(null), active = useRef(false);
  if (previousScope !== scope) { setPreviousScope(scope); setPending(null); }
  useEffect(() => { active.current = true; return () => { active.current = false; current.current = null; }; }, [scope]);
  function request(run: () => void, needsConfirmation: boolean, warning: string) {
    if (!active.current || current.current) return;
    if (!needsConfirmation) { run(); return; }
    const intent = { scope, run, warning }; current.current = intent; setPending(intent);
  }
  function cancel(intent: LeaveIntent) { if (current.current !== intent) return; current.current = null; setPending(null); }
  function confirm(intent: LeaveIntent) { if (!active.current || current.current !== intent || intent.scope !== scope) return; current.current = null; setPending(null); intent.run(); }
  const dialog = pending?.scope === scope ? <HubActionDialog title="Leave this workspace?" cancelLabel="Keep draft" confirmLabel="Leave workspace" onClose={() => cancel(pending)} onConfirm={() => confirm(pending)}><p>{pending.warning}</p><p>Keep draft leaves this workspace and its draft open.</p></HubActionDialog> : null;
  return { request, dialog };
}
