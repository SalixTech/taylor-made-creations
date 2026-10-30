import { identityAffine, inverseAffine, multiplyAffine, rotationAffine, transformPoint, type Affine, type BoxBounds, type ElementBox, type Point } from "./box-geometry";
const positive = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const number = (value?: string) => { const parsed = Number.parseFloat(value ?? "0"); return Number.isFinite(parsed) ? parsed : 0; };
/** Prefer fractional computed layout sizes, not rounded offset dimensions. */
export function layoutSize(node: HTMLElement, axis: "width" | "height", linear?: Affine): number {
  const css = window.getComputedStyle?.(node), raw = Number.parseFloat(css?.[axis] ?? "");
  if (positive(raw) && css?.display !== "inline") {
    const extra = axis === "width" ? number(css?.paddingLeft)+number(css?.paddingRight)+number(css?.borderLeftWidth)+number(css?.borderRightWidth) : number(css?.paddingTop)+number(css?.paddingBottom)+number(css?.borderTopWidth)+number(css?.borderBottomWidth);
    return raw + (css?.boxSizing === "border-box" ? 0 : extra);
  }
  if (css?.display === "inline") {
    // A single inline fragment has fractional advance width; offsetWidth rounds
    // it down and can add a line at the first wrapper insertion (Notes3 SS23).
    const fragments = node.getClientRects?.();
    if (fragments && fragments.length !== 1) return NaN;
    const rect = node.getBoundingClientRect(), matrix = linear ?? elementLinearToScreen(node);
    if (!matrix) return NaN;
    const a = Math.abs(matrix.a), b = Math.abs(matrix.b), c = Math.abs(matrix.c), d = Math.abs(matrix.d), determinant = a*d-b*c;
    if (Math.abs(determinant) < 1e-8) return NaN;
    const width = (d*rect.width-c*rect.height)/determinant, height = (a*rect.height-b*rect.width)/determinant;
    return axis === "width" ? width : height;
  }
  return (axis === "width" ? node.offsetWidth : node.offsetHeight) ?? node.getBoundingClientRect()[axis] ?? 1;
}
export type CanvasBoxBounds = BoxBounds & { parentToScreen: Affine; screenToParent: Affine; parentToCanvas: Affine; nodeToCanvas: Affine; origin: Point; canvasWidth: number; left: number; top: number; heightFactor: number; signature: string; flow?: ElementBox["flow"]; materializationError?: string };
/** Computed transforms are matrix()/matrix3d(), never author CSS expressions.
 * Only affine 2-D matrices are accepted: perspective/3-D cannot be edited using
 * planar box handles. Reject them instead of guessing from an axis-aligned rect. */
export function parseAffineTransform(value?: string): Affine | null {
  if (!value || value === "none") return identityAffine();
  const match = value.match(/^matrix(3d)?\(([^)]+)\)$/);
  if (!match) return null;
  const v = match[2].split(",").map(Number);
  if (!v.every(Number.isFinite)) return null;
  if (!match[1] && v.length === 6) return { a:v[0], b:v[1], c:v[2], d:v[3], e:v[4], f:v[5] };
  if (match[1] && v.length === 16 && [2,3,6,7,8,9,11,14].every(i => v[i] === 0) && v[10] === 1 && v[15] === 1) return { a:v[0], b:v[1], c:v[4], d:v[5], e:v[12], f:v[13] };
  return null;
}
/** Compose all ancestor linear transforms first. The bounding rect is used only
 * to recover translation from the transformed corners, not to infer rotated
 * axis scales. Transform origins, layout offsets and scrolling then fall out
 * of the recovered origin, without offsetParent assumptions. */
