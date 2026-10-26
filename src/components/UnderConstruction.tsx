import Link from "next/link";
import { Brand } from "./Brand";
import { CopyrightRange } from "./Copyright";
import styles from "./UnderConstruction.module.css";

/** Public-safe fixed branding only. Never accepts a draft or published snapshot. */
export function UnderConstruction() {
  return <section className={styles.shell} aria-labelledby="construction-title" data-site-locked="true">
    <header className={`site-header ${styles.header}`}><div className="header-inner"><Brand /></div></header>
    <div className={styles.card}>
      <p className="eyebrow">UNDER CONSTRUCTION · PLEASE MIND THE PAWS</p>
      <h1 id="construction-title">Pardon the fluff.<br /><span>This den is getting a makeover.</span></h1>
      <p className={styles.copy}>Taylor’s stitching things together behind the scenes. We’ll be ready to show off our new look once the loose fur settles.</p>
      <Link className="button" href="/taylor" prefetch={false}>Owner Login <span aria-hidden="true">→</span></Link>
      <p className={styles.hint}>Just visiting? Check back soon for the big reveal.</p>
    </div>
    <p className={styles.copyright}><CopyrightRange /> Taylor Made Creations. All rights reserved.</p>
  </section>;
}
