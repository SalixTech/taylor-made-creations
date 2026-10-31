import { inverseAffine, transformPoint, type Affine, type Point } from './box-geometry';
import { elementToScreen } from './box-affine';
import { validCanvasPlacement, type CanvasPlacement } from './canvas-layout';
/** Screen endpoints become a parent-local rectangle in any drag direction. */
export function canvasSpacePlacementFromDrag(start: Point, end: Point, parentToScreen: Affine): CanvasPlacement | null {
  if (![start.x,start.y,end.x,end.y,...Object.values(parentToScreen)].every(Number.isFinite)) return null;
  const inverse = inverseAffine(parentToScreen);
  if (!inverse) return null;
  const a = transformPoint(inverse,start), b = transformPoint(inverse,end);
  const result: CanvasPlacement = { matrix:{a:1,b:0,c:0,d:1,e:Math.min(a.x,b.x),f:Math.min(a.y,b.y)},widthPx:Math.abs(b.x-a.x),heightPx:Math.abs(b.y-a.y),aspectLocked:false };
  return validCanvasPlacement(result) ? result : null;
}
/** Caller compares captured and commit-time maps/revision; detached endpoints reject. */
export function captureCanvasSpaceParent(parent: HTMLElement): Affine | null {
  if (parent.isConnected === false) return null;
  const map = elementToScreen(parent);
  return map && inverseAffine(map) ? {...map} : null;
}
