"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ProjectWorkspace } from "./ProjectWorkspace";
import type { ClientHubProject } from "./model";
import { ProjectChoiceBar } from "./ProjectChoiceBar";
import { useHubLeaveConfirmation } from "./use-hub-leave-confirmation";
import { activeHubWindowUid, hubWindowGeneration, safeHubReturnPath } from "./window-session";
import styles from "./HubWorkspaceWindow.module.css";

type WorkspaceProps = ComponentProps<typeof ProjectWorkspace>;
export type HubWorkspaceScope = "selected" | "all";
export function openHubWorkspaceWindow(project: ClientHubProject, owner: boolean, scope: HubWorkspaceScope) {
  const uid = owner ? activeHubWindowUid("owner") : `hub:${project.clientId}`;
  const generation = hubWindowGeneration(owner ? "owner" : "client", uid);
  const query = new URLSearchParams({ role: owner ? "owner" : "client", scope, project: project.projectId, generation, returnTo: safeHubReturnPath(window.location.pathname, owner), ...(owner ? { client: project.clientId } : {}) });
  // Standard same-origin sessionStorage copy preserves Firebase's tab-only auth.
  // No tokens or codes are read, serialized or sent. Immediately sever opener;
  // this route owns its gate/listeners and never depends on a parent heartbeat.
  const child = window.open(`/hub-window?${query}`, "_blank", "popup,width=1100,height=850,resizable=yes,scrollbars=yes");
  if (!child) throw new Error("Your browser blocked the window. Allow popups for this site, then try again.");
  try { child.opener = null; } catch { /* The fixed same-origin destination has its own independent auth gate. */ }
}

export function HubWorkspaceWindow({ projects, openVersion = 0, onProjectSelect, onEditCommission, ...props }: WorkspaceProps & { projects: ClientHubProject[]; openVersion?: number; onProjectSelect: (projectId: string) => void; onEditCommission?: () => void; inline?: boolean }) {
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [workspaceBusy, setWorkspaceBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), dirty = useRef(false), busy = useRef(false), previousOpenVersion = useRef(0);
  const titleId = `workspace-window-${props.project.projectId}`;
  const leave = useHubLeaveConfirmation(`${props.owner ? "owner" : "client"}:${props.project.clientId}:${props.project.projectId}:${!!props.disabled}`);
  function moveWorkspace(run: () => void) { leave.request(run, dirty.current || busy.current, busy.current ? "A change may still save on the server. Leaving does not cancel it; an unsaved draft will be discarded." : "Your unsaved draft will be discarded when you leave this workspace view."); }
  function close() { moveWorkspace(() => { setOpen(false); trigger.current?.focus(); }); }
  useEffect(() => {
    if (!openVersion || openVersion === previousOpenVersion.current) return;
    previousOpenVersion.current = openVersion;
    // Choosing a commission never opens an unsolicited modal.
    host.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [openVersion]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current; if (!element.open) element.showModal();
    return () => { if (element.open) element.close(); };
  }, [open]);
  const workspace = <ProjectWorkspace key={props.project.projectId} {...props} onDirtyChange={value => { dirty.current = value; props.onDirtyChange?.(value); }} onBusyChange={value => { busy.current = value; setWorkspaceBusy(value); props.onBusyChange?.(value); }} />;
  function popout() { try { openHubWorkspaceWindow(props.project, !!props.owner, "all"); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "The Hub window could not open."); } }
  const controls = <div className={styles.actions}><button type="button" className={styles.popout} onClick={popout}>Pop out to new window<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg></button></div>;
  return <div ref={host} className={styles.host}>
    <div className={styles.launcher}>{props.owner && <strong className={styles.clientIdentity}>{props.clientNickname || props.clientDisplayName || "Client workspace"}</strong>}{props.owner && onEditCommission && <button type="button" disabled={props.disabled || workspaceBusy} onClick={() => moveWorkspace(onEditCommission)}>Edit commission</button>}{props.owner && <button type="button" ref={trigger} onClick={() => moveWorkspace(() => setOpen(true))}>Open workspace popup</button>}{controls}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!open && workspace}
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}><header><div><p>PRIVATE CLIENT HUB</p><h2 id={titleId}>{props.clientNickname || props.clientDisplayName || "Commission workspace"}</h2></div><button type="button" onClick={close} data-owner-button aria-label="Close workspace popup">×</button></header><div className={styles.toolbar}>{controls}{<ProjectChoiceBar projects={projects} selectedId={props.project.projectId} disabled={props.disabled || workspaceBusy} onSelect={id => { if (id !== props.project.projectId) moveWorkspace(() => onProjectSelect(id)); }} />}</div><div className={styles.body}>{workspace}</div></dialog>}
    {leave.dialog}
  </div>;
}
