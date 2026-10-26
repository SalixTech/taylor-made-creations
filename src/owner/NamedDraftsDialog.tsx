"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_NAMED_DRAFTS, type OwnerContent, type OwnerNamedDraftSummary } from "./model";
import type { OwnerStore } from "./storage";
import { Dialog, Field } from "./OwnerFields";
import styles from "./OwnerPortal.module.css";

type Props = { store: OwnerStore; content: OwnerContent; dirty: boolean; onLoad: (content: OwnerContent, name: string) => void; onSaveCurrent: () => Promise<boolean>; onClose: () => void };
type Action = { kind: "load" | "rename" | "overwrite" | "archive" | "restore"; draft: OwnerNamedDraftSummary };
const when = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function NamedDraftsDialog({ store, content, dirty, onLoad, onSaveCurrent, onClose }: Props) {
  const [drafts, setDrafts] = useState<OwnerNamedDraftSummary[]>([]);
  const [archived, setArchived] = useState<OwnerNamedDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [archiveView, setArchiveView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const connected = typeof store.listNamedDrafts === "function" && typeof store.saveNamedDraft === "function" && typeof store.loadNamedDraft === "function";

  useEffect(() => {
    mounted.current = true;
    if (!store.listNamedDrafts) return;
    Promise.all([store.listNamedDrafts(), store.listTrashedNamedDrafts?.() ?? Promise.resolve([])]).then(([saved, trash]) => { if (mounted.current) { setDrafts(saved); setArchived(trash); setLoaded(true); } }).catch(error => { if (mounted.current) setError(error instanceof Error ? error.message : "Your drafts could not be loaded."); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [store]);

  async function refresh() {
    const [saved, trash] = await Promise.all([store.listNamedDrafts!(), store.listTrashedNamedDrafts?.() ?? Promise.resolve([])]);
    if (mounted.current) { setDrafts(saved); setArchived(trash); setLoaded(true); }
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "That change could not be saved. Your drafts have not been replaced."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function prepare(kind: Action["kind"], draft: OwnerNamedDraftSummary) { setAction({ kind, draft }); setName(kind === "rename" || kind === "restore" ? draft.name : ""); setError(null); setNotice(null); }
  async function loadSelected(saveFirst = false) {
    if (!action || action.kind !== "load") return;
    const selected = action.draft;
    await run(async () => {
      if (saveFirst && !await onSaveCurrent()) { if (mounted.current) setError("Your current work could not be saved. Nothing has been loaded or replaced."); return; }
      const saved = await store.loadNamedDraft!(selected.id);
      if (mounted.current) { onLoad(structuredClone(saved.content), saved.name); onClose(); }
    });
  }
  async function confirmAction() {
    if (!action) return;
    const current = action;
    await run(async () => {
      if (current.kind === "overwrite") await store.saveNamedDraft!(current.draft.name, content, { id: current.draft.id, expectedRevision: current.draft.revision });
      if (current.kind === "rename") await store.renameNamedDraft!(current.draft.id, name.trim(), current.draft.revision);
      if (current.kind === "archive") await store.deleteNamedDraft!(current.draft.id, current.draft.revision);
      if (current.kind === "restore") await store.restoreNamedDraft!(current.draft.id, name.trim());
      await refresh();
      if (!mounted.current) return;
      setAction(null); setName("");
      setNotice(current.kind === "archive" ? `“${current.draft.name}” moved to Archived drafts. You can restore it later.` : current.kind === "restore" ? "Draft restored. It is available in Saved drafts without changing your current work." : current.kind === "rename" ? "Draft renamed." : `“${current.draft.name}” updated with your current work. Your live site is unchanged.`);
    });
  }
  const labels = { load: "Load draft", rename: "Rename draft", overwrite: "Replace saved draft", archive: "Remove saved draft", restore: "Restore draft" };
  const actionButtons = action ? <>
    <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setAction(null); setName(""); setError(null); }}>Cancel</button>
    {action.kind === "load" ? <>{dirty && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void loadSelected()}>Load without saving</button>}<button type="button" className={styles.primary} disabled={busy} onClick={() => void loadSelected(dirty)}>{busy ? "Loading…" : dirty ? "Save current work & load" : "Load draft"}</button></> : <button type="button" className={action.kind === "archive" ? styles.danger : styles.primary} disabled={busy || ((action.kind === "rename" || action.kind === "restore") && !name.trim())} onClick={() => void confirmAction()}>{busy ? "Saving…" : labels[action.kind]}</button>}
  </> : <button type="button" className={styles.primary} disabled={busy} onClick={onClose}>Done</button>;

  return <Dialog title={action ? `${labels[action.kind]} “${action.draft.name}”?` : "Your saved drafts"} wide={!action} dismissDisabled={busy} onClose={onClose} actions={actionButtons}>
    {error && <p className={styles.errorNotice} role="alert">{error}</p>}
    {notice && <p className={styles.successNotice} role="status">{notice}</p>}
    {action ? <>
      {action.kind === "load" && <><p>{dirty ? "You have unsaved changes in the builder. Save your current work before loading this draft, or explicitly replace those unsaved changes." : "Load this saved version into the builder. It will not change your live website."}</p><p className={styles.help}>The named draft stays safely saved. Loading only changes the builder; use Save draft to make it your current cloud workspace.</p></>}
      {action.kind === "rename" && <Field label="New draft name" value={name} onChange={setName} required />}
      {action.kind === "overwrite" && <p>Replace this named draft with everything currently in your builder, including unsaved edits? Other drafts and your live website will not change.</p>}
      {action.kind === "archive" && <p>Remove this draft from your ten saved slots? It will be kept in Archived drafts so it can be restored. Your current builder and live website will not change.</p>}
      {action.kind === "restore" && <><p>Restore a copy into a saved slot. Your current builder and live website will not change.</p><Field label="Restored draft name" value={name} onChange={setName} hint="Use a different name if the original name is already taken." required /></>}
    </> : <>
      <p className={styles.help}>Keep up to {MAX_NAMED_DRAFTS} named versions in your private cloud account. Save a new idea, come back to it later, and publish only when you are ready.</p>
      {!connected ? <p className={styles.inlineError}>Named cloud drafts are not connected in this workspace. Your current work can still be saved with Save draft.</p> : <>
        <div className={styles.draftCreate}><Field label="Name this version" value={name} onChange={setName} placeholder="For example: Winter shop update" /><button type="button" className={styles.primary} disabled={busy || loading || !loaded || !name.trim() || drafts.length >= MAX_NAMED_DRAFTS} onClick={() => void run(async () => { const saved = await store.saveNamedDraft!(name.trim(), content); await refresh(); if (mounted.current) { setName(""); setNotice(`“${saved.name}” saved privately. Your live website has not changed.`); } })}>{busy ? "Saving…" : "Save as new draft"}</button></div>
        <div className={styles.draftTabs}><div className={styles.segmented}><button type="button" disabled={busy} aria-pressed={!archiveView} onClick={() => setArchiveView(false)}>Saved drafts <span>{loaded ? `${drafts.length}/${MAX_NAMED_DRAFTS}` : "…"}</span></button><button type="button" disabled={busy} aria-pressed={archiveView} onClick={() => setArchiveView(true)}>Archived <span>{loaded ? archived.length : "…"}</span></button></div><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void run(refresh)}>Refresh</button></div>
        {loaded && drafts.length >= MAX_NAMED_DRAFTS && <p className={styles.help}>All ten slots are in use. Update an existing draft or remove one to make room.</p>}
        {loading ? <p role="status">Loading your cloud drafts…</p> : <div className={styles.namedDraftList}>{(archiveView ? archived : drafts).map(draft => <div className={styles.namedDraftRow} key={draft.id}><div><strong>{draft.name}</strong><small>Saved {when(draft.updatedAt)} · version {draft.revision}</small></div><div>{archiveView ? <button type="button" className={styles.secondary} disabled={busy || drafts.length >= MAX_NAMED_DRAFTS} onClick={() => prepare("restore", draft)}>Restore</button> : <><button type="button" className={styles.secondary} disabled={busy} onClick={() => prepare("load", draft)}>Load</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => prepare("overwrite", draft)}>Save here</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => prepare("rename", draft)}>Rename</button><button type="button" className={styles.danger} disabled={busy} onClick={() => prepare("archive", draft)}>Remove</button></>}</div></div>)}</div>}
        {!loading && loaded && !(archiveView ? archived : drafts).length && <div className={styles.empty}><h3>{archiveView ? "No archived drafts." : "A little room for your ideas."}</h3><p>{archiveView ? "Removed drafts will be kept here for recovery." : "Give your current version a name above to save your first draft."}</p></div>}
      </>}
    </>}
  </Dialog>;
}
