import { inverseAffine, transformPoint, type Affine, type Point } from './box-geometry';

/** Bridge supplies only visible, same-scope legal containers from the current graph.
 * Ancestry is authoritative graph ancestry, nearest parent first, excluding virtual root. */
export type CanvasDragDestinationCandidate = {
  id: string; parentId: string | null; label: string; matrix: Affine;
  width: number; height: number; depth: number; ancestorIds: readonly string[];
};
export type CanvasDragDestination =
  | { kind: 'target'; id: string; label: string }
  | { kind: 'root' }
  | { kind: 'blocked'; reason: string };
const blocked = (reason: string): CanvasDragDestination => ({ kind: 'blocked', reason });
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** No DOM, mutation, z-index guessing or AABB containment. Caller must also fence
 * canvas bounds, source/device revision and fresh legal membership at release. */
export function resolveCanvasDragDestination(point: Point, candidates: readonly CanvasDragDestinationCandidate[]): CanvasDragDestination {
  if (!finitePoint(point)) return blocked('The pointer position could not be verified.');
  const byId = new Map<string, CanvasDragDestinationCandidate>();
  const contained: CanvasDragDestinationCandidate[] = [];
  for (const candidate of candidates) {
    const { id, parentId, label, matrix, width, height, depth, ancestorIds } = candidate;
    if (typeof id !== 'string' || !id || id === '__root' || byId.has(id) || typeof label !== 'string' || !label.trim()
      || !Array.isArray(ancestorIds) || ancestorIds.some(ancestor => typeof ancestor !== 'string' || !ancestor || ancestor === '__root' || ancestor === id)
      || new Set(ancestorIds).size !== ancestorIds.length || !Number.isSafeInteger(depth) || depth !== ancestorIds.length
      || parentId !== (ancestorIds[0] ?? null)) return blocked('The destination boxes changed. Refresh before moving this piece.');
    byId.set(id, candidate);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0
      || !matrix || ![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite)) return blocked('A destination box cannot be measured safely.');
    const inverse = inverseAffine(matrix);
    if (!inverse || !Object.values(inverse).every(Number.isFinite)
      || ![{x:0,y:0},{x:width,y:0},{x:0,y:height},{x:width,y:height}].every(corner => finitePoint(transformPoint(matrix,corner)))) return blocked('A destination box cannot be measured safely.');
    const local = transformPoint(inverse, point);
    if (!finitePoint(local)) return blocked('The pointer position could not be measured safely.');
    // Closed bounds deliberately make a shared edge ambiguous instead of relying on array order.
    if (local.x >= 0 && local.x <= width && local.y >= 0 && local.y <= height) contained.push(candidate);
  }
  // Validate shared ancestry even when intermediate nodes were filtered out.
  const parents = new Map<string, string | null>();
  for (const candidate of candidates) {
    const path = [candidate.id, ...candidate.ancestorIds];
    for (let index=0; index<path.length; index++) {
      const parent = path[index+1] ?? null;
      if (parents.has(path[index]) && parents.get(path[index]) !== parent) return blocked('The destination boxes changed. Refresh before moving this piece.');
      parents.set(path[index], parent);
    }
  }
  if (!contained.length) return { kind: 'root' };
  for (let i=0;i<contained.length;i++) for (let j=i+1;j<contained.length;j++) {
    if (!contained[i].ancestorIds.includes(contained[j].id) && !contained[j].ancestorIds.includes(contained[i].id)) return blocked('These destination boxes overlap. Move over one clear box before releasing.');
  }
  const innermost = contained.reduce((deepest, candidate) => candidate.depth > deepest.depth ? candidate : deepest);
  return { kind: 'target', id: innermost.id, label: innermost.label };
}
