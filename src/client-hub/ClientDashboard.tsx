"use client";
import { useConfirmAction } from "./use-confirm-action";

import { AccountThemeSync } from "@/components/AccountThemeSync";
import { RefreshIcon } from "@/components/RefreshIcon";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { ClientHubClient, ClientHubProject, HubNotification } from "./model";
import { updateHubNickname, saveHubAvatar, clientHubErrorMessage } from "./client";
import { CLIENT_HUB_CONTACT_HREF, clientUpdateDate, safeTrackingUrl } from "./presentation";
import { guardFormEnter, type WorkspaceTab } from "./ProjectWorkspace";
import { HubNotificationBell } from "./HubNotificationBell";
import { restoreHubNavigation, saveHubNavigation, clearHubNavigation, type HubNavigationTab, type HubNavigation } from "./session-navigation";
import { ClientAvatar } from "./ClientAvatar";
import { SpadeMark } from "./SpadeMark";
import { ScopedLabelPresentation, PresentedStatus } from "./LabelPresentationContext";
import { AvatarCrop } from "./AvatarCrop";
import { ClientCommissionCards, clientArchiveEffective } from "./ClientCommissionCards";
import { HubWorkspaceWindow } from "./HubWorkspaceWindow";
import styles from "./ClientHub.module.css";

export type ClientDashboardProps = { client: ClientHubClient; projects: ClientHubProject[]; onRefresh: () => void; onSignOut: () => void };

export function ProjectDetail({ project }: { project: ClientHubProject }) {
  const trackingUrl = safeTrackingUrl(project.trackingUrl);
  return <article className={styles.projectDetail} aria-labelledby="client-project-title">
    {["shipped", "delivered"].includes(project.status) && trackingUrl && <section className={styles.tracking}><h3>Shipment tracking</h3><a className={styles.secondary} href={trackingUrl} target="_blank" rel="noopener noreferrer">Open tracking ↗</a></section>}
    <header className={styles.projectHeader}><div><p className={styles.eyebrow}>YOUR COMMISSION</p><h2 id="client-project-title">{project.title}</h2></div><PresentedStatus className={styles.status} status={project.status} /></header>
    <p className={styles.summary}>{project.summary.trim() || "Your commission details will appear here live as updates happen"}</p>
    <p className={styles.updated}>Commission last updated {clientUpdateDate(project.updatedAt)}.</p>
  </article>;
}

