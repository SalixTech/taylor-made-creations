import Image from "next/image";
import styles from "./FooterCredits.module.css";

/** Fixed, owner-approved credits; supplied brand artwork stays unchanged. */
export function FooterCredits() {
  return <div className={styles.credits} role="group" aria-label="Website credits">
    <a className={styles.credit} href="https://taylormadecreations.dog" target="_blank" rel="noopener noreferrer">
      <Image className={styles.icon} src="/icon.svg" alt="" aria-hidden="true" width={32} height={32} unoptimized />
      <span>Design by Taylor Made Creations</span>
    </a>
    <a className={styles.credit} href="https://salixtechnologies.com" target="_blank" rel="noopener noreferrer">
      <Image className={styles.icon} src="/images/salix-technologies-logo.png" alt="" aria-hidden="true" width={32} height={32} unoptimized />
      <span>Platform Built By Salix Technologies LLC</span>
    </a>
  </div>;
}
