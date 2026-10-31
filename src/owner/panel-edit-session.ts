/** Ephemeral UI positions only. Never persisted in drafts, accounts, or browser storage. */
export type PanelPoint = { x: number; y: number };
type Session = { token: object; positions: Map<string, PanelPoint> };
let active: Session | null = null;
const listeners = new Set<() => void>();
export function beginPanelEditSession(): object {
  const token = {}; active = { token, positions: new Map() };
  listeners.forEach(listener => listener()); return token;
}
export function endPanelEditSession(token: object): void {
  if (active?.token !== token) return;
  active = null; listeners.forEach(listener => listener());
}
export function panelEditSessionToken(): object | null { return active?.token ?? null; }
export function subscribePanelEditSession(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function readPanelPosition(token: object | null, key: string): PanelPoint | undefined {
  const point = token && active?.token === token ? active.positions.get(key) : undefined;
  return point ? { ...point } : undefined;
}
export function savePanelPosition(token: object | null, key: string, point: PanelPoint): void {
  if (token && active?.token === token && Number.isFinite(point.x) && Number.isFinite(point.y)) active.positions.set(key, { ...point });
}
