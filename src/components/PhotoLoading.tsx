import type {ReactNode} from "react";
import styles from "./PhotoLoading.module.css";
/** Presentation only: the caller owns its existing loading and error state. */
export function PhotoLoading({label="Loading photo…"}:{label?:ReactNode}) {
  return <span className={styles.loading}><span className={styles.ring} aria-hidden="true" /><span>{label}</span></span>;
}
