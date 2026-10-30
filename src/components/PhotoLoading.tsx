import styles from "./PhotoLoading.module.css";
/** Presentation only: the caller owns its existing loading and error state. */
export function PhotoLoading({label="Loading photo…"}:{label?:string}) {
  return <span className={styles.loading}><span className={styles.ring} aria-hidden="true" /><span>{label}</span></span>;
}
