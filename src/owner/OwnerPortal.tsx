"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { COMMISSION_STATUSES, getPageNavPlacement, createCustomPage, movePage, newOwnerId, restorePage, slugifyTitle, trashPage, validateOwnerContent, validatePageSlug, OwnerValidationError, type OwnerContent, type OwnerPage, type OwnerWorkspace, type OwnerPremade, type ValidationIssue } from "./model";
import type { OwnerStore } from "./storage";
import { Card, Dialog, Field, Icon, MoveButtons, OwnerSelect } from "./OwnerFields";
import { OwnerBrandLogo } from "./OwnerBrandLogo";
import { OwnerVisualBuilder } from "./OwnerVisualBuilder";
import { PhotoGalleryManager, PremadesManager, HomePageManager, ContactSettingsManager } from "./OwnerTemplateManagers";
import { OwnerUploadProvider, OwnerUploadCancel } from "./PhotoUpload";
import { NamedDraftsDialog } from "./NamedDraftsDialog";
import { SiteContentFrame } from "@/components/SiteContent";
import { notifyPublicSitePublished } from "@/components/PublicSiteContext";
import { HelpButton } from "./HelpButton";
import { TaylorServices } from "./TaylorServices";
import { TemporaryFileHub } from "./TemporaryFileHub";
import { CommissionRequests } from "./CommissionRequests";
import styles from "./OwnerPortal.module.css";
import { ColorModeToggle, useColorMode } from "@/components/ColorMode";
import { resolveWorkspacePage } from "./owner-workflows";

import { createOwnerNavigation, ownerDestinationHref, ownerDestinationFromUrl, type OwnerSection as Section, type OwnerDestination as Destination, type OwnerNavigationIntent } from "./owner-navigation";
type Confirmation = { title: string; description: string; action: string; onConfirm: () => void; danger?: boolean };
const sections: { id: Section; label: string; title: string; description: string }[] = [
  { id: "overview", label: "Overview", title: "Your site, made by you.", description: "A little update or something brand new — make it yours." },
  { id: "pages", label: "Website builder", title: "Your website. Your canvas.", description: "View your private draft, or choose Edit website to make changes. Your changes stay private until you publish." },
  { id: "prices", label: "Prices & options", title: "Prices & options", description: "Prepare commission prices, individual parts, and extras in your private draft." },
  { id: "photos", label: "Photos", title: "Your photo gallery", description: "Show off your work. The first photo in this list appears first on your gallery page." },
  { id: "premades", label: "Premades", title: "Your premades", description: "Create and organize listings, then choose which ones appear in your private preview." },
  { id: "home", label: "Home page", title: "Make a great first impression.", description: "Update the welcome visitors see when they first arrive." },
  { id: "requests", label: "Commission Requests", title: "Commission requests", description: "A private inbox for the people who want to create something with you." },
  { id: "clients", label: "Client Hub", title: "Your future client hub", description: "A space for your commission clients, when you’re ready to build it together." },
  { id: "files", label: "File Hub", title: "Your files, in one place", description: "A home for your photos, reference sheets, and project files." },
  { id: "services", label: "Service quick view", title: "Service quick view", description: "A private view of the services connected to Taylor’s Space." },
  { id: "settings", label: "Contact & settings", title: "Contact & settings", description: "Help people find you and let them know when commissions are available." },
];
const timeLabel = (date: string | null | undefined) => date ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
function reordered<T>(items: T[], index: number, direction: -1 | 1): T[] { const result = [...items]; const target = index + direction; if (target >= 0 && target < result.length) [result[index], result[target]] = [result[target], result[index]]; return result; }
function errorMessage(error: unknown) { const message = error instanceof Error ? error.message : "Please try again."; return message.includes("revision") || message.toLowerCase().includes("another tab") || message.toLowerCase().includes("conflict") ? "This draft changed in another tab or device. Your edits are still here. Reload the saved cloud draft before saving again, or keep this tab open while you review the other version." : message; }

function MoneyField({ label, value, onChange, optional = false }: { label: string; value: number | null; onChange: (value: number | null) => void; optional?: boolean }) {
  const [typed, setTyped] = useState<string | null>(null);
  return <label className={styles.field}><span>{label}</span><div className={styles.money}><span>$</span><input type="number" min="0" step="0.01" value={typed ?? (value === null ? "" : String(value))} onChange={event => { setTyped(event.target.value); onChange(event.target.value === "" ? optional ? null : 0 : Number(event.target.value)); }} onBlur={() => setTyped(null)} placeholder={optional ? "Optional" : "0"} /></div></label>;
}

export interface OwnerPortalProps {
  store: OwnerStore;
  mode: "cloud";
  userEmail: string;
  onSignOut: () => Promise<void>;
  initialSection?: Section;
  initialPageId?: string;
}

