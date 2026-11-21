import type { Point } from "./box-geometry";

type Bounds = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** Shrink a vertical band only when the complete section width is clear. */
export function measureGapCut(
  section: Bounds,
  obstacles: Bounds[],
  start: Point,
  end: Point,
): number {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  if (![left, right, top, bottom, section.left, section.right, section.top].every(Number.isFinite)
    || right - left < 12 || bottom - top < 8 || left >= section.right
    || right <= section.left || bottom > section.top) return 0;

  const crosses = (a: Bounds, low: number, high: number) =>
    a.left < section.right && a.right > section.left && a.bottom > low && a.top < high;
  if (obstacles.some(rect => crosses(rect, top, section.top))) return 0;
  return Math.floor(bottom - top);
}

/** In a block flow, adjoining positive margins collapse to the larger one. */
export function marginAfterGapCut(top: number, previousBottom: number, cut: number): number | null {
  if (![top, previousBottom, cut].every(Number.isFinite) || cut <= 0 || previousBottom < 0) return null;
  const current = top < 0 ? top + previousBottom : Math.max(top, previousBottom);
  const wanted = current - cut;
  return wanted >= previousBottom ? wanted : wanted - previousBottom;
}
