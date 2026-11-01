"use client";
import { WebsiteImportDialog } from "./WebsiteImportDialog";
import { WebsitePromotionDialog } from "./WebsitePromotionDialog";
import { readPendingWebsitePromotion, type WebsitePromotionTarget, type PromotionSummary } from "./website-promotion-client";
import { WEBSITE_WORKSPACE } from "./website-workspace-config";
import {useOwnerWhimsyIdentity} from "./owner-whimsy";
import { beginPanelEditSession, endPanelEditSession } from "./panel-edit-session";
import { InvoiceBusinessSettings } from "./InvoiceBusinessSettings";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent, type CSSProperties } from "react";
import { COMMISSION_STATUSES, getPageNavPlacement, createCustomPage, movePage, restorePage, slugifyTitle, trashPage, validateOwnerContent, validatePageSlug, OwnerValidationError, normalizeOwnerDraftName, type OwnerContent, type OwnerPage, type OwnerWorkspace, type OwnerPremade, type ValidationIssue } from "./model";
import { applySettingsCard, SETTINGS_CARD_LABELS, type SettingsCardId } from "./settings-cards";
import { SettingsCardActions } from "./SettingsCardActions";
import type { OwnerStore } from "./storage";
import { Card, Dialog, Field, Icon, MoveButtons, OwnerSelect } from "./OwnerFields";
import { TrashIcon } from "./TrashIcon";
import buttons from "./OwnerButton.module.css";
import { OwnerBrandLogo } from "./OwnerBrandLogo";
import { RefreshIcon } from "@/components/RefreshIcon";
import { ConstructionModeSettings } from "./ConstructionModeSettings";
import { OwnerVisualBuilder } from "./OwnerVisualBuilder";
import type { FrameClipboardSessionRef } from "./frame-clipboard";
import { OwnerDraftHistory, usesNativeUndo } from "./draft-history";
import { draftFromPublication } from "./discard-draft";
import {pruneElementLinks} from "./canvas-hyperlinks";
import {reconcileInlineTextStyles} from "./rich-text";
import { reconcileCanvasLayouts } from "./canvas-layout";
import { OwnerPricesManager } from "./OwnerPricesManager";
import { PhotoGalleryManager, PremadesManager, HomePageManager, ContactSettingsManager } from "./OwnerTemplateManagers";
import { OwnerUploadProvider, OwnerUploadCancel } from "./PhotoUpload";
import { NamedDraftsDialog } from "./NamedDraftsDialog";
import { CommissionFormEditor } from "./CommissionFormEditor";
import { notifyPublicSitePublished } from "@/components/PublicSiteContext";
import { HubNotificationBell } from "@/client-hub/HubNotificationBell";
import type { HubNotification } from "@/client-hub/model";
import { TrelloStudio } from "./TrelloStudio";
import { PayPalStudio } from "./PayPalStudio";
import { InvoiceWorkspace } from "./InvoiceWorkspace";
import { StudioConnections } from "./StudioConnections";
import { ServiceDisclosure } from "./ServiceDisclosure";
import { useDraftRecovery } from "./use-draft-recovery";
import { useLivePreview } from "./use-live-preview";
import type { RecoverySession } from "./draft-recovery";
import type { CloudRecoveryEntry } from "./cloud-recovery";
import { EmailStudio } from "./EmailStudio";
import { HelpButton } from "./HelpButton";
import { TaylorServices } from "./TaylorServices";
import { TemporaryFileHub } from "./TemporaryFileHub";
import { CloudFileDialog } from "./AssetLibrary";
import { OwnerInventory } from "./OwnerInventory";
import { OwnerClientHub } from "./OwnerClientHub";
import { CommissionRequests } from "./CommissionRequests";
import styles from "./OwnerPortal.module.css";
import { ColorModeToggle, useColorMode } from "@/components/ColorMode";
import { clearHubPhotoCache } from "@/client-hub/private-photo-cache";
import { resolveWorkspacePage } from "./owner-workflows";

import { createOwnerNavigation, ownerDestinationHref, ownerDestinationFromUrl, type OwnerSection as Section, type OwnerDestination as Destination, type OwnerNavigationIntent } from "./owner-navigation";
const BUILDER_SECTIONS = new Set<Section>(["pages", "prices", "commissionForm", "files"]);
type Confirmation = { title: string; description: string; action: string; onConfirm: () => void; danger?: boolean; alternate?: { label: string; action: () => void } };
const sections: { id: Section; label: string; title: string; description: string }[] = [
  { id: "overview", label: "Overview", title: "Your site, made by a Red Folf.", description: "A little update or something brand new. Make it yours." },
  { id: "pages", label: "Website builder", title: "Your website. Your canvas.", description: "View your private draft, or choose Edit website to make changes. Your changes stay private until you publish." },
  { id: "commissionForm", label: "Commission form", title: "Your commission form", description: "Select a question to edit it, drag to arrange your form, then save privately or publish this form live." },
  { id: "prices", label: "Prices & options", title: "Prices & options", description: "Prepare commission prices, individual parts, and extras in your private draft." },
  { id: "photos", label: "Photos", title: "Your photo gallery", description: "Show off your work. The first photo in this list appears first on your gallery page." },
  { id: "premades", label: "Premades", title: "Your premades", description: "Create and organize listings, then choose which ones appear in your private preview." },
  { id: "home", label: "Home page", title: "Make a great first impression.", description: "Update the welcome visitors see when they first arrive." },
  { id: "requests", label: "Commission Requests", title: "Commission requests", description: "A private inbox for the people who want to create something with you." },
  { id: "clients", label: "Client Hub", title: "Your client hub", description: "Manage your clients, commission projects, and private access." },
  { id: "files", label: "File Hub", title: "Your files, in one place", description: "A home for your photos, ref-sheets, project files, and other files." },
  { id: "inventory", label: "Inventory", title: "Your inventory", description: "Keep track of materials, finished creations, and what needs restocking." },
  { id: "services", label: "System status", title: "System status", description: "A private view of the services connected to Taylor’s Space." },
  { id: "settings", label: "Settings", title: "Settings", description: "Help people find you and let them know when commissions are available." },
];
const timeLabel = (date: string | null | undefined, seconds = false) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" as const } : {}), timeZoneName: "short" }) : null;

function errorMessage(error: unknown) { const message = error instanceof Error ? error.message : "Please try again."; return message.includes("revision") || message.toLowerCase().includes("another tab") || message.toLowerCase().includes("conflict") ? "This draft changed in another tab or device. Your edits are still here. Reload the saved cloud draft before saving again, or keep this tab open while you review the other version." : message; }


export interface OwnerPortalProps {
  store: OwnerStore;
  recoveryIdentity?: RecoverySession;
  mode: "cloud";
  userEmail: string;
  onSignOut: () => Promise<void>;
  initialSection?: Section;
  initialPageId?: string;
  fullPageBuilder?: boolean;
}

