"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "./OwnerFields";
import { addOwnerWhimsyTerm, MAX_CUSTOM_WHIMSY_TERMS, MAX_WHIMSY_TERM_LENGTH, removeOwnerWhimsyTerm, useOwnerWhimsyTerms, WHIMSICAL_CLIENT_WORDS, type WhimsyTermResult } from "./owner-whimsy";
import { useStudioSettings } from "./use-studio-settings";
import type { WhimsySpeciesReview } from "./owner-whimsy-suggestions-client";
import ui from "./OwnerPortal.module.css";
import styles from "./OwnerTemplateManagers.module.css";

export function WhimsyWordsEditor({ onClose }: { onClose: () => void }) {
  const terms = useOwnerWhimsyTerms(), account = useStudioSettings();
  const [input, setInput] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [review, setReview] = useState<WhimsySpeciesReview | null>(null), [busy, setBusy] = useState(false);
  const active = useRef(true), pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function report(result: WhimsyTermResult) {
    setError(result.error ?? "");
    if (result.error) setMessage("");
    if (!result.error) setMessage(result.saved ? "Custom words saved to your owner account." : "Custom words were not confirmed saved. Check Account preferences and retry.");
  }
  async function change(work: () => Promise<WhimsyTermResult>, clear = false) { if (pending.current || account.busy || account.retry || !account.settings) return; pending.current = true; setBusy(true); try { const result = await work(); if (active.current) { report(result); if (clear && result.saved) setInput(""); } } catch { if (active.current) setError("Custom words were not confirmed saved. Review account preferences before retrying."); } finally { pending.current = false; if (active.current) setBusy(false); } }
  function add() { void change(() => addOwnerWhimsyTerm(input), true); }
  async function suggestions() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage(""); setReview(null);
    try {
      const { readOwnerWhimsySpeciesSuggestions } = await import("./owner-whimsy-suggestions-client");
      if (!active.current) return;
      const next = await readOwnerWhimsySpeciesSuggestions(() => active.current);
      if (active.current) setReview(next);
    } catch { if (active.current) setError("Species suggestions could not be checked. Sign in again or retry."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function addSuggestion(word: string) {
    if (!review || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const result = await review.add(word, () => active.current); if (active.current) report(result); }
    catch { if (active.current) { setReview(null); setError("This review is no longer available. Check your owner session and review suggestions again."); } }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  const suggestionsLeft = review?.words.filter(word => !terms.some(term => term.toLocaleLowerCase() === word.toLocaleLowerCase())) ?? [];
  return <Dialog title="Your whimsy words" dismissDisabled={busy} onClose={() => { if (!pending.current) onClose(); }} actions={<button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>Done</button>}>
    <div className={styles.whimsyEditor}>
      <p className={ui.help}>These labels and your On/Off choice save to your private owner account, separately from website drafts and publishing.</p>
      <h3>Original words <small>Always included</small></h3>
      <ul className={styles.wordList}>{WHIMSICAL_CLIENT_WORDS.map(word => <li key={word}><span>{word}</span><small>Original</small></li>)}</ul>
      <h3>Your custom words <small>{terms.length}/{MAX_CUSTOM_WHIMSY_TERMS}</small></h3>
      {terms.length ? <ul className={styles.wordList}>{terms.map(word => <li key={word}><span>{word}</span><button type="button" className={ui.textButton} disabled={busy || account.busy || account.retry || !account.settings} aria-label={`Remove custom word ${word}`} onClick={() => void change(() => removeOwnerWhimsyTerm(word))}>Remove</button></li>)}</ul> : <p className={ui.help}>Add a little more personality to your Add Client button.</p>}
      <form className={styles.wordForm} onSubmit={event => { event.preventDefault(); if (!busy) add(); }}>
        <label htmlFor="owner-whimsy-word">New word<input id="owner-whimsy-word" value={input} maxLength={MAX_WHIMSY_TERM_LENGTH} disabled={busy} aria-describedby="owner-whimsy-word-hint" onChange={event => { setInput(event.target.value); setError(""); }} /></label>
        <button type="submit" className={ui.secondary} disabled={busy || account.busy || !account.settings || account.retry || !input.trim() || terms.length >= MAX_CUSTOM_WHIMSY_TERMS}>Add word</button>
      </form>
      <p id="owner-whimsy-word-hint" className={ui.help}>Up to 32 letters with spaces, apostrophes or hyphens. Use species or playful words only, not names or contact details.</p>
      <details className={styles.speciesReview}><summary>Suggestions from commission species</summary>
        <p className={ui.help}>Review species from up to 50 saved requests. Only the species field is used; request and contact details are not kept here. Nothing is added automatically. Choose Add only for a species or playful word, not a person’s name.</p>
        <button type="button" className={ui.secondary} disabled={busy} onClick={() => void suggestions()}>{busy ? "Checking…" : "Review species suggestions"}</button>
        {review && (suggestionsLeft.length ? <ul className={styles.wordList}>{suggestionsLeft.map(word => <li key={word}><span>{word}</span><button type="button" className={ui.secondary} disabled={busy || account.busy || account.retry || !account.settings || terms.length >= MAX_CUSTOM_WHIMSY_TERMS} aria-label={`Add suggested word ${word}`} onClick={() => void addSuggestion(word)}>Add</button></li>)}</ul> : <p className={ui.help}>No new eligible species in this set of requests.</p>)}
      </details>
      {account.error && <p role="alert" className={ui.error}>{account.error}</p>}{error && <p className={ui.error} role="alert">{error}</p>}{message && <p className={ui.help} role="status">{message}</p>}
    </div>
  </Dialog>;
}
