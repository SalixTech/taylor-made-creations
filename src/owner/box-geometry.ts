/** Flow-based geometry: responsive horizontal coordinates, no arbitrary CSS or
 * absolute positioning. Baseline content stays intact and scales into its frame. */
export type ElementBox = {
  widthPercent: number; heightPx: number; xPercent: number; yPx: number;
  baseWidthPx: number; baseHeightPx: number; referenceParentPx: number;
  aspectLocked: boolean;
  /** Optional for legacy eight-field boxes. Degrees, clockwise around the frame center. */
  rotationDeg?: number;
  /** New boxes reserve their original flow slot. Legacy boxes keep legacy margins. */
  flow?: { xPercent: number; marginTopPx: number; marginRightPx: number; marginBottomPx: number; marginLeftPx: number };

};
export type BoxBounds = { width: number; height: number; parentWidth: number; xPercent?: number };
export const clampBox = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;
export function sameElementBox(a: ElementBox, b: ElementBox): boolean {
  return (["widthPercent", "heightPx", "xPercent", "yPx", "baseWidthPx", "baseHeightPx", "referenceParentPx", "aspectLocked"] as const).every(key => a[key] === b[key]) && (a.rotationDeg ?? 0) === (b.rotationDeg ?? 0) && JSON.stringify(a.flow) === JSON.stringify(b.flow);
}
const finite = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function validElementBox(value: unknown): value is ElementBox {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const box = value as ElementBox;
  return [8, 9, 10].includes(Object.keys(box).length) && Object.keys(box).every(key => ["widthPercent", "heightPx", "xPercent", "yPx", "baseWidthPx", "baseHeightPx", "referenceParentPx", "aspectLocked", "rotationDeg", "flow"].includes(key))
    && finite(box.widthPercent, 5, 100) && finite(box.heightPx, 16, 2000) && finite(box.xPercent, 0, 95) && box.xPercent + box.widthPercent <= 100.001
    && finite(box.yPx, 0, 1000) && finite(box.baseWidthPx, 16, 2400) && finite(box.baseHeightPx, 16, 4000) && finite(box.referenceParentPx, 16, 4000) && typeof box.aspectLocked === "boolean" && (!Object.hasOwn(box, "rotationDeg") || finite(box.rotationDeg, -180, 180)) && (!Object.hasOwn(box, "flow") || validFlowSlot(box.flow) && box.baseWidthPx <= box.referenceParentPx + .001 && box.flow.xPercent + box.baseWidthPx / box.referenceParentPx * 100 <= 100.001);
}
function validFlowSlot(value: unknown): value is NonNullable<ElementBox["flow"]> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const flow = value as NonNullable<ElementBox["flow"]>;
  return Object.keys(flow).length === 5 && Object.keys(flow).every(key => ["xPercent", "marginTopPx", "marginRightPx", "marginBottomPx", "marginLeftPx"].includes(key))
    && finite(flow.xPercent, 0, 100) && [flow.marginTopPx, flow.marginRightPx, flow.marginBottomPx, flow.marginLeftPx].every(value => finite(value, 0, 1000));
}
export function initialElementBox(bounds: BoxBounds): ElementBox {
  const width = positive(bounds.width, 16), height = positive(bounds.height, 16);
  const parent = clampBox(positive(bounds.parentWidth, width), 16, 4000);
  const widthPercent = clampBox(width / parent * 100, 5, 100);
  return { widthPercent, heightPx: clampBox(height, 16, 2000), xPercent: clampBox(bounds.xPercent ?? 0, 0, 100 - widthPercent), yPx: 0, baseWidthPx: clampBox(width, 16, 2400), baseHeightPx: clampBox(height, 16, 4000), referenceParentPx: parent, aspectLocked: true };
}
export function resizeElementBox(box: ElementBox, widthPercent: number, heightPx: number, axis: "width" | "height" | "both" = "both"): ElementBox {
  if (!Number.isFinite(widthPercent) || !Number.isFinite(heightPx)) return box;
  const maxWidth = 100 - box.xPercent;
  let width = clampBox(widthPercent, 5, maxWidth), height = clampBox(heightPx, 16, 2000);
  if (box.aspectLocked) {
    const ratio = box.heightPx / box.widthPercent;
    const factor = axis === "height" ? height / box.heightPx : axis === "width" ? width / box.widthPercent : Math.abs(width - box.widthPercent) / box.widthPercent >= Math.abs(height - box.heightPx) / box.heightPx ? width / box.widthPercent : height / box.heightPx;
    const boundedFactor = clampBox(factor, Math.max(5 / box.widthPercent, 16 / box.heightPx), Math.min(maxWidth / box.widthPercent, 2000 / box.heightPx));
    width = box.widthPercent * boundedFactor; height = width * ratio;
  }
  return { ...box, widthPercent: Math.round(width * 1000) / 1000, heightPx: Math.round(height * 1000) / 1000 };
}
export function moveElementBox(box: ElementBox, xPercent: number, yPx: number): ElementBox {
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPx)) return box;
  return { ...box, xPercent: Math.round(clampBox(xPercent, 0, 100 - box.widthPercent) * 1000) / 1000, yPx: Math.round(clampBox(yPx, 0, 1000) * 1000) / 1000 };
}