export function ClientDashboard({ client, projects: incomingProjects, onRefresh, onSignOut }: ClientDashboardProps) {
  const [projectUpdates,setProjectUpdates] = useState<Record<string,ClientHubProject>>({});
  const projects = incomingProjects.map(p => projectUpdates[p.projectId]?.clientId === p.clientId && projectUpdates[p.projectId]?.version > p.version ? projectUpdates[p.projectId] : p);
  const [popupProjectId,setPopupProjectId] = useState<string|null>(null);
  const [archiveRequest,setArchiveRequest] = useState<{projectId:string;sequence:number;tab?:"overview"|"chat"|"photos"|"support";requestId?:string}>();
  const [cropSource,setCropSource] = useState<File|null>(null);
  const { confirm, confirmation } = useConfirmAction();
  const restoredEntry = useRef<HubNavigation | null | undefined>(undefined);
  const entry = useRef({ clientId: client.clientId, epoch: client.authVersion, projects });
  const [selectedId, setSelectedId] = useState(projects[0]?.projectId ?? "");
  const [workspaceDirty, setWorkspaceDirty] = useState(false), [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false), [nickname, setNickname] = useState(client.nickname ?? ""), [nicknameBusy, setNicknameBusy] = useState(false), [nicknameError, setNicknameError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profilePending, setProfilePending] = useState<"nickname" | "avatar" | null>(null);
  const [nameOverride, setNameOverride] = useState<{ value: string; baseline: string } | null>(null), [navigation, setNavigation] = useState<{ tab: WorkspaceTab; version: number; projectId?: string; requestId?: string } | undefined>();
  const [avatarClient, setAvatarClient] = useState<ClientHubClient | null>(null), [avatarFile, setAvatarFile] = useState<File | null>(null), [avatarAttempt, setAvatarAttempt] = useState<{ operationId: string; client: ClientHubClient; file: File } | null>(null);
  const avatarPending = useRef(false), avatarInput = useRef<HTMLInputElement>(null), settingsTrigger = useRef<HTMLButtonElement>(null);
  const effectiveClient = avatarClient && avatarClient.updatedAt > client.updatedAt ? avatarClient : client;
  const profileScope = `${client.clientId}:${client.authVersion}`;
  const profileScopeRef = useRef(profileScope);
  useLayoutEffect(()=>{profileScopeRef.current=profileScope;return()=>{profileScopeRef.current="";};},[profileScope]);
  const [previousProfileScope,setPreviousProfileScope]=useState(profileScope);
  if(previousProfileScope!==profileScope){setPreviousProfileScope(profileScope);setCropSource(null);setAvatarFile(null);setAvatarAttempt(null);setAvatarClient(null);setNicknameError("");setNicknameBusy(false);setProfilePending(null);}
  const mounted = useRef(false), nicknamePending = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const inlineProjects = projects.filter(project => !clientArchiveEffective(project));
  const selected = inlineProjects.find(project => project.projectId === selectedId) ?? inlineProjects[0];
  useEffect(() => { mounted.current = true; heading.current?.focus({ preventScroll: true }); return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const { clientId, epoch, projects: initialProjects } = entry.current;
    if (restoredEntry.current === undefined) restoredEntry.current = restoreHubNavigation(clientId, epoch, initialProjects);
    const saved = restoredEntry.current;
    // Strict Mode can replay setup/cleanup; replay the same non-secret entry, not a second storage read.
    if (saved) { setSelectedId(saved.projectId); setNavigation({ ...saved, version: 1 }); saveHubNavigation(clientId, epoch, saved); }
    // A route departure/sign-out clears the entry. Browser reload does not run React unmount.
    return () => clearHubNavigation(clientId, epoch);
  }, []);
  function remember(projectId: string, tab: WorkspaceTab) { if (tab !== "studio") saveHubNavigation(client.clientId, client.authVersion, { projectId, tab: tab as HubNavigationTab }); }
  const preferredName = nameOverride && nameOverride.baseline === (client.nickname ?? "") ? nameOverride.value : client.nickname ?? "";
  async function leaveWorkspace(action: () => void) {
    if (nicknamePending.current || avatarPending.current) return;
    if ((workspaceDirty || workspaceBusy) && !await confirm(workspaceBusy ? "A change may still save on the server. Leave this workspace?" : "You have an unsaved draft. Leave this workspace and discard it?")) return;
    setWorkspaceDirty(false); setWorkspaceBusy(false); action();
  }
  async function beforeArchive(action:()=>void){
    if(nicknamePending.current||avatarPending.current)return;
    if((workspaceDirty||workspaceBusy)&&!await confirm(workspaceBusy?"A change may still save on the server. Archive this card?":"Archiving may close the selected workspace and discard its unsaved attachment or support draft. Continue?"))return;
    action(); // Keep dirty state until a confirmed update actually unmounts that workspace.
  }
  function clearProfileFeedback() { setNicknameError(""); setProfileNotice(""); }
  function closeSettings() { setCropSource(null); setNicknameOpen(false); clearProfileFeedback(); settingsTrigger.current?.focus(); }
  useEffect(() => { if (!profileNotice) return; const timer = setTimeout(() => setProfileNotice(""), 5000); return () => clearTimeout(timer); }, [profileNotice]);
  async function saveNickname(event: FormEvent) {
    event.preventDefault(); if (nicknamePending.current || avatarPending.current) return;
    nicknamePending.current = true; setNicknameBusy(true); setProfilePending("nickname"); clearProfileFeedback();
    try { const result = await updateHubNickname(effectiveClient, nickname.trim()); if (mounted.current) { setAvatarClient(result.client); setProfileNotice("Saved Successfully"); setNameOverride({ value: nickname.trim(), baseline: client.nickname ?? "" }); } }
    catch (error) { if (mounted.current) setNicknameError(clientHubErrorMessage(error)); }
    finally { nicknamePending.current = false; if (mounted.current) { setNicknameBusy(false); setProfilePending(null); } }
  }
  function chooseAvatar(file:File|null){if(avatarAttempt||avatarPending.current||nicknamePending.current)return;clearProfileFeedback();if(file&&(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<=0||file.size>2*1024*1024)){setAvatarFile(null);setNicknameError("Choose a JPG, PNG or WebP profile picture up to 2 MiB (2,097,152 bytes).");return;}setCropSource(file);}
  async function persistAvatar(file:File) {
    if(!mounted.current||profileScopeRef.current!==profileScope)throw Error("The profile session changed.");
    if(avatarPending.current||nicknamePending.current)throw Error("A profile change is already saving.");
    clearProfileFeedback();
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>2*1024*1024||file.size<=0)throw Error("Choose a JPG, PNG or WebP profile picture up to 2 MiB.");
    const startScope=profileScope,attempt=avatarAttempt??{operationId:crypto.randomUUID(),client:effectiveClient,file};
    setAvatarFile(attempt.file);setAvatarAttempt(attempt);avatarPending.current=true;setNicknameBusy(true);setProfilePending("avatar");
    try {
      const result=await saveHubAvatar(attempt.client,attempt.file,attempt.operationId);
      if(!mounted.current||profileScopeRef.current!==startScope)throw Error("The profile session changed.");
      setAvatarClient(result.client);setProfileNotice("Saved Successfully");setAvatarFile(null);setAvatarAttempt(null);setCropSource(null);if(avatarInput.current)avatarInput.current.value="";
    } catch(error) {
      if(mounted.current&&profileScopeRef.current===startScope){setNicknameError(clientHubErrorMessage(error));if(error&&typeof error==="object"&&"code" in error&&["invalid-argument","functions/invalid-argument"].includes(String(error.code)))setAvatarAttempt(null);}
      throw error;
    } finally {avatarPending.current=false;if(mounted.current&&profileScopeRef.current===startScope){setNicknameBusy(false);setProfilePending(null);}}
  }
  async function saveAvatar(event:FormEvent){event.preventDefault();if(avatarPending.current||nicknamePending.current||cropSource||!avatarFile)return;try{await persistAvatar(avatarFile);}catch{/* Feedback and the immutable retry remain visible. */}}
  function openNotification(item: HubNotification) {
    if (!projects.some(project => project.projectId === item.projectId)) return;
    if (projects.some(project => project.projectId === item.projectId && clientArchiveEffective(project))) { leaveWorkspace(() => setArchiveRequest(previous => ({projectId:item.projectId,sequence:(previous?.sequence??0)+1,tab:item.channel==="requests"?"support":item.channel,requestId:item.requestId}))); return; }
    leaveWorkspace(() => { remember(item.projectId, item.channel === "requests" ? "support" : item.channel); setSelectedId(item.projectId); setNavigation(previous => ({ projectId: item.projectId, tab: item.channel === "requests" ? "support" : item.channel, requestId: item.requestId, version: (previous?.version ?? 0) + 1 })); });
  }
  function openSupport() {
    if (!selected || workspaceBusy) return;
    // This stays within the active commission; no draft is thrown away.
    remember(selected.projectId, "support");
    setNavigation(previous => ({ projectId: selected.projectId, tab: "support", version: (previous?.version ?? 0) + 1 }));
  }
  const activeProjects = projects.filter(project => !["completed", "shipped", "delivered", "cancelled"].includes(project.status)).length;
  const completedProjects = projects.filter(project => ["completed", "shipped", "delivered"].includes(project.status)).length;
  return <ScopedLabelPresentation owner={false} project={selected}><div className={styles.dashboard}>{confirmation}{cropSource && <AvatarCrop key={`${client.clientId}:${client.authVersion}`} file={cropSource} onCancel={()=>setCropSource(null)} onApply={persistAvatar}/>}<AccountThemeSync role="client" accountKey={client.clientId} />
    <header className={styles.dashboardHeader}>
      <div className={styles.welcomeIdentity}><ClientAvatar client={effectiveClient} owner={false} /><div><p className={styles.eyebrow}>TAYLOR MADE CREATIONS · CLIENT HUB</p><h1 ref={heading} className={styles.programmaticHeading} tabIndex={-1}>Your character. Your space.</h1><p>Welcome back, {preferredName || client.displayName}. Here’s where your dream comes alive.</p></div></div>
      <div className={styles.headerActions}><button className={`${styles.secondary} ${styles.refreshRound}`} type="button" aria-label="Refresh updates" title="Refresh updates" disabled={workspaceBusy || nicknameBusy} onClick={onRefresh}><RefreshIcon /></button><HubNotificationBell owner={false} accountKey={client.clientId} onNavigate={openNotification} /><button ref={settingsTrigger} className={styles.secondary} type="button" disabled={nicknameBusy} aria-expanded={nicknameOpen} onClick={() => { setNickname(preferredName); clearProfileFeedback(); setNicknameOpen(true); }}>Edit Profile</button><button className={styles.secondary} type="button" disabled={nicknameBusy} onClick={() => leaveWorkspace(onSignOut)}>Sign out</button></div>
    </header>
    {!nicknameOpen && nicknameBusy && <p role="status" className={styles.updated}>Your display changes are still saving in the background.</p>}
    {nicknameOpen && <section className={styles.accountSettings} aria-label="Your display settings"><button className={styles.settingsClose} type="button" aria-label="Close display settings" onClick={closeSettings}>×</button>{profileNotice && <p className={styles.profileSuccess} role="status">{profileNotice}</p>}{nicknameError && <p className={styles.alert} role="alert">{nicknameError}</p>}<form className={styles.nicknameForm} aria-busy={profilePending === "nickname"} onKeyDown={guardFormEnter} onSubmit={event => void saveNickname(event)}><label>What should we call you?<input value={nickname} maxLength={60} disabled={nicknameBusy} onChange={event => { setNickname(event.target.value); clearProfileFeedback(); }} placeholder={client.displayName} /></label><p>This display name follows you across your commissions. Taylor keeps your original client name for reference.</p><div><button className={styles.primary} type="submit" disabled={nicknameBusy}>{profilePending === "nickname" ? "Saving…" : "Save"}</button></div></form><form className={styles.nicknameForm} aria-busy={profilePending === "avatar"} onKeyDown={guardFormEnter} onSubmit={event => void saveAvatar(event)}><label>Profile picture<input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={nicknameBusy || !!avatarAttempt} onChange={event => { chooseAvatar(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><p>JPG, PNG or WebP up to 2 MiB and 2048 × 2048 pixels. Drag to position your crop, then Save to update your private profile picture.</p>{avatarFile && <p role="status">The last profile picture save is waiting for confirmation.</p>}<div><button className={styles.primary} type="submit" disabled={nicknameBusy || !avatarFile}>{profilePending === "avatar" ? "Saving…" : avatarAttempt ? "Retry profile picture" : "Save"}</button></div></form>{avatarAttempt && !nicknameBusy && <p>The last picture save could not be confirmed. Retry uses the same upload, so it cannot create a second save.</p>}<button className={styles.secondary} type="button" onClick={closeSettings}>Close settings</button></section>}

    <div className={styles.dashboardStats} aria-label="Your commission overview"><div><span>In the making</span><strong>{activeProjects}<small>active commissions</small></strong></div><div><span>Ready for adventures</span><strong>{completedProjects}<small>completed or on their way</small></strong></div><div className={styles.studioPromise}><SpadeMark /><span>YOUR DIRECT LINE TO THE STUDIO</span><p>A little less wondering.<br />A little closer to your character.</p></div></div>
    {projects.length ? <div className={styles.projectLayout}>
      <section className={styles.projects} aria-labelledby="client-commissions-title">
        <ClientCommissionCards onBeforeArchive={action=>void beforeArchive(action)} onPopupProjectChange={setPopupProjectId} key={`${client.clientId}:${client.authVersion}`} accountKey={`${client.clientId}:${client.authVersion}`} clientDisplayName={client.displayName} clientNickname={preferredName} onSessionError={onSignOut} onProjectUpdated={saved=>setProjectUpdates(previous=>({...previous,[saved.projectId]:saved}))} archiveRequest={archiveRequest} projects={projects} selectedId={selected?.projectId ?? ""} disabled={workspaceBusy || nicknameBusy} onSelect={projectId => { if (selected?.projectId !== projectId) leaveWorkspace(() => { setSelectedId(projectId); remember(projectId, "overview"); setNavigation(previous => ({ projectId, tab: "overview", version: (previous?.version ?? 0) + 1 })); }); }} />
      </section>
      {selected && selected.projectId !== popupProjectId && <div id="selected-client-project" className={styles.selectedWorkspace}><HubWorkspaceWindow key={`${client.clientId}:${client.authVersion}`} projects={inlineProjects} onProjectSelect={projectId => leaveWorkspace(() => { setSelectedId(projectId); remember(projectId, "overview"); setNavigation(previous => ({ projectId, tab: "overview", version: (previous?.version ?? 0) + 1 })); })} project={selected} clientDisplayName={client.displayName} clientNickname={preferredName} accountKey={`${client.clientId}:${client.authVersion}`} navigation={navigation} onTabChange={tab => remember(selected.projectId, tab)} onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} onSessionError={() => onSignOut()} /></div>}
    </div> : <section className={styles.emptyProjects} aria-labelledby="client-empty-title"><SpadeMark /><h2 id="client-empty-title">Your next character starts here.</h2><p>No commissions are linked yet. When Taylor adds one, you’ll find it here.</p><a className={styles.secondary} href={CLIENT_HUB_CONTACT_HREF}>Contact Taylor</a></section>}
    <div className={styles.dashboardFooter}><p>All invoices and payments are handled through PayPal.</p>{selected ? <button type="button" className={styles.helpLink} disabled={workspaceBusy || nicknameBusy} onClick={openSupport}>Need a helping paw?</button> : <a href={CLIENT_HUB_CONTACT_HREF}>Contact Taylor</a>}</div>
  </div></ScopedLabelPresentation>;
}
