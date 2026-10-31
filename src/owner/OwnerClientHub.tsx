"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {useClientOrder} from "./use-client-order";
import {orderClients,spliceVisibleClientOrder} from "./client-order";
import { readOwnerHubLocation, replaceOwnerHubLocation, OWNER_HUB_LOCATION_RESTORE, type OwnerHubLocation } from "./owner-hub-location";
import { initialLabelAppearance, labelAppearanceFields, labelAppearanceValid, type LabelAppearanceDraft } from "./label-appearance-fields";
import { Dialog } from "./OwnerDialog";
import { LabelPresentationEditor, type LabelPresentationDraft } from "./LabelPresentationEditor";
import { LabelPresentationContext, PresentedStatus, useLabelPresentationController } from "@/client-hub/LabelPresentationContext";
import { assignedLabelDefinition, type LabelDefinition, type LabelPresentation } from "@/client-hub/label-presentation";
import { getOwnerLabelPresentationContext, getOwnerLabelPresentation } from "@/client-hub/label-presentation-client";
import { OwnerSelect, Toggle } from "./OwnerFields";
import { taylorOwnerSession } from "./taylor-services-client";
import { getMilestoneDefaults, saveMilestoneDefaults, setProjectArchived, type HubMilestoneDefaults, clientHubErrorMessage, createClient, createProject, getClientDetail, listClients, resetClientLoginCode, setClientStatus, updateClientProfile, updateProject, subscribeClients, subscribeClientDetail } from "./client-hub-client";
import { ClientAvatar } from "@/client-hub/ClientAvatar";
import { SpadeMark } from "@/client-hub/SpadeMark";
import { RefreshIcon } from "@/components/RefreshIcon";
import { HubWorkspaceWindow } from "@/client-hub/HubWorkspaceWindow";
import { type WorkspaceTab } from "@/client-hub/ProjectWorkspace";
import { getProjectMilestones, validateHubMilestones, newLocalLabelKey, type ProjectLocalLabelDefinitions, type HubMilestone, CLIENT_HUB_INFORMATION_TAGS, type ClientHubInformationTag, type ClientHubClient, type ClientHubProject, type HubNotification } from "@/client-hub/model";
import { HubMilestoneEditor } from "./HubMilestoneEditor";
import { InformationTags } from "@/client-hub/InformationTags";
import buttons from "./OwnerButton.module.css";
import styles from "./OwnerClientHub.module.css";

import { useConfirmAction } from "@/client-hub/use-confirm-action";
import { useAddClientLabel } from "./owner-whimsy";

