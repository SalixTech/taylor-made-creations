"use client";

import { useId, useRef, useState } from "react";
import { validatePageSlug, type OwnerPage } from "./model";
import styles from "./OwnerVisualBuilder.module.css";

/** Incomplete/invalid addresses stay in this field, never in the draft. */
export function OwnerPageSlug({ page, pages, onChange, disabled = false }: { page: OwnerPage; pages: readonly OwnerPage[]; onChange: (slug: string) => void; disabled?: boolean }) {
  const id = useId();
  const lastCommit = useRef<{ base: string; value: string } | null>(null);
  const [pending, setPending] = useState<{ base: string; value: string } | null>(null);
  const value = pending?.base === page.slug ? pending.value : page.slug;
  const error = page.builtinKey === "home" ? null : validatePageSlug(value, pages, page.id);
  function commit() {
    if (disabled || page.builtinKey === "home" || error || value === page.slug || (lastCommit.current?.base === page.slug && lastCommit.current.value === value)) return;
    // Recheck against the latest pages, including addresses retained in Trash.
    if (!validatePageSlug(value, pages, page.id)) { lastCommit.current = { base: page.slug, value }; onChange(value); setPending(null); }
  }
  if (page.builtinKey === "home") return <p className={styles.navAddressHint}>Home address: / (fixed)</p>;
  return <div className={styles.navAddress}>
    <label className={styles.navLabel} htmlFor={id}><span>Page address</span><input id={id} type="text" value={value} disabled={disabled} maxLength={64} spellCheck={false} autoCapitalize="none" autoCorrect="off" aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} onChange={event => { lastCommit.current = null; setPending({ base: page.slug, value: event.target.value.toLowerCase() }); }} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPending(null); } }} /></label>
    <small id={`${id}-hint`} className={error ? styles.navError : undefined} role={error ? "alert" : undefined}>{error ?? `/${value} · Apply with Enter or leave the field. Escape cancels.`}</small>
  </div>;
}
