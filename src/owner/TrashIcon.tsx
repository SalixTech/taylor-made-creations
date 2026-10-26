import styles from "./TrashIcon.module.css";

/** Shared visual only. Each enclosing button supplies its action and accessible name. */
export function TrashIcon() {
  return <svg className={styles.icon} data-owner-trash-icon viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>;
}