function elementLinearToScreen(node: HTMLElement): Affine | null {
  let linear = identityAffine();
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    const css = window.getComputedStyle?.(ancestor);
    if (css?.perspective && css.perspective !== "none") return null;
    // Individual rotate/scale/translate properties are uncommon in the public
    // renderer. Their 3-D/list syntax is deliberately not silently approximated.
    if ([css?.rotate, css?.scale, css?.translate].some(value => value && value !== "none")) return null;
    const matrix = parseAffineTransform(css?.transform);
    if (!matrix) return null;
    const zoom = css?.zoom && css.zoom !== "normal" ? Number.parseFloat(css.zoom) / (css.zoom.endsWith("%") ? 100 : 1) : 1;
    if (!positive(zoom)) return null;
    matrix.a *= zoom; matrix.b *= zoom; matrix.c *= zoom; matrix.d *= zoom;
    matrix.e = 0; matrix.f = 0;
    linear = multiplyAffine(matrix, linear);
  }
  return inverseAffine(linear) ? linear : null;
}
export function elementToScreen(node: HTMLElement): Affine | null {
  const linear = elementLinearToScreen(node);
  if (!linear) return null;
  const hasTransform = linear.a !== 1 || linear.b !== 0 || linear.c !== 0 || linear.d !== 1;
  const rect = node.getBoundingClientRect();
  const width = layoutSize(node,"width",linear), height = layoutSize(node,"height",linear);
  if (![width, height, rect.width].every(positive) || ![rect.left, rect.top ?? 0].every(Number.isFinite)) return null;
  // Inline text has rounded offset dimensions but fractional DOMRects. Treating
  // their ratio as a transform falsely disables heading handles (SS17). Known
  // ancestor matrices remain authoritative for inline text; never invent scale.
  // Axis-aligned fallback also accommodates older DOMs/test environments without
  // computed transforms. NEVER use these ratios for rotated/skewed ancestors.
  if (!hasTransform && window.getComputedStyle?.(node).display !== "inline") {
    linear.a = rect.width / width;
    linear.d = positive(rect.height) ? rect.height / height : linear.a;
  }
  const corners = [{x:0,y:0},{x:width,y:0},{x:0,y:height},{x:width,y:height}].map(p => transformPoint(linear,p));
  linear.e = rect.left - Math.min(...corners.map(p => p.x));
  linear.f = (rect.top ?? 0) - Math.min(...corners.map(p => p.y));
  return inverseAffine(linear) ? linear : null;
}
export function measureCanvasBox(canvas: HTMLDivElement, node: HTMLElement, box?: ElementBox): CanvasBoxBounds | null {
  let parent = node.parentElement;
  if (box?.flow && parent?.hasAttribute?.("data-owner-flow-slot")) parent = parent.parentElement;
  while (parent?.parentElement && window.getComputedStyle?.(parent).display === "inline") parent = parent.parentElement;
  if (!parent) return null;
  const nodeMap = elementToScreen(node), parentMap = elementToScreen(parent), canvasMap = elementToScreen(canvas);
  if (!nodeMap || !parentMap || !canvasMap) return null;
  const canvasInverse = inverseAffine(canvasMap)!, parentInverse = inverseAffine(parentMap)!;
  canvasInverse.e += canvas.scrollLeft - (canvas.clientLeft ?? 0); canvasInverse.f += canvas.scrollTop - (canvas.clientTop ?? 0);
  const css = window.getComputedStyle?.(parent);
  const width = layoutSize(node,"width"), height = layoutSize(node,"height");
  const padding = number(css?.paddingLeft) + number(css?.paddingRight), borders = number(css?.borderLeftWidth) + number(css?.borderRightWidth);
  const scrollbar = positive(parent.offsetWidth) && positive(parent.clientWidth) ? Math.max(0,parent.offsetWidth-parent.clientWidth-borders) : 0;
  const parentWidth = positive(Number.parseFloat(css?.width ?? "")) ? layoutSize(parent,"width")-padding-borders-scrollbar : (parent.clientWidth ?? parent.getBoundingClientRect().width)-padding;
  if (![width, height, parentWidth].every(positive)) return null;
  const localLinear = multiplyAffine(parentInverse,nodeMap), expected = rotationAffine(box?.rotationDeg ?? 0);
  if ((["a","b","c","d"] as const).some(key=>Math.abs(localLinear[key]-expected[key]) > 1e-4)) return null;
  const center = transformPoint(parentInverse, transformPoint(nodeMap, {x:width/2,y:height/2}));
  const origin = {x:center.x-width/2,y:center.y-height/2};
  const contentLeft = (parent.clientLeft ?? 0) + number(css?.paddingLeft);
  const parentToCanvas = multiplyAffine(canvasInverse,parentMap);
  const nodeToCanvas = multiplyAffine(canvasInverse,nodeMap);
  const canvasCorners = [{x:0,y:0},{x:width,y:0},{x:0,y:height},{x:width,y:height}].map(p => transformPoint(nodeToCanvas,p));
  const heightFactor = box ? height / (box.heightPx * parentWidth / box.referenceParentPx) : 1;
  if (!positive(heightFactor) || ![origin.x,origin.y,...canvasCorners.flatMap(p=>[p.x,p.y])].every(Number.isFinite)) return null;
  const nodeCss = window.getComputedStyle?.(node);
  const margins = [number(nodeCss?.marginTop), number(nodeCss?.marginRight), number(nodeCss?.marginBottom), number(nodeCss?.marginLeft)];
  const xPercent = (origin.x-contentLeft)/parentWidth*100;
  const flow = { xPercent: Math.max(0, xPercent), marginTopPx: margins[0], marginRightPx: margins[1], marginBottomPx: margins[2], marginLeftPx: margins[3] };
  const unsupportedSlotStyle = number(nodeCss?.order) !== 0
    || (!!nodeCss?.alignSelf && nodeCss.alignSelf !== "auto")
    || (!!nodeCss?.cssFloat && nodeCss.cssFloat !== "none")
    || (!!nodeCss?.verticalAlign && nodeCss.verticalAlign !== "baseline")
    || (!!nodeCss?.writingMode && nodeCss.writingMode !== "horizontal-tb")
    || (nodeCss?.position === "relative" && [nodeCss.top,nodeCss.right,nodeCss.bottom,nodeCss.left].some(value => value && value !== "auto" && number(value) !== 0));
  const materializationError = !box && (unsupportedSlotStyle || width < 16 || width > 2400 || height < 16 || height > 2000 || parentWidth < 16 || parentWidth > 4000 || width/parentWidth < .05 || xPercent < -.001 || xPercent+width/parentWidth*100 > 100.001 || margins.some(value => value < 0 || value > 1000) || css?.display?.includes("grid") || ["absolute", "fixed", "sticky"].includes(nodeCss?.position ?? "")) ? "This natural layout cannot be boxed without changing its layout. Reset or simplify its layout first; nothing was changed." : undefined;
  return {width,height,parentWidth,origin,flow: box?.flow ?? flow,materializationError,parentToScreen:parentMap,screenToParent:parentInverse,parentToCanvas,nodeToCanvas,heightFactor,
    xPercent:(origin.x-contentLeft)/parentWidth*100,
    left:Math.min(...canvasCorners.map(p=>p.x)),top:Math.min(...canvasCorners.map(p=>p.y)),canvasWidth:canvas.clientWidth ?? canvas.offsetWidth ?? canvas.getBoundingClientRect().width,
    signature:JSON.stringify([parentWidth,heightFactor,parentMap,canvasMap,origin])};
}


/** The resting outline uses the actual rendered frame, not the unrotated flow
 * slot or a reconstruction from saved dimensions. This remains exact after text
 * growth, responsive layout and Done, including fractional CSS pixel sizes. */
export function measuredCanvasFrame(bounds: CanvasBoxBounds) {
  return { width: bounds.width, height: bounds.height, matrix: bounds.nodeToCanvas };
}
