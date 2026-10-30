import { layoutSize, type CanvasBoxBounds } from "./box-affine";
import styles from "@/components/GeometryBox.module.css";

/** Check the same slot/frame/source hierarchy used by GeometryBox before the
 * first draft write. The probe is inert, invisible and out of normal flow.
 * Existing saved boxes deliberately do not run this migration-like check. */
export function firstBoxMaterializationError(node: HTMLElement, bounds: CanvasBoxBounds): string | null {
  if (bounds.materializationError) return bounds.materializationError;
  // Non-browser geometry fixtures have no cloneNode. Every supported browser
  // HTMLElement has it; a missing live node is rejected by the caller instead.
  if (!node.parentElement || typeof node.cloneNode !== "function") return null;
  const inline = window.getComputedStyle(node).display.startsWith("inline");
  const tag = inline ? "span" : "div";
  const probe = document.createElement(tag), frame = document.createElement(tag), source = document.createElement(tag), clone = node.cloneNode(true) as HTMLElement;
  probe.className = `${styles.flowSlot} ${inline ? styles.inline : ""}`;
  frame.className = `${styles.frame} ${styles.flowFrame}`;
  source.className = `${styles.contents} ${styles.flowContents}`;
  probe.inert = true; probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, { position:"absolute", visibility:"hidden", pointerEvents:"none", width:`${bounds.width}px`, height:`${bounds.height}px`, padding:"0", border:"0", margin:"0" });
  Object.assign(frame.style, { width:"100%", height:`${bounds.height}px`, left:"0", top:"0" });
  Object.assign(source.style, { width:`${bounds.width+1/64}px`, minHeight:`${bounds.height}px` });
  clone.removeAttribute("id"); clone.querySelectorAll("[id]").forEach(child => child.removeAttribute("id"));
  clone.style.setProperty("margin", "0", "important"); clone.style.maxWidth = "100%";
  source.appendChild(clone); frame.appendChild(source); probe.appendChild(frame);
  try {
    node.parentElement.appendChild(probe);
    const width = layoutSize(clone,"width"), height = layoutSize(clone,"height");
    if (![width,height].every(value => Number.isFinite(value) && value > 0) || Math.abs(width-bounds.width) > .5 || Math.abs(height-bounds.height) > .5) return "This change would reflow the content, so it was not applied. Try a simpler text or layout box, or reset its layout.";
    return null;
  } catch {
    return "This layout could not be checked safely. Nothing was changed. Try resetting or simplifying the box.";
  } finally { probe.remove(); }
}