export type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Point = { x: number; y: number };
/** CSS 2-D affine transform, including non-uniform scale, skew and rotation. */
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };
export const identityAffine = (): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const transformPoint = (m: Affine, p: Point): Point => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
export function multiplyAffine(a: Affine, b: Affine): Affine {
  return { a: a.a*b.a+a.c*b.b, b:a.b*b.a+a.d*b.b, c:a.a*b.c+a.c*b.d, d:a.b*b.c+a.d*b.d, e:a.a*b.e+a.c*b.f+a.e, f:a.b*b.e+a.d*b.f+a.f };
}
export function inverseAffine(m: Affine): Affine | null {
  const det = m.a*m.d-m.b*m.c;
  if (!Object.values(m).every(Number.isFinite) || !Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  return { a:m.d/det, b:-m.b/det, c:-m.c/det, d:m.a/det, e:(m.c*m.f-m.d*m.e)/det, f:(m.b*m.e-m.a*m.f)/det };
}
export function rotationAffine(degrees: number): Affine {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return { a:c, b:s, c:-s, d:c, e:0, f:0 };
}
export function rotateElementBox(box: ElementBox, degrees: number): ElementBox {
  if (!Number.isFinite(degrees)) return box;
  return { ...box, rotationDeg: Math.round(clampBox(degrees, -180, 180) * 1000) / 1000 };
}
/** Resize in the rotated frame's local axes; the opposite corner (or edge
 * midpoint) stays fixed. Bounds constrain the whole gesture, never clamp x/y
 * separately after resizing, which would make the opposite anchor drift. */
export function resizeElementBoxFromHandle(box: ElementBox, handle: BoxHandle, dx: number, dy: number, lock = box.aspectLocked, visibleHeightFactor = 1): ElementBox {
  if (![dx, dy, visibleHeightFactor].every(Number.isFinite) || visibleHeightFactor <= 0) return box;
  const hx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0, hy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const width = box.widthPercent * box.referenceParentPx / 100, height = box.heightPx;
  let dw = hx * dx, dh = hy * dy / visibleHeightFactor;
  if (lock) {
    const factor = !hx ? dh / height : !hy ? dw / width : Math.abs(dw / width) >= Math.abs(dh / height) ? dw / width : dh / height;
    dw = width * factor; dh = height * factor;
  }
  if (Math.abs(dw) < 1e-10 && Math.abs(dh) < 1e-10) return box;
  const centerDelta = transformPoint(rotationAffine(box.rotationDeg ?? 0), { x: hx * dw / 2, y: hy * dh * visibleHeightFactor / 2 });
  const shiftX = centerDelta.x - dw / 2, shiftY = centerDelta.y - dh * visibleHeightFactor / 2;
  const x = box.xPercent * box.referenceParentPx / 100;
  let amount = 1;
  const constrain = (start: number, change: number, min: number, max: number) => {
    if (change > 0) amount = Math.min(amount, (max-start)/change);
    if (change < 0) amount = Math.min(amount, (min-start)/change);
  };
  constrain(width, dw, box.referenceParentPx*.05, box.referenceParentPx);
  constrain(height, dh, 16, 2000);
  constrain(x, shiftX, 0, box.referenceParentPx);
  constrain(x+width, shiftX+dw, 0, box.referenceParentPx);
  constrain(box.yPx, shiftY, 0, 1000);
  amount = clampBox(amount, 0, 1);
  if (amount < 1e-9) return box;
  // Keep full precision here so an anchored resize does not acquire rounding
  // drift after repeated gestures. Serialization accepts finite bounded numbers.
  const next = { ...box, widthPercent:(width+dw*amount)/box.referenceParentPx*100, heightPx:height+dh*amount, xPercent:(x+shiftX*amount)/box.referenceParentPx*100, yPx:box.yPx+shiftY*amount };
  // Remove floating-point boundary noise without moving a real anchor.
  next.widthPercent = clampBox(next.widthPercent, 5, 100);
  next.xPercent = clampBox(next.xPercent, 0, 100-next.widthPercent);
  next.heightPx = clampBox(next.heightPx, 16, 2000); next.yPx = clampBox(next.yPx, 0, 1000);
  return next;
}

/** CSS absolute units, not physical monitor inches. Canonical geometry stays in
 * the existing responsive percentage/design-pixel schema; units are UI only. */
export const CSS_PIXELS_PER_INCH = 96;
export type BoxUnit = "px" | "in";
export function elementBoxDimensions(box: ElementBox, unit: BoxUnit = "px") {
  const divisor = unit === "in" ? CSS_PIXELS_PER_INCH : 1;
  return { width: box.widthPercent * box.referenceParentPx / 100 / divisor, height: box.heightPx / divisor };
}
export function resizeElementBoxInUnits(box: ElementBox, width: number, height: number, unit: BoxUnit, axis: "width" | "height" | "both" = "both"): ElementBox {
  if (!validElementBox(box) || !["px", "in"].includes(unit) || ![width, height].every(value => Number.isFinite(value) && value > 0)) return box;
  const multiplier = unit === "in" ? CSS_PIXELS_PER_INCH : 1;
  const widthPercent = width * multiplier / box.referenceParentPx * 100, heightPx = height * multiplier;
  if (![widthPercent, heightPx].every(Number.isFinite)) return box;
  // Equivalent unit representations must not round a saved high-precision box.
  if (Math.abs(widthPercent - box.widthPercent) < 1e-9 && Math.abs(heightPx - box.heightPx) < 1e-9) return box;
  return resizeElementBox(box, widthPercent, heightPx, axis);
}
