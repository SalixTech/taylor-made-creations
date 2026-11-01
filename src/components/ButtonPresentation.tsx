import type { CSSProperties, ReactNode } from "react";
import type { ButtonAppearance } from "@/owner/button-import";
import { ButtonArtwork } from "./ButtonArtwork";
import styles from "./ButtonPresentation.module.css";
/** Shared by imported preview and the real link. Navigation stays with the app. */
export function buttonPresentationProps(value:ButtonAppearance|undefined):{className?:string;style?:CSSProperties;"data-button-preset"?:string}{
 const variables:Record<string,string>={};for(const [state,record] of Object.entries({base:value?.imported,hover:value?.hover,focus:value?.focus}))for(const [key,item] of Object.entries(record??{}))variables[`--import-${state}-${key}`]=item;
 return value?{className:`${styles.button} ${styles[value.preset]} ${Object.keys(value.imported??{}).map(key=>styles[`import_${key}`]).join(" ")} ${Object.keys(value.hover??{}).map(key=>styles[`hover_${key}`]).join(" ")} ${Object.keys(value.focus??{}).map(key=>styles[`focus_${key}`]).join(" ")}`,style:variables as CSSProperties,"data-button-preset":value.preset}:{};
}
export function ButtonPresentation({appearance,children}:{appearance?:ButtonAppearance;children:ReactNode}) {
 return appearance?.artwork?<><ButtonArtwork src={appearance.artwork.src}/><span className={styles.artworkLabel}>{children}</span></>:children;
}
