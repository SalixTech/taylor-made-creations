"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHubLeaveConfirmation } from "./use-hub-leave-confirmation";
import { AccountThemeSync } from "@/components/AccountThemeSync";
import { useSearchParams } from "next/navigation";
import { ClientHub } from "./ClientHub";
import { FirebaseOwnerGate } from "@/owner/FirebaseOwnerGate";
import { OwnerGateFrame } from "@/owner/OwnerGateFrame";
import { getClientDetail, subscribeClientDetail, type ClientHubDetail } from "@/owner/client-hub-client";
import { assertClientHubId, assertClientHubProjectId, type ClientHubDashboard } from "./model";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ClientCommissionCards, clientArchiveEffective } from "./ClientCommissionCards";
import { ScopedLabelPresentation } from "./LabelPresentationContext";
import { ProjectChoiceBar } from "./ProjectChoiceBar";
import type {InvoiceSupportNavigation} from "./InvoiceInbox";
import type {InvoiceArchiveRequest} from "./invoice-support-navigation";
import { HubNotificationBell } from "./HubNotificationBell";
import { clientHubErrorMessage } from "./client";
import styles from "./HubWorkspaceWindow.module.css";

function IndependentWorkspace({ dashboard, owner, initialProjectId, onSignOut }: { dashboard: ClientHubDashboard; owner: boolean; initialProjectId: string; initialScope: "selected" | "all"; onSignOut: () => void }) {
  const [selectedId, setSelectedId] = useState(initialProjectId);
  const [popupProjectId,setPopupProjectId]=useState<string|null>(null);
  const [archiveRequest,setArchiveRequest]=useState<InvoiceArchiveRequest|undefined>(()=>!owner&&dashboard.projects.some(p=>p.projectId===initialProjectId&&clientArchiveEffective(p))?{projectId:initialProjectId,sequence:1}:undefined);
  const [showArchived, setShowArchived] = useState(false);
  const archived = (item: ClientHubDashboard["projects"][number]) => !!item.ownerArchived;
  const archivedCount = owner ? dashboard.projects.filter(archived).length : 0;
  const visibleProjects = owner && !showArchived ? dashboard.projects.filter(item => !archived(item) || item.projectId === selectedId) : dashboard.projects;
  const [navigation, setNavigation] = useState<{ tab: "chat" | "photos" | "support"; projectId: string; requestId?: string; invoiceHelp?:boolean; version: number }>();
  const dirty = useRef(false), busy = useRef(false),invoiceSupportBlocked=useRef(true);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const project = dashboard.projects.find(item => item.projectId === selectedId);
  const leave = useHubLeaveConfirmation(`${owner ? "owner" : "client"}:${dashboard.client.clientId}:${dashboard.client.authVersion}:${dashboard.client.status}:${selectedId}`);
  function moveWorkspace(run: () => void) { leave.request(run, dirty.current || busy.current, busy.current ? "A change may still save on the server. Leaving does not cancel it; an unsaved draft will be discarded." : "Your unsaved draft will be discarded when you leave this commission."); }
  function changeProject(id: string, after?: () => void) { if (!dashboard.projects.some(item => item.projectId === id)) return; if (id === selectedId) { after?.(); return; } moveWorkspace(() => { setSelectedId(id); after?.(); }); }
  const supportScope=useRef({dashboard,selectedId,popupProjectId,active:true});
  useLayoutEffect(()=>{const current={dashboard,selectedId,popupProjectId,active:true};supportScope.current=current;return()=>{current.active=false;};},[dashboard,selectedId,popupProjectId]);
  const contactInvoiceSupport:InvoiceSupportNavigation=(target,accepted,rejected)=>{
    if(owner){rejected("Open the client commission workspace to review support.");return;}
    const clientId=dashboard.client.clientId,epoch=dashboard.client.authVersion;
    const verified=()=>{const latest=supportScope.current;return latest.active&&target.isCurrent()&&latest.dashboard.client.clientId===clientId&&latest.dashboard.client.authVersion===epoch&&latest.dashboard.client.status==="active"&&target.clientId===clientId?latest.dashboard.projects.find(p=>p.clientId===clientId&&p.projectId===target.projectId):undefined;};
    const activeBlocked=()=>{const latest=supportScope.current,active=latest.dashboard.projects.find(p=>p.projectId===latest.selectedId);return busy.current||!!active&&!clientArchiveEffective(active)&&active.projectId!==latest.popupProjectId&&invoiceSupportBlocked.current;};
    if(!verified()||activeBlocked()){rejected("This commission is unavailable or a change still needs verification. Your workspace has not changed.");return;}
    const go=()=>{const found=verified();if(!found||activeBlocked()){rejected("The verified workspace changed. Refresh before opening invoice support.");return;}
      if(clientArchiveEffective(found)||supportScope.current.popupProjectId===found.projectId){setArchiveRequest(previous=>({projectId:found.projectId,sequence:(previous?.sequence??0)+1,tab:"support",invoiceSupport:{target,accepted,rejected}}));return;}
      setSelectedId(found.projectId);setNavigation(previous=>({projectId:found.projectId,tab:"support",invoiceHelp:true,version:(previous?.version??0)+1}));accepted();
    };
    if(selectedId===target.projectId&&!popupProjectId)go();else leave.request(go,dirty.current,"Your unsaved draft will be discarded when you open this invoice’s commission support.");
  };
  if (!project) return <section className={styles.standalone}><h1>Commission unavailable</h1><p>This commission is not part of your verified client workspace. No other commission was substituted.</p><button type="button" onClick={onSignOut}>Sign out</button></section>;
  return <ScopedLabelPresentation owner={owner} project={project}><section className={styles.standalone} data-independent-hub-window>{!owner && <AccountThemeSync role="client" accountKey={dashboard.client.clientId} />}<header><div><p>PRIVATE CLIENT HUB</p><h1>{dashboard.client.nickname || dashboard.client.displayName}</h1></div><div className={styles.actions}><HubNotificationBell onContactInvoiceSupport={owner?undefined:contactInvoiceSupport} owner={owner} accountKey={owner ? `owner:${dashboard.client.clientId}` : dashboard.client.clientId} onNavigate={item => { if(!owner&&dashboard.projects.some(p=>p.projectId===item.projectId&&clientArchiveEffective(p))){moveWorkspace(()=>setArchiveRequest(previous=>({projectId:item.projectId,sequence:(previous?.sequence??0)+1,tab:item.channel==="requests"?"support":item.channel,requestId:item.requestId})));return;} changeProject(item.projectId, () => setNavigation(previous => ({ projectId: item.projectId, tab: item.channel === "requests" ? "support" : item.channel, requestId: item.requestId, version: (previous?.version ?? 0) + 1 }))); }} /><button type="button" onClick={onSignOut}>Sign out</button></div></header><div className={styles.toolbar}>{owner && archivedCount > 0 && <label className={styles.archiveToggle}><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Show archived commissions ({archivedCount})</label>}{owner ? <ProjectChoiceBar projects={visibleProjects} selectedId={selectedId} disabled={workspaceBusy} onSelect={changeProject} /> : <ClientCommissionCards onBeforeArchive={moveWorkspace} onPopupProjectChange={setPopupProjectId} archiveRequest={archiveRequest} key={`${dashboard.client.clientId}:${dashboard.client.authVersion}`} accountKey={`${dashboard.client.clientId}:${dashboard.client.authVersion}`} clientDisplayName={dashboard.client.displayName} clientNickname={dashboard.client.nickname} onSessionError={onSignOut} projects={dashboard.projects} selectedId={selectedId} disabled={workspaceBusy || dashboard.client.status !== "active"} onSelect={changeProject} />}</div>{(owner||(!clientArchiveEffective(project)&&project.projectId!==popupProjectId))&&<ProjectWorkspace key={`${dashboard.client.clientId}:${dashboard.client.authVersion}:${project.projectId}`} project={project} owner={owner} clientDisplayName={dashboard.client.displayName} clientNickname={dashboard.client.nickname} disabled={dashboard.client.status !== "active"} navigation={navigation} onInvoiceSupportBlockedChange={value=>{invoiceSupportBlocked.current=value;}} onDirtyChange={value => { dirty.current = value; }} onBusyChange={value => { busy.current = value; setWorkspaceBusy(value); }} onSessionError={onSignOut} />}{leave.dialog}</section></ScopedLabelPresentation>;
}
function OwnerWindow({ clientId, projectId, scope, onSignOut }: { clientId: string; projectId: string; scope: "selected" | "all"; onSignOut: () => void }) {
  const [detail, setDetail] = useState<ClientHubDetail | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true, revision = 0;
    const fail = (cause: unknown) => { if (!active) return; revision++; setDetail(null); setError(clientHubErrorMessage(cause)); };
    const stop = subscribeClientDetail(clientId, value => { if (active) { revision++; setDetail(value); setError(""); } }, fail);
    const initial = revision; void getClientDetail(clientId).then(value => { if (active && initial === revision) setDetail(value); }).catch(cause => {
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
      // A newer authoritative snapshot supersedes only an old transport failure;
      // authentication/revocation failures must still lock the active window.
      const transportFailure = ["unavailable", "deadline-exceeded", "firestore/unavailable", "firestore/deadline-exceeded", "functions/unavailable", "functions/deadline-exceeded", "auth/network-request-failed", "network-request-failed"].includes(code) || cause instanceof TypeError && /fetch|network/i.test(cause.message);
      if (initial === revision || !transportFailure) fail(cause);
    });
    return () => { active = false; stop(); };
  }, [clientId]);
  return <OwnerGateFrame>{detail ? <IndependentWorkspace dashboard={detail} owner initialProjectId={projectId} initialScope={scope} onSignOut={onSignOut} /> : <section className={styles.standalone}><h1>{error ? "Workspace locked" : "Checking your client workspace…"}</h1>{error && <p role="alert">{error}</p>}<button type="button" onClick={onSignOut}>Sign out</button></section>}</OwnerGateFrame>;
}
export function HubWindowRoute() {
  const params = useSearchParams(), role = params.get("role"), projectId = params.get("project") ?? "", clientId = params.get("client") ?? "", scope = params.get("scope") === "all" ? "all" : "selected";
  try { assertClientHubProjectId(projectId); if (role === "owner") assertClientHubId(clientId); if (!["owner", "client"].includes(role ?? "") || !/^(?:0|[a-f0-9-]{36})$/.test(params.get("generation") ?? "")) throw new Error(); }
  catch { return <section className={styles.standalone}><h1>Open this window from your Hub</h1><p>The workspace link is incomplete. Use “Pop out to new window” after signing in.</p></section>; }
  if (role === "owner") return <FirebaseOwnerGate>{session => <OwnerWindow key={`${clientId}:${projectId}`} clientId={clientId} projectId={projectId} scope={scope} onSignOut={() => { void session.signOut(); }} />}</FirebaseOwnerGate>;
  return <ClientHub renderDashboard={props => <IndependentWorkspace key={`${props.client.clientId}:${props.client.authVersion}:${projectId}`} dashboard={props} owner={false} initialProjectId={projectId} initialScope={scope} onSignOut={props.onSignOut} />} />;
}
