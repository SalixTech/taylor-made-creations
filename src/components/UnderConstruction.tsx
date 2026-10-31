import {ConstructionGoldWhimsy} from "./ConstructionGoldWhimsy";
import Link from "next/link";
import { Brand } from "./Brand";
import { CopyrightRange } from "./Copyright";
import { FooterCredits } from "./FooterCredits";
import styles from "./UnderConstruction.module.css";

/** Public-safe fixed branding only. Never accepts a draft or published snapshot. */
export function UnderConstruction({goldEnabled=false}:{goldEnabled?:boolean}={}) {
  return <section className={styles.shell} aria-labelledby="construction-title" data-site-locked="true">
    <header className={`site-header ${styles.header}`}><div className="header-inner"><Brand /></div></header>
    <div className={styles.card}>
      <p className="eyebrow">UNDER CONSTRUCTION · PLEASE MIND THE PAWS</p>
      <h1 id="construction-title">Pardon the fluff.<br /><span>This den is getting a makeover.</span></h1>
      <p className={styles.copy}>Taylor’s stitching things together behind the scenes. We’ll be ready to show off our new look once the loose fur settles.</p>
      <div className={styles.accessLinks}><Link className="button" href="/taylor" prefetch={false}>Maker Login</Link>{goldEnabled&&<ConstructionGoldWhimsy/>}</div>
      <p className={styles.hint}>Just visiting? Check back soon for the big reveal.</p>
    </div>
    <div role="contentinfo"><p className={styles.copyright}><CopyrightRange /> Taylor Made Creations. All rights reserved.</p><div className={styles.creditRow}><FooterCredits /></div></div>
  </section>;
}