/** Only mounted by the authenticated gate; never creates a browser-local fallback. */
export default function OwnerPortal({ store, mode, userEmail, onSignOut, initialSection = "overview", initialPageId }: OwnerPortalProps) {
  const colorMode = useColorMode("owner");
  // A sign-out/sign-in can remount the gate after same-document navigation.
  // The current bookmark, rather than an older server entry prop, wins then.
  const [initialDestination] = useState<Destination>(() => (typeof window !== "undefined" ? ownerDestinationFromUrl(window.location.href) : null) ?? { section: initialSection, pageId: initialPageId });
  const [workspace, setWorkspace] = useState<OwnerWorkspace | null>(null);
  const [content, setContent] = useState<OwnerContent | null>(null);
  const [section, setSection] = useState<Section>(initialDestination.section);
  // Keep mode above the keyed page canvas so preview navigation never re-enters editing.
  const [builderBrowsing, setBuilderBrowsing] = useState(true);
  const [pageId, setPageId] = useState<string | undefined>(initialDestination.pageId);
  const [showTrash, setShowTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const uploadBusyRef = useRef(false);
  const loadingRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const editVersionRef = useRef(0);
  const workspaceRevisionRef = useRef(-1);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNoticeValue] = useState<string | null>(null);
  const [noticeSequence, setNoticeSequence] = useState(0);
  const setNotice = useCallback((value: string | null) => {
    setNoticeValue(value);
    if (value !== null) setNoticeSequence(sequence => sequence + 1);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [pending, setPending] = useState<OwnerNavigationIntent | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [saveChoice, setSaveChoice] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [showPageManager, setShowPageManager] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
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
  useEffect(() => { dirtyRef.current = dirty; });
  const reportUploadBusy = useCallback((value: boolean) => { uploadBusyRef.current = value; setUploadBusy(value); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 30_000);
    return () => clearTimeout(timer);
  }, [notice, noticeSequence, setNotice]);

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
  }, [store, setNotice]);
  useEffect(() => {
    mountedRef.current = true;
    loadingRef.current = true;
    const request = ++loadRequestRef.current;
    void store.load().then(saved => {
      if (mountedRef.current && request === loadRequestRef.current) {
        workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
        setWorkspace(saved); setContent(structuredClone(saved.draft));
      }
    }).catch(error => { if (mountedRef.current && request === loadRequestRef.current) setError(errorMessage(error)); })
      .finally(() => { if (mountedRef.current && request === loadRequestRef.current) { loadingRef.current = false; setLoading(false); } });
    return () => { mountedRef.current = false; };
  }, [store]);
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
  }, [store]);
  useEffect(() => {
    let active = true;
    if (store.readLiveShopVisibility) void store.readLiveShopVisibility().then(value => { if (active) { setLiveShopVisibility(value); setLiveShopKnown(true); setLiveShopReadError(null); } }).catch(() => { if (active) { setLiveShopKnown(false); setLiveShopReadError("Could not check the live shop. Your draft and live site have not been changed."); } });
    return () => { active = false; };
  }, [store, workspace?.revision, liveShopRetry]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || uploadBusyRef.current || operationRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = createOwnerNavigation(window, {
      blocked: () => operationRef.current || loadingRef.current || uploadBusyRef.current,
      dirty: () => dirtyRef.current,
      current: () => destinationRef.current,
      arrive: destination => {
        destinationRef.current = { section: destination.section, pageId: destination.pageId };
        setSection(destination.section); setPageId(destination.pageId); setShowTrash(false);
        window.setTimeout(() => { headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }, 0);
      },
      confirm: destination => setPending(destination),
      interrupted: () => setNotice("Please wait for the current save or upload to finish before changing sections."),
    });
    navigationRef.current = navigation;
    window.addEventListener("beforeunload", beforeUnload);
    return () => { navigation.dispose(); navigationRef.current = null; window.removeEventListener("beforeunload", beforeUnload); };
  }, [setNotice]);

  function edit(change: (draft: OwnerContent) => void) {
    if (operationRef.current || loadingRef.current) return;
    dirtyRef.current = true; editVersionRef.current++;
    setContent(current => { if (!current) return current; const next = structuredClone(current); change(next); return next; });
    setNotice(null); setIssues([]);
  }
  function mutate(change: (draft: OwnerContent) => OwnerContent) {
    if (!content || operationRef.current || uploadBusyRef.current) return;
    try { const next = change(content); dirtyRef.current = true; editVersionRef.current++; setContent(next); setNotice(null); setError(null); setIssues([]); }
    catch (error) { if (error instanceof OwnerValidationError) { setIssues(error.issues); setError("Check the details below before making this change."); } else setError(errorMessage(error)); }
  }
  function changeBuilderMode(browsing: boolean) {
    if (operationRef.current || loadingRef.current || uploadBusyRef.current) return;
    setBuilderBrowsing(browsing);
  }
  function arrive(destination: OwnerNavigationIntent) { navigationRef.current?.arrive(destination); }
  function navigate(destination: Destination, event?: MouseEvent<HTMLAnchorElement>) {
    // Keep native links: keyboard activation is guarded, while modifiers,
    // middle click and Open in new tab leave this unsaved workspace untouched.
    if (event && (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault();
    if (operationRef.current || loadingRef.current || uploadBusyRef.current || navigationRef.current?.restoring) return;
    if (destination.section === section && destination.pageId === pageId) return;
    if (dirtyRef.current) setPending(destination); else arrive(destination);
  }
  async function saveDraft(): Promise<OwnerWorkspace | null> {
    if (!content || !workspace || operationRef.current || uploadBusyRef.current || loading) return null;
    const result = validateOwnerContent(content);
    if (!result.valid) { setIssues(result.issues); setError("A few details need your attention before this draft can be saved."); window.scrollTo({ top: 0, behavior: "smooth" }); return null; }
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      const saved = await store.saveDraft(content, workspace.revision);
      if (!mountedRef.current) return null;
      workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
      setWorkspace(saved); setContent(structuredClone(saved.draft));
      setNotice(`Private cloud draft saved at ${timeLabel(saved.updatedAt)}.`);
      return saved;
    } catch (error) { if (mountedRef.current) setError(errorMessage(error)); return null; }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function publishLive(): Promise<OwnerWorkspace | null> {
    if (!content || !workspace || !store.publishLive || operationRef.current || uploadBusyRef.current || loading) return null;
    const result = validateOwnerContent(content);
    if (!result.valid) { setIssues(result.issues); setError("A few details need your attention before this site can be published."); return null; }
    operationRef.current = true; ++loadRequestRef.current; setSyncing(false); setBusy(true); setError(null); setIssues([]);
    try {
      const saved = await store.publishLive(content, workspace.revision);
      if (!mountedRef.current) return null;
      workspaceRevisionRef.current = saved.revision; dirtyRef.current = false;
      setWorkspace(saved); setContent(structuredClone(saved.draft));
      setLiveShopVisibility(content.site.showPremades); setLiveShopKnown(true);
      setNotice("Your site is published. Saved listing drafts remain private.");
      notifyPublicSitePublished();
      return saved;
    } catch (error) { if (mountedRef.current) setError(errorMessage(error)); return null; }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  async function signOut() {
    if (operationRef.current || uploadBusyRef.current || !mountedRef.current) return;
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
    if (operationRef.current || uploadBusy) return;
    if (dirty) setPendingSignOut(true);
    else void signOut();
  }
  function discard() { if (workspace) { dirtyRef.current = false; editVersionRef.current++; setContent(structuredClone(workspace.draft)); setIssues([]); setError(null); setFormVersion(value => value + 1); } }
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
    try { const next = createCustomPage(content, { title: newTitle.trim(), slug: newSlug, showInNav: true }); const created = next.pages.find(page => !content.pages.some(existing => existing.id === page.id)); dirtyRef.current = true; editVersionRef.current++; setContent(next); arrive({ section: "pages", pageId: created?.id }); setBuilderBrowsing(false); setShowPageManager(false); setAddingPage(false); setNotice(null); setIssues([]); }
    catch (error) { setNewPageError(error instanceof OwnerValidationError ? error.issues[0]?.message || "Check the page details." : errorMessage(error)); }
  }
  function commissionControl() {
    if (!content) return null;
    return <><OwnerSelect label="Commission status" value={content.site.commissionStatus} onChange={value => edit(draft => { draft.site.commissionStatus = value as OwnerContent["site"]["commissionStatus"]; })} options={COMMISSION_STATUSES.map(status => ({ value: status, label: status }))} hint="Your live site changes only when you choose Publish live." /><Field label="A note for visitors" multiline value={content.site.statusNote} onChange={value => edit(draft => { draft.site.statusNote = value; })} placeholder="Let people know what to expect…" /></>;
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
  const isBuilder = section === "pages";
  let pageManagement: ReactNode = null;
  let body: ReactNode = null;
  if (content && workspace) {
    if (section === "overview") body = <>
      <div className={styles.welcomeCard}><div><span className={styles.eyebrow}>A SPACE FOR TAYLOR</span><h2>Keep creating.<br />You got this!</h2><p>Your words, your photos, your creations. Try things out, save a draft, and share them when you’re ready.</p><a href={ownerDestinationHref({ section: "pages" })} className={styles.primary} onClick={event => navigate({ section: "pages" }, event)}>Manage my pages <span aria-hidden="true">→</span></a></div><div className={styles.welcomeArt} aria-hidden="true"><span className={styles.spadeDisc}><Image src="/images/logo.png" width={50} height={50} alt="" unoptimized /></span><span className={styles.artWindow}><i /><i /><i /><OwnerBrandLogo className={styles.welcomeLogo} decorative /><em>Made by you.</em></span></div></div>
      <div className={styles.quickGrid}>{[{ id: "pages" as const, label: "Website pages", value: activePages.length, detail: "Organize your site" }, { id: "photos" as const, label: "Gallery photos", value: content.gallery.filter(item => item.visible).length, detail: "Show your latest work" }, { id: "premades" as const, label: "Premades in draft", value: content.premades.filter(item => item.visible).length, detail: "Manage your listings" }].map(item => <a href={ownerDestinationHref({ section: item.id })} className={styles.quickCard} key={item.id} onClick={event => navigate({ section: item.id }, event)}><div><Icon name={item.id} /><span>{item.label}</span></div><strong>{item.value}</strong><small>{item.detail} <span>→</span></small></a>)}</div>
      <div className={styles.hubLinks}>{[{ id: "requests" as const, title: "Commission Requests", text: "See who’s getting in touch" }, { id: "clients" as const, title: "Client Hub", text: "Plan your future client space" }, { id: "files" as const, title: "File Hub", text: "Manage your file connection" }].map(item => <a key={item.id} href={ownerDestinationHref({ section: item.id })} onClick={event => navigate({ section: item.id }, event)}><Icon name={item.id} /><span><strong>{item.title}</strong><small>{item.text}</small></span><span aria-hidden="true">→</span></a>)}</div>
      <div className={styles.twoCol}><Card title="Open for commissions?" description="Let visitors know when your books are open.">{commissionControl()}</Card><Card title="Your changes, at your pace"><ol className={styles.steps}><li><span>1</span><div><strong>Make it yours</strong><p>Pick a section on the left and make your updates.</p></div></li><li><span>2</span><div><strong>Save your draft</strong><p>Save privately to your owner account, ready on your other devices.</p></div></li><li><span>3</span><div><strong>Share when you’re ready</strong><p>Preview as you work. Choose Publish live only when it’s ready for visitors.</p></div></li></ol><div className={styles.softNote}><strong>Pick up where you left off</strong><p>After saving, sign in to this account on another device to continue working.</p></div></Card></div>
    </>;
    if (section === "services") body = <TaylorServices />;
    if (section === "requests") body = <CommissionRequests />;
    if (section === "clients") body = <Card title="A little room for what’s next" description="This is where your client hub will grow."><div className={styles.futureHub}><Icon name="clients" /><div><h3>Built around the way you work.</h3><p>Private project updates, shared reference files, and commission progress can live here once the client workflow is ready.</p><p>No client accounts or projects are connected yet. Nothing here is shared with customers.</p></div></div></Card>;
    if (section === "files") body = <TemporaryFileHub />;
    pageManagement = <>
      <div className={styles.sectionActions}><div className={styles.segmented}><button type="button" aria-pressed={!showTrash} onClick={() => setShowTrash(false)}>Pages <span>{activePages.length}</span></button><button type="button" aria-pressed={showTrash} onClick={() => setShowTrash(true)}>Trash <span>{trashedPages.length}</span></button></div><button type="button" className={styles.primary} onClick={openAddPage}>＋ Add a page</button></div>
      <Card><div className={styles.pageList}>{(showTrash ? trashedPages : activePages).map((page, index) => <div key={page.id} className={styles.pageRow}><span className={styles.pageIcon}><Icon name={page.builtinKey === "home" ? "home" : "pages"} /></span><div className={styles.pageIdentity}><strong>{page.title}</strong><small>/{page.slug}{page.kind === "custom" ? " · Your page" : " · Original page"}</small></div>{showTrash ? <button type="button" className={styles.secondary} onClick={() => mutate(draft => restorePage(draft, page.id))}>Restore page</button> : <><span className={`${styles.badge} ${page.availability !== "hidden" && getPageNavPlacement(page) !== "unlisted" ? styles.badgeVisible : ""}`}>{page.availability === "hidden" ? "Hidden · 404" : getPageNavPlacement(page) === "more" ? content.site.moreEnabled ? "More dropdown" : "More dropdown · off" : getPageNavPlacement(page) === "unlisted" ? "Unlisted" : "Top bar"}</span><MoveButtons label={page.title} index={index} length={activePages.length} onMove={direction => mutate(draft => movePage(draft, page.id, direction < 0 ? "up" : "down"))} /><button type="button" className={styles.secondary} onClick={() => { setShowPageManager(false); arrive({ section: "pages", pageId: page.id }); setBuilderBrowsing(false); }}>Edit</button><button type="button" className={styles.textButton} onClick={() => editPage(page.id, target => { target.showInNav = getPageNavPlacement(target) === "unlisted"; target.navPlacement = target.showInNav ? "main" : "unlisted"; })}>{getPageNavPlacement(page) !== "unlisted" ? "Hide from menu" : "Show in menu"}</button>{page.builtinKey !== "home" && <button type="button" className={styles.dangerLink} onClick={() => confirmRemove(`Move “${page.title}” to trash?`, "This removes the page and its menu link from your next preview. You can restore it from Trash at any time.", () => mutate(draft => trashPage(draft, page.id)), "Move to trash")}>Trash</button>}</>}</div>)}</div>{showTrash && !trashedPages.length && <div className={styles.empty}><h3>Your trash is empty.</h3><p>Pages you remove will stay here so you can bring them back.</p></div>}</Card><p className={styles.help}>Unlisted pages stay available by their page address unless Page settings also marks them Hidden (404). Use Edit → Page settings to choose Top bar, More, Unlisted, or address availability. Moving a page to Trash removes it from your next preview. The home page always stays.</p>
    </>;
    if (section === "prices") body = <><Card title="Introduce your prices"><Field label="Introductory text" multiline value={content.prices.intro} onChange={value => edit(draft => { draft.prices.intro = value; })} /></Card>{content.prices.groups.map((group, groupIndex) => <Card key={group.id} title={group.title || "New price group"} action={<div className={styles.inlineActions}><MoveButtons label={group.title} index={groupIndex} length={content.prices.groups.length} onMove={direction => edit(draft => { draft.prices.groups = reordered(draft.prices.groups, groupIndex, direction); })} /><button type="button" className={styles.dangerLink} onClick={() => confirmRemove(`Remove “${group.title}”?`, "This removes the group and all its prices from this draft.", () => edit(draft => { draft.prices.groups = draft.prices.groups.filter(item => item.id !== group.id); }))}>Remove group</button></div>}><div className={styles.twoCol}><Field label="Group name" value={group.title} onChange={value => edit(draft => { draft.prices.groups[groupIndex].title = value; })} /><Field label="Short introduction" value={group.note} onChange={value => edit(draft => { draft.prices.groups[groupIndex].note = value; })} /></div><div className={styles.stack}>{group.items.map((item, index) => <div key={item.id} className={styles.priceRow}><div className={styles.priceFields}><Field label="Item name" value={item.name} onChange={value => edit(draft => { draft.prices.groups[groupIndex].items[index].name = value; })} /><MoneyField label="Starting price (USD)" value={item.price} onChange={value => edit(draft => { draft.prices.groups[groupIndex].items[index].price = value ?? 0; })} /><Field label="What is included?" value={item.detail} onChange={value => edit(draft => { draft.prices.groups[groupIndex].items[index].detail = value; })} /></div><div className={styles.rowEnd}><MoveButtons label={item.name} index={index} length={group.items.length} onMove={direction => edit(draft => { draft.prices.groups[groupIndex].items = reordered(draft.prices.groups[groupIndex].items, index, direction); })} /><button type="button" className={styles.dangerLink} onClick={() => confirmRemove(`Remove “${item.name}”?`, "This item will be removed from the price group in your draft.", () => edit(draft => { draft.prices.groups[groupIndex].items = draft.prices.groups[groupIndex].items.filter(line => line.id !== item.id); }))}>Remove item</button></div></div>)}</div><button type="button" className={styles.addButton} onClick={() => edit(draft => { draft.prices.groups[groupIndex].items.push({ id: newOwnerId("price"), name: "New item", price: 0, detail: "" }); })}>＋ Add a price</button></Card>)}<button type="button" className={styles.secondary} onClick={() => edit(draft => { draft.prices.groups.push({ id: newOwnerId("group"), title: "New group", note: "", items: [] }); })}>＋ Add a price group</button><div className={styles.twoCol}>{(["parts", "extras"] as const).map(key => <Card key={key} title={key === "parts" ? "Individual parts" : "Extras & add-ons"}>{content.prices[key].map((item, index) => <div key={item.id} className={styles.simplePrice}><div className={styles.twoCol}><Field label="Name" value={item.name} onChange={value => edit(draft => { draft.prices[key][index].name = value; })} /><MoneyField label="Price (USD)" value={item.price} onChange={value => edit(draft => { draft.prices[key][index].price = value ?? 0; })} /></div><div className={styles.rowEnd}><MoveButtons label={item.name} index={index} length={content.prices[key].length} onMove={direction => edit(draft => { draft.prices[key] = reordered(draft.prices[key], index, direction); })} /><button type="button" className={styles.dangerLink} onClick={() => confirmRemove(`Remove “${item.name}”?`, "This item will be removed from your draft.", () => edit(draft => { draft.prices[key] = draft.prices[key].filter(line => line.id !== item.id); }))}>Remove</button></div></div>)}<button type="button" className={styles.addButton} onClick={() => edit(draft => { draft.prices[key].push({ id: newOwnerId(key), name: key === "parts" ? "New part" : "New extra", price: 0 }); })}>＋ Add {key === "parts" ? "a part" : "an extra"}</button></Card>)}</div></>;
    if (section === "photos") body = <PhotoGalleryManager content={content} onEdit={edit} onRemove={confirmRemove} onSavePhotos={() => setSaveChoice(true)} />;
    if (section === "premades") body = <PremadesManager content={content} onEdit={edit} onRemove={confirmRemove} onSavePremadeDraft={savePremadeDraft} canSavePremadeDraft={!!store.savePremadeDraft && !busy && !uploadBusy} onPublishPremade={requestPremadePublish} canPublishPremade={!!store.publishPremadeLive && liveShopKnown && liveShopVisibility !== null} liveShopVisibility={liveShopVisibility} liveShopKnown={liveShopKnown} liveShopReadError={liveShopReadError ?? (!store.readLiveShopVisibility ? "Live shop controls are not connected in this workspace." : null)} onRetryLiveShop={() => { setLiveShopReadError(null); setLiveShopKnown(false); setLiveShopRetry(value => value + 1); }} canUpdateLiveShop={!!store.updateLiveShopVisibility && liveShopKnown} onUpdateLiveShop={requestShopUpdate} />;
    if (section === "home") body = <HomePageManager content={content} onEdit={edit} onRemove={confirmRemove} />;
    if (section === "settings") body = <ContactSettingsManager content={content} onEdit={edit} onRemove={confirmRemove} userEmail={userEmail} onSync={requestSync} />;
    if (isBuilder && currentPage) body = <OwnerVisualBuilder key={`${section}-${currentPage.id}`} browsing={builderBrowsing} onBrowsingChange={changeBuilderMode} content={content} page={currentPage} onEdit={edit} onPageChange={page => { if (!operationRef.current && !uploadBusy) { arrive({ section: "pages", pageId: page.id }); } }} onManagePages={() => setShowPageManager(true)} onAddPage={openAddPage} onPrices={() => navigate({ section: "prices" })} onRemove={confirmRemove} liveShopVisibility={liveShopVisibility} liveShopKnown={liveShopKnown} liveShopReadError={liveShopReadError ?? (!store.readLiveShopVisibility ? "Live shop controls are not connected in this workspace." : null)} onRetryLiveShop={() => { setLiveShopReadError(null); setLiveShopKnown(false); setLiveShopRetry(value => value + 1); }} canUpdateLiveShop={!!store.updateLiveShopVisibility && liveShopKnown} onUpdateLiveShop={requestShopUpdate} uploadBusy={uploadBusy} />;
  }

  return <OwnerUploadProvider onBusyChange={reportUploadBusy}><div className={styles.portal} data-owner-portal data-color-mode={colorMode} data-workspace-mode={mode}>
    <aside className={styles.sidebar}><a href={ownerDestinationHref({ section: "overview" })} className={styles.ownerBrand} aria-label="Taylor’s Space overview" onClick={event => navigate({ section: "overview" }, event)}><OwnerBrandLogo decorative /><small>TAYLOR’S SPACE</small></a><p className={styles.sidebarLabel}>YOUR WEBSITE</p><nav aria-label="Taylor’s Space" className={styles.sideNav}>{sections.filter(item => item.id !== "services").map(item => <a href={ownerDestinationHref({ section: item.id })} key={item.id} aria-current={section === item.id ? "page" : undefined} aria-disabled={busy || uploadBusy || loading || !content} onClick={event => navigate({ section: item.id }, event)}><Icon name={item.id} /><span>{item.label}</span>{section === item.id && <span className={styles.navDot} />}</a>)}</nav><div className={styles.sidebarBottom}><a href="/taylor/preview" target="_blank" rel="noreferrer">View saved site <span aria-hidden="true">↗</span></a><div className={styles.sidebarUtilities}><a href={ownerDestinationHref({ section: "services" })} className={styles.serviceTab} aria-current={section === "services" ? "page" : undefined} aria-disabled={busy || uploadBusy || loading || !content} onClick={event => navigate({ section: "services" }, event)}><Icon name="settings" />Service quick view</a><HelpButton onFeedback={({ kind, message }) => { if (kind === "error") { setError(message); setNotice(null); } else { setNotice(message); setError(null); } window.scrollTo({ top: 0, behavior: "smooth" }); }} /><button type="button" className={styles.signOutButton} disabled={busy || uploadBusy} onClick={requestSignOut}>Sign out</button></div><span className={styles.cloudBadge}><i /> PRIVATE CLOUD DRAFT</span><span className={styles.accountEmail} title={userEmail}>{userEmail}</span></div></aside>
    <div className={styles.workspace}><header className={styles.topbar}><div className={styles.saveState}><span className={dirty ? styles.unsavedDot : styles.savedDot} /><div><strong>Cloud Sync</strong><span>{signingOut ? "Signing out…" : loading ? "Opening your cloud workspace…" : uploadBusy ? "Uploading your photo…" : syncing ? "Checking saved cloud draft…" : busy ? "Saving your changes…" : dirty ? "You have unsaved changes" : error && !workspace ? "Cloud draft unavailable" : workspace?.updatedAt ? `Saved · ${timeLabel(workspace.updatedAt)}` : "No cloud draft saved yet"}</span></div><button type="button" className={styles.syncButton} aria-label="Sync cloud draft" title="Check your saved cloud draft. Unsaved edits are protected." disabled={busy || syncing || uploadBusy || loading || !content} onClick={requestSync}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div><div className={styles.topbarActions}><ColorModeToggle scope="owner" />{uploadBusy && <OwnerUploadCancel className={styles.secondary} />}<button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={() => setShowDrafts(true)}>Saved drafts</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy || loading || !content} onClick={() => { setPreviewPageId(null); setShowPreview(true); }}>Preview</button><button type="button" className={styles.primary} disabled={busy || uploadBusy || loading || !content} onClick={() => setSaveChoice(true)}>Save <span aria-hidden="true">→</span></button></div></header>
      <div className={`${styles.content} ${isBuilder ? styles.builderContent : ""}`}><div className={styles.pageHeading}><span className={styles.eyebrow}>TAYLOR’S SPACE / {section === "overview" ? "WELCOME BACK" : currentSection.label.toUpperCase()}</span><h1 ref={headingRef} tabIndex={-1}>{currentSection.title}</h1><p>{currentSection.description}</p></div>
      {(notice || error) && <div className={error ? styles.errorNotice : styles.successNotice} role={error ? "alert" : "status"}><button type="button" className={styles.dismissNotice} aria-label={error ? "Dismiss error" : "Dismiss notification"} onClick={() => { setError(null); setNotice(null); setIssues([]); }}>×</button><strong>{error || notice}</strong>{issues.length > 0 && <ul>{issues.slice(0, 12).map((issue, index) => <li key={`${issue.path}-${index}`}>{friendlyPath(issue.path, content)}: {issue.message}</li>)}</ul>}{issues.length > 12 && <p>And {issues.length - 12} more details. Fix these first, then try saving again.</p>}{error?.includes("another tab or device") && <button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setConfirmation({ title: "Reload the saved draft?", description: "This replaces the unsaved edits in this tab with the latest saved cloud draft. Keep editing if you need to copy anything from this version first.", action: "Reload saved draft", onConfirm: () => { void load(true); } })}>Reload saved draft</button>}</div>}
      {loading ? <Card><p className={styles.loading}>Opening your private cloud draft…</p></Card> : !content ? <Card title="We couldn’t open your draft"><p>Your saved work has not been overwritten. Check your internet connection and owner access, then try again.</p><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={() => { void load(); }}>Try again</button></Card> : <fieldset disabled={busy || uploadBusy} className={styles.editor} key={formVersion}>{body}</fieldset>}
      <div className={styles.bottomNote}>Drafts stay private. Your site changes only when you choose Publish live.</div></div>
    </div>
    {showPageManager && <Dialog wide title="Manage your website pages" onClose={() => setShowPageManager(false)} actions={<button type="button" className={styles.primary} onClick={() => setShowPageManager(false)}>Back to builder</button>}>{pageManagement}</Dialog>}
    {showDrafts && content && <NamedDraftsDialog store={store} content={content} dirty={dirty} onClose={() => setShowDrafts(false)} onSaveCurrent={async () => !!await saveDraft()} onLoad={(next, name) => { if (operationRef.current || uploadBusyRef.current) return; dirtyRef.current = true; editVersionRef.current++; setContent(next); setFormVersion(value => value + 1); arrive({ section: "pages" }); setNotice(`Loaded “${name}” into your builder. Your live site has not changed.`); setError(null); setIssues([]); }} />}
    {pendingSync && <Dialog title="Sync with unsaved changes?" dismissDisabled={busy} onClose={() => { if (!busy) setPendingSync(false); }} actions={<><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPendingSync(false)}>Cancel</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={async () => { if (await load(true)) setPendingSync(false); }}>Reload saved draft</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved && mountedRef.current && await load()) setPendingSync(false); }}>Save draft & sync</button></>}><p>Your edits are only in this tab. Save them privately before syncing, or choose Reload saved draft to discard these edits and open the cloud version. Cancel keeps everything as it is.</p><p className={styles.help}>Nothing here publishes your website. A newer cloud revision will stop the save rather than overwrite another device’s work.</p>{error && <p className={styles.errorNotice} role="alert">{error}</p>}</Dialog>}
    {saveChoice && <Dialog title="Save your changes" dismissDisabled={busy} onClose={() => { if (!busy) setSaveChoice(false); }} actions={<><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setSaveChoice(false)}>Keep editing</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved && mountedRef.current) setSaveChoice(false); }}>Save draft</button><button type="button" className={styles.primary} disabled={busy || uploadBusy || !store.publishLive} onClick={async () => { const saved = await publishLive(); if (saved && mountedRef.current) setSaveChoice(false); }}>Publish live</button></>}>{error && <p className={styles.errorNotice} role="alert">{error}</p>}<div className={styles.saveChoices}><button type="button" disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved && mountedRef.current) setSaveChoice(false); }}><strong>Save draft</strong><span>Save privately to your account. Your live website stays exactly as it is.</span></button><button type="button" disabled={busy || uploadBusy || !store.publishLive} onClick={async () => { const saved = await publishLive(); if (saved && mountedRef.current) setSaveChoice(false); }}><strong>Publish live</strong><span>Save and publish your whole draft, including page, menu, price, and photo changes. Visitors will see this version.</span></button></div>{!store.publishLive && <p className={styles.help}>Live publishing is not connected in this workspace. You can still save a private draft.</p>}</Dialog>}
    {showPreview && content && previewPage && <Dialog wide title="Your draft preview" dismissDisabled={busy} onClose={() => { if (!busy) setShowPreview(false); }} actions={<><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={() => setShowPreview(false)}>Back to workspace</button></>}><p className={styles.help}>This is your current draft, including unsaved changes. Opening it does not save or publish anything.</p><div className={styles.dialogPreview}><SiteContentFrame content={content} page={previewPage} mode="editor" onNavigate={page => setPreviewPageId(page.id)} /></div>{workspace?.updatedAt && <p className={styles.help}><a href="/taylor/preview" target="_blank" rel="noreferrer">Open saved draft in a new tab ↗</a> · Unsaved edits stay here.</p>}</Dialog>}
    {addingPage && <Dialog title="Add a new page" onClose={() => setAddingPage(false)} actions={<><button type="button" className={styles.secondary} onClick={() => setAddingPage(false)}>Cancel</button><button type="button" className={styles.primary} onClick={createPage}>Create page</button></>}><p>Give it a name. You can add text, photos, and buttons next.</p><Field label="Page name" value={newTitle} onChange={value => { if (newSlug === slugifyTitle(newTitle)) setNewSlug(slugifyTitle(value)); setNewTitle(value); setNewPageError(null); }} placeholder="About the maker" required /><Field label="Page address" value={newSlug} onChange={value => { setNewSlug(value.toLowerCase()); setNewPageError(null); }} hint={`Private preview link: /taylor/preview/${newSlug || "about-the-maker"}.`} />{newPageError && <p className={styles.inlineError} role="alert">{newPageError}</p>}</Dialog>}
    {pending && <Dialog title="Save before moving on?" dismissDisabled={busy} onClose={() => { if (!busy) setPending(null); }} actions={<><button type="button" className={styles.textButton} disabled={busy || uploadBusy} onClick={() => { discard(); arrive(pending); setPending(null); }}>Discard changes</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPending(null)}>Keep editing</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (!mountedRef.current) return; if (saved) { arrive(pending); setPending(null); } else setPending(null); }}>Save and continue</button></>}><p>You have unsaved changes. Save them as a draft, or stay here and keep working.</p></Dialog>}
    {pendingSignOut && <Dialog title="Save before signing out?" dismissDisabled={busy} onClose={() => { if (!busy) setPendingSignOut(false); }} actions={<><button type="button" className={styles.textButton} disabled={busy || uploadBusy} onClick={() => { void signOut(); }}>Sign out without saving</button><button type="button" className={styles.secondary} disabled={busy || uploadBusy} onClick={() => setPendingSignOut(false)}>Keep editing</button><button type="button" className={styles.primary} disabled={busy || uploadBusy} onClick={async () => { const saved = await saveDraft(); if (saved) await signOut(); else if (mountedRef.current) setPendingSignOut(false); }}>Save and sign out</button></>}><p>You have unsaved changes in this tab. Save them to your private cloud draft before signing out, or discard only these unsaved edits.</p><p className={styles.help}>Your saved cloud draft will stay in your account.</p></Dialog>}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)} actions={<><button type="button" className={styles.secondary} onClick={() => setConfirmation(null)}>Cancel</button><button type="button" className={confirmation.danger ? styles.danger : styles.primary} onClick={() => { confirmation.onConfirm(); setConfirmation(null); }}>{confirmation.action}</button></>}><p>{confirmation.description}</p></Dialog>}
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
