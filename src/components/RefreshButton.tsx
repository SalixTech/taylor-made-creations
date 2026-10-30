import type { ButtonHTMLAttributes } from "react";
import { RefreshIcon } from "./RefreshIcon";
import styles from "./RefreshButton.module.css";
export function RefreshButton({ label, busy = false, className = "", disabled, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { label: string; busy?: boolean }) {
  return <button {...props} type="button" className={`${styles.refresh} ${className}`} aria-label={label} title={props.title ?? label} aria-busy={busy || undefined} disabled={disabled || busy}><RefreshIcon /></button>;
}
