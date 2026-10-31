/** Typed responsive geometry. Intentional overlap/out-of-section positioning is
 * allowed; finite arithmetic and positive dimensions, not aesthetic bounds, govern edits. */
export type ElementBox = {
  widthPercent: number; heightPx: number; xPercent: number; yPx: number;
  baseWidthPx: number; baseHeightPx: number; referenceParentPx: number;
  aspectLocked: boolean;
  /** Reflow content at the chosen width; legacy boxes remain readable. */
  layout?: "reflow";
  /** Local design-pixel compensation keeps descendants fixed during frame-only moves. */
  contentOffset?: { xPx:number; yPx:number };
  /** Optional for legacy eight-field boxes. Degrees, clockwise around the frame center. */
  rotationDeg?: number;
  /** New boxes reserve their original flow slot. Legacy boxes keep legacy margins. */
  flow?: { xPercent: number; marginTopPx: number; marginRightPx: number; marginBottomPx: number; marginLeftPx: number };

};
export type BoxBounds = { width: number; height: number; parentWidth: number; xPercent?: number };
export const clampBox = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;
export function sameElementBox(a: ElementBox, b: ElementBox): boolean {
  return (["widthPercent", "heightPx", "xPercent", "yPx", "baseWidthPx", "baseHeightPx", "referenceParentPx", "aspectLocked"] as const).every(key => a[key] === b[key]) && (a.rotationDeg ?? 0) === (b.rotationDeg ?? 0) && a.layout === b.layout && JSON.stringify(a.contentOffset) === JSON.stringify(b.contentOffset) && JSON.stringify(a.flow) === JSON.stringify(b.flow);
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const dimension = (value: unknown): value is number => finite(value) && value > 0;
export function validElementBox(value: unknown): value is ElementBox {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const box = value as ElementBox;
  return Object.keys(box).every(key => ["widthPercent", "heightPx", "xPercent", "yPx", "baseWidthPx", "baseHeightPx", "referenceParentPx", "aspectLocked", "rotationDeg", "flow", "layout", "contentOffset"].includes(key))
    && [box.widthPercent, box.heightPx, box.baseWidthPx, box.baseHeightPx, box.referenceParentPx].every(dimension)
    && [box.xPercent, box.yPx].every(finite) && typeof box.aspectLocked === "boolean"
    && (!Object.hasOwn(box,"contentOffset") || !!box.contentOffset && typeof box.contentOffset === "object" && !Array.isArray(box.contentOffset) && [Object.prototype,null].includes(Object.getPrototypeOf(box.contentOffset)) && Object.keys(box.contentOffset).length===2 && Object.keys(box.contentOffset).every(key=>key==="xPx"||key==="yPx") && [box.contentOffset.xPx,box.contentOffset.yPx].every(finite))
    && (!Object.hasOwn(box,"layout") || box.layout === "reflow")
    && (!Object.hasOwn(box,"rotationDeg") || finite(box.rotationDeg))
    && (!Object.hasOwn(box,"flow") || validFlowSlot(box.flow))
    && [box.referenceParentPx * (box.widthPercent / 100), box.baseWidthPx / box.referenceParentPx * 100, box.heightPx / box.baseHeightPx].every(dimension)
    && finite(box.xPercent / 100 * box.referenceParentPx)
    && (!box.flow || [
      (box.xPercent - box.flow.xPercent) / (box.baseWidthPx / box.referenceParentPx * 100) * 100,
      (box.referenceParentPx * (box.widthPercent / 100)) / box.baseWidthPx * 100,
    ].every(finite));
}
function validFlowSlot(value: unknown): value is NonNullable<ElementBox["flow"]> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const flow = value as NonNullable<ElementBox["flow"]>;
  return Object.keys(flow).length === 5 && Object.keys(flow).every(key => ["xPercent", "marginTopPx", "marginRightPx", "marginBottomPx", "marginLeftPx"].includes(key))
    && [flow.xPercent, flow.marginTopPx, flow.marginRightPx, flow.marginBottomPx, flow.marginLeftPx].every(finite);
}
export function initialElementBox(bounds: BoxBounds): ElementBox {
  const width = positive(bounds.width, 16), height = positive(bounds.height, 16), parent = positive(bounds.parentWidth, width);
  const candidate: ElementBox = { widthPercent: width / parent * 100, heightPx: height, xPercent: finite(bounds.xPercent) ? bounds.xPercent : 0, yPx: 0, baseWidthPx: width, baseHeightPx: height, referenceParentPx: parent, aspectLocked: true, layout: "reflow" };
  return validElementBox(candidate) ? candidate : {widthPercent:100,heightPx:16,xPercent:0,yPx:0,baseWidthPx:16,baseHeightPx:16,referenceParentPx:16,aspectLocked:true,layout:"reflow"};
}
export function resizeElementBox(box: ElementBox, widthPercent: number, heightPx: number, axis: "width" | "height" | "both" = "both"): ElementBox {
  if (![widthPercent,heightPx].every(dimension)) return box;
  let width = widthPercent, height = heightPx;
  if (box.aspectLocked) {
    const factor = axis === "height" ? height / box.heightPx : axis === "width" ? width / box.widthPercent : Math.abs(width - box.widthPercent) / box.widthPercent >= Math.abs(height - box.heightPx) / box.heightPx ? width / box.widthPercent : height / box.heightPx;
    width = box.widthPercent * factor; height = box.heightPx * factor;
  }
  const next = {...box,widthPercent:width,heightPx:height};
  return validElementBox(next) ? next : box;
}
export function moveElementBox(box: ElementBox, xPercent: number, yPx: number): ElementBox {
  const next = {...box,xPercent,yPx}; return validElementBox(next) ? next : box;
}

