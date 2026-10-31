import styles from "./WorkspaceLoading.module.css";

/** A readable loading state remains visible when animation is reduced. */
export function WorkspaceLoading({ title = "Loading your workspace", description = "Getting everything ready…" }: { title?: string; description?: string }) {
  return <div className={styles.wrap} role="status" aria-live="polite" aria-busy="true"><div className={styles.panel}><span className={styles.ring} aria-hidden="true" /><strong>{title}</strong><p>{description}</p></div></div>;
}