const secondary = `${buttons.button} ${buttons.secondary}`;
const primary = `${buttons.button} ${buttons.primary}`;
const danger = `${buttons.button} ${buttons.danger}`;
const statuses = [
  { value: "queued", label: "Not Started" }, { value: "in-progress", label: "In Progress" },
  { value: "on-hold", label: "On hold for Materials" }, { value: "delayed", label: "Delayed" }, { value: "completed", label: "Completed" },
  { value: "shipped", label: "Shipped" }, { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" },
] as const;
const archivedCard = (project: ClientHubProject) => !!project.ownerArchived;
const errorText = clientHubErrorMessage;
const ownerSessionFailure = (error: unknown) => { const code = error && typeof error === "object" && "code" in error ? String(error.code).split("/").at(-1) : ""; return ["permission-denied", "unauthenticated", "user-token-expired", "user-disabled"].includes(code ?? ""); };
const dateText = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";
type ClientDraft = { displayName: string; email: string; projectTitle: string };
type ProjectDraft = { labelOrder: string[]; localLabelDefinitions: ProjectLocalLabelDefinitions; trackingEnabled: boolean; milestones: HubMilestone[]; activeMilestoneId: string | null; informationTags: ClientHubInformationTag[]; title: string; summary: string; status: ClientHubProject["status"]; progress: string; trackingUrl: string; trelloUrl: string };
type Editor =
  | { kind: "client"; operationId: string; value: ClientDraft; initial: ClientDraft; attempted: boolean }
  | { kind: "project"; operationId: string; clientId: string; previous: ClientHubProject | null; value: ProjectDraft; initial: ProjectDraft; attempted: boolean };
type ProfileDraft = { displayName: string; email: string };
type ProfileEditor = { previous: ClientHubClient; value: ProfileDraft; initial: ProfileDraft; ready: boolean; attempted: boolean };
type Detail = { client: ClientHubClient; email?: string; projects: ClientHubProject[] };
type Credentials = { client: ClientHubClient; code?: string; reset: boolean };
const emptyClient = (): ClientDraft => ({ displayName: "", email: "", projectTitle: "" });
const projectDraft = (project?: ClientHubProject): ProjectDraft => ({ labelOrder: [...(project?.labelOrder ?? [])], localLabelDefinitions: structuredClone(project?.localLabelDefinitions ?? {}), trackingEnabled: project?.trackingEnabled !== false, milestones: getProjectMilestones(project ?? {}).map(node => ({ ...node })), activeMilestoneId: project?.activeMilestoneId ?? null, informationTags: project?.informationTags ?? [], title: project?.title ?? "", summary: project?.summary ?? "", status: project?.status ?? "queued", progress: project?.progress == null ? "" : String(project.progress), trackingUrl: project?.trackingUrl ?? "", trelloUrl: project?.trelloUrl ?? "" });

function CopyIcon() { return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>; }

/** Private records and one-time credentials exist only in this mounted workspace. */
export function OwnerClientHub({ onDirtyChange, onBusyChange, openNotification, onDiscardReady }: { onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; openNotification?: HubNotification | null; onDiscardReady?: (discard: (() => void) | null) => void } = {}) {
  const addClientLabel = useAddClientLabel();
  const labelSettings = useLabelPresentationController(true);
  const [tagHierarchy, setTagHierarchy] = useState<{draft:LabelPresentationDraft;baseline:LabelPresentation;legacyCandidates:Record<string,LabelDefinition>;adoptLegacyKeys:string[];projectId?:string}|null>(null);
  const [labelOpening,setLabelOpening]=useState(false);const labelOpenSequence=useRef(0);
  const labelDirty=!!tagHierarchy&&JSON.stringify(tagHierarchy.draft)!==JSON.stringify({entries:tagHierarchy.baseline.entries,order:tagHierarchy.baseline.order});
  const { confirm, confirmation, cancel: cancelConfirmation } = useConfirmAction();
  const [removedLabels, setRemovedLabels] = useState<string[]>([]);
  const [archiveClientId, setArchiveClientId] = useState<string | null>(null);
  const [archiveSelecting, setArchiveSelecting] = useState(false);
  const archiveSelectionPending = useRef(false);
  const [showArchived, setShowArchived] = useState(false);
  const [defaultsDiscard, setDefaultsDiscard] = useState<"close" | "reload" | null>(null);
  const [defaultsEditor, setDefaultsEditor] = useState<{ saved: HubMilestoneDefaults; value: HubMilestone[] } | null>(null);
  const defaultsDirty = !!defaultsEditor && JSON.stringify(defaultsEditor.value) !== JSON.stringify(defaultsEditor.saved.milestones);
  const [clients, setClients] = useState<ClientHubClient[]>([]);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0), [detailSubscriptionAttempt, setDetailSubscriptionAttempt] = useState(0);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [error, setError] = useState("");
  const clientOrder=useClientOrder(ready);
  const [dragClient,setDragClient]=useState<string|null>(null),[dropClient,setDropClient]=useState<string|null>(null);
  const dragOrder=useRef<{id:string;revision:number;full:string[];visible:string[]}|null>(null);
  const suppressClientClick=useRef(false);
  const [query, setQuery] = useState(""), [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [modalError, setModalErrorState] = useState("");
  const editorIdentity = editor?.kind === "project" ? editor.operationId : null;
  const editorIdentityRef = useRef(editorIdentity);
  useEffect(() => { editorIdentityRef.current = editorIdentity; }, [editorIdentity]);
  const [localLabelEditor,setLocalLabelEditor]=useState<{key:string;value:LabelAppearanceDraft}|null>(null);
  const localLabelRef=useRef<typeof localLabelEditor>(null);
  const [localLabelError,setLocalLabelError]=useState("");
  const [modalNotice,setModalNotice]=useState("");
  const modalNoticeRef=useRef<HTMLDivElement>(null);
  const [modalErrorVisible,setModalErrorVisible]=useState(true);
  const [modalErrorRevision,setModalErrorRevision]=useState(0);
  const setModalError=useCallback((value:string)=>{setModalErrorState(value);setModalErrorVisible(true);setModalErrorRevision(previous=>previous+1);},[]);
  const [expandedGridClient,setExpandedGridClient]=useState<string|null>(null);
  const [profileEditor, setProfileEditor] = useState<ProfileEditor | null>(null), [profileDiscard, setProfileDiscard] = useState(false);
  const [resetTarget, setResetTarget] = useState<ClientHubClient | null>(null), [credentials, setCredentials] = useState<Credentials | null>(null);
  const [discard, setDiscard] = useState(false), [hideCode, setHideCode] = useState(false), [notice, setNoticeState] = useState("");
  const [noticeVersion, setNoticeVersion] = useState(0);
  const setNotice = useCallback((value: string) => { setNoticeState(value); setNoticeVersion(version => version + 1); }, []);
  const [copyNotice, setCopyNotice] = useState("");
  const [workspaceDirty, setWorkspaceDirty] = useState(false), [workspaceBusy, setWorkspaceBusy] = useState(false);
  const workspaceDirtyRef = useRef(false);
  const [workspaceDiscardSafe, setWorkspaceDiscardSafe] = useState(false);
  const workspaceDiscardCheck = useRef<(() => boolean) | null>(null);
  const registerWorkspaceDiscard = useCallback((check: (() => boolean) | null) => { workspaceDiscardCheck.current = check; setWorkspaceDiscardSafe(!!check); }, []);
  const updateWorkspaceDirty = useCallback((value: boolean) => { workspaceDirtyRef.current = value; setWorkspaceDirty(value); }, []);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProjectRef = useRef<string | null>(null);
  useEffect(() => { selectedProjectRef.current = selectedProjectId; }, [selectedProjectId]);
  const [workspaceMountVersion, setWorkspaceMountVersion] = useState(0);
  const [workspaceNavigation, setWorkspaceNavigation] = useState<{ tab: WorkspaceTab; version: number; requestId?: string }>();
  const [workspaceFocusVersion, setWorkspaceFocusVersion] = useState(0);
  const locationIntent = useRef(0), locationRestored = useRef(false);
  const initialHubLocation = useRef(typeof window === "undefined" ? null : readOwnerHubLocation(window.location.href));
  const currentTab = useRef<WorkspaceTab>("overview");
  const [statusTarget, setStatusTarget] = useState<ClientHubClient | null>(null);
  const [clientFilter, setClientFilter] = useState<"all" | "active" | "suspended">("all");
  const alive = useRef(false), pending = useRef(false), lifecycle = useRef(0), listVersion = useRef(0), detailVersion = useRef(0);
  const chosen = useRef<string | null>(null), modalErrorRef = useRef<HTMLDivElement>(null), profileNameInput = useRef<HTMLInputElement>(null), directoryRef = useRef<HTMLElement>(null), searchInput = useRef<HTMLInputElement>(null), workspaceRef = useRef<HTMLDivElement>(null);
  const notificationSeen = useRef<HubNotification | null>(null), notificationVersion = useRef(0), listConnected = useRef(true), liveDetail = useRef<Detail | null>(null);
  const editorDirty = !!credentials || !!localLabelEditor || !!(editor && (editor.attempted || JSON.stringify(editor.value) !== JSON.stringify(editor.initial)));
  const profileDirty = !!(profileEditor && (profileEditor.attempted || JSON.stringify(profileEditor.value) !== JSON.stringify(profileEditor.initial)));
  const dirty = editorDirty || workspaceDirty || profileDirty || defaultsDirty || labelDirty || labelSettings.retry || clientOrder.retry;
  const canDiscardLocal = dirty && !busy && !workspaceBusy && !editor?.attempted && !profileEditor?.attempted && !credentials && !resetTarget && !defaultsDirty && !labelDirty && !labelSettings.busy && !labelSettings.retry && !clientOrder.retry && !clientOrder.writeBusy && (!workspaceDirty || workspaceDiscardSafe);
  useEffect(() => {
    onDiscardReady?.(canDiscardLocal ? () => {
      if (pending.current || workspaceDirty && !workspaceDiscardCheck.current?.()) return;
      setEditor(null); localLabelRef.current=null;setLocalLabelEditor(null); setProfileEditor(null);  setDiscard(false); setProfileDiscard(false); setModalError("");
      if (workspaceDirty) { setWorkspaceMountVersion(value => value + 1); updateWorkspaceDirty(false); }
    } : null);
    return () => onDiscardReady?.(null);
  }, [canDiscardLocal, onDiscardReady, workspaceDirty, updateWorkspaceDirty, setModalError]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || workspaceBusy || labelSettings.busy || clientOrder.writeBusy); return () => onBusyChange?.(false); }, [busy, workspaceBusy, labelSettings.busy, clientOrder.writeBusy, onBusyChange]);
  useEffect(() => { if (!notice || /^(?:Profile editor closed|Editor closed)/.test(notice)) return; const timer = window.setTimeout(() => setNotice(""), 6_000); return () => window.clearTimeout(timer); }, [notice, noticeVersion, setNotice]);
  useEffect(() => {
    if (!dirty && !busy && !workspaceBusy && !clientOrder.writeBusy) return;
    const block = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty, busy, workspaceBusy, clientOrder.writeBusy]);
  useEffect(() => { if (!modalError) return; const show=window.setTimeout(()=>setModalErrorVisible(true),0), hide=window.setTimeout(()=>setModalErrorVisible(false),6000); return()=>{window.clearTimeout(show);window.clearTimeout(hide);}; },[modalError,modalErrorRevision]);
  useEffect(() => { if (!modalNotice) return; modalNoticeRef.current?.scrollIntoView({block:"nearest"}); const timer=window.setTimeout(()=>setModalNotice(""),6000);return()=>window.clearTimeout(timer);},[modalNotice]);
  useEffect(() => { if (!localLabelError) return; const timer=window.setTimeout(()=>setLocalLabelError(""),6000);return()=>window.clearTimeout(timer);},[localLabelError]);
  useEffect(() => { if (profileEditor?.ready) profileNameInput.current?.focus({ preventScroll: true }); }, [profileEditor?.ready]);
  useEffect(() => { if (modalError && !busy) modalErrorRef.current?.focus({ preventScroll: true }); }, [modalError, busy]);

  const lockOwner = useCallback((message: string) => {
    cancelConfirmation(); setTagHierarchy(null);
    lifecycle.current++; listVersion.current++; detailVersion.current++; notificationVersion.current++; listConnected.current = false;
    setArchiveClientId(null); setDefaultsEditor(null); setDefaultsDiscard(null); setClients([]); setDetail(null); liveDetail.current = null; setStatusTarget(null); updateWorkspaceDirty(false); setWorkspaceBusy(false); chosen.current = null; setSelectedId(null); setEditor(null); localLabelRef.current=null;setLocalLabelEditor(null); setProfileEditor(null); setProfileDiscard(false); setResetTarget(null); setCredentials(null);
    setDiscard(false); setHideCode(false); setNotice(""); setCopyNotice(""); setModalError(""); setReady(false); setLoading(false); setDetailLoading(false); setError(message);
  }, [setNotice, updateWorkspaceDirty, cancelConfirmation, setStatusTarget, setEditor, setLocalLabelEditor, setResetTarget, setDiscard, setHideCode, setModalError]);

  const refresh = useCallback(async () => {
    if (pending.current) return false;
    const version = ++listVersion.current, life = lifecycle.current;
    setLoading(true); setError("");
    try {
      const next = await listClients();
      if (!alive.current || version !== listVersion.current || life !== lifecycle.current) return false;
      setClients(next); setReady(true);
      if (!listConnected.current) setSubscriptionAttempt(value => value + 1);
      if (chosen.current && !next.some(client => client.clientId === chosen.current)) {
        chosen.current = null; setSelectedId(null); setDetail(null); detailVersion.current++; replaceOwnerHubLocation(null);
      }
      return true;
    } catch (cause) {
      if (alive.current && version === listVersion.current && life === lifecycle.current) { setClients([]); setReady(false); setDetail(null); setError(errorText(cause)); }
      return false;
    } finally { if (alive.current && version === listVersion.current && life === lifecycle.current) setLoading(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    let disposed = false, unsubscribe: (() => void) | undefined;
    const life = lifecycle, listGeneration = listVersion, detailGeneration = detailVersion;
    void (async () => {
      try {
        const session = await taylorOwnerSession();
        if (disposed) return;
        unsubscribe = session.auth.onAuthStateChanged(() => {
          try { session.assertCurrent(); } catch {
            if (disposed) return;
            lockOwner("Your owner session changed. Sign in again to view your clients.");
          }
        });
      } catch { /* The list read supplies the authoritative setup/sign-in error. */ }
    })();
    void Promise.resolve().then(() => { if (!disposed) return refresh(); });
    return () => { disposed = true; alive.current = false; life.current++; listGeneration.current++; detailGeneration.current++; unsubscribe?.(); };
  }, [refresh, lockOwner]);

  // Live records update the directory without resetting local editors or workspace drafts.
  useEffect(() => {
    const life = lifecycle.current; let active = true; listConnected.current = true;
    const unsubscribe = subscribeClients(next => {
      if (!active || !alive.current || life !== lifecycle.current) return;
      ++listVersion.current; setClients(next); setReady(true); setLoading(false); setError("");
      if (chosen.current && !next.some(client => client.clientId === chosen.current)) { chosen.current = null; setSelectedId(null); setDetail(null); ++detailVersion.current; replaceOwnerHubLocation(null); }
    }, cause => {
      if (!active || !alive.current || life !== lifecycle.current) return;
      listConnected.current = false;
      if (ownerSessionFailure(cause)) { lockOwner("Your owner session needs attention. Sign in again to view your clients."); return; }
      ++listVersion.current; ++detailVersion.current; setClients([]); setDetail(null); setReady(false); setLoading(false); setError(errorText(cause));
    });
    return () => { active = false; unsubscribe(); };
  }, [subscriptionAttempt, lockOwner]);
  useEffect(() => {
    if (!selectedId || !ready) return;
    const clientId = selectedId, life = lifecycle.current; let active = true;
    const unsubscribe = subscribeClientDetail(clientId, next => {
      if (!active || !alive.current || life !== lifecycle.current || chosen.current !== clientId) return;
      // A create in this or another window may archive the currently open card.
      // Preserve even the implicit first selection, without discarding its draft.
      const previous = liveDetail.current;
      const fallback = previous?.client.clientId === clientId ? previous.projects.find(project => !archivedCard(project)) : undefined;
      if (fallback && next.projects.some(project => project.projectId === fallback.projectId)) setSelectedProjectId(current => current ?? fallback.projectId);
      if (selectedProjectRef.current && !next.projects.some(project => project.projectId === selectedProjectRef.current)) {
        const fallbackProject = next.projects.find(project => !archivedCard(project));
        setSelectedProjectId(fallbackProject?.projectId ?? null); currentTab.current = "overview";
        setWorkspaceNavigation(previous => ({ tab: "overview", version: (previous?.version ?? 0) + 1 }));
        replaceOwnerHubLocation({ clientId, ...(fallbackProject ? { projectId: fallbackProject.projectId } : {}), tab: "overview" });
      }
      ++detailVersion.current; liveDetail.current = next; setDetail(next); setDetailLoading(false); setDetailError("");
    }, cause => {
      if (!active || !alive.current || life !== lifecycle.current || chosen.current !== clientId) return;
      if (ownerSessionFailure(cause)) { lockOwner("Your owner session needs attention. Sign in again to view your clients."); return; }
      ++detailVersion.current; setDetail(null); setDetailLoading(false); setDetailError(errorText(cause));
    });
    return () => { active = false; unsubscribe(); };
  }, [selectedId, ready, detailSubscriptionAttempt, lockOwner]);
  useEffect(() => {
    if (!workspaceFocusVersion) return;
    workspaceRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    workspaceRef.current?.focus({ preventScroll: true });
  }, [workspaceFocusVersion]);

  const openClient = useCallback(async (clientId: string, discardConfirmed = false, destination?: OwnerHubLocation) => {
    if (pending.current || workspaceBusy || editor || profileEditor || credentials) return false;
    const intent = ++locationIntent.current;
    if (workspaceDirty && !discardConfirmed && !await confirm("Discard your unsaved workspace draft and open another client?")) return false;
    if (!alive.current || intent !== locationIntent.current) return false;
    updateWorkspaceDirty(false); setSelectedProjectId(null);
    setArchiveClientId(null); chosen.current = clientId; liveDetail.current = null; setSelectedId(clientId); setDetailSubscriptionAttempt(value => value + 1); setDetailError(""); setCopyNotice("");
    const version = ++detailVersion.current, life = lifecycle.current;
    setDetailLoading(true);
    try {
      const next = await getClientDetail(clientId);
      if (alive.current && life === lifecycle.current && chosen.current === clientId && intent === locationIntent.current) {
        const resolved = version === detailVersion.current ? next : liveDetail.current;
        if (!resolved) return false;
        if (resolved.client.clientId !== clientId) throw new Error("That client could not be verified.");
        liveDetail.current = resolved; setDetail(resolved);
        const project = resolved.projects.find(item => item.projectId === destination?.projectId && item.clientId === clientId) ?? resolved.projects.find(item => !archivedCard(item) && item.clientId === clientId);
        const tab = destination?.projectId === project?.projectId ? destination?.tab ?? "overview" : "overview";
        currentTab.current = tab; setSelectedProjectId(project?.projectId ?? null);
        setWorkspaceNavigation(previous => destination ? ({ tab, version: (previous?.version ?? 0) + 1 }) : undefined);
        replaceOwnerHubLocation({ clientId, ...(project ? { projectId: project.projectId } : {}), tab });
        if (destination && project) setWorkspaceFocusVersion(value => value + 1);
        return resolved;
      }
      return alive.current && life === lifecycle.current && chosen.current === clientId && intent === locationIntent.current ? liveDetail.current : null;
    } catch (cause) {
      if (alive.current && life === lifecycle.current && chosen.current === clientId && intent === locationIntent.current) {
        if (ownerSessionFailure(cause)) lockOwner("Your owner session needs attention. Sign in again to view your clients.");
        else if (version === detailVersion.current) setDetailError(errorText(cause));
      }
      return false;
    } finally { if (alive.current && version === detailVersion.current && life === lifecycle.current) setDetailLoading(false); }
  }, [workspaceBusy, editor, profileEditor, credentials, workspaceDirty, updateWorkspaceDirty, confirm, lockOwner]);
  useEffect(() => {
    if (!ready || loading || locationRestored.current) return;
    locationRestored.current = true;
    const target = initialHubLocation.current;
    if (!target) { replaceOwnerHubLocation(null); return; }
    if (!clients.some(client => client.clientId === target.clientId)) { replaceOwnerHubLocation(null); setNotice("That linked client is no longer in your directory. Choose a client below."); return; }
    if (locationIntent.current !== 0 || chosen.current) return;
    void openClient(target.clientId, false, target);
  }, [ready, loading, clients, openClient, setNotice]);
  useEffect(() => {
    const restore = () => {
      if (!ready || loading || pending.current || workspaceBusy || workspaceDirty || editor || profileEditor || credentials) {
        const currentClient = liveDetail.current?.client.clientId;
        const currentProject = liveDetail.current?.projects.find(item => item.projectId === selectedProjectRef.current) ?? liveDetail.current?.projects.find(item => !archivedCard(item));
        replaceOwnerHubLocation(currentClient ? { clientId: currentClient, ...(currentProject ? { projectId: currentProject.projectId } : {}), tab: currentTab.current } : null);
        return;
      }
      const target = readOwnerHubLocation(window.location.href);
      if (!target || !clients.some(client => client.clientId === target.clientId)) {
        ++locationIntent.current; ++detailVersion.current; chosen.current = null; liveDetail.current = null; setSelectedId(null); setSelectedProjectId(null); setDetail(null); replaceOwnerHubLocation(null); return;
      }
      void openClient(target.clientId, false, target);
    };
    window.addEventListener(OWNER_HUB_LOCATION_RESTORE, restore);
    return () => window.removeEventListener(OWNER_HUB_LOCATION_RESTORE, restore);
  }, [ready, loading, workspaceBusy, workspaceDirty, editor, profileEditor, credentials, clients, openClient]);
  function rememberWorkspaceTab(tab: WorkspaceTab) {
    currentTab.current = tab; ++locationIntent.current;
    const clientId = liveDetail.current?.client.clientId;
    const project = liveDetail.current?.projects.find(item => item.projectId === selectedProjectId) ?? liveDetail.current?.projects.find(item => !archivedCard(item));
    if (clientId && project) replaceOwnerHubLocation({ clientId, projectId: project.projectId, tab });
  }
  async function refreshWorkspace() {
    if (pending.current || workspaceBusy || editor || profileEditor || credentials) return;
    if (workspaceDirty && !await confirm("Discard your unsaved workspace draft and refresh the client?")) return;
    updateWorkspaceDirty(false);
    const clientId = chosen.current;
    if (await refresh() && clientId && alive.current && chosen.current === clientId) await openClient(clientId, true, { clientId, ...(selectedProjectId ? { projectId: selectedProjectId } : {}), tab: currentTab.current });
  }
  async function perform(work: (current: () => boolean) => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setModalError(""); setModalNotice(""); setCopyNotice("");
    const life = lifecycle.current;
    const current = () => alive.current && life === lifecycle.current;
    try { await work(current); }
    catch (cause) { if (current()) setModalError(errorText(cause)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function mergeClient(client: ClientHubClient) { setClients(current => [...current.filter(item => item.clientId !== client.clientId), client]); }
  async function newClient() {
    if (!ready || pending.current || workspaceBusy || profileEditor || loading) return;
    if (workspaceDirty && !await confirm("Discard your unsaved workspace draft before creating another client?")) return;
    updateWorkspaceDirty(false); setWorkspaceMountVersion(value => value + 1);
    const value = emptyClient(); setEditor({ kind: "client", operationId: crypto.randomUUID(), initial: value, value, attempted: false }); setModalError(""); setCopyNotice("");
  }
  async function editProject(previous?: ClientHubProject) {
    if (!detail || detailLoading || detail.client.clientId !== chosen.current || pending.current || workspaceBusy) return;
    if (previous && workspaceDirty && !await confirm("Discard the unsaved workspace draft before editing commission details?")) return;
    if (previous && workspaceDirty) { updateWorkspaceDirty(false); setWorkspaceMountVersion(value => value + 1); }
    if (!previous) {
      const currentProject = detail.projects.find(item => item.projectId === selectedProjectId) ?? detail.projects.find(item => !archivedCard(item));
      if (currentProject) setSelectedProjectId(currentProject.projectId);
    }
     setRemovedLabels([]);
    setModalNotice("");
    const value = projectDraft(previous);
    setEditor({ kind: "project", operationId: crypto.randomUUID(), clientId: detail.client.clientId, previous: previous ?? null, initial: value, value, attempted: false }); setModalError("");
  }
  async function editClientProfile() {
    if (!detail || pending.current || workspaceBusy || loading || detailLoading || editor || credentials) return;
    if (workspaceDirty && !await confirm("Discard the unsaved workspace draft before editing the client profile?")) return;
    if (workspaceDirty) { updateWorkspaceDirty(false); setWorkspaceMountVersion(value => value + 1); }
    const target = detail.client, value = { displayName: target.displayName, email: detail.email ?? "" };
    setProfileEditor({ previous: target, initial: value, value, ready: false, attempted: false }); setModalError("");
    // Refresh first, so a recent reset or status change cannot leave the profile
    // editor anchored to an outdated updatedAt value held by the old response.
    await perform(async current => {
      const fresh = await getClientDetail(target.clientId);
      if (!current() || chosen.current !== target.clientId) return;
      const initial = { displayName: fresh.client.displayName, email: fresh.email ?? "" };
      mergeClient(fresh.client); setDetail(fresh);
      setProfileEditor({ previous: fresh.client, initial, value: initial, ready: true, attempted: false });
    });
  }
  function closeProfileEditor() {
    if (pending.current) return;
    if (profileDirty) setProfileDiscard(true); else { setProfileEditor(null); setModalError(""); }
  }
  function changeProfile(field: keyof ProfileDraft, value: string) {
    if (pending.current) return;
    setProfileEditor(previous => previous?.ready ? { ...previous, value: { ...previous.value, [field]: value } } : previous);
  }
  async function saveProfile() {
    if (!profileEditor?.ready || pending.current || workspaceBusy) return;
    const snapshot = profileEditor, name = snapshot.value.displayName.trim(), email = snapshot.value.email.trim();
    if (!name || name.length > 100) { setModalError("Enter the client’s name, up to 100 characters."); return; }
    if (email.length > 254 || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setModalError("Enter a valid email address, or leave it empty."); return; }
    setProfileEditor(previous => previous ? { ...previous, attempted: true } : previous);
    await perform(async current => {
      const saved = await updateClientProfile({ clientId: snapshot.previous.clientId, expectedUpdatedAt: snapshot.previous.updatedAt, displayName: name, email });
      if (!current() || chosen.current !== snapshot.previous.clientId) return;
      mergeClient(saved.client); setDetail(previous => previous?.client.clientId === saved.client.clientId ? { ...previous, client: saved.client, email: saved.email || undefined } : previous);
      setProfileEditor(null); setProfileDiscard(false); setNotice("Saved Successfully");
    });
  }
  function closeEditor() {
    if (pending.current) return;
    if (editorDirty) setDiscard(true); else { setEditor(null); localLabelRef.current=null;setLocalLabelEditor(null); setModalError(""); }
  }
  function changeClient(field: keyof ClientDraft, value: string) { if (pending.current) return; setEditor(current => current?.kind === "client" && !current.attempted ? { ...current, value: { ...current.value, [field]: value } } : current); }
  function changeProject(field: keyof ProjectDraft, value: string) { if (pending.current) return; setEditor(current => current?.kind === "project" && (!current.attempted || current.previous) ? { ...current, value: { ...current.value, [field]: value, ...(field === "status" ? { activeMilestoneId: null } : {}) } } : current); }
  function toggleInformationTag(tag: ClientHubInformationTag) {
    if (pending.current) return;
    setEditor(current => {
      if (current?.kind !== "project" || current.attempted && !current.previous) return current;
      const tags = current.value.informationTags;
      const next = tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags.filter(item => !(tag.startsWith("paid-") && item.startsWith("paid-") || tag.startsWith("dtd-") && item.startsWith("dtd-"))), tag];
      return { ...current, value: { ...current.value, informationTags: next } };
    });
  }
  async function openDefaults() {
    if (pending.current || workspaceBusy) return;
    await perform(async current => { const saved = await getMilestoneDefaults(); if (current()) setDefaultsEditor({ saved, value: saved.milestones.map(node => ({ ...node })) }); });
  }
  function closeDefaults() { if (pending.current) return; if (defaultsDirty) setDefaultsDiscard("close"); else setDefaultsEditor(null); }
  async function saveDefaults() {
    if (!defaultsEditor || pending.current) return;
    const draft = defaultsEditor;
    await perform(async current => { await saveMilestoneDefaults({ milestones: draft.value, expectedVersion: draft.saved.version }); if (current()) { setDefaultsEditor(null); setNotice("Milestone defaults saved for new commissions. Existing commissions were not changed."); } });
  }
  async function applyDefaults() {
    if (pending.current || editor?.kind !== "project") return;
    await perform(async current => { const saved = await getMilestoneDefaults(); if (current()) setEditor(value => value?.kind === "project" ? { ...value, value: { ...value.value, milestones: saved.milestones, activeMilestoneId: null } } : value); });
  }
  function changeMilestones(milestones: HubMilestone[]) { setEditor(value => value?.kind === "project" ? { ...value, value: { ...value.value, milestones, activeMilestoneId: milestones.some(node => node.id === value.value.activeMilestoneId) ? value.value.activeMilestoneId : null } } : value); }
  async function archiveProject(project: ClientHubProject) {
    if (pending.current || workspaceBusy) return;
    // Archiving is a card-only organization action, not workspace navigation.
    // Pin even the implicit first selection before a subscription can hide it.
    const currentProject = detail?.projects.find(item => item.projectId === selectedProjectId) ?? detail?.projects.find(item => !archivedCard(item));
    if (currentProject) setSelectedProjectId(currentProject.projectId);
    await perform(async current => {
      const saved = await setProjectArchived(project.projectId, project.version, !project.ownerArchived);
      if (!current()) return;
      setDetail(value => value ? { ...value, projects: value.projects.map(item => item.projectId === project.projectId && item.version <= saved.project.version ? saved.project : item) } : value);
      setNotice(project.ownerArchived ? "Card restored." : currentProject?.projectId === project.projectId ? "Card archived. Your workspace is still open." : "Card archived.");
    });
  }

  async function saveEditor(closeAfterSave = false) {
    if(localLabelEditor)return;
    if (!editor || pending.current) return;
    if (editor.kind === "client") {
      const draft = editor.value;
      if (!draft.displayName.trim()) { setModalError("Enter the client’s name."); return; }
      if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) { setModalError("Enter a valid email address, or leave it empty."); return; }
      setEditor(current => current ? { ...current, attempted: true } : current);
      await perform(async current => {
        const saved = await createClient({ operationId: editor.operationId, displayName: draft.displayName.trim(), email: draft.email.trim(), projectTitle: draft.projectTitle.trim() });
        if (!current()) return;
        mergeClient(saved.client); chosen.current = saved.client.clientId; setSelectedId(saved.client.clientId); detailVersion.current++;
        setSelectedProjectId(saved.project?.projectId ?? null); updateWorkspaceDirty(false);
        setDetail({ client: saved.client, email: draft.email.trim(), projects: saved.project ? [saved.project] : [] }); setDetailLoading(false); setDetailError("");
        setEditor(null); localLabelRef.current=null;setLocalLabelEditor(null); setCredentials({ client: saved.client, code: saved.signInCode, reset: false }); setNotice("Client Created Successfully");
      });
      return;
    }
    const draft = editor.value;
    if (!draft.title.trim()) { setModalError("Enter a commission title."); return; }
    try { validateHubMilestones(draft.milestones); } catch (cause) { setModalError(errorText(cause)); return; }
    const progress = draft.progress.trim() === "" ? null : Number(draft.progress);
    if (progress !== null && (!Number.isSafeInteger(progress) || progress < 0 || progress > 100)) { setModalError("Progress must be a whole number between 0 and 100, or blank if it is not known."); return; }
    if (draft.trackingUrl.trim()) {
      try { const url = new URL(draft.trackingUrl.trim()); if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new Error(); }
      catch { setModalError("Use a full https:// tracking link without a username or password."); return; }
    }
    if (draft.trelloUrl.trim() && !/^https:\/\/trello\.com\/c\/[A-Za-z0-9]{8,}(?:\/[A-Za-z0-9_-]+)?\/?$/.test(draft.trelloUrl.trim())) { setModalError("Use a Trello card link like https://trello.com/c/Ab12Cd34 without tracking parameters."); return; }
    setEditor(current => current ? { ...current, attempted: true } : current);
    await perform(async current => {
      const saved = editor.previous
        ? await updateProject({ projectId: editor.previous.projectId, expectedVersion: editor.previous.version, title: draft.title.trim(), summary: draft.summary.trim(), ...(draft.labelOrder.length || editor.previous?.labelOrder?.length ? { labelOrder: draft.labelOrder } : {}), status: draft.status, trackingEnabled: draft.trackingEnabled, ...(JSON.stringify(draft.localLabelDefinitions)!==JSON.stringify(editor.previous.localLabelDefinitions??{})?{localLabelDefinitions:draft.localLabelDefinitions}:{}), ...(JSON.stringify(draft.milestones) !== JSON.stringify(getProjectMilestones(editor.previous)) ? { milestones: draft.milestones } : {}), activeMilestoneId: draft.activeMilestoneId, progress, trackingUrl: draft.trackingUrl.trim() || null, trelloUrl: draft.trelloUrl.trim() || null, ...(JSON.stringify(draft.informationTags) !== JSON.stringify(editor.previous.informationTags ?? []) ? { informationTags: draft.informationTags } : {}) })
        : await createProject({ operationId: editor.operationId, clientId: editor.clientId, title: draft.title.trim(), summary: draft.summary.trim(), ...(draft.labelOrder.length ? { labelOrder: draft.labelOrder } : {}), trackingEnabled: draft.trackingEnabled, ...(Object.keys(draft.localLabelDefinitions).length?{localLabelDefinitions:draft.localLabelDefinitions}:{}), ...(draft.informationTags.length ? { informationTags: draft.informationTags } : {}) });
      if (!current()) return;
      setDetail(existing => existing && existing.client.clientId === editor.clientId ? { ...existing, projects: existing.projects.some(project => project.projectId === saved.project.projectId && project.version > saved.project.version) ? existing.projects : [...existing.projects.filter(project => project.projectId !== saved.project.projectId), saved.project] } : existing);
      if (editor.previous || !workspaceDirtyRef.current) setSelectedProjectId(saved.project.projectId);
      if(editor.previous&&!closeAfterSave){const fresh=projectDraft(saved.project);setEditor({...editor,previous:saved.project,value:fresh,initial:structuredClone(fresh),attempted:false,operationId:crypto.randomUUID()});setRemovedLabels([]);setModalNotice("Saved successfully.");}else {setEditor(null);setNotice(editor.previous ? "Saved Successfully" : workspaceDirtyRef.current ? "Commission created. Your current draft is still open." : "Commission Created Successfully");} localLabelRef.current=null;setLocalLabelEditor(null);
    });
  }
  async function resetCode() {
    if (!resetTarget || pending.current) return;
    const target = resetTarget;
    await perform(async current => {
      const saved = await resetClientLoginCode({ clientId: target.clientId, expectedAuthVersion: target.authVersion });
      if (!current()) return;
      const client = { ...target, authVersion: saved.authVersion };
      mergeClient(client); setDetail(existing => existing?.client.clientId === client.clientId ? { ...existing, client } : existing);
      setResetTarget(null); setCredentials({ client, code: saved.signInCode, reset: true }); setNotice("Code Reset Successfully");
    });
  }
  async function changeStatus() {
    if (!statusTarget || pending.current || workspaceBusy) return;
    const target = statusTarget;
    await perform(async current => {
      const saved = await setClientStatus({ clientId: target.clientId, expectedAuthVersion: target.authVersion, status: target.status === "active" ? "suspended" : "active" });
      if (!current()) return;
      mergeClient(saved.client); setDetail(existing => existing?.client.clientId === saved.client.clientId ? { ...existing, client: saved.client } : existing);
      setStatusTarget(null); setNotice(saved.client.status === "suspended" ? "Access Suspended Successfully" : "Access Restored Successfully");
    });
  }
  async function selectProject(projectId: string) {
    if (detailLoading || workspaceBusy || pending.current) return false;
    const intent = ++locationIntent.current;
    const clientId = detail?.client.clientId;
    if (!clientId || !detail.projects.some(project => project.projectId === projectId)) return false;
    const currentProject = detail?.projects.find(project => project.projectId === selectedProjectId) ?? detail?.projects.find(project => !archivedCard(project));
    if (currentProject?.projectId !== projectId && workspaceDirty && !await confirm("Discard your unsaved workspace draft and open another commission?")) return false;
    if (!alive.current || chosen.current !== clientId || intent !== locationIntent.current) return false;
    if (currentProject?.projectId !== projectId) updateWorkspaceDirty(false);
    if (currentProject?.projectId !== projectId) { currentTab.current = "overview"; setWorkspaceNavigation(undefined); }
    setSelectedProjectId(projectId);
    replaceOwnerHubLocation({ clientId, projectId, tab: currentTab.current });
    return true;
  }
  async function selectArchivedProject(projectId: string) {
    if (archiveSelectionPending.current) return;
    archiveSelectionPending.current = true; setArchiveSelecting(true);
    try { if (await selectProject(projectId)) setArchiveClientId(null); }
    finally { archiveSelectionPending.current = false; if (alive.current) setArchiveSelecting(false); }
  }
  function filterClients(filter: "all" | "active" | "suspended") {
    setClientFilter(filter); setQuery("");
  }
  useEffect(() => {
    if (!openNotification || notificationSeen.current === openNotification || !ready || loading || busy || workspaceBusy || editor || profileEditor || credentials) return;
    notificationSeen.current = openNotification;
    const target = openNotification, life = lifecycle.current, navigationVersion = ++notificationVersion.current;
    void (async () => {
      await Promise.resolve();
      if (!alive.current || life !== lifecycle.current || navigationVersion !== notificationVersion.current) return;
      if (!clients.some(client => client.clientId === target.clientId)) { setNotice("This notification’s client is no longer in your directory."); return; }
      const opened = detail?.client.clientId === target.clientId ? detail : await openClient(target.clientId);
      if (!opened || !alive.current || life !== lifecycle.current || navigationVersion !== notificationVersion.current || chosen.current !== target.clientId) return;
      if (opened.projects.every(project => project.projectId !== target.projectId)) { setNotice("That commission is no longer available for this client."); return; }
      const intent = locationIntent.current;
      if (workspaceDirty && detail?.client.clientId === target.clientId && !await confirm("Discard your unsaved workspace draft to open this notification?")) return;
      if (!alive.current || intent !== locationIntent.current) return;
      updateWorkspaceDirty(false); setSelectedProjectId(target.projectId);
      ++locationIntent.current; currentTab.current = target.channel === "requests" ? "support" : target.channel;
      replaceOwnerHubLocation({ clientId: target.clientId, projectId: target.projectId, tab: currentTab.current });
      setWorkspaceNavigation(previous => ({ tab: target.channel === "requests" ? "support" : target.channel, version: (previous?.version ?? 0) + 1, ...(target.requestId ? { requestId: target.requestId } : {}) })); setWorkspaceFocusVersion(value => value + 1);
    })();
  }, [openNotification, ready, loading, busy, workspaceBusy, editor, profileEditor, credentials, clients, detail, workspaceDirty, openClient, setNotice, updateWorkspaceDirty, confirm]);
  function openLocalLabel(key?:string){
    if(busy||editor?.kind!=="project"||!key&&Object.keys(editor.value.localLabelDefinitions).length>=100)return;
    const id=key??newLocalLabelKey([...Object.keys(editor.value.localLabelDefinitions),...editor.value.informationTags,...Object.keys(labelSettings.presentation?.entries??{})]);
    const previous=editor.value.localLabelDefinitions[id];if(previous?.deleted)return;setLocalLabelError("");const next={key:id,value:initialLabelAppearance(previous?.name,previous?.color??null)};localLabelRef.current=next;setLocalLabelEditor(next);
  }
  function closeLocalLabel(){if(busy)return;localLabelRef.current=null;setLocalLabelEditor(null);}
  function updateLocalLabel(patch:Partial<LabelAppearanceDraft>){if(busy||!localLabelRef.current)return;const next={...localLabelRef.current,value:{...localLabelRef.current.value,...patch}};localLabelRef.current=next;setLocalLabelEditor(next);}
  function duplicateLocalName(key:string,name:string){
    if(editor?.kind!=="project")return false;
    const before=editor.value.localLabelDefinitions[key];
    if(before?.name===name.trim())return false; // Preserve legacy duplicates until actually renamed.
    const folded=name.trim().toLocaleLowerCase("en-US");
    return Object.entries(editor.value.localLabelDefinitions).some(([id,value])=>id!==key&&!value.deleted&&value.name.trim().toLocaleLowerCase("en-US")===folded)||Object.entries(labelSettings.presentation?.entries??{}).some(([id,value])=>id.startsWith("custom:")&&id!==key&&!value.deleted&&value.name.trim().toLocaleLowerCase("en-US")===folded);
  }
  function saveLocalLabel(){const local=localLabelRef.current;if(busy||!local||!labelAppearanceValid(local.value))return;if(duplicateLocalName(local.key,local.value.name)){setLocalLabelError("That label name already exists here. Capital letters do not make a different label.");return;}localLabelRef.current=null;setLocalLabelEditor(null);setRemovedLabels(value=>value.filter(key=>key!==local.key));setEditor(current=>current?.kind==="project"?{...current,value:{...current.value,localLabelDefinitions:{...current.value.localLabelDefinitions,[local.key]:{name:local.value.name.trim(),color:local.value.defaultColor?null:local.value.hex.toUpperCase()}},informationTags:Array.from(new Set([...current.value.informationTags,local.key])) as ClientHubInformationTag[]}}:current);}
  function removeCommissionChoice(tag:ClientHubInformationTag){
    if(busy)return;setRemovedLabels(previous=>[...previous,tag]);
    setEditor(current=>{if(current?.kind!=="project")return current;const local=current.value.localLabelDefinitions[tag],saved=current.initial.localLabelDefinitions[tag];const definitions={...current.value.localLabelDefinitions};if(local){if(saved)definitions[tag]={...saved,deleted:true};else delete definitions[tag];}return {...current,value:{...current.value,localLabelDefinitions:definitions,informationTags:current.value.informationTags.filter(value=>value!==tag)}};});
  }
  async function openLabelManager(sharedFromEditor = false) {
    if(labelOpening||labelSettings.busy||labelSettings.retry)return;
    const sequence=++labelOpenSequence.current,life=lifecycle.current,client=chosen.current,capturedEditor=editorIdentityRef.current;
    const project=sharedFromEditor?undefined:detail?.projects.find(item=>item.projectId===selectedProjectId)??detail?.projects.find(item=>!archivedCard(item));
    setLabelOpening(true);
    try {
      const context=sharedFromEditor?{presentation:await getOwnerLabelPresentation(),legacyCandidates:{}}:project?await getOwnerLabelPresentationContext(project.projectId):{presentation:labelSettings.presentation,legacyCandidates:{}};
      const currentProject=liveDetail.current?.projects.find(item=>item.projectId===selectedProjectRef.current)??liveDetail.current?.projects.find(item=>!archivedCard(item));
      if(!alive.current||life!==lifecycle.current||sequence!==labelOpenSequence.current||client!==chosen.current||(sharedFromEditor?capturedEditor!==editorIdentityRef.current:project?.projectId!==currentProject?.projectId)||!context.presentation)return;
      setTagHierarchy({draft:{entries:structuredClone(context.presentation.entries),order:[...context.presentation.order]},baseline:context.presentation,legacyCandidates:context.legacyCandidates,adoptLegacyKeys:[],projectId:project?.projectId});
    } catch(cause){if(alive.current&&sequence===labelOpenSequence.current)setNotice(errorText(cause));}
    finally{if(alive.current&&sequence===labelOpenSequence.current)setLabelOpening(false);}
  }
  async function copy(value: string, label: string) {
    const life = lifecycle.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      if (alive.current && life === lifecycle.current) setCopyNotice(`${label} copied.`);
    } catch { if (alive.current && life === lifecycle.current) setCopyNotice(`Could not copy automatically. Select the ${label.toLowerCase()} and copy it manually.`); }
  }
  function closeCredentials() { if (credentials?.code) setHideCode(true); else { setCredentials(null); setCopyNotice(""); } }
  function finishCredentials() { setCredentials(null); setHideCode(false); setCopyNotice(""); }
  const orderedClients=orderClients(clients,clientOrder.value?.clientIds??[]);
  const visible = orderedClients.filter(client => clientFilter === "all" || client.status === clientFilter).filter(client => `${client.displayName} ${client.clientId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const canReorder=ready&&!loading&&!detailLoading&&!busy&&!workspaceBusy&&!editor&&!profileEditor&&!credentials&&!clientOrder.busy&&!clientOrder.retry&&!!clientOrder.value;
  function beginClientDrag(id:string){if(!canReorder||!clientOrder.value)return false;dragOrder.current={id,revision:clientOrder.value.revision,full:orderedClients.map(item=>item.clientId),visible:visible.map(item=>item.clientId)};setDragClient(id);return true;}
  async function dropClientAt(id:string){const drag=dragOrder.current;dragOrder.current=null;setDragClient(null);setDropClient(null);if(!drag||!canReorder||drag.id===id)return;const now=visible.map(item=>item.clientId);if(JSON.stringify(now)!==JSON.stringify(drag.visible)){setNotice("The visible clients changed. Try the move again.");return;}const next=[...drag.visible],from=next.indexOf(drag.id),to=next.indexOf(id);if(from<0||to<0)return;next.splice(from,1);next.splice(to,0,drag.id);suppressClientClick.current=true;window.setTimeout(()=>{suppressClientClick.current=false;},0);await clientOrder.save(spliceVisibleClientOrder(drag.full,drag.visible,next),drag.revision);}

  const selectedProject = detail?.projects.find(project => project.projectId === selectedProjectId) ?? detail?.projects.find(project => !archivedCard(project));
  const orderedProjects = [...(detail?.projects ?? [])].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const archivedProjects = orderedProjects.filter(archivedCard);
  useEffect(() => {
    if (!archiveClientId || archiveClientId === detail?.client.clientId && archivedProjects.length >= 3) return;
    let current = true;
    void Promise.resolve().then(() => { if (current) setArchiveClientId(null); });
    return () => { current = false; };
  }, [archiveClientId, detail?.client.clientId, archivedProjects.length]);
  const inlineArchivedIds = new Set(archivedProjects.slice(0, 2).map(project => project.projectId));
  const inlineProjects = orderedProjects.filter(project => !archivedCard(project) || showArchived && inlineArchivedIds.has(project.projectId));
  const renderProjectCard = (project: ClientHubProject, inArchiveDialog = false) => detail ? <article className={styles.project} data-selected={selectedProject?.projectId === project.projectId} aria-current={selectedProject?.projectId === project.projectId ? "true" : undefined} key={project.projectId}>
            <button type="button" data-owner-button className={styles.projectOpen} disabled={busy || workspaceBusy || archiveSelecting} aria-label={`Open workspace: ${project.title}`} aria-pressed={selectedProject?.projectId === project.projectId} onClick={() => { if (inArchiveDialog) void selectArchivedProject(project.projectId); else void selectProject(project.projectId); }} />
            <span className={styles.cardSpade} aria-hidden="true"><SpadeMark /></span>{selectedProject?.projectId === project.projectId && <span className={styles.currentCommission} aria-label="Currently viewed commission" />}<div className={styles.projectHeading}><span className={styles.projectAvatar}><ClientAvatar client={detail.client} owner /></span><div className={styles.projectIdentity}><h4>{project.title}</h4><span className={styles.projectClientName}>{detail.client.nickname || detail.client.displayName}{project.ownerArchived && <span className={styles.archivedLabel}>Archived</span>}</span></div></div>
            <div className={styles.projectTags}><PresentedStatus className={styles.badge} style={{ order: ((project.labelOrder?.length ? project.labelOrder : labelSettings.presentation?.order)?.indexOf("information") ?? 1) >= 0 && ((project.labelOrder?.length ? project.labelOrder : labelSettings.presentation?.order)?.indexOf("information") ?? 1) < ((project.labelOrder?.length ? project.labelOrder : labelSettings.presentation?.order)?.indexOf("status") ?? 0) ? 1 : 0 }} status={project.status}/><InformationTags tags={project.informationTags} localDefinitions={project.localLabelDefinitions} order={project.labelOrder?.length ? project.labelOrder : labelSettings.presentation?.order} /></div>
            {project.summary && <p className={styles.summary}>{project.summary}</p>}
            <div className={styles.projectFooter}><span className={styles.hint}>Updated {dateText(project.updatedAt)}</span><div className={styles.projectActions}><button type="button" data-owner-button className={styles.editPencil} aria-label={`Edit commission ${project.title}`} disabled={busy || workspaceBusy || archiveSelecting || detailLoading} onClick={() => void editProject(project)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 16 12-12 4 4-12 12-5 1zM14 6l4 4"/></svg></button><button type="button" data-owner-button className={styles.cardArchive} aria-label={`${project.ownerArchived ? "Restore" : "Archive"} commission ${project.title}`} title={project.ownerArchived ? "Restore card" : "Archive card"} disabled={busy || workspaceBusy || archiveSelecting} onClick={() => void archiveProject(project)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" />{project.ownerArchived && <path d="m9 16 3-3 3 3m-3-3v5" />}</svg></button></div></div>
            {project.trackingUrl && <p className={styles.hint}>Tracking link saved · not carrier-verified</p>}
          </article> : null;
  const dialogError = modalError && modalErrorVisible ? <div className={styles.error} role="alert" tabIndex={-1} ref={modalErrorRef}>{modalError}</div> : null;

  return <LabelPresentationContext.Provider value={labelSettings.presentation}><div className={styles.root} data-default-state={!detail && !detailLoading && !detailError ? "true" : undefined} aria-label="Client Hub management">{!labelSettings.presentation&&labelSettings.error&&<p role="alert">{labelSettings.error} <button type="button" data-owner-button className={secondary} onClick={labelSettings.refresh}>Retry labels</button></p>}{confirmation}{tagHierarchy && <Dialog title="Card label hierarchy" onClose={()=>{if(!labelSettings.busy&&!labelSettings.retry)setTagHierarchy(null);}} dismissDisabled={labelSettings.busy||labelSettings.retry} actions={<><button type="button" data-owner-button className={secondary} disabled={labelSettings.busy||labelSettings.retry} onClick={()=>setTagHierarchy(null)}>Cancel</button>{labelSettings.retry?<button type="button" data-owner-button className={primary} disabled={labelSettings.busy} onClick={async()=>{if(await labelSettings.retrySave())setTagHierarchy(null);}}>Retry save</button>:<button type="button" data-owner-button className={primary} disabled={labelSettings.busy} onClick={async()=>{const adopted=tagHierarchy.adoptLegacyKeys.filter(key=>tagHierarchy.draft.entries[key]&&!tagHierarchy.draft.entries[key].deleted);if(await labelSettings.save(tagHierarchy.draft,tagHierarchy.baseline.revision,adopted.length?{legacyProjectId:tagHierarchy.projectId,adoptLegacyKeys:adopted}:{}))setTagHierarchy(null);}}>{labelSettings.busy?"Saving…":"Save default"}</button>}</>}><p><strong>Account-wide label defaults.</strong> Changes stay here until Save default. Renaming or recoloring updates current cards, not history. Hiding built-ins never changes commission status or payment information.</p>{editor?.kind==="project"&&<p className={styles.hint}>Your unsaved commission edit stays open underneath. Save default changes this shared label on current cards across the account; it does not save your commission draft.</p>}<LabelPresentationEditor value={tagHierarchy.draft} baselineEntries={tagHierarchy.baseline.entries} onChange={draft=>setTagHierarchy(current=>current?{...current,draft}:current)} disabled={labelSettings.busy||labelSettings.retry}/>{Object.keys(tagHierarchy.legacyCandidates).some(key=>!tagHierarchy.draft.entries[key])&&<details><summary>Existing labels on this commission</summary><p>These older assignments are not saved choices. Add one explicitly if you want to manage its appearance here.</p>{Object.entries(tagHierarchy.legacyCandidates).filter(([key])=>!tagHierarchy.draft.entries[key]).map(([key,entry])=><button key={key} type="button" data-owner-button className={secondary} disabled={labelSettings.busy||labelSettings.retry} onClick={()=>setTagHierarchy(current=>current&&!current.draft.entries[key]?{...current,adoptLegacyKeys:[...current.adoptLegacyKeys,key],draft:{entries:{...current.draft.entries,[key]:entry},order:[...current.draft.order,key]}}:current)}>Add {entry.name} to saved choices</button>)}</details>}{labelSettings.error&&<p role="alert">{labelSettings.error}</p>}</Dialog>}
    <p className={styles.integrationNote}>Trello · Manual, not synced <span aria-hidden="true">·</span> PayPal & email · Not connected</p>
    {error && <div className={styles.error} role="alert"><strong>Clients could not be loaded</strong><p>{error}</p><button type="button" data-owner-button className={secondary} disabled={loading || busy} onClick={() => void refresh()}>Try again</button></div>}
    <div className={styles.studioStats} aria-label="Client directory overview"><button type="button" data-owner-button disabled={!ready} aria-label="View all clients" aria-pressed={clientFilter === "all"} onClick={() => filterClients("all")}><span>Clients</span><strong>{ready ? clients.length : "0"}<small>view all clients</small></strong></button><button type="button" data-owner-button disabled={!ready} aria-label="View active clients" aria-pressed={clientFilter === "active"} onClick={() => filterClients("active")}><span>Access active</span><strong>{clients.filter(client => client.status === "active").length}<small>view active clients</small></strong></button><div className={styles.studioCallout}><SpadeMark /><span>Your studio, together</span><p>A little less wondering.<br />A little closer to your character.</p></div></div>
    {notice && <div key={noticeVersion} className={styles.notice} data-transient-feedback role="status"><span className={styles.noticeMark} aria-hidden="true">✓</span><span>{notice}</span><button type="button" aria-label="Dismiss client notification" onClick={() => setNotice("")}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>}
    {modalError && !editor && !defaultsEditor && !profileEditor && !resetTarget && !statusTarget && <div className={styles.error} role="alert">{modalError}</div>}
    {copyNotice && !credentials && <p className={styles.hint} role="status">{copyNotice}</p>}
    <div className={styles.workspace}>
      <section ref={directoryRef} className={styles.directory} aria-label="Client directory">
        <div className={styles.sectionHeading}><h3>Clients <span>{ready ? clients.length : "-"}</span></h3><div className={styles.directoryActions}><button type="button" data-owner-button aria-label="Add client" className={`${primary} ${buttons.compact} ${styles.addClient}`} disabled={loading || !ready || busy || workspaceBusy || !!profileEditor} onClick={newClient}>{addClientLabel}</button><button type="button" data-owner-button className={`${secondary} ${buttons.compact} ${styles.refreshRound}`} aria-label="Refresh clients" title="Refresh clients" disabled={loading || busy || workspaceBusy || !!editor || !!profileEditor || !!credentials} onClick={() => void refreshWorkspace()}><RefreshIcon /></button></div></div>
        <label className={styles.search}>Search clients<input ref={searchInput} type="search" placeholder="Name or permanent client ID" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {clientOrder.busy&&<p role="status">Saving or checking client order…</p>}{clientOrder.error&&<p role="alert">{clientOrder.error} <button type="button" data-owner-button className={secondary} disabled={clientOrder.busy} onClick={()=>void (clientOrder.retry?clientOrder.retrySave():clientOrder.refresh())}>{clientOrder.retry?"Retry same order":"Check saved order"}</button>{clientOrder.retry&&<button type="button" data-owner-button className={secondary} disabled={clientOrder.busy} onClick={clientOrder.refresh}>Reload saved order</button>}</p>}<div className={styles.clientFilters} aria-label="Filter client access">{(["all", "active", "suspended"] as const).map(filter => <button type="button" key={filter} aria-pressed={clientFilter === filter} onClick={() => setClientFilter(filter)}>{filter === "all" ? "All clients" : filter === "active" ? "Active" : "Suspended"}</button>)}</div>
        {loading ? <p className={styles.empty} role="status">Loading your clients…</p> : !ready ? <p className={styles.empty}>Your client list will appear after a successful connection.</p> : visible.length ? <ul className={styles.clientList}>{visible.map(client => <li key={client.clientId} data-dragging={dragClient===client.clientId||undefined} data-drop-target={dropClient===client.clientId||undefined} draggable={canReorder} onDragStart={event=>{if(!beginClientDrag(client.clientId)){event.preventDefault();return;}event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",client.clientId);}} onDragOver={event=>{if(dragOrder.current&&canReorder){event.preventDefault();setDropClient(client.clientId);}}} onDrop={event=>{event.preventDefault();void dropClientAt(client.clientId);}} onDragEnd={()=>{dragOrder.current=null;setDragClient(null);setDropClient(null);}}><button type="button" data-owner-button className={styles.clientRow} aria-pressed={selectedId === client.clientId} disabled={busy || workspaceBusy || !!editor || !!profileEditor || !!credentials} aria-describedby="client-order-help" onKeyDown={event=>{if(event.altKey&&(event.key==="ArrowUp"||event.key==="ArrowDown")){event.preventDefault();const index=visible.findIndex(item=>item.clientId===client.clientId),target=visible[index+(event.key==="ArrowUp"?-1:1)];if(target&&beginClientDrag(client.clientId))void dropClientAt(target.clientId);}}} onClick={() => {if(!suppressClientClick.current)void openClient(client.clientId);}}><span className={styles.cardSpade} aria-hidden="true"><SpadeMark /></span><span className={styles.avatar}><ClientAvatar client={client} owner /></span><span className={styles.clientName}><strong>{client.displayName}{client.nickname && client.nickname !== client.displayName ? ` (${client.nickname})` : ""}</strong><code title={client.clientId}>{client.clientId}</code>{client.status !== "active" && <span className={styles.hint}>Access suspended</span>}</span></button></li>)}</ul> : <div className={styles.empty}><h4>{query.trim() ? "No matching clients" : clientFilter === "suspended" ? "No suspended clients" : clientFilter === "active" ? "No active clients" : "Your first client starts here"}</h4><p>{query.trim() ? "Try a different name or client ID." : clientFilter === "suspended" ? "Everyone currently has active access. Suspended accounts will appear here." : clientFilter === "active" ? "No clients currently have active access. Choose All clients to review the directory." : "Add an existing commission client to get their hub ready."}</p>{!query.trim() && clientFilter === "all" && <button type="button" data-owner-button className={secondary} disabled={busy} onClick={newClient}>Add your first client</button>}</div>}
        <p id="client-order-help" className={styles.clientOrderHelp}>Drag clients to reorder, or focus a card and use Alt + Up/Down. New clients appear first.</p>
      </section>
      <section className={styles.detail} aria-label="Selected client" aria-busy={detailLoading}>
        {detailLoading && detail && <p className={styles.selectionLoading} role="status">Opening selected client…</p>}
        <div className={styles.detailContent} data-empty={!detail&&!detailLoading&&!detailError||undefined} inert={detailLoading && !!detail || !!detail && detail.client.clientId !== selectedId} data-stale={detailLoading && !!detail || undefined}>
        {detailLoading && !detail ? <p className={styles.empty} role="status">Loading client details…</p> : detailError ? <div className={styles.error} role="alert"><p>{detailError}</p><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => selectedId && void openClient(selectedId)}>Retry client details</button></div> : !detail ? <div className={styles.welcome}><div className={styles.welcomeIcon}><SpadeMark /></div><h3>A little less admin.<br />More time making.</h3><p>Choose a client to manage their commissions and sign-in access.</p><span className={styles.hint}>Already making something? Add the client and their existing commission manually.</span></div> : <>
          <header className={styles.clientHeading}><div><span className={styles.eyebrow}>CLIENT PROFILE</span><h3>{detail.client.displayName}{detail.client.nickname && detail.client.nickname !== detail.client.displayName && <small className={styles.nickname}>({detail.client.nickname})</small>}</h3>{detail.email && <p className={styles.email}>{detail.email}</p>}</div><div className={styles.clientProfileActions}><span className={styles.badge} data-access={detail.client.status}>{detail.client.status === "active" ? "ACCESS ACTIVE" : "ACCESS SUSPENDED"}</span><button type="button" data-owner-button className={`${secondary} ${buttons.compact}`} disabled={busy || workspaceBusy || loading || detailLoading || !!editor || !!credentials || !!profileEditor} onClick={() => void editClientProfile()}>Edit client</button></div></header>
          <div className={styles.identity}><div><span>Permanent client ID</span><code>{detail.client.clientId}</code></div><button type="button" data-owner-button className={`${secondary} ${buttons.compact}`} aria-label={`Copy client ID for ${detail.client.displayName}`} onClick={() => void copy(detail.client.clientId, "Client ID")}><CopyIcon />Copy ID</button></div>
          <div className={styles.accessRow}><p className={styles.hint}>This ID stays with the client. Their private sign-in code can be reset.</p><div className={styles.accessActions}><button type="button" data-owner-button className={`${secondary} ${buttons.compact} ${styles.archiveButton}`} aria-label={`Show archived commissions (${detail.projects.filter(archivedCard).length})`} title={showArchived ? "Hide archived commissions" : "Show archived commissions"} aria-pressed={showArchived} onClick={() => {setShowArchived(value => !value);setExpandedGridClient(detail.client.clientId);}}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" /></svg><span>{detail.projects.filter(archivedCard).length}</span></button><button type="button" data-owner-button className={`${secondary} ${buttons.compact}`} disabled={busy} onClick={() => { setResetTarget(detail.client); setModalError(""); }}>Reset sign-in code</button><button type="button" data-owner-button className={`${secondary} ${buttons.compact}`} disabled={busy || workspaceBusy} onClick={() => { setStatusTarget(detail.client); setModalError(""); }}>{detail.client.status === "active" ? "Suspend access" : "Restore access"}</button></div></div>
          <div className={`${styles.sectionHeading} ${styles.commissionsHeading}`}><div><h3>Commissions <span>{detail.projects.length}</span></h3><p className={styles.hint}>A little home for every dream.</p></div><div className={styles.projectActions}><button type="button" data-owner-button className={`${secondary} ${styles.gridToggle}`} aria-expanded={expandedGridClient===detail.client.clientId} aria-controls="owner-commission-cards" onClick={()=>setExpandedGridClient(value=>value===detail.client.clientId?null:detail.client.clientId)}>{expandedGridClient===detail.client.clientId?"Hide commission cards":"Show commission cards"}</button>{showArchived && archivedProjects.length >= 3 && <button type="button" data-owner-button className={secondary} aria-haspopup="dialog" onClick={() => setArchiveClientId(detail.client.clientId)}>All archived ({archivedProjects.length})</button>}<button type="button" data-owner-button className={secondary} disabled={labelOpening||labelSettings.loading||labelSettings.busy||labelSettings.retry||!labelSettings.presentation} onClick={()=>void openLabelManager()}>{labelOpening?"Loading labels…":"Label order"}</button><button type="button" data-owner-button className={secondary} disabled={busy || workspaceBusy} onClick={() => void openDefaults()}>Milestone defaults</button><button type="button" data-owner-button className={primary} disabled={busy || workspaceBusy || detail.client.status !== "active"} onClick={() => editProject()}>Add commission</button></div></div>

          {detail.projects.length ? <div id="owner-commission-cards" className={styles.projects} hidden={expandedGridClient!==detail.client.clientId}>{inlineProjects.map(project => renderProjectCard(project))}</div> : <div className={styles.empty}><h4>No commissions yet</h4><p>Add a new or existing commission. No request form submission is needed.</p></div>}
          {selectedProject && <div ref={workspaceRef} tabIndex={-1} aria-label="Selected commission workspace" className={styles.commissionWorkspace}><HubWorkspaceWindow key={`${detail.client.clientId}:${workspaceMountVersion}`} projects={detail.projects.filter(project => showArchived || !archivedCard(project) || project.projectId === selectedProject.projectId)} onProjectSelect={selectProject} onEditCommission={() => editProject(selectedProject)} openVersion={workspaceFocusVersion} inline project={selectedProject} clientDisplayName={detail.client.displayName} clientNickname={detail.client.nickname} navigation={workspaceNavigation} onTabChange={rememberWorkspaceTab} owner disabled={detail.client.status !== "active"} onDirtyChange={updateWorkspaceDirty} onBusyChange={setWorkspaceBusy} onDiscardAvailabilityChange={registerWorkspaceDiscard} /></div>}
          <p className={styles.footnote}>Payments and invoices will use PayPal only. Adding or updating a commission does not send email, issue an invoice, or charge the client.</p>
        </>}
        </div>
      </section>
    </div>

    {detail && archiveClientId === detail.client.clientId && archivedProjects.length >= 3 && <Dialog title="All archived commissions" wide onClose={() => setArchiveClientId(null)} dismissDisabled={archiveSelecting || busy || workspaceBusy} actions={<button type="button" data-owner-button className={secondary} disabled={archiveSelecting || busy || workspaceBusy} onClick={() => setArchiveClientId(null)}>Close</button>}><p className={styles.hint}>All {archivedProjects.length} archived commissions for {detail.client.displayName}.</p><div className={styles.projects}>{archivedProjects.map(project => renderProjectCard(project, true))}</div></Dialog>}

    {profileEditor && <Dialog title="Edit client profile" draggable={false} onClose={closeProfileEditor} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={closeProfileEditor}>Cancel</button><button type="submit" form="client-hub-profile-editor" data-owner-button className={primary} disabled={busy || !profileEditor.ready} aria-busy={busy}>{busy ? profileEditor.ready ? "Saving…" : "Loading…" : "Save profile"}</button></>}>
      {dialogError}
      {!profileEditor.ready && <p className={styles.hint} role="status">{busy ? "Checking the latest client profile…" : "The latest profile could not be loaded. No changes can be saved until it is verified."}</p>}
      <form id="client-hub-profile-editor" onSubmit={event => { event.preventDefault(); void saveProfile(); }}><fieldset className={styles.form} disabled={busy || !profileEditor.ready}>
        <label>Client name <span aria-hidden="true">*</span><input ref={profileNameInput} autoFocus required maxLength={100} autoComplete="off" value={profileEditor.value.displayName} onChange={event => changeProfile("displayName", event.target.value)} /><small>This name is visible in the client’s hub.</small></label>
        <label>Email address <span className={styles.optional}>(optional)</span><input type="email" maxLength={254} autoComplete="off" value={profileEditor.value.email} onChange={event => changeProfile("email", event.target.value)} /><small>Private owner contact record. No email is sent.</small></label>
      </fieldset></form>
      <p className={styles.hint}>Editing the name does not change the current sign-in code. A reset uses the updated name. The permanent client ID stays the same.</p>
      {modalError && <div className={styles.recovery}><p className={styles.hint}>{profileEditor.attempted ? "The server may have received the earlier update. Your draft is kept here. Reload the saved profile before retrying a stale edit; this will discard your local changes." : "Check the connection and try loading the current profile again."}</p><button type="button" data-owner-button className={secondary} disabled={busy} onClick={async () => { if (profileDirty && !await confirm("Discard your local profile draft and load the current saved profile?")) return; void editClientProfile(); }}>Reload saved profile</button></div>}
    </Dialog>}
    {profileDiscard && <Dialog title="Discard profile changes?" draggable={false} onClose={() => setProfileDiscard(false)} actions={<><button type="button" data-owner-button className={secondary} onClick={() => setProfileDiscard(false)}>Keep editing profile</button><button type="button" data-owner-button className={danger} onClick={() => { const attempted = profileEditor?.attempted; setProfileDiscard(false); setProfileEditor(null); setModalError(""); if (attempted) setNotice("Profile editor closed. Refresh the client before editing again; an earlier update may already have saved."); }}>Discard profile changes</button></>}><p>{profileEditor?.attempted ? "Closing this editor does not undo an update already received by the server. Your local draft will be cleared." : "Your unsaved name and email changes will be discarded. The saved client profile will not change."}</p></Dialog>}
    {defaultsEditor && <Dialog title="Milestone defaults" dismissDisabled={busy} onClose={closeDefaults} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={closeDefaults}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy} onClick={() => void saveDefaults()}>{busy ? "Saving…" : "Save defaults"}</button></>}>{dialogError}<p className={styles.hint}>Your starting lineup for new commissions. Existing commissions keep their own milestones; you can use these defaults from Edit commission.</p><HubMilestoneEditor disabled={busy} savedIds={defaultsEditor.saved.milestones.map(node => node.id)} value={defaultsEditor.value} onChange={value => setDefaultsEditor(current => current ? { ...current, value } : current)} />{modalError && <button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { if (defaultsDirty) setDefaultsDiscard("reload"); else void openDefaults(); }}>Reload saved defaults</button>}</Dialog>}
    {defaultsDiscard && <Dialog title="Discard milestone changes?" onClose={() => setDefaultsDiscard(null)} actions={<><button type="button" data-owner-button className={secondary} onClick={() => setDefaultsDiscard(null)}>Keep editing</button><button type="button" data-owner-button className={danger} onClick={() => { const action = defaultsDiscard; setDefaultsDiscard(null); if (action === "reload") void openDefaults(); else setDefaultsEditor(null); }}>Discard changes</button></>}><p>Your unsaved milestone changes will be cleared. Saved commissions and their milestones will not change.</p></Dialog>}
    {editor && <Dialog title={editor.kind === "client" ? "Add client" : editor.previous ? "Edit commission" : "Add commission"} onClose={closeEditor} dismissDisabled={busy} draggable={false} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={closeEditor}>Cancel</button><button type="submit" form="client-hub-editor" data-owner-button className={editor.kind==="project"&&editor.previous?secondary:primary} disabled={busy} aria-busy={busy}>{busy ? "Saving…" : editor.attempted && (editor.kind === "client" || !editor.previous) ? "Retry creation" : editor.kind === "client" ? "Create client" : editor.previous ? "Save changes" : "Add commission"}</button>{editor.kind==="project"&&editor.previous&&<button type="button" data-owner-button className={primary} disabled={busy} aria-busy={busy} onClick={()=>void saveEditor(true)}>{busy?"Saving…":"Save changes & close"}</button>}</>}>
      {dialogError}{modalNotice&&<div className={styles.modalNotice} role="status" ref={modalNoticeRef}>{modalNotice}</div>}{modalError&&!modalErrorVisible&&editor.attempted&&<p className={styles.hint}>The last save was not confirmed. Your edit is still here; retry or reload the saved record before changing it again.</p>}{busy && editor.kind === "client" && <div className={styles.creatingClient} role="status"><span aria-hidden="true" />Creating client…</div>}<form id="client-hub-editor" onSubmit={event => { event.preventDefault(); void saveEditor(); }}>
        <fieldset className={styles.form} disabled={busy || (editor.attempted && (editor.kind === "client" || !editor.previous))}>
          {editor.kind === "client" ? <><label>Client name <span aria-hidden="true">*</span><input autoFocus required maxLength={100} autoComplete="off" value={editor.value.displayName} onChange={event => changeClient("displayName", event.target.value)} /></label><label>Email address <span className={styles.optional}>(optional)</span><input type="email" maxLength={254} autoComplete="off" value={editor.value.email} onChange={event => changeClient("email", event.target.value)} /><small>For your records only. No email is sent.</small></label><label className={styles.full}>First commission title <span className={styles.optional}>(optional)</span><input maxLength={150} value={editor.value.projectTitle} placeholder="For example, a character name or project title" onChange={event => changeClient("projectTitle", event.target.value)} /><small>You can add an existing commission here or add one later.</small></label></> : <>
            <label className={styles.full}>Commission title <span aria-hidden="true">*</span><input autoFocus required maxLength={150} value={editor.value.title} onChange={event => changeProject("title", event.target.value)} /></label>
            <label className={styles.full}>Client-visible summary<textarea rows={4} maxLength={3000} value={editor.value.summary} onChange={event => changeProject("summary", event.target.value)} /><small>Only include details you want this client to see.</small></label>
            <div className={`${styles.full} ${styles.trackerToggle}`}><Toggle label="Show progress tracker for this commission" checked={editor.value.trackingEnabled} onChange={checked => setEditor(current => current?.kind === "project" ? { ...current, value: { ...current.value, trackingEnabled: checked } } : current)} /></div><fieldset className={`${styles.informationFields} ${styles.full}`}><legend>Commission information</legend><p className={styles.hint}>Manual organizational labels, not verified PayPal payments.</p><div className={styles.labelChoices}>{([...CLIENT_HUB_INFORMATION_TAGS, ...new Set([...Object.keys(labelSettings.presentation?.entries??{}).filter(key=>key.startsWith("custom:")&&!labelSettings.presentation?.entries[key].deleted), ...Object.keys(editor.value.localLabelDefinitions), ...editor.initial.informationTags, ...editor.value.informationTags].filter(tag => tag.startsWith("custom:")))] as ClientHubInformationTag[]).filter(tag => !removedLabels.includes(tag)&&!editor.value.localLabelDefinitions[tag]?.deleted).map(tag => <label key={tag}><input type="checkbox" style={{accentColor:editor.value.localLabelDefinitions[tag]?.color??assignedLabelDefinition(labelSettings.presentation,tag).color??undefined}} checked={editor.value.informationTags.includes(tag)} onChange={() => toggleInformationTag(tag)} />{editor.value.localLabelDefinitions[tag]?.name??assignedLabelDefinition(labelSettings.presentation,tag).name}{tag.startsWith("custom:") && <button type="button" className={styles.removeLabel} aria-label={`${editor.value.localLabelDefinitions[tag]?"Remove from commission":"Unassign label"} ${editor.value.localLabelDefinitions[tag]?.name??assignedLabelDefinition(labelSettings.presentation,tag).name}`} onClick={event => { event.preventDefault(); removeCommissionChoice(tag); }}>×</button>}{tag.startsWith("custom:")&&<button type="button" data-owner-button className={styles.editPencil} disabled={busy||labelOpening||labelSettings.busy||labelSettings.retry} aria-label={editor.value.localLabelDefinitions[tag]?`Edit commission label ${editor.value.localLabelDefinitions[tag].name}`:`Edit shared label ${assignedLabelDefinition(labelSettings.presentation,tag).name} in account-wide Label order`} title={editor.value.localLabelDefinitions[tag]?"Edit this commission label":"Edit account-wide label defaults"} onClick={event=>{event.preventDefault();if(editor.value.localLabelDefinitions[tag])openLocalLabel(tag);else void openLabelManager(true);}}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 16 12-12 4 4-12 12-5 1zM14 6l4 4"/></svg></button>}</label>)}</div><button type="button" data-owner-button className={secondary} disabled={busy||Object.keys(editor.value.localLabelDefinitions).length>=100} onClick={()=>openLocalLabel()}>Add commission label</button><details className={styles.commissionOrder}><summary>Label order for this commission</summary><p className={styles.hint}>Only this commission changes when you save. One-off labels are included; account defaults stay unchanged.</p>{[...new Set([...(editor.value.labelOrder.length ? editor.value.labelOrder : labelSettings.presentation?.order ?? ["status", "information"]), ...Object.keys(editor.value.localLabelDefinitions).filter(key => !editor.value.localLabelDefinitions[key].deleted), ...editor.value.informationTags])].filter(key => !key.startsWith("custom:") || editor.value.informationTags.includes(key as ClientHubInformationTag) || (editor.value.localLabelDefinitions[key] ? !editor.value.localLabelDefinitions[key].deleted : !labelSettings.presentation?.entries[key]?.deleted)).map((key, index, all) => <div key={key}><span>{editor.value.localLabelDefinitions[key]?.name ?? assignedLabelDefinition(labelSettings.presentation,key).name}</span><button type="button" data-owner-button className={secondary} disabled={busy || index === 0} aria-label={`Move ${editor.value.localLabelDefinitions[key]?.name ?? assignedLabelDefinition(labelSettings.presentation,key).name} up`} onClick={() => setEditor(current => { if(current?.kind !== "project") return current; const order=[...all]; [order[index-1],order[index]]=[order[index],order[index-1]]; return {...current,value:{...current.value,labelOrder:order}}; })}>↑</button><button type="button" data-owner-button className={secondary} disabled={busy || index === all.length-1} aria-label={`Move ${editor.value.localLabelDefinitions[key]?.name ?? assignedLabelDefinition(labelSettings.presentation,key).name} down`} onClick={() => setEditor(current => { if(current?.kind !== "project") return current; const order=[...all]; [order[index],order[index+1]]=[order[index+1],order[index]]; return {...current,value:{...current.value,labelOrder:order}}; })}>↓</button></div>)}<button type="button" data-owner-button className={secondary} disabled={busy || !editor.value.labelOrder.length} onClick={() => setEditor(current => current?.kind === "project" ? {...current,value:{...current.value,labelOrder:[]}} : current)}>Use account-wide order</button></details><p className={styles.hint}>Add a label just for this commission, or use Label order for account-wide defaults. Local edits apply only here. Uncheck to unassign a badge. × removes a local choice from this commission; shared choices are only unassigned. Save changes confirms it; history is kept.</p></fieldset>
            {editor.previous && <fieldset className={`${styles.full} ${styles.informationFields}`}><legend>Commission milestones</legend><div className={styles.stageSelectors}><OwnerSelect label="Commission status" value={editor.value.status} onChange={value => changeProject("status", value)} options={statuses} /><OwnerSelect label="Current milestone" hint="This only moves the tracker. Change the commission status separately when it’s completed, shipped, or delivered." value={editor.value.activeMilestoneId ?? ""} options={[{ value: "", label: "Use lifecycle status" }, ...editor.value.milestones.map(node => ({ value: node.id, label: node.label }))]} onChange={id => setEditor(current => { if (current?.kind !== "project") return current; const node = current.value.milestones.find(item => item.id === id); return { ...current, value: { ...current.value, activeMilestoneId: node?.id ?? null } }; })} /></div><HubMilestoneEditor disabled={busy} savedIds={editor.initial.milestones.map(node => node.id)} value={editor.value.milestones} onChange={changeMilestones} actions={<button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => void applyDefaults()}>Use shared defaults</button>} /><p className={styles.hint}>Only saved when you choose Save changes. Other commissions are not changed.</p></fieldset>}
            {editor.previous ? <><label className={`${styles.full} ${styles.linksStart}`}>Tracking link <span className={styles.optional}>(optional)</span><input type="url" maxLength={2048} placeholder="https://" value={editor.value.trackingUrl} onChange={event => changeProject("trackingUrl", event.target.value)} /><small>A saved link only; delivery status is not checked automatically.</small></label><label className={styles.full}>Trello card link <span className={styles.optional}>(optional)</span><input type="url" maxLength={2048} placeholder="https://trello.com/c/Ab12Cd34" value={editor.value.trelloUrl} onChange={event => changeProject("trelloUrl", event.target.value)} /><small>One card per commission. Checklist sections stay in Trello. This is a saved link, not an automatic sync.</small></label></> : <p className={`${styles.hint} ${styles.full}`}>The commission starts as Queued with progress unset. After adding it, choose Edit commission to record its current stage.<br />Already two active? Adding one archives this client’s oldest card—not their work or access. Restoring a card can put them above two.</p>}
          </>}
        </fieldset>
        {editor.attempted && (editor.kind === "client" || !editor.previous) && !busy && <p className={styles.hint}>Creation was not confirmed. Retry checks the same request rather than creating a duplicate. Canceling will not undo a request already received by the server.</p>}
        {editor.kind === "client" && <p className={styles.hint}>A permanent client ID and private sign-in code are generated securely. The code is shown once for you to share directly.</p>}
      </form>
    </Dialog>}
    {editor?.kind==="project"&&localLabelEditor&&<Dialog title="Commission label" onClose={closeLocalLabel} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={closeLocalLabel}>Cancel</button><button type="button" data-owner-button className={primary} disabled={busy||!labelAppearanceValid(localLabelEditor.value)} onClick={saveLocalLabel}>Save label</button></>}>{
// eslint-disable-next-line react-hooks/refs -- Pure field renderer only attaches the callback to input events; it never invokes it while rendering.
labelAppearanceFields(localLabelEditor.value,busy,updateLocalLabel,"Only this commission. Save label stages it; Save changes saves the commission. This does not add an account-wide default.")}{localLabelError&&<p role="alert">{localLabelError}</p>}</Dialog>}
    {discard && <Dialog title="Discard this edit?" draggable={false} onClose={() => setDiscard(false)} actions={<><button type="button" data-owner-button className={secondary} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" data-owner-button className={primary} onClick={() => { const attempted = editor?.attempted; setDiscard(false); setEditor(null); localLabelRef.current=null;setLocalLabelEditor(null); setModalError(""); if (attempted) { setNotice("Editor closed. Choose Refresh to reload saved clients and commission details before making another change."); } }}>Discard edit</button></>}><p>{editor?.attempted ? editor.kind === "project" && editor.previous ? "The server may have received the earlier update. Closing this editor does not undo it. Reload the saved client details before editing again." : "The server may have received the earlier request. Closing this editor does not undo it. Retry creation if you want to recover the same result." : "Your unsaved changes will be lost. Nothing will be added or updated."}</p></Dialog>}
    {resetTarget && <Dialog title="Reset this client’s sign-in code?" draggable={false} onClose={() => { if (!pending.current) { setResetTarget(null); setModalError(""); } }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { if (!pending.current) { setResetTarget(null); setModalError(""); } }}>Cancel</button><button type="button" data-owner-button className={danger} disabled={busy} aria-busy={busy} onClick={() => void resetCode()}>{busy ? "Resetting…" : "Reset sign-in code"}</button></>}>
      {dialogError}<p>A new private code will be created for <strong>{resetTarget.displayName}</strong>. Their old code and current client sessions will stop working.</p><p>The permanent ID <code>{resetTarget.clientId}</code> and all commissions stay the same. No email is sent; share the new code directly.</p>
      {resetTarget.status === "suspended" && <p className={styles.hint}>This client’s access remains suspended after a code reset.</p>}
      {modalError && <div className={styles.recovery}><p className={styles.hint}>A reset may have reached the server even if the response was lost. Reload the client details before attempting another reset.</p><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { if (pending.current) return; const clientId = resetTarget.clientId; setResetTarget(null); setModalError(""); void openClient(clientId); }}>Reload client details</button></div>}
    </Dialog>}
    {statusTarget && <Dialog title={statusTarget.status === "active" ? "Suspend this client’s access?" : "Restore this client’s access?"} draggable={false} onClose={() => { if (!pending.current) { setStatusTarget(null); setModalError(""); } }} dismissDisabled={busy} actions={<><button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { setStatusTarget(null); setModalError(""); }}>Cancel</button><button type="button" data-owner-button className={statusTarget.status === "active" ? danger : primary} disabled={busy} onClick={() => void changeStatus()}>{busy ? "Saving…" : statusTarget.status === "active" ? "Suspend access" : "Restore access"}</button></>}>
      {dialogError}<p>{statusTarget.status === "active" ? "This client will no longer be able to sign in, and existing client sessions will stop working. " : "This client will be able to sign in again with their current sign-in code. Previous sessions remain invalid; they will need to sign in again."}</p><p>This changes sign-in access only.</p>
      {modalError && <button type="button" data-owner-button className={secondary} disabled={busy} onClick={() => { const clientId = statusTarget.clientId; setStatusTarget(null); setModalError(""); void openClient(clientId); }}>Reload client details before retrying</button>}
    </Dialog>}
    {credentials && <Dialog title={credentials.reset ? "New sign-in code" : "Client created"} draggable={false} onClose={closeCredentials} actions={<button type="button" data-owner-button className={primary} onClick={finishCredentials}>{credentials.code ? "Done, I’ve saved the code" : "Done"}</button>}>
      <p><strong>{credentials.client.displayName}</strong> now has a permanent home in the Client Hub.</p>
      {credentials.client.status === "suspended" && <p className={styles.hint}>Client access is still suspended. Resetting a code does not reactivate this account.</p>}
      <div className={styles.credential}><span>Permanent client ID</span><code>{credentials.client.clientId}</code><button type="button" data-owner-button className={secondary} onClick={() => void copy(credentials.client.clientId, "Client ID")}><CopyIcon />Copy client ID</button></div>
      {credentials.code ? <><div className={`${styles.credential} ${styles.secret}`}><span>Private sign-in code · shown once</span><code>{credentials.code}</code><button type="button" data-owner-button className={primary} onClick={() => void copy(credentials.code!, "Sign-in code")}><CopyIcon />Copy sign-in code</button></div><p className={styles.hint}>Share this code privately with the client. It is their access credential, not their permanent ID. It cannot be viewed again after closing; you can reset it instead.</p></> : <div className={styles.error} role="status">The client was saved earlier, but the one-time code was not returned again. Close this dialog and use Reset sign-in code to create a new code before sharing access.</div>}
      {copyNotice && <p role="status" className={styles.hint}>{copyNotice}</p>}
    </Dialog>}
    {hideCode && <Dialog title="Hide this sign-in code?" draggable={false} onClose={() => setHideCode(false)} actions={<><button type="button" data-owner-button className={primary} onClick={() => setHideCode(false)}>Keep code open</button><button type="button" data-owner-button className={secondary} onClick={finishCredentials}>Hide code</button></>}><p>This code is shown only once. If you have not saved or shared it, keep this window open. You can always reset the code later.</p></Dialog>}
  </div></LabelPresentationContext.Provider>;
}

export default OwnerClientHub;