/** Mounted only after verified owner auth. Browser recovery never replaces the cloud/auth boundary. */
export default function OwnerPortal({ store, recoveryIdentity, mode, userEmail, onSignOut, initialSection = "overview", initialPageId, fullPageBuilder = false }: OwnerPortalProps) {
  const colorMode = useColorMode("owner");
  // The editor is keyed by page; clipboard ownership belongs to this authenticated
  // portal session instead, so changing pages does not destroy a pending copy.
  const frameClipboard = useRef<FrameClipboardSessionRef["current"]>(null);
  const [clipboardSession, setClipboardSession] = useState(() => ({ assertCurrent: recoveryIdentity?.assertCurrent, generation: 0 }));
  if (clipboardSession.assertCurrent !== recoveryIdentity?.assertCurrent) {
    setClipboardSession({ assertCurrent: recoveryIdentity?.assertCurrent, generation: clipboardSession.generation + 1 });
  }
  useLayoutEffect(() => { frameClipboard.current = null; }, [recoveryIdentity?.assertCurrent]);
  const clipboardScopeKey = recoveryIdentity ? JSON.stringify([WEBSITE_WORKSPACE, recoveryIdentity.projectId, recoveryIdentity.ownerUid, clipboardSession.generation]) : undefined;
  const toolbarRef=useRef<HTMLElement>(null);
  const moreMenuRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(!fullPageBuilder)return;const closeOutside=(event:PointerEvent)=>{const menu=moreMenuRef.current;if(menu?.open&&event.target instanceof Node&&!menu.contains(event.target))menu.open=false;};const closeEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&moreMenuRef.current?.open&&!document.querySelector("dialog[open]")){event.preventDefault();event.stopPropagation();moreMenuRef.current.open=false;}};document.addEventListener("pointerdown",closeOutside);document.addEventListener("keydown",closeEscape);return()=>{document.removeEventListener("pointerdown",closeOutside);document.removeEventListener("keydown",closeEscape);};},[fullPageBuilder]);
  const [toolbarHeight,setToolbarHeight]=useState(88);
  const [showFiles,setShowFiles]=useState(false);
  useLayoutEffect(()=>{if(!fullPageBuilder)return;const bar=toolbarRef.current;if(!bar)return;const measure=()=>{const height=Math.ceil(bar.getBoundingClientRect().height);if(Number.isFinite(height)&&height>0)setToolbarHeight(height);};measure();const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):null;observer?.observe(bar);window.addEventListener("resize",measure);return()=>{observer?.disconnect();window.removeEventListener("resize",measure);};},[fullPageBuilder]);
  const [editorColorMode,setEditorColorMode]=useState<"dark"|"light">("dark");
  const [importIntent,setImportIntent]=useState<{editVersion:number;revision:number}|null>(null);
  const [promotionIntent,setPromotionIntent]=useState<{editVersion:number;revision:number;target:WebsitePromotionTarget}|null>(null);
  const importLock=useRef<object|null>(null);
  // A sign-out/sign-in can remount the gate after same-document navigation.
  // The current bookmark, rather than an older server entry prop, wins then.
  const [initialDestination] = useState<Destination>(() => fullPageBuilder ? { section: "pages", pageId: initialPageId } : (typeof window !== "undefined" ? ownerDestinationFromUrl(window.location.href) : null) ?? { section: initialSection, pageId: initialPageId });
  const [draftName, setDraftName] = useState("");
  const [workspace, setWorkspace] = useState<OwnerWorkspace | null>(null);
  const [content, setContent] = useState<OwnerContent | null>(null);
  const draftHistory = useRef(new OwnerDraftHistory());
  const historyGesture = useRef<object | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  function refreshHistoryState() { setHistoryState({ canUndo: draftHistory.current.canUndo, canRedo: draftHistory.current.canRedo }); }
  // Only local edit/undo entrypoints advance this history. Cloud refresh, explicit
  // saves, recovery, named-draft load and discard are new history boundaries.
  useLayoutEffect(() => { if (draftHistory.current.value !== content) { draftHistory.current.reset(content); refreshHistoryState(); } }, [content]);
  const whimsyIdentity = useOwnerWhimsyIdentity();
  const [section, setSection] = useState<Section>(initialDestination.section);
  // Keep mode above the keyed page canvas so preview navigation never re-enters editing.
  const [builderBrowsing, setBuilderBrowsing] = useState(true);
  const builderEntrySnapshot = useRef<string | null>(null);
  const [pageId, setPageId] = useState<string | undefined>(initialDestination.pageId);
  const [showTrash, setShowTrash] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const invoiceDirtyRef = useRef(false), invoiceBusyRef = useRef(false);
  const registerInvoiceBusy = useCallback((value: boolean) => { invoiceBusyRef.current = value; }, []);
  const registerInvoiceDirty = useCallback((value: boolean) => { invoiceDirtyRef.current = value; }, []);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const uploadBusyRef = useRef(false);
  const loadingRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const editVersionRef = useRef(0);
  const workspaceRevisionRef = useRef(-1);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const operationRef = useRef(false);
  const inventoryDirtyRef = useRef(false);
  const inventoryBusyRef = useRef(false);
  const clientHubDirtyRef = useRef(false);
  const clientHubDiscardRef = useRef<(() => void) | null>(null);
  const [clientHubCanDiscard, setClientHubCanDiscard] = useState(false);
  const registerClientHubDiscard = useCallback((action: (() => void) | null) => { clientHubDiscardRef.current = action; setClientHubCanDiscard(!!action); }, []);
  const clientHubBusyRef = useRef(false);
  const [clientHubIsBusy, setClientHubIsBusy] = useState(false);
  const registerClientHubBusy = useCallback((value: boolean) => { clientHubBusyRef.current = value; setClientHubIsBusy(value); }, []);
  const serviceDirtyRef = useRef(false), serviceBusyRef = useRef(false), paypalDirtyRef = useRef(false), paypalBusyRef = useRef(false), trelloDirtyRef = useRef(false), trelloBusyRef = useRef(false);
  const [hubNotification, setHubNotification] = useState<HubNotification | null>(null);
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNoticeValue] = useState<string | null>(null);
  const [noticeSequence, setNoticeSequence] = useState(0);
  const [navigationWarning, setNavigationWarning] = useState<string | null>(null);
  const setNotice = useCallback((value: string | null) => {
    setNoticeValue(value);
    if (value !== null) setNoticeSequence(sequence => sequence + 1);
  }, []);
  const [error, setErrorValue] = useState<string | null>(null);
  const [errorPersistent, setErrorPersistent] = useState(false);
  const setError = useCallback((value: string | null, persistent = false) => {
    setErrorValue(value); setErrorPersistent(!!value && persistent);
  }, []);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [pending, setPending] = useState<OwnerNavigationIntent | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [discardChoice, setDiscardChoice] = useState(false);
  const discardIntent = useRef<{editVersion:number;revision:number}|null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [saveChoice, setSaveChoice] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBrowsing, setPreviewBrowsing] = useState(true);
  const editingWebsite = !builderBrowsing || (showPreview && !previewBrowsing);
  useEffect(() => {
    if (!editingWebsite) return;
    const token = beginPanelEditSession();
    return () => endPanelEditSession(token);
  }, [editingWebsite]);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [showPageManager, setShowPageManager] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const pendingDraftVersion = useRef<{ key: string; version: { id: string; name: string } } | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [liveShopVisibility, setLiveShopVisibility] = useState<boolean | null>(null);
  const [liveShopKnown, setLiveShopKnown] = useState(false);
  const [liveShopReadError, setLiveShopReadError] = useState<string | null>(null);
  const [liveShopRetry, setLiveShopRetry] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPageError, setNewPageError] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const destinationRef = useRef<Destination>(initialDestination);
  const navigationRef = useRef<ReturnType<typeof createOwnerNavigation> | null>(null);
  const dirty = !!(content && workspace && JSON.stringify(content) !== JSON.stringify(workspace.draft));
  const dirtyRef = useRef(dirty);
  const recovery = useDraftRecovery(recoveryIdentity, content, workspace?.revision, dirty, !loading && !!workspace, store.recovery);
  const recoveryFlushRef = useRef<() => boolean>(() => false);
  useEffect(() => { recoveryFlushRef.current = recovery.flush; }, [recovery.flush]);
  useEffect(() => { dirtyRef.current = dirty; });
  const reportUploadBusy = useCallback((value: boolean) => { uploadBusyRef.current = value; setUploadBusy(value); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5_000);
    return () => clearTimeout(timer);
  }, [notice, noticeSequence, setNotice]);

  useEffect(() => {
    // Validation lists/conflict recovery are persistent instructions, not toasts.
    if (!error || errorPersistent || issues.length || error.includes("another tab or device")) return;
    const timer = setTimeout(() => setError(null), 8_000);
    return () => clearTimeout(timer);
  }, [error, errorPersistent, issues.length, setError]);

  // Explicit reload only. A dirty draft can enter here only after the owner
  // chooses Reload saved draft; automatic refresh uses the guarded reader below.
  const load = useCallback(async (replaceUnsaved = false): Promise<boolean> => {
    if (operationRef.current || uploadBusyRef.current || (dirtyRef.current && !replaceUnsaved)) return false;
    operationRef.current = true;
    const request = ++loadRequestRef.current;
    setBusy(true); setSyncing(true); setError(null); setNotice(null);
    try {
      const saved = await store.load();
      if (!mountedRef.current || request !== loadRequestRef.current) return false;
      if (saved.revision < workspaceRevisionRef.current) throw new Error("Cloud Sync returned an older saved draft. Your current work has not been replaced. Please try again.");
      workspaceRevisionRef.current = saved.revision;
      dirtyRef.current = false;
      setLastCheckedAt(new Date().toISOString());
      setWorkspace(saved); setContent(structuredClone(saved.draft)); setIssues([]); setFormVersion(value => value + 1);
      setNotice("Cloud Sync complete. Your latest saved draft is open. Your live site has not changed.");
      return true;
    } catch (error) {
      if (mountedRef.current && request === loadRequestRef.current) setError(errorMessage(error));
      return false;
    } finally {
      operationRef.current = false;
      loadingRef.current = false;
      if (mountedRef.current && request === loadRequestRef.current) { setLoading(false); setBusy(false); setSyncing(false); }
    }
  }, [store, setNotice, setError, setIssues, setFormVersion, setBusy, setSyncing, setLoading, setWorkspace, setContent]);
  useEffect(() => {
    mountedRef.current = true;
    loadingRef.current = true;
    const request = ++loadRequestRef.current;
    void store.load().then(saved => {
      if (mountedRef.current && request === loadRequestRef.current) {
        workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
        setLastCheckedAt(new Date().toISOString());
        setWorkspace(saved); setContent(structuredClone(saved.draft));
      }
    }).catch(error => { if (mountedRef.current && request === loadRequestRef.current) setError(errorMessage(error)); })
      .finally(() => { if (mountedRef.current && request === loadRequestRef.current) { loadingRef.current = false; setLoading(false); } });
    return () => { mountedRef.current = false; };
  }, [store, setError]);
  useEffect(() => {
    let active = true;
    const refreshClean = async () => {
      if (!active || loadingRef.current || dirtyRef.current || uploadBusyRef.current || operationRef.current || syncInFlightRef.current) return;
      const editVersion = editVersionRef.current;
      const request = ++loadRequestRef.current;
      syncInFlightRef.current = true; setSyncing(true);
      try {
        const saved = await store.load();
        // A user may start typing or upload while this read is pending. Never
        // replace their work, nor install a stale response after a write/reload.
        if (!active || !mountedRef.current || request !== loadRequestRef.current || dirtyRef.current || uploadBusyRef.current || operationRef.current || editVersion !== editVersionRef.current || saved.revision < workspaceRevisionRef.current) return;
        setLastCheckedAt(new Date().toISOString());
        if (saved.revision !== workspaceRevisionRef.current) {
          workspaceRevisionRef.current = saved.revision;
          setWorkspace(saved); setContent(structuredClone(saved.draft)); setFormVersion(value => value + 1);
        }
      } catch (error) {
        if (active && mountedRef.current && request === loadRequestRef.current) setError(`Cloud Sync could not refresh the saved draft. Your current work is still here. ${errorMessage(error)}`);
      } finally {
        syncInFlightRef.current = false;
        if (active && mountedRef.current && !operationRef.current) setSyncing(false);
      }
    };
    const onFocus = () => { void refreshClean(); };
    const unsubscribe = store.subscribe(onFocus);
    window.addEventListener("focus", onFocus);
    return () => { active = false; unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, [store, setError]);
  useEffect(() => {
    let active = true;
    if (store.readLiveShopVisibility) void store.readLiveShopVisibility().then(value => { if (active) { setLiveShopVisibility(value); setLiveShopKnown(true); setLiveShopReadError(null); } }).catch(() => { if (active) { setLiveShopKnown(false); setLiveShopReadError("Could not check the live shop. Your draft and live site have not been changed."); } });
    return () => { active = false; };
  }, [store, workspace?.revision, liveShopRetry]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if ((dirtyRef.current && !recoveryFlushRef.current()) || uploadBusyRef.current || operationRef.current || invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = createOwnerNavigation(window, {
      blocked: () => operationRef.current || loadingRef.current || uploadBusyRef.current || inventoryDirtyRef.current || inventoryBusyRef.current || invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current,
      dirty: () => dirtyRef.current && !recoveryFlushRef.current(),
      current: () => destinationRef.current,
      arrive: destination => {
        if (fullPageBuilder && !BUILDER_SECTIONS.has(destination.section)) return;
        destinationRef.current = { section: destination.section, pageId: destination.pageId };
        setSection(destination.section); setPageId(destination.pageId); setShowTrash(false);
        window.setTimeout(() => { headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }, 0);
      },
      confirm: destination => { if (!fullPageBuilder || BUILDER_SECTIONS.has(destination.section)) setPending(destination); },
      interrupted: () => setNavigationWarning(invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current ? "Finish or cancel your Client Hub or integration changes before leaving." : inventoryDirtyRef.current || inventoryBusyRef.current ? "Save or cancel your inventory edit before leaving." : "Please wait for the current save or upload to finish before changing sections."),
    });
    navigationRef.current = navigation;
    window.addEventListener("beforeunload", beforeUnload);
    return () => { navigation.dispose(); navigationRef.current = null; window.removeEventListener("beforeunload", beforeUnload); };
  }, [setNotice, fullPageBuilder]);

  function recordDraft(next: OwnerContent) {
    pruneElementLinks(next);
    const current=draftHistory.current.value;
    if(current)reconcileInlineTextStyles(current,next);
    const graphIssues=current?reconcileCanvasLayouts(current,next):[];
    if(graphIssues.length)throw new OwnerValidationError(graphIssues);
    const focus = document.activeElement;
    const group = historyGesture.current ?? (usesNativeUndo(focus) ? focus : null);
    if (!draftHistory.current.record(next, group, undefined, !!historyGesture.current)) return;
    dirtyRef.current = true; editVersionRef.current++;
    setContent(next); refreshHistoryState();
  }
  const historyBlocked = !!(promotionIntent || discardChoice || confirmation || saveChoice || showDrafts || showRecovery || showTrash || addingPage || showPageManager || pending || pendingSync || pendingSignOut);
  function travelDraftHistory(direction: "undo" | "redo") {
    if (historyBlocked || operationRef.current || loadingRef.current || uploadBusyRef.current) return;
    const next = draftHistory.current[direction]();
    if (!next) return;
    dirtyRef.current = true; editVersionRef.current++; historyGesture.current = null;
    setContent(next); refreshHistoryState(); setIssues([]); setError(null);
    setNotice(direction === "undo" ? "Undone" : "Redone");
  }
  useEffect(() => {
    const editable = section === "pages" || showPreview;
    if (!editable || historyBlocked) { draftHistory.current.endGroup(); return; }
    const key = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector?.("dialog[open]") || event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || usesNativeUndo(event.target) || operationRef.current || loadingRef.current || uploadBusyRef.current) return;
      event.preventDefault(); travelDraftHistory(event.shiftKey ? "redo" : "undo");
    };
    const start = (event: globalThis.PointerEvent) => {
      if (event.button === 0 && event.target instanceof HTMLElement && event.target.closest("[aria-label='Visual website builder']")) { draftHistory.current.endGroup(); historyGesture.current = {}; }
    };
    const end = () => { historyGesture.current = null; draftHistory.current.endGroup(); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", start, true);
    window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end); window.addEventListener("blur", end);
    return () => { end(); window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", start, true); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end); };
  // History lives in refs; keyboard handlers must not reset typing groups per edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, showPreview, historyBlocked]);
  function edit(change: (draft: OwnerContent) => void) {
    if (operationRef.current || loadingRef.current) return;
    const current = draftHistory.current.value; if (!current) return;
    try { const next = structuredClone(current); change(next); recordDraft(next); setNotice(null); setIssues([]); }
    catch(error) { if(error instanceof OwnerValidationError){setIssues(error.issues);setError("Move the affected piece out of this box before removing it. Your previous draft is unchanged.");}else setError(errorMessage(error)); }
  }
  function mutate(change: (draft: OwnerContent) => OwnerContent) {
    if (!content || operationRef.current || uploadBusyRef.current) return;
    try { const next = change(draftHistory.current.value ?? content); recordDraft(next); setNotice(null); setError(null); setIssues([]); }
    catch (error) { if (error instanceof OwnerValidationError) { setIssues(error.issues); setError("Check the details below before making this change."); } else setError(errorMessage(error)); }
  }
  function changeBuilderMode(browsing: boolean) {
    if (operationRef.current || loadingRef.current || uploadBusyRef.current) return;
    draftHistory.current.endGroup(); historyGesture.current = null;
    // Mode exit only reviews work changed during this edit session. Older private
    // edits remain protected by the independent whole-workspace navigation guards.
    const currentSnapshot = JSON.stringify(draftHistory.current.value ?? content);
    if (!browsing && builderBrowsing) builderEntrySnapshot.current = currentSnapshot;
    const changedThisSession = builderEntrySnapshot.current !== null && builderEntrySnapshot.current !== currentSnapshot;
    if (browsing && !builderBrowsing && dirtyRef.current && changedThisSession) {
      setConfirmation({ title: "Leave edit mode?", description: "Your website has unsaved changes. Exit to view the draft without discarding those edits, or cancel to keep editing. Nothing is published.", action: "Exit edit mode", onConfirm: () => setBuilderBrowsing(true), alternate: {label:"Discard Edits",action:requestBuilderDiscard} });
    } else setBuilderBrowsing(browsing);
  }
  function arrive(destination: OwnerNavigationIntent) { if (fullPageBuilder && !BUILDER_SECTIONS.has(destination.section)) return; navigationRef.current?.arrive(destination); }
  function navigate(destination: Destination, event?: MouseEvent<HTMLAnchorElement>) {
    if (fullPageBuilder && !BUILDER_SECTIONS.has(destination.section)) { event?.preventDefault(); return; }
    // Keep native links: keyboard activation is guarded, while modifiers,
    // middle click and Open in new tab leave this unsaved workspace untouched.
    if (event && (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault();
    if (invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current) { setNavigationWarning("Finish or cancel your Client Hub or integration changes before leaving."); return; }
    if (inventoryDirtyRef.current || inventoryBusyRef.current) { setNavigationWarning("Save or cancel your inventory edit before leaving."); return; }
    if (operationRef.current || loadingRef.current || uploadBusyRef.current || navigationRef.current?.restoring) return;
    if (destination.section === section && destination.pageId === pageId) return;
    if (dirtyRef.current && !recovery.flush()) setPending(destination); else arrive(destination);
  }
  async function saveDraft(): Promise<OwnerWorkspace | null> {
    if (!content || !workspace || operationRef.current || uploadBusyRef.current || loading) return null;
    const result = validateOwnerContent(content);
    if (!result.valid) { setIssues(result.issues); setError("A few details need your attention before this draft can be saved."); window.scrollTo({ top: 0, behavior: "smooth" }); return null; }
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      if (WEBSITE_WORKSPACE === "beta" && recoveryIdentity && readPendingWebsitePromotion(recoveryIdentity.ownerUid,recoveryIdentity.projectId)) throw new Error("Resolve the saved Live or both publication using Publish Live or Publish to both before saving a new draft.");
      const chosenName = draftName.trim() ? normalizeOwnerDraftName(draftName) : undefined;
      const key = JSON.stringify({ content, revision: workspace.revision, chosenName });
      if (pendingDraftVersion.current?.key !== key) {
        const id = `draft-${crypto.randomUUID()}`;
        pendingDraftVersion.current = { key, version: { id, name: chosenName ?? `Draft ${new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} · ${id.slice(-6)}` } };
      }
      const attempt = pendingDraftVersion.current;
      const saved = await store.saveDraft(content, workspace.revision, attempt.version);
      if (!mountedRef.current) return null;
      if (pendingDraftVersion.current === attempt) pendingDraftVersion.current = null;
      workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
      setWorkspace(saved); setContent(structuredClone(saved.draft));
      setNotice(`Private cloud draft saved in Drafts as “${attempt.version.name}”. Your current workspace is saved too. Your live website has not changed.`);
      // The working draft is already committed. Recovery has its own pending,
      // retry and owner-session lifecycle; it must not keep Save or the builder
      // locked while its separate network acknowledgment is outstanding.
      void recovery.cloud.checkpointSaved(saved.draft, saved.revision);
      return saved;
    } catch (error) { if (mountedRef.current) setError(errorMessage(error), true); return null; }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function reviewLivePublication(target:WebsitePromotionTarget="live") {
    if (WEBSITE_WORKSPACE !== "beta" || !fullPageBuilder || !store.websitePromotion || !recoveryIdentity || !workspace || operationRef.current || uploadBusyRef.current || loadingRef.current) return;
    try {
      recoveryIdentity.assertCurrent();
      // Resolve an existing receipt BEFORE saving another revision. An unknown
      // commit must never be replaced by a new operation or a different source.
      const pendingPromotion = readPendingWebsitePromotion(recoveryIdentity.ownerUid, recoveryIdentity.projectId);
      const saved = pendingPromotion ? null : await saveDraft();
      if (!pendingPromotion && !saved) return;
      recoveryIdentity.assertCurrent();
      if (!mountedRef.current || operationRef.current || uploadBusyRef.current) return;
      operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true);
      setSaveChoice(false); setError(null);
      setPromotionIntent({ target: pendingPromotion ? pendingPromotion.target??"live" : target, revision: pendingPromotion?.sourceRevision ?? saved!.revision, editVersion: editVersionRef.current });
    } catch (cause) { if (mountedRef.current) setError(errorMessage(cause), true); }
  }
  async function reconcileWebsitePublication(receipt:PromotionSummary) {
    recoveryIdentity?.assertCurrent();
    if (!mountedRef.current) throw new Error("The owner workspace is closed.");
    if (receipt.target !== "both") { setNotice("The reviewed website was published to live. Your beta publication and main private draft were not changed."); return; }
    // Receipt proves publication, not that the source workspace is still latest.
    // Re-read it while retaining the publication lock and any newer unsaved edits.
    const editVersion = editVersionRef.current, request = ++loadRequestRef.current;
    const saved = await store.load();
    recoveryIdentity?.assertCurrent();
    if (!mountedRef.current || request !== loadRequestRef.current || editVersion !== editVersionRef.current) throw new Error("Published to both, but the editor changed. Refresh the Beta workspace again.");
    if (saved.revision < (receipt.committedBetaRevision ?? Infinity) || saved.revision < workspaceRevisionRef.current) throw new Error("Published to both, but Beta workspace refresh returned an older revision. Retry the refresh; do not republish.");
    const keepUnsaved = dirtyRef.current;
    workspaceRevisionRef.current = saved.revision;
    setWorkspace(saved);
    if (!keepUnsaved) { dirtyRef.current = false; setContent(structuredClone(saved.draft)); }
    setLastCheckedAt(new Date().toISOString()); setLiveShopRetry(value => value + 1);
    recovery.cloud.acknowledgePublication(); notifyPublicSitePublished();
    setNotice("The reviewed website was published to Beta and Live in one operation. The Beta workspace is refreshed; the main private draft was not changed.");
  }
  function closeLivePublication() {
    operationRef.current = false;
    if (mountedRef.current) { setPromotionIntent(null); setBusy(false); }
  }
  async function publishLive(): Promise<boolean> {
    if (!content || !workspace || !store.publishLive || operationRef.current || uploadBusyRef.current || loading) return false;
    const result = validateOwnerContent(content);
    if (!result.valid) { setIssues(result.issues); setError("A few details need your attention before publishing."); return false; }
    // Publish the current website workspace atomically. Private Gallery storage is
    // deliberately not loaded or merged into this draft.
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setPublishing(true); setPublished(false); setError(null); setIssues([]);
    try {
      if (WEBSITE_WORKSPACE === "beta" && recoveryIdentity && readPendingWebsitePromotion(recoveryIdentity.ownerUid,recoveryIdentity.projectId)) throw new Error("Resolve the saved Live or both publication before publishing Beta separately.");
      const saved = await store.publishLive(structuredClone(content), workspace.revision);
      if (!mountedRef.current) return false;
      workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
      setWorkspace(saved); setContent(structuredClone(saved.draft)); setPublished(true);
      setLiveShopRetry(value => value + 1); recovery.cloud.acknowledgePublication();
      setNotice(WEBSITE_WORKSPACE === "beta" ? "Your protected beta preview is updated. The main website is unchanged." : "Your website changes are live."); notifyPublicSitePublished();
      return true;
    } catch (cause) { if (mountedRef.current) setError(errorMessage(cause), true); return false; }
    finally { operationRef.current = false; if (mountedRef.current) { setBusy(false); setPublishing(false); } }
  }
  async function signOut() {
    if (operationRef.current || uploadBusyRef.current || !mountedRef.current) return;
    recovery.stop(); recovery.cloud.stop(); livePreview.close(); clearHubPhotoCache();
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setSigningOut(true); setError(null);
    try { await onSignOut(); }
    catch (error) {
      if (mountedRef.current) { setError(errorMessage(error)); setPendingSignOut(false); }
    } finally {
      operationRef.current = false;
      if (mountedRef.current) { setBusy(false); setSigningOut(false); }
    }
  }
  function requestSignOut() {
    if (invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current) { setNavigationWarning("Finish or cancel your Client Hub or integration changes before signing out."); return; }
    if (inventoryDirtyRef.current || inventoryBusyRef.current) { setNavigationWarning("Save or cancel your inventory edit before signing out."); return; }
    if (operationRef.current || uploadBusy) return;
    if (dirty) setPendingSignOut(true);
    else void signOut();
  }
  function discardBlocked() { return !mountedRef.current || !workspace || operationRef.current || loadingRef.current || uploadBusyRef.current || !!pendingDraftVersion.current || invoiceBusyRef.current || invoiceDirtyRef.current || paypalBusyRef.current || paypalDirtyRef.current || trelloBusyRef.current || trelloDirtyRef.current || clientHubBusyRef.current || clientHubDirtyRef.current || serviceBusyRef.current || serviceDirtyRef.current || inventoryBusyRef.current || inventoryDirtyRef.current; }
  function stageDiscard(next:OwnerContent) {
    dirtyRef.current = JSON.stringify(next)!==JSON.stringify(workspace?.draft); editVersionRef.current++; ++loadRequestRef.current;
    historyGesture.current=null; const previous=draftHistory.current.value ?? content; draftHistory.current.reset(previous); draftHistory.current.record(next); refreshHistoryState();
    setContent(next); setIssues([]); setError(null); setFormVersion(value=>value+1);
    setBuilderBrowsing(true); setPreviewBrowsing(true); builderEntrySnapshot.current=null;
  }
  function discard() { if (workspace) { dirtyRef.current = false; editVersionRef.current++; setContent(structuredClone(workspace.draft)); setIssues([]); setError(null); setFormVersion(value => value + 1); } }
  function requestBuilderDiscard() {
    if(discardBlocked()||!workspace){setError("Finish or check the current save, upload, or private workspace operation before discarding edits.",true);return;}
    discardIntent.current={editVersion:editVersionRef.current,revision:workspace.revision};setConfirmation(null);setDiscardChoice(true);
  }
  async function confirmBuilderDiscard(target:"saved"|"published") {
    const intent=discardIntent.current;
    if(discardBlocked()||!workspace||!intent)return;
    if(intent.editVersion!==editVersionRef.current||intent.revision!==workspaceRevisionRef.current){setError("Your draft changed while this choice was open. Close it and review Discard Edits again.",true);return;}
    const saved=structuredClone(workspace.draft), request=++loadRequestRef.current;
    operationRef.current=true;setBusy(true);setError(null);
    try{
      recoveryIdentity?.assertCurrent();
      let next=saved;
      if(target==="published"){
        if(!store.readPublication)throw new Error("The current published site cannot be verified in this workspace. Your edits are unchanged.");
        const publication=await store.readPublication();
        if(!publication)throw new Error("There is no verified published site to restore. Your edits are unchanged.");
        next=draftFromPublication(saved,publication);
      }
      recoveryIdentity?.assertCurrent();
      if(!mountedRef.current||request!==loadRequestRef.current||intent!==discardIntent.current||intent.editVersion!==editVersionRef.current||intent.revision!==workspaceRevisionRef.current||uploadBusyRef.current)return;
      stageDiscard(next);discardIntent.current=null;setDiscardChoice(false);
      setNotice(target==="saved"?"Unsaved website edits discarded. Your last saved draft is open; the live site is unchanged.":"The currently published website is staged as your draft. Choose Save to keep this reset privately. Nothing has been published.");
    }catch(error){if(mountedRef.current&&request===loadRequestRef.current)setError(errorMessage(error),true);}
    finally{operationRef.current=false;if(mountedRef.current)setBusy(false);}
  }
  async function restoreCloudRecovery(entry: CloudRecoveryEntry) {
    if (operationRef.current || !workspace || !mountedRef.current) return;
    operationRef.current = true; setBusy(true);
    try {
      const next = await recovery.cloud.restore(entry, workspace.revision);
      if (!mountedRef.current) return;
      recordDraft(next); setFormVersion(value => value + 1); setNotice("Restored Successfully");
    } catch (error) { if (mountedRef.current) setError(errorMessage(error), true); }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function dismissCloudRecovery(entry: CloudRecoveryEntry) {
    if (operationRef.current || !mountedRef.current) return;
    operationRef.current = true; setBusy(true);
    try { await recovery.cloud.dismiss(entry); if (mountedRef.current) setNotice("Removed Successfully"); }
    catch (error) { if (mountedRef.current) setError(errorMessage(error), true); }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  function requestSync() {
    if (operationRef.current || uploadBusyRef.current || loadingRef.current || syncInFlightRef.current) return;
    if (dirtyRef.current) setPendingSync(true);
    else void load();
  }
  function confirmRemove(title: string, description: string, onConfirm: () => void, action = "Remove") { setConfirmation({ title, description, action, onConfirm, danger: true }); }
  function editPage(id: string, change: (page: OwnerPage) => void) { edit(draft => { const page = draft.pages.find(page => page.id === id); if (page) change(page); }); }
  function createPage() {
    if (!content || operationRef.current || uploadBusyRef.current) return;
    if (!newTitle.trim()) { setNewPageError("Give your new page a name."); return; }
    const slugError = validatePageSlug(newSlug, content.pages);
    if (slugError) { setNewPageError(slugError); return; }
    try { const next = createCustomPage(content, { title: newTitle.trim(), slug: newSlug, showInNav: true }); const created = next.pages.find(page => !content.pages.some(existing => existing.id === page.id)); recordDraft(next); arrive({ section: "pages", pageId: created?.id }); setBuilderBrowsing(false); setShowPageManager(false); setAddingPage(false); setNotice(null); setIssues([]); }
    catch (error) { setNewPageError(error instanceof OwnerValidationError ? error.issues[0]?.message || "Check the page details." : errorMessage(error)); }
  }
  function commissionControl() {
    if (!content) return null;
    return <><OwnerSelect label="Commission status" value={content.site.commissionStatus} onChange={value => edit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} options={COMMISSION_STATUSES.map(status => ({ value: status, label: status }))} hint="Save Draft keeps this card private. Save Live updates only this availability and visitor note." /><Field label="A note for visitors" multiline value={content.site.statusNote} onChange={value => edit(draft => { draft.site.statusNote = value; })} placeholder="Let people know what to expect…" /></>;
  }
  function openAddPage() { setShowPageManager(false); setNewTitle(""); setNewSlug(""); setNewPageError(null); setAddingPage(true); }
  async function updateLiveShop() {
    if (!content || !workspace || !store.updateLiveShopVisibility || operationRef.current || uploadBusyRef.current || loading || !liveShopKnown) return;
    const target = content.site.showPremades;
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null);
    try {
      const saved = await store.updateLiveShopVisibility(target, workspace.revision);
      if (!mountedRef.current) return;
      // This is deliberately NOT a save or publish of the working draft.
      workspaceRevisionRef.current = saved.revision;
      setWorkspace(saved); setLiveShopVisibility(target);
      setNotice(`Live premade shop ${target ? "shown" : "hidden"}. All other draft edits remain private and unchanged.`);
      notifyPublicSitePublished();
    } catch (error) { if (mountedRef.current) setError(errorMessage(error)); }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function savePremadeDraft(item: OwnerPremade): Promise<boolean> {
    if (!content || !workspace || !store.savePremadeDraft || operationRef.current || uploadBusyRef.current || loading) return false;
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      const saved = await store.savePremadeDraft(item, workspace.revision);
      if (!mountedRef.current) return false;
      const selected = saved.draft.premades.find(entry => entry.id === item.id)!;
      // Only the acknowledged card replaces its local counterpart. All other
      // unsaved fields/listings remain on screen, with the dirty guard intact.
      const nextContent = { ...content, premades: content.premades.map(entry => entry.id === selected.id ? structuredClone(selected) : entry) };
      workspaceRevisionRef.current = saved.revision;
      dirtyRef.current = JSON.stringify(nextContent) !== JSON.stringify(saved.draft);
      setWorkspace(saved); setContent(nextContent);
      setNotice(`“${selected.name}” saved privately in Draft listings. Other unsaved edits are unchanged. The live store has not changed.`);
      return true;
    } catch (error) {
      if (mountedRef.current) {
        if (error instanceof OwnerValidationError) setIssues(error.issues);
        setError(errorMessage(error));
      }
      return false;
    } finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function saveSettingsCard(card: SettingsCardId, mode: "draft" | "live"): Promise<boolean> {
    if (!content || !workspace || operationRef.current || uploadBusyRef.current || loading || (mode === "live" && !store.publishSettingsCardLive)) return false;
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      const saved = mode === "live" ? await store.publishSettingsCardLive!(content, card, workspace.revision) : await store.saveSettingsCard(content, card, workspace.revision);
      if (!mountedRef.current) return false;
      const nextContent = applySettingsCard(content, saved.draft, card);
      workspaceRevisionRef.current = saved.revision;
      dirtyRef.current = JSON.stringify(nextContent) !== JSON.stringify(saved.draft);
      setWorkspace(saved); setContent(nextContent);
      setNotice(`${SETTINGS_CARD_LABELS[card]} saved ${mode === "live" ? "live" : "as a private draft"}. Other unsaved edits are unchanged.`);
      if (mode === "live") notifyPublicSitePublished();
      return true;
    } catch (error) { if (mountedRef.current) { setError(errorMessage(error)); if (error instanceof OwnerValidationError) setIssues(error.issues); } return false; }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function deletePremadeDraft(id: string): Promise<boolean> {
    if (!content || !workspace || operationRef.current || uploadBusyRef.current || loading) return false;
    if (!workspace.draft.premades.some(item => item.id === id)) {
      if (!content.premades.some(item => item.id === id && item.isDraft === true)) return false;
      edit(draft => { draft.premades = draft.premades.filter(item => item.id !== id); });
      setNotice("Unsaved listing draft discarded. Saved listings and the live shop are unchanged."); return true;
    }
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null);
    try {
      const saved = await store.deletePremadeDraft(id, workspace.revision);
      if (!mountedRef.current) return false;
      const nextContent = { ...content, premades: content.premades.filter(item => item.id !== id) };
      workspaceRevisionRef.current = saved.revision; dirtyRef.current = JSON.stringify(nextContent) !== JSON.stringify(saved.draft);
      setWorkspace(saved); setContent(nextContent); setNotice("Listing draft deleted. The live shop and its photos are unchanged."); return true;
    } catch (error) { if (mountedRef.current) setError(errorMessage(error)); return false; }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function publishPremade(item: OwnerPremade) {
    if (!content || !workspace || !store.publishPremadeLive || operationRef.current || uploadBusyRef.current || loading) return;
    const selected = { ...structuredClone(item), visible: true };
    delete selected.isDraft;
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      const saved = await store.publishPremadeLive(selected, workspace.revision);
      if (!mountedRef.current) return;
      // Install the acknowledged baseline, but retain every unrelated unsaved edit.
      const nextContent = { ...content, premades: content.premades.map(entry => entry.id === selected.id ? selected : entry) };
      workspaceRevisionRef.current = saved.revision;
      dirtyRef.current = JSON.stringify(nextContent) !== JSON.stringify(saved.draft);
      setWorkspace(saved); setContent(nextContent);
      setNotice(`“${selected.name}” was published to the store.${liveShopVisibility === false ? " The live shop is still hidden; turn it on separately when ready." : ""} Other draft edits remain private and unchanged.`);
      notifyPublicSitePublished();
    } catch (error) { if (mountedRef.current) setError(errorMessage(error)); }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  function requestPremadePublish(item: OwnerPremade) {
    setConfirmation({ title: `Publish “${item.name || "Untitled premade"}” to the store?`, description: "This saves and publishes only this listing and makes it visible. It does not publish unrelated page, photo, price, other listing, catalog-mode, or shop-visibility edits. If the live shop is hidden, this listing remains inaccessible until the shop is turned on separately. Payments are not connected.", action: "Publish to store", onConfirm: () => { void publishPremade(item); } });
  }
  function requestShopUpdate() {
    if (!content) return;
    setConfirmation({ title: `${content.site.showPremades ? "Show" : "Hide"} only the live premade shop?`, description: "This changes only the shop’s live visibility. It does not publish any new listings, photos, prices, page changes, or other draft work. Your unsaved edits remain in your workspace.", action: "Update live", onConfirm: () => { void updateLiveShop(); } });
  }

  const currentSection = sections.find(item => item.id === section)!;
  const activePages = content?.pages.filter(page => !page.trashedAt).sort((a, b) => a.order - b.order) ?? [];
  const trashedPages = content?.pages.filter(page => page.trashedAt).sort((a, b) => a.order - b.order) ?? [];
  const builderBuiltin = ({ home: "home", photos: "gallery", premades: "premades", settings: "contact", prices: "prices" } as const)[section as "home" | "photos" | "premades" | "settings" | "prices"];
  const currentPage = resolveWorkspacePage(activePages, section, pageId, builderBuiltin);
  useEffect(() => {
    if (!loading && content && section === "pages" && pageId && currentPage?.id !== pageId) navigationRef.current?.replace({ section: "pages" });
  }, [loading, content, section, pageId, currentPage?.id]);
  const previewPage = activePages.find(page => page.id === previewPageId) ?? currentPage;
  const livePreview = useLivePreview(content, currentPage?.id ?? activePages[0]?.id, setError, recoveryIdentity?.assertCurrent);
  const isBuilder = section === "pages";
  let pageManagement: ReactNode = null;
  let body: ReactNode = null;
  if (content && workspace) {
    if (section === "overview") body = <>
      <div className={styles.welcomeCard}><div><span className={styles.eyebrow}>A SPACE FOR TAYLOR</span><h2>Keep creating.<br />You got this!</h2><p>Your words, your photos, your creations, made with your paws. Try things out, save a draft, and share them when you’re ready.</p><a href={ownerDestinationHref({ section: "pages" })} className={styles.primary} onClick={event => navigate({ section: "pages" }, event)}>Manage my pages <span aria-hidden="true">→</span></a></div><div className={styles.welcomeArt} aria-hidden="true"><span className={styles.artWindow}><i /><i /><i /><OwnerBrandLogo className={styles.welcomeLogo} decorative /><em>Made by you.</em></span></div></div>
      <div className={styles.quickGrid}>{[{ id: "pages" as const, label: "Website pages", value: activePages.length, detail: "Organize your site" }, { id: "photos" as const, label: "Gallery photos", value: content.gallery.filter(item => item.visible).length, detail: "Show your latest work" }, { id: "premades" as const, label: "Premades in draft", value: content.premades.filter(item => item.visible).length, detail: "Manage your listings" }].map(item => <a href={ownerDestinationHref({ section: item.id })} className={styles.quickCard} key={item.id} onClick={event => navigate({ section: item.id }, event)}><div><Icon name={item.id} /><span>{item.label}</span></div><strong>{item.value}</strong><small>{item.detail}</small></a>)}</div>
      <div className={styles.hubLinks}>{[{ id: "requests" as const, title: "Commission Requests", text: "See who’s getting in touch" }, { id: "clients" as const, title: "Client Hub", text: "Manage clients and commissions" }, { id: "files" as const, title: "File Hub", text: "Manage your file connection" }].map(item => <a key={item.id} href={ownerDestinationHref({ section: item.id })} onClick={event => navigate({ section: item.id }, event)}><Icon name={item.id} /><span><strong>{item.title}</strong><small>{item.text}</small></span></a>)}</div>
      <div className={styles.twoCol}><Card title="Open for commissions?" description="Let visitors know when your books are open.">{commissionControl()}<SettingsCardActions card="availability" onSaveSettingsCard={saveSettingsCard} canSaveSettingsDraft={!busy && !uploadBusy && !loading && !!workspace} canSaveSettingsLive={!!store.publishSettingsCardLive && !busy && !uploadBusy && !loading && !!workspace} /></Card><Card title="Your changes, at your pace"><ol className={styles.steps}><li><span>1</span><div><strong>Make it yours</strong><p>Pick a section on the left and make your updates.</p></div></li><li><span>2</span><div><strong>Save your draft</strong><p>Save privately to your owner account, ready on your other devices.</p></div></li><li><span>3</span><div><strong>Share when you’re ready</strong><p>Preview as you work. Choose Publish live only when it’s ready for visitors.</p></div></li></ol><div className={styles.softNote}><strong>Salix is always here to help</strong><p>If you’re unsure or get stuck, please don’t hesitate to reach out using the helping paw.</p></div></Card></div>
    </>;
    if (section === "services") body = <><TaylorServices /><StudioConnections /><ServiceDisclosure title="Trello" defaultOpen={false}><TrelloStudio onDirtyChange={value=>{trelloDirtyRef.current=value;}} onBusyChange={value=>{trelloBusyRef.current=value;}} /></ServiceDisclosure><ServiceDisclosure title="PayPal" defaultOpen={false}><PayPalStudio onDirtyChange={value=>{paypalDirtyRef.current=value;}} onBusyChange={value=>{paypalBusyRef.current=value;}} /></ServiceDisclosure><ServiceDisclosure title="Email" defaultOpen={false}><EmailStudio onDirtyChange={value=>{serviceDirtyRef.current=value;}} onBusyChange={value=>{serviceBusyRef.current=value;}} /></ServiceDisclosure></>;
    if (section === "requests") body = <CommissionRequests onDirtyChange={value=>{serviceDirtyRef.current=value;}} onBusyChange={value=>{serviceBusyRef.current=value;}} />;
    if (section === "clients") body = <OwnerClientHub onDiscardReady={registerClientHubDiscard} openNotification={hubNotification} onDirtyChange={value => { clientHubDirtyRef.current = value; }} onBusyChange={registerClientHubBusy} />;
    if (section === "inventory") body = <OwnerInventory onDirtyChange={value => { inventoryDirtyRef.current = value; }} onBusyChange={value => { inventoryBusyRef.current = value; }} />;
    if (section === "files") body = <TemporaryFileHub />;
    pageManagement = <div className={styles.pageManagement}>
      <div className={`${styles.sectionActions} ${styles.pageManagementActions}`}><div className={styles.segmented}><button type="button" aria-pressed={!showTrash} onClick={() => setShowTrash(false)}>Pages <span>{activePages.length}</span></button><button type="button" aria-pressed={showTrash} aria-label={`View page Trash (${trashedPages.length})`} title="View page Trash" onClick={() => setShowTrash(true)}><TrashIcon /><span aria-hidden="true">{trashedPages.length}</span></button></div><button type="button" className={styles.primary} onClick={openAddPage}>Add Page</button></div>
      <Card><div className={styles.pageList}>{(showTrash ? trashedPages : activePages).map((page, index) => <div key={page.id} className={styles.pageRow}><div className={styles.pageIdentity}><strong>{page.title}</strong><small>/{page.slug}{page.kind === "custom" ? " · Your page" : " · Original page"}</small></div>{showTrash ? <button type="button" className={styles.secondary} onClick={() => mutate(draft => restorePage(draft, page.id))}>Restore page</button> : <><span className={`${styles.badge} ${page.availability !== "hidden" && getPageNavPlacement(page) !== "unlisted" ? styles.badgeVisible : ""}`}>{page.availability === "hidden" ? "Hidden · 404" : getPageNavPlacement(page) === "more" ? content.site.moreEnabled ? "More dropdown" : "More dropdown · off" : getPageNavPlacement(page) === "unlisted" ? "Unlisted" : "Top bar"}</span><MoveButtons label={page.title} index={index} length={activePages.length} onMove={direction => mutate(draft => movePage(draft, page.id, direction < 0 ? "up" : "down"))} /><button type="button" className={styles.secondary} onClick={() => { setShowPageManager(false); arrive({ section: "pages", pageId: page.id }); setBuilderBrowsing(false); }}>Edit</button><button type="button" className={styles.textButton} onClick={() => editPage(page.id, target => { target.showInNav = getPageNavPlacement(target) === "unlisted"; target.navPlacement = target.showInNav ? "main" : "unlisted"; })}>{getPageNavPlacement(page) !== "unlisted" ? "Hide from menu" : "Show in menu"}</button>{page.builtinKey !== "home" && <button type="button" data-owner-button className={`${buttons.button} ${buttons.secondary} ${buttons.icon}`} aria-label={`Move page to Trash: ${page.title}`} title={`Move page to Trash: ${page.title}`} onClick={() => confirmRemove(`Move “${page.title}” to trash?`, "This removes the page and its menu link from your next preview. You can restore it from Trash at any time.", () => mutate(draft => trashPage(draft, page.id)), "Move to trash")}><TrashIcon /></button>}</>}</div>)}</div>{showTrash && !trashedPages.length && <div className={styles.empty}><h3>Your trash is empty.</h3><p>Pages you remove will stay here so you can bring them back.</p></div>}</Card><p className={styles.help}>Unlisted pages stay available by their page address unless Page settings also marks them Hidden (404). Use Edit → Page settings to choose Top bar, More, Unlisted, or address availability. Moving a page to Trash removes it from your next preview. The home page always stays.</p>
    </div>;
    if (section === "commissionForm") body = <CommissionFormEditor content={content} onEdit={edit} busy={busy || uploadBusy} onSaveDraft={() => saveSettingsCard("commission-form", "draft")} onPublishLive={store.publishSettingsCardLive ? () => saveSettingsCard("commission-form", "live") : undefined} />;
    if (section === "prices") body = <OwnerPricesManager content={content} onEdit={edit} onRemove={confirmRemove} disabled={busy || uploadBusy} />;
    if (section === "photos") body = <PhotoGalleryManager content={content} onEdit={edit} onRemove={confirmRemove} onSavePhotos={() => {setPublished(false);setSaveChoice(true);}} />;
    if (section === "premades") body = <PremadesManager creationBlocked={busy || uploadBusy || loading} content={content} onEdit={edit} onRemove={confirmRemove} onSavePremadeDraft={savePremadeDraft} onDeletePremadeDraft={deletePremadeDraft} canDeletePremadeDraft={!busy && !uploadBusy && !loading} canSavePremadeDraft={!!store.savePremadeDraft && !busy && !uploadBusy} onPublishPremade={requestPremadePublish} canPublishPremade={!!store.publishPremadeLive && liveShopKnown && liveShopVisibility !== null} liveShopVisibility={liveShopVisibility} liveShopKnown={liveShopKnown} liveShopReadError={liveShopReadError ?? (!store.readLiveShopVisibility ? "Live shop controls are not connected in this workspace." : null)} onRetryLiveShop={() => { setLiveShopReadError(null); setLiveShopKnown(false); setLiveShopRetry(value => value + 1); }} canUpdateLiveShop={!!store.updateLiveShopVisibility && liveShopKnown} onUpdateLiveShop={requestShopUpdate} />;
    if (section === "home") body = <HomePageManager content={content} onEdit={edit} onRemove={confirmRemove} />;
    if (section === "settings") body = <ContactSettingsManager invoiceSettings={<InvoiceBusinessSettings onDirtyChange={value => { serviceDirtyRef.current = value; }} onBusyChange={value => { serviceBusyRef.current = value; }} />} onEditCommissionForm={() => arrive({ section: "commissionForm" })} onSaveSettingsCard={saveSettingsCard} canSaveSettingsDraft={!busy && !uploadBusy && !loading} canSaveSettingsLive={!!store.publishSettingsCardLive && !busy && !uploadBusy && !loading} content={content} onEdit={edit} onRemove={confirmRemove} userEmail={userEmail} onSync={requestSync} constructionSettings={<ConstructionModeSettings store={store} disabled={busy || uploadBusy || loading} beginUpdate={() => {
      if (operationRef.current || uploadBusyRef.current || loadingRef.current) return false;
      operationRef.current = true; ++loadRequestRef.current; setBusy(true); setSyncing(false); return true;
    }} endUpdate={() => { operationRef.current = false; if (mountedRef.current) setBusy(false); }} />} />;
    if (isBuilder && currentPage) body = <OwnerVisualBuilder frameClipboard={frameClipboard} clipboardScopeKey={clipboardScopeKey} workspaceMode={fullPageBuilder} draftNameControl={<Field label="Draft name" value={draftName} onChange={value => { if (!operationRef.current && !uploadBusyRef.current && !loading) setDraftName(value); }} readOnly={busy || uploadBusy || loading} placeholder="Optional name for your next saved draft" />} onRequestDiscard={requestBuilderDiscard} canUndo={!historyBlocked && historyState.canUndo} canRedo={!historyBlocked && historyState.canRedo} onUndo={() => travelDraftHistory("undo")} onRedo={() => travelDraftHistory("redo")} onSaveDraft={() => { void saveDraft(); }} onSave={() => { setPublished(false); setSaveChoice(true); }} saveBusy={busy || uploadBusy || loading} draftSaveStatus={recoveryIdentity ? recovery.cloud.enabled ? recovery.cloud.problem ?? recovery.cloud.status : recovery.problem ?? recovery.status : undefined} onPopOut={livePreview.open} onEditCommissionForm={() => { setShowPreview(false); arrive({ section: "commissionForm" }); }} key={`${section}-${currentPage.id}-${formVersion}`} browsing={builderBrowsing} onBrowsingChange={changeBuilderMode} content={content} page={currentPage} onEdit={edit} onPageChange={page => { if (!operationRef.current && !uploadBusy) { arrive({ section: "pages", pageId: page.id }); } }} onManagePages={() => setShowPageManager(true)} onAddPage={openAddPage} onPrices={() => navigate({ section: "prices" })} onRemove={confirmRemove} liveShopVisibility={liveShopVisibility} liveShopKnown={liveShopKnown} liveShopReadError={liveShopReadError ?? (!store.readLiveShopVisibility ? "Live shop controls are not connected in this workspace." : null)} onRetryLiveShop={() => { setLiveShopReadError(null); setLiveShopKnown(false); setLiveShopRetry(value => value + 1); }} canUpdateLiveShop={!!store.updateLiveShopVisibility && liveShopKnown} onUpdateLiveShop={requestShopUpdate} uploadBusy={uploadBusy} />;
  }

  return <OwnerUploadProvider onBusyChange={reportUploadBusy}><div style={fullPageBuilder?{"--owner-toolbar-height":`${toolbarHeight}px`} as CSSProperties:undefined} className={`${styles.portal} ${fullPageBuilder ? styles.fullPageBuilder : ""}`} data-full-page-builder={fullPageBuilder || undefined} data-owner-portal data-color-mode={fullPageBuilder ? editorColorMode : colorMode} data-workspace-mode={mode}>
    {!fullPageBuilder && <aside className={styles.sidebar}><a href={ownerDestinationHref({ section: "overview" })} className={styles.ownerBrand} aria-label="Taylor’s Space overview" onClick={event => navigate({ section: "overview" }, event)}><OwnerBrandLogo decorative /><small>{whimsyIdentity.space.toUpperCase()}</small></a><p className={styles.sidebarLabel}>YOUR WEBSITE</p><nav aria-label="Taylor’s Space" className={styles.sideNav}>{sections.filter(item => item.id !== "services").map(item => <a href={item.id === "pages" ? "https://build.taylormadecreations.dog" : ownerDestinationHref({ section: item.id })} target={item.id === "pages" ? "_blank" : undefined} rel={item.id === "pages" ? "noopener noreferrer" : undefined} key={item.id} aria-current={section === item.id ? "page" : undefined} aria-disabled={busy || uploadBusy || loading || !content} onClick={event => { if (item.id !== "pages") navigate({ section: item.id }, event); }}><Icon name={item.id} /><span>{item.label}</span>{section === item.id && <span className={styles.navDot} />}</a>)}<button type="button" className={styles.invoiceNav} aria-haspopup="dialog" aria-expanded={showInvoices} disabled={busy || uploadBusy || loading || !content} onClick={() => {
      if (trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current || inventoryDirtyRef.current || inventoryBusyRef.current) { setNavigationWarning("Finish or cancel your current changes before opening invoices."); return; }
      setShowInvoices(true);
    }}><Icon name="prices" /><span>Invoice</span></button></nav><div className={styles.sidebarBottom}><a href="/taylor/preview" target="_blank" rel="noreferrer">View saved site <span aria-hidden="true">↗</span></a><div className={styles.sidebarUtilities}><a href={ownerDestinationHref({ section: "services" })} className={styles.serviceTab} aria-current={section === "services" ? "page" : undefined} aria-disabled={busy || uploadBusy || loading || !content} onClick={event => navigate({ section: "services" }, event)}><Icon name="settings" />System status</a><HelpButton onFeedback={({ kind, message }) => { if (kind === "error") { setError(message, true); setNotice(null); } else { setNotice(message); setError(null); } window.scrollTo({ top: 0, behavior: "smooth" }); }} /><button type="button" className={styles.signOutButton} disabled={busy || uploadBusy} onClick={requestSignOut}>Sign out</button></div></div></aside>}
    <div className={styles.workspace}><header ref={toolbarRef} className={styles.topbar}>{fullPageBuilder && <strong className={styles.workspaceBrand}>Beta builder</strong>}<div className={styles.saveState}><span className={dirty ? styles.unsavedDot : styles.savedDot} /><div><strong>Cloud Sync</strong><span>{signingOut ? "Signing out…" : loading ? "Opening your cloud workspace…" : uploadBusy ? "Uploading your photo…" : syncing ? "Checking saved cloud draft…" : busy ? "Saving your changes…" : dirty ? "You have unsaved changes" : error && !workspace ? "Cloud draft unavailable" : lastCheckedAt ? `Cloud checked · ${timeLabel(lastCheckedAt, true)}` : "Not checked yet"}</span>{workspace && <small className={styles.recoveryStatus}>{workspace.updatedAt ? `Website draft saved · ${timeLabel(workspace.updatedAt)}` : "No cloud draft saved yet"}</small>}{recoveryIdentity && <small className={styles.recoveryStatus}>{recovery.cloud.enabled ? recovery.cloud.problem ? "Cloud recovery needs attention" : recovery.cloud.status : recovery.problem ? "Browser recovery needs attention" : recovery.status}</small>}</div><button type="button" className={styles.syncButton} aria-label="Sync cloud draft" title="Check your saved cloud draft. Unsaved edits are protected." disabled={busy || syncing || uploadBusy || loading || !content} onClick={requestSync}><RefreshIcon /></button></div><div className={styles.topbarActions}>{fullPageBuilder ? <>
        {section !== "pages" && <button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={()=>navigate({section:"pages",pageId})}>Back to canvas</button>}
        <button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={()=>setShowFiles(true)}>Files</button>
        <details ref={moreMenuRef} className={styles.builderMore}><summary className={styles.secondary}>More</summary><div>
          <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={()=>setShowDrafts(true)}>Drafts</button>
          <button type="button" className={styles.secondary} onClick={()=>setEditorColorMode(value=>value==="dark"?"light":"dark")}>{editorColorMode==="dark"?"Light editor":"Dark editor"}</button>
          {WEBSITE_WORKSPACE === "beta" && <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !workspace} onClick={()=>setImportIntent({editVersion:editVersionRef.current,revision:workspaceRevisionRef.current})}>Copy main design</button>}
          {recoveryIdentity && <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={()=>{recovery.refresh();void recovery.cloud.refresh();setShowRecovery(true);}}>Help & recovery</button>}
        </div></details>
        {uploadBusy && <OwnerUploadCancel className={styles.secondary}/>}
        <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={()=>{setPreviewPageId(null);setPreviewBrowsing(true);setShowPreview(true);}}>Preview</button>
        <button type="button" className={styles.primary} disabled={busy || uploadBusy || loading || !content} onClick={()=>{setPublished(false);setSaveChoice(true);}}>Save</button>
        <button type="button" className={`${styles.secondary} ${styles.builderSignOut}`} disabled={busy || uploadBusy} onClick={requestSignOut}>Sign out</button>
      </> : <>{fullPageBuilder && <><strong>Beta builder</strong>{WEBSITE_WORKSPACE === "beta" && <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !workspace} onClick={()=>setImportIntent({editVersion:editVersionRef.current,revision:workspaceRevisionRef.current})}>Copy main design</button>}{section !== "pages" && <button type="button" className={styles.secondary} onClick={() => navigate({ section: "pages", pageId })}>Back to canvas</button>}<button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => navigate({ section: "files" })}>Files</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={requestSignOut}>Sign out</button></>}{recoveryIdentity && <button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} aria-label={`Workspace help and draft recovery${recovery.candidates.length ? `, ${recovery.candidates.length} recovery copies` : ""}`} title="Workspace help and draft recovery" onClick={() => { recovery.refresh(); void recovery.cloud.refresh(); setShowRecovery(true); }}><span aria-hidden="true">?</span></button>}{!fullPageBuilder && recoveryIdentity && <HubNotificationBell owner accountKey={recoveryIdentity.ownerUid} onNavigateIntake={() => {
        if ((dirtyRef.current && !recovery.flush()) || invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current || inventoryDirtyRef.current || inventoryBusyRef.current || operationRef.current || uploadBusyRef.current || loadingRef.current) { setNavigationWarning("Save or finish your current changes before opening a request."); return false; }
        navigate({ section: "requests" });
        return true;
      }} onNavigate={item => { if ((dirtyRef.current && !recovery.flush()) || invoiceDirtyRef.current || invoiceBusyRef.current || trelloDirtyRef.current || trelloBusyRef.current || paypalDirtyRef.current || paypalBusyRef.current || serviceDirtyRef.current || serviceBusyRef.current || clientHubDirtyRef.current || clientHubBusyRef.current || inventoryDirtyRef.current || inventoryBusyRef.current || operationRef.current || uploadBusyRef.current || loadingRef.current) { setNavigationWarning("Save or finish your current changes before opening a Client Hub notification."); return; } setHubNotification(item); navigate({ section: "clients" }); }} />}{fullPageBuilder ? <button type="button" className={styles.secondary} onClick={()=>setEditorColorMode(value=>value==="dark"?"light":"dark")}>{editorColorMode==="dark"?"Light editor":"Dark editor"}</button> : <ColorModeToggle scope="owner" />}{uploadBusy && <OwnerUploadCancel className={styles.secondary} />}<button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={() => setShowDrafts(true)}>Drafts</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={() => { setPreviewPageId(null); setPreviewBrowsing(true); setShowPreview(true); }}>Preview</button><button type="button" className={styles.primary} disabled={busy || uploadBusy || loading || !content} onClick={() => {setPublished(false);setSaveChoice(true);}}>Save</button></>}</div></header>
      <div className={`${styles.content} ${isBuilder ? styles.builderContent : ""}`}><div className={styles.pageHeading} hidden={fullPageBuilder}><span className={styles.eyebrow}>{whimsyIdentity.space.toUpperCase()} / {section === "overview" ? "WELCOME BACK" : currentSection.label.toUpperCase()}</span><h1 className={section === "overview" && whimsyIdentity.identity === "Salix's Friend" ? styles.rareIdentity : undefined} ref={headingRef} tabIndex={-1}>{section === "overview" ? `Your site, made by ${whimsyIdentity.identity}.` : currentSection.title}</h1><p>{currentSection.description}</p></div>
      {!error && (notice === "Undone" || notice === "Redone") && <span className={styles.historyFeedback} role="status">{notice}</span>}
      {((notice && notice !== "Undone" && notice !== "Redone") || error) && <div key={`${noticeSequence}:${error ?? notice}`} data-transient-feedback={!error || !errorPersistent && !issues.length && !error.includes("another tab or device") || undefined} className={error ? styles.errorNotice : styles.successNotice} role={error ? "alert" : "status"}><button type="button" className={styles.dismissNotice} aria-label={error ? "Dismiss error" : "Dismiss notification"} onClick={() => { setError(null); setNotice(null); setIssues([]); }}><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg></button><strong>{error || notice}</strong>{issues.length > 0 && <ul>{issues.slice(0, 12).map((issue, index) => <li key={`${issue.path}-${index}`}>{friendlyPath(issue.path, content)}: {issue.message}</li>)}</ul>}{issues.length > 12 && <p>And {issues.length - 12} more details. Fix these first, then try saving again.</p>}{error?.includes("another tab or device") && <button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setConfirmation({ title: "Reload the saved draft?", description: "This replaces the unsaved edits in this tab with the latest saved cloud draft. Keep editing if you need to copy anything from this version first.", action: "Reload saved draft", onConfirm: () => { void load(true); } })}>Reload saved draft</button>}</div>}
      {recoveryIdentity && recovery.problem && <div className={styles.recoveryWarning} role="alert"><strong>Browser recovery needs attention.</strong><p>{recovery.problem}</p><button type="button" className={styles.secondary} onClick={() => { recovery.refresh(); void recovery.cloud.refresh(); setShowRecovery(true); }}>Review recovery</button></div>}
      {recoveryIdentity && recovery.cloud.problem && <div className={styles.recoveryWarning} role="alert"><strong>{recovery.cloud.status}</strong><p>{recovery.cloud.problem}</p><button type="button" className={styles.secondary} disabled={recovery.cloud.pending} onClick={() => { void recovery.cloud.checkpoint(); void recovery.cloud.refresh(); }}>Retry cloud recovery</button></div>}
      {loading ? <Card><p className={styles.loading}>Opening your private cloud draft…</p></Card> : !content ? <Card title="We couldn’t open your draft"><p>Your saved work has not been overwritten. Check your internet connection and owner access, then try again.</p><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={() => { void load(); }}>Try again</button></Card> : <fieldset disabled={busy || uploadBusy} className={styles.editor} key={formVersion}>{body}</fieldset>}
      <div className={styles.bottomNote}>{WEBSITE_WORKSPACE === "beta" ? "Beta drafts and preview stay private. Publishing here does not change the main site." : "Drafts stay private. Publish live updates content; explicit live settings control visibility."}</div></div>
    </div>
    {importIntent && WEBSITE_WORKSPACE === "beta" && <WebsiteImportDialog onClose={()=>setImportIntent(null)} acquireLock={()=>{if(operationRef.current||uploadBusyRef.current||loadingRef.current||!mountedRef.current||importIntent.editVersion!==editVersionRef.current||importIntent.revision!==workspaceRevisionRef.current)throw Error("This beta draft changed. Close this review and try again; your edits are still here.");recoveryIdentity?.assertCurrent();const token={};importLock.current=token;operationRef.current=true;setBusy(true);return()=>{if(importLock.current===token){importLock.current=null;operationRef.current=false;if(mountedRef.current)setBusy(false);}};}} onStage={next=>{if(!mountedRef.current||operationRef.current||uploadBusyRef.current||loadingRef.current||importIntent.editVersion!==editVersionRef.current||importIntent.revision!==workspaceRevisionRef.current)throw Error("This beta draft changed. No copied design was applied.");recoveryIdentity?.assertCurrent();edit(draft=>{for(const key of Object.keys(draft))delete (draft as unknown as Record<string,unknown>)[key];Object.assign(draft,structuredClone(next));});setNotice("Main design copied into your beta editor. Undo restores the previous edits. Nothing was saved or published.");}} />}
    {showFiles && fullPageBuilder && <CloudFileDialog manager onClose={()=>{if(!uploadBusyRef.current)setShowFiles(false);}}/>}
    {showInvoices && <InvoiceWorkspace onClose={() => { setShowInvoices(false); invoiceDirtyRef.current = false; invoiceBusyRef.current = false; }} onBusyChange={registerInvoiceBusy} onDirtyChange={registerInvoiceDirty} />}
    {navigationWarning && <Dialog title="Stay here for a moment" onClose={() => setNavigationWarning(null)} actions={<><button type="button" className={styles.secondary} disabled={!clientHubCanDiscard || clientHubIsBusy || busy || uploadBusy} onClick={() => { if (operationRef.current || clientHubBusyRef.current || !clientHubDiscardRef.current) return; clientHubDiscardRef.current(); setNavigationWarning(null); }}>Discard unsaved work</button><button type="button" className={styles.secondary} onClick={() => setNavigationWarning(null)}>Back to my work</button></>}><p role="alert">{navigationWarning}</p><p>Your work is still here. Nothing has been discarded.</p>{!clientHubCanDiscard && <p>Return to your work to finish or cancel the current action. Pending or unconfirmed changes cannot be discarded here.</p>}</Dialog>}
    {showPageManager && <Dialog wide title="Manage your website pages" onClose={() => setShowPageManager(false)} actions={<button type="button" className={styles.primary} onClick={() => setShowPageManager(false)}>Back to builder</button>}>{pageManagement}</Dialog>}
    {showRecovery && recoveryIdentity && <Dialog title="Workspace help & draft recovery" wide onClose={() => setShowRecovery(false)} actions={<button type="button" className={styles.secondary} onClick={() => setShowRecovery(false)}>Close</button>}>
      <p className={styles.helpPlaceholder}><span aria-disabled="true">Ask Salix for Help</span><small>Email help coming soon</small></p>
      <details><summary>How this workspace saves your work</summary><p>Save as Draft stores changes privately in your owner account. Preview shows current edits without saving. Publish live changes the website, never Construction Mode. Cloud Sync checks your saved draft without silently replacing unsaved work. Browser-local recovery is separate and does not publish or save a cloud draft. Accepted cloud copies retain their referenced File Hub media for the recovery period; external images remain controlled by their host. A full-storage error stops new checkpoints without erasing older copies.</p></details>
      {recovery.cloud.enabled && <><p>Private cloud recovery: drafts for 7 days, published sites for 18 calendar months. Restore opens an editable copy; Save draft and Publish live remain separate.</p><p className={styles.help}>Expired copies stop appearing. Storage is bounded; permanent cleanup requires separate approval.</p><p role="status">{recovery.cloud.status}</p>{recovery.cloud.problem && <p className={styles.errorNotice} role="alert">{recovery.cloud.problem} <button type="button" className={styles.secondary} disabled={recovery.cloud.pending} onClick={() => { void recovery.cloud.checkpoint(); void recovery.cloud.refresh(); }}>Retry recovery</button></p>}<h3>Cloud recovery</h3>{!recovery.cloud.entries.length && <p>No eligible cloud copies found. <button type="button" className={styles.secondary} onClick={() => { void recovery.cloud.refresh(); }}>Refresh recovery</button></p>}<div className={styles.recoveryList}>{recovery.cloud.entries.map(entry => <article key={entry.id}><div><strong>{entry.kind === "published" ? "Published site" : "Draft"} · {new Date(entry.createdAt).toLocaleString()}</strong><small>Revision {entry.cloudRevision} · Available until {new Date(entry.expiresAt).toLocaleDateString()}</small></div><button type="button" className={styles.secondary} onClick={() => { setShowRecovery(false); setConfirmation({title:"Restore this copy?",description:"This replaces the edits in this tab. Review it before choosing Save draft or Publish live. Other devices and the live site stay unchanged.",action:"Restore",onConfirm:() => { void restoreCloudRecovery(entry); }}); }}>Restore</button><button type="button" className={styles.textButton} aria-label="Remove cloud recovery copy" title="Remove from recovery list" onClick={() => { setShowRecovery(false); setConfirmation({title:"Remove this recovery copy?",description:"This removes the copy from recovery access. Retained bytes and media are not permanently deleted. Your working draft and live site stay unchanged.",action:"Remove copy",danger:true,onConfirm:() => { void dismissCloudRecovery(entry); }}); }}><TrashIcon /></button></article>)}</div></>}
      <h3>Browser-local fallback</h3><p>Copies on this device are a separate fallback, not encrypted cloud storage. Sign out on shared devices; if local cleanup fails, clear this site’s browser data.</p>
      <p className={styles.help}>Available for 7 days, subject to browser storage limits. Restoring does not save or publish.</p>
      <p role="status">{recovery.problem ?? recovery.status}</p>
      {!recovery.candidates.length && <p>No other eligible recovery copies were found in this browser.</p>}
      {recovery.unavailable.length > 0 && <p>{recovery.unavailable.length} expired or unreadable recovery copies are not eligible to restore. <button type="button" className={styles.textButton} onClick={() => { setShowRecovery(false); setConfirmation({ title: "Clear unavailable recovery copies?", description: "Remove only the reviewed expired or unreadable copies in this owner account’s browser storage. Active eligible copies, cloud drafts, and live content are unchanged.", action: "Clear unavailable copies", danger: true, onConfirm: () => { try { recovery.clearUnavailable(); } catch (error) { setError(errorMessage(error), true); } } }); }}>Review cleanup</button></p>}
      <div className={styles.recoveryList}>{recovery.candidates.map(candidate => <article key={candidate.key}>
        <div><strong>{new Date(candidate.record.updatedAt).toLocaleString()}</strong><small>Based on cloud revision {candidate.record.cloudRevision}{candidate.record.cloudRevision !== workspace?.revision ? " · differs from the currently open cloud draft" : ""}</small></div>
        <button type="button" className={styles.secondary} onClick={() => { setShowRecovery(false); setConfirmation({ title: "Restore this local recovery?", description: `This replaces the edits in this tab only. ${candidate.record.cloudRevision !== workspace?.revision ? "It was based on a different cloud revision. Review all changes carefully before any explicit cloud save. " : ""}The current cloud revision remains the optimistic save basis; nothing is saved or published by restoring.`, action: "Restore locally", onConfirm: () => { try { const next = recovery.restore(candidate); dirtyRef.current = true; editVersionRef.current++; setContent(next); setFormVersion(value => value + 1); setNotice("Restored Successfully"); } catch (error) { setError(errorMessage(error), true); } } }); }}>Restore</button>
        <button type="button" className={styles.textButton} aria-label="Discard local recovery copy" title="Discard local recovery copy" onClick={() => { setShowRecovery(false); setConfirmation({ title: "Discard this recovery copy?", description: "Only this exact browser-local copy is removed. If its original tab is still open, that tab must save a cloud draft before leaving. Cloud and live content are unchanged.", action: "Discard recovery", danger: true, onConfirm: () => { try { recovery.discard(candidate); } catch (error) { setError(errorMessage(error), true); } } }); }}><TrashIcon /></button>
      </article>)}</div>
    </Dialog>}
    {showDrafts && content && <NamedDraftsDialog store={store} content={content} dirty={dirty} onClose={() => setShowDrafts(false)} onSaveCurrent={async () => !!await saveDraft()} onLoad={(next, name) => { if (operationRef.current || uploadBusyRef.current) return; dirtyRef.current = true; editVersionRef.current++; setContent(next); setFormVersion(value => value + 1); arrive({ section: "pages" }); setNotice(`Loaded “${name}” into your builder. Your live site has not changed.`); setError(null); setIssues([]); }} />}
    {pendingSync && <Dialog title="Sync with unsaved changes?" dismissDisabled={busy} onClose={() => { if (!busy) setPendingSync(false); }} actions={<><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPendingSync(false)}>Cancel</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={async () => { if (await load(true)) setPendingSync(false); }}>Reload saved draft</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved && mountedRef.current && await load()) setPendingSync(false); }}>Save draft & sync</button></>}><p>Your edits are only in this tab. Save them privately before syncing, or choose Reload saved draft to discard these edits and open the cloud version. Cancel keeps everything as it is.</p><p className={styles.help}>Nothing here publishes your website. A newer cloud revision will stop the save rather than overwrite another device’s work.</p>{error && <p className={styles.errorNotice} role="alert">{error}</p>}</Dialog>}
    {promotionIntent && recoveryIdentity && store.websitePromotion && <WebsitePromotionDialog request={store.websitePromotion} session={recoveryIdentity} target={promotionIntent.target} revisedSource={promotionIntent.revision} assertSourceCurrent={revision=>{recoveryIdentity.assertCurrent();if(!mountedRef.current||!promotionIntent||revision!==promotionIntent.revision||workspaceRevisionRef.current!==revision||editVersionRef.current!==promotionIntent.editVersion||dirtyRef.current)throw new Error("The saved beta draft changed. Resolve this operation, then review the current draft again.");}} onClose={closeLivePublication} onPublished={reconcileWebsitePublication} />}
    {saveChoice && <Dialog title="Save your changes" dismissDisabled={busy} onClose={() => { if (!operationRef.current) setSaveChoice(false); }} actions={published ? <button type="button" className={styles.primary} onClick={()=>setSaveChoice(false)}>Close</button> : <><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setSaveChoice(false)}>Keep editing</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved && mountedRef.current) setSaveChoice(false); }}>Save draft</button><button type="button" className={styles.primary} disabled={busy || uploadBusy || !store.publishLive} onClick={() => void publishLive()}>{publishing ? "Publishing…" : WEBSITE_WORKSPACE === "beta" ? "Publish to beta" : "Publish live"}</button>{WEBSITE_WORKSPACE === "beta" && fullPageBuilder && store.websitePromotion && recoveryIdentity && <><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={()=>void reviewLivePublication()}>Publish Live…</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={()=>void reviewLivePublication("both")}>Publish to both…</button></>}</>}>{(publishing || published) && <div className={styles.publishProgress} role="status" aria-live="polite">{publishing ? <><span className={styles.publishSpinner} aria-hidden="true"/><strong>Publishing…</strong><span>Please keep this window open while we confirm the result.</span></> : <><svg className={styles.publishCheck} aria-hidden="true" viewBox="0 0 32 32"><path d="m7 16 6 6L25 10"/></svg><strong>Published!</strong><span>{WEBSITE_WORKSPACE === "beta" ? "Your protected beta preview is updated. The main website is unchanged." : "Your website changes are live."}</span></>}</div>}{error && <p className={styles.errorNotice} role="alert">{error}</p>}<p>{WEBSITE_WORKSPACE === "beta" ? "Save draft keeps these changes private. Publish to Beta updates only the protected test site. Publish Live saves this draft and opens a separate review and confirmation before changing the public website. Publish to both reviews this same draft for an atomic Beta and Live update." : "Save draft keeps these changes private. Publish live saves and publishes all current website changes, including the gallery."}</p></Dialog>}
    {showPreview && content && previewPage && <Dialog draggable wide maximizable title="Your draft preview" dismissDisabled={busy} onClose={() => { if (!busy) setShowPreview(false); }} actions={<><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={() => setShowPreview(false)}>Back to workspace</button></>}><p className={styles.help}>This is your current draft, including unsaved changes. Opening it does not save or publish anything.</p><div className={styles.dialogPreview} data-dialog-preview data-editable-preview><OwnerVisualBuilder frameClipboard={frameClipboard} clipboardScopeKey={clipboardScopeKey} workspaceMode={fullPageBuilder} draftNameControl={<Field label="Draft name" value={draftName} onChange={value => { if (!operationRef.current && !uploadBusyRef.current && !loading) setDraftName(value); }} readOnly={busy || uploadBusy || loading} placeholder="Optional name for your next saved draft" />} onRequestDiscard={requestBuilderDiscard} canUndo={!historyBlocked && historyState.canUndo} canRedo={!historyBlocked && historyState.canRedo} onUndo={() => travelDraftHistory("undo")} onRedo={() => travelDraftHistory("redo")} key={`preview-${formVersion}`} content={content} page={previewPage} onEdit={edit} onPageChange={page => setPreviewPageId(page.id)} onManagePages={() => { setShowPreview(false); setShowPageManager(true); }} onAddPage={() => { setShowPreview(false); openAddPage(); }} onPrices={() => { setShowPreview(false); arrive({ section: "prices" }); }} onRemove={confirmRemove} liveShopVisibility={liveShopVisibility} liveShopKnown={liveShopKnown} liveShopReadError={liveShopReadError} onRetryLiveShop={() => setLiveShopRetry(value => value + 1)} canUpdateLiveShop={!!store.updateLiveShopVisibility && liveShopKnown} onUpdateLiveShop={requestShopUpdate} uploadBusy={uploadBusy || busy} browsing={previewBrowsing} onBrowsingChange={setPreviewBrowsing} onEditCommissionForm={() => { setShowPreview(false); arrive({ section: "commissionForm" }); }} /></div>{workspace?.updatedAt && <p className={styles.help}>{fullPageBuilder ? <a href={`https://${process.env.NEXT_PUBLIC_TMC_BETA_PREVIEW_HOST || "beta.taylormadecreations.dog"}`} target="_blank" rel="noopener noreferrer">Open published beta preview ↗</a> : <a href="/taylor/preview" target="_blank" rel="noreferrer">Open saved draft in a new tab ↗</a>} · Unsaved edits stay here.</p>}</Dialog>}
    {addingPage && <Dialog title="Add a new page" onClose={() => setAddingPage(false)} actions={<><button type="button" className={styles.secondary} onClick={() => setAddingPage(false)}>Cancel</button><button type="button" className={styles.primary} onClick={createPage}>Create page</button></>}><p>Give it a name. You can add text, photos, and buttons next.</p><Field label="Page name" value={newTitle} onChange={value => { if (newSlug === slugifyTitle(newTitle)) setNewSlug(slugifyTitle(value)); setNewTitle(value); setNewPageError(null); }} placeholder="About the maker" required /><Field label="Page address" value={newSlug} onChange={value => { setNewSlug(value.toLowerCase()); setNewPageError(null); }} hint={fullPageBuilder ? `Beta page address after publishing: /${newSlug || "about-the-maker"}.` : `Private preview link: /taylor/preview/${newSlug || "about-the-maker"}.`} />{newPageError && <p className={styles.inlineError} role="alert">{newPageError}</p>}</Dialog>}
    {pending && <Dialog title="Save before moving on?" dismissDisabled={busy} onClose={() => { if (!busy) setPending(null); }} actions={<><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => { discard(); arrive(pending); setPending(null); }}>Discard changes</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPending(null)}>Keep editing</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (!mountedRef.current) return; if (saved) { arrive(pending); setPending(null); } else setPending(null); }}>Save and continue</button></>}><p>You have unsaved changes. Save them as a draft, or stay here and keep working.</p></Dialog>}
    {pendingSignOut && <Dialog title="Save before signing out?" dismissDisabled={busy} onClose={() => { if (!busy) setPendingSignOut(false); }} actions={<><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => { void signOut(); }}>Sign out without saving</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPendingSignOut(false)}>Keep editing</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved) await signOut(); else if (mountedRef.current) setPendingSignOut(false); }}>Save and sign out</button></>}><p>You have unsaved changes in this tab. Save them to your private cloud draft before signing out, or discard only these unsaved edits.</p><p className={styles.help}>Your saved cloud draft will stay in your account.</p></Dialog>}
    {discardChoice && <Dialog title="Discard website edits?" dismissDisabled={busy} onClose={()=>{if(!operationRef.current){discardIntent.current=null;setDiscardChoice(false);}}} actions={<><button type="button" className={styles.secondary} disabled={busy} onClick={()=>{if(!operationRef.current){discardIntent.current=null;setDiscardChoice(false);}}}>Keep editing</button><button type="button" className={styles.danger} disabled={busy||uploadBusy} onClick={()=>void confirmBuilderDiscard("saved")}>Discard to saved draft</button><button type="button" className={styles.danger} disabled={busy||uploadBusy||!store.readPublication} onClick={()=>void confirmBuilderDiscard("published")}>{WEBSITE_WORKSPACE === "beta" ? "Reset to published Beta site" : "Reset to published site"}</button></>}><p><strong>Saved draft:</strong> discard only unsaved website edits and return to the last explicitly saved draft.</p><p>{WEBSITE_WORKSPACE === "beta" && <><strong>Published Beta site:</strong> restores the published Beta snapshot, not the main Live site. Use Copy main design to bring the main design into this editor. </>}<strong>Published site:</strong> replace the working website with the current verified public version, including removing draft-only pages and listings from this working copy. The saved draft is unchanged until you choose Save.</p><p>Neither option publishes or changes invoices or client data. One Undo step keeps your previous working copy in this tab; older Undo history is cleared. Recovery follows its normal retention rules.</p>{busy&&<p role="status">Checking and restoring your selected version…</p>}{error&&<p role="alert" className={styles.errorNotice}>{error}</p>}</Dialog>}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)} actions={<><button type="button" className={styles.secondary} onClick={() => setConfirmation(null)}>Cancel</button><button type="button" className={confirmation.danger ? styles.danger : styles.primary} onClick={() => { confirmation.onConfirm(); setConfirmation(null); }}>{confirmation.action}</button>{confirmation.alternate&&<button type="button" className={styles.danger} onClick={confirmation.alternate.action}>{confirmation.alternate.label}</button>}</>}><p>{confirmation.description}</p></Dialog>}
  </div></OwnerUploadProvider>;
}

function friendlyPath(path: string, content: OwnerContent | null) {
  const page = path.match(/^pages\[(\d+)\]/);
  if (page && content) return `“${content.pages[Number(page[1])]?.title || "Page"}” ${path.includes("blocks") ? "content" : "details"}`;
  const photo = path.match(/^gallery\[(\d+)\]/);
  if (photo && content) return `Photo “${content.gallery[Number(photo[1])]?.name || "Untitled"}”`;
  const premade = path.match(/^premades\[(\d+)\]/);
  if (premade && content) return `Premade “${content.premades[Number(premade[1])]?.name || "Untitled"}”`;
  const labels: Record<string, string> = { "site.name": "Business name", "site.email": "Email address", "site.telegram": "Telegram username", "site.tiktok": "TikTok username", "site.twitch": "Twitch username", "site.discord": "Discord username", "site.statusNote": "Commission note", "site.commissionStatus": "Commission status", "home.title": "Home page heading", "home.image.src": "Home page photo", "home.image.alt": "Home photo description", "home.caption": "Home photo caption", "prices.intro": "Price introduction" };
  return labels[path] || (path.startsWith("prices") ? "Prices & options" : "Website content");
}