/** Move a surrounding frame while preserving descendant canvas positions.
 * Rotation is inverted before applying local compensation. No child data or
 * section membership is rewritten; mobile snapshots naturally remain separate. */
export function moveElementBoxFrame(box:ElementBox,xPercent:number,yPx:number,includeContents=false):ElementBox {
  if(xPercent===box.xPercent&&yPx===box.yPx)return box;
  const moved=moveElementBox(box,xPercent,yPx);
  if(moved===box||includeContents)return moved;
  const delta=transformPoint(rotationAffine(-(box.rotationDeg??0)),{x:-(xPercent-box.xPercent)/100*box.referenceParentPx,y:-(yPx-box.yPx)});
  const next={...moved,contentOffset:{xPx:(box.contentOffset?.xPx??0)+delta.x,yPx:(box.contentOffset?.yPx??0)+delta.y}};
  return validElementBox(next)?next:box;
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
  const angle = (degrees % 360) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return { a:c, b:s, c:-s, d:c, e:0, f:0 };
}
export function rotateElementBox(box: ElementBox, degrees: number): ElementBox {
  if (!Number.isFinite(degrees)) return box;
  return { ...box, rotationDeg: ((degrees % 360) + 540) % 360 - 180 };
}
/** Resize in the rotated frame's local axes; the opposite corner (or edge
 * midpoint) stays fixed. Only zero-size crossings constrain the gesture. The opposite anchor stays
 * fixed while negative/outside positions and oversized content are allowed. */
export function resizeElementBoxFromHandle(box: ElementBox, handle: BoxHandle, dx: number, dy: number, lock = box.aspectLocked, visibleHeightFactor = 1): ElementBox {
  if (![dx, dy, visibleHeightFactor].every(Number.isFinite) || visibleHeightFactor <= 0) return box;
  const hx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0, hy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const width = box.referenceParentPx * (box.widthPercent / 100), height = box.heightPx;
  let dw = hx * dx, dh = hy * dy / visibleHeightFactor;
  if (lock) {
    const factor = !hx ? dh / height : !hy ? dw / width : Math.abs(dw / width) >= Math.abs(dh / height) ? dw / width : dh / height;
    dw = width * factor; dh = height * factor;
  }
  if (Math.abs(dw) < 1e-10 && Math.abs(dh) < 1e-10) return box;
  const centerDelta = transformPoint(rotationAffine(box.rotationDeg ?? 0), { x: hx * dw / 2, y: hy * dh * visibleHeightFactor / 2 });
  const shiftX = centerDelta.x - dw / 2, shiftY = centerDelta.y - dh * visibleHeightFactor / 2;
  const x = box.xPercent * box.referenceParentPx / 100;
  // Only stop at a zero-size crossing. Position and far edges may pass any
  // section boundary; positive sizes are required by CSS, not a design limit.
  let amount = 1;
  if (dw < 0 && width + dw <= 0) amount = Math.min(amount, width / -dw * (1 - 1e-9));
  if (dh < 0 && height + dh <= 0) amount = Math.min(amount, height / -dh * (1 - 1e-9));
  const candidate = { ...box, widthPercent:(width+dw*amount)/box.referenceParentPx*100, heightPx:height+dh*amount, xPercent:(x+shiftX*amount)/box.referenceParentPx*100, yPx:box.yPx+shiftY*amount };
  const next = validElementBox(candidate) ? candidate : box;
  return next;
}

/** CSS absolute units, not physical monitor inches. Canonical geometry stays in
 * the existing responsive percentage/design-pixel schema; units are UI only. */
export const CSS_PIXELS_PER_INCH = 96;
export type BoxUnit = "px" | "in";
export function elementBoxDimensions(box: ElementBox, unit: BoxUnit = "px") {
  const divisor = unit === "in" ? CSS_PIXELS_PER_INCH : 1;
  return { width: box.referenceParentPx * (box.widthPercent / 100) / divisor, height: box.heightPx / divisor };
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
