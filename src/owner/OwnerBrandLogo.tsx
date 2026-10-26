import Image from "next/image";
import styles from "./OwnerBrandLogo.module.css";

/** The owner's supplied white wordmark, served unchanged on its burgundy plate. */
export function OwnerBrandLogo({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return <span className={[styles.logo, className].filter(Boolean).join(" ")}>
    <Image className={styles.image} src="/images/tmc-owner-wordmark.png" width={331} height={92} alt={decorative ? "" : "Taylor Made Creations"} unoptimized loading="eager" />
  </span>;
}
