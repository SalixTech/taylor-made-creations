/** Safe editor operations: stable identities and bounded values, never arbitrary CSS. */
export function normalizeHexColor(value: string): string | null {
  const input = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(input)) return `#${[...input].map(char => char + char).join("").toLowerCase()}`;
  return /^[0-9a-f]{6}$/i.test(input) ? `#${input.toLowerCase()}` : null;
}
export function boundedNumber(value: string, min: number, max: number): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}
export function reorderById<T extends { id: string }>(items: T[], sourceId: string, targetId: string, after = false): boolean {
  if (sourceId === targetId) return false;
  const from = items.findIndex(item => item.id === sourceId);
  const target = items.findIndex(item => item.id === targetId);
  if (from < 0 || target < 0) return false;
  const insertion = target + (after ? 1 : 0) - (from < target ? 1 : 0);
  if (insertion === from) return false;
  const [item] = items.splice(from, 1);
  items.splice(insertion, 0, item);
  return true;
}
export function resizePercent(start: number, deltaPixels: number, basisPixels: number, min: number, max: number): number {
  if (!Number.isFinite(basisPixels) || basisPixels <= 0 || !Number.isFinite(deltaPixels)) return start;
  return Math.min(max, Math.max(min, Math.round(start + deltaPixels / basisPixels * 100)));
}
