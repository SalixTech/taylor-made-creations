import type { CanvasBoxBounds } from "./box-affine";
/** Reflow and overlap are intentional. Reject invalid measurements, not a
 * changed line count or a different natural-flow footprint. */
export function firstBoxMaterializationError(_node: HTMLElement, bounds: CanvasBoxBounds): string | null {
  if (bounds.materializationError) return bounds.materializationError;
  return [bounds.width,bounds.height,bounds.parentWidth].every(value => Number.isFinite(value) && value > 0) ? null : "This box is no longer safely measurable. Nothing was changed.";
}
